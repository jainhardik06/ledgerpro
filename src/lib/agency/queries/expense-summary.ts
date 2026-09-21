/**
 * Agency Vertical — Query: expense money summary (Module 8, §119)
 *
 * Wires the Module 8 expense store into the dashboard money contract
 * (definitions §4/§7). Follows queries/conventions.ts: aggregation
 * pipelines (never find-then-sum), tenantId first $match, registered
 * compound indexes, state-based metrics are all-time, $project-minimal,
 * local-JSON fallback with the SAME semantics.
 *
 * Metrics owned here (single owner per number — Module 1.19):
 *
 *   §4  DeliveryCost (expense part) — Σ amount over APPROVED expenses,
 *       all-time. Approval is when spend becomes real: the §41 Transaction
 *       exists and the §42 one-expense-one-transaction invariant makes this
 *       sum equal to the linked Debit ledger. Invoiced and internal spend
 *       BOTH count — they are costs regardless of who pays them back.
 *       DRAFT/SUBMITTED/REJECTED contribute nothing (no transaction, no
 *       recognized spend).
 *   §7  UnbilledExpenses — Σ clientChargeAmount over APPROVED + billable +
 *       UNBILLED expenses (§48/§49 invoice-eligible set), all-time. The
 *       billable VALUE is the client charge, never the raw cost. Invoiced
 *       expenses never leak in; non-billable and unapproved never had a
 *       charge.
 *
 * Mixed currencies: sums are grouped per currency; when more than one
 * currency carries amounts the total is NULL (money.ts rule — never
 * convert, never fake one number). The composer then leaves the combined
 * money side unresolved and the dashboard shows its pending state. The
 * single-currency total ALSO returns its currency so the composer can
 * refuse to add time money and expense money denominated differently.
 */
import { connectDb, initLocalDb } from '@/lib/db';

/**
 * AGENCY_QUERY_INDEXES registry entries (see conventions.ts rule 2):
 *   expenses: [
 *     { key: { tenantId: 1, status: 1, expenseDate: -1 }, name: 'agency_expense_tenant_status_date' }, // §4/§7 state scans
 *     { key: { tenantId: 1, billingStatus: 1 }, name: 'agency_expense_tenant_billing' },               // §7 invoiced filter
 *   ]
 */

/** One currency-grouped total: null total = mixed currencies (never converted). */
export interface CurrencyTotal {
  /** The sum in major units; null when >1 currency carried amounts. */
  total: number | null;
  /** The single currency the total is denominated in; null when none/mixed. */
  currency: string | null;
  /** True when >1 currency carried amounts (the null above says why). */
  mixed: boolean;
}

/** §4/§7 — all-time expense money totals (major-unit amounts). */
export interface ExpenseMoneyMetrics {
  /** §4 expense part: Σ amount over APPROVED; null when currencies mix. */
  deliveryCost: CurrencyTotal;
  /** §7: Σ clientChargeAmount over APPROVED + billable + UNBILLED; null on mixed. */
  unbilledExpenses: CurrencyTotal;
}

/** Sum one currency-grouped pipeline result: one row per currency seen. */
function sumGrouped(rows: Array<{ _id: string | null; amount: number }>): CurrencyTotal {
  const withAmount = rows.filter(r => r._id && r.amount > 0);
  if (withAmount.length === 0) return { total: 0, currency: null, mixed: false };
  if (withAmount.length > 1) return { total: null, currency: null, mixed: true };
  return { total: withAmount[0].amount, currency: withAmount[0]._id as string, mixed: false };
}

/**
 * §4/§7 — all-time expense money totals. Currency-grouped so a
 * mixed-currency tenant resolves to null totals (never a converted or
 * fabricated number), and single-currency totals carry their currency so
 * the dashboard composer never adds INR to USD.
 */
export async function getExpenseMoneyMetrics(tenantId: string): Promise<ExpenseMoneyMetrics> {
  const { db } = await connectDb();
  if (db) {
    try {
      const [costRows, unbilledRows] = await Promise.all([
        db.collection('expenses').aggregate([
          { $match: { tenantId, status: 'APPROVED' } },
          { $group: { _id: '$amount.currency', amount: { $sum: '$amount.amount' } } },
          { $project: { _id: 1, amount: 1 } },
        ]).toArray() as unknown as Promise<Array<{ _id: string | null; amount: number }>>,
        db.collection('expenses').aggregate([
          { $match: { tenantId, status: 'APPROVED', billable: true, billingStatus: 'UNBILLED' } },
          { $group: { _id: '$clientChargeAmount.currency', amount: { $sum: '$clientChargeAmount.amount' } } },
          { $project: { _id: 1, amount: 1 } },
        ]).toArray() as unknown as Promise<Array<{ _id: string | null; amount: number }>>,
      ]);
      return {
        deliveryCost: sumGrouped(costRows),
        unbilledExpenses: sumGrouped(unbilledRows),
      };
    } catch {
      // fall through to the local store
    }
  }
  // Local fallback — same semantics over the JSON store.
  const data = initLocalDb();
  const costByCurrency = new Map<string, number>();
  const unbilledByCurrency = new Map<string, number>();
  for (const e of data.expenses) {
    if (e.tenantId !== tenantId || e.status !== 'APPROVED') continue;
    // §4 — approved spend is real cost, invoiced or not.
    costByCurrency.set(e.amount.currency, (costByCurrency.get(e.amount.currency) ?? 0) + e.amount.amount);
    // §7 — only the §48 invoice-eligible set carries unbilled value.
    if (e.billable && e.billingStatus === 'UNBILLED' && e.clientChargeAmount) {
      unbilledByCurrency.set(
        e.clientChargeAmount.currency,
        (unbilledByCurrency.get(e.clientChargeAmount.currency) ?? 0) + e.clientChargeAmount.amount
      );
    }
  }
  const fromMap = (m: Map<string, number>): CurrencyTotal => {
    if (m.size === 0) return { total: 0, currency: null, mixed: false };
    if (m.size > 1) return { total: null, currency: null, mixed: true };
    const [currency, amount] = [...m.entries()][0];
    return { total: amount, currency, mixed: false };
  };
  return {
    deliveryCost: fromMap(costByCurrency),
    unbilledExpenses: fromMap(unbilledByCurrency),
  };
}
