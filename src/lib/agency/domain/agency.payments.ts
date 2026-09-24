/**
 * Agency Vertical — Domain: payments service (Module 10, spec §87–§116)
 *
 * The ONLY writer path for payments and payment-driven invoice money. React
 * components never touch MongoDB — they go API route → this service → db.ts.
 *
 * Responsibilities:
 *   - §87 the PAYMENT is money received against money owed (the invoice).
 *     The two records are never collapsed: a payment references exactly one
 *     invoice (§89/§93) and the invoice's payment state is always RECOMPUTED
 *     from its payments through the §104 engine — never hand-edited, never
 *     patched from a payload.
 *   - §88/§90/§92 recording: manual payments land PENDING (§101 — pending
 *     affects nothing). Partial amounts are normal; withholding (TDS) rides
 *     as a SEPARATE Money field — the invoice settles by the full amount
 *     while only (amount − withholding) ever reaches an account. There is
 *     no hard-coded TDS percentage.
 *   - §91 overpayment is REJECTED at confirmation: settled + amount may
 *     never exceed the invoice total (Phase 1 bound; §163 lists credits).
 *   - §94/§95 LEDGER INTEGRATION (10C): confirming a payment creates exactly
 *     ONE core Transaction (Credit) carrying invoiceId + paymentId + clientId
 *     + projectId (§129) — the same entity the rest of Money OS balances
 *     accounts from. There is no separate cash ledger.
 *   - §96/§99 gateway idempotency: {tenantId, gateway, gatewayPaymentId} is
 *     the unique boundary (a partial index in db.ts — the Module 9 lesson).
 *     The webhook flow (10D) resolves entities from stored relationships;
 *     a payload never tells this service who or how much.
 *   - §101 only CONFIRMED payments touch amountPaid / account balances.
 *   - §102 state machine: PENDING→CONFIRMED|FAILED, CONFIRMED→REVERSED.
 *     A FAILED payment is never re-paid — a NEW record is created instead.
 *   - §103 reversal never deletes: the payment stays (REVERSED) and a
 *     compensating Debit returns the cash. History is immutable.
 *   - §104 the centralized balance: amountPaid = Σ CONFIRMED − Σ REVERSED,
 *     amountDue = total − settled, all via payment-calculation.ts (§127 —
 *     the shared engine; never re-derived in routes/UI/reports).
 *   - §108 a confirmed manual payment must enter a TRACKED account: the
 *     confirm action demands an accountId (it may be supplied at record
 *     time or at confirmation).
 *   - §113 tenant integrity: cross-tenant is indistinguishable from missing
 *     (identical 404s). The invoice, account and payment are all verified
 *     against the caller's tenant.
 *   - §114 confirmation is a logically atomic sequence — transaction →
 *     payment CONFIRMED → invoice payment state → audit — with compensating
 *     rollback (the local JSON store has no sessions; the Module 9 §83
 *     pattern): a failure deletes the just-created transaction and reverts
 *     the payment to PENDING. Nothing half-confirmed ever persists.
 *
 * Audit events: PAYMENT_RECORDED / PAYMENT_CONFIRMED / PAYMENT_FAILED /
 * PAYMENT_REVERSED (+ the core transaction description carries the lineage).
 */
import {
  getInvoiceById, updateInvoice as updateInvoiceRepo,
  getPayments, getPaymentById, createPayment as createPaymentRepo,
  updatePayment as updatePaymentRepo,
  getAccountById, createTransaction, deleteTransaction,
  findPaymentByGatewayId,
  type PaymentFilters,
} from '@/lib/db';
import type { Payment, PaymentMethod } from '../types/payment';
import {
  canTransitionPaymentStatus, invoiceAcceptsPayments,
  paymentDrivenInvoiceStatus, PAYMENT_METHODS,
} from '../types/payment';
import type { Invoice } from '../types/invoice';
import { makeMoney } from '../types/money';
import { validatePaymentRecord, validatePaymentReason } from '../validators/payment';
import { agencyToday } from './agency.settings';
import {
  calculatePaymentBalance, wouldOverpay, cashPortionOf,
} from './payment-calculation';
import { type AuditContext, type DomainResult } from './agency.clients';

const notFound = (what: string): DomainResult<never> =>
  ({ ok: false, status: 404, error: `${what} not found` });

