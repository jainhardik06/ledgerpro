/**
 * Agency Vertical — Reports: view-model types (Module 16, §26–§36)
 *
 * CLIENT-SAFE: types and pure functions only — no imports of lib/db, mongodb,
 * or any server-only module. React components import from here.
 *
 * THE ONE RULE THIS MODULE LIVES BY (§26/§41): a report NEVER calculates
 * financial values. Every money number in these view models is a pass-through
 * of a Module 7–14 engine result (Module 13 profitability, Module 14
 * receivables, the Module 7/8 stored-entry economics). The reports layer only
 * RESHAPES engine output into report rows and derives presentation-only
 * numbers that carry no financial truth (utilization §32, aging labels §35).
 *
 * §36 — reports are QUERY-DRIVEN: no persistent report documents; every
 * payload is computed from the engines at request time, so it can never go
 * stale.
 *
 * §127 — money never converts. Rows are framed in their source currency and
 * carry it; summary money goes NULL when rows mix currencies (counts stay
 * real). marginPercent is null when revenue is 0 (§82 — "N/A", never a fake
 * 0% and never a division by zero).
 */

import type { AgingBucket, BusinessDate } from '../types/dates';
import type { ProjectStatus } from '../types/project';
import { hoursFromMinutes } from '../types/time';

// ---------- common filter layer (§28) ----------

/**
 * §28 — the predictable common filter set every report accepts. Kept minimal
 * on purpose ("do not implement dozens of filters"): each report consumes the
 * subset that is meaningful to it and IGNORES nothing silently — filters are
 * validated fail-closed by filters.ts (a typo is a 400, never an empty
 * report that looks like truth).
 */
export interface AgencyReportFilters {
  /** Inclusive window start — semantics are PER-REPORT and documented on
   *  each report function (portfolio: project startDate window, §80; time:
   *  entry date window, §32; receivables: due-date window, §96). */
  from?: BusinessDate;
  /** Inclusive window end (see `from`). */
  to?: BusinessDate;
  clientId?: string;
  projectId?: string;
  /** Time-report grouping key (§32) — the user who logged the time. */
  userId?: string;
  /** 3-letter ISO uppercase (§127) — rows are filtered to this currency. */
  currency?: string;
  /** Per-report status whitelist (project lifecycle for portfolio/
   *  profitability; operational invoice status for receivables). */
  status?: string;
}

/** Which time population a time report ran over (§33 — the distinction is
 *  EXPLICIT, never implied: financial reports can never pick up drafts). */
export type TimeReportBasis = 'FINANCIAL' | 'OPERATIONAL';

// ---------- report row view models ----------

/**
 * §29/§36 — one portfolio row. All money is denominated in `currency` (the
 * project's own currency — the engine already frames it, §127). Money fields
 * are numbers because the row is single-currency by construction; the SUMMARY
 * is where mixing surfaces as nulls.
 */
export interface PortfolioReportRow {
  projectId: string;
  projectName: string;
  clientName: string | null;
  status: ProjectStatus;
  currency: string;
  /** §61 — null when never negotiated. */
  contractValue: number | null;
  /** §62 — earned revenue per the billing model. */
  applicableRevenue: number;
  /** §66 — invoiced (never profit). */
  billedAmount: number;
  /** §66 — collected cash (never profit). */
  collectedAmount: number;
  /** §63 — labor + expense cost. */
  deliveryCost: number;
  /** §64 — revenue − deliveryCost (may be negative; a loss is real). */
  profit: number;
  /** §65 — profit / revenue × 100; NULL when revenue = 0 (§82). */
  marginPercent: number | null;
}

/** §29 — portfolio summary. Weighted margin is Σprofit / Σrevenue × 100
 *  (§29 — NOT a naive average of project percentages, so a ₹1 lakh project
 *  and a ₹1 crore project never get equal weight). Money totals null when
 *  rows mix currencies (§127); the count stays real. */
export interface PortfolioReportSummary {
  projectCount: number;
  currency: string | null;
  mixedCurrencies: boolean;
  contractValue: number | null;
  applicableRevenue: number | null;
  billedAmount: number | null;
  collectedAmount: number | null;
  deliveryCost: number | null;
  profit: number | null;
  /** Σprofit / Σrevenue × 100; null when revenue = 0 or currencies mix. */
  weightedMarginPercent: number | null;
}

/**
 * §31 — one project-profitability row. Same engine row as the portfolio
 * report (one engine, §70) with the cost split the profitability lens shows.
 * No formulas are re-derived here — fields map 1:1 off ProjectProfitability.
 */
export interface ProfitabilityReportRow {
  projectId: string;
  projectName: string;
  clientName: string | null;
  currency: string;
  contractValue: number | null;
  applicableRevenue: number;
  /** §63 — approved time × frozen cost snapshot. */
  laborCost: number;
  /** §63 — approved project expenses. */
  expenseCost: number;
  deliveryCost: number;
  profit: number;
  marginPercent: number | null;
  plannedHours: number | null;
  actualHours: number;
}

/** §31 summary — same weighting discipline as §29 (Σprofit / Σrevenue). */
export interface ProfitabilityReportSummary {
  projectCount: number;
  currency: string | null;
  mixedCurrencies: boolean;
  applicableRevenue: number | null;
  laborCost: number | null;
  expenseCost: number | null;
  deliveryCost: number | null;
  profit: number | null;
  weightedMarginPercent: number | null;
}

