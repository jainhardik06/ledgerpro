/**
 * Agency Vertical — Validators: invoice input (Module 9, spec §57–§76, §81)
 *
 * Reusable, framework-free validation for invoice payloads. Pure functions:
 * (input) → { ok, value } | { ok: false, errors } — no NextResponse coupling.
 *
 * The rules (spec §57–§76):
 *   clientId        required — the invoice bills SOMEONE (§57)
 *   projectId       optional; must belong to the client's tenant and, when
 *                   present, the project's clientId must agree — domain
 *                   checks (§113 identical-404 pattern)
 *   issueDate       valid YYYY-MM-DD, required; NOT in the future beyond
 *                   today (an invoice documents a billing event — a small
 *                   grace is deliberately NOT allowed in Phase 1)
 *   dueDate         valid YYYY-MM-DD, required; ≥ issueDate
 *   currency        required ISO-4217-style 3 letters (uppercase)
 *   discountAmount  optional, ≥ 0 (the engine bounds it ≤ subtotal)
 *   notes/terms     optional, ≤ 2000 chars each
 *   taxes           optional array of { name, code?, rate } — §76 lines;
 *                   rate 0–100 (engine re-checks)
 *
 * Line rules (§59/§60/§70/§71):
 *   type            required enum TIME|EXPENSE|MILESTONE|FIXED_FEE|MANUAL
 *   description     required, 1–500 chars
 *   sourceId        REQUIRED for TIME/EXPENSE/MILESTONE (§60 traceability);
 *                   forbidden (ignored) for FIXED_FEE/MANUAL
 *   amount          required for MANUAL/FIXED_FEE (free-form value);
 *                   computed+validated by the domain for source-backed types
 *   quantity/unitPrice  optional; both or neither (§59 — they price together)
 *
 * Module 4/5/7/8 audit lessons applied here:
 *   - PATCH is PARTIAL: required fields are validated against the ROW's
 *     current value by the domain (which merges identity before calling).
 *   - An explicit empty string MEANS "clear" for the clearable optionals.
 *   - status / invoiceNumber / money fields are NEVER PATCHable — owned by
 *     the engine and the lifecycle actions (§74/§78).
 */
import {
  INVOICE_LINE_TYPES, isSourceBackedLineType,
  type InvoiceLineType, type InvoiceStatus,
} from '../types/invoice';
import { isBusinessDate } from '../types/dates';

export interface InvoiceFieldError {
  field: string;
  message: string;
}

const MAX_DESCRIPTION = 500;
const MAX_NOTES = 2000;
const MAX_TERMS = 2000;
const MAX_AMOUNT = 1_000_000_000_000; // 1e12 — sanity bound, not a business rule.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function str(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t === '' ? undefined : t;
}

/** '' passthrough for CLEARABLE optionals (notes, terms) — Module 4 lesson. */
function clearableStr(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  return v.trim();
}

function num(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

// ---------- draft creation (§57/§63/§68) ----------

export interface ValidatedInvoiceDraft {
  clientId: string;
  projectId?: string;
  issueDate: string;
  /** §68 — optional here; the domain defaults it from the client's payment terms. */
  dueDate?: string;
  currency: string;
  notes?: string;
  terms?: string;
}

export function validateInvoiceDraftCreate(
  payload: Record<string, unknown>,
  today: string
): { ok: true; value: ValidatedInvoiceDraft } | { ok: false; errors: InvoiceFieldError[] } {
  const errors: InvoiceFieldError[] = [];

  const clientId = str(payload.clientId);
  if (!clientId) errors.push({ field: 'clientId', message: 'Client is required' });

  const projectId = str(payload.projectId);

  const issueDate = str(payload.issueDate) ?? today;
  if (!DATE_RE.test(issueDate) || !isBusinessDate(issueDate)) {
    errors.push({ field: 'issueDate', message: 'Must be a valid date (YYYY-MM-DD)' });
  } else if (issueDate > today) {
    errors.push({ field: 'issueDate', message: 'Cannot be in the future' });
  }

  // §68 step 5 — dueDate is OPTIONAL here: the domain defaults it from the
  // client's payment terms when absent. Present values must be well-formed
  // and ≥ issueDate.
  const dueDate = str(payload.dueDate);
  if (dueDate !== undefined && (!DATE_RE.test(dueDate) || !isBusinessDate(dueDate))) {
    errors.push({ field: 'dueDate', message: 'Must be a valid date (YYYY-MM-DD)' });
  } else if (dueDate !== undefined && DATE_RE.test(issueDate) && isBusinessDate(issueDate) && dueDate < issueDate) {
    errors.push({ field: 'dueDate', message: 'Cannot be before the issue date' });
  }

  const currency = (str(payload.currency) ?? 'INR').toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    errors.push({ field: 'currency', message: 'Must be a 3-letter currency code' });
  }

  const notes = clearableStr(payload.notes);
  if (notes !== undefined && notes.length > MAX_NOTES) {
    errors.push({ field: 'notes', message: `Must be at most ${MAX_NOTES} characters` });
  }
  const terms = clearableStr(payload.terms);
  if (terms !== undefined && terms.length > MAX_TERMS) {
    errors.push({ field: 'terms', message: `Must be at most ${MAX_TERMS} characters` });
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      clientId: clientId!,
      ...(projectId !== undefined && { projectId }),
      issueDate,
      ...(dueDate !== undefined && { dueDate }),
      currency,
      ...(notes !== undefined && { notes }),
      ...(terms !== undefined && { terms }),
    },
  };
}