const badRequest = (error: string, code?: string): DomainResult<never> =>
  ({ ok: false, status: 400, error, ...(code && { code }) });

const conflict = (error: string, code?: string): DomainResult<never> =>
  ({ ok: false, status: 409, error, ...(code && { code }) });

/** What the acting user contributes to the money trail (§95). */
export interface PaymentActor {
  userId: string;
  role: string;
  username?: string;
}

// ---------- §104 invoice payment state (the shared confirm/reverse tail) ----------

/**
 * Recompute the invoice's payment state from its FULL payment list through
 * the §104 engine and persist it: amountPaid (settled), amountDue, and the
 * §79 status the settled money implies (paymentDrivenInvoiceStatus). This is
 * the ONLY writer of invoice.amountPaid — the invoice domain never touches
 * it and neither does any payload.
 */
async function recomputeInvoicePaymentState(
  invoice: Invoice,
  audit: AuditContext
): Promise<Invoice | null> {
  const payments = await getPayments(invoice.tenantId, { invoiceId: invoice.id! });
  const balance = calculatePaymentBalance(invoice.total, payments);
  const status = paymentDrivenInvoiceStatus(invoice.status, balance.settled.amount, invoice.total.amount);
  const ok = await updateInvoiceRepo(invoice.id!, invoice.tenantId, {
    amountPaid: balance.settled,
    amountDue: balance.amountDue,
    status,
  });
  if (!ok) return null;
  await audit.log(
    'INVOICE_PAYMENT_STATE_RECOMPUTED',
    `Invoice ${invoice.invoiceNumber ?? invoice.id}: settled ${balance.settled.amount} ${balance.settled.currency} of ${invoice.total.amount} — due ${balance.amountDue.amount}, status ${status}`
  );
  return getInvoiceById(invoice.id!, invoice.tenantId);
}

/** The core Transaction description for a confirmed payment (§95 lineage). */
function paymentTransactionDescription(invoice: Invoice, payment: Payment): string {
  return `Payment received — ${invoice.invoiceNumber ?? `invoice ${invoice.id}`}`;
}

// ---------- 10B: record (§88–§92, §107/§108) ----------

/**
 * Record a MANUAL payment against an invoice. The payment lands PENDING —
 * it affects nothing (§101) until confirmPayment. The invoice must already
 * be issued (a DRAFT has no number to settle against, §74; VOID is retired;
 * PAID has nothing outstanding). clientId is DERIVED from the invoice,
 * never trusted from the payload (§113).
 */
