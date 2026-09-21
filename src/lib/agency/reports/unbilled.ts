/**
 * Agency Vertical — Reports: Unbilled Work report (Module 16, §34)
 *
 * "One of the highest-value Agency reports" — revenue that exists
 * operationally but has not yet become an invoice. It combines:
 *
 *   approved billable unbilled TIME    (per employee × project)
 * + approved billable unbilled EXPENSES (per project)
 *
 * The subset is the ENGINE's §67 definition (NOT_UNBILLED from
 * queries/profitability-metrics.ts) — this report never redefines "unbilled"
 * (§41: it reconciles with Modules 13/15's unbilled signals exactly).
 *
 * Rows: one per (employee × project × currency) for time, plus one per
 * (project × currency) for expenses with employeeId null — every money
 * figure appears exactly once, so Σ rows is the honest total. Sorted by
 * totalUnbilled descending (biggest leakage first).
 *
 * Unbilled is a POSITION (§67): no date window — from/to are rejected by
 * the route, exactly like the money inside a profitability report.
 */
import { getProjects, getUserById, getClientById } from '@/lib/db';
import {
  getUnbilledTimeByUserProject,
  getUnbilledExpensesByProject,
} from '../queries/unbilled-work';
import { hoursFromMinutes } from '../types/time';
import type {
  AgencyReportFilters, ReportPayload, UnbilledReportRow, UnbilledReportSummary,
} from './types';
import { foldCurrency, sumRows } from './summary';
import { slicePage } from './pagination';

/**
 * §34 — the Unbilled Work report.
 *
 * Filters (§28): clientId/projectId scope the projects; userId narrows the
 * TIME rows (expense rows are per project — a userId filter keeps only that
 * user's time rows); currency keeps rows in that currency. from/to/status
 * are not meaningful (position, not flow) and are rejected by the route.
 */
export async function getUnbilledReport(
  tenantId: string,
  filters: AgencyReportFilters,
  page: { limit: number; offset: number }
): Promise<ReportPayload<UnbilledReportRow, UnbilledReportSummary>> {
  // Resolve the client filter into a project scope.
  let projectIds: readonly string[] | undefined;
  if (filters.clientId !== undefined || filters.projectId !== undefined) {
    const projects = await getProjects(tenantId, { page: 1, limit: 1000 }, {
      ...(filters.clientId !== undefined && { clientId: filters.clientId }),
    });
    projectIds = filters.projectId !== undefined
      ? projects.filter(p => p.id === filters.projectId).map(p => p.id)
      : projects.map(p => p.id);
  }

  const [timeRows, expenseRows] = await Promise.all([
    getUnbilledTimeByUserProject(tenantId, projectIds),
    getUnbilledExpensesByProject(tenantId, projectIds),
  ]);

  // Display names, resolved server-side (null when the entity is gone).
  const projects = await getProjects(tenantId, { page: 1, limit: 1000 }, {});
  const projectById = new Map(projects.map(p => [p.id, p]));
  const clientNames = new Map<string, string | null>();
  const clientNameFor = async (clientId: string): Promise<string | null> => {
    if (!clientNames.has(clientId)) {
      const client = await getClientById(clientId, tenantId);
      clientNames.set(clientId, client ? client.name : null);
    }
    return clientNames.get(clientId) ?? null;
  };
  const nameByUser = new Map<string, string | null>();
  for (const row of timeRows) {
    if (!nameByUser.has(row.userId)) {
      const user = await getUserById(row.userId);
      nameByUser.set(row.userId, user ? user.username : null);
    }
  }

  const rows: UnbilledReportRow[] = [];
  for (const t of timeRows) {
    if (filters.userId !== undefined && t.userId !== filters.userId) continue;
    if (filters.currency !== undefined && t.currency !== filters.currency) continue;
    const project = projectById.get(t.projectId);
    rows.push({
      employeeId: t.userId,
      employeeName: nameByUser.get(t.userId) ?? null,
      projectId: t.projectId,
      projectName: project?.name ?? null,
      clientName: project ? await clientNameFor(project.clientId) : null,
      currency: t.currency,
      hours: hoursFromMinutes(t.minutes),
      timeAmount: t.amount,
      expenseAmount: 0,
      totalUnbilled: t.amount,
    });
  }
  for (const e of expenseRows) {
    if (filters.currency !== undefined && e.currency !== filters.currency) continue;
    const project = projectById.get(e.projectId);
    rows.push({
      employeeId: null,
      employeeName: null,
      projectId: e.projectId,
      projectName: project?.name ?? null,
      clientName: project ? await clientNameFor(project.clientId) : null,
      currency: e.currency,
      hours: 0,
      timeAmount: 0,
      expenseAmount: e.amount,
      totalUnbilled: e.amount,
    });
  }

  // Biggest leakage first; stable by project then employee within a tie.
  rows.sort((a, b) =>
    (b.totalUnbilled - a.totalUnbilled)
    || (a.projectName ?? a.projectId).localeCompare(b.projectName ?? b.projectId)
    || (a.employeeName ?? a.employeeId ?? '').localeCompare(b.employeeName ?? b.employeeId ?? ''));

  const fold = foldCurrency(rows);
  const timeTotal = sumRows(rows, r => r.timeAmount);
  const expenseTotal = sumRows(rows, r => r.expenseAmount);
  const summary: UnbilledReportSummary = {
    rowCount: rows.length,
    currency: fold.currency,
    mixedCurrencies: fold.mixedCurrencies,
    totalUnbilledTime: fold.mixedCurrencies ? null : timeTotal,
    totalUnbilledExpense: fold.mixedCurrencies ? null : expenseTotal,
    totalUnbilled: fold.mixedCurrencies ? null : (timeTotal ?? 0) + (expenseTotal ?? 0),
  };

  const { rows: pageRows, pagination } = slicePage(rows, page.limit, page.offset);
  return { rows: pageRows, summary, pagination };
}
