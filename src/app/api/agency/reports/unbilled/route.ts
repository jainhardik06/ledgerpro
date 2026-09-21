import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { getUnbilledReport } from '@/lib/agency/reports/unbilled';
import { parseReportFilters } from '@/lib/agency/reports/filters';
import { parseReportPagination } from '@/lib/agency/reports/pagination';
import { REPORT_ROUTE_RULES } from '@/lib/agency/reports/export';
import { trackNamedOperation } from '@/lib/agency/analytics/observability';

export const dynamic = 'force-dynamic';

/**
 * GET /api/agency/reports/unbilled (Module 16 §34/§37)
 *
 * The §34 Unbilled Work report: approved billable unbilled time (per
 * employee × project) + approved billable unbilled expenses (per project) —
 * the §67 subset the Module 13 engine and Module 15 alerts use, never
 * redefined here (§41).
 *
 * Filters (§28): ?clientId, ?projectId, ?userId (time rows only), ?currency.
 * from/to/status are not meaningful (unbilled is a position, not a flow)
 * and are 400s. Pagination (§39): ?limit (1..1000, default 50) & ?offset;
 * summary over ALL filtered rows.
 *
 * Unbilled amounts are REVENUE-side (what the client owes us for work done)
 * — the operational class, riding agency.dashboard.read like the Module 15
 * unbilled alerts, not the cost-side profitability gate.
 */
export async function GET(req: NextRequest) {
  const gate = await requireAgencyPermission('agency.dashboard.read');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const tenantId = gate.context.tenant.id || (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });
  const session = gate.context.session;

  const { searchParams } = new URL(req.url);

  const parsedFilters = parseReportFilters(searchParams, {
    disallow: REPORT_ROUTE_RULES.unbilled.disallow,
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
      'agency_reports_query_duration', tenantId, { query: 'getUnbilledReport' },
      () => getUnbilledReport(tenantId, parsedFilters.value.filters, parsedPage.value)
    );

    await createLog(
      session.username, 'AGENCY_REPORT_READ',
      `Unbilled work report generated: ${report.pagination.total} row(s)`,
      tenantId, firstClientIp(req)
    ).catch(() => undefined);

    return NextResponse.json({ success: true, report });
  } catch (error) {
    logError('agency:unbilled report error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to generate unbilled report' }, { status: 500 });
  }
}
