/**
 * Agency Vertical — Reports: CSV export (Module 16, §37/§41)
 *
 * ONE code path, by design: the CSV endpoint runs the SAME report functions
 * with the SAME filter parsing as the JSON routes, so "CSV must match
 * visible table values" (§41) is true by construction — there is no second
 * place the numbers could come from. The PDF takes the same snapshot one
 * step further: it prints the rendered page (window.print), and the page
 * renders this same payload.
 *
 * CSV discipline: RFC-4180-style quoting (a field containing a comma,
 * quote, CR or LF is wrapped in double quotes with inner quotes doubled);
 * a header row from the column labels; one row per report row; null money/
 * margin renders as empty (never a fabricated 0); numbers render plainly
 * (no thousands separators — spreadsheet-safe).
 */
import type { AgencyReportFilters } from './types';
import { getPortfolioReport } from './portfolio';
import { getProfitabilityReport } from './profitability';
import { getTimeReport } from './time';
import { getUnbilledReport } from './unbilled';
import { getReceivablesReport } from './receivables';
import type { AgingBucket } from '../types/dates';
import { PROJECT_STATUSES } from '../types/project';

/** §37 — the five report names, and their §114 permission requirement. */
export const REPORT_NAMES = ['portfolio', 'project-profitability', 'time', 'unbilled', 'receivables'] as const;
export type ReportName = (typeof REPORT_NAMES)[number];

/** Cost/margin reports need agency.profitability.read; the rest ride
 *  agency.dashboard.read (same matrix as the JSON routes). */
export const COST_REPORTS: readonly ReportName[] = ['portfolio', 'project-profitability'];

export function isReportName(value: string): value is ReportName {
  return (REPORT_NAMES as readonly string[]).includes(value);
}

/**
 * The per-report filter contract — ONE definition shared by the JSON routes
 * and the CSV endpoint, so the two can never drift apart (§41: filters must
 * apply consistently to UI, CSV and PDF). Each JSON route imports its entry;
 * the export route looks its entry up by name.
 */
export interface ReportRouteRules {
  /** Legal status values (absent = the report takes no status filter). */
  allowedStatuses?: readonly string[];
  /** Common filters this report rejects (a present one is a 400). */
  disallow: readonly ('clientId' | 'projectId' | 'userId' | 'currency' | 'from' | 'to' | 'status')[];
  /** §33 — the time report's basis param. */
  supportsBasis?: boolean;
  /** §35 — the receivables report's agingBucket param. */
  supportsAgingBucket?: boolean;
}

export const REPORT_ROUTE_RULES: Record<ReportName, ReportRouteRules> = {
  portfolio: {
    allowedStatuses: PROJECT_STATUSES,
    disallow: ['userId'],
  },
  'project-profitability': {
    allowedStatuses: PROJECT_STATUSES,
    disallow: ['userId'],
  },
  time: {
    disallow: ['currency', 'status'],
    supportsBasis: true,
  },
  unbilled: {
    disallow: ['from', 'to', 'status'],
  },
  receivables: {
    allowedStatuses: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'],
    disallow: ['userId'],
    supportsAgingBucket: true,
  },
};

/** One CSV column: a header label + how to read a row's value. */
interface CsvColumn<Row> {
  label: string;
  value: (row: Row) => string | number | null | undefined;
}

/** §34 note — the unbilled CSV's Employee column shows the project-level
 *  expense rows as "(project)" so an empty name never looks like missing
 *  data. */
const orDash = (v: string | null | undefined) => (v === null || v === undefined || v === '' ? '—' : v);
const num = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));

const PORTFOLIO_COLUMNS: readonly CsvColumn<import('./types').PortfolioReportRow>[] = [
  { label: 'Project', value: r => r.projectName },
  { label: 'Client', value: r => orDash(r.clientName) },
  { label: 'Status', value: r => r.status },
  { label: 'Currency', value: r => r.currency },
  { label: 'Contract Value', value: r => num(r.contractValue) },
  { label: 'Applicable Revenue', value: r => num(r.applicableRevenue) },
  { label: 'Billed', value: r => num(r.billedAmount) },
  { label: 'Collected', value: r => num(r.collectedAmount) },
  { label: 'Delivery Cost', value: r => num(r.deliveryCost) },
  { label: 'Profit', value: r => num(r.profit) },
  { label: 'Margin %', value: r => num(r.marginPercent) },
];

const PROFITABILITY_COLUMNS: readonly CsvColumn<import('./types').ProfitabilityReportRow>[] = [
  { label: 'Project', value: r => r.projectName },
  { label: 'Client', value: r => orDash(r.clientName) },
  { label: 'Currency', value: r => r.currency },
  { label: 'Contract', value: r => num(r.contractValue) },
  { label: 'Revenue', value: r => num(r.applicableRevenue) },
  { label: 'Labor Cost', value: r => num(r.laborCost) },
  { label: 'Expense Cost', value: r => num(r.expenseCost) },
  { label: 'Delivery Cost', value: r => num(r.deliveryCost) },
  { label: 'Profit', value: r => num(r.profit) },
  { label: 'Margin', value: r => num(r.marginPercent) },
  { label: 'Planned Hours', value: r => num(r.plannedHours) },
  { label: 'Actual Hours', value: r => num(r.actualHours) },
];

