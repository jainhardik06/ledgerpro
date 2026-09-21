/**
 * Agency Vertical — Analytics: dashboard query service (Step 0.12)
 *
 * THE Agency Dashboard Query Service. Architecture (per Step 0.12):
 *
 *   Dashboard Page → Agency Dashboard Query Service (here) →
 *   Domain Aggregations (getAgency*Summary) → Database (queries/)
 *
 * The UI becomes a consumer of the stable domain contract
 * (types/agency.dashboard.ts) — it never fetches entity lists and never
 * computes metrics in React.
 *
 * Module 1 status: source entities (projects, time entries, invoices,
 * payments) do not exist yet. This service therefore returns the zero-value
 * contract from docs/agency/phase-1/01-financial-definitions.md §13 —
 * structurally complete, honestly empty. As each entity's sprint lands, its
 * query plugs in here WITHOUT changing this contract or the UI.
 */
import {
  count, hours, money, percentage, signedMoney, zeroCount, zeroHours, zeroMoney, zeroPercentage,
} from '../types/metrics';
import type { AgencyDashboardMetrics } from '../types/agency.dashboard-metrics';
import type {
  AgencyAlert, AgencyDashboardData, AgencyFinancialSummary,
  AgencyReceivablesSummary, AgencySnapshotSummary, AgencyTrends,
  AgencyUnbilledSummary, AgencyWorkSummary, ProjectHealthRow,
} from '../types/agency.dashboard';
import type { AgencyAlertRecord, AlertRuleType } from '../alerts/types';
import { resolveReportingPeriod, todayInTimezone, DEFAULT_TENANT_TIMEZONE, type BusinessDate, type ReportingPeriod } from '../types/dates';
import { computeProjectHealth } from '../domain/project-health';
import {
  getFinancialSummary, getProjectHealth, getReceivablesSummary,
} from './metrics';

/**
 * Compute the typed KPI contract from the raw numeric summaries.
 * Single place where metric objects are built (Step 0.9 ownership rule).
 *
 * sourceReady is false until the underlying entity exists — Module 1 returns
 * all-false so the UI can show "not yet wired" states where needed.
 */
