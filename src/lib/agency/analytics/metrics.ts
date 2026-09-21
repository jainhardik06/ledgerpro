/**
 * Agency Vertical — Analytics: per-metric domain functions (Module 1.19)
 *
 * DASHBOARD CALCULATION BOUNDARIES: each metric belongs to exactly ONE
 * function here. getAgencyDashboard() (analytics/dashboard.ts) composes
 * these; the React layer only renders results.
 *
 *   getContractedRevenue()      §1   contracted (applicable) revenue
 *   getInvoicedRevenue()        §2   invoiced value
 *   getCollectedRevenue()       §3   collected cash
 *   getUnbilledRevenue()        §7   approved billable, not invoiced
 *   getDeliveryCost()           §4   delivery cost
 *   getProjectProfit()          §5   gross profit (profitability engine)
 *   getProjectMargin()          §6   gross margin (null when revenue = 0)
 *   getOutstandingReceivables() §9   open invoice money
 *   getOverdueReceivables()     §9   past-due money
 *   getProjectHealth()          §11  portfolio health rows (health engine)
 *
 * Every function is the single owner of its number: no other layer may
 * compute or re-derive it (components never compute, Module 1.5/1.12 rules;
 * the summary builders below just group owned values).
 *
 * Module 1 status: sources don't exist yet, so each function returns the
 * zero-value contract from definitions §13. As each entity sprint lands, its
 * query plugs into exactly one function here — the composition and the UI
 * never change.
 */
import { computeProjectHealth, sortProjectsByHealth } from '../domain/project-health';
import { computeProfitability } from '../domain/profitability';
import type { ProjectHealthRow } from '../types/agency.dashboard';

/**
 * §1 Contracted Revenue. Window-style metrics resolve over the tenant's
 * scope; the window itself is passed in by the composer (never resolved
 * here — one window per request, Module 1.3).
 * Sprint owner: projects (Sprint 1) + time (Sprint 3).
 *
 * Module 3 (Step 3.8): the caller resolves the planned committed value over
 * ACTIVE projects (queries/project-metrics.ts) and passes it here — this
 * function stays the single owner of the metric's definition and fallback.
 */
export function getContractedRevenue(resolved?: number): number {
  return resolved ?? 0; // §13 zero-value until projects/time queries land
}

/**
 * §2 Invoiced Revenue.
 *
 * Module 10 (§117): the caller resolves Σ total over ISSUED invoices
 * (queries/receivables-summary.ts) and passes it in. This function stays
 * the single owner of the metric's definition and fallback.
 */
export function getInvoicedRevenue(resolved?: number): number {
  return resolved ?? 0;
}

/**
 * §3 Collected Revenue.
 *
 * Module 10 (§117): the caller resolves Σ amount over CONFIRMED payments
 * (queries/receivables-summary.ts — equals the tenant-wide §104 settled
 * money) and passes it in. This function stays the single owner.
 */
export function getCollectedRevenue(resolved?: number): number {
  return resolved ?? 0;
}

/**
 * §117 Cash Collection Rate — collected ÷ invoiced, the after-Payments
 * Command Center line. Null when there is no baseline (nothing invoiced,
 * or either side unresolved/mixed-currency — the §6 no-baseline rule:
 * never 0, never NaN). Both inputs arrive resolved from the same
 * invoice-money query, so the ratio is always same-currency. Scale is
 * 0–100 (the billablePercent convention — formatPercentage renders it
 * directly).
 */
export function getCashCollectionRate(invoiced?: number, collected?: number): number | null {
  if (invoiced === undefined || collected === undefined) return null;
  if (invoiced === null || collected === null) return null;
  if (invoiced <= 0) return null;
  return (collected / invoiced) * 100;
}

/** §7 Unbilled Revenue — approved billable work not invoiced. Sprint owner: projects+time.
 *
 * Module 7 (§117): the caller resolves §7 Unbilled (time part — queries/
 * time-summary.ts; expenses arrive with Module 8) and passes the composed
 * total in. This function stays the single owner of the definition.
 */
export function getUnbilledRevenue(resolved?: number): number {
  return resolved ?? 0;
}

/** §4 Delivery Cost. Sprint owner: projects + time.
 *
 * Module 7 (§117): the caller resolves the time part (Σ calculatedCost over
 * APPROVED entries, queries/time-summary.ts) and passes it in; the expense
 * part (linked Debit transactions) extends this with Module 8.
 */
export function getDeliveryCost(resolved?: number): number {
  return resolved ?? 0;
}

/**
 * §5 Gross Project Profit — OWNED by the profitability engine (Module 1.12):
 * Revenue − Delivery Cost. This function is the only caller of the engine
 * for the dashboard; components and summaries never recompute it.
 *
 * Module 13 (§118): both inputs are caller-resolved ACTUALS from the ONE
 * profitability engine (applicable revenue per billing model + delivery
 * cost) — planned contract revenue is never an input here.
 */
