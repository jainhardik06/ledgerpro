/**
 * Agency Vertical — Reports: server-side pagination (Module 16, §39)
 *
 * CLIENT-SAFE: pure functions only. No server imports.
 *
 * §39 — reports must paginate: an agency with thousands of entries must
 * never load the complete dataset into React. Rows are computed by the
 * engine/aggregation (server-side), and this helper slices ONE bounded page
 * out of the full filtered row list. Summaries are computed by the report
 * over ALL filtered rows BEFORE slicing — a summary that changed with
 * offset would be a lie.
 *
 * Contract (mirrors the Module 15 alerts `limit` discipline):
 *   limit   integer 1..1000, default 50 — 0/negative/non-integer are 400s,
 *           never silent clamps (a caller must learn their mistake).
 *   offset  integer >= 0, default 0.
 *
 * CSV export (§41) intentionally bypasses pagination: it serializes the FULL
 * filtered row set through the same query, so table page, CSV and the
 * printed PDF all come from one filter interpretation.
 */
import type { ReportPagination } from './types';

export const REPORT_DEFAULT_LIMIT = 50;
export const REPORT_MAX_LIMIT = 1000;

export type PaginationParse =
  | { ok: true; value: { limit: number; offset: number } }
  | { ok: false; error: string };

/** Parse ?limit & ?offset from a report query string (fail-closed). */
export function parseReportPagination(params: URLSearchParams): PaginationParse {
  let limit = REPORT_DEFAULT_LIMIT;
  const limitRaw = params.get('limit');
  if (limitRaw !== null) {
    const n = Number(limitRaw);
    if (!Number.isInteger(n) || n < 1 || n > REPORT_MAX_LIMIT) {
      return { ok: false, error: `limit must be a whole number between 1 and ${REPORT_MAX_LIMIT}` };
    }
    limit = n;
  }

  let offset = 0;
  const offsetRaw = params.get('offset');
  if (offsetRaw !== null) {
    const n = Number(offsetRaw);
    if (!Number.isInteger(n) || n < 0) {
      return { ok: false, error: 'offset must be a whole number of at least 0' };
    }
    offset = n;
  }

  return { ok: true, value: { limit, offset } };
}

/**
 * Slice one page out of the full filtered row list. `total` in the returned
 * pagination metadata is the FULL row count (pre-slice) so the UI can offer
 * "next page" and the CSV link honestly.
 */
export function slicePage<Row>(
  allRows: readonly Row[],
  limit: number,
  offset: number
): { rows: Row[]; pagination: ReportPagination } {
  const rows = allRows.slice(offset, offset + limit);
  return {
    rows,
    pagination: { total: allRows.length, limit, offset },
  };
}
