/**
 * Agency Vertical — Profitability engine: composer + services (Module 13, §68–§70/§80/§81)
 *
 * THE Module 13 financial engine (§69). Architecture (§70 — never calculate
 * profitability in React):
 *
 *   Project UI / Reports
 *     ↓ receives ProjectProfitability, renders it
 *   API routes (§80)
 *     ↓
 *   THIS composer + services
 *     ↓
 *   projectRevenue / projectCosts / projectMargin / projectBudget /
 *   projectHealth / unbilled   (pure, deterministic)
 *
 * computeProjectProfitability is PURE over already-aggregated inputs — the
 * same inputs always yield the same outputs (§84 gate). The two service
 * functions own the data access (queries/profitability-metrics.ts) and fail
 * CLOSED: unlike the always-render dashboard, a profitability report that
 * cannot resolve a source is a 500, never a partially-fabricated number.
 *
 * §66 — collected cash never enters the profit formulas. §82 — zero revenue
 * ⇒ null margin. §127 — every Money is framed in the project's currency;
 * other-currency sources are counted as mismatches, never converted.
 */
import type { Money } from '../types/money';
import { makeMoney } from '../types/money';
import type { Project } from '../types/project';
import type {
  ClientProfitabilityRow, PortfolioProfitability, PortfolioProfitabilitySummary,
  ProjectFinancialHealth, ProjectProfitability, ProfitabilityDrillDown,
} from '../types/profitability';
import type { ProjectStatus } from '../types/project';
import {
  getProjectById, getProjects, getUserById, getClientById,
} from '@/lib/db';
import {
  getProjectTimeAggregates, getProjectExpenseAggregates,
  getProjectInvoiceAggregates, getProjectMilestoneAggregates,
  getProjectLaborBreakdown, getProjectExpenseBreakdown,
  type ProjectTimeAggregates, type ProjectExpenseAggregates,
  type ProjectInvoiceAggregates, type ProjectMilestoneAggregates,
  type LaborBreakdownSource, type ExpenseBreakdownSource,
} from '../queries/profitability-metrics';
import { computeProjectCosts, frameInProjectCurrency } from './projectCosts';
import { computeProjectRevenue } from './projectRevenue';
import { computeProjectUnbilled } from './unbilled';
import { computeProjectMargin, signedMoney } from './projectMargin';
import { computeProjectBudgetBurn, hoursBudgetWarning } from './projectBudget';
import {
  computeProjectFinancialHealth, marginAlertFor,
} from './projectHealth';

// ---------- pure composer (§68) ----------

/** The aggregate sources of one project (absent = the store has no rows). */
export interface ProjectProfitabilitySources {
  project: Project;
  time?: ProjectTimeAggregates;
  expenses?: ProjectExpenseAggregates;
  invoices?: ProjectInvoiceAggregates;
  milestones?: ProjectMilestoneAggregates;
}

/**
 * §68 — assemble one ProjectProfitability. Pure: same sources → same
 * snapshot, always (§84: deterministic, explainable, reproducible).
 */
