/**
 * Agency Vertical — Query: per-project profitability source aggregates (Module 13, §63/§67)
 *
 * Feeds the Module 13 profitability engine (src/lib/agency/profitability/).
 * Follows queries/conventions.ts: aggregation pipelines (never find-then-sum),
 * tenantId first $match, registered compound indexes, $project-minimal,
 * local-JSON fallback with the SAME semantics.
 *
 * All aggregates are per-PROJECT and STATE-BASED (all-time): profitability is
 * a position ("did this project make money?"), not a flow — no date window
 * applies at this layer. The portfolio endpoint's ?from/?to window filters
 * WHICH projects are reported (by startDate), never the money inside them.
 *
 * CURRENCY FRAMING (§127 — never convert): money sums come back grouped per
 * currency; the ENGINE frames each project in the project's own currency,
 * taking that currency's bucket and counting every other bucket as a
 * mismatch (visible in the payload, never silently converted or dropped).
 *
 * "Unbilled" at this layer = not RESERVED and not INVOICED (§67: unbilled is
 * eligible work minus reserved/invoiced work). The $nin form also treats a
 * legacy row with no billingStatus as unbilled, matching the mappers' §106
 * read-default.
 *
 * AGENCY_QUERY_INDEXES registry (see conventions.ts rule 2) — all covered by
 * existing indexes created in connectDb():
 *   time_entries:    { tenantId: 1, projectId: 1, date: -1 }
 *                    { tenantId: 1, approvalStatus: 1, date: -1 }
 *   expenses:        { tenantId: 1, projectId: 1, expenseDate: -1 }
 *                    { tenantId: 1, status: 1, expenseDate: -1 }
 *   invoices:        { tenantId: 1, projectId: 1 }
 *   project_milestones: { tenantId: 1, projectId: 1, sequence: 1 }
 */
import { connectDb, initLocalDb } from '@/lib/db';
import type { InvoiceStatus } from '../types/invoice';

/** §79/§82 of Module 10 — issued invoices: ever numbered, not retired. */
const ISSUED_STATUSES: readonly InvoiceStatus[] = ['SENT', 'PARTIALLY_PAID', 'OVERDUE', 'PAID'];
/** §67 — reserved or invoiced work is NOT unbilled. Shared with the Module 16
 *  unbilled-work report query (queries/unbilled-work.ts) so the report and
 *  the engine can never disagree on the subset (§41). */
export const NOT_UNBILLED: readonly string[] = ['RESERVED', 'INVOICED'];

/** One currency bucket of a money sum (the engine picks the project's frame). */
export interface CurrencyAmount {
  currency: string;
  amount: number;
}

/** Fold pipeline rows (one per {projectId, currency}) into per-currency sums. */
function foldCurrencyRows(
  rows: Array<{ projectId: string | null; currency: string | null; amount: number }>
): Map<string, CurrencyAmount[]> {
  const byProject = new Map<string, CurrencyAmount[]>();
  for (const row of rows) {
    if (!row.projectId || !row.currency) continue; // no project / no money — not frameable
    const list = byProject.get(row.projectId) ?? [];
    const existing = list.find(c => c.currency === row.currency);
    if (existing) existing.amount += row.amount;
    else list.push({ currency: row.currency, amount: row.amount });
    byProject.set(row.projectId, list);
  }
  return byProject;
}

/** The Mongo $match prefix every pipeline shares (tenant first, scope optional). */
function scopeMatch(tenantId: string, projectIds?: readonly string[]): Record<string, unknown> {
  return {
    tenantId,
    ...(projectIds ? { projectId: { $in: [...projectIds] } } : {}),
  };
}

// ---------- §63 time aggregates ----------

/**
 * §63 labor + §62/§67 time value aggregates per project:
 *   approvedMinutes  Σ durationMinutes over APPROVED (actual delivery effort)
 *   laborCost        Σ calculatedCost.amount over APPROVED (§63 — snapshot cost)
 *   billableValue    Σ calculatedBillableAmount over APPROVED + billable, ANY
 *                    billing state (§62 T&M earned revenue — invoiced time is
 *                    still earned)
 *   unbilledTime     the same sum over the §67 unbilled subset
 *   unbilledMinutes  Σ durationMinutes over that same §67 subset (Module 15 —
 *                    the alerts' §96-honest unbilled-time signal: minutes are
 *                    countable even when the value is unpriced)
 *   rateMissingCount APPROVED entries with no calculatedCost (§96 — tracked
 *                    but unpriced; counted so the payload can say so)
 */
