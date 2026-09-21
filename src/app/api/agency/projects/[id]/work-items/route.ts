import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog, getUserById, WORK_ITEM_SORT_FIELDS, type WorkItemSort, type WorkItemSortField, type WorkItemFilters } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { createWorkItem, listWorkItems } from '@/lib/agency/domain/agency.work-items';
import { WORK_ITEM_STATUSES, type WorkItemStatus } from '@/lib/agency/types/project';

export const dynamic = 'force-dynamic';

/**
 * /api/agency/projects/:id/work-items (Module 3 §85, extended Module 4 §16/§24/§25)
 *
 *   GET  — filtered (All / My Work / status / Unassigned), searched
 *          (name, description, assignee) and sorted (sortOrder default)
 *          work-item list with assignee usernames.
 *   POST — create a work item (agency.projects.manage). Defaults: status
 *          NOT_STARTED, appended to the end of the manual order. Work items
 *          are financial context for future time tracking, NOT task
 *          management (§6) — no delete exists anywhere.
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
  const session = gate.context.session;

  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search')?.trim() || undefined;

    // §24 — status filter ("All" sends nothing); "My Work"/"Unassigned" are
    // assignee views, not statuses.
    const statusParam = searchParams.get('status') || undefined;
    const status = WORK_ITEM_STATUSES.includes(statusParam as WorkItemStatus)
      ? (statusParam as WorkItemStatus)
      : undefined;
    const view = searchParams.get('view');
    const filters: WorkItemFilters = {
      ...(status && { status }),
      ...(view === 'mine' && { assignedTo: session.userId }),
      ...(view === 'unassigned' && { unassigned: true }),
    };

    // §25 — sort whitelist: sortOrder (default), updatedAt, createdAt,
    // estimatedMinutes, status. Unknown fields silently fall back.
    const sortParam = searchParams.get('sort') as WorkItemSortField | null;
    const sort: WorkItemSort | undefined =
      sortParam && (WORK_ITEM_SORT_FIELDS as readonly string[]).includes(sortParam)
        ? { field: sortParam, direction: searchParams.get('sortDir') === 'desc' ? -1 : 1 }
        : undefined;

    const result = await listWorkItems(tenantId, id, { search, sort }, filters);
    if (!result.ok || !result.data) {
      return NextResponse.json({ error: result.error ?? 'Failed to fetch work items' }, { status: result.status });
    }
    const workItems = result.data;

    // §20 — the Assignee column shows NAMES, never raw ids. §113 — a
    // cross-tenant user simply gets no label.
    const userLabels: Record<string, string> = {};
    for (const userId of [...new Set(workItems.map(w => w.assignedTo).filter((x): x is string => !!x))]) {
      const user = await getUserById(userId);
      if (user && user.username) userLabels[userId] = user.username;
    }
    return NextResponse.json({ success: true, workItems, userLabels });
  } catch (error) {
    logError('agency:fetch work items error', error, { tenantId, projectId: id });
    return NextResponse.json({ error: 'Failed to fetch work items' }, { status: 500 });
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
    const result = await createWorkItem(tenantId, id, body, {
      username: session.username,
      tenantId,
      log: (action, detail) => createLog(session.username, action, detail, tenantId, ipAddress),
    }, session.userId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true, workItem: result.data }, { status: 201 });
  } catch (error) {
    logError('agency:create work item error', error, { tenantId, projectId: id });
    return NextResponse.json({ error: 'Failed to create work item' }, { status: 500 });
  }
}
