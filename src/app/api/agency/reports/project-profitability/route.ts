import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { getProfitabilityReport } from '@/lib/agency/reports/profitability';
import { parseReportFilters } from '@/lib/agency/reports/filters';
import { parseReportPagination } from '@/lib/agency/reports/pagination';
import { REPORT_ROUTE_RULES } from '@/lib/agency/reports/export';
import { trackNamedOperation } from '@/lib/agency/analytics/observability';

export const dynamic = 'force-dynamic';

/**
 * GET /api/agency/reports/project-profitability (Module 16 §31/§37)
 *
 * The §31 Project Profitability report — the Module 13 engine's rows in the
 * cost-split lens: contract, revenue, labor cost, expense cost, delivery
 * cost, profit, margin, planned hours, actual hours. No formulas are
 * duplicated here (§31); the report reconciles with
 * /api/agency/profitability by construction (§41).
 *
 * Filters (§28): ?from & ?to (project start-date window), ?clientId,
 * ?status (project lifecycle), ?projectId, ?currency. userId is 400.
 * Pagination (§39): ?limit (1..1000, default 50) & ?offset; summary over
 * ALL filtered rows.
 *
 * §114 — labor cost is salary economics: gated on
 * agency.profitability.read.
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
    allowedStatuses: REPORT_ROUTE_RULES['project-profitability'].allowedStatuses,
    disallow: REPORT_ROUTE_RULES['project-profitability'].disallow,
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
      'agency_reports_query_duration', tenantId, { query: 'getProfitabilityReport' },
      () => getProfitabilityReport(tenantId, parsedFilters.value.filters, parsedPage.value)
    );

    await createLog(
      session.username, 'AGENCY_REPORT_READ',
      `Project profitability report generated: ${report.pagination.total} project(s)`,
      tenantId, firstClientIp(req)
    ).catch(() => undefined);

    return NextResponse.json({ success: true, report });
  } catch (error) {
    logError('agency:profitability report error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to generate profitability report' }, { status: 500 });
  }
}
