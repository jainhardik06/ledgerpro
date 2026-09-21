/**
 * Agency Vertical — Types: date & time contract (Step 0.11)
 *
 * CLIENT-SAFE: types and pure functions only. No server imports.
 *
 * THE single date/time rulebook for the Agency vertical — same status as
 * money.ts for currency. Invoice due dates, time entry dates, project budget
 * periods, and payment dates all flow through these rules into the dashboard.
 *
 * Decisions (binding):
 *
 * 1. STORAGE — UTC:
 *    - Timestamps (createdAt, issuedAt, receivedAt, audit moments) are stored
 *      as real Date values / ISO-8601 UTC instants. They represent MOMENTS.
 *    - Business dates (invoice issueDate/dueDate, time entry date, milestone
 *      dates, budget months) are stored as 'YYYY-MM-DD' calendar strings —
 *      matching Money OS's existing `Transaction.date` convention. They
 *      represent DAYS, not moments. Never stored as UTC-midnight Dates
 *      (that silently shifts the day across timezones).
 *
 * 2. BUSINESS-DATE ARITHMETIC:
 *    All day math (aging, due-date comparison, bucketing) happens on the
 *      'YYYY-MM-DD' string domain using these helpers — never via new Date(
 *      'YYYY-MM-DD') + getTimezoneOffset tricks, which corrupt boundaries.
 *
 * 3. TENANT TIMEZONE (display/reporting):
 *    - Default: 'Asia/Kolkata' (Phase 1 primary market; PRD §59 agency
 *      settings will make it tenant-configurable — until then this constant
 *      is the single source).
 *    - "Today" for business purposes (overdue checks, aging) is computed in
 *      the TENANT timezone, on the server, once per request. The browser's
 *      local timezone is never used for business decisions.
 *
 * 4. DATE BOUNDARIES:
 *    A business day [D] in tenant tz runs from D 00:00 to D 23:59:59.999 in
 *    that tz. Comparisons like dueDate < today are pure string comparisons
 *    on YYYY-MM-DD (lexicographic = chronological for this format).
 *
 * 5. MONTH BOUNDARIES:
 *    A month is 'YYYY-MM'. startOfMonth/endOfMonth produce YYYY-MM-DD
 *    inclusive bounds. Budget periods and monthly reports use these.
 *
 * 6. FISCAL YEAR:
 *    India convention: April–March. fiscalYear(date) returns the FY label
 *      (e.g. 'FY2026-27' for 2026-04-01..2027-03-31). Start month is a
 *      constant here until agency settings make it configurable.
 *
 * 7. DISPLAY TIMEZONE = tenant timezone. UI renders business dates as-is
 *    (YYYY-MM-DD) and timestamps via formatTimestamp() in tenant tz.
 */

/** 'YYYY-MM-DD' — a business day (no time, no timezone). */
export type BusinessDate = string;

/** 'YYYY-MM' — a business month. */
export type BusinessMonth = string;

export const DEFAULT_TENANT_TIMEZONE = 'Asia/Kolkata';
export const FISCAL_YEAR_START_MONTH = 4; // April (1-indexed)

// ---------- validation & today ----------

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Validate a business date string. */
export function isBusinessDate(value: string): value is BusinessDate {
  return DATE_RE.test(value);
}

/** Validate a business month string. */
export function isBusinessMonth(value: string): value is BusinessMonth {
  return MONTH_RE.test(value);
}

/**
 * TODAY as a business date, in the tenant timezone, computed server-side.
 * Caller passes the tenant tz (defaults to Asia/Kolkata) — never trust the
 * server box's local timezone for business "today".
 */
export function todayInTimezone(timezone: string = DEFAULT_TENANT_TIMEZONE): BusinessDate {
  // en-CA gives YYYY-MM-DD; timeZone pins the wall-clock used.
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
}

// ---------- date math on the string domain ----------

