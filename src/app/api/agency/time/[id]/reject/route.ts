import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { rejectTimeEntry } from '@/lib/agency/domain/agency.time';

export const dynamic = 'force-dynamic';

/**
 * POST /api/agency/time/:id/reject (Module 7 §20/§30)
 *
 * SUBMITTED|APPROVED → REJECTED. Body: { reason } — required (§20). Authority
 * is the domain's (§21, same tier as approve). The entry returns to the
 * editable state; editing moves it back to DRAFT.
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
    const body = await req.json().catch(() => ({}));
    const ipAddress = firstClientIp(req);
    const result = await rejectTimeEntry(id, tenantId, body.reason, {
      username: session.username,
      tenantId,
      log: (action, detail) => createLog(session.username, action, detail, tenantId, ipAddress),
    }, { userId: session.userId, role: session.role });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true, timeEntry: result.data });
  } catch (error) {
    logError('agency:reject time entry error', error, { tenantId, timeEntryId: id });
    return NextResponse.json({ error: 'Failed to reject time entry' }, { status: 500 });
  }
}
