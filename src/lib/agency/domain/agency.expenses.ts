/**
 * Agency Vertical — Domain: expenses service (Module 8, spec §35–§55)
 *
 * The ONLY writer path for expenses. React components never touch MongoDB —
 * they go API route → this service → db.ts.
 *
 * Responsibilities:
 *   - Two-layer architecture (§36): the EXPENSE is operational, the core
 *     TRANSACTION is financial. This service owns the operational record and
 *     the single bridge point between them.
 *   - Billability (§39): type AND flag, validated together. INTERNAL is
 *     never billable; the flag gates BILLABLE/PASS_THROUGH.
 *   - Markup (§43/§44): clientCharge = cost × (1 + markup%) via applyMarkup,
 *     one final rounding. 10000 at 20% → 12000. Recomputed whenever the
 *     amount/markup/billability of an editable expense changes.
 *   - Approval (§40/§21 pattern): DRAFT → SUBMITTED → APPROVED | REJECTED.
 *     The approver tier mirrors Module 7: tenant admins, the project's
 *     manager — and NEVER the expense's own creator, regardless of role.
 *   - Transaction creation (§41/§42): exactly ONE core Transaction per
 *     expense, created at APPROVAL, idempotent via expense.transactionId.
 *     The Expense's id is the logical source id on the Transaction's notes.
 *   - Rejection of an APPROVED expense (admin correction, §20 pattern): the
 *     linked Transaction REMAINS — it is a record of real spend in the core
 *     ledger, and deleting financial history is never the fix. Only the
 *     billing side is withdrawn: clientChargeAmount is nulled and the
 *     expense stops being invoice-eligible. Re-approval re-links (§42 — no
 *     duplicate transaction, because transactionId survived).
 *   - REIMBURSED (§40): a modeled terminal state; NO Phase 1 action drives
 *     it (no reimbursement workflow exists). Documented, not invented.
 *   - Billing (§48/§49): eligibility = APPROVED + billable + UNBILLED; the
 *     billable VALUE is clientChargeAmount, never the raw cost.
 *   - Integrity (§47/§113): a project or client reference must belong to
 *     the tenant — a cross-tenant reference is indistinguishable from a
 *     missing one (identical 404s).
 *   - Audit (§29 pattern): CREATED / UPDATED / SUBMITTED / APPROVED /
 *     REJECTED / INVOICED (the last from Module 9's finalization, via
 *     markExpensesInvoiced below).
 */
import {
  getProjectById, getClientById,
  getExpenses, getExpenseById, createExpense as createExpenseRepo,
  updateExpense as updateExpenseRepo, createTransaction,
  type ExpenseFilters,
} from '@/lib/db';
import type { Expense, ExpenseUpdate } from '../types/expense';
import {
  canTransitionExpenseStatus, editPolicyForExpense, calculateExpenseMarkup,
  isConsistentBillability, isExpenseInvoiceEligible,
} from '../types/expense';
import { makeMoney } from '../types/money';
import { agencyToday } from './agency.settings';
import {
  validateExpenseCreate, validateExpenseUpdate, validateRejectionReason,
} from '../validators/expense';
import { type AuditContext, type DomainResult } from './agency.clients';

const notFound = (what: string): DomainResult<never> =>
  ({ ok: false, status: 404, error: `${what} not found` });

const badRequest = (error: string, code?: string): DomainResult<never> =>
  ({ ok: false, status: 400, error, ...(code && { code }) });

const conflict = (error: string, code?: string): DomainResult<never> =>
  ({ ok: false, status: 409, error, ...(code && { code }) });

const forbidden = (error: string): DomainResult<never> =>
  ({ ok: false, status: 403, error });

/** §33 pattern — a USER edits only their own expenses; admins may correct. */
function mayModifyExpense(expense: Expense, actorUserId: string, role: string): boolean {
  return role === 'SUPER_ADMIN' || role === 'TENANT_ADMIN' || expense.createdBy === actorUserId;
}

/** §21 pattern — approver tier: admins, the project's manager, never the creator. */
function isExpenseApprover(role: string, projectManagerId: string | undefined, actorUserId: string): boolean {
  if (role === 'SUPER_ADMIN' || role === 'TENANT_ADMIN') return true;
  return !!projectManagerId && projectManagerId === actorUserId;
}

