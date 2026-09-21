import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { requireAgencyPermission, can } from '@/lib/agency/permissions/authorization';
import { asAuthorizedUser } from '@/lib/agency/types/permissions';
import { getAgencyDashboard } from '@/lib/agency/analytics/dashboard';
import { getPortfolioProfitability } from '@/lib/agency/profitability';
import { getAlertsSummary, evaluateTenantAlerts } from '@/lib/agency/alerts/evaluator';
import type { AgencyAlertRecord } from '@/lib/agency/alerts/types';
import { countActiveClients } from '@/lib/agency/queries/client-counts';
import { getProjectPortfolioMetrics, type ProjectPortfolioMetrics } from '@/lib/agency/queries/project-metrics';
import { getRateReadinessMetrics } from '@/lib/agency/queries/rate-readiness';
import type { AgencyDashboardSources } from '@/lib/agency/analytics/dashboard';
import { trackAgencyOperation, durationBucket, DASHBOARD_PERFORMANCE_TARGET_MS } from '@/lib/agency/analytics/observability';
import { isBusinessDate, resolveReportingPeriod, todayInTimezone, type ReportingPeriod } from '@/lib/agency/types/dates';
import { getDeliveryHoursMetrics, getTimeMoneyMetrics } from '@/lib/agency/queries/time-summary';
import { getExpenseMoneyMetrics } from '@/lib/agency/queries/expense-summary';
import {
  getReceivablesMetrics, getInvoiceMoneyMetrics, getUnbilledMilestonesMetrics,
} from '@/lib/agency/queries/receivables-summary';
import type { AgencyDashboardData } from '@/lib/agency/types/agency.dashboard';
import { agencyTimezone } from '@/lib/agency/domain/agency.settings';

export const dynamic = 'force-dynamic';

const VALID_PERIODS: readonly ReportingPeriod[] = [
  'THIS_MONTH', 'LAST_MONTH', 'THIS_QUARTER', 'THIS_YEAR', 'CUSTOM',
];

/**
 * GET /api/agency/dashboard?period=THIS_MONTH[&from=YYYY-MM-DD&to=YYYY-MM-DD]
 *
 * The Agency Command Center aggregate (Module 1.17 contract):
 *
 *   { "period": { "from", "to", "timezone" },
 *     "financial":   { contractedRevenue, invoicedRevenue, collectedRevenue, unbilledRevenue },
 *     "delivery":    { totalHours, billableHours, nonBillableHours },
 *     "profitability": { deliveryCost, grossProfit, grossMargin },
 *     "receivables": { outstanding, overdue, overdueCount },
 *     "projects": [],
 *     "alerts": [] }
 *
 * Pipeline (PRD §68): authenticate → resolve tenant → validate capability
 * (agency.dashboard.read) → validate period params → execute domain
 * operation (tracked) → respond.
 *
 * Contract rules:
 *   - period resolves ONE window server-side in the TENANT's configured
 *     timezone (Module 1.3/1.16) — the client can never apply inconsistent
 *     filters. `from`/`to` are accepted for CUSTOM only; named periods
 *     ignore them.
 *   - The response is the stable VIEW contract (types/agency.dashboard.ts)
 *     — view models only. NO raw MongoDB documents are ever exposed here:
 *     entities never leave the domain layer; the dashboard payload is
 *     assembled server-side by the query service.
 */