export async function recordManualPayment(
  tenantId: string,
  actor: PaymentActor,
  payload: unknown,
  audit: AuditContext
): Promise<DomainResult<Payment>> {
  // §44 — business-date math anchors to the agency timezone.
  const today = await agencyToday(tenantId);
  const validated = validatePaymentRecord(payload as Record<string, unknown>, today);
  if (!validated.ok) {
    return badRequest(validated.errors.map(e => `${e.field}: ${e.message}`).join('; '));
  }
  const v = validated.value;

  // §113 + §89 — the invoice must exist in THIS tenant.
  const invoice = await getInvoiceById(v.invoiceId, tenantId);
  if (!invoice) return notFound('Invoice');
  if (!invoiceAcceptsPayments(invoice.status)) {
    if (invoice.status === 'DRAFT') {
      return conflict('Finalize the invoice before recording a payment — drafts cannot receive payments');
    }
    if (invoice.status === 'PAID') {
      return conflict('The invoice is already fully paid — overpayment is not supported');
    }
    return conflict(`An invoice in state ${invoice.status} cannot receive payments`);
  }

  // Money is never converted across currencies: an explicit foreign currency is a 400.
  if (v.currency !== undefined && v.currency !== invoice.currency) {
    return badRequest(`The payment is denominated in ${v.currency} but the invoice is ${invoice.currency} — currencies are never converted`);
  }

  // 10D — gateway intake (§96): a gateway reference may be recorded exactly
  // once per tenant ({tenantId, gateway, gatewayPaymentId} is the unique
  // idempotency boundary). The Mongo partial index enforces it; this check
  // gives the local JSON store the same guarantee AND a friendly 409 instead
  // of an index error.
  if (v.gatewayPaymentId !== undefined) {
    const existing = await findPaymentByGatewayId('RAZORPAY', v.gatewayPaymentId);
    if (existing) {
      return conflict(
        `A payment with Razorpay reference ${v.gatewayPaymentId} already exists (payment ${existing.id}, §96) — the webhook for it will settle the original record`,
        'GATEWAY_PAYMENT_DUPLICATE'
      );
    }
  }

  const created = await createPaymentRepo(tenantId, {
    invoiceId: invoice.id!,
    clientId: invoice.clientId,
    amount: makeMoney(v.amount, invoice.currency as 'INR'),
    ...(v.withholdingAmount !== undefined
      && { withholdingAmount: makeMoney(v.withholdingAmount, invoice.currency as 'INR') }),
    // Module 11 §20 — the withholding record: the §92 amount welded to its
    // WHY (type/code/rate/jurisdiction/reference/notes). Stored at the
    // settlement layer, never a negative tax line, and invoice.total is
    // never touched by it (§21).
    ...(v.withholdingAmount !== undefined && v.withholdingAdjustment !== undefined && {
      withholdingAdjustment: {
        ...v.withholdingAdjustment,
        amount: makeMoney(v.withholdingAmount, invoice.currency as 'INR'),
        recordedAt: new Date(),
      },
    }),
    receivedAt: v.receivedAt ?? today,
    method: v.method,
    ...(v.reference !== undefined && { reference: v.reference }),
    ...(v.accountId !== undefined && { accountId: v.accountId }),
    // Module 12 §51/§52 — a manual record is source MANUAL by construction;
    // the gateway branch below overrides it when a gateway reference rides along.
    source: 'MANUAL' as const,
    // 10D — gateway identity + §115 reconciliation state: PENDING until the
    // webhook confirms the money (the field never comes from a webhook
    // payload — §113; it is stored HERE, at intake).
    // Module 12 §52 — the source is stamped at WRITE time: a gateway
    // reference makes this a RAZORPAY payment, everything else is MANUAL.
    ...(v.gatewayPaymentId !== undefined && {
      gateway: 'RAZORPAY',
      gatewayPaymentId: v.gatewayPaymentId,
      // Module 12 §47 — the link the money was collected through, when the
      // intake knows it (the webhook link path always does; a 10D manual
      // record may not). Lineage only — not a uniqueness boundary (§90).
      ...(v.gatewayLinkId !== undefined && { gatewayLinkId: v.gatewayLinkId }),
      reconciliationStatus: 'PENDING',
      source: 'RAZORPAY' as const,
    }),
    ...(v.notes !== undefined && { notes: v.notes }),
    createdBy: actor.userId,
  });

  await audit.log(
    'PAYMENT_RECORDED',
    `Payment ${created.id} of ${created.amount.amount} ${created.amount.currency}${created.withholdingAmount ? ` (withholding ${created.withholdingAmount.amount})` : ''} recorded against ${invoice.invoiceNumber ?? `invoice ${invoice.id}`} via ${created.method} — PENDING until confirmed (§101)`
  );

  // §115 — withholding gets its OWN audit event when it occurred: the WHAT
  // (amount), the WHY (the configured rule code — §19, never a hard-coded
  // section) and the §21 guarantee that the invoice total is untouched.
  if (created.withholdingAdjustment && created.withholdingAmount) {
    const wh = created.withholdingAdjustment;
    await audit.log(
      'WITHHOLDING_RECORDED',
      `Withholding ${created.withholdingAmount.amount} ${created.withholdingAmount.currency} (${wh.type}${wh.code ? ` — ${wh.code}` : ''}${wh.rate !== undefined ? ` @ ${wh.rate}%` : ''}${wh.jurisdiction ? `, ${wh.jurisdiction}` : ''}) recorded with payment ${created.id} against ${invoice.invoiceNumber ?? `invoice ${invoice.id}`} — the invoice total is unchanged (§21)`
    );
  }
  return { ok: true, status: 201, data: created };
}

// ---------- 10B/10C: confirmation (§94/§95/§101/§108/§114) ----------

