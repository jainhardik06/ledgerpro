/**
 * Agency Vertical — Reports: common filter parsing (Module 16, §28)
 *
 * CLIENT-SAFE: pure parsing/validation only. No server imports.
 *
 * Fail-closed, exactly like the Module 13/14 filter validators: an INVALID
 * filter value is a 400, never silently ignored — a typo'd date or status
 * must not quietly produce an empty report that looks like "no data" (§41
 * would call that a lying report).
 *
 * The §28 common contract:
 *   from / to       YYYY-MM-DD business dates, from <= to. Window SEMANTICS
 *                   are per-report (documented at each report function);
 *                   the parse only guarantees they are well-formed dates.
 *   clientId        non-empty string, verbatim
 *   projectId       non-empty string, verbatim
 *   userId          non-empty string, verbatim (time report grouping §32)
 *   currency        3-letter ISO uppercase (§127)
 *   status          per-report whitelist (the caller supplies the legal
 *                   values; an unknown value is a 400 naming the legal set)
 */
import { isBusinessDate } from '../types/dates';
import type { AgencyReportFilters } from './types';

const CURRENCY_RE = /^[A-Z]{3}$/;

export interface ParsedReportFilters {
  filters: AgencyReportFilters;
}

export type ReportFiltersParse =
  | { ok: true; value: ParsedReportFilters }
  | { ok: false; error: string };

/** Parse optional non-empty id params (clientId/projectId/userId). */
function parseId(
  params: URLSearchParams,
  key: 'clientId' | 'projectId' | 'userId'
): string | undefined | { error: string } {
  const raw = params.get(key);
  if (raw === null) return undefined;
  if (raw.trim() === '') return { error: `${key} must not be empty` };
  return raw;
}

/**
 * §28 — parse the common filter layer from a query string. `allowedStatuses`
 * is the report's status whitelist (project lifecycle statuses for the
 * portfolio/profitability reports, operational invoice statuses for
 * receivables); omit it for reports that take no status filter. `disallow`
 * names common filters THIS report does not honor — passing one is a 400
 * naming it, never a silently ignored filter (an ignored filter produces an
 * unfiltered report that looks like complete data).
 */
export function parseReportFilters(
  params: URLSearchParams,
  opts: {
    allowedStatuses?: readonly string[];
    disallow?: readonly ('clientId' | 'projectId' | 'userId' | 'currency' | 'from' | 'to' | 'status')[];
  } = {}
): ReportFiltersParse {
  const disallowed = opts.disallow ?? [];
  for (const key of disallowed) {
    if (params.get(key) !== null) {
      return { ok: false, error: `${key} is not a valid filter for this report` };
    }
  }
  const filters: AgencyReportFilters = {};

  const from = params.get('from');
  if (from !== null) {
    if (!isBusinessDate(from)) {
      return { ok: false, error: 'from must be a business date (YYYY-MM-DD)' };
    }
    filters.from = from;
  }

  const to = params.get('to');
  if (to !== null) {
    if (!isBusinessDate(to)) {
      return { ok: false, error: 'to must be a business date (YYYY-MM-DD)' };
    }
    filters.to = to;
  }

  if (filters.from !== undefined && filters.to !== undefined && filters.from > filters.to) {
    return { ok: false, error: 'from must not be after to' };
  }

  for (const key of ['clientId', 'projectId', 'userId'] as const) {
    const id = parseId(params, key);
    if (typeof id === 'object') return { ok: false, error: id.error };
    if (id !== undefined) filters[key] = id;
  }

  const currency = params.get('currency');
  if (currency !== null) {
    if (!CURRENCY_RE.test(currency)) {
      return { ok: false, error: 'currency must be a 3-letter ISO code' };
    }
    filters.currency = currency;
  }

  const status = params.get('status');
  if (status !== null) {
    const allowed = opts.allowedStatuses;
    if (allowed === undefined) {
      return { ok: false, error: 'status is not a valid filter for this report' };
    }
    if (!allowed.includes(status)) {
      return { ok: false, error: `status must be one of: ${allowed.join(', ')}` };
    }
    filters.status = status;
  }

  return { ok: true, value: { filters } };
}
