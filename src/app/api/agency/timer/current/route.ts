import { NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { getProjectById, getProjectWorkItems } from '@/lib/db';
import { logError } from '@/lib/logger';
import { getActiveTimer } from '@/lib/agency/domain/agency.time';

export const dynamic = 'force-dynamic';

/**
 * GET /api/agency/timer/current (Module 7 §10/§12/§30)
 *
 * The caller's RUNNING session, if any, with elapsedMinutes recomputed from
 * startedAt server-side (§12 — the browser tab may have been closed all
 * along; the server is the truth §10). Also returns the project/work-item
 * labels so a reopened tab can rebuild the review form.
 */
export async function GET() {
  const gate = await requireAgencyPermission('agency.time.write');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const tenantId = gate.context.tenant.id || (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });
  const session = gate.context.session;

  try {
    const { session: timerSession, elapsedMinutes } = await getActiveTimer(
      tenantId, { userId: session.userId, role: session.role }
    );
    if (!timerSession) {
      return NextResponse.json({ success: true, timerSession: null, elapsedMinutes: 0 });
    }

    let projectName: string | undefined;
    let workItemName: string | undefined;
    const project = await getProjectById(timerSession.projectId, tenantId);
    if (project) projectName = project.name;
    if (timerSession.workItemId) {
      const items = await getProjectWorkItems(timerSession.projectId, tenantId);
      workItemName = items.find(w => w.id === timerSession.workItemId)?.name;
    }

    return NextResponse.json({ success: true, timerSession, elapsedMinutes, projectName, workItemName });
  } catch (error) {
    logError('agency:fetch current timer error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to fetch current timer' }, { status: 500 });
  }
}
