import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { createAgencyMilestone } from '@/lib/agency/domain/agency.projects';
import { getProjectMilestones } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * /api/agency/projects/:id/milestones (spec §85 / Step 3.7)
 *
 *   GET  — the project's milestones in sequence order.
 *   POST — create a milestone (agency.projects.manage): amount XOR
 *          percentage enforced (§46); the percentage sum across
 *          non-cancelled milestones can never exceed 100 — checked BEFORE
 *          the write, never rollback.
 */
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  const gate = await requireAgencyPermission('agency.dashboard.read');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const tenantId = gate.context.tenant.id || (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });
  const { id } = await ctx.params;

  try {
    const milestones = await getProjectMilestones(id, tenantId);
    return NextResponse.json({ success: true, milestones });
  } catch (error) {
    logError('agency:fetch milestones error', error, { tenantId, projectId: id });
    return NextResponse.json({ error: 'Failed to fetch milestones' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const gate = await requireAgencyPermission('agency.projects.manage');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const tenantId = gate.context.tenant.id || (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });
  const session = gate.context.session;
  const { id } = await ctx.params;

  try {
    const body = await req.json();
    const ipAddress = firstClientIp(req);
    const result = await createAgencyMilestone(id, tenantId, body, {
      username: session.username,
      tenantId,
      log: (action, detail) => createLog(session.username, action, detail, tenantId, ipAddress),
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true, milestone: result.data }, { status: 201 });
  } catch (error) {
    logError('agency:create milestone error', error, { tenantId, projectId: id });
    return NextResponse.json({ error: 'Failed to create milestone' }, { status: 500 });
  }
}