/**
 * §32 — one time-report row (per employee). `basis` (§33) is carried on the
 * payload, not the row: FINANCIAL = APPROVED entries only (the financial
 * truth); OPERATIONAL = all recorded time (drafts included, shown separately
 * — never mixed into a financial view).
 */
export interface TimeReportRow {
  userId: string;
  /** Display label resolved server-side; null when the user is gone. */
  userName: string | null;
  billableHours: number;
  nonBillableHours: number;
  totalHours: number;
  /** billable / total × 100; 0 when total = 0 (§32 — 0%, never NaN). */
  utilizationPercent: number;
}

/** §32 — time summary over ALL filtered rows (never just the page). */
export interface TimeReportSummary {
  employeeCount: number;
  billableHours: number;
  totalHours: number;
  /** Σ billable / Σ total × 100; 0 when total = 0. */
  utilizationPercent: number;
}

/**
 * §34 — one unbilled-work row. Rows are keyed (employee × project) for the
 * TIME part; a project's unbilled EXPENSES form their own rows with
 * employeeId null (expenses are incurred by the project, not a user) — so
 * every money figure appears exactly once and Σ rows = the honest total.
 *
 * All amounts are the §67 subset (APPROVED + billable + billingStatus ∉
 * {RESERVED, INVOICED}) — the same subset Modules 13/15 call unbilled; this
 * report never redefines it.
 */
export interface UnbilledReportRow {
  /** Null on expense rows (§34 — expenses have no employee). */
  employeeId: string | null;
  employeeName: string | null;
  projectId: string;
  projectName: string | null;
  clientName: string | null;
  currency: string;
  /** Unbilled approved billable hours (minutes/60); 0 on expense rows. */
  hours: number;
  /** Σ calculatedBillableAmount over the row's unbilled time; 0 on expense rows. */
  timeAmount: number;
  /** Σ clientChargeAmount over the project's unbilled expenses; 0 on time rows. */
  expenseAmount: number;
  /** timeAmount + expenseAmount for THIS row. */
  totalUnbilled: number;
}

/** §34 — unbilled summary (the revenue-leakage headline). */
export interface UnbilledReportSummary {
  rowCount: number;
  currency: string | null;
  mixedCurrencies: boolean;
  totalUnbilledTime: number | null;
  totalUnbilledExpense: number | null;
  totalUnbilled: number | null;
}

/**
 * §35 — one receivables row. A 1:1 pass-through of Module 14's
 * ReceivableInvoiceRow (§96 — the derived fields age/aging/status are the
 * ENGINE's, never recomputed here) plus display names resolved server-side.
 */
export interface ReceivableReportRow {
  invoiceId: string;
  invoiceNumber: string | null;
  clientId: string;
  clientName: string | null;
  projectId: string | null;
  projectName: string | null;
  dueDate: BusinessDate;
  /** §89 — days past due (0 when not yet due). */
  ageDays: number;
  agingBucket: AgingBucket;
  /** Stored invoice state. */
  status: string;
  /** §91 — the operational verdict the report sorts/filters on. */
  displayStatus: string;
  total: number;
  paid: number;
  outstanding: number;
  currency: string;
}

/** §35 — receivables summary (all engine-owned numbers, §105). */
export interface ReceivableReportSummary {
  openInvoiceCount: number;
  currency: string | null;
  mixedCurrencies: boolean;
  outstanding: number | null;
  dueSoon: number | null;
  overdueAmount: number | null;
  overdueCount: number;
}

// ---------- report pagination + payload envelope (§39) ----------

/** §39 — server-side pagination metadata. `total` is the FULL filtered row
 *  count (summaries are computed over ALL filtered rows, never the page — a
 *  page summary that changes with offset would be a lie). */
export interface ReportPagination {
  total: number;
  limit: number;
  offset: number;
}

/** The §37 payload envelope: a page of rows, the full-set summary, and
 *  pagination. CSV export (§41) serializes the same shape without the page
 *  slice, so table, CSV and PDF can never disagree. */
export interface ReportPayload<Row, Summary> {
  rows: Row[];
  summary: Summary;
  pagination: ReportPagination;
}

// ---------- pure presentation helpers (no financial truth) ----------

/**
 * §32 — utilization = billable / total × 100, computed on the MINUTES domain
 * (§14 — minutes are the stored unit) and 0 when total = 0. Pure presentation
 * arithmetic over engine minutes; carries no money semantics.
 */
export function utilizationPercent(billableMinutes: number, totalMinutes: number): number {
  if (totalMinutes <= 0) return 0;
  return (billableMinutes / totalMinutes) * 100;
}

/** §32 — row helper: hours from engine minutes + the §32 utilization rule. */
export function timeRowFromMinutes(
  userId: string,
  userName: string | null,
  billableMinutes: number,
  totalMinutes: number
): TimeReportRow {
  return {
    userId,
    userName,
    billableHours: hoursFromMinutes(billableMinutes),
    nonBillableHours: hoursFromMinutes(Math.max(0, totalMinutes - billableMinutes)),
    totalHours: hoursFromMinutes(totalMinutes),
    utilizationPercent: utilizationPercent(billableMinutes, totalMinutes),
  };
}