// ---------- line add (§59/§60/§71) ----------

export interface ValidatedInvoiceLineInput {
  type: InvoiceLineType;
  description: string;
  sourceId?: string;
  /** Free-form amount for MANUAL/FIXED_FEE lines (validated here); the domain
   *  computes+validates source-backed amounts from the frozen source. */
  amount?: number;
  currency?: string;
  quantity?: number;
  unitPrice?: number;
  /** Module 11 §13/§14 — the HSN/SAC classification (never defaulted). */
  classification?: { type: 'HSN' | 'SAC'; code: string };
  /** Module 11 §14 — free-form tax category label. */
  taxCategory?: string;
  metadata?: Record<string, unknown>;
}

export function validateInvoiceLineAdd(
  payload: Record<string, unknown>
): { ok: true; value: ValidatedInvoiceLineInput } | { ok: false; errors: InvoiceFieldError[] } {
  const errors: InvoiceFieldError[] = [];

  const rawType = str(payload.type);
  let type: InvoiceLineType | undefined;
  if (rawType && (INVOICE_LINE_TYPES as readonly string[]).includes(rawType)) {
    type = rawType as InvoiceLineType;
  } else {
    errors.push({ field: 'type', message: `Must be one of ${INVOICE_LINE_TYPES.join(', ')}` });
  }

  const description = str(payload.description);
  if (!description) errors.push({ field: 'description', message: 'Description is required' });
  else if (description.length > MAX_DESCRIPTION) {
    errors.push({ field: 'description', message: `Must be at most ${MAX_DESCRIPTION} characters` });
  }

  const sourceId = str(payload.sourceId);
  if (type && isSourceBackedLineType(type) && !sourceId) {
    errors.push({ field: 'sourceId', message: `A ${type} line must reference its source record` });
  }

  const quantity = num(payload.quantity);
  const unitPrice = num(payload.unitPrice);
  if (quantity !== undefined && quantity < 0) {
    errors.push({ field: 'quantity', message: 'Cannot be negative' });
  }
  if ((quantity !== undefined) !== (unitPrice !== undefined)) {
    errors.push({ field: 'quantity', message: 'quantity and unitPrice are set together' });
  }
  if (unitPrice !== undefined && (unitPrice < 0 || unitPrice > MAX_AMOUNT)) {
    errors.push({ field: 'unitPrice', message: 'Must be a positive unit price' });
  }
  // §59/§72 — when quantity + unitPrice price the line, a placeholder amount
  // of 0 is legal (the engine computes the real value); a bare amount must
  // be positive.
  const hasPricing = quantity !== undefined && unitPrice !== undefined;
  const amount = num(payload.amount);
  if (amount !== undefined && ((amount <= 0 && !hasPricing) || amount > MAX_AMOUNT)) {
    errors.push({ field: 'amount', message: 'Must be a positive amount' });
  }
  const currency = str(payload.currency)?.toUpperCase();
  if (currency !== undefined && !/^[A-Z]{3}$/.test(currency)) {
    errors.push({ field: 'currency', message: 'Must be a 3-letter currency code' });
  }

  const metadata = payload.metadata !== undefined && typeof payload.metadata === 'object' && payload.metadata !== null
    ? payload.metadata as Record<string, unknown>
    : undefined;

  // Module 11 §13/§14 — HSN/SAC classification + tax category on the line.
  // The classification is optional and NEVER defaulted; when present its
  // type must be HSN|SAC and the code is a bounded string.
  let classification: ValidatedInvoiceLineInput['classification'];
  const rawClassification = payload.classification;
  if (rawClassification !== undefined && rawClassification !== null) {
    if (typeof rawClassification !== 'object') {
      errors.push({ field: 'classification', message: 'classification must be an object' });
    } else {
      const c = rawClassification as { type?: unknown; code?: unknown };
      const cType = str(c.type);
      const cCode = str(c.code);
      if (cType !== 'HSN' && cType !== 'SAC') {
        errors.push({ field: 'classification.type', message: 'classification.type must be HSN or SAC' });
      } else if (!cCode) {
        errors.push({ field: 'classification.code', message: 'classification.code is required' });
      } else if (cCode.length > 20) {
        errors.push({ field: 'classification.code', message: 'classification.code must be at most 20 characters' });
      } else {
        classification = { type: cType, code: cCode };
      }
    }
  }
  const taxCategory = str(payload.taxCategory);
  if (taxCategory !== undefined && taxCategory.length > 100) {
    errors.push({ field: 'taxCategory', message: 'taxCategory must be at most 100 characters' });
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      type: type!,
      description: description!,
      ...(sourceId !== undefined && { sourceId }),
      ...(amount !== undefined && { amount }),
      ...(currency !== undefined && { currency }),
      ...(quantity !== undefined && { quantity }),
      ...(unitPrice !== undefined && { unitPrice }),
      ...(classification !== undefined && { classification }),
      ...(taxCategory !== undefined && { taxCategory }),
      ...(metadata !== undefined && { metadata }),
    },
  };
}

