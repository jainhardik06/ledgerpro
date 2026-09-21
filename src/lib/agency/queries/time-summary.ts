/**
 * Agency Vertical — Query: time delivery + money summary (Module 7, §117)
 *
 * Wires the Module 7 §135-gated time store into the dashboard contract
 * (definitions §4/§7/§8). Follows queries/conventions.ts: aggregation
 * pipelines (never find-then-sum), tenantId first $match, registered
 * compound indexes, bounded date windows where the metric is windowed,
 * $project-minimal, local-JSON fallback with the SAME semantics.
 *
 * Metrics owned here (single owner per number — Module 1.19):
 *
 *   §8  HoursLogged / BillableHours — Σ durationMinutes over ALL time
 *       entries dated inside the reporting window, regardless of approval
 *       state ("logged" is tracked work, not recognized work). Windowed
 *       (the dashboard period); index { tenantId: 1, date: -1 }.
 *   §4  DeliveryCost (time part) — Σ calculatedCost over APPROVED entries,
 *       all-time (state-based KPI, conventions rule 4). Only APPROVED
 *       entries carry computed economics (§23 computes at approval); §24
 *       blocked entries honestly contribute nothing (they have no cost —
 *       never zero). Rejected entries never entered cost (§4 explicit).
 *       The expense part of §4 (linked Debit transactions) arrives with
 *       Module 8 and extends this number.
 *   §7  UnbilledTime — Σ calculatedBillableAmount over APPROVED + billable
 *       + UNBILLED entries, all-time. RESERVED arrives with Module 9
 *       (§64); today UNBILLED is the only non-invoiced state.
 *
 * Mixed currencies: sums are grouped per currency; when more than one
 * currency carries amounts the total is NULL (money.ts rule — never
 * convert, never fake one number). The route then treats the money side
 * as unresolved and the dashboard shows its pending state.
 */
import { connectDb, initLocalDb } from '@/lib/db';

/**
 * AGENCY_QUERY_INDEXES registry entries (see conventions.ts rule 2):
 *   timeEntries: [
 *     { key: { tenantId: 1, date: -1 }, name: 'agency_time_tenant_date' },            // §8 windowed hours
 *     { key: { tenantId: 1, approvalStatus: 1, date: -1 }, name: 'agency_time_tenant_approval_date' }, // §4/§7 state scans
 *   ]
 */

/** §8 — tracked hours inside the reporting window (minutes; the composer converts). */
export interface DeliveryHoursMetrics {
  /** Σ durationMinutes over all in-window entries (any approval state). */
  totalMinutes: number;
  /** Σ durationMinutes over in-window entries with billable = true. */
  billableMinutes: number;
}

/** §4/§7 — all-time money totals over approved entries (major-unit amounts). */
export interface TimeMoneyMetrics {
  /** Σ calculatedCost over APPROVED entries; null when cost currencies mix. */
  deliveryCost: number | null;
  /** Σ calculatedBillableAmount over APPROVED + billable + UNBILLED; null on mixed. */
  unbilledTime: number | null;
  /** True when >1 currency carried cost amounts (the null above says why). */
  mixedCostCurrencies: boolean;
  /** True when >1 currency carried unbilled amounts. */
  mixedUnbilledCurrencies: boolean;
  /**
   * Module 8 (§119) — the single currency each total is denominated in
   * (null when no amounts / mixed). The dashboard composer refuses to add
   * time money and expense money denominated differently (money.ts rule:
   * never convert) — these fields are how it knows.
   */
  costCurrency: string | null;
  unbilledCurrency: string | null;
}

/** Sum one currency-grouped pipeline result: one row per currency seen. */
function sumGrouped(rows: Array<{ _id: string | null; amount: number }>): { total: number | null; mixed: boolean; currency: string | null } {
  const withAmount = rows.filter(r => r._id && r.amount > 0);
  if (withAmount.length === 0) return { total: 0, mixed: false, currency: null };
  if (withAmount.length > 1) return { total: null, mixed: true, currency: null };
  return { total: withAmount[0].amount, mixed: false, currency: withAmount[0]._id as string };
}

/**
 * §8 — hours inside [from, to] (inclusive business dates). All approval
 * states count as logged; billableMinutes splits by the explicit §17 flag.
 */
