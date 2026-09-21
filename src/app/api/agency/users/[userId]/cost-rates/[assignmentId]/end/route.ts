import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { endUserCostRate } from '@/lib/agency/domain/agency.rates';

export const dynamic = 'force-dynamic';

/**
 * /api/agency/users/:userId/cost-rates/:assignmentId/end (spec §101, Module 6)
 *
 *   POST — close an open-ended assignment. `date` query param sets the end
 *          (default: today in the tenant's timezone); history stays readable.
 */
type RouteContext = { params: Promise<{ userId: string; assignmentId: string }> };

export async function POST(req: NextRequest, ctx: RouteContext) {
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
    const date = new URL(req.url).searchParams.get('date') ?? undefined;
    const ipAddress = firstClientIp(req);
    const result = await endUserCostRate(tenantId, userId, assignmentId, {
      username: session.username,
      tenantId,
      log: (action: string, detail: string) => createLog(session.username, action, detail, tenantId, ipAddress),
    }, date);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    logError('agency:end user cost rate error', error, { tenantId, userId, assignmentId });
    return NextResponse.json({ error: 'Failed to end cost rate' }, { status: 500 });
  }
}
