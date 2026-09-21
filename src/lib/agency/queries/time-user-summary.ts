/**
 * Agency Vertical — Query: per-user time aggregates (Module 16, §32/§33)
 *
 * Feeds the Module 16 Time report. Follows queries/conventions.ts:
 * aggregation pipelines (never find-then-sum), tenantId first $match,
 * registered compound indexes, windowed $match on business dates for
 * reports, $project-minimal, local-JSON fallback with the SAME semantics.
 *
 * §33 — the caller decides the BASIS and this query enforces it:
 *   FINANCIAL    approvalStatus IN ['APPROVED']  — the financial truth;
 *                unapproved entries can never reach a financial view.
 *   OPERATIONAL  all approval states             — everything recorded.
 * The distinction is explicit in the pipeline, never implied by omission.
 *
 * §14 — minutes are the ONLY stored duration; this query sums minutes and
 * the report layer derives hours (types/time.ts hoursFromMinutes).
 *
 * AGENCY_QUERY_INDEXES registry (see conventions.ts rule 2) — all covered by
 * existing indexes created in connectDb():
 *   time_entries: { tenantId: 1, userId: 1, date: 1 }          (user × window)
 *   time_entries: { tenantId: 1, approvalStatus: 1, date: -1 } (financial basis)
 *   time_entries: { tenantId: 1, date: -1 }                    (operational basis)
 */
import { connectDb, initLocalDb } from '@/lib/db';
import type { TimeApprovalStatus } from '../types/time';

/** §33 — the two report bases, as a match set. */
export const FINANCIAL_APPROVAL_STATUSES: readonly TimeApprovalStatus[] = ['APPROVED'];
export const OPERATIONAL_APPROVAL_STATUSES: readonly TimeApprovalStatus[] = [
  'DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED',
];

/** Per-user minute totals (currency-free — the time report is hours-based). */
export interface UserTimeAggregates {
  userId: string;
  /** Σ durationMinutes over the user's billable entries in the basis. */
  billableMinutes: number;
  /** Σ durationMinutes over ALL the user's entries in the basis. */
  totalMinutes: number;
}

/** Optional scope: an entry-date window [from, to] (inclusive business
 *  dates), a single user, and/or a project scope. */
export interface UserTimeQueryOptions {
  from?: string;
  to?: string;
  userId?: string;
  /** Restrict to these projects (the report layer resolves clientId into
   *  the project scope — time entries carry no client field). */
  projectIds?: readonly string[];
  /** §33 basis — which approval states count. Defaults to FINANCIAL. */
  approvalStatuses?: readonly TimeApprovalStatus[];
}

export async function getUserTimeAggregates(
  tenantId: string,
  opts: UserTimeQueryOptions = {}
): Promise<UserTimeAggregates[]> {
  const approvalStatuses = opts.approvalStatuses ?? FINANCIAL_APPROVAL_STATUSES;
  const dateWindow = opts.from !== undefined || opts.to !== undefined
    ? { date: { ...(opts.from !== undefined && { $gte: opts.from }), ...(opts.to !== undefined && { $lte: opts.to }) } }
    : undefined;
  const { db } = await connectDb();
  if (db) {
    try {
      const rows = await db.collection('time_entries').aggregate([
        {
          $match: {
            tenantId,
            ...(opts.userId !== undefined && { userId: opts.userId }),
            ...(opts.projectIds !== undefined && { projectId: { $in: [...opts.projectIds] } }),
            ...(dateWindow !== undefined && dateWindow),
            approvalStatus: { $in: [...approvalStatuses] },
          },
        },
        {
          $group: {
            _id: '$userId',
            billableMinutes: { $sum: { $cond: [{ $eq: ['$billable', true] }, '$durationMinutes', 0] } },
            totalMinutes: { $sum: '$durationMinutes' },
          },
        },
        { $project: { _id: 0, userId: '$_id', billableMinutes: 1, totalMinutes: 1 } },
      ]).toArray() as unknown as UserTimeAggregates[];
      return rows;
    } catch {
      // fall through to the local store
    }
  }
  // Local fallback — same semantics over the JSON store.
  const data = initLocalDb();
  const byUser = new Map<string, UserTimeAggregates>();
  for (const e of data.timeEntries) {
    if (e.tenantId !== tenantId) continue;
    if (opts.userId !== undefined && e.userId !== opts.userId) continue;
    if (opts.projectIds !== undefined && !opts.projectIds.includes(e.projectId)) continue;
    if (opts.from !== undefined && e.date < opts.from) continue;
    if (opts.to !== undefined && e.date > opts.to) continue;
    if (!(approvalStatuses as readonly string[]).includes(e.approvalStatus)) continue;
    const row = byUser.get(e.userId) ?? { userId: e.userId, billableMinutes: 0, totalMinutes: 0 };
    row.totalMinutes += e.durationMinutes;
    if (e.billable) row.billableMinutes += e.durationMinutes;
    byUser.set(e.userId, row);
  }
  return [...byUser.values()];
}
