/**
 * Agency Vertical — Validators: payment input (Module 10, spec §88–§92, §107/§108)
 *
 * Reusable, framework-free validation for payment payloads. Pure functions:
 * (input) → { ok, value } | { ok: false, errors } — no NextResponse coupling.
 *
 * The rules (spec §88–§92):
 *   invoiceId        required (§89 — a payment always settles an invoice)
 *   amount           required, > 0, ≤ 1e12 sanity bound (§129 invariant);
 *                    partial amounts are NORMAL (§90)
 *   currency         optional 3-letter code; the domain forces the INVOICE's
 *                    currency — an explicit mismatch is a 400 (§127)
 *   withholdingAmount optional, ≥ 0, ≤ amount (§92 — you cannot withhold
 *                    more than the payment settles; no hard-coded TDS %)
 *   receivedAt       valid YYYY-MM-DD, not in the future (documents money
 *                    that has arrived); defaults to today in the domain
 *   method           required enum (§107 — logic uses the enum, never a label)
 *   reference        optional, ≤ 200 chars
 *   accountId        optional here (§108 — the money may be recorded before
 *                    the bank is known; the DOMAIN demands it at confirmation)
 *   gatewayPaymentId optional, ≤ 100 chars — the Razorpay payment id pasted
 *                    from the gateway dashboard at manual intake (10D). Only
 *                    valid with a gateway method (RAZORPAY); webhook payloads
 *                    NEVER carry this (§113 — the webhook resolves it from
 *                    the stored relationship, never from the payload)
 *   gatewayLinkId    optional, ≤ 100 chars — the Razorpay LINK id (plink_…)
 *                    the money was collected through (Module 12 §47). Same
 *                    gateway-method rule; the webhook link path supplies it
 *                    from the STORED link, never from a payload (§113)
 *   notes            optional, ≤ 2000 chars
 *
 *   reason (reversal/failed) optional, ≤ 2000 chars — audit trail color.
 *
 * Module 4/5/7/8/9 audit lessons applied:
 *   - amount/withholding/method/status are NEVER PATCHable after record —
 *     the lifecycle actions (confirm/fail/reverse) are the only movers.
 *   - '' means "clear" for clearable optionals (reference, notes).
 *   - status / transactionId / reconciliationStatus are domain-owned.
 */
import {
  PAYMENT_METHODS, PAYMENT_STATUSES,
  type PaymentMethod, type PaymentStatus,
} from '../types/payment';
import type { WithholdingAdjustment } from '../types/withholding';
import { isBusinessDate } from '../types/dates';

export interface PaymentFieldError {
  field: string;
  message: string;
}

const MAX_AMOUNT = 1_000_000_000_000; // 1e12 — sanity bound, not a business rule.
const MAX_REFERENCE = 200;
const MAX_NOTES = 2000;
const MAX_REASON = 2000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function str(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t === '' ? undefined : t;
}

/** '' passthrough for CLEARABLE optionals — Module 4 lesson. */
function clearableStr(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  return v.trim();
}