export interface ProjectTimeAggregates {
  approvedMinutes: number;
  rateMissingCount: number;
  laborCost: CurrencyAmount[];
  billableValue: CurrencyAmount[];
  unbilledTime: CurrencyAmount[];
  unbilledMinutes: number;
}

/** Raw row shape of the minutes pipelines (local fallback produces the same). */
interface MinutesRow { projectId: string | null; minutes: number; rateMissing: number }
interface UnbilledMinutesRow { projectId: string | null; minutes: number }

export async function getProjectTimeAggregates(
  tenantId: string,
  projectIds?: readonly string[]
): Promise<Map<string, ProjectTimeAggregates>> {
  const { db } = await connectDb();
  if (db) {
    try {
      const base = scopeMatch(tenantId, projectIds);
      const [minutesRows, costRows, valueRows, unbilledRows, unbilledMinutesRows] = await Promise.all([
        db.collection('time_entries').aggregate([
          { $match: { ...base, approvalStatus: 'APPROVED' } },
          { $group: {
            _id: '$projectId',
            minutes: { $sum: '$durationMinutes' },
            rateMissing: { $sum: { $cond: [{ $eq: [{ $ifNull: ['$calculatedCost', null] }, null] }, 1, 0] } },
          } },
          { $project: { _id: 0, projectId: '$_id', minutes: 1, rateMissing: 1 } },
        ]).toArray() as unknown as Promise<MinutesRow[]>,
        db.collection('time_entries').aggregate([
          { $match: { ...base, approvalStatus: 'APPROVED' } },
          { $group: {
            _id: { p: '$projectId', c: '$calculatedCost.currency' },
            amount: { $sum: '$calculatedCost.amount' },
          } },
          { $project: { _id: 0, projectId: '$_id.p', currency: '$_id.c', amount: 1 } },
        ]).toArray() as unknown as Promise<Array<{ projectId: string | null; currency: string | null; amount: number }>>,
        db.collection('time_entries').aggregate([
          { $match: { ...base, approvalStatus: 'APPROVED', billable: true } },
          { $group: {
            _id: { p: '$projectId', c: '$calculatedBillableAmount.currency' },
            amount: { $sum: '$calculatedBillableAmount.amount' },
          } },
          { $project: { _id: 0, projectId: '$_id.p', currency: '$_id.c', amount: 1 } },
        ]).toArray() as unknown as Promise<Array<{ projectId: string | null; currency: string | null; amount: number }>>,
        db.collection('time_entries').aggregate([
          { $match: { ...base, approvalStatus: 'APPROVED', billable: true, billingStatus: { $nin: NOT_UNBILLED } } },
          { $group: {
            _id: { p: '$projectId', c: '$calculatedBillableAmount.currency' },
            amount: { $sum: '$calculatedBillableAmount.amount' },
          } },
          { $project: { _id: 0, projectId: '$_id.p', currency: '$_id.c', amount: 1 } },
        ]).toArray() as unknown as Promise<Array<{ projectId: string | null; currency: string | null; amount: number }>>,
        // Module 15 — §67 unbilled MINUTES: the same subset as unbilledTime,
        // counting duration only. Currency-free by design (§96-honest signal).
        db.collection('time_entries').aggregate([
          { $match: { ...base, approvalStatus: 'APPROVED', billable: true, billingStatus: { $nin: NOT_UNBILLED } } },
          { $group: {
            _id: '$projectId',
            minutes: { $sum: '$durationMinutes' },
          } },
          { $project: { _id: 0, projectId: '$_id', minutes: 1 } },
        ]).toArray() as unknown as Promise<UnbilledMinutesRow[]>,
      ]);
      return assembleTimeAggregates(minutesRows, costRows, valueRows, unbilledRows, unbilledMinutesRows);
    } catch {
      // fall through to the local store
    }
  }
  // Local fallback — same semantics over the JSON store.
  const data = initLocalDb();
  const inScope = (projectId: string) => !projectIds || projectIds.includes(projectId);
  const minutes = new Map<string, { minutes: number; rateMissing: number }>();
  const cost = new Map<string, Map<string, number>>();
  const value = new Map<string, Map<string, number>>();
  const unbilled = new Map<string, Map<string, number>>();
  const unbilledMinutes = new Map<string, number>();
  for (const e of data.timeEntries) {
    if (e.tenantId !== tenantId || e.approvalStatus !== 'APPROVED' || !inScope(e.projectId)) continue;
    const m = minutes.get(e.projectId) ?? { minutes: 0, rateMissing: 0 };
    m.minutes += e.durationMinutes;
    if (!e.calculatedCost) m.rateMissing += 1;
    minutes.set(e.projectId, m);
    if (e.calculatedCost) {
      const byCur = cost.get(e.projectId) ?? new Map<string, number>();
      byCur.set(e.calculatedCost.currency, (byCur.get(e.calculatedCost.currency) ?? 0) + e.calculatedCost.amount);
      cost.set(e.projectId, byCur);
    }
    const isUnbilled = e.billable && !NOT_UNBILLED.includes(e.billingStatus ?? 'UNBILLED');
    // §96-honest: minutes count even when the value is unpriced — the
    // money bucket below still requires calculatedBillableAmount.
    if (isUnbilled) {
      unbilledMinutes.set(e.projectId, (unbilledMinutes.get(e.projectId) ?? 0) + e.durationMinutes);
    }
    if (e.billable && e.calculatedBillableAmount) {
      const byCur = value.get(e.projectId) ?? new Map<string, number>();
      byCur.set(e.calculatedBillableAmount.currency, (byCur.get(e.calculatedBillableAmount.currency) ?? 0) + e.calculatedBillableAmount.amount);
      value.set(e.projectId, byCur);
      if (isUnbilled) {
        const unb = unbilled.get(e.projectId) ?? new Map<string, number>();
        unb.set(e.calculatedBillableAmount.currency, (unb.get(e.calculatedBillableAmount.currency) ?? 0) + e.calculatedBillableAmount.amount);
        unbilled.set(e.projectId, unb);
      }
    }
  }
  const result = new Map<string, ProjectTimeAggregates>();
  const projectIdsSeen = new Set([
    ...cost.keys(), ...value.keys(), ...unbilled.keys(), ...minutes.keys(), ...unbilledMinutes.keys(),
  ]);
  for (const projectId of projectIdsSeen) {
    if (!inScope(projectId)) continue;
    result.set(projectId, {
      approvedMinutes: minutes.get(projectId)?.minutes ?? 0,
      rateMissingCount: minutes.get(projectId)?.rateMissing ?? 0,
      laborCost: [...(cost.get(projectId) ?? new Map())].map(([currency, amount]) => ({ currency, amount })),
      billableValue: [...(value.get(projectId) ?? new Map())].map(([currency, amount]) => ({ currency, amount })),
      unbilledTime: [...(unbilled.get(projectId) ?? new Map())].map(([currency, amount]) => ({ currency, amount })),
      unbilledMinutes: unbilledMinutes.get(projectId) ?? 0,
    });
  }
  return result;
}

