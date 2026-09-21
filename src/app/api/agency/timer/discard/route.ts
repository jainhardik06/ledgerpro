import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { discardTimer } from '@/lib/agency/domain/agency.time';

export const dynamic = 'force-dynamic';

/**
 * POST /api/agency/timer/discard (Module 7 §9/§30)
 *
 * RUNNING → DISCARDED: the honest third state for an abandoned session. No
 * TimeEntry is created; the audit trail records the discard.
 */
export async function POST(req: NextRequest) {
  const gate = await requireAgencyPermission('agency.time.write');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const tenantId = gate.context.tenant.id || (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });
  const session = gate.context.session;

  try {
    const ipAddress = firstClientIp(req);
    const result = await discardTimer(tenantId, {
      username: session.username,
      tenantId,
      log: (action, detail) => createLog(session.username, action, detail, tenantId, ipAddress),
    }, { userId: session.userId, role: session.role });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true, timerSession: result.data });
  } catch (error) {
    logError('agency:discard timer error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to discard timer' }, { status: 500 });
  }
}