export async function GET(req: NextRequest) {
  // Module 1.25 — phase timings: auth / query / total. The target
  // (< 1s for a small-to-medium tenant) is measured per request, never
  // assumed; Server-Timing exposes the phases to any browser/profiling tool.
  const requestStart = Date.now();
  const authStart = Date.now();
  const gate = await requireAgencyPermission('agency.dashboard.read');
  const authMs = Date.now() - authStart;
  if (!gate.ok) {
    // Module 1.18 — 401 unauthenticated / 403 wrong permission; a non-agency
    // tenant gets the application response (code + redirectTo), not an auth
    // failure.
    const { status, error, code, redirectTo } = gate;
    const reject = NextResponse.json(
      code ? { error, code, redirectTo } : { error },
      { status }
    );
    // Module 1.25 — the auth phase is measurable on every response, rejections
    // included (the gate cost is real work even when it declines).
    reject.headers.set('Server-Timing', `auth;dur=${authMs}`);
    return reject;
  }

  const { session, tenant } = gate.context;
  const tenantId = tenant.id || tenant._id?.toString();
  // Modules 11–14 (§114) — may this session see COST? Labor cost is salary
  // economics (§63, the same privacy class as agency.rates.cost.read), so a
  // USER (PM included) gets every cost line honestly pending: the engine
  // source below is skipped and the time/expense money cost components are
  // withheld (null) while the unbilled/shared-context lines stay live.
  const maySeeCost = can(asAuthorizedUser(session), 'agency.profitability.read');

  // Validate the period selector (whitelist; defaults to THIS_MONTH).
  const { searchParams } = new URL(req.url);
  const rawPeriod = searchParams.get('period') || 'THIS_MONTH';
  const period = VALID_PERIODS.includes(rawPeriod as ReportingPeriod)
    ? (rawPeriod as ReportingPeriod)
    : 'THIS_MONTH';

  // CUSTOM requires well-formed business dates; anything else falls back to
  // the default rather than 500-ing the dashboard.
  let custom: { from: string; to: string } | undefined;
  if (period === 'CUSTOM') {
    const from = searchParams.get('from') || '';
    const to = searchParams.get('to') || '';
    if (isBusinessDate(from) && isBusinessDate(to) && from <= to) {
      custom = { from, to };
    } else {
      return NextResponse.json(
        { error: 'Custom period requires valid from/to dates (YYYY-MM-DD)' },
        { status: 400 }
      );
    }
  }

  // Tenant-configured timezone (Module 17 §44 — general settings). The
  // effective settings resolve stored ⊕ defaults, so an unconfigured tenant
  // gets the deterministic Asia/Kolkata default.
  const timezone = agencyTimezone(tenant);

  try {
    const queryStart = Date.now();
    // Module 2 (Step 2.7) — the snapshot's Active Clients line is live:
    // resolve the tenant-scoped count here (indexed countDocuments) and hand
    // it to the pure composer. A query failure must not break the dashboard:
    // the line falls back to its pending state, never a fabricated number.
    let activeClients: number | undefined;
    try {
      activeClients = await countActiveClients(tenantId || session.tenantId || '');
    } catch {
      activeClients = undefined;
    }
    // Module 3 (Step 3.8, §92) — planned-economics project numbers in one
    // tenant-scoped pass (active count, contracted value, planned margin,
    // portfolio rows). Same failure rule: pending states, never fake numbers.
    let projectMetrics: ProjectPortfolioMetrics | undefined;
    try {
      projectMetrics = await getProjectPortfolioMetrics(tenantId || session.tenantId || '');
    } catch {
      projectMetrics = undefined;
    }
    // Module 6 (§123–§124) — rate readiness signals for the snapshot: ready /
    // missing-rate project counts and users without a cost rate. Same failure
    // rule: pending states, never fake numbers. Counts only (§99) — the query
    // resolves cost rates internally but returns no amounts.
    let rateReadiness: AgencyDashboardSources['rateReadiness'] | undefined;
    try {
      rateReadiness = await getRateReadinessMetrics(tenantId || session.tenantId || '');
    } catch {
      rateReadiness = undefined;
    }
    // Module 7 (§117) — time metrics go live: §8 tracked hours inside the
    // SAME window the payload reports (consistency rule — one window per
    // request), plus §4/§7 all-time money totals over approved entries.
    // Same failure rule as every source: pending states, never fake numbers.
    // Mixed-currency money totals resolve to null — the metrics then stay
    // pending rather than showing a converted or zero total.
    const window = resolveReportingPeriod(period, todayInTimezone(timezone), custom);
    let work: AgencyDashboardSources['work'] | undefined;
    try {
      const hours = await getDeliveryHoursMetrics(tenantId || session.tenantId || '', window.from, window.to);
      work = {
        hoursLogged: hours.totalMinutes / 60,
        billableHours: hours.billableMinutes / 60,
      };
    } catch {
      work = undefined;
    }
    let timeMoney: AgencyDashboardSources['timeMoney'] | undefined;
    try {
      const money = await getTimeMoneyMetrics(tenantId || session.tenantId || '');
      // Raw query result, nulls included — the composer decides combination
      // and readiness (a mixed-currency null never becomes a fake number).
      // §114: the cost side is withheld for sessions without
      // agency.profitability.read (costWithheld signals the composer).
      timeMoney = {
        deliveryCost: maySeeCost ? money.deliveryCost : null,
        unbilledTime: money.unbilledTime,
        costCurrency: maySeeCost ? money.costCurrency : null,
        unbilledCurrency: money.unbilledCurrency,
      };
    } catch {
      timeMoney = undefined;
    }
    // Module 8 (§119) — the expense side of §4/§7: Σ amount over APPROVED
    // (delivery cost) and Σ clientChargeAmount over the §48 invoice-eligible
    // set (unbilled). Same failure rule as every source: pending states,
    // never fake numbers. The composer refuses to combine money denominated
    // in different currencies.
    let expenseMoney: AgencyDashboardSources['expenseMoney'] | undefined;
    try {
      const money = await getExpenseMoneyMetrics(tenantId || session.tenantId || '');
      expenseMoney = {
        deliveryCost: maySeeCost ? money.deliveryCost.total : null,
        unbilledExpenses: money.unbilledExpenses.total,
        costCurrency: maySeeCost ? money.deliveryCost.currency : null,
        unbilledCurrency: money.unbilledExpenses.currency,
      };
    } catch {
      expenseMoney = undefined;
    }
    // Module 10 (§105/§106/§117/§119) — the invoice/payment money sources:
    // the receivables position as of the tenant-timezone today, invoiced +
    // collected revenue, and the unbilled milestone value. Same failure rule
    // as every source: pending states, never fake numbers. A mixed-currency
    // store resolves to nulls — the route passes undefined so the affected
    // metrics stay pending rather than showing a converted or zero total.
    const today = todayInTimezone(timezone);
    let receivables: AgencyDashboardSources['receivables'] | undefined;
    try {
      const r = await getReceivablesMetrics(tenantId || session.tenantId || '', today);
      receivables = r.mixedCurrencies ? undefined : {
        outstanding: r.outstanding ?? 0,
        dueSoon: r.dueSoon ?? 0,
        overdueAmount: r.overdueAmount ?? 0,
        overdueCount: r.overdueCount,
        byAgingBucket: r.byAgingBucket as Record<'CURRENT' | '1-30' | '31-60' | '61-90' | '90+', number>,
      };
    } catch {
      receivables = undefined;
    }
    let invoiceMoney: AgencyDashboardSources['invoiceMoney'] | undefined;
    try {
      const m = await getInvoiceMoneyMetrics(tenantId || session.tenantId || '');
      invoiceMoney = {
        ...(m.invoicedRevenue !== null && { invoicedRevenue: m.invoicedRevenue }),
        ...(m.collectedRevenue !== null && { collectedRevenue: m.collectedRevenue }),
      };
    } catch {
      invoiceMoney = undefined;
    }
    let milestoneMoney: AgencyDashboardSources['milestoneMoney'] | undefined;
    try {
      const m = await getUnbilledMilestonesMetrics(tenantId || session.tenantId || '');
      milestoneMoney = {
        unbilledMilestones: m.unbilledMilestones,
        unbilledCurrency: m.unbilledCurrency,
      };
    } catch {
      milestoneMoney = undefined;
    }
    // Module 13 (§118/§114) — the ACTUAL profitability money from the ONE
    // engine (the same service the /api/agency/profitability reports use, §70 —
    // Command Center and reports can never disagree). Only the summary
    // totals are needed here. §114: the source resolves ONLY for users who
    // hold agency.profitability.read (admin/finance) — labor cost is salary
    // economics (§63), so a USER (PM included) gets the honest pending state,
    // never the cost ledger. Same failure rule as every source: pending
    // states, never fake numbers. A §127 mixed-currency portfolio resolves
    // to null totals — profit/margin then stay pending, never converted.
    let profitability: AgencyDashboardSources['profitability'] | undefined;
    if (maySeeCost) {
      try {
        const pf = await getPortfolioProfitability(tenantId || session.tenantId || '');
        profitability = {
          applicableRevenue: pf.summary.applicableRevenue?.amount ?? null,
          deliveryCost: pf.summary.deliveryCost?.amount ?? null,
        };
      } catch {
        profitability = undefined;
      }
    }
    // Module 15 (§21) — alerts: evaluate fresh snapshot on dashboard load
    // so any invoiced work or resolved conditions are automatically reconciled
    // and auto-resolved (dedupe planner auto-resolves missing conditions).
    let alerts: readonly AgencyAlertRecord[] | undefined;
    const targetTenantId = tenantId || session.tenantId || '';
    if (targetTenantId) {
      try {
        await evaluateTenantAlerts(targetTenantId);
      } catch {
        // Fail open: if live evaluation fails, fall back to reading stored alerts
      }
    }
    try {
      alerts = (await getAlertsSummary(targetTenantId, { maySeeCost, topLimit: 5 })).top;
    } catch {
      alerts = undefined;
    }
    const sources: AgencyDashboardSources = {
      activeClients,
      ...(projectMetrics && {
        activeProjects: projectMetrics.activeProjects,
        contractedRevenue: projectMetrics.contractedRevenue,
        plannedMargin: projectMetrics.plannedMargin,
        portfolioRows: projectMetrics.rows,
      }),
      rateReadiness,
      work,
      timeMoney,
      expenseMoney,
      receivables,
      invoiceMoney,
      milestoneMoney,
      profitability,
      ...(alerts !== undefined && { alerts }),
      // §114 — cost components were withheld above for this session.
      ...( !maySeeCost && { costWithheld: true as const } ),
    };
    const data = await trackAgencyOperation(
      'getAgencyDashboard',
      tenantId || session.tenantId || 'unknown',
      { query: 'dashboard', section: 'all', period },
      () => Promise.resolve(getAgencyDashboard(period, timezone, undefined, custom, sources))
    );
    const queryMs = Date.now() - queryStart;
    const totalMs = Date.now() - requestStart;

    // Module 1.25 — target check (< 1s): measured per request, logged when
    // breached so the target is verifiable in production telemetry.
    const targetMet = totalMs < DASHBOARD_PERFORMANCE_TARGET_MS;
    if (!targetMet) {
      console.warn(JSON.stringify({
        level: 'warn',
        message: 'agency:dashboard_performance_target_breached',
        tenantId: tenantId || session.tenantId || 'unknown',
        authMs, queryMs, totalMs,
        targetMs: DASHBOARD_PERFORMANCE_TARGET_MS,
        durationBucket: durationBucket(totalMs),
        timestamp: new Date().toISOString(),
      }));
    }

    // Module 1.17 response shape: period scope + grouped view sections.
    // View contract only — assembled server-side, never raw documents.
    const response = NextResponse.json({ success: true, data: toDashboardResponse(data) });
    response.headers.set(
      'Server-Timing',
      `auth;dur=${authMs}, query;dur=${queryMs}, total;dur=${totalMs}`
    );
    return response;
  } catch (error) {
    // trackAgencyOperation already logged telemetry; surface a clean error.
    return NextResponse.json({ error: 'Failed to load agency dashboard' }, { status: 500 });
  }
}