/** Fold the five pipeline outputs into the per-project map (pure). */
function assembleTimeAggregates(
  minutesRows: MinutesRow[],
  costRows: Array<{ projectId: string | null; currency: string | null; amount: number }>,
  valueRows: Array<{ projectId: string | null; currency: string | null; amount: number }>,
  unbilledRows: Array<{ projectId: string | null; currency: string | null; amount: number }>,
  unbilledMinutesRows: UnbilledMinutesRow[]
): Map<string, ProjectTimeAggregates> {
  const cost = foldCurrencyRows(costRows);
  const value = foldCurrencyRows(valueRows);
  const unbilled = foldCurrencyRows(unbilledRows);
  const unbilledMinutes = new Map<string, number>();
  for (const row of unbilledMinutesRows) {
    if (!row.projectId) continue;
    unbilledMinutes.set(row.projectId, (unbilledMinutes.get(row.projectId) ?? 0) + row.minutes);
  }
  const projectIds = new Set<string>([
    ...minutesRows.map(r => r.projectId ?? ''),
    ...cost.keys(), ...value.keys(), ...unbilled.keys(), ...unbilledMinutes.keys(),
  ]);
  projectIds.delete('');
  const result = new Map<string, ProjectTimeAggregates>();
  for (const projectId of projectIds) {
    const minutesRow = minutesRows.find(r => r.projectId === projectId);
    result.set(projectId, {
      approvedMinutes: minutesRow?.minutes ?? 0,
      rateMissingCount: minutesRow?.rateMissing ?? 0,
      laborCost: cost.get(projectId) ?? [],
      billableValue: value.get(projectId) ?? [],
      unbilledTime: unbilled.get(projectId) ?? [],
      unbilledMinutes: unbilledMinutes.get(projectId) ?? 0,
    });
  }
  return result;
}