/** Days between two business dates (b − a). Negative when b < a. */
export function diffDays(a: BusinessDate, b: BusinessDate): number {
  // Parse as UTC noon to avoid DST edge cases — result is a pure day count.
  const ua = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10), 12);
  const ub = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10), 12);
  return Math.round((ub - ua) / 86_400_000);
}

/** Days past due: max(0, today − dueDate). Overdue check: dueDate < today. */
export function daysOverdue(dueDate: BusinessDate, today: BusinessDate): number {
  return Math.max(0, diffDays(dueDate, today));
}

/** Add n days to a business date (n may be negative). */
export function addDays(date: BusinessDate, n: number): BusinessDate {
  const ms = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), 12) + n * 86_400_000;
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// ---------- month & fiscal year ----------

/** Month of a business date → 'YYYY-MM'. */
export function monthOf(date: BusinessDate): BusinessMonth {
  return date.slice(0, 7);
}

/** Inclusive first day of a month. */
export function startOfMonth(month: BusinessMonth): BusinessDate {
  return `${month}-01`;
}

/** Inclusive last day of a month. */
export function endOfMonth(month: BusinessMonth): BusinessDate {
  const y = +month.slice(0, 4), m = +month.slice(5, 7);
  const d = new Date(Date.UTC(y, m, 0)); // day 0 of next month = last of this
  return `${y}-${String(m).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Fiscal-year label for a business date, April–March (e.g. 2026-11-15 →
 * 'FY2026-27'). Start month configurable when agency settings arrive.
 */
export function fiscalYear(date: BusinessDate, startMonth = FISCAL_YEAR_START_MONTH): string {
  const y = +date.slice(0, 4), m = +date.slice(5, 7);
  const fyStart = m >= startMonth ? y : y - 1;
  return `FY${fyStart}-${String((fyStart + 1) % 100).padStart(2, '0')}`;
}

// ---------- aging buckets (receivables, definitions §9) ----------

export type AgingBucket = 'CURRENT' | '1-30' | '31-60' | '61-90' | '90+';

/** Bucket for an invoice given its days overdue (0 = not past due). */
export function agingBucket(daysPastDue: number): AgingBucket {
  if (daysPastDue <= 0) return 'CURRENT';
  if (daysPastDue <= 30) return '1-30';
  if (daysPastDue <= 60) return '31-60';
  if (daysPastDue <= 90) return '61-90';
  return '90+';
}

/**
 * Module 14 §101 — deterministic collection risk. NOT predictive: plain
 * day-past-due bands for operational collection follow-up. Null when the
 * balance is not past due yet.
 */
export type CollectionRisk = 'OVERDUE' | 'OVERDUE_10_PLUS' | 'OVERDUE_30_PLUS' | 'OVERDUE_60_PLUS' | 'OVERDUE_90_PLUS';

/** §101 — the risk badge for a receivable given its days past due. */
export function collectionRisk(daysPastDue: number): CollectionRisk | null {
  if (daysPastDue <= 0) return null;
  if (daysPastDue >= 90) return 'OVERDUE_90_PLUS';
  if (daysPastDue >= 60) return 'OVERDUE_60_PLUS';
  if (daysPastDue >= 30) return 'OVERDUE_30_PLUS';
  if (daysPastDue >= 10) return 'OVERDUE_10_PLUS';
  return 'OVERDUE';
}

// ---------- payment terms (due date derivation, definitions §54) ----------

export type PaymentTerms =
  | 'DUE_ON_RECEIPT' | 'NET_7' | 'NET_15' | 'NET_30' | 'NET_45' | 'NET_60' | 'CUSTOM';

const TERM_DAYS: Partial<Record<PaymentTerms, number>> = {
  DUE_ON_RECEIPT: 0, NET_7: 7, NET_15: 15, NET_30: 30, NET_45: 45, NET_60: 60,
};

/** Due date from an issue date and payment terms. CUSTOM requires explicit days. */
export function dueDateFromTerms(issueDate: BusinessDate, terms: PaymentTerms, customDays?: number): BusinessDate {
  const days = terms === 'CUSTOM' ? customDays : TERM_DAYS[terms];
  if (days === undefined) throw new Error(`[Date] CUSTOM terms require explicit days`);
  return addDays(issueDate, days);
}

// ---------- reporting periods (dashboard date range, Module 1.3) ----------

/** Selector values for the dashboard date range. */
export type ReportingPeriod =
  | 'THIS_MONTH' | 'LAST_MONTH' | 'THIS_QUARTER' | 'THIS_YEAR' | 'CUSTOM';

/** Inclusive [from, to] business-date window for a period, given today. */
export interface DateRange {
  readonly from: BusinessDate;
  readonly to: BusinessDate;
  /** The equivalent previous window for vs-previous-period deltas. */
  readonly previous: DateRange;
}

function daysBetween(a: BusinessDate, b: BusinessDate): number {
  return Math.abs(diffDays(a, b)) + 1;
}

/**
 * Resolve the reporting window. Every dashboard metric uses the SAME window
 * (consistency rule, Module 1.3): CONTRACTED (balance-style metrics) note
 * their basis separately in the API payload, but windowed metrics never mix.
 * previous = the immediately preceding window of equal length.
 */
export function resolveReportingPeriod(
  period: ReportingPeriod,
  today: BusinessDate,
  custom?: { from: BusinessDate; to: BusinessDate }
): DateRange {
  switch (period) {
    case 'THIS_MONTH': {
      const m = monthOf(today);
      return window(startOfMonth(m), today);
    }
    case 'LAST_MONTH': {
      const y = +today.slice(0, 4), m = +today.slice(5, 7);
      const prev = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, '0')}`;
      return window(startOfMonth(prev), endOfMonth(prev));
    }
    case 'THIS_QUARTER': {
      const y = +today.slice(0, 4), mo = +today.slice(5, 7);
      const qStart = mo - ((mo - 1) % 3);
      const from = `${y}-${String(qStart).padStart(2, '0')}-01`;
      return window(from, today);
    }
    case 'THIS_YEAR': {
      return window(`${today.slice(0, 4)}-01-01`, today);
    }
    case 'CUSTOM': {
      if (!custom || !isBusinessDate(custom.from) || !isBusinessDate(custom.to) || custom.from > custom.to) {
        throw new Error('[Date] CUSTOM period requires a valid from/to range');
      }
      return window(custom.from, custom.to);
    }
  }
}

