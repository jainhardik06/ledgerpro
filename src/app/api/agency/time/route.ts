import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog, getUserById, getProjectById, type TimeEntryFilters } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { createTimeEntry, listTimeEntries } from '@/lib/agency/domain/agency.time';
import { redactEntryCost, TIME_APPROVAL_STATUSES, type TimeApprovalStatus, type TimeEntry } from '@/lib/agency/types/time';

export const dynamic = 'force-dynamic';

/**
 * /api/agency/time (Module 7 §30)
 *
 *   GET  — the time list. Default view is the caller's own entries; admins
 *          may filter by any user (§33). Filters: projectId, workItemId,
 *          dateFrom/dateTo, approvalStatus, billingStatus, page. Cost-side
 *          fields are redacted for non-admin consumers (§99).
 *   POST — create a time entry (agency.time.write — a base capability of
 *          every agency member, §4/§17). Snapshots freeze at creation (§6);
 *          missing rates never block tracking (§24).
 */
export async function GET(req: NextRequest) {
  const gate = await requireAgencyPermission('agency.dashboard.read');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const tenantId = gate.context.tenant.id || (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });
  const session = gate.context.session;
  const actor = { userId: session.userId, role: session.role };
  const isAdmin = session.role === 'SUPER_ADMIN' || session.role === 'TENANT_ADMIN';

  try {
    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get('approvalStatus') || undefined;
    const filters: TimeEntryFilters & { page?: number } = {
      ...(searchParams.get('projectId') && { projectId: searchParams.get('projectId')! }),
      ...(searchParams.get('workItemId') && { workItemId: searchParams.get('workItemId')! }),
      ...(searchParams.get('dateFrom') && { dateFrom: searchParams.get('dateFrom')! }),
      ...(searchParams.get('dateTo') && { dateTo: searchParams.get('dateTo')! }),
      ...(statusParam && TIME_APPROVAL_STATUSES.includes(statusParam as TimeApprovalStatus)
        && { approvalStatus: statusParam as TimeApprovalStatus }),
      ...(searchParams.get('billingStatus') === 'UNBILLED' && { billingStatus: 'UNBILLED' as const }),
      ...(searchParams.get('billingStatus') === 'INVOICED' && { billingStatus: 'INVOICED' as const }),
      // §33 — only admins may view another user's time.
      ...(isAdmin && searchParams.get('userId') && { userId: searchParams.get('userId')! }),
    };

    const entries = await listTimeEntries(tenantId, actor, filters);

    // §20 spirit — labels, never raw ids; §113 — cross-tenant refs get none.
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

    // §99 — the cost side is admin-only data.
    const payload: TimeEntry[] | ReturnType<typeof redactEntryCost>[] = isAdmin
      ? entries
      : entries.map(redactEntryCost);
    return NextResponse.json({ success: true, timeEntries: payload, userLabels, projectNames });
  } catch (error) {
    logError('agency:fetch time entries error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to fetch time entries' }, { status: 500 });
  }
}

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
    const body = await req.json();
    const ipAddress = firstClientIp(req);
    const result = await createTimeEntry(tenantId, body, {
      username: session.username,
      tenantId,
      log: (action, detail) => createLog(session.username, action, detail, tenantId, ipAddress),
    }, { userId: session.userId, role: session.role });
    if (!result.ok) {
      return NextResponse.json({ error: result.error, ...(result.code && { code: result.code }) }, { status: result.status });
    }
    return NextResponse.json({ success: true, timeEntry: result.data }, { status: 201 });
  } catch (error) {
    logError('agency:create time entry error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to create time entry' }, { status: 500 });
  }
}
