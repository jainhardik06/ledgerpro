/**
 * Agency Vertical — Validators: expense input (Module 8, spec §37–§47, §51)
 *
 * Reusable, framework-free validation for expense payloads. Pure functions:
 * (input) → { ok, value } | { ok: false, errors } — no NextResponse coupling.
 *
 * The rules (spec §37–§47):
 *   projectId        optional (§47 — a standalone expense is valid); must
 *                    belong to the tenant — domain checks, like time §32.
 *   clientId         optional (§47 — standalone client reference); when a
 *                    projectId is present the domain derives the client from
 *                    the project and a conflicting payload clientId is a 400.
 *   vendorName       required, 1–200 chars (§46 — a string, no Vendor entity)
 *   description      required, 1–2000 chars
 *   amount           required, > 0, finite (a zero-cost expense is not an
 *                    expense); currency defaults to the tenant's default
 *   expenseType      required enum INTERNAL | BILLABLE | PASS_THROUGH (§38)
 *   billable         explicit boolean, required (§39 — never inferred)
 *   markupPercent    optional, ≥ 0 and ≤ MAX_MARKUP_PERCENT; only valid on a
 *                    billable expense (§43)
 *   expenseDate      valid YYYY-MM-DD, required, NOT in the future (an
 *                    expense is money already spent — same stance as time §15)
 *   receiptReference optional, ≤ 500 chars (§45 — a string link/note)
 *   notes            optional, ≤ 2000 chars
 *
 * Module 4/5/7 audit lessons applied here:
 *   - PATCH is PARTIAL: required fields are validated against the ROW's
 *     current value by the domain (which merges identity before calling).
 *   - An explicit empty string MEANS "clear" for the clearable optionals.
 *   - status / billingStatus / clientChargeAmount / transactionId are
 *     NEVER PATCHable — owned by the dedicated actions and §41.
 */
import {
  MAX_MARKUP_PERCENT, isConsistentBillability,
  type ExpenseType, type ExpenseApprovalStatus, type ExpenseBillingStatus,
} from '../types/expense';
import { isBusinessDate } from '../types/dates';

export interface ExpenseFieldError {
  field: string;
  message: string;
}

const MAX_VENDOR = 200;
const MAX_DESCRIPTION = 2000;
const MAX_RECEIPT = 500;
const MAX_NOTES = 2000;
const MAX_AMOUNT = 1_000_000_000_000; // 1e12 — sanity bound, not a business rule.

function str(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t === '' ? undefined : t;
}

/** '' passthrough for CLEARABLE optionals (receiptReference, notes, markup via null) — Module 4 lesson. */
function clearableStr(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  return v.trim();
}

function bounded(v: string | undefined, max: number, field: string, errors: ExpenseFieldError[]): string | undefined {
  if (v === undefined) return undefined;
  if (v.length > max) errors.push({ field, message: `Must be at most ${max} characters` });
  return v;
}

function validateAmount(v: unknown, field: string, errors: ExpenseFieldError[]): number | undefined {
  if (v === undefined || v === null) return undefined;
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n) || n <= 0) {
    errors.push({ field, message: 'Must be a positive amount' });
    return undefined;
  }
  if (n > MAX_AMOUNT) {
    errors.push({ field, message: `Must be at most ${MAX_AMOUNT}` });
    return undefined;
  }
  return n;
}

function validateMarkup(v: unknown, field: string, errors: ExpenseFieldError[]): number | undefined | null {
  // null means "clear the markup" (PATCH only).
  if (v === null) return null;
  if (v === undefined || v === '' ) return undefined;
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < 0) {
    errors.push({ field, message: 'Must be zero or more' });
    return undefined;
  }
  if (n > MAX_MARKUP_PERCENT) {
    errors.push({ field, message: `Must be at most ${MAX_MARKUP_PERCENT}%` });
    return undefined;
  }
  return n;
}

function validateExpenseType(v: unknown, field: string, errors: ExpenseFieldError[]): ExpenseType | undefined {
  if (v === undefined || v === null) return undefined;
  if (v === 'INTERNAL' || v === 'BILLABLE' || v === 'PASS_THROUGH') return v;
  errors.push({ field, message: 'Must be INTERNAL, BILLABLE or PASS_THROUGH' });
  return undefined;
}

function validateBoolean(v: unknown, field: string, errors: ExpenseFieldError[]): boolean | undefined {
  if (v === undefined || v === null) return undefined;
  if (v === true || v === false) return v;
  errors.push({ field, message: 'Must be true or false' });
  return undefined;
}

function validateDate(v: unknown, field: string, today: string, errors: ExpenseFieldError[]): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string' || !isBusinessDate(v)) {
    errors.push({ field, message: 'Must be a valid date (YYYY-MM-DD)' });
    return undefined;
  }
  if (v > today) {
    errors.push({ field, message: 'Cannot be in the future (an expense is money already spent)' });
    return undefined;
  }
  return v;
}