/**
 * THE money-moving action. PENDING → CONFIRMED, as one logically atomic
 * sequence (§114):
 *
 *   1. the payment must be PENDING (§102 — CONFIRMED/FAILED/REVERSED are
 *      terminal-or-later; the state machine IS the §129 no-duplicate-
 *      transaction guard: only PENDING confirms, and only once);
 *   2. the invoice must still accept payments (not voided meanwhile);
 *   3. §108 — a manual payment must name the account it lands in (the
 *      payload may supply it here if it was not supplied at record time);
 *      the account must belong to the tenant (§113 identical-404);
 *   4. §91 — settled + amount may never exceed the invoice total;
 *   5. the core Transaction is created: ONE Credit carrying the cash
 *      (amount − withholding, §92), the invoice/project/client lineage and
 *      the paymentId (§129 — exactly one per confirmed payment);
 *   6. the payment becomes CONFIRMED with transactionId set;
 *   7. the invoice's payment state is recomputed from its full payment
 *      list through the §104 engine (amountPaid/amountDue + §79 status);
 *   8. audit.
 *
 * A failure after step 5 compensates: the transaction is deleted and the
 * payment reverts to PENDING — nothing half-confirmed persists.
 */
export async function confirmPayment(
  paymentId: string,
  tenantId: string,
  actor: PaymentActor,
  options: { accountId?: string } | undefined,
  audit: AuditContext
): Promise<DomainResult<{ payment: Payment; invoice: Invoice; transactionId: string }>> {
  const payment = await getPaymentById(paymentId, tenantId);
  if (!payment) return notFound('Payment');
  if (!canTransitionPaymentStatus(payment.status, 'CONFIRMED')) {
    return conflict(`Only a PENDING payment can be confirmed (current state: ${payment.status} — §102)`);
  }

  const invoice = await getInvoiceById(payment.invoiceId, tenantId);
  if (!invoice) return notFound('Invoice');
  if (!invoiceAcceptsPayments(invoice.status)) {
    return conflict(`The invoice no longer accepts payments (state: ${invoice.status})`);
  }

  // §108 — the account the confirmed money enters. Gateway payments (10D)
  // resolve their account when the gateway record is stored; manual ones
  // must name one now.
  const accountId = options?.accountId ?? payment.accountId;
  if (!payment.gateway && !accountId) {
    return badRequest('A confirmed payment must enter a tracked account (§108) — provide the accountId');
  }
  if (accountId) {
    const account = await getAccountById(accountId, tenantId);
    if (!account) return notFound('Account');
  }

  // §127 + §91 — currency must match the invoice, and the confirmation may
  // not push settled past the total.
  if (payment.amount.currency !== invoice.currency) {
    return badRequest(`The payment is denominated in ${payment.amount.currency} but the invoice is ${invoice.currency} — money is never converted (§127)`);
  }
  const priorPayments = await getPayments(tenantId, { invoiceId: payment.invoiceId });
  const prior = calculatePaymentBalance(invoice.total, priorPayments);
  if (wouldOverpay(invoice.total, prior.settled, payment.amount)) {
    return badRequest(
      `Payment exceeds the outstanding invoice balance — ${prior.settled.amount} of ${invoice.total.amount} ${invoice.currency} is already settled, so at most ${prior.amountDue.amount} remains (§91)`,
      'PAYMENT_EXCEEDS_BALANCE'
    );
  }

  // Step 5 — the ONE core Transaction (§94/§95/§129). Cash in = settlement
  // minus withholding (§92).
  const cash = cashPortionOf(payment);
  const transaction = await createTransaction({
    tenantId,
    userId: actor.userId,
    ...(actor.username !== undefined && { username: actor.username }),
    ...(accountId !== undefined && { accountId }),
    clientId: invoice.clientId,
    ...(invoice.projectId !== undefined && { projectId: invoice.projectId }),
    type: 'Credit',
    description: paymentTransactionDescription(invoice, payment),
    amount: cash.amount,
    date: payment.receivedAt,
    category: 'Payment',
    notes: `Payment ${payment.id} against invoice ${invoice.invoiceNumber ?? invoice.id}${payment.withholdingAmount ? ` — withheld ${payment.withholdingAmount.amount} ${payment.withholdingAmount.currency} (TDS §92)` : ''}`,
    invoiceId: invoice.id!,
    paymentId: payment.id!,
  });

  // Step 6 — CONFIRMED, linked to its transaction. Failure compensates.
  const confirmed = await updatePaymentRepo(paymentId, tenantId, {
    status: 'CONFIRMED',
    transactionId: transaction.id!,
    ...(accountId !== undefined && { accountId }),
    // §115 — gateway payments become reconciled the moment their money is
    // verified into the ledger; manual payments never carry the field.
    ...(payment.gateway !== undefined && { reconciliationStatus: 'RECONCILED' }),
  });
  if (!confirmed) {
    await deleteTransaction(transaction.id!, tenantId).catch(() => undefined);
    return notFound('Payment');
  }

  // Step 7 — the invoice's payment state, from the engine. Failure
  // compensates BOTH later writes (§114).
  const updatedInvoice = await recomputeInvoicePaymentState(invoice, audit);
  if (!updatedInvoice) {
    await updatePaymentRepo(paymentId, tenantId, {
      status: 'PENDING', transactionId: null,
      // §114 — a gateway payment's RECONCILED stamp (step 6) reverts too:
      // a rolled-back confirm is unreconciled by definition.
      ...(payment.gateway !== undefined && { reconciliationStatus: 'PENDING' }),
    }).catch(() => undefined);
    await deleteTransaction(transaction.id!, tenantId).catch(() => undefined);
    return { ok: false, status: 500, error: 'Confirmation failed while updating the invoice balance — everything was rolled back. Try again.' };
  }

  const updatedPayment = await getPaymentById(paymentId, tenantId);
  await audit.log(
    'PAYMENT_CONFIRMED',
    `Payment ${paymentId} of ${payment.amount.amount} ${payment.amount.currency} confirmed against ${invoice.invoiceNumber ?? `invoice ${invoice.id}`} — cash ${cash.amount} into account ${accountId ?? '(gateway)'}; invoice due ${updatedInvoice.amountDue.amount}, status ${updatedInvoice.status}`
  );
  // §115 — the gateway reconciliation event: gateway-collected money is now
  // verified into the ledger (manual payments never carry the gateway field,
  // so they never reconcile by definition).
  if (payment.gateway !== undefined) {
    await audit.log(
      'PAYMENT_RECONCILED',
      `Gateway payment ${paymentId} (${payment.gateway}${payment.gatewayPaymentId !== undefined ? ` ${payment.gatewayPaymentId}` : ''}) of ${payment.amount.amount} ${payment.amount.currency} reconciled against ${invoice.invoiceNumber ?? `invoice ${invoice.id}`} — gateway money verified into the ledger (§115)`
    );
  }
  return {
    ok: true,
    status: 200,
    data: { payment: updatedPayment!, invoice: updatedInvoice, transactionId: transaction.id! },
  };
}

