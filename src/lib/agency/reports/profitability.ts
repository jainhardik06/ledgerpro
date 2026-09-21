/**
 * Agency Vertical — Reports: Project Profitability report (Module 16, §31)
 *
 * §31 — "This directly consumes Module 13's profitability model. Do not
 * duplicate the profitability formulas." This module is the proof: it maps
 * engine rows (the SAME getPortfolioProfitability pass the portfolio report
 * and /api/agency/profitability serve, §70) to the §31 column set — the
 * cost split (labor/expense), the hours pair, and nothing recomputed. The
 * summary fold mirrors the engine's (§127), so all three surfaces agree by
 * construction.
 *
 * Filters: identical semantics to the portfolio report (§29 module header).
 */
import { getPortfolioProfitability } from '../profitability';
import type { ProjectStatus } from '../types/project';
import type {
  AgencyReportFilters, ProfitabilityReportRow, ProfitabilityReportSummary, ReportPayload,
} from './types';
import { foldCurrency, sumRows, weightedMarginPercent } from './summary';
import { slicePage } from './pagination';

function toProfitabilityRows(
  portfolio: Awaited<ReturnType<typeof getPortfolioProfitability>>
): ProfitabilityReportRow[] {
  const clientNames = new Map(portfolio.byClient.map(c => [c.clientId, c.clientName]));
  return portfolio.projects.map(p => ({
    projectId: p.projectId,
    projectName: p.projectName,
    clientName: clientNames.get(p.clientId) ?? null,
    currency: p.currency,
    contractValue: p.contractValue === null ? null : p.contractValue.amount,
    applicableRevenue: p.applicableRevenue.amount,
    laborCost: p.laborCost.amount,
    expenseCost: p.expenseCost.amount,
    deliveryCost: p.deliveryCost.amount,
    profit: p.grossProfit.amount,
    marginPercent: p.marginPercent, // §82 — null when revenue = 0
    plannedHours: p.plannedHours,
    actualHours: p.actualHours,
  }));
}

function foldProfitabilitySummary(rows: readonly ProfitabilityReportRow[]): ProfitabilityReportSummary {
  const fold = foldCurrency(rows);
  if (fold.mixedCurrencies) {
    return {
      projectCount: rows.length, currency: null, mixedCurrencies: true,
      applicableRevenue: null, laborCost: null, expenseCost: null,
      deliveryCost: null, profit: null, weightedMarginPercent: null,
    };
  }
  const revenue = sumRows(rows, r => r.applicableRevenue);
  const profit = sumRows(rows, r => r.profit);
  return {
    projectCount: rows.length,
    currency: fold.currency,
    mixedCurrencies: false,
    applicableRevenue: revenue,
    laborCost: sumRows(rows, r => r.laborCost),
    expenseCost: sumRows(rows, r => r.expenseCost),
    deliveryCost: sumRows(rows, r => r.deliveryCost),
    profit,
    weightedMarginPercent: weightedMarginPercent(profit, revenue),
  };
}

/**
 * §31 — the Project Profitability report: the engine's rows in the cost-split
 * lens. Rows keep the engine's problems-first order (§81).
 */
export async function getProfitabilityReport(
  tenantId: string,
  filters: AgencyReportFilters,
  page: { limit: number; offset: number }
): Promise<ReportPayload<ProfitabilityReportRow, ProfitabilityReportSummary>> {
  const portfolio = await getPortfolioProfitability(tenantId, {
    ...(filters.clientId !== undefined && { clientId: filters.clientId }),
    ...(filters.status !== undefined && { status: filters.status as ProjectStatus }),
    ...(filters.from !== undefined && { from: filters.from }),
    ...(filters.to !== undefined && { to: filters.to }),
  });

  let rows = toProfitabilityRows(portfolio);
  if (filters.projectId !== undefined) {
    rows = rows.filter(r => r.projectId === filters.projectId);
  }
  if (filters.currency !== undefined) {
    rows = rows.filter(r => r.currency === filters.currency);
  }

  const summary = foldProfitabilitySummary(rows);
  const { rows: pageRows, pagination } = slicePage(rows, page.limit, page.offset);
  return { rows: pageRows, summary, pagination };
}