export function buildDashboardMetrics(
  financial: AgencyFinancialSummary,
  receivables: AgencyReceivablesSummary,
  work: AgencyWorkSummary,
  atRisk: number,
  metricsReady: {
    projects: boolean; time: boolean; invoices: boolean; payments: boolean;
    /**
     * Module 13 (§118 landed): profit/margin need MORE than time data — they
     * need ACTUAL per-billing-model revenue, which the Module 13 profitability
     * engine now owns. The flag is true only when the route resolved the
     * engine's portfolio money (single currency — a §127 mixed-currency
     * portfolio stays pending). Defaults to the time flag for un-upgraded
     * callers; never fabricate a profit number from planned revenue minus
     * actual cost.
     */
    timeProfit?: boolean;
    /**
     * Module 8 (§119): §4 delivery cost and §7 unbilled revenue now span
     * TWO stores (time + expenses) — both sides must be resolved (and
     * currency-compatible) before those metrics go live. Defaults to false:
     * a caller that has not been upgraded never shows a time-only cost as
     * the complete delivery cost.
     */
    expenses?: boolean;
    /**
     * Modules 11–14 (§114): false when the session may NOT see cost (the
     * route withheld the cost components — labor cost is salary economics).
     * The deliveryCost line then stays pending even though the money stores
     * resolved; unbilled/hours/shared-context lines are unaffected.
     * Defaults to true.
     */
    costVisible?: boolean;
  }
): AgencyDashboardMetrics {
  const timeProfit = metricsReady.timeProfit ?? metricsReady.time;
  // Module 8 (§119) — the money side needs BOTH stores; the time flag keeps
  // owning the hours side alone.
  const moneyReady = metricsReady.projects && metricsReady.time && (metricsReady.expenses === true);
  // Modules 11–14 (§114) — the cost line additionally needs permission:
  // withheld cost (labor cost = salary economics) stays pending even when
  // the money stores resolved.
  const costReady = moneyReady && (metricsReady.costVisible !== false);
  return {
    contractedRevenue: money(financial.contractedRevenue, metricsReady.projects),
    billedRevenue: money(financial.billedRevenue, metricsReady.invoices),
    collectedRevenue: money(financial.collectedRevenue, metricsReady.payments),
    // §117 after-Payments — the rate needs BOTH sides live (and same-query,
    // so same-currency); null value just means nothing invoiced yet.
    cashCollectionRate: percentage(financial.cashCollectionRate, metricsReady.invoices && metricsReady.payments),
    unbilledRevenue: money(financial.unbilledRevenue, moneyReady),

    activeProjects: count(work.activeProjects, metricsReady.projects),
    totalHours: hours(work.hoursLogged, metricsReady.time),
    billableHours: hours(work.billableHours, metricsReady.time),
    nonBillableHours: hours(work.nonBillableHours, metricsReady.time),
    billablePercent: percentage(work.billablePercent, metricsReady.time),

    // §114 — the cost line is permission-gated independently of the money
    // combination (a withheld cost never renders, not even as a fake 0).
    deliveryCost: money(financial.deliveryCost, costReady),
    // §5 — profit may be NEGATIVE (a loss is a real number); signedMoney
    // never clamps it to a fake 0 (Module 13 §84).
    projectProfit: signedMoney(financial.projectProfit, metricsReady.projects && timeProfit),
    averageMargin: percentage(financial.averageMargin, metricsReady.projects && timeProfit),

    outstandingReceivables: money(receivables.outstanding, metricsReady.invoices),
    dueSoonReceivables: money(receivables.dueSoon, metricsReady.invoices),
    overdueReceivables: money(receivables.overdueAmount, metricsReady.invoices),
    overdueInvoiceCount: count(receivables.overdueCount, metricsReady.invoices),

    atRiskProjects: count(atRisk, metricsReady.projects),
  };
}

/** The Module 1 zero-value work summary (definitions §13). */
const EMPTY_WORK: AgencyWorkSummary = {
  activeProjects: 0, hoursLogged: 0, billableHours: 0, nonBillableHours: 0, billablePercent: null,
};

/**
 * Unbilled-work breakdown (Module 1.11). Zero-value contract; when the
 * source entities land, each split plugs in here. `totalUnbilled` is ALWAYS
 * the sum of the three lines (derived at build time — never independent).
 *
 * Module 7 (§117): unbilledTime is LIVE — the route resolves §7 (Σ
 * calculatedBillableAmount over APPROVED + billable + UNBILLED entries) via
 * queries/time-summary.ts and passes it in. Without an input the zero-value
 * contract holds. Module 8 (§119): unbilledExpenses is LIVE the same way —
 * Σ clientChargeAmount over the §48 invoice-eligible set (queries/
 * expense-summary.ts). Module 10 (§119): unbilledMilestones is LIVE — Σ
 * commercial value over COMPLETED + UNBILLED milestones (queries/
 * receivables-summary.ts). The LINES show their raw resolved values; the
 * combined §7 METRIC's readiness additionally requires currency agreement
 * across all three stores (see getAgencyDashboard).
 */
export function getAgencyUnbilledSummary(
  unbilledTime?: number,
  unbilledExpenses?: number,
  unbilledMilestones?: number
): AgencyUnbilledSummary {
  const unbilledTimeValue = unbilledTime ?? 0;          // Module 7 — time entries
  const unbilledExpensesValue = unbilledExpenses ?? 0;  // Module 8 — expenses (§119)
  const unbilledMilestonesValue = unbilledMilestones ?? 0; // Module 10 — milestones (§119)
  return {
    unbilledTime: unbilledTimeValue,
    unbilledExpenses: unbilledExpensesValue,
    unbilledMilestones: unbilledMilestonesValue,
    totalUnbilled: unbilledTimeValue + unbilledExpensesValue + unbilledMilestonesValue,
  };
}

