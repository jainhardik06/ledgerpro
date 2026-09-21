/**
 * Agency Vertical — Reports: Portfolio report (Module 16, §29/§30/§36)
 *
 * The §26 layer-2/3 boundary: this module RESHAPES Module 13's engine output
 * (getPortfolioProfitability — the single profitability calculation engine,
 * §70) into the §29 portfolio view model. It calculates NOTHING financial:
 * every money number is a pass-through; the only arithmetic here is the
 * summary fold, which mirrors the engine's own fold (§127 discipline) so an
 * unfiltered report summary is numerically identical to the engine's — the
 * §41 reconciliation guarantee.
 *
 * Filters (§28): from/to select projects by startDate (the engine's §80
 * semantics — profitability is a position, the window never slices the money
 * inside a project), clientId/status are engine filters, and
 * projectId/currency are row filters applied AFTER the engine pass (the
 * summary is folded from the FILTERED rows, so UI/CSV/PDF agree under any
 * filter). userId is not meaningful here and is rejected by the route.
 */
import { getProjects } from '@/lib/db';
import { getPortfolioProfitability } from '../profitability';
import type { PortfolioProfitability } from '../types/profitability';
import type { ProjectStatus } from '../types/project';
import type { AgencyReportFilters, PortfolioReportRow, PortfolioReportSummary, ReportPayload } from './types';
import { foldCurrency, sumRows, weightedMarginPercent } from './summary';
import { slicePage } from './pagination';

/** Map engine rows (+ resolved names/status) to the §29 view model. */
function toPortfolioRows(
  portfolio: PortfolioProfitability,
  statusByProject: Map<string, ProjectStatus>
): PortfolioReportRow[] {
  const clientNames = new Map(portfolio.byClient.map(c => [c.clientId, c.clientName]));
  return portfolio.projects.map(p => ({
    projectId: p.projectId,
    projectName: p.projectName,
    clientName: clientNames.get(p.clientId) ?? null,
    status: statusByProject.get(p.projectId) ?? 'DRAFT',
    currency: p.currency,
    contractValue: p.contractValue === null ? null : p.contractValue.amount,
    applicableRevenue: p.applicableRevenue.amount,
    billedAmount: p.billedAmount.amount,
    collectedAmount: p.collectedAmount.amount,
    deliveryCost: p.deliveryCost.amount,
    profit: p.grossProfit.amount,
    marginPercent: p.marginPercent, // §82 — null when revenue = 0
  }));
}

/** Fold the §29 summary from the (already filtered) rows — engine math. */
function foldPortfolioSummary(rows: readonly PortfolioReportRow[]): PortfolioReportSummary {
  const fold = foldCurrency(rows);
  if (fold.mixedCurrencies) {
    return {
      projectCount: rows.length, currency: null, mixedCurrencies: true,
      contractValue: null, applicableRevenue: null, billedAmount: null,
      collectedAmount: null, deliveryCost: null, profit: null,
      weightedMarginPercent: null,
    };
  }
  const revenue = sumRows(rows, r => r.applicableRevenue);
  const profit = sumRows(rows, r => r.profit);
  return {
    projectCount: rows.length,
    currency: fold.currency,
    mixedCurrencies: false,
    // Known-optional: a Σ over only SOME projects' contract values lies, so
    // the total is null unless every reported project carries one.
    contractValue: sumRows(rows, r => r.contractValue),
    applicableRevenue: revenue,
    billedAmount: sumRows(rows, r => r.billedAmount),
    collectedAmount: sumRows(rows, r => r.collectedAmount),
    deliveryCost: sumRows(rows, r => r.deliveryCost),
    profit, // may be negative — a loss is a real number (§64)
    weightedMarginPercent: weightedMarginPercent(profit, revenue),
  };
}

/**
 * §29 — the Portfolio report. Rows keep the engine's problems-first order
 * (§81); the summary is folded from ALL filtered rows; the page is a slice.
 */
export async function getPortfolioReport(
  tenantId: string,
  filters: AgencyReportFilters,
  page: { limit: number; offset: number }
): Promise<ReportPayload<PortfolioReportRow, PortfolioReportSummary>> {
  const portfolio = await getPortfolioProfitability(tenantId, {
    ...(filters.clientId !== undefined && { clientId: filters.clientId }),
    ...(filters.status !== undefined && { status: filters.status as ProjectStatus }),
    ...(filters.from !== undefined && { from: filters.from }),
    ...(filters.to !== undefined && { to: filters.to }),
  });

  // Lifecycle status is a Project field the engine payload does not carry —
  // read it from the same store the engine read (a display fact, never a
  // financial one).
  const projects = await getProjects(tenantId, { page: 1, limit: 1000 }, {
    ...(filters.clientId !== undefined && { clientId: filters.clientId }),
  });
  const statusByProject = new Map(projects.map(p => [p.id, p.status]));

  let rows = toPortfolioRows(portfolio, statusByProject);
  if (filters.projectId !== undefined) {
    rows = rows.filter(r => r.projectId === filters.projectId);
  }
  if (filters.currency !== undefined) {
    rows = rows.filter(r => r.currency === filters.currency);
  }

  const summary = foldPortfolioSummary(rows);
  const { rows: pageRows, pagination } = slicePage(rows, page.limit, page.offset);
  return { rows: pageRows, summary, pagination };
}