function num(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

// ---------- manual record (§88–§92, §107/§108) ----------

export interface ValidatedPaymentRecord {
  invoiceId: string;
  amount: number;
  currency?: string;
  withholdingAmount?: number;
  /** Module 11 §20 — the withholding WHY alongside the §92 amount. */
  withholdingAdjustment?: {
    type: string;
    code?: string;
    rate?: number;
    jurisdiction?: string;
    reference?: string;
    notes?: string;
  };
  receivedAt?: string;
  method: PaymentMethod;
  reference?: string;
  accountId?: string;
  gatewayPaymentId?: string;
  gatewayLinkId?: string;
  notes?: string;
}

const MAX_WH_TYPE = 30;
const MAX_WH_CODE = 50;
const MAX_WH_JURISDICTION = 10;
const MAX_WH_REFERENCE = 200;
const MAX_WH_NOTES = 2000;
const MAX_RATE = 100;

/**
 * Module 11 §20 — validate a withholdingAdjustment payload. Bounded strings
 * and an optional rate (0–100); the AMOUNT is never accepted here — it is
 * the §92 withholdingAmount, and the domain welds the two together.
 */
function validateWithholdingAdjustment(
  v: unknown,
  errors: PaymentFieldError[]
): ValidatedPaymentRecord['withholdingAdjustment'] {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'object') {
    errors.push({ field: 'withholdingAdjustment', message: 'withholdingAdjustment must be an object' });
    return undefined;
  }
  const entry = v as Record<string, unknown>;
  const type = str(entry.type) ?? 'TDS';
  if (type.length > MAX_WH_TYPE) {
    errors.push({ field: 'withholdingAdjustment.type', message: `Must be at most ${MAX_WH_TYPE} characters` });
  }
  const code = str(entry.code);
  if (code !== undefined && code.length > MAX_WH_CODE) {
    errors.push({ field: 'withholdingAdjustment.code', message: `Must be at most ${MAX_WH_CODE} characters` });
  }
  const jurisdiction = str(entry.jurisdiction);
  if (jurisdiction !== undefined && jurisdiction.length > MAX_WH_JURISDICTION) {
    errors.push({ field: 'withholdingAdjustment.jurisdiction', message: `Must be at most ${MAX_WH_JURISDICTION} characters` });
  }
  const reference = str(entry.reference);
  if (reference !== undefined && reference.length > MAX_WH_REFERENCE) {
    errors.push({ field: 'withholdingAdjustment.reference', message: `Must be at most ${MAX_WH_REFERENCE} characters` });
  }
  const notes = clearableStr(entry.notes);
  if (notes !== undefined && notes.length > MAX_WH_NOTES) {
    errors.push({ field: 'withholdingAdjustment.notes', message: `Must be at most ${MAX_WH_NOTES} characters` });
  }
  let rate: number | undefined;
  if (entry.rate !== undefined) {
    rate = num(entry.rate);
    if (rate === undefined || rate < 0 || rate > MAX_RATE) {
      errors.push({ field: 'withholdingAdjustment.rate', message: `rate must be a number between 0 and ${MAX_RATE} (percent)` });
    }
  }
  return {
    type,
    ...(code !== undefined && { code }),
    ...(rate !== undefined && { rate }),
    ...(jurisdiction !== undefined && { jurisdiction: jurisdiction.toUpperCase() }),
    ...(reference !== undefined && { reference }),
    ...(notes !== undefined && notes !== '' && { notes }),
  };
}

export function validatePaymentRecord(
  payload: Record<string, unknown>,
  today: string
): { ok: true; value: ValidatedPaymentRecord } | { ok: false; errors: PaymentFieldError[] } {
  const errors: PaymentFieldError[] = [];

  const invoiceId = str(payload.invoiceId);
  if (!invoiceId) errors.push({ field: 'invoiceId', message: 'A payment must reference its invoice (§89)' });

  const amount = num(payload.amount);
  if (amount === undefined || amount <= 0) {
    errors.push({ field: 'amount', message: 'Must be a positive amount' });
  } else if (amount > MAX_AMOUNT) {
    errors.push({ field: 'amount', message: 'Exceeds the sanity bound' });
  }

  const currency = str(payload.currency)?.toUpperCase();
  if (currency !== undefined && !/^[A-Z]{3}$/.test(currency)) {
    errors.push({ field: 'currency', message: 'Must be a 3-letter currency code' });
  }

  // §92 — withholding is separate and can never exceed the payment itself.
  const withholdingAmount = num(payload.withholdingAmount);
  if (withholdingAmount !== undefined) {
    if (withholdingAmount < 0) {
      errors.push({ field: 'withholdingAmount', message: 'Cannot be negative' });
    } else if (withholdingAmount > MAX_AMOUNT) {
      errors.push({ field: 'withholdingAmount', message: 'Exceeds the sanity bound' });
    } else if (amount !== undefined && withholdingAmount > amount) {
      errors.push({ field: 'withholdingAmount', message: 'Cannot exceed the payment amount (§92)' });
    }
  }

  // Module 11 §20 — the adjustment carries the WHY. It requires its §92
  // amount: an adjustment without a withheld amount has nothing to describe.
  const withholdingAdjustment = validateWithholdingAdjustment(payload.withholdingAdjustment, errors);
  if (withholdingAdjustment !== undefined && withholdingAmount === undefined) {
    errors.push({ field: 'withholdingAdjustment', message: 'withholdingAdjustment requires withholdingAmount (§92) — the adjustment describes the withheld money' });
  }

  const receivedAt = str(payload.receivedAt);
  if (receivedAt !== undefined && (!DATE_RE.test(receivedAt) || !isBusinessDate(receivedAt))) {
    errors.push({ field: 'receivedAt', message: 'Must be a valid date (YYYY-MM-DD)' });
  } else if (receivedAt !== undefined && receivedAt > today) {
    errors.push({ field: 'receivedAt', message: 'Cannot be in the future' });
  }

  const method = str(payload.method);
  if (!method || !(PAYMENT_METHODS as readonly string[]).includes(method)) {
    errors.push({ field: 'method', message: `Must be one of ${PAYMENT_METHODS.join(', ')}` });
  }

  const reference = clearableStr(payload.reference);
  if (reference !== undefined && reference.length > MAX_REFERENCE) {
    errors.push({ field: 'reference', message: `Must be at most ${MAX_REFERENCE} characters` });
  }

  const accountId = str(payload.accountId);

  // 10D — the gateway reference at manual intake (the id the webhook will
  // later resolve). A gateway reference on a non-gateway method is a 400.
  const gatewayPaymentId = str(payload.gatewayPaymentId);
  if (gatewayPaymentId !== undefined) {
    if (gatewayPaymentId.length > 100) {
      errors.push({ field: 'gatewayPaymentId', message: 'Must be at most 100 characters' });
    } else if (method !== 'RAZORPAY') {
      errors.push({ field: 'gatewayPaymentId', message: 'Only RAZORPAY payments may carry a gateway reference' });
    }
  }

  // Module 12 §47 — the link lineage, same gateway-method discipline.
  const gatewayLinkId = str(payload.gatewayLinkId);
  if (gatewayLinkId !== undefined) {
    if (gatewayLinkId.length > 100) {
      errors.push({ field: 'gatewayLinkId', message: 'Must be at most 100 characters' });
    } else if (method !== 'RAZORPAY') {
      errors.push({ field: 'gatewayLinkId', message: 'Only RAZORPAY payments may carry a gateway link reference' });
    }
  }

  const notes = clearableStr(payload.notes);
  if (notes !== undefined && notes.length > MAX_NOTES) {
    errors.push({ field: 'notes', message: `Must be at most ${MAX_NOTES} characters` });
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      invoiceId: invoiceId!,
      amount: amount!,
      ...(currency !== undefined && { currency }),
      ...(withholdingAmount !== undefined && { withholdingAmount }),
      ...(withholdingAdjustment !== undefined && { withholdingAdjustment }),
      ...(receivedAt !== undefined && { receivedAt }),
      method: method as PaymentMethod,
      ...(reference !== undefined && { reference: reference === '' ? undefined : reference }),
      ...(accountId !== undefined && { accountId }),
      ...(gatewayPaymentId !== undefined && { gatewayPaymentId }),
      ...(gatewayLinkId !== undefined && { gatewayLinkId }),
      ...(notes !== undefined && { notes: notes === '' ? undefined : notes }),
    },
  };
}