/**
 * Map the internal domain payload to the Module 1.17 API view: period scope,
 * the spec's metric groups (financial / delivery / profitability /
 * receivables), plus the later Module 1.9–1.15 sections (activity snapshot,
 * unbilled breakdown, trends, deltas). Pure projection — no computation, no
 * entity fields pass through, never raw documents.
 */
function toDashboardResponse(d: AgencyDashboardData) {
  const m = d.metrics;
  return {
    period: d.periodScope, // { from, to, timezone } (Module 1.16)
    dateRange: d.dateRange,
    financial: {
      contractedRevenue: m.contractedRevenue,
      invoicedRevenue: m.billedRevenue,
      collectedRevenue: m.collectedRevenue,
      cashCollectionRate: m.cashCollectionRate,
      unbilledRevenue: m.unbilledRevenue,
      unbilled: d.unbilled,
      deltas: d.deltas,
    },
    delivery: {
      totalHours: m.totalHours,
      billableHours: m.billableHours,
      nonBillableHours: m.nonBillableHours,
      billablePercent: m.billablePercent,
    },
    profitability: {
      deliveryCost: m.deliveryCost,
      grossProfit: m.projectProfit,
      grossMargin: m.averageMargin,
    },
    activity: {
      activeProjects: m.activeProjects,
      atRiskProjects: m.atRiskProjects,
      snapshot: d.snapshot,
    },
    receivables: {
      outstanding: m.outstandingReceivables,
      dueSoon: m.dueSoonReceivables,
      overdue: m.overdueReceivables,
      overdueCount: m.overdueInvoiceCount,
    },
    projects: d.projects,
    alerts: d.alerts,
    trends: d.trends,
  };
}
