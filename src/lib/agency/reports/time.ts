/**
 * Agency Vertical — Reports: Time report (Module 16, §32/§33)
 *
 * §32 — per-employee hours + utilization. §33 — the basis is EXPLICIT and
 * carried in the payload: FINANCIAL (APPROVED only — the financial truth,
 * what financial/billing views may see) or OPERATIONAL (all recorded time,
 * drafts included, shown separately so unapproved entries can never leak
 * into a financial report). The utilization formula is presentation math
 * over engine minutes (types.ts utilizationPercent): 0% when total = 0,
 * never NaN.
 *
 * This module calculates no money at all — the time report is hours-based.
 */
import { getProjects, getUserById } from '@/lib/db';
import {
  getUserTimeAggregates,
  FINANCIAL_APPROVAL_STATUSES,
  OPERATIONAL_APPROVAL_STATUSES,
} from '../queries/time-user-summary';
import { hoursFromMinutes } from '../types/time';
import type { TimeReportBasis, AgencyReportFilters, ReportPayload, TimeReportRow, TimeReportSummary } from './types';
import { timeRowFromMinutes, utilizationPercent } from './types';
import { slicePage } from './pagination';

function basisStatuses(basis: TimeReportBasis) {
  return basis === 'OPERATIONAL' ? OPERATIONAL_APPROVAL_STATUSES : FINANCIAL_APPROVAL_STATUSES;
}

/**
 * §32 — the Time report. Rows are per employee (Phase 1 grouping); the
 * summary is over ALL filtered rows (never the page).
 *
 * Filters (§28): from/to = the ENTRY-DATE window (inclusive business dates —
 * unlike portfolio, time IS a flow, so the window slices the hours
 * themselves); clientId/projectId scope the projects (time entries carry no
 * client — the scope resolves through the project list); userId narrows to
 * one employee. currency/status are not meaningful (hours are currency-free;
 * the basis is the §33 distinction, not a status filter).
 */
export async function getTimeReport(
  tenantId: string,
  filters: AgencyReportFilters,
  basis: TimeReportBasis,
  page: { limit: number; offset: number }
): Promise<ReportPayload<TimeReportRow, TimeReportSummary> & { basis: TimeReportBasis }> {
  // Resolve the client filter into a project scope (entries have no client).
  let projectIds: readonly string[] | undefined;
  if (filters.clientId !== undefined || filters.projectId !== undefined) {
    const projects = await getProjects(tenantId, { page: 1, limit: 1000 }, {
      ...(filters.clientId !== undefined && { clientId: filters.clientId }),
    });
    projectIds = filters.projectId !== undefined
      ? projects.filter(p => p.id === filters.projectId).map(p => p.id)
      : projects.map(p => p.id);
    // An explicit projectId outside the client's projects (or unknown) is an
    // empty scope — an honest empty report, not a fallback to everything.
  }

  const aggregates = await getUserTimeAggregates(tenantId, {
    ...(filters.from !== undefined && { from: filters.from }),
    ...(filters.to !== undefined && { to: filters.to }),
    ...(filters.userId !== undefined && { userId: filters.userId }),
    ...(projectIds !== undefined && { projectIds }),
    approvalStatuses: basisStatuses(basis),
  });

  // Resolve display names server-side (null when the user is gone).
  const nameByUser = new Map<string, string | null>();
  for (const agg of aggregates) {
    if (!nameByUser.has(agg.userId)) {
      const user = await getUserById(agg.userId);
      nameByUser.set(agg.userId, user ? user.username : null);
    }
  }

  const rows = aggregates.map(a => timeRowFromMinutes(a.userId, nameByUser.get(a.userId) ?? null, a.billableMinutes, a.totalMinutes));
  // Most-utilized first (the operational question is "who is busy"), stable
  // by name within equal utilization.
  rows.sort((a, b) =>
    (b.utilizationPercent - a.utilizationPercent)
    || (a.userName ?? a.userId).localeCompare(b.userName ?? b.userId));

  const billableMinutes = aggregates.reduce((sum, a) => sum + a.billableMinutes, 0);
  const totalMinutes = aggregates.reduce((sum, a) => sum + a.totalMinutes, 0);
  const summary: TimeReportSummary = {
    employeeCount: rows.length,
    billableHours: hoursFromMinutes(billableMinutes),
    totalHours: hoursFromMinutes(totalMinutes),
    utilizationPercent: utilizationPercent(billableMinutes, totalMinutes),
  };

  const { rows: pageRows, pagination } = slicePage(rows, page.limit, page.offset);
  return { basis, rows: pageRows, summary, pagination };
}
