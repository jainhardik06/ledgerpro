/**
 * Agency Vertical — Types: expenses (Module 8, spec §37–§50)
 *
 * CLIENT-SAFE: types and pure functions only. No server imports.
 *
 * The two-layer architecture (§36): the EXPENSE is the operational record
 * (who spent what, for whom, under which billing treatment); the core
 * TRANSACTION is the financial record (created once, at approval — §41).
 * This module owns the operational layer's vocabulary.
 *
 * The rules encoded here:
 *   §37  Expense shape — vendorName is a STRING (§46: no Vendor entity in
 *        Phase 1), amount is a Money struct, receiptReference is a string
 *        link/note (§45: no object storage).
 *   §38  ExpenseType INTERNAL | BILLABLE | PASS_THROUGH — the treatment.
 *   §39  Billability is BOTH the type AND the explicit flag: the type is the
 *        default treatment, the flag is the actual billing decision. An
 *        INTERNAL expense is never billable; the flag gates BILLABLE and
 *        PASS_THROUGH.
 *   §40  Approval workflow DRAFT → SUBMITTED → APPROVED | REJECTED.
 *        APPROVED may be rejected as an admin correction (§20 pattern) and
 *        may move to REIMBURSED (terminal, Phase 1: documented, not driven
 *        by an API — no reimbursement workflow exists yet).
 *   §41/§42 The core Transaction is created exactly once, at APPROVAL, and
 *        linked via transactionId — the idempotency key.
 *   §43/§44 clientCharge = cost + cost×markup% via applyMarkup (one final
 *        rounding). 10000 at 20% → 12000.
 *   §48  Invoice eligibility = APPROVED + billable + UNBILLED.
 *   §49  The billable VALUE is clientChargeAmount, never the raw cost.
 */
import { makeMoney, applyMarkup, type Money } from './money';

// ---------- statuses (§40/§50) ----------

export type ExpenseApprovalStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'REIMBURSED';

/** §37/§64 — Module 9 widens the union with RESERVED (draft selection, §63). */
export type ExpenseBillingStatus = 'UNBILLED' | 'RESERVED' | 'INVOICED';

// ---------- expense type (§38) ----------

/**
 * §38 — the billing TREATMENT of the expense:
 *   INTERNAL       agency's own cost, never charged to a client.
 *   BILLABLE       recharged to the client, cost + markup (§43).
 *   PASS_THROUGH   recharged at cost (a 0% markup is the norm; the field
 *                  remains available for exceptions).
 */
export type ExpenseType = 'INTERNAL' | 'BILLABLE' | 'PASS_THROUGH';

// ---------- state machine (§40/§50) ----------

/**
 * §40/§50 lifecycle. REIMBURSED is reachable from APPROVED but no Phase 1
 * API action performs it — it is a modeled, documented terminal state
 * awaiting a reimbursement workflow. INVOICED is not an approval status:
 * billing (§50) is tracked separately via billingStatus, exactly like time.
 */
export const EXPENSE_APPROVAL_TRANSITIONS: Record<ExpenseApprovalStatus, ExpenseApprovalStatus[]> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['APPROVED', 'REJECTED'],
  APPROVED: ['REJECTED', 'REIMBURSED'],
  REJECTED: ['DRAFT'],
  REIMBURSED: [],
};

export function canTransitionExpenseStatus(
  from: ExpenseApprovalStatus,
  to: ExpenseApprovalStatus
): boolean {
  return EXPENSE_APPROVAL_TRANSITIONS[from]?.includes(to) ?? false;
}

// ---------- billability (§39/§48) ----------

/** §48 — an expense is invoice-eligible only when APPROVED, billable AND unbilled. */
export function isExpenseInvoiceEligible(expense: Pick<Expense, 'status' | 'billable' | 'billingStatus'>): boolean {
  return expense.status === 'APPROVED' && expense.billable && expense.billingStatus === 'UNBILLED';
}

// ---------- markup (§43/§44) ----------

export const MAX_MARKUP_PERCENT = 1000;

/**
 * §43 — the client charge for a billable expense: cost × (1 + markup%).
 * §44 — the single final rounding happens inside applyMarkup (half-up,
 * 2 decimals). Pure: usable by the domain, the validators' docs and tests.
 */
export function calculateExpenseMarkup(amount: Money, markupPercent: number): Money {
  return applyMarkup(amount, markupPercent);
}

// ---------- entity (§37) ----------