export function computeProjectProfitability(sources: ProjectProfitabilitySources): ProjectProfitability {
  const { project } = sources;
  const currency = project.currency;

  // §63 — delivery cost.
  const costs = computeProjectCosts(currency, sources.time, sources.expenses);

  // §62 — applicable revenue.
  const revenue = computeProjectRevenue(project, sources.time, sources.milestones);

  // §64/§65 — profit & margin (§82: null margin at zero revenue).
  const margin = computeProjectMargin(revenue.applicableRevenue, costs.deliveryCost);

  // §66 dimensions 4 & 5 — billed / collected, framed in the project currency.
  const billedFramed = frameInProjectCurrency(sources.invoices?.billed ?? [], currency);
  const collectedFramed = frameInProjectCurrency(sources.invoices?.collected ?? [], currency);
  const billedAmount = makeMoney(billedFramed.amount, currency);
  const collectedAmount = makeMoney(collectedFramed.amount, currency);

  // §67 — unbilled work.
  const unbilled = computeProjectUnbilled(
    project, billedAmount, sources.time, sources.expenses, sources.milestones
  );

  // §74/§76 — the three burns + hours signals.
  const actualHours = Math.round(((sources.time?.approvedMinutes ?? 0) / 60) * 100) / 100;
  const budget = computeProjectBudgetBurn({
    plannedHours: project.plannedHours ?? null,
    actualHours,
    deliveryCost: costs.deliveryCost.amount,
    budgetCost: project.budgetCost ?? null,
    applicableRevenue: revenue.applicableRevenue.amount,
    revenueBudget: project.revenueBudget ?? null,
  });

  // §75/§77 — health + the margin alert that explains an AT_RISK verdict.
  const targetMargin = project.targetMargin ?? null;
  const healthInput = {
    hoursBurn: budget.burn.hours,
    costBurn: budget.burn.cost,
    marginPercent: margin.marginPercent,
    targetMargin,
  };
  const health = computeProjectFinancialHealth(healthInput);
  const marginAlert = marginAlertFor(healthInput, health);

  const notes = [...costs.notes, ...revenue.notes, ...unbilled.notes];
  const currencyMismatches =
    costs.currencyMismatches + revenue.currencyMismatches
    + unbilled.currencyMismatches + billedFramed.mismatches.length + collectedFramed.mismatches.length;
  if (billedFramed.mismatches.length > 0 || collectedFramed.mismatches.length > 0) {
    notes.push(
      `Invoices carry ${billedFramed.mismatches.length + collectedFramed.mismatches.length} other-currency bucket(s) — excluded from ${currency} (§127: never converted)`
    );
  }

  return {
    projectId: project.id,
    projectName: project.name,
    clientId: project.clientId,
    currency,
    revenueModel: revenue.revenueModel,
    contractValue: project.contractValue === undefined || project.contractValue === null
      ? null
      : makeMoney(project.contractValue, currency),
    applicableRevenue: revenue.applicableRevenue,
    deliveryCost: costs.deliveryCost,
    laborCost: costs.laborCost,
    expenseCost: costs.expenseCost,
    grossProfit: margin.grossProfit,
    marginPercent: margin.marginPercent,
    billedAmount,
    collectedAmount,
    outstandingAmount: makeMoney(Math.max(0, billedAmount.amount - collectedAmount.amount), currency),
    unbilledAmount: unbilled.unbilledAmount,
    plannedHours: project.plannedHours ?? null,
    actualHours,
    remainingHours: budget.remainingHours,
    burn: budget.burn,
    budgetBurnPercent: budget.budgetBurnPercent,
    targetMargin,
    health,
    marginAlert,
    hoursWarning: hoursBudgetWarning(budget.burn.hours),
    notes,
    currencyMismatches,
  };
}

// ---------- §78 drill-down ----------

/**
 * §78 — build the drill-down: labor by member × frozen rate, expenses by
 * vendor. Only project-currency rows render; other-currency rows are
 * excluded and noted (§127 — never converted).
 */
export function buildProfitabilityDrillDown(
  currency: string,
  laborSources: readonly LaborBreakdownSource[],
  expenseSources: readonly ExpenseBreakdownSource[],
  userLabels: Readonly<Record<string, string>>
): ProfitabilityDrillDown {
  const labor = laborSources
    .filter(l => l.currency === currency)
    .map(l => ({
      userId: l.userId,
      userName: userLabels[l.userId] ?? null,
      minutes: l.minutes,
      hours: Math.round((l.minutes / 60) * 100) / 100,
      rate: l.rateAmount === null ? null : makeMoney(l.rateAmount, currency),
      cost: makeMoney(l.cost, currency),
      entryCount: l.entryCount,
    }))
    .sort((a, b) => b.cost.amount - a.cost.amount);
  const expenses = expenseSources
    .filter(e => e.currency === currency)
    .map(e => ({
      vendorName: e.vendorName,
      cost: makeMoney(e.cost, currency),
      expenseCount: e.expenseCount,
    }))
    .sort((a, b) => b.cost.amount - a.cost.amount);
  return { labor, expenses };
}

// ---------- services (§80) ----------

/** The full §80 project report: snapshot + §78 drill-down. */
export interface ProjectProfitabilityReport {
  project: Project;
  profitability: ProjectProfitability;
  drillDown: ProfitabilityDrillDown;
}

/**
 * §80 — GET /api/agency/projects/:id/profitability's domain service.
 * Returns null when the project does not exist in this tenant (the route
 * answers 404). Throws when a source query fails — fail closed, never a
 * partially-fabricated report.
 */