const TIME_COLUMNS: readonly CsvColumn<import('./types').TimeReportRow>[] = [
  { label: 'Employee', value: r => orDash(r.userName) },
  { label: 'Billable Hours', value: r => num(r.billableHours) },
  { label: 'Non-Billable Hours', value: r => num(r.nonBillableHours) },
  { label: 'Total Hours', value: r => num(r.totalHours) },
  { label: 'Utilization %', value: r => num(r.utilizationPercent) },
];

const UNBILLED_COLUMNS: readonly CsvColumn<import('./types').UnbilledReportRow>[] = [
  { label: 'Employee', value: r => (r.employeeId === null ? '(project)' : orDash(r.employeeName)) },
  { label: 'Project', value: r => orDash(r.projectName) },
  { label: 'Client', value: r => orDash(r.clientName) },
  { label: 'Currency', value: r => r.currency },
  { label: 'Hours', value: r => num(r.hours) },
  { label: 'Time Amount', value: r => num(r.timeAmount) },
  { label: 'Expense Amount', value: r => num(r.expenseAmount) },
  { label: 'Total Unbilled', value: r => num(r.totalUnbilled) },
];

const RECEIVABLES_COLUMNS: readonly CsvColumn<import('./types').ReceivableReportRow>[] = [
  { label: 'Client', value: r => orDash(r.clientName) },
  { label: 'Invoice', value: r => orDash(r.invoiceNumber) },
  { label: 'Project', value: r => orDash(r.projectName) },
  { label: 'Currency', value: r => r.currency },
  { label: 'Invoice Total', value: r => num(r.total) },
  { label: 'Paid', value: r => num(r.paid) },
  { label: 'Outstanding', value: r => num(r.outstanding) },
  { label: 'Due Date', value: r => r.dueDate },
  { label: 'Aging', value: r => r.agingBucket },
  { label: 'Status', value: r => r.displayStatus },
];

/** Quote one CSV field when it contains a delimiter, quote, or line break. */
function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Serialize rows to CSV text with a header line (RFC-4180-style quoting). */
export function toCsv<Row>(rows: readonly Row[], columns: readonly CsvColumn<Row>[]): string {
  const header = columns.map(c => csvField(c.label)).join(',');
  const body = rows.map(row =>
    columns.map(c => csvField(c.value(row) === null || c.value(row) === undefined ? '' : String(c.value(row)))).join(',')
  );
  return [header, ...body].join('\r\n');
}

/** Everything the export endpoint needs to produce one report's CSV. */
export interface ReportExportResult {
  csv: string;
  filename: string;
  rowCount: number;
}

/**
 * Run one report and serialize its FULL filtered row set to CSV. The page
 * slice is bypassed (limit = the pagination cap) — same query, same filters,
 * every row. `filters` arrive ALREADY parsed by the same parseReportFilters
 * call the JSON routes use; the basis (§33) and agingBucket extras are
 * passed through verbatim.
 */
export async function exportReportCsv(
  report: ReportName,
  tenantId: string,
  filters: AgencyReportFilters,
  extras: { basis?: 'FINANCIAL' | 'OPERATIONAL'; agingBucket?: AgingBucket } = {}
): Promise<ReportExportResult> {
  const page = { limit: 1000, offset: 0 };
  const today = new Date().toISOString().slice(0, 10);

  switch (report) {
    case 'portfolio': {
      const { rows, pagination } = await getPortfolioReport(tenantId, filters, page);
      return {
        csv: toCsv(rows, PORTFOLIO_COLUMNS),
        filename: `agency-portfolio-report-${today}.csv`,
        // rows.length, not pagination.total — the page is capped at the
        // pagination maximum, so a filtered set larger than that exports
        // capped rows and must never claim more.
        rowCount: rows.length,
      };
    }
    case 'project-profitability': {
      const { rows } = await getProfitabilityReport(tenantId, filters, page);
      return {
        csv: toCsv(rows, PROFITABILITY_COLUMNS),
        filename: `agency-profitability-report-${today}.csv`,
        rowCount: rows.length,
      };
    }
    case 'time': {
      const { rows } = await getTimeReport(tenantId, filters, extras.basis ?? 'FINANCIAL', page);
      return {
        csv: toCsv(rows, TIME_COLUMNS),
        filename: `agency-time-report-${today}.csv`,
        rowCount: rows.length,
      };
    }
    case 'unbilled': {
      const { rows } = await getUnbilledReport(tenantId, filters, page);
      return {
        csv: toCsv(rows, UNBILLED_COLUMNS),
        filename: `agency-unbilled-report-${today}.csv`,
        rowCount: rows.length,
      };
    }
    case 'receivables': {
      const { rows } = await getReceivablesReport(
        tenantId, { ...filters, ...(extras.agingBucket !== undefined && { agingBucket: extras.agingBucket }) }, page
      );
      return {
        csv: toCsv(rows, RECEIVABLES_COLUMNS),
        filename: `agency-receivables-report-${today}.csv`,
        rowCount: rows.length,
      };
    }
  }
}