/**
 * Build one portfolio-health row from resolved domain values (Module 1.8).
 * The status column is ALWAYS produced by the deterministic health engine —
 * callers supply numbers, never a status. When the Projects sprint lands,
 * this is the single path from project entity → dashboard row.
 *
 * Scale contract (Module 13 final validation): `margin` and `budgetBurn`
 * arrive in PERCENT (0–100) — the scale the table renders (formatPercentage,
 * §83) and the scale every later module reports (Module 13's projectMargin /
 * budgetBurnPercent). The Module 1 health engine takes 0–1 ratios, so the
 * conversion happens HERE, at the single boundary — never at each caller.
 */
export function buildProjectHealthRow(input: {
  projectId: string;
  name: string;
  clientName: string;
  contractValue: number;  // applicableRevenue(P), §1
  cost: number;           // projectCost(P), §4
  billed: number;         // invoiced for P, §2
  collected: number;      // collected for P, §3
  margin: number | null;  // §6 in PERCENT (0–100) — null when Revenue = 0
  budgetBurn: number | null; // §8 in PERCENT (0–100) — null when PlannedHours = 0
  completed: boolean;
}): ProjectHealthRow {
  return {
    projectId: input.projectId,
    name: input.name,
    clientName: input.clientName,
    contractValue: input.contractValue,
    cost: input.cost,
    billed: input.billed,
    collected: input.collected,
    margin: input.margin,
    budgetBurn: input.budgetBurn,
    status: computeProjectHealth({
      budgetBurn: input.budgetBurn === null ? null : input.budgetBurn / 100,
      margin: input.margin === null ? null : input.margin / 100,
      completed: input.completed,
    }),
  };
}

/**
 * Source-entity readiness flags. Flip to true in each entity's sprint —
 * the single switch that turns the corresponding KPI cards "live".
 *
 * Module 3 (Step 3.8): projects are LIVE — the project store exists and
 * the route resolves planned-economics numbers (queries/project-metrics.ts).
 * Actual profit/margin are gated on the ONE engine's portfolio money
 * (Module 13 §118 — timeProfit below).
 */
const METRICS_READY = {
  projects: true,    // Sprint 1 — Clients & Projects (LIVE, Module 3)
  time: true,        // Sprint 3 — Time Tracking (LIVE, Module 7 §117)
  expenses: true,    // Sprint 4 — Expenses (LIVE, Module 8 §119)
  invoices: true,    // Sprint 6 — Invoicing (LIVE, Module 10 §105/§117)
  payments: true,    // Sprint 6/7 — Payments (LIVE, Module 10 §117)
};

/**
 * Financial summary (definitions §1–§7) over the tenant's scope.
 * Module 1.19: composed from the per-metric domain functions
 * (analytics/metrics.ts) — each metric has ONE owner; nothing is recomputed
 * here. Profit/margin are owned by the profitability engine via
 * getProjectProfit()/getProjectMargin().
 *
 * Module 3 (Step 3.8): contractedRevenue is LIVE — the caller (API route)
 * resolves the planned committed value over ACTIVE projects
 * (queries/project-metrics.ts) and passes it in. Without an input the
 * zero-value/pending fallback holds.
 *
 * Module 10 (§117): invoiced (§2) and collected (§3) revenue are LIVE —
 * the route resolves them via queries/receivables-summary.ts.
 */
export function getAgencyFinancialSummary(
  contractedRevenue?: number,
  timeMoney?: { unbilledRevenue?: number; deliveryCost?: number },
  invoiceMoney?: { invoicedRevenue?: number; collectedRevenue?: number },
  profitability?: { applicableRevenue?: number; deliveryCost?: number }
): AgencyFinancialSummary {
  return getFinancialSummary(contractedRevenue, timeMoney, invoiceMoney, profitability);
}