export async function getDeliveryHoursMetrics(
  tenantId: string,
  from: string,
  to: string
): Promise<DeliveryHoursMetrics> {
  const { db } = await connectDb();
  if (db) {
    try {
      const pipeline = [
        {
          $match: {
            tenantId,
            date: { $gte: from, $lte: to },
          },
        },
        {
          $group: {
            _id: 0,
            totalMinutes: { $sum: '$durationMinutes' },
            billableMinutes: {
              $sum: { $cond: [{ $eq: ['$billable', true] }, '$durationMinutes', 0] },
            },
          },
        },
        { $project: { _id: 0, totalMinutes: 1, billableMinutes: 1 } },
      ];
      const rows = await db.collection('time_entries').aggregate(pipeline).toArray() as Array<{
        totalMinutes?: number; billableMinutes?: number;
      }>;
      if (rows.length > 0) {
        return {
          totalMinutes: rows[0].totalMinutes ?? 0,
          billableMinutes: rows[0].billableMinutes ?? 0,
        };
      }
      return { totalMinutes: 0, billableMinutes: 0 };
    } catch {
      // fall through to the local store
    }
  }
  const data = initLocalDb();
  let totalMinutes = 0;
  let billableMinutes = 0;
  for (const e of data.timeEntries) {
    if (e.tenantId !== tenantId) continue;
    if (e.date < from || e.date > to) continue;
    totalMinutes += e.durationMinutes;
    if (e.billable) billableMinutes += e.durationMinutes;
  }
  return { totalMinutes, billableMinutes };
}

/**
 * §4/§7 — all-time money totals over approved entries. Currency-grouped so
 * a mixed-currency tenant resolves to null totals (never a converted or
 * fabricated number).
 */
export async function getTimeMoneyMetrics(tenantId: string): Promise<TimeMoneyMetrics> {
  const { db } = await connectDb();
  if (db) {
    try {
      const [costRows, unbilledRows] = await Promise.all([
        db.collection('time_entries').aggregate([
          { $match: { tenantId, approvalStatus: 'APPROVED' } },
          { $group: { _id: '$calculatedCost.currency', amount: { $sum: '$calculatedCost.amount' } } },
          { $project: { _id: 1, amount: 1 } },
        ]).toArray() as unknown as Promise<Array<{ _id: string | null; amount: number }>>,
        db.collection('time_entries').aggregate([
          { $match: { tenantId, approvalStatus: 'APPROVED', billable: true, billingStatus: 'UNBILLED' } },
          { $group: { _id: '$calculatedBillableAmount.currency', amount: { $sum: '$calculatedBillableAmount.amount' } } },
          { $project: { _id: 1, amount: 1 } },
        ]).toArray() as unknown as Promise<Array<{ _id: string | null; amount: number }>>,
      ]);
      const cost = sumGrouped(costRows);
      const unbilled = sumGrouped(unbilledRows);
      return {
        deliveryCost: cost.total,
        unbilledTime: unbilled.total,
        mixedCostCurrencies: cost.mixed,
        mixedUnbilledCurrencies: unbilled.mixed,
        costCurrency: cost.currency,
        unbilledCurrency: unbilled.currency,
      };
    } catch {
      // fall through to the local store
    }
  }
  // Local fallback — same semantics over the JSON store.
  const data = initLocalDb();
  const costByCurrency = new Map<string, number>();
  const unbilledByCurrency = new Map<string, number>();
  for (const e of data.timeEntries) {
    if (e.tenantId !== tenantId || e.approvalStatus !== 'APPROVED') continue;
    if (e.calculatedCost) {
      costByCurrency.set(e.calculatedCost.currency, (costByCurrency.get(e.calculatedCost.currency) ?? 0) + e.calculatedCost.amount);
    }
    if (e.billable && e.billingStatus === 'UNBILLED' && e.calculatedBillableAmount) {
      unbilledByCurrency.set(
        e.calculatedBillableAmount.currency,
        (unbilledByCurrency.get(e.calculatedBillableAmount.currency) ?? 0) + e.calculatedBillableAmount.amount
      );
    }
  }
  const fromMap = (m: Map<string, number>): { total: number | null; mixed: boolean; currency: string | null } => {
    if (m.size === 0) return { total: 0, mixed: false, currency: null };
    if (m.size > 1) return { total: null, mixed: true, currency: null };
    return { total: m.values().next().value ?? 0, mixed: false, currency: [...m.keys()][0] };
  };
  const cost = fromMap(costByCurrency);
  const unbilled = fromMap(unbilledByCurrency);
  return {
    deliveryCost: cost.total,
    unbilledTime: unbilled.total,
    mixedCostCurrencies: cost.mixed,
    mixedUnbilledCurrencies: unbilled.mixed,
    costCurrency: cost.currency,
    unbilledCurrency: unbilled.currency,
  };
}
