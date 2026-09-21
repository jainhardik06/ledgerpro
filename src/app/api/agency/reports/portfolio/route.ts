import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { getPortfolioReport } from '@/lib/agency/reports/portfolio';
import { parseReportFilters } from '@/lib/agency/reports/filters';
import { parseReportPagination } from '@/lib/agency/reports/pagination';
import { REPORT_ROUTE_RULES } from '@/lib/agency/reports/export';
import { trackNamedOperation } from '@/lib/agency/analytics/observability';

export const dynamic = 'force-dynamic';

/**
 * GET /api/agency/reports/portfolio (Module 16 §29/§37)
 *
 * The §29 Portfolio report over Module 13's engine: per-project rows
 * (contract value, applicable revenue, billed, collected, delivery cost,
 * profit, margin) and the weighted-portfolio summary (Σprofit/Σrevenue,
 * §29 — never a naive average of project percentages).
 *
 * Filters (§28): ?from & ?to (project start-date window), ?clientId,
 * ?status (project lifecycle), ?projectId, ?currency. userId is not a
 * portfolio filter (400). Invalid values are 400s, never silent ignores.
 * Pagination (§39): ?limit (1..1000, default 50) & ?offset; the summary is
 * computed over ALL filtered rows, never the page.
 *
 * §114 — cost and margin columns are salary economics: this route is gated
 * on agency.profitability.read, exactly like /api/agency/profitability.
 */
export async function GET(req: NextRequest) {
  const gate = await requireAgencyPermission('agency.profitability.read');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const tenantId = gate.context.tenant.id || (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });
  const session = gate.context.session;

  const { searchParams } = new URL(req.url);

  const parsedFilters = parseReportFilters(searchParams, {
    allowedStatuses: REPORT_ROUTE_RULES.portfolio.allowedStatuses,
    disallow: REPORT_ROUTE_RULES.portfolio.disallow,
  });
  if (!parsedFilters.ok) {
    return NextResponse.json({ error: parsedFilters.error }, { status: 400 });
  }

  const parsedPage = parseReportPagination(searchParams);
  if (!parsedPage.ok) {
    return NextResponse.json({ error: parsedPage.error }, { status: 400 });
  }

  try {
    const report = await trackNamedOperation(
      'agency_reports_query_duration', tenantId, { query: 'getPortfolioReport' },
      () => getPortfolioReport(tenantId, parsedFilters.value.filters, parsedPage.value)
    );

    await createLog(
      session.username, 'AGENCY_REPORT_READ',
      `Portfolio report generated: ${report.pagination.total} project(s)`,
      tenantId, firstClientIp(req)
    ).catch(() => undefined);

    return NextResponse.json({ success: true, report });
  } catch (error) {
    logError('agency:portfolio report error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to generate portfolio report' }, { status: 500 });
  }
}