// ---------- §47 integrity ----------

export type ExpenseIntegrityResult =
  | { ok: true; clientId?: string }
  | { ok: false; status: 404; error: string };

/**
 * §47 — resolve and validate the expense's context references:
 *   - a projectId must resolve within the tenant;
 *   - a standalone clientId must resolve within the tenant;
 *   - when a project is present, the expense's client IS the project's
 *     client (a payload clientId, if any, must agree);
 *   - §113: every failure is an identical 404 — cross-tenant references are
 *     indistinguishable from missing ones.
 */
export async function verifyExpenseIntegrity(input: {
  tenantId: string;
  projectId?: string;
  clientId?: string;
}): Promise<ExpenseIntegrityResult> {
  if (input.projectId !== undefined) {
    const project = await getProjectById(input.projectId, input.tenantId);
    if (!project) return { ok: false, status: 404, error: 'Project not found' };
    if (input.clientId !== undefined && input.clientId !== project.clientId) {
      return { ok: false, status: 404, error: 'Project not found' };
    }
    return { ok: true, clientId: project.clientId };
  }
  if (input.clientId !== undefined) {
    const client = await getClientById(input.clientId, input.tenantId);
    if (!client) return { ok: false, status: 404, error: 'Client not found' };
  }
  return { ok: true };
}

// ---------- §41/§42 the Transaction bridge ----------

/**
 * §41 — the core financial record is created ONCE, at approval. §42 — the
 * expense's transactionId is the idempotency key: an expense that already
 * carries one NEVER gets a second transaction, no matter how often this
 * runs (approval retry, approval after correction-rejection…).
 *
 * The Transaction shape (Phase 1 decision, mirrors how the money actually
 * moved): type Debit, amount = the expense cost in major units (Money
 * stores 2-dp majors), date = the expense's business date, userId = the
 * expense's creator, accountId unset (no cash-account reconciliation in
 * Phase 1), clientId/projectId carried when present.
 */
export async function createOrLinkExpenseTransaction(
  expense: Expense,
  tenantId: string
): Promise<{ transactionId: string }> {
  if (expense.transactionId) return { transactionId: expense.transactionId };

  const transaction = await createTransaction({
    tenantId,
    userId: expense.createdBy,
    ...(expense.clientId !== undefined && { clientId: expense.clientId }),
    ...(expense.projectId !== undefined && { projectId: expense.projectId }),
    type: 'Debit',
    description: `Expense: ${expense.vendorName}`,
    amount: expense.amount.amount,
    date: expense.expenseDate,
    category: 'Expense',
    notes: `${expense.description} (expense ${expense.id})`,
  });

  return { transactionId: transaction.id! };
}

// ---------- §52 services ----------

/** §43/§44 — pure client-charge computation (re-exported for tests/routes). */
export { calculateExpenseMarkup };

export async function createExpense(
  tenantId: string,
  actor: { userId: string; role: string },
  payload: unknown,
  audit: AuditContext
): Promise<DomainResult<Expense>> {
  // §44 — business-date math anchors to the agency timezone.
  const today = await agencyToday(tenantId);
  const validated = validateExpenseCreate(payload as Record<string, unknown>, today);
  if (!validated.ok) {
    return badRequest(validated.errors.map(e => `${e.field}: ${e.message}`).join('; '));
  }
  const v = validated.value;

  const integrity = await verifyExpenseIntegrity({ tenantId, projectId: v.projectId, clientId: v.clientId });
  if (!integrity.ok) return notFound(integrity.error.replace(' not found', ''));

  const amount = makeMoney(v.amount, v.currency as Expense['amount']['currency']);
  const clientChargeAmount = v.billable
    ? calculateExpenseMarkup(amount, v.markupPercent ?? 0)
    : undefined;

  const created = await createExpenseRepo(tenantId, {
    ...(v.projectId !== undefined && { projectId: v.projectId }),
    ...(integrity.clientId !== undefined && { clientId: integrity.clientId }),
    vendorName: v.vendorName,
    description: v.description,
    amount,
    expenseType: v.expenseType,
    billable: v.billable,
    ...(v.markupPercent !== undefined && { markupPercent: v.markupPercent }),
    ...(clientChargeAmount && { clientChargeAmount }),
    expenseDate: v.expenseDate,
    ...(v.receiptReference !== undefined && { receiptReference: v.receiptReference }),
    ...(v.notes !== undefined && { notes: v.notes }),
    createdBy: actor.userId,
  });

  await audit.log('EXPENSE_CREATED', `Expense ${created.id} recorded: ${v.vendorName} ${amount.amount} ${amount.currency} on ${v.expenseDate}${v.projectId ? ` (project ${v.projectId})` : ' (standalone)'}${v.billable ? ` [billable${v.markupPercent !== undefined ? `, markup ${v.markupPercent}%` : ''}]` : ' [internal]'}`);
  return { ok: true, status: 201, data: created };
}

