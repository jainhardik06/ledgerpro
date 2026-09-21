import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { getPortfolioProfitability } from '@/lib/agency/profitability';
import { trackNamedOperation } from '@/lib/agency/analytics/observability';
import { isBusinessDate } from '@/lib/agency/types/dates';
import { PROJECT_STATUSES, type ProjectStatus } from '@/lib/agency/types/project';

export const dynamic = 'force-dynamic';

/**
 * GET /api/agency/profitability (Module 13 §80/§81)
 *
 * The portfolio profitability report: per-project ProjectProfitability rows
 * (problems-first), the client rollup (§81: a derivative of project
 * profitability), and portfolio totals. The Margin-by-Project /
 * Cost-by-Project / Budget-Burn / Unbilled-Work reports are lenses over the
 * SAME rows — one engine, so every report agrees (§70).
 *
 * Filters (§80): ?from= & ?to= (project start-date window, inclusive
 * business dates — profitability is a position, so the window selects WHICH
 * projects, never the money inside them), ?clientId=, ?status= (project
 * lifecycle status). Invalid values are 400s, never silent ignores.
 *
 * §127 — when the portfolio mixes currencies the money totals are null with
 * mixedCurrencies: true (never a converted number); counts stay real.
 *
 * §114 — profitability reads are gated on agency.profitability.read (admin/
 * finance): labor cost is salary economics (§63), the same privacy class as
 * agency.rates.cost.read — not automatically visible to every team member.
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
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const clientId = searchParams.get('clientId');
  const status = searchParams.get('status');

  // Validate — explicit 400s, never silently ignored filters.
  if (from !== null && !isBusinessDate(from)) {
    return NextResponse.json({ error: 'from must be a business date (YYYY-MM-DD)' }, { status: 400 });
  }
  if (to !== null && !isBusinessDate(to)) {
    return NextResponse.json({ error: 'to must be a business date (YYYY-MM-DD)' }, { status: 400 });
  }
  if (from !== null && to !== null && from > to) {
    return NextResponse.json({ error: 'from must not be after to' }, { status: 400 });
  }
  if (status !== null && !(PROJECT_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${PROJECT_STATUSES.join(', ')}` },
      { status: 400 }
    );
  }

  try {
    // §116 — profitability_query_duration: the §70 one-engine report query is
    // timed on success and failure alike (fire-and-forget telemetry).
    const portfolio = await trackNamedOperation(
      'agency_profitability_query_duration', tenantId, { query: 'getPortfolioProfitability' },
      () => getPortfolioProfitability(tenantId, {
        ...(from !== null && { from }),
        ...(to !== null && { to }),
        ...(clientId !== null && clientId !== '' && { clientId }),
        ...(status !== null && { status: status as ProjectStatus }),
      })
    );

    await createLog(
      session.username, 'AGENCY_PROFITABILITY_READ',
      `Portfolio profitability report generated: ${portfolio.summary.projectCount} project(s), ${portfolio.summary.mixedCurrencies ? 'mixed currencies' : `${portfolio.summary.applicableRevenue?.amount ?? 0} ${portfolio.projects[0]?.currency ?? 'INR'} revenue`}`,
      tenantId, firstClientIp(req)
    ).catch(() => undefined);

    return NextResponse.json({ success: true, portfolio });
  } catch (error) {
    logError('agency:portfolio profitability error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to load portfolio profitability' }, { status: 500 });
  }
}