/**
 * Project health rows (definitions §11) over the tenant's scope, sorted
 * problems-first (Module 1.7 default sort: At Risk → Watch → Healthy).
 * Health status is computed by the deterministic engine (Module 1.8) —
 * never assigned ad hoc by callers.
 *
 * Module 3 (Step 3.8): the caller resolves real portfolio rows
 * (queries/project-metrics.ts) and passes them in. Without an input the
 * Module 1 empty table holds — callers never show fabricated rows.
 */
export function getAgencyProjectHealth(rows?: ProjectHealthRow[]): ProjectHealthRow[] {
  return rows ?? getProjectHealth();
}

/**
 * Receivables summary (definitions §9) over the tenant's scope.
 * Module 1.19: thin composition of the per-metric owners.
 *
 * Module 10 (§105/§106): the caller resolves the tenant's position as of
 * the tenant-timezone today (queries/receivables-summary.ts) and passes it
 * in; without an input the zero-value contract holds (pending, never a
 * fake zero presented as real).
 */
export function getAgencyReceivablesSummary(receivables?: {
  outstanding?: number;
  overdueAmount?: number;
  overdueCount?: number;
  dueSoon?: number;
  byAgingBucket?: Record<'CURRENT' | '1-30' | '31-60' | '61-90' | '90+', number>;
}): AgencyReceivablesSummary {
  return getReceivablesSummary(receivables);
}

/**
 * Work/delivery summary (definitions §8) over the tenant's scope.
 * Module 3 (Step 3.8): activeProjects is LIVE — the caller resolves the
 * tenant-scoped count (queries/project-metrics.ts) and passes it in.
 *
 * Module 7 (§117): hours are LIVE — the route resolves the reporting
 * window's tracked minutes (queries/time-summary.ts, ALL entries count as
 * logged regardless of approval) and passes decimal hours in. Without the
 * input the Module 1 zero contract holds.
 */
export function getAgencyWorkSummary(
  activeProjects?: number,
  work?: { hoursLogged: number; billableHours: number }
): AgencyWorkSummary {
  const hoursLogged = work?.hoursLogged ?? 0;
  const billableHours = work?.billableHours ?? 0;
  return {
    ...EMPTY_WORK,
    activeProjects: activeProjects ?? 0,
    hoursLogged,
    billableHours,
    nonBillableHours: hoursLogged - billableHours,
    // §8: undefined by division when nothing is logged — never 0%.
    billablePercent: hoursLogged > 0 ? (billableHours / hoursLogged) * 100 : null,
  };
}

/**
 * Module 15 — the 11 rule types fold onto the Module 1 view union (§5 of
 * the dashboard contract): hours bands → PROJECT_HOURS, the cost-bearing
 * pair → PROJECT_BUDGET / PROJECT_MARGIN, the three unbilled rules →
 * UNBILLED_WORK, both overdue rules → INVOICE_OVERDUE.
 */
const RULE_TYPE_TO_VIEW: Readonly<Record<AlertRuleType, AgencyAlert['type']>> = {
  PROJECT_HOURS_75: 'PROJECT_HOURS',
  PROJECT_HOURS_80: 'PROJECT_HOURS',
  PROJECT_HOURS_100: 'PROJECT_HOURS',
  PROJECT_OVER_BUDGET: 'PROJECT_BUDGET',
  PROJECT_MARGIN_BELOW_TARGET: 'PROJECT_MARGIN',
  UNBILLED_APPROVED_TIME: 'UNBILLED_WORK',
  UNBILLED_EXPENSE: 'UNBILLED_WORK',
  INVOICE_DUE_SOON: 'INVOICE_DUE_SOON',
  INVOICE_OVERDUE: 'INVOICE_OVERDUE',
  LARGE_INVOICE_OVERDUE: 'INVOICE_OVERDUE',
  COMPLETED_PROJECT_UNBILLED_WORK: 'UNBILLED_WORK',
};