export async function updateExpense(
  id: string,
  tenantId: string,
  actor: { userId: string; role: string },
  payload: unknown,
  audit: AuditContext
): Promise<DomainResult<Expense>> {
  const existing = await getExpenseById(id, tenantId);
  if (!existing) return notFound('Expense');

  // §33 pattern — ownership.
  if (!mayModifyExpense(existing, actor.userId, actor.role)) {
    return forbidden('You can only modify your own expenses');
  }

  // §22/§41 — the lifecycle decides what is editable.
  const policy = editPolicyForExpense(existing);
  if (policy === 'LOCKED') {
    const reason = existing.billingStatus === 'INVOICED'
      ? 'This expense is invoiced and financially locked'
      : existing.status === 'REIMBURSED'
        ? 'This expense is reimbursed and locked'
        : 'This expense is submitted and awaiting review — ask the approver to reject it first';
    return conflict(reason);
  }

  // §44 — business-date math anchors to the agency timezone.
  const today = await agencyToday(tenantId);
  const validated = validateExpenseUpdate(payload as Record<string, unknown>, today);
  if (!validated.ok) {
    return badRequest(validated.errors.map(e => `${e.field}: ${e.message}`).join('; '));
  }
  const updates = validated.value;

  if (policy === 'NOTES_ONLY') {
    // APPROVED — the Transaction exists; only the descriptive metadata stays
    // correctable (never a silent economic mutation, Rule 6).
    const illegal = Object.keys(updates).filter(k => k !== 'notes' && k !== 'receiptReference');
    if (illegal.length > 0) {
      return badRequest(`An approved expense can only have its notes and receipt reference edited (attempted: ${illegal.join(', ')})`);
    }
  }

  // Merge identity for re-validation of required constraints (PATCH is
  // partial — Module 4/5 lessons).
  const merged = {
    projectId: updates.projectId !== undefined ? updates.projectId : existing.projectId,
    clientId: updates.clientId !== undefined ? updates.clientId : existing.clientId,
    vendorName: updates.vendorName ?? existing.vendorName,
    description: updates.description ?? existing.description,
    amount: updates.amount !== undefined ? updates.amount : existing.amount.amount,
    currency: updates.currency ?? existing.amount.currency,
    expenseType: updates.expenseType ?? existing.expenseType,
    billable: updates.billable !== undefined ? updates.billable : existing.billable,
    markupPercent: 'markupPercent' in updates
      ? (updates.markupPercent ?? undefined)
      : existing.markupPercent,
    expenseDate: updates.expenseDate ?? existing.expenseDate,
  };
  if (!isConsistentBillability(merged.expenseType, merged.billable)) {
    return badRequest('An INTERNAL expense is never billable (§39)');
  }
  if (merged.markupPercent !== undefined && !merged.billable) {
    return badRequest('Markup applies only to billable expenses (§43)');
  }

  const integrity = await verifyExpenseIntegrity({ tenantId, projectId: merged.projectId, clientId: merged.clientId });
  if (!integrity.ok) return notFound(integrity.error.replace(' not found', ''));

  // §20 pattern — editing a REJECTED expense returns it to the editable draft state.
  const statusTransition = existing.status === 'REJECTED' ? { status: 'DRAFT' as const } : {};

  // Recompute the client charge whenever the economics inputs changed
  // (DRAFT/REJECTED only — the policy above guarantees it). Null = the
  // expense stopped being billable → clear the stored charge.
  const economicsChanged = policy === 'FULL' && (
    updates.amount !== undefined
    || updates.currency !== undefined
    || 'markupPercent' in updates
    || updates.billable !== undefined
  );
  const mergedAmount = makeMoney(merged.amount, merged.currency as Expense['amount']['currency']);
  const clientChargeAmount = merged.billable
    ? calculateExpenseMarkup(mergedAmount, merged.markupPercent ?? 0)
    : null;

  // Build the typed write explicitly — the validator's loose shape never
  // reaches the repository directly (currency folds into the Money struct).
  const write: ExpenseUpdate = {};
  if (updates.projectId !== undefined) write.projectId = updates.projectId;
  if (updates.clientId !== undefined) write.clientId = updates.clientId;
  if (updates.vendorName !== undefined) write.vendorName = updates.vendorName;
  if (updates.description !== undefined) write.description = updates.description;
  if (updates.amount !== undefined || updates.currency !== undefined) write.amount = mergedAmount;
  if (updates.expenseType !== undefined) write.expenseType = updates.expenseType;
  if (updates.billable !== undefined) write.billable = updates.billable;
  if ('markupPercent' in updates) write.markupPercent = updates.markupPercent;
  if (updates.expenseDate !== undefined) write.expenseDate = updates.expenseDate;
  if (updates.receiptReference !== undefined) write.receiptReference = updates.receiptReference;
  if (updates.notes !== undefined) write.notes = updates.notes;
  if (economicsChanged) write.clientChargeAmount = clientChargeAmount;
  Object.assign(write, statusTransition);

  const success = await updateExpenseRepo(id, tenantId, write);
  if (!success) return notFound('Expense');

  await audit.log('EXPENSE_UPDATED', `Expense ${id} updated${Object.keys(statusTransition).length > 0 ? ' (rejected draft reworked)' : ''}`);
  const updated = await getExpenseById(id, tenantId);
  return { ok: true, status: 200, data: updated! };
}

