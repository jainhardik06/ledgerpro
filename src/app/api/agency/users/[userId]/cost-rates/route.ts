import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { assignUserCostRate, listUserCostAssignments } from '@/lib/agency/domain/agency.rates';

export const dynamic = 'force-dynamic';

/**
 * /api/agency/users/:userId/cost-rates (spec §100/§88, Module 6)
 *
 *   GET  — a user's cost-card assignments (§88 Team Member → Cost Rate).
 *          COST-RATE PRIVACY (§99/§104): requires agency.rates.cost.read —
 *          a USER querying this gets 403, assignments reveal cost structure.
 *   POST — assign a cost card entry from a date (agency.rates.manage):
 *          §93 rules, §77 overlap guard, §79 open-ended replacement.
 */
type RouteContext = { params: Promise<{ userId: string }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  const gate = await requireAgencyPermission('agency.rates.cost.read');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const tenantId = gate.context.tenant.id || (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });
  const { userId } = await ctx.params;

  try {
    const includeEnded = new URL(req.url).searchParams.get('includeEnded') === 'true';
    const result = await listUserCostAssignments(tenantId, userId, { includeEnded });
    if (!result.ok || !result.data) {
      return NextResponse.json({ error: result.error ?? 'Failed to fetch cost rates' }, { status: result.status });
    }
    return NextResponse.json({ success: true, assignments: result.data });
  } catch (error) {
    logError('agency:fetch user cost rates error', error, { tenantId, userId });
    return NextResponse.json({ error: 'Failed to fetch cost rates' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const gate = await requireAgencyPermission('agency.rates.manage');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const tenantId = gate.context.tenant.id || (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });
  const session = gate.context.session;
  const { userId } = await ctx.params;

  try {
    const body = await req.json();
    const ipAddress = firstClientIp(req);
    const result = await assignUserCostRate(tenantId, userId, body, {
      username: session.username,
      tenantId,
      log: (action: string, detail: string) => createLog(session.username, action, detail, tenantId, ipAddress),
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true, assignment: result.data }, { status: 201 });
  } catch (error) {
    logError('agency:assign user cost rate error', error, { tenantId, userId });
    return NextResponse.json({ error: 'Failed to assign cost rate' }, { status: 500 });
  }
}
