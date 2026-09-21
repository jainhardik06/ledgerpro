import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { updateProjectMember, removeProjectMember } from '@/lib/agency/domain/agency.project-members';

export const dynamic = 'force-dynamic';

/**
 * /api/agency/projects/:id/members/:memberId (spec §84, extended Module 5 §47)
 *
 *   PATCH  — update role/allocation/dates; membership identity (userId) is
 *            fixed — remove + re-add instead. Historical (inactive) rows are
 *            immutable (§37).
 *   DELETE — legacy alias for the Module 5 removal action: SOFT
 *            (active=false, §45). The canonical path is POST .../remove.
 */
type RouteContext = { params: Promise<{ id: string; memberId: string }> };

function auditFor(session: { username: string }, tenantId: string, ipAddress: string) {
  return {
    username: session.username,
    tenantId,
    log: (action: string, detail: string) => createLog(session.username, action, detail, tenantId, ipAddress),
  };
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const gate = await requireAgencyPermission('agency.projects.manage');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const tenantId = gate.context.tenant.id || (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });
  const session = gate.context.session;
  const { id, memberId } = await ctx.params;

  try {
    const body = await req.json();
    const ipAddress = firstClientIp(req);
    const result = await updateProjectMember(memberId, id, tenantId, body, auditFor(session, tenantId, ipAddress));
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    logError('agency:update project member error', error, { tenantId, projectId: id, memberId });
    return NextResponse.json({ error: 'Failed to update project member' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const gate = await requireAgencyPermission('agency.projects.manage');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const tenantId = gate.context.tenant.id || (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });
  const session = gate.context.session;
  const { id, memberId } = await ctx.params;

  try {
    const ipAddress = firstClientIp(req);
    const result = await removeProjectMember(memberId, id, tenantId, auditFor(session, tenantId, ipAddress));
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    logError('agency:remove project member error', error, { tenantId, projectId: id, memberId });
    return NextResponse.json({ error: 'Failed to remove project member' }, { status: 500 });
  }
}