export async function submitExpense(
  id: string,
  tenantId: string,
  actor: { userId: string; role: string },
  audit: AuditContext
): Promise<DomainResult<Expense>> {
  const existing = await getExpenseById(id, tenantId);
  if (!existing) return notFound('Expense');

  if (!mayModifyExpense(existing, actor.userId, actor.role)) {
    return forbidden('You can only submit your own expenses');
  }
  if (!canTransitionExpenseStatus(existing.status, 'SUBMITTED')) {
    return conflict(`Cannot submit an expense in ${existing.status} state`);
  }

  const success = await updateExpenseRepo(id, tenantId, { status: 'SUBMITTED' });
  if (!success) return notFound('Expense');
  await audit.log('EXPENSE_SUBMITTED', `Expense ${id} submitted for approval (${existing.vendorName}, ${existing.amount.amount} ${existing.amount.currency} on ${existing.expenseDate})`);
  const updated = await getExpenseById(id, tenantId);
  return { ok: true, status: 200, data: updated! };
}

export async function approveExpense(
  id: string,
  tenantId: string,
  actor: { userId: string; role: string },
  audit: AuditContext
): Promise<DomainResult<Expense>> {
  const existing = await getExpenseById(id, tenantId);
  if (!existing) return notFound('Expense');

  // Tenant admin and super admin have full authority to approve anything without restrictions.
  // Non-admins cannot approve their own expense.
  const isAdmin = actor.role === 'TENANT_ADMIN' || actor.role === 'SUPER_ADMIN';
  if (!isAdmin && existing.createdBy === actor.userId) {
    return forbidden('You cannot approve your own expense');
  }

  const project = existing.projectId !== undefined
    ? await getProjectById(existing.projectId, tenantId)
    : null;
  if (existing.projectId !== undefined && !project) return notFound('Project');
  if (!isAdmin && !isExpenseApprover(actor.role, project?.projectManagerId, actor.userId)) {
    return forbidden('Only the project manager or a workspace admin may approve expenses');
  }

  if (!canTransitionExpenseStatus(existing.status, 'APPROVED')) {
    return conflict(`Cannot approve an expense in ${existing.status} state`);
  }

  // §41/§42 — the approval moment: create the core Transaction exactly once
  // (idempotent via transactionId) and link it.
  const { transactionId } = await createOrLinkExpenseTransaction(existing, tenantId);

  // Re-approval after a correction-rejection: the client charge was
  // withdrawn at rejection — recompute it from the stored inputs (§43).
  const clientChargeAmount = existing.billable
    ? calculateExpenseMarkup(existing.amount, existing.markupPercent ?? 0)
    : null;

  const success = await updateExpenseRepo(id, tenantId, {
    status: 'APPROVED',
    transactionId,
    ...(existing.billable && { clientChargeAmount: clientChargeAmount! }),
    rejectionReason: null,
  });
  if (!success) return notFound('Expense');

  await audit.log('EXPENSE_APPROVED', `Expense ${id} approved; transaction ${transactionId} ${existing.transactionId ? 'already linked (§42 idempotent)' : 'created'}`);
  const updated = await getExpenseById(id, tenantId);
  return { ok: true, status: 200, data: updated! };
}

