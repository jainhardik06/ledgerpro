import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog, getUserById } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { getWorkItem, updateWorkItem, changeWorkItemStatus, assignWorkItem, unassignWorkItem } from '@/lib/agency/domain/agency.work-items';

export const dynamic = 'force-dynamic';

/**
 * /api/agency/projects/:id/work-items/:itemId (Module 3 §85, extended Module 4 §16/§17)
 *
 *   GET   — one work item with its assignee label.
 *   PATCH — partial update, OR a domain action via `?action=`:
 *           status (§11 transition-checked), assign, unassign.
 *           ARCHIVED is never PATCHed in — the dedicated archive action owns it.
 *
 * There is NO DELETE: an irrelevant work item goes to ARCHIVED — history for
 * future time tracking stays resolvable (§84, same reasoning as client archive).
 */
type RouteContext = { params: Promise<{ id: string; itemId: string }> };

function auditFor(session: { username: string }, tenantId: string, ipAddress: string) {
  return {
    username: session.username,
    tenantId,
    log: (action: string, detail: string) => createLog(session.username, action, detail, tenantId, ipAddress),
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
  const { id, itemId } = await ctx.params;

  try {
    const result = await getWorkItem(itemId, id, tenantId);
    if (!result.ok || !result.data) {
      return NextResponse.json({ error: result.error ?? 'Work item not found' }, { status: result.status });
    }
    const workItem = result.data;
    const userLabels: Record<string, string> = {};
    if (workItem.assignedTo) {
      const user = await getUserById(workItem.assignedTo);
      if (user && user.username) userLabels[workItem.assignedTo] = user.username;
    }
    return NextResponse.json({ success: true, workItem, userLabels });
  } catch (error) {
    logError('agency:fetch work item error', error, { tenantId, projectId: id, itemId });
    return NextResponse.json({ error: 'Failed to fetch work item' }, { status: 500 });
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
  const { id, itemId } = await ctx.params;

  try {
    const body = await req.json();
    const ipAddress = firstClientIp(req);
    const action = new URL(req.url).searchParams.get('action');

    // §17 — dedicated domain operations, selected via ?action=
    let result;
    if (action === 'status') {
      result = await changeWorkItemStatus(itemId, id, tenantId, body.status, auditFor(session, tenantId, ipAddress));
    } else if (action === 'assign') {
      result = await assignWorkItem(itemId, id, tenantId, body.userId, auditFor(session, tenantId, ipAddress));
    } else if (action === 'unassign') {
      result = await unassignWorkItem(itemId, id, tenantId, auditFor(session, tenantId, ipAddress));
    } else {
      result = await updateWorkItem(itemId, id, tenantId, body, auditFor(session, tenantId, ipAddress));
    }

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true, workItem: result.data });
  } catch (error) {
    logError('agency:update work item error', error, { tenantId, projectId: id, itemId });
    return NextResponse.json({ error: 'Failed to update work item' }, { status: 500 });
  }
}
