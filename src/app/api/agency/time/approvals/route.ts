import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { getUserById, getProjectById, type TimeEntryFilters } from '@/lib/db';
import { logError } from '@/lib/logger';
import { getApprovalQueue } from '@/lib/agency/domain/agency.time';

export const dynamic = 'force-dynamic';

/**
 * GET /api/agency/time/approvals (Module 7 §25/§30)
 *
 * The manager's queue: every SUBMITTED entry in the workspace, optionally
 * filtered by project or date window. Gated on agency.time.approve (§21).
 * The queue shows the full economic picture (approvers are admins or the
 * project's manager — §99's cost privacy does not apply to them).
 */
export async function GET(req: NextRequest) {
  const gate = await requireAgencyPermission('agency.time.approve');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const tenantId = gate.context.tenant.id || (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });
  const session = gate.context.session;

  try {
    const { searchParams } = new URL(req.url);
    const filters: TimeEntryFilters = {
      ...(searchParams.get('projectId') && { projectId: searchParams.get('projectId')! }),
      ...(searchParams.get('userId') && { userId: searchParams.get('userId')! }),
      ...(searchParams.get('dateFrom') && { dateFrom: searchParams.get('dateFrom')! }),
      ...(searchParams.get('dateTo') && { dateTo: searchParams.get('dateTo')! }),
    };
    const result = await getApprovalQueue(tenantId, { userId: session.userId, role: session.role }, filters);
    if (!result.ok || !result.data) {
      return NextResponse.json({ error: result.error ?? 'Failed to fetch approval queue' }, { status: result.status });
    }
    const entries = result.data;

    // Labels for the queue columns (§20 spirit — names, never raw ids).
    const userLabels: Record<string, string> = {};
    for (const userId of [...new Set(entries.map(e => e.userId))]) {
      const user = await getUserById(userId);
      if (user?.username) userLabels[userId] = user.username;
    }
    const projectNames: Record<string, string> = {};
    for (const projectId of [...new Set(entries.map(e => e.projectId))]) {
      const project = await getProjectById(projectId, tenantId);
      if (project) projectNames[projectId] = project.name;
    }

    return NextResponse.json({ success: true, timeEntries: entries, userLabels, projectNames });
  } catch (error) {
    logError('agency:fetch approval queue error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to fetch approval queue' }, { status: 500 });
  }
}
