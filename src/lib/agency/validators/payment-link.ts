/**
 * Agency Vertical — Validators: payment-link input (Module 12, spec §35–§37)
 *
 * Pure functions: (input) → { ok, value } | { ok: false, errors }.
 *
 * The rules (spec §36/§37 — the security-critical ones):
 *   amount      OPTIONAL. When present it may only NARROW the collection —
 *               a partial link (amount ≤ amountDue). It is NEVER the source
 *               of truth: the SERVER resolves invoice.total − settled itself
 *               and the DOMAIN rejects amount > amountDue. A ₹1 link against
 *               a ₹100,000 invoice is legal only as an explicit partial;
 *               a ₹1 link claiming to BE the collection is impossible because
 *               the default is always the server-computed amountDue.
 *   description optional, ≤ 500 chars — shown on the hosted checkout page.
 *   expiresAt   optional ISO date/datetime, must be in the future (§35).
 *
 * There is deliberately no field for tenant, currency or account: §113 —
 * those are resolved from the stored invoice, never accepted from a caller.
 */
import { isBusinessDate } from '../types/dates';

export interface PaymentLinkFieldError {
  field: string;
  message: string;
}

const MAX_AMOUNT = 1_000_000_000_000; // 1e12 — sanity bound, not a business rule.
const MAX_DESCRIPTION = 500;

export interface ValidatedPaymentLinkCreate {
  amount?: number;
  description?: string;
  expiresAt?: string;
}

export function validatePaymentLinkCreate(
  payload: Record<string, unknown>,
  now: Date = new Date()
): { ok: true; value: ValidatedPaymentLinkCreate } | { ok: false; errors: PaymentLinkFieldError[] } {
  const errors: PaymentLinkFieldError[] = [];

  // §37 — a partial amount; the domain compares it against the
  // server-resolved amountDue (§36). Required-positive here; the ceiling is
  // the domain's to enforce (it owns the invoice).
  let amount: number | undefined;
  if (payload.amount !== undefined && payload.amount !== null && payload.amount !== '') {
    const n = typeof payload.amount === 'number' ? payload.amount : Number(payload.amount);
    if (!Number.isFinite(n) || n <= 0) {
      errors.push({ field: 'amount', message: 'A partial link amount must be a positive number' });
    } else if (n > MAX_AMOUNT) {
      errors.push({ field: 'amount', message: 'Exceeds the sanity bound' });
    } else {
      amount = n;
    }
  }

  let description: string | undefined;
  if (payload.description !== undefined && payload.description !== null) {
    if (typeof payload.description !== 'string') {
      errors.push({ field: 'description', message: 'Must be a string' });
    } else {
      const t = payload.description.trim();
      if (t === '') description = undefined; // '' = use the default checkout description
      else if (t.length > MAX_DESCRIPTION) {
        errors.push({ field: 'description', message: `Must be at most ${MAX_DESCRIPTION} characters` });
      } else {
        description = t;
      }
    }
  }

  // §35 — the link's expiry. Accepts YYYY-MM-DD (end of that day) or a full
  // ISO datetime; never in the past.
  let expiresAt: string | undefined;
  if (payload.expiresAt !== undefined && payload.expiresAt !== null && payload.expiresAt !== '') {
    if (typeof payload.expiresAt !== 'string') {
      errors.push({ field: 'expiresAt', message: 'Must be a date (YYYY-MM-DD or ISO datetime)' });
    } else {
      const raw = payload.expiresAt.trim();
      const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T23:59:59` : raw;
      const parsed = new Date(iso);
      if (Number.isNaN(parsed.getTime())) {
        errors.push({ field: 'expiresAt', message: 'Must be a date (YYYY-MM-DD or ISO datetime)' });
      } else if (parsed.getTime() <= now.getTime()) {
        errors.push({ field: 'expiresAt', message: 'The link expiry must be in the future' });
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(raw) && !isBusinessDate(raw)) {
        errors.push({ field: 'expiresAt', message: 'Must be a valid calendar date (YYYY-MM-DD)' });
      } else {
        expiresAt = parsed.toISOString();
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      ...(amount !== undefined && { amount }),
      ...(description !== undefined && { description }),
      ...(expiresAt !== undefined && { expiresAt }),
    },
  };
}