// ---------- lifecycle reason (§102/§103) ----------

export function validatePaymentReason(
  payload: Record<string, unknown>
): { ok: true; reason?: string } | { ok: false; errors: PaymentFieldError[] } {
  const reason = clearableStr(payload.reason);
  if (reason !== undefined && reason.length > MAX_REASON) {
    return { ok: false, errors: [{ field: 'reason', message: `Must be at most ${MAX_REASON} characters` }] };
  }
  return { ok: true, ...(reason !== undefined && reason !== '' && { reason }) };
}

// ---------- list filters (§116) ----------

export interface ValidatedPaymentFilters {
  invoiceId?: string;
  clientId?: string;
  status?: PaymentStatus;
  method?: PaymentMethod;
  dateFrom?: string;
  dateTo?: string;
  /**
   * §116 collections-by-project — payments do not carry a projectId, so the
   * ROUTE resolves this against the invoices of that project. Passthrough
   * here (any non-empty id; a project with no invoices is simply an empty
   * list, never an error).
   */
  projectId?: string;
}

/** Drops invalid filters silently (read-only surface — never a 400). */
export function validatePaymentFilters(params: Record<string, string | undefined>): ValidatedPaymentFilters {
  const filters: ValidatedPaymentFilters = {};
  const invoiceId = str(params.invoiceId);
  if (invoiceId) filters.invoiceId = invoiceId;
  const clientId = str(params.clientId);
  if (clientId) filters.clientId = clientId;
  const status = str(params.status);
  if (status && (PAYMENT_STATUSES as readonly string[]).includes(status)) {
    filters.status = status as PaymentStatus;
  }
  const method = str(params.method);
  if (method && (PAYMENT_METHODS as readonly string[]).includes(method)) {
    filters.method = method as PaymentMethod;
  }
  const dateFrom = str(params.dateFrom);
  if (dateFrom && DATE_RE.test(dateFrom)) filters.dateFrom = dateFrom;
  const dateTo = str(params.dateTo);
  if (dateTo && DATE_RE.test(dateTo)) filters.dateTo = dateTo;
  const projectId = str(params.projectId);
  if (projectId) filters.projectId = projectId;
  return filters;
}