/**
 * Deterministic alerts (definitions §11). LIVE since Module 15: the route
 * supplies the STORED, cost-filtered, top-ranked records (read-only — §21:
 * the dashboard never evaluates; /api/agency/alerts/summary does); this is
 * the pure projection onto the Module 1 view contract. No source → no
 * alerts (the honest empty panel, never fabricated rows).
 */
export function getAgencyAlerts(stored?: readonly AgencyAlertRecord[]): AgencyAlert[] {
  if (!stored) return [];
  return stored.map(a => ({
    id: a.id,
    type: RULE_TYPE_TO_VIEW[a.ruleType],
    severity: a.severity,
    message: a.message,
    ...(a.entityLabel !== undefined && { entityLabel: a.entityLabel }),
    ...(a.projectId !== undefined && { projectId: a.projectId }),
    ...(a.invoiceId !== undefined && { invoiceId: a.invoiceId }),
  }));
}

/**
 * Agency Snapshot (Module 1.14) — compact operational summary, NOT analytics:
 * each value comes from its owning domain (activeProjects from work summary,
 * margin from the profitability engine, activeClients / teamMembers /
 * utilization from their owning sprints). No formulas here.
 *
 * Module 2 (Step 2.7): activeClients is LIVE — the caller (API route)
 * resolves the count via queries/client-counts.ts and passes it in. Without
 * an input the line stays in its pending state (value 0, not ready) so
 * callers that haven't been upgraded yet never show a fake zero as real.
 *
 * Module 3 (Step 3.8): plannedMargin is LIVE the same way — the PLANNED
 * portfolio margin (§92), distinct from the actual average margin line
 * which waits for delivery cost data. Null when no project carries both
 * baselines (no-baseline rule).
 */
export function getAgencySnapshot(
  activeClients?: number,
  activeProjects?: number,
  plannedMargin?: number | null,
  rateReadiness?: {
    projectsTotal: number;
    projectsReadyForTracking: number;
    projectsMissingRates: number;
    usersWithoutCostRate: number;
    usersTotal: number;
  }
): AgencySnapshotSummary {
  return {
    activeClients: activeClients ?? 0,
    activeClientsReady: activeClients !== undefined,
    activeProjects: activeProjects ?? 0,
    activeProjectsReady: activeProjects !== undefined,
    plannedMargin: plannedMargin ?? null,
    plannedMarginReady: plannedMargin !== undefined,
    // Module 6 (§123–§124) — readiness counts; pending (never fake zeros)
    // until the route resolves the query.
    projectsReadyForTracking: rateReadiness?.projectsReadyForTracking ?? 0,
    projectsMissingRates: rateReadiness?.projectsMissingRates ?? 0,
    projectsDeliverableTotal: rateReadiness?.projectsTotal ?? 0,
    rateReadinessReady: rateReadiness !== undefined,
    usersWithoutCostRate: rateReadiness?.usersWithoutCostRate ?? 0,
    usersTotal: rateReadiness?.usersTotal ?? 0,
    teamMembers: 0,     // team roster (existing core entity, agency-scoped count)
    billableUtilization: null, // time module + capacity baseline
  };
}

/**
 * Trend series (Module 1.13). Chronological month points over the tenant's
 * scope, resolved with the SAME definitions as the KPI cards — a trend line
 * and its KPI must never disagree. Empty until the source entities
 * (invoices/payments) produce data; the section then renders its
 * awaiting-source state instead of a fabricated flat line.
 * Module 1: empty series, sourceReady false.
 */
export function getAgencyTrends(): AgencyTrends {
  return { points: [], sourceReady: false };
}

/**
 * Source data the caller (API route) resolves for the dashboard. Kept
 * explicit and optional so this composer stays pure/testable — the route
 * owns tenant scoping and the queries. Module 2 (Step 2.7): activeClients
 * goes live; later sprints extend this object.
 */
