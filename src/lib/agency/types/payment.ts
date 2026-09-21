/**
 * Agency Vertical — Types: payments (Module 10, spec §87–§104)
 *
 * CLIENT-SAFE: types and pure functions only. No server imports.
 *
 * The module's job (§87): the invoice is money OWED; the payment is money
 * RECEIVED. They are never collapsed — a payment references exactly one
 * invoice (§89/§93), and the invoice's payment state is always recomputed
 * from its payments (§104), never hand-edited.
 *
 * The rules encoded here:
 *   §88  Payment shape — amount is the SETTLEMENT value against the invoice;
 *        withholding (TDS §92) is carried separately because cash received
 *        ≠ invoice settlement.
 *   §89  invoiceId is REQUIRED. Advances/credit notes are out of scope
 *        (§163) — a payment always settles receivables, deterministically.
 *   §90  Partial payments are first-class: amount < outstanding is normal.
 *   §91  Overpayment is REJECTED in Phase 1 — the domain returns 400 the
 *        moment a confirmation would push settled past the invoice total.
 *   §92  Withholding/TDS is a SEPARATE Money field. There is no hard-coded
 *        TDS percentage — the agency records what the client actually
 *        withheld. Cash into the account = amount − withholdingAmount.
 *   §93  One payment → one invoice. Multi-invoice allocation is out of
 *        scope (§163); PaymentAllocation arrives in a later phase.
 *   §96  {tenantId, gateway, gatewayPaymentId} is the idempotency boundary
 *        for gateway payments (the webhook replay guard, 10D).
 *   §101 Only CONFIRMED payments touch money. PENDING affects nothing.
 *   §102 PENDING → CONFIRMED | FAILED; CONFIRMED → REVERSED. A FAILED
 *        payment is never "re-paid" — a NEW payment record is created
 *        instead. REVERSED is terminal.
 *   §103 Reversal never deletes: the payment stays in history with status
 *        REVERSED and a compensating Debit transaction returns the cash.
 *   §104 settled = Σ CONFIRMED − Σ REVERSED; amountDue = total − settled.
 *   §107 method is a STRING ENUM used in logic — UI labels are presentation.
 *   §108 accountId is required at CONFIRMATION when confirmed money enters
 *        a tracked account (the domain enforces it there, not at record
 *        time — a payment may be recorded before the bank is known).
 *   §115 reconciliationStatus exists on GATEWAY payments only — manual
 *        payments are reconciled by construction.
 */
import type { Money } from './money';
import type { InvoiceStatus } from './invoice';
import type { WithholdingAdjustment } from './withholding';

// ---------- method (§107) ----------

export type PaymentMethod = 'BANK_TRANSFER' | 'UPI' | 'CASH' | 'CARD' | 'RAZORPAY' | 'OTHER';

export const PAYMENT_METHODS: readonly PaymentMethod[] = [
  'BANK_TRANSFER', 'UPI', 'CASH', 'CARD', 'RAZORPAY', 'OTHER',
] as const;

// ---------- status (§88/§102) ----------

export type PaymentStatus = 'PENDING' | 'CONFIRMED' | 'FAILED' | 'REVERSED';

export const PAYMENT_STATUSES: readonly PaymentStatus[] = [
  'PENDING', 'CONFIRMED', 'FAILED', 'REVERSED',
] as const;

/**
 * §102 — the payment state machine. PENDING is the only entry point (a
 * recorded payment awaits confirmation); FAILED and REVERSED are terminal.
 * There is deliberately NO FAILED→CONFIRMED edge: a failed attempt is
 * history, and the money that eventually arrives is a NEW payment record.
 */
export const PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  PENDING: ['CONFIRMED', 'FAILED'],
  CONFIRMED: ['REVERSED'],
  FAILED: [],
  REVERSED: [],
};

