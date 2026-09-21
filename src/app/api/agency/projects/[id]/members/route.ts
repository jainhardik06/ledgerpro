import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog, getUserById } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { addProjectMember, listProjectMembers } from '@/lib/agency/domain/agency.project-members';

export const dynamic = 'force-dynamic';

/**
 * /api/agency/projects/:id/members (spec §84, extended Module 5 §47)
 *
 *   GET  — the project's memberships with display usernames (reads ride on
 *          agency.dashboard.read). ACTIVE memberships by default (§42 team
 *          view); ?includeInactive=true surfaces removed history (§37).
 *   POST — add a member (agency.projects.manage): same-tenant user enforced
 *          (§38), duplicate ACTIVE membership is a 409 (§40).
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
    const includeInactive = new URL(req.url).searchParams.get('includeInactive') === 'true';
    const result = await listProjectMembers(id, tenantId, { includeInactive });
    if (!result.ok || !result.data) {
      return NextResponse.json({ error: result.error ?? 'Failed to fetch project members' }, { status: result.status });
    }
    const members = result.data;
    // Usernames for display — safe fields only, never raw user docs.
    const userLabels: Record<string, string> = {};
    for (const userId of [...new Set(members.map(m => m.userId))]) {
      const user = await getUserById(userId);
      if (user && user.username) userLabels[userId] = user.username;
    }
    return NextResponse.json({ success: true, members, userLabels });
  } catch (error) {
    logError('agency:fetch project members error', error, { tenantId, projectId: id });
    return NextResponse.json({ error: 'Failed to fetch project members' }, { status: 500 });
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
    const result = await addProjectMember(id, tenantId, body, {
      username: session.username,
      tenantId,
      log: (action: string, detail: string) => createLog(session.username, action, detail, tenantId, ipAddress),
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true, member: result.data }, { status: 201 });
  } catch (error) {
    logError('agency:add project member error', error, { tenantId, projectId: id });
    return NextResponse.json({ error: 'Failed to add project member' }, { status: 500 });
  }
}
