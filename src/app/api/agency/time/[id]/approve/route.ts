import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { approveTimeEntry } from '@/lib/agency/domain/agency.time';

export const dynamic = 'force-dynamic';

/**
 * POST /api/agency/time/:id/approve (Module 7 §21/§23/§30)
 *
 * SUBMITTED → APPROVED. Authority lives in the DOMAIN (§21): admins or the
 * project's manager — never the entry's author. The route gate is the base
 * write capability so the PM tier (a USER who manages the project) can
 * reach the domain check; everyone else gets its 403. Economics compute
 * here, from the frozen snapshots (§23).
 */
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteContext) {
  const gate = await requireAgencyPermission('agency.time.write');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const tenantId = gate.context.tenant.id || (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });
  const session = gate.context.session;
  const { id } = await ctx.params;

  try {
    const ipAddress = firstClientIp(req);
    const result = await approveTimeEntry(id, tenantId, {
      username: session.username,
      tenantId,
      log: (action, detail) => createLog(session.username, action, detail, tenantId, ipAddress),
    }, { userId: session.userId, role: session.role });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true, timeEntry: result.data });
  } catch (error) {
    logError('agency:approve time entry error', error, { tenantId, timeEntryId: id });
    return NextResponse.json({ error: 'Failed to approve time entry' }, { status: 500 });
  }
}