// ---------- §63 expense aggregates ----------

/**
 * §63/§67 expense aggregates per project:
 *   cost            Σ amount over APPROVED (the agency's spend — invoiced or not)
 *   unbilledCharge  Σ clientChargeAmount over APPROVED + billable + unbilled
 */
export interface ProjectExpenseAggregates {
  cost: CurrencyAmount[];
  unbilledCharge: CurrencyAmount[];
}

export async function getProjectExpenseAggregates(
  tenantId: string,
  projectIds?: readonly string[]
): Promise<Map<string, ProjectExpenseAggregates>> {
  const { db } = await connectDb();
  if (db) {
    try {
      const base = scopeMatch(tenantId, projectIds);
      const [costRows, unbilledRows] = await Promise.all([
        db.collection('expenses').aggregate([
          { $match: { ...base, status: 'APPROVED' } },
          { $group: { _id: { p: '$projectId', c: '$amount.currency' }, amount: { $sum: '$amount.amount' } } },
          { $project: { _id: 0, projectId: '$_id.p', currency: '$_id.c', amount: 1 } },
        ]).toArray() as unknown as Promise<Array<{ projectId: string | null; currency: string | null; amount: number }>>,
        db.collection('expenses').aggregate([
          { $match: { ...base, status: 'APPROVED', billable: true, billingStatus: { $nin: NOT_UNBILLED } } },
          { $group: { _id: { p: '$projectId', c: '$clientChargeAmount.currency' }, amount: { $sum: '$clientChargeAmount.amount' } } },
          { $project: { _id: 0, projectId: '$_id.p', currency: '$_id.c', amount: 1 } },
        ]).toArray() as unknown as Promise<Array<{ projectId: string | null; currency: string | null; amount: number }>>,
      ]);
      const cost = foldCurrencyRows(costRows);
      const unbilled = foldCurrencyRows(unbilledRows);
      const projectIdsOut = new Set<string>([...cost.keys(), ...unbilled.keys()]);
      const result = new Map<string, ProjectExpenseAggregates>();
      for (const projectId of projectIdsOut) {
        result.set(projectId, {
          cost: cost.get(projectId) ?? [],
          unbilledCharge: unbilled.get(projectId) ?? [],
        });
      }
      return result;
    } catch {
      // fall through to the local store
    }
  }
  // Local fallback — same semantics over the JSON store.
  const data = initLocalDb();
  const inScope = (projectId: string) => !projectIds || projectIds.includes(projectId);
  const cost = new Map<string, Map<string, number>>();
  const unbilled = new Map<string, Map<string, number>>();
  for (const e of data.expenses) {
    if (e.tenantId !== tenantId || e.status !== 'APPROVED' || !e.projectId || !inScope(e.projectId)) continue;
    const byCur = cost.get(e.projectId) ?? new Map<string, number>();
    byCur.set(e.amount.currency, (byCur.get(e.amount.currency) ?? 0) + e.amount.amount);
    cost.set(e.projectId, byCur);
    if (e.billable && !NOT_UNBILLED.includes(e.billingStatus ?? 'UNBILLED') && e.clientChargeAmount) {
      const unb = unbilled.get(e.projectId) ?? new Map<string, number>();
      unb.set(e.clientChargeAmount.currency, (unb.get(e.clientChargeAmount.currency) ?? 0) + e.clientChargeAmount.amount);
      unbilled.set(e.projectId, unb);
    }
  }
  const result = new Map<string, ProjectExpenseAggregates>();
  for (const projectId of new Set([...cost.keys(), ...unbilled.keys()])) {
    result.set(projectId, {
      cost: [...(cost.get(projectId) ?? new Map())].map(([currency, amount]) => ({ currency, amount })),
      unbilledCharge: [...(unbilled.get(projectId) ?? new Map())].map(([currency, amount]) => ({ currency, amount })),
    });
  }
  return result;
}