export async function rejectExpense(
  id: string,
  tenantId: string,
  reason: unknown,
  actor: { userId: string; role: string },
  audit: AuditContext
): Promise<DomainResult<Expense>> {
  const existing = await getExpenseById(id, tenantId);
  if (!existing) return notFound('Expense');

  // Tenant admin and super admin have full authority to reject anything without restrictions.
  // Non-admins cannot reject their own expense.
  const isAdmin = actor.role === 'TENANT_ADMIN' || actor.role === 'SUPER_ADMIN';
  if (!isAdmin && existing.createdBy === actor.userId) {
    return forbidden('You cannot reject your own expense');
  }

  const project = existing.projectId !== undefined
    ? await getProjectById(existing.projectId, tenantId)
    : null;
  if (existing.projectId !== undefined && !project) return notFound('Project');
  if (!isAdmin && !isExpenseApprover(actor.role, project?.projectManagerId, actor.userId)) {
    return forbidden('Only the project manager or a workspace admin may reject expenses');
  }

  if (!canTransitionExpenseStatus(existing.status, 'REJECTED')) {
    return conflict(`Cannot reject an expense in ${existing.status} state`);
  }

  const validatedReason = validateRejectionReason(reason);
  if (!validatedReason.ok) return badRequest(validatedReason.error);

  // Rejecting an APPROVED expense is an admin correction (§20 pattern): the
  // linked Transaction REMAINS (real spend history), but the billing side is
  // withdrawn — clientChargeAmount nulled, billingStatus reset so a later
  // approval starts clean. transactionId survives so §42 still holds.
  const correction = existing.status === 'APPROVED';

  const success = await updateExpenseRepo(id, tenantId, {
    status: 'REJECTED',
    rejectionReason: validatedReason.value,
    ...(correction && { clientChargeAmount: null, billingStatus: 'UNBILLED' }),
  });
  if (!success) return notFound('Expense');

  await audit.log('EXPENSE_REJECTED', `Expense ${id} rejected: ${validatedReason.value}${correction ? ' (correction of an approved expense — billing withdrawn, transaction kept)' : ''}`);
  const updated = await getExpenseById(id, tenantId);
  return { ok: true, status: 200, data: updated! };
}

// ---------- §48/§49/§52 billing queries ----------

/** §52 — all billable expenses (any approval state; the caller filters further). */
export async function getBillableExpenses(
  tenantId: string,
  filters: Omit<ExpenseFilters, 'billable'> = {}
): Promise<Expense[]> {
  return getExpenses(tenantId, { ...filters, billable: true });
}

/** §48/§49 — the invoice-eligible set: APPROVED + billable + UNBILLED. */
export async function getUnbilledExpenses(
  tenantId: string,
  filters: Omit<ExpenseFilters, 'billable' | 'status' | 'billingStatus'> = {}
): Promise<Expense[]> {
  return getExpenses(tenantId, { ...filters, billable: true, status: 'APPROVED', billingStatus: 'UNBILLED' });
}

// ---------- §48/§120 invoice source references ----------

/**
 * §48/§120 — the Module 9 bridge. Invoice finalization calls this to stamp
 * every expense it carries: billingStatus → INVOICED and the invoice id as
 * the lineage link (source reference) the receivables side walks back
 * through. All-or-nothing: the WHOLE batch is verified invoice-eligible
 * before any write, so a partial invoice can never strand half its sources
 * (§133 — a failed finalize leaves everything unbilled, not half-billed).
 *
 * Eligibility is §48 exactly (APPROVED + billable + UNBILLED); an expense
 * that is already invoiced, not yet approved, or internal is a 409 — the
 * caller regenerates its eligible set rather than trusting a stale one.
 */