export function getProjectProfit(revenue?: number, deliveryCost?: number): number {
  return computeProfitability({
    revenue: getContractedRevenue(revenue),
    deliveryCost: getDeliveryCost(deliveryCost),
  }).grossProfit;
}

/**
 * §6 Gross Project Margin — (Revenue − Cost) / Revenue, null when Revenue = 0
 * (no-baseline rule). OWNED by the profitability engine. Scale is 0–100
 * (the billablePercent / cashCollectionRate convention — formatPercentage
 * renders it directly; Module 13's projectMargin.ts reports the same scale).
 */
export function getProjectMargin(revenue?: number, deliveryCost?: number): number | null {
  const grossMargin = computeProfitability({
    revenue: getContractedRevenue(revenue),
    deliveryCost: getDeliveryCost(deliveryCost),
  }).grossMargin;
  return grossMargin === null ? null : grossMargin * 100;
}

/**
 * §9 Outstanding Receivables.
 *
 * Module 10 (§105): the caller resolves Σ amountDue over OPEN invoices
 * (queries/receivables-summary.ts) and passes it in. Single owner stays
 * here — the definition never changes when the store does.
 */
export function getOutstandingReceivables(resolved?: number): number {
  return resolved ?? 0;
}

/**
 * §9 Overdue Receivables.
 *
 * Module 10 (§105): the caller resolves Σ amountDue over past-due open
 * invoices (queries/receivables-summary.ts) and passes it in.
 */
export function getOverdueReceivables(resolved?: number): number {
  return resolved ?? 0;
}

/**
 * §11 Project Portfolio Health — rows built through the deterministic health
 * engine (Module 1.8); status never hand-assigned. Sorted problems-first
 * (Module 1.7). Sprint owner: projects (Sprint 1).
 * Module 1: empty table (§13).
 */
export function getProjectHealth(): ProjectHealthRow[] {
  return sortProjectsByHealth([]);
}

// ---------- summary groupings (thin composers, zero formulas) ----------

/**
 * Financial summary grouped for the payload. Thin: every value is owned by
 * its per-metric function above; this only groups, never computes.
 * Module 3: the resolved contractedRevenue passes through to its owner.
 * Module 7 (§117): resolved unbilled revenue (§7) and delivery cost (§4)
 * pass through the same way.
 * Module 10 (§117): resolved invoiced (§2) and collected (§3) revenue pass
 * through to their owners.
 * Module 13 (§118): profit/margin now take ACTUAL per-billing-model revenue
 * from the ONE profitability engine (queries/profitability-metrics.ts →
 * computeProjectRevenue) — planned contract revenue is never subtracted from
 * actual cost to fabricate a profit.
 */
export function getFinancialSummary(
  contractedRevenue?: number,
  timeMoney?: { unbilledRevenue?: number; deliveryCost?: number },
  invoiceMoney?: { invoicedRevenue?: number; collectedRevenue?: number },
  profitability?: { applicableRevenue?: number; deliveryCost?: number }
) {
  return {
    contractedRevenue: getContractedRevenue(contractedRevenue),
    billedRevenue: getInvoicedRevenue(invoiceMoney?.invoicedRevenue),
    collectedRevenue: getCollectedRevenue(invoiceMoney?.collectedRevenue),
    cashCollectionRate: getCashCollectionRate(
      invoiceMoney?.invoicedRevenue ?? undefined,
      invoiceMoney?.collectedRevenue ?? undefined
    ),
    unbilledRevenue: getUnbilledRevenue(timeMoney?.unbilledRevenue),
    deliveryCost: getDeliveryCost(timeMoney?.deliveryCost),
    projectProfit: getProjectProfit(profitability?.applicableRevenue, profitability?.deliveryCost),
    averageMargin: getProjectMargin(profitability?.applicableRevenue, profitability?.deliveryCost),
  };
}

/**
 * Receivables summary grouped for the payload. Thin grouping over the
 * per-metric owners.
 *
 * Module 10 (§105/§106): the caller resolves the position as of the
 * tenant-timezone today (queries/receivables-summary.ts) and passes it in;
 * without an input the zero-value contract holds (honestly pending, never
 * a fake zero presented as real — the dashboard's readiness flags decide).
 */
export function getReceivablesSummary(receivables?: {
  outstanding?: number;
  overdueAmount?: number;
  overdueCount?: number;
  dueSoon?: number;
  byAgingBucket?: Record<'CURRENT' | '1-30' | '31-60' | '61-90' | '90+', number>;
}) {
  return {
    outstanding: getOutstandingReceivables(receivables?.outstanding),
    overdueAmount: getOverdueReceivables(receivables?.overdueAmount),
    overdueCount: receivables?.overdueCount ?? 0,
    dueSoon: receivables?.dueSoon ?? 0,
    byAgingBucket: receivables?.byAgingBucket
      ?? { CURRENT: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 },
  };
}