// ---------- billed / collected aggregates (§66 — separate dimensions) ----------

/**
 * Billed and collected money per project, over ISSUED invoices (Module 10's
 * §79 set — ever numbered, not DRAFT, not VOID):
 *   billed     Σ invoice.total       — dimension 4
 *   collected  Σ invoice.amountPaid  — dimension 5 (cash, never profit §66)
 */
export interface ProjectInvoiceAggregates {
  invoiceCount: number;
  billed: CurrencyAmount[];
  collected: CurrencyAmount[];
}

export async function getProjectInvoiceAggregates(
  tenantId: string,
  projectIds?: readonly string[]
): Promise<Map<string, ProjectInvoiceAggregates>> {
  const { db } = await connectDb();
  if (db) {
    try {
      const rows = await db.collection('invoices').aggregate([
        { $match: { ...scopeMatch(tenantId, projectIds), status: { $in: ISSUED_STATUSES } } },
        { $group: {
          _id: '$projectId',
          count: { $sum: 1 },
          billedByCurrency: { $push: { k: '$currency', v: '$total.amount' } },
          collectedByCurrency: { $push: { k: '$currency', v: '$amountPaid.amount' } },
        } },
        { $project: { _id: 0, projectId: '$_id', count: 1, billedByCurrency: 1, collectedByCurrency: 1 } },
      ]).toArray() as unknown as Array<{
        projectId: string | null;
        count: number;
        billedByCurrency: Array<{ k: string | null; v: number | null }>;
        collectedByCurrency: Array<{ k: string | null; v: number | null }>;
      }>;
      const result = new Map<string, ProjectInvoiceAggregates>();
      for (const row of rows) {
        if (!row.projectId) continue;
        const billed = new Map<string, number>();
        for (const pair of row.billedByCurrency) {
          if (pair.k) billed.set(pair.k, (billed.get(pair.k) ?? 0) + (pair.v ?? 0));
        }
        const collected = new Map<string, number>();
        for (const pair of row.collectedByCurrency) {
          if (pair.k) collected.set(pair.k, (collected.get(pair.k) ?? 0) + (pair.v ?? 0));
        }
        result.set(row.projectId, {
          invoiceCount: row.count,
          billed: [...billed].map(([currency, amount]) => ({ currency, amount })),
          collected: [...collected].map(([currency, amount]) => ({ currency, amount })),
        });
      }
      return result;
    } catch {
      // fall through to the local store
    }
  }
  // Local fallback — same semantics over the JSON store.
  const data = initLocalDb();
  const inScope = (projectId: string) => !projectIds || projectIds.includes(projectId);
  const rows = new Map<string, { count: number; billed: Map<string, number>; collected: Map<string, number> }>();
  for (const invoice of data.invoices) {
    if (invoice.tenantId !== tenantId || !invoice.projectId || !inScope(invoice.projectId)) continue;
    if (!(ISSUED_STATUSES as readonly string[]).includes(invoice.status)) continue;
    const row = rows.get(invoice.projectId) ?? { count: 0, billed: new Map(), collected: new Map() };
    row.count += 1;
    row.billed.set(invoice.currency, (row.billed.get(invoice.currency) ?? 0) + (invoice.total?.amount ?? 0));
    row.collected.set(invoice.currency, (row.collected.get(invoice.currency) ?? 0) + (invoice.amountPaid?.amount ?? 0));
    rows.set(invoice.projectId, row);
  }
  const result = new Map<string, ProjectInvoiceAggregates>();
  for (const [projectId, row] of rows) {
    result.set(projectId, {
      invoiceCount: row.count,
      billed: [...row.billed].map(([currency, amount]) => ({ currency, amount })),
      collected: [...row.collected].map(([currency, amount]) => ({ currency, amount })),
    });
  }
  return result;
}

// ---------- §62/§67 milestone aggregates ----------

/**
 * Milestone value aggregates per project. Milestone money is denominated in
 * the PROJECT's currency by construction (§113 note in
 * receivables-summary.ts) — no per-currency split needed here; the engine
 * frames the sums in the project currency directly.
 *
 *   completedAmount / completedPercent   §62 MILESTONE earned revenue
 *   unbilledAmount / unbilledPercent     the §67 unbilled subset
 *
 * Percentage milestones are valued percentage × contractValue at the ENGINE
 * (needs the project); a percentage milestone on a project without a
 * contract value is counted, not fabricated (§73 discipline).
 */