// ---------- create ----------

export interface ExpensePayload {
  projectId?: string;
  clientId?: string;
  vendorName?: string;
  description?: string;
  amount?: number | string;
  currency?: string;
  expenseType?: string;
  billable?: boolean;
  markupPercent?: number | string | null;
  expenseDate?: string;
  receiptReference?: string | null;
  notes?: string | null;
}

export interface ValidatedExpenseCreate {
  projectId?: string;
  clientId?: string;
  vendorName: string;
  description: string;
  amount: number;
  currency: string;
  expenseType: ExpenseType;
  billable: boolean;
  markupPercent?: number;
  expenseDate: string;
  receiptReference?: string;
  notes?: string;
}

export function validateExpenseCreate(
  payload: ExpensePayload,
  today: string
): { ok: true; value: ValidatedExpenseCreate } | { ok: false; errors: ExpenseFieldError[] } {
  const errors: ExpenseFieldError[] = [];

  const projectId = str(payload.projectId);
  const clientId = str(payload.clientId);
  const vendorName = str(payload.vendorName);
  if (!vendorName) errors.push({ field: 'vendorName', message: 'Vendor name is required' });
  else if (vendorName.length > MAX_VENDOR) errors.push({ field: 'vendorName', message: `Must be at most ${MAX_VENDOR} characters` });

  const description = str(payload.description);
  if (!description) errors.push({ field: 'description', message: 'Description is required' });
  else bounded(description, MAX_DESCRIPTION, 'description', errors);

  const amount = validateAmount(payload.amount, 'amount', errors);

  const currency = str(payload.currency)?.toUpperCase() || 'INR';

  const hasType = payload.expenseType !== undefined && payload.expenseType !== null;
  const expenseType = hasType ? validateExpenseType(payload.expenseType, 'expenseType', errors) : undefined;
  if (!hasType) {
    errors.push({ field: 'expenseType', message: 'Expense type is required (INTERNAL, BILLABLE or PASS_THROUGH)' });
  }

  const hasBillable = payload.billable !== undefined && payload.billable !== null;
  const billable = hasBillable ? validateBoolean(payload.billable, 'billable', errors) : undefined;
  if (!hasBillable) {
    errors.push({ field: 'billable', message: 'Billable status is required' });
  }

  const markupPercent = validateMarkup(payload.markupPercent, 'markupPercent', errors);

  const expenseDate = validateDate(payload.expenseDate, 'expenseDate', today, errors);
  if (!expenseDate && !errors.some(e => e.field === 'expenseDate')) {
    errors.push({ field: 'expenseDate', message: 'Expense date is required' });
  }

  const receiptReference = bounded(clearableStr(payload.receiptReference), MAX_RECEIPT, 'receiptReference', errors);
  const notes = bounded(clearableStr(payload.notes), MAX_NOTES, 'notes', errors);

  // Cross-field rules.
  if (expenseType !== undefined && billable !== undefined && !isConsistentBillability(expenseType, billable)) {
    errors.push({ field: 'billable', message: 'An internal expense cannot be marked billable' });
  }
  if (markupPercent !== undefined && markupPercent !== null && billable === false) {
    errors.push({ field: 'markupPercent', message: 'Markup applies only to billable expenses' });
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      ...(projectId && { projectId }),
      ...(clientId && { clientId }),
      vendorName: vendorName!,
      description: description!,
      amount: amount!,
      currency,
      expenseType: expenseType!,
      billable: billable!,
      ...(markupPercent !== undefined && markupPercent !== null && { markupPercent }),
      expenseDate: expenseDate!,
      ...(receiptReference !== undefined && receiptReference !== '' && { receiptReference }),
      ...(notes !== undefined && notes !== '' && { notes }),
    },
  };
}

// ---------- update (PARTIAL — Module 4/5 lessons) ----------

export interface ValidatedExpenseUpdate {
  projectId?: string;
  clientId?: string;
  vendorName?: string;
  description?: string;
  amount?: number;
  currency?: string;
  expenseType?: ExpenseType;
  billable?: boolean;
  markupPercent?: number | null;
  expenseDate?: string;
  receiptReference?: string | null;
  notes?: string | null;
}