export async function getProjectProfitabilityReport(
  tenantId: string,
  projectId: string
): Promise<ProjectProfitabilityReport | null> {
  const project = await getProjectById(projectId, tenantId);
  if (!project) return null;

  const scope = [projectId];
  const [timeMap, expenseMap, invoiceMap, milestoneMap, laborSources, expenseSources] = await Promise.all([
    getProjectTimeAggregates(tenantId, scope),
    getProjectExpenseAggregates(tenantId, scope),
    getProjectInvoiceAggregates(tenantId, scope),
    getProjectMilestoneAggregates(tenantId, scope),
    getProjectLaborBreakdown(tenantId, projectId),
    getProjectExpenseBreakdown(tenantId, projectId),
  ]);

  const profitability = computeProjectProfitability({
    project,
    time: timeMap.get(projectId),
    expenses: expenseMap.get(projectId),
    invoices: invoiceMap.get(projectId),
    milestones: milestoneMap.get(projectId),
  });

  // §78 labels — names, never raw ids; a missing user shows null, never a
  // fabricated name.
  const userLabels: Record<string, string> = {};
  for (const line of laborSources) {
    if (userLabels[line.userId] !== undefined) continue;
    const user = await getUserById(line.userId);
    if (user && user.username) userLabels[line.userId] = user.username;
  }

  return {
    project,
    profitability,
    drillDown: buildProfitabilityDrillDown(
      project.currency, laborSources, expenseSources, userLabels
    ),
  };
}

/** §80 — portfolio filters. All optional. */
export interface PortfolioFilters {
  /** Projects of this client only. */
  clientId?: string;
  /** Projects in this lifecycle status. */
  status?: ProjectStatus;
  /** Project-start window (inclusive, business dates): projects whose
   *  startDate falls in [from, to]. §80's ?from/?to — profitability is a
   *  position, so the window selects PROJECTS, never the money inside. */
  from?: string;
  to?: string;
}

/** §81 problems-first default sort (module 1.7 pattern, §68's 4-state union). */
const HEALTH_SORT_ORDER: Readonly<Record<ProjectFinancialHealth, number>> = {
  OVER_BUDGET: 0,
  AT_RISK: 1,
  WATCH: 2,
  HEALTHY: 3,
};

/**
 * §80/§81 — GET /api/agency/profitability's domain service: per-project
 * profitability rows, the client rollup (a derivative of project
 * profitability), and portfolio totals. The Margin-by-Project /
 * Cost-by-Project / Budget-Burn / Unbilled-Work reports are lenses over the
 * SAME rows — one engine, so every report agrees (§70).
 */