// ---------- draft PATCH (§63 — the only editable state) ----------

export interface ValidatedInvoiceUpdate {
  dueDate?: string;
  notes?: string | null;
  terms?: string | null;
}

export function validateInvoiceUpdate(
  payload: Record<string, unknown>
): { ok: true; value: ValidatedInvoiceUpdate } | { ok: false; errors: InvoiceFieldError[] } {
  const errors: InvoiceFieldError[] = [];

  const dueDate = str(payload.dueDate);
  if (dueDate !== undefined && (!DATE_RE.test(dueDate) || !isBusinessDate(dueDate))) {
    errors.push({ field: 'dueDate', message: 'Must be a valid date (YYYY-MM-DD)' });
  }

  const notes = clearableStr(payload.notes);
  if (notes !== undefined && notes.length > MAX_NOTES) {
    errors.push({ field: 'notes', message: `Must be at most ${MAX_NOTES} characters` });
  }
  const terms = clearableStr(payload.terms);
  if (terms !== undefined && terms.length > MAX_TERMS) {
    errors.push({ field: 'terms', message: `Must be at most ${MAX_TERMS} characters` });
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      ...(dueDate !== undefined && { dueDate }),
      ...(notes !== undefined && { notes: notes === '' ? null : notes }),
      ...(terms !== undefined && { terms: terms === '' ? null : terms }),
    },
  };
}

// ---------- list filters (§85) ----------

export interface ValidatedInvoiceFilters {
  clientId?: string;
  projectId?: string;
  status?: InvoiceStatus;
  dateFrom?: string;
  dateTo?: string;
}

const INVOICE_STATUS_VALUES = ['DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID'] as const;

/** Drops invalid filters silently (read-only surface — never a 400). */
export function validateInvoiceFilters(params: Record<string, string | undefined>): ValidatedInvoiceFilters {
  const filters: ValidatedInvoiceFilters = {};
  const clientId = str(params.clientId);
  if (clientId) filters.clientId = clientId;
  const projectId = str(params.projectId);
  if (projectId) filters.projectId = projectId;
  const status = str(params.status);
  if (status && (INVOICE_STATUS_VALUES as readonly string[]).includes(status)) {
    filters.status = status as InvoiceStatus;
  }
  const dateFrom = str(params.dateFrom);
  if (dateFrom && DATE_RE.test(dateFrom)) filters.dateFrom = dateFrom;
  const dateTo = str(params.dateTo);
  if (dateTo && DATE_RE.test(dateTo)) filters.dateTo = dateTo;
  return filters;
}