export interface Expense {
  id: string;
  tenantId: string;
  /** §47 — optional: a standalone expense (no project) may reference a client directly. */
  projectId?: string;
  /** §47 — set from the project when projectId is present; explicit when standalone. */
  clientId?: string;
  /** §46 — a plain string. No Vendor entity exists in Phase 1. */
  vendorName: string;
  description: string;
  /** The agency's cost (what was paid to the vendor). */
  amount: Money;
  /** §38 — the billing treatment. */
  expenseType: ExpenseType;
  /** §39 — the explicit billing decision. Gates §48 eligibility. */
  billable: boolean;
  /** §43 — only meaningful for billable expenses. */
  markupPercent?: number;
  /**
   * §49 — the value the client is charged: amount × (1 + markup%).
   * Present whenever billable; withdrawn (null) on rejection like time's
   * economics (§20 pattern).
   */
  clientChargeAmount?: Money;
  expenseDate: string; // YYYY-MM-DD
  status: ExpenseApprovalStatus;
  billingStatus: ExpenseBillingStatus;
  /** §41/§42 — the linked core Transaction's id. The idempotency key: an id set here means the financial record exists and must NEVER be duplicated. */
  transactionId?: string;
  /** Module 9 fills this at invoice finalization (§50); null while the
   *  INVOICED mark is reverted (§83). */
  invoiceId?: string | null;
  /** §63/§66 — the reservation trail while a draft invoice holds this expense.
   *  Null = cleared (no draft holds it). */
  reservedBy?: string | null;
  reservedAt?: Date | string | null;
  reservedInvoiceId?: string | null;
  /** §45 — a string link/note to the receipt. No object storage in Phase 1. */
  receiptReference?: string;
  rejectionReason?: string;
  notes?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// ---------- edit policy (§22 pattern applied to expenses) ----------

export type ExpenseEditPolicy = 'FULL' | 'NOTES_ONLY' | 'LOCKED';

/**
 * What an update may touch, by lifecycle state (mirrors Module 7 §28):
 *   DRAFT / REJECTED   FULL — the expense is not yet financially material.
 *   SUBMITTED          LOCKED — awaiting review (reject first).
 *   APPROVED           NOTES_ONLY — the Transaction exists (§41); the money
 *                      fields are frozen. Notes and the receipt reference
 *                      (§45, a link, never money) stay correctable.
 *   REIMBURSED / INVOICED-billed  LOCKED — terminal financial states.
 */
export function editPolicyForExpense(expense: Pick<Expense, 'status' | 'billingStatus'>): ExpenseEditPolicy {
  if (expense.billingStatus === 'INVOICED') return 'LOCKED';
  // §63 — held by a draft invoice; economics frozen until released.
  if (expense.billingStatus === 'RESERVED') return 'LOCKED';
  switch (expense.status) {
    case 'DRAFT':
    case 'REJECTED':
      return 'FULL';
    case 'APPROVED':
      return 'NOTES_ONLY';
    default: // SUBMITTED, REIMBURSED
      return 'LOCKED';
  }
}

/** Fields an INVOICED expense never yields to a PATCH (§22 analog). */
export const EXPENSE_INVOICED_LOCKED_FIELDS = [
  'projectId', 'clientId', 'vendorName', 'description', 'amount',
  'expenseType', 'billable', 'markupPercent', 'clientChargeAmount',
  'expenseDate', 'status', 'billingStatus',
] as const;

// ---------- update shape ----------

/**
 * The domain's write shape (mirrors Module 7's TimeEntryUpdate): Partial by
 * construction, and it DOES carry the lifecycle fields (status,
 * billingStatus, transactionId, rejectionReason) — the DOMAIN owns those and
 * is their only writer; validators never produce them (Module 4/5 lessons:
 * an absent key means "leave unchanged"; an explicit null means "clear" for
 * the clearable optionals).
 */
export type ExpenseUpdate = Partial<Omit<
  Expense,
  'id' | 'tenantId' | 'createdBy' | 'createdAt' | 'updatedAt'
  | 'markupPercent' | 'clientChargeAmount' | 'receiptReference' | 'notes'
  | 'rejectionReason' | 'reservedBy' | 'reservedAt' | 'reservedInvoiceId'
>> & {
  markupPercent?: number | null;
  clientChargeAmount?: Money | null;
  receiptReference?: string | null;
  notes?: string | null;
  rejectionReason?: string | null;
  /** §63/§66 — reservation trail; null releases back to UNBILLED. */
  reservedBy?: string | null;
  reservedAt?: Date | string | null;
  reservedInvoiceId?: string | null;
};

// ---------- update payload (what a PATCH request may carry) ----------

/**
 * PATCH payload after validation. Partial by construction (Module 4/5
 * lessons): an absent key means "leave unchanged"; an explicit null (or '')
 * means "clear" for the clearable optionals (markupPercent,
 * receiptReference, notes). Status, billingStatus, clientChargeAmount and
 * transactionId are NEVER PATCHable — they belong to the dedicated actions
 * and §41.
 */
export interface ExpenseUpdatePayload {
  projectId?: string;
  clientId?: string;
  vendorName?: string;
  description?: string;
  amount?: Money;
  expenseType?: ExpenseType;
  billable?: boolean;
  markupPercent?: number | null;
  expenseDate?: string;
  receiptReference?: string | null;
  notes?: string | null;
}

// ---------- cost privacy (§99 pattern) ----------

/**
 * §99 — the expense's amount and markup are the agency's internal cost
 * economics. Non-admin consumers receive the expense with those stripped;
 * clientChargeAmount is client-facing pricing and stays. Mirrors Module 7's
 * redactEntryCost split.
 */
export function redactExpenseCost<T extends Expense>(expense: T): Omit<T, 'amount' | 'markupPercent'> {
  const { amount: _amount, markupPercent: _markupPercent, ...rest } = expense;
  return rest;
}

// ---------- helpers ----------

/** §39 — INTERNAL is never billable; the other types carry the flag. */
export function isConsistentBillability(expenseType: ExpenseType, billable: boolean): boolean {
  if (expenseType === 'INTERNAL') return !billable;
  return true;
}

/** Re-exported for callers that build expense Money values. */
export { makeMoney };