export function validateExpenseUpdate(
  payload: ExpensePayload,
  today: string
): { ok: true; value: ValidatedExpenseUpdate } | { ok: false; errors: ExpenseFieldError[] } {
  const errors: ExpenseFieldError[] = [];

  const updates: ValidatedExpenseUpdate = {};

  const projectId = str(payload.projectId);
  if (projectId !== undefined) updates.projectId = projectId;
  const clientId = str(payload.clientId);
  if (clientId !== undefined) updates.clientId = clientId;

  const vendorName = str(payload.vendorName);
  if (vendorName !== undefined) {
    if (vendorName.length > MAX_VENDOR) errors.push({ field: 'vendorName', message: `Must be at most ${MAX_VENDOR} characters` });
    else updates.vendorName = vendorName;
  }

  const description = str(payload.description);
  if (description !== undefined) {
    if (description.length > MAX_DESCRIPTION) errors.push({ field: 'description', message: `Must be at most ${MAX_DESCRIPTION} characters` });
    else updates.description = description;
  }

  const amount = validateAmount(payload.amount, 'amount', errors);
  if (amount !== undefined) updates.amount = amount;

  const currency = str(payload.currency)?.toUpperCase();
  if (currency !== undefined) updates.currency = currency;

  const expenseType = validateExpenseType(payload.expenseType, 'expenseType', errors);
  if (expenseType !== undefined) updates.expenseType = expenseType;

  const billable = validateBoolean(payload.billable, 'billable', errors);
  if (billable !== undefined) updates.billable = billable;

  // markupPercent: null (or '') clears; a number sets.
  if (payload.markupPercent === null || payload.markupPercent === '') updates.markupPercent = null;
  else {
    const markup = validateMarkup(payload.markupPercent, 'markupPercent', errors);
    if (markup !== undefined) updates.markupPercent = markup;
  }

  const expenseDate = validateDate(payload.expenseDate, 'expenseDate', today, errors);
  if (expenseDate !== undefined) updates.expenseDate = expenseDate;

  // Clearable optionals: '' clears (null accepted as clear too).
  if (payload.receiptReference !== undefined) {
    const r = clearableStr(payload.receiptReference);
    if (r !== undefined && r.length > MAX_RECEIPT) errors.push({ field: 'receiptReference', message: `Must be at most ${MAX_RECEIPT} characters` });
    else updates.receiptReference = payload.receiptReference === null ? null : r ?? '';
  }
  if (payload.notes !== undefined) {
    const n = clearableStr(payload.notes);
    if (n !== undefined && n.length > MAX_NOTES) errors.push({ field: 'notes', message: `Must be at most ${MAX_NOTES} characters` });
    else updates.notes = payload.notes === null ? null : n ?? '';
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: updates };
}

// ---------- rejection reason (§40 — mirrors Module 7's validator) ----------

export function validateRejectionReason(
  reason: unknown
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof reason !== 'string' || reason.trim() === '') {
    return { ok: false, error: 'A rejection reason is required' };
  }
  if (reason.trim().length > MAX_NOTES) {
    return { ok: false, error: `Rejection reason must be at most ${MAX_NOTES} characters` };
  }
  return { ok: true, value: reason.trim() };
}

// ---------- list filters (query-string shape) ----------

export interface ValidatedExpenseFilters {
  projectId?: string;
  clientId?: string;
  status?: ExpenseApprovalStatus;
  billingStatus?: ExpenseBillingStatus;
  expenseType?: ExpenseType;
  billable?: boolean;
  createdBy?: string;
  dateFrom?: string;
  dateTo?: string;
  /** §53 — "Expenses by Vendor" report filter. */
  vendor?: string;
}

/** Query params are optional and never fail the request — invalid values are dropped. */
export function validateExpenseFilters(params: Record<string, string | undefined>): ValidatedExpenseFilters {
  const filters: ValidatedExpenseFilters = {};
  const projectId = str(params.projectId);
  if (projectId) filters.projectId = projectId;
  const clientId = str(params.clientId);
  if (clientId) filters.clientId = clientId;
  if (params.status === 'DRAFT' || params.status === 'SUBMITTED' || params.status === 'APPROVED'
    || params.status === 'REJECTED' || params.status === 'REIMBURSED') filters.status = params.status;
  if (params.billingStatus === 'UNBILLED' || params.billingStatus === 'INVOICED') filters.billingStatus = params.billingStatus;
  if (params.expenseType === 'INTERNAL' || params.expenseType === 'BILLABLE' || params.expenseType === 'PASS_THROUGH') filters.expenseType = params.expenseType;
  if (params.billable === 'true') filters.billable = true;
  if (params.billable === 'false') filters.billable = false;
  const createdBy = str(params.createdBy);
  if (createdBy) filters.createdBy = createdBy;
  const vendor = str(params.vendor);
  if (vendor) filters.vendor = vendor;
  if (params.dateFrom && isBusinessDate(params.dateFrom)) filters.dateFrom = params.dateFrom;
  if (params.dateTo && isBusinessDate(params.dateTo)) filters.dateTo = params.dateTo;
  return filters;
}