export interface AgencyDashboardSources {
  /** Tenant-scoped ACTIVE client count (queries/client-counts.ts). */
  activeClients?: number;
  /**
   * Module 3 (Step 3.8) — planned-economics project numbers, resolved by the
   * route via queries/project-metrics.ts in one tenant-scoped pass.
   */
  activeProjects?: number;
  contractedRevenue?: number;
  /** Null when no ACTIVE project carries both baselines (§6 no-baseline rule). */
  plannedMargin?: number | null;
  /** Portfolio health rows (deterministic engine, problems-first sort). */
  portfolioRows?: ProjectHealthRow[];
  /**
   * Module 6 (§123–§124) — rate readiness counts, resolved by the route via
   * queries/rate-readiness.ts. Counts only — cost amounts never get near the
   * dashboard contract (§99).
   */
  rateReadiness?: {
    projectsTotal: number;
    projectsReadyForTracking: number;
    projectsMissingRates: number;
    usersWithoutCostRate: number;
    usersTotal: number;
  };
  /**
   * Module 7 (§117) — §8 tracked hours inside the reporting window (ALL
   * entries count as logged, decimal hours), resolved by the route via
   * queries/time-summary.ts.
   */
  work?: { hoursLogged: number; billableHours: number };
  /**
   * Module 7 (§117) — §4/§7 all-time money totals over approved entries,
   * resolved by the route via queries/time-summary.ts. Null totals mean
   * mixed currencies (the route then leaves this undefined so the money
   * metrics stay honestly pending — never a converted number).
   * Module 8 (§119): the totals are raw query results (nulls included) —
   * the composer below decides combination and readiness.
   */
  timeMoney?: {
    deliveryCost: number | null;
    unbilledTime: number | null;
    costCurrency?: string | null;
    unbilledCurrency?: string | null;
  };
  /**
   * Module 8 (§119) — the expense side of §4/§7, resolved by the route via
   * queries/expense-summary.ts. Same shape rules as timeMoney: null totals
   * mean mixed currencies; currencies let the composer refuse to add
   * time money and expense money denominated differently.
   */
  expenseMoney?: {
    deliveryCost: number | null;
    unbilledExpenses: number | null;
    costCurrency?: string | null;
    unbilledCurrency?: string | null;
  };
  /**
   * Module 10 (§105/§106) — the receivables position as of the tenant-
   * timezone today, resolved by the route via queries/receivables-summary.ts.
   * Undefined (or mixed-currency, which the route collapses to undefined)
   * leaves every receivables metric honestly pending.
   */
  receivables?: {
    outstanding: number;
    dueSoon: number;
    overdueAmount: number;
    overdueCount: number;
    byAgingBucket: Record<'CURRENT' | '1-30' | '31-60' | '61-90' | '90+', number>;
  };
  /**
   * Module 10 (§117) — §2 invoiced and §3 collected revenue, resolved by
   * the route via queries/receivables-summary.ts. Each side may be absent
   * independently (query failure / mixed currencies): a missing number
   * leaves ITS metric pending, never a fake zero.
   */
  invoiceMoney?: {
    invoicedRevenue?: number;
    collectedRevenue?: number;
  };
  /**
   * Module 10 (§119) — the milestone line of the unbilled breakdown
   * (queries/receivables-summary.ts). Value null when milestone currencies
   * mix; currency drives the §7 combination check (never convert).
   */
  milestoneMoney?: {
    unbilledMilestones: number | null;
    unbilledCurrency?: string | null;
  };
  /**
   * Module 13 (§118) — the ACTUAL profitability money from the ONE engine
   * (getPortfolioProfitability → computeProjectProfitability). Profit and
   * margin on the dashboard are derived from this pair, so the Command
   * Center and the profitability reports can never disagree (§70). Null
   * values mean the portfolio mixes currencies (§127 — never converted);
   * the profit/margin metrics then stay pending.
   */
  profitability?: {
    applicableRevenue: number | null;
    deliveryCost: number | null;
  };
  /**
   * Modules 11–14 (§114) — true when the session may NOT see cost: labor
   * cost is salary economics (§63), the same privacy class as
   * agency.rates.cost.read, so a USER (PM included) gets the cost lines
   * (deliveryCost) in their honest pending state. The route passes the cost
   * components as null alongside this flag; the unbilled/hours/shared-context
   * lines keep their normal readiness — only the cost ledger is withheld.
   */
  costWithheld?: boolean;
  /**
   * Module 15 (§21) — the STORED alerts, read-only. The route resolves them
   * via getAlertsSummary (top unresolved rows, §114 cost-filtered for the
   * session) — the dashboard route NEVER evaluates; evaluation lives in the
   * summary API route and the admin evaluate endpoint. Absent (query failure
   * / no data) leaves the alerts section in its Module 1 empty state.
   */
  alerts?: readonly AgencyAlertRecord[];
}

