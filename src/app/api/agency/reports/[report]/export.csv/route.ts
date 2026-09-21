import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission, can } from '@/lib/agency/permissions/authorization';
import { asAuthorizedUser } from '@/lib/agency/types/permissions';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import {
  exportReportCsv, isReportName, COST_REPORTS, REPORT_ROUTE_RULES,
} from '@/lib/agency/reports/export';
import { parseReportFilters } from '@/lib/agency/reports/filters';
import type { AgingBucket } from '@/lib/agency/types/dates';

export const dynamic = 'force-dynamic';

const AGING_BUCKETS: readonly AgingBucket[] = ['CURRENT', '1-30', '31-60', '61-90', '90+'];
const BASES: readonly string[] = ['FINANCIAL', 'OPERATIONAL'];

/**
 * GET /api/agency/reports/:report/export.csv (Module 16 §37/§41)
 *
 * Server-side CSV of a report's FULL filtered row set. ONE code path: this
 * endpoint runs the same report functions through the same
 * parseReportFilters + REPORT_ROUTE_RULES the JSON routes use, so the CSV
 * matches the visible table by construction — there is no second place the
 * numbers could come from. The printed PDF is the same snapshot again: the
 * UI page rendering this payload is what gets printed.
 *
 * :report — portfolio | project-profitability | time | unbilled |
 * receivables (anything else is a 404).
 *
 * Permission matrix identical to the JSON routes: dashboard.read for the
 * operational/cash reports; portfolio and project-profitability
 * additionally require agency.profitability.read (§114 — cost and margin
 * are salary economics).
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ report: string }> }
) {
  const { report: rawName } = await ctx.params;
  if (!isReportName(rawName)) {
    return NextResponse.json({ error: 'Unknown report' }, { status: 404 });
  }
  const report = rawName;

  const gate = await requireAgencyPermission('agency.dashboard.read');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  // §114 — cost/margin reports need the profitability gate on top.
  if (COST_REPORTS.includes(report)) {
    const permitted = can(asAuthorizedUser(gate.context.session), 'agency.profitability.read');
    if (!permitted) {
      return NextResponse.json({ error: 'Not authorized to read cost reports' }, { status: 403 });
    }
  }
  const tenantId = gate.context.tenant.id || (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });
  const session = gate.context.session;

  const { searchParams } = new URL(req.url);

  // Same filter contract as the JSON route for this report.
  const rules = REPORT_ROUTE_RULES[report];
  const parsedFilters = parseReportFilters(searchParams, {
    ...(rules.allowedStatuses !== undefined && { allowedStatuses: rules.allowedStatuses }),
    disallow: rules.disallow,
  });
  if (!parsedFilters.ok) {
    return NextResponse.json({ error: parsedFilters.error }, { status: 400 });
  }

  // Report-specific params — same validation as the JSON routes.
  const extras: { basis?: 'FINANCIAL' | 'OPERATIONAL'; agingBucket?: AgingBucket } = {};
  if (rules.supportsBasis) {
    const basisRaw = searchParams.get('basis');
    if (basisRaw !== null && !BASES.includes(basisRaw)) {
      return NextResponse.json({ error: 'basis must be one of FINANCIAL, OPERATIONAL' }, { status: 400 });
    }
    if (basisRaw !== null) extras.basis = basisRaw as 'FINANCIAL' | 'OPERATIONAL';
  }
  if (rules.supportsAgingBucket) {
    const bucket = searchParams.get('agingBucket');
    if (bucket !== null && !(AGING_BUCKETS as readonly string[]).includes(bucket)) {
      return NextResponse.json({ error: `agingBucket must be one of ${AGING_BUCKETS.join(', ')}` }, { status: 400 });
    }
    if (bucket !== null) extras.agingBucket = bucket as AgingBucket;
  }

  try {
    const result = await exportReportCsv(report, tenantId, parsedFilters.value.filters, extras);

    await createLog(
      session.username, 'AGENCY_REPORT_EXPORTED',
      `${report} report exported to CSV: ${result.rowCount} row(s)`,
      tenantId, firstClientIp(req)
    ).catch(() => undefined);

    return new NextResponse(result.csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${result.filename}"`,
        // The row count rides along so the caller can verify completeness.
        'X-Row-Count': String(result.rowCount),
      },
    });
  } catch (error) {
    logError('agency:report csv export error', error, { tenantId, report });
    return NextResponse.json({ error: 'Failed to export report' }, { status: 500 });
  }
}