export interface ProjectMilestoneAggregates {
  completedCount: number;
  completedAmount: number;
  completedPercent: number;
  /** COMPLETED percentage milestones (the engine values them, or notes the
   *  unvaluable ones when the project has no contract value). */
  completedPercentCount: number;
  unbilledCount: number;
  unbilledAmount: number;
  unbilledPercent: number;
}

/** Raw row shape of the milestone pipeline (the local fallback matches it). */
interface MilestoneRow extends ProjectMilestoneAggregates {
  projectId: string | null;
}

export async function getProjectMilestoneAggregates(
  tenantId: string,
  projectIds?: readonly string[]
): Promise<Map<string, ProjectMilestoneAggregates>> {
  const { db } = await connectDb();
  if (db) {
    try {
      const rows = await db.collection('project_milestones').aggregate([
        { $match: { ...scopeMatch(tenantId, projectIds), status: 'COMPLETED' } },
        { $group: {
          _id: '$projectId',
          completedCount: { $sum: 1 },
          completedAmount: { $sum: { $ifNull: ['$amount', 0] } },
          completedPercent: { $sum: { $ifNull: ['$percentage', 0] } },
          completedPercentCount: { $sum: { $cond: [
            { $and: [
              { $ne: ['$percentage', null] },
              { $eq: [{ $ifNull: ['$amount', null] }, null] },
            ] }, 1, 0,
          ] } },
          unbilledCount: { $sum: { $cond: [{ $not: { $in: ['$billingStatus', NOT_UNBILLED] } }, 1, 0] } },
          unbilledAmount: { $sum: { $cond: [
            { $not: { $in: ['$billingStatus', NOT_UNBILLED] } }, { $ifNull: ['$amount', 0] }, 0,
          ] } },
          unbilledPercent: { $sum: { $cond: [
            { $not: { $in: ['$billingStatus', NOT_UNBILLED] } }, { $ifNull: ['$percentage', 0] }, 0,
          ] } },
        } },
        { $project: { _id: 0, projectId: '$_id', completedCount: 1, completedAmount: 1, completedPercent: 1, completedPercentCount: 1, unbilledCount: 1, unbilledAmount: 1, unbilledPercent: 1 } },
      ]).toArray() as unknown as MilestoneRow[];
      const result = new Map<string, ProjectMilestoneAggregates>();
      for (const row of rows) {
        if (!row.projectId) continue;
        result.set(row.projectId, {
          completedCount: row.completedCount,
          completedAmount: row.completedAmount,
          completedPercent: row.completedPercent,
          completedPercentCount: row.completedPercentCount,
          unbilledCount: row.unbilledCount,
          unbilledAmount: row.unbilledAmount,
          unbilledPercent: row.unbilledPercent,
        });
      }
      return result;
    } catch {
      // fall through to the local store
    }
  }
  // Local fallback — same semantics over the JSON store.
  const data = initLocalDb();
  const inScope = (projectId: string) => !projectIds || projectIds.includes(projectId);
  const result = new Map<string, ProjectMilestoneAggregates>();
  const emptyRow = (): ProjectMilestoneAggregates => ({
    completedCount: 0, completedAmount: 0, completedPercent: 0,
    completedPercentCount: 0, unbilledCount: 0, unbilledAmount: 0, unbilledPercent: 0,
  });
  for (const m of data.projectMilestones) {
    if (m.tenantId !== tenantId || m.status !== 'COMPLETED' || !inScope(m.projectId)) continue;
    const row = result.get(m.projectId) ?? emptyRow();
    row.completedCount += 1;
    const unbilled = !NOT_UNBILLED.includes(m.billingStatus ?? 'UNBILLED');
    if (m.amount !== undefined && m.amount !== null) {
      row.completedAmount += m.amount;
      if (unbilled) row.unbilledAmount += m.amount;
    } else if (m.percentage !== undefined && m.percentage !== null) {
      row.completedPercent += m.percentage;
      row.completedPercentCount += 1;
      if (unbilled) row.unbilledPercent += m.percentage;
    }
    if (unbilled) row.unbilledCount += 1;
    result.set(m.projectId, row);
  }
  return result;
}

// ---------- §78 drill-down breakdowns (one project) ----------

