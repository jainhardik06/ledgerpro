import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { startTimer } from '@/lib/agency/domain/agency.time';

export const dynamic = 'force-dynamic';

/**
 * POST /api/agency/timer/start (Module 7 §8/§11/§30)
 *
 * Starts the caller's one durable timer session. Body: { projectId,
 * workItemId? }. A RUNNING session already existing → 409 TIMER_ALREADY_RUNNING
 * (§11 — the UI prompts stop/review).
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
    const result = await startTimer(tenantId, body, {
      username: session.username,
      tenantId,
      log: (action, detail) => createLog(session.username, action, detail, tenantId, ipAddress),
    }, { userId: session.userId, role: session.role });
    if (!result.ok) {
      return NextResponse.json({ error: result.error, ...(result.code && { code: result.code }) }, { status: result.status });
    }
    return NextResponse.json({ success: true, timerSession: result.data }, { status: 201 });
  } catch (error) {
    logError('agency:start timer error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to start timer' }, { status: 500 });
  }
}