// ---------- 10B: failed (§102) ----------

/**
 * PENDING → FAILED. Touches no money (nothing was ever moved for a PENDING
 * payment, §101). A failed attempt is history: the money that later arrives
 * is a NEW payment record — there is deliberately no FAILED→CONFIRMED edge.
 */
export async function failPayment(
  paymentId: string,
  tenantId: string,
  actor: PaymentActor,
  payload: unknown,
  audit: AuditContext
): Promise<DomainResult<Payment>> {
  const payment = await getPaymentById(paymentId, tenantId);
  if (!payment) return notFound('Payment');
  if (!canTransitionPaymentStatus(payment.status, 'FAILED')) {
    return conflict(`Only a PENDING payment can be marked failed (current state: ${payment.status} — §102)`);
  }

  const validated = validatePaymentReason(payload as Record<string, unknown>);
  if (!validated.ok) {
    return badRequest(validated.errors.map(e => `${e.field}: ${e.message}`).join('; '));
  }

  const ok = await updatePaymentRepo(paymentId, tenantId, { status: 'FAILED' });
  if (!ok) return notFound('Payment');

  const updated = await getPaymentById(paymentId, tenantId);
  await audit.log(
    'PAYMENT_FAILED',
    `Payment ${paymentId} marked FAILED${validated.reason ? ` — ${validated.reason}` : ''} by ${actor.userId}. The money, when it arrives, is recorded as a NEW payment (§102).`
  );
  return { ok: true, status: 200, data: updated! };
}

// ---------- 10B/10C: reversal (§103/§104) ----------

/**
 * CONFIRMED → REVERSED. The payment is NEVER deleted — it stays in history
 * with status REVERSED, and a compensating Debit transaction returns the
 * cash (the same cash that entered: settlement minus withholding, §92) to
 * keep the account balance honest. The invoice's payment state is
 * recomputed: settled drops by the payment's amount (§104) and the status
 * walks back (PAID→PARTIALLY_PAID→SENT — the Module 10 reversal edges on
 * the §79 map; OVERDUE stays OVERDUE, §80).
 */