/** §78 — one raw labor line: user × frozen rate × currency. */
export interface LaborBreakdownSource {
  userId: string;
  rateAmount: number | null; // frozen costRateSnapshot.amount; null = unpriced (§96)
  currency: string;          // the cost currency (project frame decided by engine)
  minutes: number;
  cost: number;
  entryCount: number;
}

export async function getProjectLaborBreakdown(
  tenantId: string,
  projectId: string
): Promise<LaborBreakdownSource[]> {
  const { db } = await connectDb();
  if (db) {
    try {
      const rows = await db.collection('time_entries').aggregate([
        { $match: { tenantId, projectId, approvalStatus: 'APPROVED' } },
        { $group: {
          _id: {
            u: '$userId',
            r: { $ifNull: ['$costRateSnapshot.amount', null] },
            c: { $ifNull: ['$calculatedCost.currency', ''] },
          },
          minutes: { $sum: '$durationMinutes' },
          cost: { $sum: { $ifNull: ['$calculatedCost.amount', 0] } },
          count: { $sum: 1 },
        } },
        { $project: { _id: 0, userId: '$_id.u', rateAmount: '$_id.r', currency: '$_id.c', minutes: 1, cost: 1, count: 1 } },
      ]).toArray() as unknown as Array<{
        userId: string; rateAmount: number | null; currency: string;
        minutes: number; cost: number; count: number;
      }>;
      return rows.map(r => ({
        userId: r.userId,
        rateAmount: r.rateAmount,
        currency: r.currency || 'INR',
        minutes: r.minutes,
        cost: r.cost,
        entryCount: r.count,
      }));
    } catch {
      // fall through to the local store
    }
  }
  // Local fallback — same semantics over the JSON store.
  const data = initLocalDb();
  const groups = new Map<string, LaborBreakdownSource>();
  for (const e of data.timeEntries) {
    if (e.tenantId !== tenantId || e.projectId !== projectId || e.approvalStatus !== 'APPROVED') continue;
    const rateAmount = e.costRateSnapshot?.amount ?? null;
    const currency = e.calculatedCost?.currency ?? 'INR';
    const key = `${e.userId}|${rateAmount ?? 'none'}|${currency}`;
    const line = groups.get(key) ?? {
      userId: e.userId, rateAmount, currency, minutes: 0, cost: 0, entryCount: 0,
    };
    line.minutes += e.durationMinutes;
    line.cost += e.calculatedCost?.amount ?? 0;
    line.entryCount += 1;
    groups.set(key, line);
  }
  return [...groups.values()];
}

/** §78 — one raw expense line: vendor × currency. */
export interface ExpenseBreakdownSource {
  vendorName: string;
  currency: string;
  cost: number;
  expenseCount: number;
}

export async function getProjectExpenseBreakdown(
  tenantId: string,
  projectId: string
): Promise<ExpenseBreakdownSource[]> {
  const { db } = await connectDb();
  if (db) {
    try {
      const rows = await db.collection('expenses').aggregate([
        { $match: { tenantId, projectId, status: 'APPROVED' } },
        { $group: {
          _id: { v: '$vendorName', c: '$amount.currency' },
          cost: { $sum: '$amount.amount' },
          count: { $sum: 1 },
        } },
        { $project: { _id: 0, vendorName: '$_id.v', currency: '$_id.c', cost: 1, count: 1 } },
      ]).toArray() as unknown as Array<{
        vendorName: string; currency: string; cost: number; count: number;
      }>;
      return rows.map(r => ({
        vendorName: r.vendorName,
        currency: r.currency || 'INR',
        cost: r.cost,
        expenseCount: r.count,
      }));
    } catch {
      // fall through to the local store
    }
  }
  // Local fallback — same semantics over the JSON store.
  const data = initLocalDb();
  const groups = new Map<string, ExpenseBreakdownSource>();
  for (const e of data.expenses) {
    if (e.tenantId !== tenantId || e.projectId !== projectId || e.status !== 'APPROVED') continue;
    const key = `${e.vendorName}|${e.amount.currency}`;
    const line = groups.get(key) ?? {
      vendorName: e.vendorName, currency: e.amount.currency, cost: 0, expenseCount: 0,
    };
    line.cost += e.amount.amount;
    line.expenseCount += 1;
    groups.set(key, line);
  }
  return [...groups.values()];
}
