import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { getReceivablesReport } from '@/lib/agency/reports/receivables';
import { parseReportFilters } from '@/lib/agency/reports/filters';
import { parseReportPagination } from '@/lib/agency/reports/pagination';
import { REPORT_ROUTE_RULES } from '@/lib/agency/reports/export';
import { trackNamedOperation } from '@/lib/agency/analytics/observability';
import type { AgingBucket } from '@/lib/agency/types/dates';

export const dynamic = 'force-dynamic';

const AGING_BUCKETS: readonly AgingBucket[] = ['CURRENT', '1-30', '31-60', '61-90', '90+'];

/**
 * GET /api/agency/reports/receivables (Module 16 §35/§37)
 *
 * The §35 Receivables report over Module 14's engine: client / invoice /
 * project, total, paid, outstanding, due date, aging bucket, status —
 * reconciling with /api/agency/receivables by construction (§41).
 *
 * Filters (§28): ?clientId, ?projectId, ?status (operational: SENT,
 * PARTIALLY_PAID, OVERDUE), ?from & ?to (due-date window, §96), ?currency,
 * plus the report-specific ?agingBucket. userId is 400. Pagination (§39):
 * ?limit (1..1000, default 50) & ?offset; summary over ALL filtered rows.
 *
 * Cash-side money (who owes us) — the operational class, riding
 * agency.dashboard.read exactly like the Module 14 routes and the Module 15
 * cash alerts.
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
    allowedStatuses: REPORT_ROUTE_RULES.receivables.allowedStatuses,
    disallow: REPORT_ROUTE_RULES.receivables.disallow,
  });
  if (!parsedFilters.ok) {
    return NextResponse.json({ error: parsedFilters.error }, { status: 400 });
  }

  // Report-specific §35 filter — the aging bucket (engine-owned boundaries).
  const bucket = searchParams.get('agingBucket');
  if (bucket !== null && !(AGING_BUCKETS as readonly string[]).includes(bucket)) {
    return NextResponse.json({ error: `agingBucket must be one of ${AGING_BUCKETS.join(', ')}` }, { status: 400 });
  }

  const parsedPage = parseReportPagination(searchParams);
  if (!parsedPage.ok) {
    return NextResponse.json({ error: parsedPage.error }, { status: 400 });
  }

  try {
    const report = await trackNamedOperation(
      'agency_reports_query_duration', tenantId, { query: 'getReceivablesReport' },
      () => getReceivablesReport(
        tenantId,
        {
          ...parsedFilters.value.filters,
          ...(bucket !== null && { agingBucket: bucket as AgingBucket }),
        },
        parsedPage.value
      )
    );

    await createLog(
      session.username, 'AGENCY_REPORT_READ',
      `Receivables report generated: ${report.pagination.total} invoice(s)`,
      tenantId, firstClientIp(req)
    ).catch(() => undefined);

    return NextResponse.json({ success: true, report });
  } catch (error) {
    logError('agency:receivables report error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to generate receivables report' }, { status: 500 });
  }
}