/**
 * The one entry point the API route calls.
 * Assembles the full dashboard payload from the domain aggregations.
 * Tenant scoping is enforced upstream (permissions + repositories), which
 * pass their scoped results in — this function stays pure over inputs.
 *
 * Module 1.3: period + resolved window ride on the payload; windowed metrics
 * all use the SAME window (consistency rule).
 * Module 1.16: the caller passes the TENANT's configured timezone; "today"
 * resolves in that tz (never the server box's or the browser's), and the
 * period scope (from/to/timezone) rides on the payload.
 * Module 1: returns the complete zero-value contract (deltas null — they
 * never appear before values do).
 */
export function getAgencyDashboard(
  period: ReportingPeriod = 'THIS_MONTH',
  timezone: string = DEFAULT_TENANT_TIMEZONE,
  today: BusinessDate = todayInTimezone(timezone),
  custom?: { from: BusinessDate; to: BusinessDate },
  sources?: AgencyDashboardSources
): AgencyDashboardData {
  const dateRange = resolveReportingPeriod(period, today, custom);
  // Module 7 (§117) — time metrics go live only when BOTH time queries
  // resolved (windowed hours + all-time money). A failure on either side
  // degrades every time-derived metric to its pending state — never a fake
  // zero. Profit/margin no longer wait on the time sources at all: they take
  // the ONE engine's actuals (§118 landed) — planned contract revenue is
  // never a profit input.
  //
  // Module 8 (§119) — §4 delivery cost and §7 unbilled revenue now span TWO
  // stores (time + expenses). The money side goes live only when both
  // resolved non-null totals AND their currencies agree (money.ts rule:
  // never convert — a disagreement leaves the metrics pending, never a
  // cross-currency sum). A null currency means that side carries no
  // amounts (contributes 0), so it is compatible with anything.
  const tm = sources?.timeMoney;
  const em = sources?.expenseMoney;
  const mm = sources?.milestoneMoney;
  // Modules 11–14 (§114) — when cost is withheld, the route passes the cost
  // components as null BY DESIGN. The store-side checks below must then judge
  // readiness on the unbilled side alone (the queries DID run), so a USER
  // keeps live unbilled/hours/shared-context lines while every cost number
  // (deliveryCost, and the engine-sourced profit/margin) stays pending.
  const costWithheld = sources?.costWithheld === true;
  const tmUnbilledOK = tm !== undefined && tm.unbilledTime !== null;
  const emUnbilledOK = em !== undefined && em.unbilledExpenses !== null;
  const tmCostOK = costWithheld || (tm !== undefined && tm.deliveryCost !== null);
  const emCostOK = costWithheld || (em !== undefined && em.deliveryCost !== null);
  const timeMoneyOK = tmUnbilledOK && tmCostOK;
  const expenseMoneyOK = emUnbilledOK && emCostOK;
  const currenciesAgree = (a?: string | null, b?: string | null) => a == null || b == null || a === b;
  const moneyCombined = timeMoneyOK && expenseMoneyOK
    && currenciesAgree(tm?.costCurrency, em?.costCurrency)
    && currenciesAgree(tm?.unbilledCurrency, em?.unbilledCurrency);
  const timeResolved = sources?.work !== undefined && timeMoneyOK;
  // Module 10 (§119) — the §7 unbilled METRIC additionally needs the
  // milestone side resolved in a COMPATIBLE currency (money.ts rule: never
  // convert). An unresolved milestone query degrades the combined metric to
  // pending — the breakdown lines still show their raw values.
  const milestoneUnbilledOK = mm === undefined || mm.unbilledMilestones !== null;
  const unbilledCombined = moneyCombined && milestoneUnbilledOK
    && (mm?.unbilledCurrency == null
      || tm?.unbilledCurrency == null || em?.unbilledCurrency == null
      || mm.unbilledCurrency === tm?.unbilledCurrency
      || mm.unbilledCurrency === em?.unbilledCurrency);
  // Module 10 (§105/§117) — invoice/payment metrics go live only when their
  // queries resolved. A mixed-currency store resolves to nulls and the route
  // passes undefined: the metrics stay pending, never a converted number.
  const receivablesResolved = sources?.receivables !== undefined;
  const invoicedResolved = sources?.invoiceMoney?.invoicedRevenue !== undefined;
  const collectedResolved = sources?.invoiceMoney?.collectedRevenue !== undefined;
  // Module 13 (§118 landed) — profit/margin go live when the ONE engine's
  // portfolio money resolved in a single currency. A §127 mixed-currency
  // portfolio (null totals) leaves them pending, never converted.
  const profitabilityResolved = sources?.profitability !== undefined
    && sources.profitability.applicableRevenue !== null
    && sources.profitability.deliveryCost !== null;
  const readiness = {
    ...METRICS_READY,
    time: METRICS_READY.time && timeResolved,
    expenses: unbilledCombined,
    timeProfit: profitabilityResolved,
    invoices: METRICS_READY.invoices && receivablesResolved && invoicedResolved,
    payments: METRICS_READY.payments && collectedResolved,
    // §114 — cost lines are live only when the session may see cost AND the
    // money stores resolved (the rest of moneyReady is already in the flags).
    costVisible: !costWithheld,
  };
  const unbilled = getAgencyUnbilledSummary(
    tm?.unbilledTime ?? undefined,
    em?.unbilledExpenses ?? undefined,
    mm?.unbilledMilestones ?? undefined
  );
  const financial = getAgencyFinancialSummary(
    sources?.contractedRevenue,
    unbilledCombined ? {
      unbilledRevenue: unbilled.totalUnbilled,
      deliveryCost: (tm!.deliveryCost ?? 0) + (em!.deliveryCost ?? 0),
    } : undefined,
    sources?.invoiceMoney,
    // Module 13 (§118) — actual revenue + cost from the ONE engine, as a
    // PAIR from a single computation (never two queries that could race).
    profitabilityResolved ? {
      applicableRevenue: sources!.profitability!.applicableRevenue ?? undefined,
      deliveryCost: sources!.profitability!.deliveryCost ?? undefined,
    } : undefined
  );
  const receivables = getAgencyReceivablesSummary(sources?.receivables);
  const work = getAgencyWorkSummary(sources?.activeProjects, sources?.work);
  const snapshot = getAgencySnapshot(sources?.activeClients, sources?.activeProjects, sources?.plannedMargin, sources?.rateReadiness);
  const trends = getAgencyTrends();
  const projects = getAgencyProjectHealth(sources?.portfolioRows);
  const alerts = getAgencyAlerts(sources?.alerts);

  const atRisk = projects.filter(p => p.status === 'AT_RISK' || p.status === 'OVER_BUDGET').length;

  return {
    metrics: buildDashboardMetrics(financial, receivables, work, atRisk, readiness),
    financialSummary: financial,
    receivables,
    work,
    unbilled,
    snapshot,
    trends,
    projects,
    alerts,
    period,
    periodScope: {
      from: dateRange.from,
      to: dateRange.to,
      timezone,
    },
    dateRange,
    deltas: {
      contractedRevenue: null,
      billedRevenue: null,
      collectedRevenue: null,
      unbilledRevenue: null,
    },
  };
}
