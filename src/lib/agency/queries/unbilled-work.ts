/**
 * Agency Vertical — Query: unbilled work by user×project and by project
 * (Module 16, §34)
 *
 * Feeds the Module 16 Unbilled Work report. Follows queries/conventions.ts:
 * aggregation pipelines (never find-then-sum), tenantId first $match,
 * registered compound indexes, $project-minimal, local-JSON fallback with
 * the SAME semantics.
 *
 * THE SUBSET IS THE ENGINE'S (§41 reconciliation): the §67 unbilled set is
 * APPROVED + billable + billingStatus ∉ {RESERVED, INVOICED} — the same
 * NOT_UNBILLED constant queries/profitability-metrics.ts (the Module 13
 * engine's source query) exports. This module never redefines "unbilled".
 *
 * Unbilled is a POSITION (like profitability): no date window applies — the
 * report answers "what earned, billable work has not been invoiced yet",
 * matching the Module 15 alerts' unbilled signals exactly.
 *
 * Money stays currency-grouped (§127): a (user, project) pair whose entries
 * carry two currencies yields two honest rows, never a converted number.
 *
 * AGENCY_QUERY_INDEXES registry (see conventions.ts rule 2) — all covered by
 * existing indexes created in connectDb():
 *   time_entries: { tenantId: 1, approvalStatus: 1, date: -1 }
 *   expenses:     { tenantId: 1, status: 1, expenseDate: -1 }
 *   expenses:     { tenantId: 1, billingStatus: 1 }
 */
import { connectDb, initLocalDb } from '@/lib/db';
import { NOT_UNBILLED } from './profitability-metrics';

/** §34 — one unbilled TIME line: user × project × currency. */
export interface UnbilledTimeRow {
  userId: string;
  projectId: string;
  currency: string;
  /** Σ durationMinutes over the row's unbilled entries (hours derive later). */
  minutes: number;
  /** Σ calculatedBillableAmount over the row's unbilled entries. */
  amount: number;
}

/** §34 — one unbilled EXPENSE line: project × currency (no user — expenses
 *  are incurred by the project, not a person). */
export interface UnbilledExpenseRow {
  projectId: string;
  currency: string;
  /** Σ clientChargeAmount over the project's unbilled approved expenses. */
  amount: number;
}

export async function getUnbilledTimeByUserProject(
  tenantId: string,
  projectIds?: readonly string[]
): Promise<UnbilledTimeRow[]> {
  const { db } = await connectDb();
  if (db) {
    try {
      const rows = await db.collection('time_entries').aggregate([
        {
          $match: {
            tenantId,
            ...(projectIds !== undefined && { projectId: { $in: [...projectIds] } }),
            approvalStatus: 'APPROVED',
            billable: true,
            billingStatus: { $nin: [...NOT_UNBILLED] },
          },
        },
        {
          $group: {
            _id: { u: '$userId', p: '$projectId', c: '$calculatedBillableAmount.currency' },
            minutes: { $sum: '$durationMinutes' },
            amount: { $sum: '$calculatedBillableAmount.amount' },
          },
        },
        { $project: { _id: 0, userId: '$_id.u', projectId: '$_id.p', currency: '$_id.c', minutes: 1, amount: 1 } },
      ]).toArray() as unknown as UnbilledTimeRow[];
      return rows.filter(r => r.currency !== null);
    } catch {
      // fall through to the local store
    }
  }
  // Local fallback — same semantics over the JSON store.
  const data = initLocalDb();
  const groups = new Map<string, UnbilledTimeRow>();
  for (const e of data.timeEntries) {
    if (e.tenantId !== tenantId || e.approvalStatus !== 'APPROVED' || !e.billable) continue;
    if (projectIds !== undefined && !projectIds.includes(e.projectId)) continue;
    if (NOT_UNBILLED.includes(e.billingStatus ?? 'UNBILLED')) continue;
    if (!e.calculatedBillableAmount) continue;
    const key = `${e.userId}|${e.projectId}|${e.calculatedBillableAmount.currency}`;
    const row = groups.get(key) ?? {
      userId: e.userId, projectId: e.projectId,
      currency: e.calculatedBillableAmount.currency, minutes: 0, amount: 0,
    };
    row.minutes += e.durationMinutes;
    row.amount += e.calculatedBillableAmount.amount;
    groups.set(key, row);
  }
  return [...groups.values()];
}

export async function getUnbilledExpensesByProject(
  tenantId: string,
  projectIds?: readonly string[]
): Promise<UnbilledExpenseRow[]> {
  const { db } = await connectDb();
  if (db) {
    try {
      const rows = await db.collection('expenses').aggregate([
        {
          $match: {
            tenantId,
            ...(projectIds !== undefined && { projectId: { $in: [...projectIds] } }),
            status: 'APPROVED',
            billable: true,
            billingStatus: { $nin: [...NOT_UNBILLED] },
          },
        },
        {
          $group: {
            _id: { p: '$projectId', c: '$clientChargeAmount.currency' },
            amount: { $sum: '$clientChargeAmount.amount' },
          },
        },
        { $project: { _id: 0, projectId: '$_id.p', currency: '$_id.c', amount: 1 } },
      ]).toArray() as unknown as UnbilledExpenseRow[];
      return rows.filter(r => r.currency !== null);
    } catch {
      // fall through to the local store
    }
  }
  // Local fallback — same semantics over the JSON store.
  const data = initLocalDb();
  const groups = new Map<string, UnbilledExpenseRow>();
  for (const e of data.expenses) {
    if (e.tenantId !== tenantId || e.status !== 'APPROVED' || !e.billable) continue;
    if (!e.projectId) continue;
    if (projectIds !== undefined && !projectIds.includes(e.projectId)) continue;
    if (NOT_UNBILLED.includes(e.billingStatus ?? 'UNBILLED')) continue;
    if (!e.clientChargeAmount) continue;
    const key = `${e.projectId}|${e.clientChargeAmount.currency}`;
    const row = groups.get(key) ?? {
      projectId: e.projectId, currency: e.clientChargeAmount.currency, amount: 0,
    };
    row.amount += e.clientChargeAmount.amount;
    groups.set(key, row);
  }
  return [...groups.values()];
}
