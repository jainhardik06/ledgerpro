/**
 * Agency Vertical — Reports: Receivables report (Module 16, §35)
 *
 * §35 — "This should reuse Module 14's receivables engine." It does, and
 * nothing else: getReceivablesMetrics produces the derived fields (ageDays,
 * agingBucket, displayStatus — §102: derived at query time, never stored,
 * never recalculated here), and this module adds ONLY display names and the
 * §37 envelope. The §41 reconciliation with /api/agency/receivables is by
 * construction: same engine, same filters, same "today".
 *
 * Aging buckets are the engine's (§88): CURRENT / 1-30 / 31-60 / 61-90 / 90+.
 */
import { getProjects, getClientById, getTenantById } from '@/lib/db';
import { getReceivablesMetrics, DUE_SOON_WINDOW_DAYS } from '../queries/receivables-summary';
import { todayInTimezone } from '../types/dates';
import { agencyTimezone } from '../domain/agency.settings';
import type { AgingBucket } from '../types/dates';
import type { ReceivablesFilters } from '../types/receivables';
import type {
  AgencyReportFilters, ReceivableReportRow, ReceivableReportSummary, ReportPayload,
} from './types';
import { slicePage } from './pagination';

/**
 * §35 — the Receivables report.
 *
 * Filters (§28): clientId/projectId/status (operational invoice status:
 * SENT, PARTIALLY_PAID, OVERDUE), from/to (the DUE-DATE window, §96),
 * currency, plus the report-specific agingBucket. userId is not meaningful
 * (invoices have no employee) and is rejected by the route.
 *
 * "Today" is resolved in the TENANT timezone on the server (Module 1.16) —
 * exactly like the Module 14 routes, so both surfaces age identically.
 */
export async function getReceivablesReport(
  tenantId: string,
  filters: AgencyReportFilters & { agingBucket?: AgingBucket },
  page: { limit: number; offset: number }
): Promise<ReportPayload<ReceivableReportRow, ReceivableReportSummary>> {
  const engineFilters: ReceivablesFilters = {
    ...(filters.clientId !== undefined && { clientId: filters.clientId }),
    ...(filters.projectId !== undefined && { projectId: filters.projectId }),
    ...(filters.status !== undefined && { status: filters.status as ReceivablesFilters['status'] }),
    ...(filters.agingBucket !== undefined && { agingBucket: filters.agingBucket }),
    ...(filters.from !== undefined && { from: filters.from }),
    ...(filters.to !== undefined && { to: filters.to }),
    ...(filters.currency !== undefined && { currency: filters.currency }),
  };

  // Module 17 §44 — "today" in the tenant's CONFIGURED timezone (stored ⊕
  // defaults), exactly like the Module 14 routes so both surfaces age
  // identically.
  const tenant = await getTenantById(tenantId);
  const today = todayInTimezone(agencyTimezone(tenant));
  const metrics = await getReceivablesMetrics(tenantId, today, DUE_SOON_WINDOW_DAYS, engineFilters);

  // Display names, resolved server-side (null when the entity is gone —
  // §113 of Module 14: never a fabricated name).
  const projects = await getProjects(tenantId, { page: 1, limit: 1000 }, {});
  const projectById = new Map(projects.map(p => [p.id, p]));
  const clientNames = new Map<string, string | null>();
  for (const invoice of metrics.invoices) {
    if (!clientNames.has(invoice.clientId)) {
      const client = await getClientById(invoice.clientId, tenantId);
      clientNames.set(invoice.clientId, client ? client.name : null);
    }
  }

  // Rows keep the engine's most-overdue-first order (§96/§97).
  const rows: ReceivableReportRow[] = metrics.invoices.map(inv => ({
    invoiceId: inv.invoiceId,
    invoiceNumber: inv.invoiceNumber,
    clientId: inv.clientId,
    clientName: clientNames.get(inv.clientId) ?? null,
    projectId: inv.projectId,
    projectName: inv.projectId ? (projectById.get(inv.projectId)?.name ?? null) : null,
    dueDate: inv.dueDate,
    ageDays: inv.ageDays,
    agingBucket: inv.agingBucket,
    status: inv.status,
    displayStatus: inv.displayStatus,
    total: inv.total.amount,
    paid: inv.paid.amount,
    outstanding: inv.due.amount,
    currency: inv.total.currency,
  }));

  const summary: ReceivableReportSummary = {
    openInvoiceCount: metrics.openInvoiceCount,
    currency: metrics.currency,
    mixedCurrencies: metrics.mixedCurrencies,
    outstanding: metrics.outstanding,
    dueSoon: metrics.dueSoon,
    overdueAmount: metrics.overdueAmount,
    overdueCount: metrics.overdueCount,
  };

  const { rows: pageRows, pagination } = slicePage(rows, page.limit, page.offset);
  return { rows: pageRows, summary, pagination };
}