export async function markExpensesInvoiced(
  tenantId: string,
  expenseIds: unknown,
  invoiceId: unknown,
  audit: AuditContext
): Promise<DomainResult<{ updated: number }>> {
  if (!Array.isArray(expenseIds) || expenseIds.length === 0
    || !expenseIds.every(id => typeof id === 'string' && id.trim() !== '')) {
    return badRequest('expenseIds must be a non-empty array of expense ids');
  }
  if (typeof invoiceId !== 'string' || invoiceId.trim() === '' || invoiceId.length > 200) {
    return badRequest('invoiceId is required');
  }
  const ids = (expenseIds as string[]).map(id => id.trim());
  const invoice = invoiceId.trim();

  // Verify the whole batch FIRST — no partial writes (§133).
  const loaded: Expense[] = [];
  for (const id of ids) {
    // §113 — cross-tenant and missing are identical 404s.
    const expense = await getExpenseById(id, tenantId);
    if (!expense) return notFound('Expense');
    if (expense.billingStatus === 'INVOICED') {
      return conflict(`Expense ${id} is already invoiced${expense.invoiceId ? ` (invoice ${expense.invoiceId})` : ''}`);
    }
    if (!isExpenseInvoiceEligible(expense)) {
      return conflict(`Expense ${id} is not invoice-eligible (needs APPROVED + billable + UNBILLED)`);
    }
    loaded.push(expense);
  }

  for (const expense of loaded) {
    const success = await updateExpenseRepo(expense.id!, tenantId, {
      billingStatus: 'INVOICED',
      invoiceId: invoice,
    });
    if (!success) return notFound('Expense');
    await audit.log('EXPENSE_INVOICED', `Expense ${expense.id} marked invoiced on invoice ${invoice} (${expense.vendorName}, client charge ${expense.clientChargeAmount?.amount ?? 0} ${expense.clientChargeAmount?.currency ?? ''})`);
  }

  return { ok: true, status: 200, data: { updated: loaded.length } };
}

// ---------- views (§53) ----------

/**
 * §53 — the general list. A USER always sees their own expenses (the
 * `createdBy` filter is forced to the actor); admins may list anyone's. The
 * route additionally redacts cost-side fields for non-admin consumers (§99).
 */
export async function listExpenses(
  tenantId: string,
  actor: { userId: string; role: string },
  filters: ExpenseFilters = {}
): Promise<Expense[]> {
  const scoped = actor.role === 'SUPER_ADMIN' || actor.role === 'TENANT_ADMIN'
    ? filters
    : { ...filters, createdBy: actor.userId };
  return getExpenses(tenantId, scoped);
}

export async function getMyExpenses(
  tenantId: string,
  actor: { userId: string; role: string },
  filters: ExpenseFilters = {}
): Promise<Expense[]> {
  return getExpenses(tenantId, { ...filters, createdBy: actor.userId });
}

export async function getProjectExpenses(
  tenantId: string,
  projectId: string,
  filters: ExpenseFilters = {}
): Promise<DomainResult<Expense[]>> {
  const project = await getProjectById(projectId, tenantId);
  if (!project) return notFound('Project');
  const expenses = await getExpenses(tenantId, { ...filters, projectId });
  return { ok: true, status: 200, data: expenses };
}

/** §53/§40 — the approval queue: everything awaiting a decision. */
export async function getExpenseApprovalQueue(
  tenantId: string,
  _actor: { userId: string; role: string },
  filters: ExpenseFilters = {}
): Promise<DomainResult<Expense[]>> {
  // Phase 1: tenant-wide for approvers (§21 authority was enforced at the
  // route's permission gate; per-PM filtering is a UI concern).
  const expenses = await getExpenses(tenantId, { ...filters, status: 'SUBMITTED' });
  return { ok: true, status: 200, data: expenses };
}

/** §113 — single-entity view. Cross-tenant and missing are identical 404s. */
export async function getExpense(
  id: string,
  tenantId: string
): Promise<DomainResult<Expense>> {
  const expense = await getExpenseById(id, tenantId);
  if (!expense) return notFound('Expense');
  return { ok: true, status: 200, data: expense };
}
