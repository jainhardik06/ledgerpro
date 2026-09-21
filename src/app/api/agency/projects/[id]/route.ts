import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog, getClientById, getUserById } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import {
  getAgencyProject, updateAgencyProject, getRecentProjectLogs,
} from '@/lib/agency/domain/agency.projects';
import { computeProjectReadiness } from '@/lib/agency/domain/project-readiness';
import {
  getProjectMembers, getProjectWorkItems, getProjectMilestones,
} from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * /api/agency/projects/:id (spec §82–§83 / Step 3.7)
 *
 *   GET    — the full project workspace payload: project + members + work
 *            items + milestones + activity + display labels (client name,
 *            manager/member usernames). Cross-tenant ids resolve to 404
 *            "Project not found" — never a leak (§113).
 *   PATCH  — partial update (§82); status is NOT settable here — the
 *            lifecycle subroutes own it (§41).
 */
type RouteContext = { params: Promise<{ id: string }> };

function auditHook(tenantId: string, username: string, ipAddress: string) {
  return {
    username, tenantId,
    log: (action: string, detail: string) =>
      createLog(username, action, detail, tenantId, ipAddress),
  };
}

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
    const result = await getAgencyProject(id, tenantId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    const project = result.data!;

    // Workspace children (§102): team, work items, milestones, activity.
    // Team split per Module 5 §37: `members` are ACTIVE (the §42 team view);
    // `pastMembers` carry the removed-membership history for the Team tab.
    const [allMembers, workItems, milestones, activity] = await Promise.all([
      getProjectMembers(id, tenantId, { includeInactive: true }),
      getProjectWorkItems(id, tenantId),
      getProjectMilestones(id, tenantId),
      getRecentProjectLogs(tenantId, id),
    ]);
    const members = allMembers.filter(m => m.active !== false);
    const pastMembers = allMembers.filter(m => m.active === false);

    // Display labels — names, never raw ids. §113: a cross-tenant client or
    // user simply gets no label (it can't legitimately be referenced).
    const client = project.clientId ? await getClientById(project.clientId, tenantId) : null;
    const userLabels: Record<string, string> = {};
    const userIds = [
      ...new Set([
        ...allMembers.map(m => m.userId),
        ...workItems.map(w => w.assignedTo).filter((x): x is string => !!x),
        ...(project.projectManagerId ? [project.projectManagerId] : []),
      ]),
    ];
    for (const userId of userIds) {
      const user = await getUserById(userId);
      // Safe fields only — never the full user doc.
      if (user && user.username) userLabels[userId] = user.username;
    }

    // Module 6 §108–§110/§125–§126 — financial readiness, computed against the
    // ACTIVE team with the real resolution engine. Warn-only (§127): it
    // reports, it never gates. Counts and booleans only — no cost amounts
    // cross this boundary (§99). Work items feed the §126 composite (there
    // must be something to log time against).
    const readiness = await computeProjectReadiness(tenantId, project, members, workItems);

    return NextResponse.json({
      success: true,
      project,
      members,
      pastMembers,
      workItems,
      milestones,
      activity,
      clientName: client?.name || null,
      userLabels,
      readiness,
    });
  } catch (error) {
    logError('agency:fetch project error', error, { tenantId, projectId: id });
    return NextResponse.json({ error: 'Failed to fetch project' }, { status: 500 });
  }
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
  const { id } = await ctx.params;

  try {
    const body = await req.json();
    const ipAddress = firstClientIp(req);
    const result = await updateAgencyProject(
      id, tenantId, body,
      auditHook(tenantId, session.username, ipAddress)
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(
      { success: true, project: result.data, ...(result.warnings?.length && { warnings: result.warnings }) }
    );
  } catch (error) {
    logError('agency:update project error', error, { tenantId, projectId: id });
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
  }
}
