import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getTenantById } from '@/lib/db';
import { agencyTimezone } from '@/lib/agency/domain/agency.settings';
import { todayInTimezone, addDays } from '@/lib/agency/types/dates';
import { countActiveClients } from '@/lib/agency/queries/client-counts';
import { getProjectPortfolioMetrics } from '@/lib/agency/queries/project-metrics';
import { getRateReadinessMetrics } from '@/lib/agency/queries/rate-readiness';
import { getDeliveryHoursMetrics } from '@/lib/agency/queries/time-summary';
import {
  getReceivablesMetrics, getInvoiceMoneyMetrics,
} from '@/lib/agency/queries/receivables-summary';
import { getPortfolioProfitability } from '@/lib/agency/profitability';

export const dynamic = 'force-dynamic';

/**
 * GET /api/super-admin/tenants/[id]/agency — one tenant's agency snapshot.
 *
 * A privileged SUPPORT READ for the Platform Console: the same numbers the
 * tenant's own Agency Command Center shows, resolved by the SAME Phase 1
 * query engines (the one-engine rule, §70/§99 — the super-admin view can
 * never disagree with the tenant view). The platform operator legitimately
 * sees cost/profitability here (it is the operator of the cost-bearing
 * engine, the §114 class boundary is between tenant roles, not above the
 * platform).
 *
 * SUPER_ADMIN only; 401 otherwise. 404 for an unknown tenant. A non-agency
 * tenant answers isAgency: false — honest, not an error.
 *
 * Each engine call is independently guarded: one failing source degrades to
 * a pending (null/undefined) field, never a fabricated number and never a
 * 500 for the whole snapshot (the dashboard route's failure rule).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser();
    if (!session || session.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const tenant = await getTenantById(id);
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }
    const tenantId = tenant.id || tenant._id?.toString() || id;

    // A tenant that never activated the agency vertical gets the honest
    // negative — no zero-filled agency numbers that would read as real.
    if ((tenant.appMode ?? 'Standard') !== 'Agency') {
      return NextResponse.json({
        isAgency: false,
        tenant: { id: tenantId, name: tenant.name, appMode: tenant.appMode ?? 'Standard', status: tenant.status, plan: tenant.plan },
      });
    }

    // The tenant's own timezone anchors business dates (§44) — the snapshot
    // ages invoices exactly like the tenant's dashboard does.
    const timezone = agencyTimezone(tenant);
    const today = todayInTimezone(timezone);
    const from = addDays(today, -30);

    const optional = async <T>(p: Promise<T>): Promise<T | undefined> => {
      try { return await p; } catch { return undefined; }
    };
    const [activeClients, projectMetrics, rateReadiness, hours, receivables, invoiceMoney, profitability] =
      await Promise.all([
        optional(countActiveClients(tenantId)),
        optional(getProjectPortfolioMetrics(tenantId)),
        optional(getRateReadinessMetrics(tenantId)),
        optional(getDeliveryHoursMetrics(tenantId, from, today)),
        optional(getReceivablesMetrics(tenantId, today)),
        optional(getInvoiceMoneyMetrics(tenantId)),
        optional(getPortfolioProfitability(tenantId)),
      ]);

    return NextResponse.json({
      isAgency: true,
      tenant: { id: tenantId, name: tenant.name, appMode: 'Agency', status: tenant.status, plan: tenant.plan },
      timezone,
      // Pending (absent) sources are simply omitted — the UI shows "not
      // available" for them, mirroring the tenant dashboard contract.
      ...(activeClients !== undefined && { activeClients }),
      ...(projectMetrics && {
        activeProjects: projectMetrics.activeProjects,
        contractedRevenue: projectMetrics.contractedRevenue,
        plannedMargin: projectMetrics.plannedMargin,
      }),
      ...(rateReadiness && {
        rateReadiness: {
          projectsTotal: rateReadiness.projectsTotal,
          projectsReadyForTracking: rateReadiness.projectsReadyForTracking,
          projectsMissingRates: rateReadiness.projectsMissingRates,
          usersWithoutCostRate: rateReadiness.usersWithoutCostRate,
          usersTotal: rateReadiness.usersTotal,
        },
      }),
      ...(hours && {
        hoursLast30d: hours.totalMinutes / 60,
        billableHoursLast30d: hours.billableMinutes / 60,
      }),
      ...(receivables && !receivables.mixedCurrencies && {
        receivables: {
          outstanding: receivables.outstanding ?? 0,
          dueSoon: receivables.dueSoon ?? 0,
          overdueAmount: receivables.overdueAmount ?? 0,
          overdueCount: receivables.overdueCount,
          currency: receivables.currency ?? null,
        },
      }),
      ...(receivables?.mixedCurrencies && { mixedCurrencies: true }),
      ...(invoiceMoney && {
        money: {
          invoicedRevenue: invoiceMoney.invoicedRevenue,
          collectedRevenue: invoiceMoney.collectedRevenue,
          invoicedCurrency: invoiceMoney.invoicedCurrency,
          collectedCurrency: invoiceMoney.collectedCurrency,
          mixedInvoicedCurrencies: invoiceMoney.mixedInvoicedCurrencies,
          mixedCollectedCurrencies: invoiceMoney.mixedCollectedCurrencies,
        },
      }),
      ...(profitability && {
        profitability: {
          projectCount: profitability.summary.projectCount,
          mixedCurrencies: profitability.summary.mixedCurrencies,
          contractValue: profitability.summary.contractValue?.amount ?? null,
          applicableRevenue: profitability.summary.applicableRevenue?.amount ?? null,
          deliveryCost: profitability.summary.deliveryCost?.amount ?? null,
          grossProfit: profitability.summary.grossProfit?.amount ?? null,
          marginPercent: profitability.summary.marginPercent,
          currency: profitability.summary.applicableRevenue?.currency
            ?? profitability.summary.deliveryCost?.currency ?? null,
        },
      }),
    });
  } catch (error) {
    console.error('Super-admin tenant agency snapshot error:', error);
    return NextResponse.json({ error: 'Failed to load tenant agency snapshot' }, { status: 500 });
  }
}