export async function reversePayment(
  paymentId: string,
  tenantId: string,
  actor: PaymentActor,
  payload: unknown,
  audit: AuditContext
): Promise<DomainResult<{ payment: Payment; invoice: Invoice; transactionId: string }>> {
  const payment = await getPaymentById(paymentId, tenantId);
  if (!payment) return notFound('Payment');
  if (!canTransitionPaymentStatus(payment.status, 'REVERSED')) {
    return conflict(`Only a CONFIRMED payment can be reversed (current state: ${payment.status} — §102)`);
  }

  const validated = validatePaymentReason(payload as Record<string, unknown>);
  if (!validated.ok) {
    return badRequest(validated.errors.map(e => `${e.field}: ${e.message}`).join('; '));
  }

  const invoice = await getInvoiceById(payment.invoiceId, tenantId);
  if (!invoice) return notFound('Invoice');

  // §103 — the compensating Debit: the cash that entered, back out. The
  // ORIGINAL confirm transaction is never touched (history is immutable).
  const cash = cashPortionOf(payment);
  const transaction = await createTransaction({
    tenantId,
    userId: actor.userId,
    ...(actor.username !== undefined && { username: actor.username }),
    ...(payment.accountId !== undefined && { accountId: payment.accountId }),
    clientId: invoice.clientId,
    ...(invoice.projectId !== undefined && { projectId: invoice.projectId }),
    type: 'Debit',
    description: `Payment reversal — ${invoice.invoiceNumber ?? `invoice ${invoice.id}`}`,
    amount: cash.amount,
    date: await agencyToday(tenantId), // §44 — the agency-timezone today
    category: 'Payment',
    notes: `Reversal of payment ${payment.id}${validated.reason ? ` — ${validated.reason}` : ''}`,
    invoiceId: invoice.id!,
    paymentId: payment.id!,
  });

  const reversed = await updatePaymentRepo(paymentId, tenantId, { status: 'REVERSED' });
  if (!reversed) {
    await deleteTransaction(transaction.id!, tenantId).catch(() => undefined);
    return notFound('Payment');
  }

  const updatedInvoice = await recomputeInvoicePaymentState(invoice, audit);
  if (!updatedInvoice) {
    await updatePaymentRepo(paymentId, tenantId, { status: 'CONFIRMED' }).catch(() => undefined);
    await deleteTransaction(transaction.id!, tenantId).catch(() => undefined);
    return { ok: false, status: 500, error: 'Reversal failed while updating the invoice balance — everything was rolled back. Try again.' };
  }

  const updatedPayment = await getPaymentById(paymentId, tenantId);
  await audit.log(
    'PAYMENT_REVERSED',
    `Payment ${paymentId} (${payment.amount.amount} ${payment.amount.currency}) reversed — compensating Debit ${cash.amount}; original confirm transaction ${payment.transactionId ?? '(unlinked)'} kept in history (§103). Invoice due ${updatedInvoice.amountDue.amount}, status ${updatedInvoice.status}`
  );
  return {
    ok: true,
    status: 200,
    data: { payment: updatedPayment!, invoice: updatedInvoice, transactionId: transaction.id! },
  };
}

// ---------- 10F: gateway retry / recovery (§115) ----------

/**
 * Re-drive a gateway payment that a webhook could not finish (the 10F
 * recovery path). Only a PENDING gateway payment qualifies: CONFIRMED is
 * done, FAILED/REVERSED are terminal (§102 — the money that arrives later
 * is a NEW payment record). The retry goes through the NORMAL confirmPayment
 * path — there is no gateway shortcut around §91/§108/§114.
 *
 * On a business rejection the payment's reconciliationStatus becomes ERROR
 * (§115) and the rejection is visible in the reconciliation overview; a
 * transient failure leaves the payment PENDING (the operator retries again).
 */
