import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { updateUserCostRate } from '@/lib/agency/domain/agency.rates';

export const dynamic = 'force-dynamic';

/**
 * /api/agency/users/:userId/cost-rates/:assignmentId (spec §100, Module 6)
 *
 *   PATCH — the assignment's END only: set an effectiveTo, or send
 *          null/'' to re-open it. Re-pointing to a different card is a NEW
 *          assignment (§122 spirit); §77 overlap re-screen applies.
 */
type RouteContext = { params: Promise<{ userId: string; assignmentId: string }> };

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const gate = await requireAgencyPermission('agency.rates.manage');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const tenantId = gate.context.tenant.id || (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });
  const session = gate.context.session;
  const { userId, assignmentId } = await ctx.params;

  try {
    const body = await req.json();
    const ipAddress = firstClientIp(req);
    const result = await updateUserCostRate(tenantId, userId, assignmentId, body, {
      username: session.username,
      tenantId,
      log: (action: string, detail: string) => createLog(session.username, action, detail, tenantId, ipAddress),
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    logError('agency:update user cost rate error', error, { tenantId, userId, assignmentId });
    return NextResponse.json({ error: 'Failed to update cost rate' }, { status: 500 });
  }
}