export async function getPortfolioProfitability(
  tenantId: string,
  filters: PortfolioFilters = {}
): Promise<PortfolioProfitability> {
  // The projects ARE the report subject (not a find-then-sum — the money
  // comes from aggregation pipelines below).
  const projects = await getProjects(tenantId, { page: 1, limit: 1000 }, {
    ...(filters.clientId !== undefined && { clientId: filters.clientId }),
    ...(filters.status !== undefined && { status: filters.status }),
  });
  const inWindow = projects.filter(p => {
    if (filters.from !== undefined && (!p.startDate || p.startDate < filters.from)) return false;
    if (filters.to !== undefined && (!p.startDate || p.startDate > filters.to)) return false;
    return true;
  });
  const scope = inWindow.map(p => p.id);

  const [timeMap, expenseMap, invoiceMap, milestoneMap] = scope.length === 0
    ? [new Map(), new Map(), new Map(), new Map()]
    : await Promise.all([
      getProjectTimeAggregates(tenantId, scope),
      getProjectExpenseAggregates(tenantId, scope),
      getProjectInvoiceAggregates(tenantId, scope),
      getProjectMilestoneAggregates(tenantId, scope),
    ]);

  const rows = inWindow
    .map(project => computeProjectProfitability({
      project,
      time: timeMap.get(project.id),
      expenses: expenseMap.get(project.id),
      invoices: invoiceMap.get(project.id),
      milestones: milestoneMap.get(project.id),
    }))
    .sort((a, b) =>
      (HEALTH_SORT_ORDER[a.health] - HEALTH_SORT_ORDER[b.health])
      || a.projectName.localeCompare(b.projectName));

  // §81 — client rollup. Money adds only within one currency (§127);
  // a client whose projects mix currencies gets null money fields.
  const byClientMap = new Map<string, ProjectProfitability[]>();
  for (const row of rows) {
    const list = byClientMap.get(row.clientId) ?? [];
    list.push(row);
    byClientMap.set(row.clientId, list);
  }
  const clientIds = [...byClientMap.keys()];
  const clientNames: Record<string, string | null> = {};
  for (const clientId of clientIds) {
    const client = await getClientById(clientId, tenantId);
    clientNames[clientId] = client ? client.name : null;
  }
  const byClient: ClientProfitabilityRow[] = clientIds.map(clientId => {
    const list = byClientMap.get(clientId)!;
    const currencies = new Set(list.map(r => r.currency));
    if (currencies.size > 1) {
      return {
        clientId, clientName: clientNames[clientId], projectCount: list.length,
        applicableRevenue: null, deliveryCost: null, grossProfit: null, marginPercent: null,
      };
    }
    const currency = [...currencies][0] ?? 'INR';
    const revenue = list.reduce((sum, r) => sum + r.applicableRevenue.amount, 0);
    const cost = list.reduce((sum, r) => sum + r.deliveryCost.amount, 0);
    const profit = list.reduce((sum, r) => sum + r.grossProfit.amount, 0);
    return {
      clientId,
      clientName: clientNames[clientId],
      projectCount: list.length,
      applicableRevenue: makeMoney(revenue, currency),
      deliveryCost: makeMoney(cost, currency),
      // §64 — a fold may be NEGATIVE (a loss is a real number); makeMoney
      // refuses negatives by design, so the rollup uses the signed
      // constructor the per-project rows already use.
      grossProfit: signedMoney(profit, currency),
      marginPercent: revenue === 0 ? null : (profit / revenue) * 100, // §82
    };
  }).sort((a, b) =>
    ((b.applicableRevenue?.amount ?? 0) - (a.applicableRevenue?.amount ?? 0))
    || a.clientId.localeCompare(b.clientId));

  // §81 — portfolio totals. Same single-currency rule as the client rollup:
  // a currency-mixing portfolio reports null money (counts stay real).
  const currencies = new Set(rows.map(r => r.currency));
  const mixedCurrencies = currencies.size > 1;
  let summary: PortfolioProfitabilitySummary;
  if (mixedCurrencies) {
    summary = {
      projectCount: rows.length, mixedCurrencies: true,
      contractValue: null, applicableRevenue: null, deliveryCost: null,
      grossProfit: null, marginPercent: null, billedAmount: null,
      collectedAmount: null, unbilledAmount: null,
    };
  } else {
    const currency = rows.length > 0 ? [...currencies][0] : 'INR';
    const sum = (pick: (r: ProjectProfitability) => number) =>
      rows.reduce((total, r) => total + pick(r), 0);
    const revenue = sum(r => r.applicableRevenue.amount);
    const profit = sum(r => r.grossProfit.amount);
    const contractKnown = rows.filter(r => r.contractValue !== null);
    summary = {
      projectCount: rows.length,
      mixedCurrencies: false,
      // Some projects never negotiated a value — a Σ that ignores them lies,
      // so the total is null unless every project carries one.
      contractValue: contractKnown.length === rows.length && rows.length > 0
        ? makeMoney(sum(r => r.contractValue!.amount), currency)
        : null,
      applicableRevenue: makeMoney(revenue, currency),
      deliveryCost: makeMoney(sum(r => r.deliveryCost.amount), currency),
      // §64 — the portfolio total may be NEGATIVE (a loss is a real number);
      // makeMoney refuses negatives by design, so the summary uses the
      // signed constructor, exactly like the per-project rows.
      grossProfit: signedMoney(profit, currency),
      marginPercent: revenue === 0 ? null : (profit / revenue) * 100, // §82
      billedAmount: makeMoney(sum(r => r.billedAmount.amount), currency),
      collectedAmount: makeMoney(sum(r => r.collectedAmount.amount), currency),
      unbilledAmount: makeMoney(sum(r => r.unbilledAmount.amount), currency),
    };
  }

  return { projects: rows, byClient, summary };
}
