import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { getTimeReport } from '@/lib/agency/reports/time';
import { parseReportFilters } from '@/lib/agency/reports/filters';
import { parseReportPagination } from '@/lib/agency/reports/pagination';
import { REPORT_ROUTE_RULES } from '@/lib/agency/reports/export';
import { trackNamedOperation } from '@/lib/agency/analytics/observability';
import type { TimeReportBasis } from '@/lib/agency/reports/types';

export const dynamic = 'force-dynamic';

const BASES: readonly TimeReportBasis[] = ['FINANCIAL', 'OPERATIONAL'];

/**
 * GET /api/agency/reports/time?basis=FINANCIAL (Module 16 §32/§33/§37)
 *
 * The §32 Time report: per-employee billable/non-billable hours and
 * utilization (0% when total = 0, never NaN).
 *
 * §33 — the basis is EXPLICIT: ?basis=FINANCIAL (default) counts APPROVED
 * entries only; ?basis=OPERATIONAL counts all recorded time. The two are
 * never mixed, so unapproved entries can never reach a financial view.
 *
 * Filters (§28): ?from & ?to (entry-date window), ?clientId, ?projectId,
 * ?userId. currency/status are not meaningful here (400). Pagination (§39):
 * ?limit (1..1000, default 50) & ?offset; summary over ALL filtered rows.
 *
 * Hours are currency-free and carry no cost/billable money: the route rides
 * agency.dashboard.read (the operational class, like the time pages).
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

  const basisRaw = searchParams.get('basis');
  if (basisRaw !== null && !(BASES as readonly string[]).includes(basisRaw)) {
    return NextResponse.json({ error: 'basis must be one of FINANCIAL, OPERATIONAL' }, { status: 400 });
  }
  const basis: TimeReportBasis = (basisRaw as TimeReportBasis) ?? 'FINANCIAL';

  const parsedFilters = parseReportFilters(searchParams, {
    disallow: REPORT_ROUTE_RULES.time.disallow,
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
      'agency_reports_query_duration', tenantId, { query: 'getTimeReport' },
      () => getTimeReport(tenantId, parsedFilters.value.filters, basis, parsedPage.value)
    );

    await createLog(
      session.username, 'AGENCY_REPORT_READ',
      `Time report generated (${basis}): ${report.pagination.total} employee(s)`,
      tenantId, firstClientIp(req)
    ).catch(() => undefined);

    return NextResponse.json({ success: true, report });
  } catch (error) {
    logError('agency:time report error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to generate time report' }, { status: 500 });
  }
}