export async function retryGatewayPayment(
  paymentId: string,
  tenantId: string,
  actor: PaymentActor,
  options: { accountId?: string } | undefined,
  audit: AuditContext
): Promise<DomainResult<{ payment: Payment; invoice: Invoice; transactionId: string }>> {
  const payment = await getPaymentById(paymentId, tenantId);
  if (!payment) return notFound('Payment');
  if (!payment.gateway) {
    return badRequest('Only gateway payments carry a reconciliation state (§115) — manual payments are reconciled by construction');
  }
  if (payment.status !== 'PENDING') {
    return conflict(`Only a PENDING gateway payment can be retried (current state: ${payment.status} — §102)`);
  }

  const result = await confirmPayment(paymentId, tenantId, actor, options, audit);
  if (!result.ok) {
    // §115 — a retry that the domain still refuses keeps the ERROR state
    // (the rejection reason is in the audit trail and the overview).
    if (result.status < 500) {
      await updatePaymentRepo(paymentId, tenantId, { reconciliationStatus: 'ERROR' }).catch(() => undefined);
      await audit.log(
        'PAYMENT_RECONCILIATION_RETRY_REJECTED',
        `Manual reconciliation retry for payment ${paymentId} (gateway ${payment.gateway}/${payment.gatewayPaymentId}) rejected: ${result.error} — reconciliationStatus ERROR (§115)`
      );
    }
    return result;
  }
  await audit.log(
    'PAYMENT_RECONCILIATION_RETRY_SUCCEEDED',
    `Manual reconciliation retry for payment ${paymentId} (gateway ${payment.gateway}/${payment.gatewayPaymentId}) confirmed — reconciliationStatus RECONCILED (§115)`
  );
  return result;
}

// ---------- reads (§116) ----------

export async function listPayments(
  tenantId: string,
  filters: PaymentFilters = {}
): Promise<Payment[]> {
  return getPayments(tenantId, filters);
}

/** One row of the §116 payment-method summary report. */
export interface PaymentMethodSummaryRow {
  method: PaymentMethod;
  /** Every recorded payment of this method (any status — history is history). */
  count: number;
  /**
   * Σ amount over CONFIRMED payments of this method; null when those
   * payments span currencies (§127 — never convert, never fake one number).
   * REVERSED payments left the CONFIRMED set, so they are excluded.
   */
  collected: number | null;
  currency: string | null;
}

/**
 * §116 — Payment Method Summary: per-method volume and collected money over
 * the tenant's FULL payment history (unfiltered — it is a report, not a view
 * over the current list filters). Rows appear in PAYMENT_METHODS order;
 * methods with no payments are omitted.
 */
export async function getPaymentMethodSummary(tenantId: string): Promise<PaymentMethodSummaryRow[]> {
  const payments = await getPayments(tenantId);
  const rows: PaymentMethodSummaryRow[] = [];
  for (const method of PAYMENT_METHODS) {
    const ofMethod = payments.filter(p => p.method === method);
    if (ofMethod.length === 0) continue;
    // §127 — group the CONFIRMED money per currency; a single real total, or
    // null when genuinely mixed. Counts stay real regardless.
    const byCurrency = new Map<string, number>();
    for (const p of ofMethod) {
      if (p.status !== 'CONFIRMED') continue;
      byCurrency.set(p.amount.currency, (byCurrency.get(p.amount.currency) ?? 0) + p.amount.amount);
    }
    const withAmount = [...byCurrency.entries()];
    rows.push({
      method,
      count: ofMethod.length,
      collected: withAmount.length > 1 ? null : (withAmount[0]?.[1] ?? 0),
      currency: withAmount.length > 1 ? null : (withAmount[0]?.[0] ?? null),
    });
  }
  return rows;
}

export async function getPayment(
  id: string,
  tenantId: string
): Promise<DomainResult<{ payment: Payment; invoice: Invoice | null }>> {
  const payment = await getPaymentById(id, tenantId);
  if (!payment) return notFound('Payment');
  const invoice = await getInvoiceById(payment.invoiceId, tenantId);
  return { ok: true, status: 200, data: { payment, invoice } };
}

/** §128 helper — the engine's expected due vs the invoice's stored due. */
export async function paymentConsistency(
  tenantId: string,
  invoiceId: string
): Promise<DomainResult<{ expectedDue: number; storedDue: number; consistent: boolean }>> {
  const invoice = await getInvoiceById(invoiceId, tenantId);
  if (!invoice) return notFound('Invoice');
  const payments = await getPayments(tenantId, { invoiceId });
  const balance = calculatePaymentBalance(invoice.total, payments);
  return {
    ok: true,
    status: 200,
    data: {
      expectedDue: balance.amountDue.amount,
      storedDue: invoice.amountDue.amount,
      consistent: balance.amountDue.amount === invoice.amountDue.amount
        && balance.settled.amount === invoice.amountPaid.amount,
    },
  };
}