function window(from: BusinessDate, to: BusinessDate): DateRange {
  const length = daysBetween(from, to);
  // Previous window = same length ending the day before `from`.
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(length - 1));
  const previous: DateRange = { from: prevFrom, to: prevTo, previous: undefined as unknown as DateRange };
  return { from, to, previous };
}

/** Label for display, e.g. "Sep 2026" / "12 Aug 2026 – 8 Sep 2026". */
export function describeDateRange(range: { from: BusinessDate; to: BusinessDate }): string {
  const sameMonth = monthOf(range.from) === monthOf(range.to);
  const f = formatBusinessDate(range.from);
  const t = formatBusinessDate(range.to);
  if (range.from === range.to) return f;
  if (sameMonth) {
    // "1–8 Sep 2026" style
    const [, , d1] = range.from.split('-');
    const [, m2, d2] = range.to.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d1}–${d2} ${months[+m2 - 1]} ${range.to.slice(0, 4)}`;
  }
  return `${f} – ${t}`;
}

// ---------- display timezone ----------

/**
 * Render a business date for display (tenant-tz wall calendar — the string
 * IS the tenant's calendar day, so we format it verbatim, no shifting).
 */
export function formatBusinessDate(date: BusinessDate): string {
  const [, m, d] = date.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${months[+m - 1]} ${date.slice(0, 4)}`;
}

/** Render a UTC instant (timestamp) in the tenant timezone. */
export function formatTimestamp(instant: string | Date, timezone: string = DEFAULT_TENANT_TIMEZONE): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: timezone, day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);
}
