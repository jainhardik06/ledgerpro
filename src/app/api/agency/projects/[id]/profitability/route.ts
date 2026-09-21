import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { getProjectProfitabilityReport } from '@/lib/agency/profitability';
import { trackNamedOperation } from '@/lib/agency/analytics/observability';

export const dynamic = 'force-dynamic';

/**
 * GET /api/agency/projects/:id/profitability (Module 13 §80)
 *
 * The §68 ProjectProfitability snapshot for one project, plus the §78
 * drill-down (labor by member × frozen rate, expenses by vendor). §70: the
 * calculation happens entirely in the financial engine — the UI renders this
 * payload, it never re-derives a number.
 *
 * Fail-closed (documented once): unlike the always-render dashboard, a
 * profitability report whose source query fails is a 500 — never a
 * partially-fabricated margin.
 *
 * §114 — project profitability rides agency.profitability.read (admin/
 * finance), not agency.dashboard.read: the drill-down exposes labor cost
 * by member (§78), which is salary economics (§63).
 */
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  const gate = await requireAgencyPermission('agency.profitability.read');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const tenantId = gate.context.tenant.id || (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });
  const session = gate.context.session;
  const { id } = await ctx.params;

  try {
    // §116 — profitability_query_duration: the §78 drill-down query is timed
    // on success and failure alike (fire-and-forget telemetry).
    const report = await trackNamedOperation(
      'agency_profitability_query_duration', tenantId, { query: 'getProjectProfitabilityReport' },
      () => getProjectProfitabilityReport(tenantId, id)
    );
    if (!report) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    await createLog(
      session.username, 'AGENCY_PROFITABILITY_READ',
      `Project profitability report generated: ${report.profitability.projectName} — revenue ${report.profitability.applicableRevenue.amount} ${report.profitability.currency}, cost ${report.profitability.deliveryCost.amount}, health ${report.profitability.health}`,
      tenantId, firstClientIp(req)
    ).catch(() => undefined);

    return NextResponse.json({
      success: true,
      project: {
        id: report.project.id,
        name: report.project.name,
        clientId: report.project.clientId,
        billingModel: report.project.billingModel,
        status: report.project.status,
        currency: report.project.currency,
      },
      profitability: report.profitability,
      drillDown: report.drillDown,
    });
  } catch (error) {
    logError('agency:project profitability error', error, { tenantId, projectId: id });
    return NextResponse.json({ error: 'Failed to load project profitability' }, { status: 500 });
  }
}