export function canTransitionPaymentStatus(from: PaymentStatus, to: PaymentStatus): boolean {
  return PAYMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

// ---------- reconciliation (§115) ----------

/**
 * §115 — gateway payments carry a reconciliation state: did the gateway's
 * view of the money and ours agree? Manual payments never set this field
 * (they are reconciled by construction — a human confirmed them).
 */
export type PaymentReconciliationStatus = 'RECONCILED' | 'PENDING' | 'ERROR';

// ---------- source (Module 12 §51/§52) ----------

/**
 * §51/§52 — manual and gateway payments are BOTH just Payments; the only
 * difference is where they came from. 'OTHER_GATEWAY' exists so a future
 * Stripe/… adapter slots in without a migration. Stamped at WRITE time
 * (never from a payload), alongside gateway/gatewayPaymentId for lineage.
 */
export type PaymentSource = 'MANUAL' | 'RAZORPAY' | 'OTHER_GATEWAY';

export const PAYMENT_SOURCES: readonly PaymentSource[] = [
  'MANUAL', 'RAZORPAY', 'OTHER_GATEWAY',
] as const;

// ---------- entity (§88) ----------

export interface Payment {
  id: string;
  tenantId: string;
  /** §89 — REQUIRED. One payment settles exactly one invoice (§93). */
  invoiceId: string;
  /** Derived from the invoice at record time — never trusted from a payload (§113). */
  clientId: string;
  /**
   * The SETTLEMENT value against the invoice (§88). With partial payments
   * (§90) this may be less than the outstanding balance; overpayment is
   * rejected at confirmation (§91).
   */
  amount: Money;
  /** §92 — the withheld portion (TDS etc.) of `amount`. Cash into the
   *  account = amount − withholdingAmount. Absent means nothing withheld. */
  withholdingAmount?: Money;
  /** Module 11 §20 — the withholding record (the WHY: type/code/rate/
   *  jurisdiction/reference/notes) alongside the §92 amount. Absent when
   *  nothing was withheld or the agency recorded only the bare amount. */
  withholdingAdjustment?: WithholdingAdjustment;
  receivedAt: string; // YYYY-MM-DD
  method: PaymentMethod;
  /** Bank reference / UTR / cheque number — display + audit trail. */
  reference?: string;
  /** §108 — the account the confirmed money lands in. Required at
   *  confirmation for non-gateway payments. */
  accountId?: string;
  /** §96/§111 — set by the gateway adapter (10D), never by a payload. */
  gateway?: string;
  gatewayPaymentId?: string;
  /**
   * Module 12 §47 — the gateway's id for the LINK the money was collected
   * through (plink_…). Lineage only: one link may legitimately carry several
   * payments (§90 partials), so unlike {gateway, gatewayPaymentId} (§96) it
   * is deliberately NOT a uniqueness boundary.
   */
  gatewayLinkId?: string;
  /** Module 12 §52 — MANUAL | RAZORPAY | OTHER_GATEWAY, stamped at write time. */
  source?: PaymentSource;
  status: PaymentStatus;
  /** §129 — the ONE core Transaction created at confirmation (Credit).
   *  Null only mid-compensation (§114 rollback — the DAL folds it back to
   *  undefined on read). */
  transactionId?: string | null;
  /** §115 — gateway payments only. */
  reconciliationStatus?: PaymentReconciliationStatus;
  notes?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// ---------- update shape ----------

/**
 * The repo write shape. The domain owns status/transactionId/
 * reconciliationStatus — they move only through the lifecycle actions
 * (confirm/fail/reverse), never through a PATCH payload.
 */
export type PaymentUpdate = Partial<Omit<
  Payment,
  'id' | 'tenantId' | 'invoiceId' | 'clientId' | 'amount' | 'withholdingAmount'
  | 'receivedAt' | 'method' | 'source' | 'createdBy' | 'createdAt' | 'updatedAt'
>>;

// ---------- §104 invoice payment-state derivation ----------

/**
 * §104 + §79 — the invoice status a payment-state change implies. This is
 * the ONLY place the mapping lives; the payment domain applies it after
 * recomputing settled money:
 *   - settled ≥ total            → PAID
 *   - 0 < settled < total        → PARTIALLY_PAID
 *   - settled = 0 (a reversal)   → SENT — unless the stored state is
 *     OVERDUE, which stays OVERDUE (§80: past due AND unpaid is still true).
 */
export function paymentDrivenInvoiceStatus(
  current: InvoiceStatus,
  settledAmount: number,
  totalAmount: number
): InvoiceStatus {
  if (totalAmount > 0 && settledAmount >= totalAmount) return 'PAID';
  if (settledAmount > 0) return 'PARTIALLY_PAID';
  return current === 'OVERDUE' ? 'OVERDUE' : 'SENT';
}

/** True when an invoice can RECEIVE a payment (has a number, not retired/full). */
export function invoiceAcceptsPayments(status: InvoiceStatus): boolean {
  return status === 'SENT' || status === 'PARTIALLY_PAID' || status === 'OVERDUE';
}
