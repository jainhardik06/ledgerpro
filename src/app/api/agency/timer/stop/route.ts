import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { stopTimer } from '@/lib/agency/domain/agency.time';
import { redactEntryCost } from '@/lib/agency/types/time';

export const dynamic = 'force-dynamic';

/**
 * POST /api/agency/timer/stop (Module 7 §8/§12/§13/§30)
 *
 * Stops the caller's RUNNING session. Body: {} (halt only — the response
 * carries elapsedMinutes for the review form) or { review: { billable,
 * notes?, durationMinutes?, workItemId? } } (stop → review → save in one
 * step: the DRAFT TimeEntry is created with today's date §13). The review
 * override can only adjust DOWN from the real elapsed time (Rule 6).
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
    const body = await req.json().catch(() => ({}));
    const ipAddress = firstClientIp(req);
    const result = await stopTimer(tenantId, body, {
      username: session.username,
      tenantId,
      log: (action, detail) => createLog(session.username, action, detail, tenantId, ipAddress),
    }, { userId: session.userId, role: session.role });
    if (!result.ok || !result.data) {
      return NextResponse.json({ error: result.error, ...(result.code && { code: result.code }) }, { status: result.status });
    }
    const data = result.data;
    const isAdmin = session.role === 'SUPER_ADMIN' || session.role === 'TENANT_ADMIN';
    return NextResponse.json({
      success: true,
      timerSession: data.session,
      elapsedMinutes: data.elapsedMinutes,
      ...(data.entry && { timeEntry: isAdmin ? data.entry : redactEntryCost(data.entry) }),
    });
  } catch (error) {
    logError('agency:stop timer error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to stop timer' }, { status: 500 });
  }
}
