import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { updateAgencyMilestone } from '@/lib/agency/domain/agency.projects';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/agency/projects/:id/milestones/:milestoneId (spec §85 / Step 3.7)
 *
 * Update a milestone. Amount XOR percentage holds (§46) and the percentage
 * sum across non-cancelled milestones still cannot exceed 100 — pre-write
 * check with the new value in place, never rollback.
 */
type RouteContext = { params: Promise<{ id: string; milestoneId: string }> };

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const gate = await requireAgencyPermission('agency.projects.manage');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const tenantId = gate.context.tenant.id || (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });
  const session = gate.context.session;
  const { id, milestoneId } = await ctx.params;

  try {
    const body = await req.json();
    const ipAddress = firstClientIp(req);
    const result = await updateAgencyMilestone(milestoneId, id, tenantId, body, {
      username: session.username,
      tenantId,
      log: (action, detail) => createLog(session.username, action, detail, tenantId, ipAddress),
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true, milestone: result.data });
  } catch (error) {
    logError('agency:update milestone error', error, { tenantId, projectId: id, milestoneId });
    return NextResponse.json({ error: 'Failed to update milestone' }, { status: 500 });
  }
}
