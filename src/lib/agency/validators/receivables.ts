/**
 * Agency Vertical — Validators: receivables query filters (Module 14, §98)
 *
 * CLIENT-SAFE: pure parsing/validation only. No server imports.
 *
 * Fail-closed (like the Module 13 profitability filters): an INVALID filter
 * value is a 400, never silently ignored — a typo'd bucket or date must not
 * quietly produce an empty report that looks like "nothing owed".
 *
 *   clientId / projectId  non-empty strings, passed through verbatim
 *   status                SENT | PARTIALLY_PAID | OVERDUE — the OPERATIONAL
 *                         (§91) statuses a receivable can display; DRAFT
 *                         (§74 unnumbered), PAID and VOID are not
 *                         receivables at all (§86)
 *   agingBucket           CURRENT | 1-30 | 31-60 | 61-90 | 90+ (§88)
 *   from / to             YYYY-MM-DD — the inclusive DUE-DATE window (§96)
 *   currency              3-letter ISO uppercase (§127)
 *   dueSoonDays           integer 1..90 (§90 — the configurable window;
 *                         default 7, enforced by the query module)
 */
import { isBusinessDate } from '../types/dates';
import type { AgingBucket } from '../types/dates';
import type { InvoiceStatus } from '../types/invoice';
import type { ReceivablesFilters } from '../types/receivables';

const OPEN_DISPLAY_STATUSES: readonly InvoiceStatus[] = ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] as const;
const AGING_BUCKETS: readonly AgingBucket[] = ['CURRENT', '1-30', '31-60', '61-90', '90+'] as const;
const CURRENCY_RE = /^[A-Z]{3}$/;

export interface ParsedReceivablesQuery {
  filters: ReceivablesFilters;
  /** §90 — absent when the caller didn't override (the route applies the default). */
  dueSoonDays?: number;
}

export type ReceivablesQueryParse =
  | { ok: true; value: ParsedReceivablesQuery }
  | { ok: false; error: string };

/**
 * §98 — parse the shared query-string contract. Returns ok:false (the route
 * answers 400 with the message) on any malformed value.
 */
export function parseReceivablesQuery(params: URLSearchParams): ReceivablesQueryParse {
  const filters: ReceivablesFilters = {};

  const clientId = params.get('clientId');
  if (clientId !== null) {
    if (clientId.trim() === '') return { ok: false, error: 'clientId must not be empty' };
    filters.clientId = clientId;
  }

  const projectId = params.get('projectId');
  if (projectId !== null) {
    if (projectId.trim() === '') return { ok: false, error: 'projectId must not be empty' };
    filters.projectId = projectId;
  }

  const status = params.get('status');
  if (status !== null) {
    if (!(OPEN_DISPLAY_STATUSES as readonly string[]).includes(status)) {
      return { ok: false, error: `status must be one of ${OPEN_DISPLAY_STATUSES.join(', ')}` };
    }
    filters.status = status as InvoiceStatus;
  }

  const bucket = params.get('agingBucket');
  if (bucket !== null) {
    if (!(AGING_BUCKETS as readonly string[]).includes(bucket)) {
      return { ok: false, error: `agingBucket must be one of ${AGING_BUCKETS.join(', ')}` };
    }
    filters.agingBucket = bucket as AgingBucket;
  }

  const from = params.get('from');
  if (from !== null) {
    if (!isBusinessDate(from)) return { ok: false, error: 'from must be a valid date (YYYY-MM-DD)' };
    filters.from = from;
  }

  const to = params.get('to');
  if (to !== null) {
    if (!isBusinessDate(to)) return { ok: false, error: 'to must be a valid date (YYYY-MM-DD)' };
    filters.to = to;
  }

  if (filters.from && filters.to && filters.from > filters.to) {
    return { ok: false, error: 'from must not be after to' };
  }

  const currency = params.get('currency');
  if (currency !== null) {
    if (!CURRENCY_RE.test(currency)) return { ok: false, error: 'currency must be a 3-letter ISO code' };
    filters.currency = currency;
  }

  // §90 — the configurable due-soon window (default 7 lives in the query).
  let dueSoonDays: number | undefined;
  const rawDays = params.get('dueSoonDays');
  if (rawDays !== null) {
    const n = Number(rawDays);
    if (!Number.isInteger(n) || n < 1 || n > 90) {
      return { ok: false, error: 'dueSoonDays must be an integer between 1 and 90' };
    }
    dueSoonDays = n;
  }

  return {
    ok: true,
    value: { filters, ...(dueSoonDays !== undefined ? { dueSoonDays } : {}) },
  };
}
