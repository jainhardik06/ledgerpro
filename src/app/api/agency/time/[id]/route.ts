import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog, getTimeEntryById } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { updateTimeEntry } from '@/lib/agency/domain/agency.time';
import { redactEntryCost } from '@/lib/agency/types/time';

export const dynamic = 'force-dynamic';

/**
 * /api/agency/time/:id (Module 7 §30)
 *
 *   GET   — one entry. Owner or admin only (§33); cost side redacted for
 *           non-admins (§99). Cross-tenant ids are an identical 404 (§113).
 *   PATCH — the §28 lifecycle edit (full pre-approval / notes-only after
 *           approval / locked once invoiced), enforced by the domain.
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
  const session = gate.context.session;
  const { id } = await ctx.params;

  try {
    const entry = await getTimeEntryById(id, tenantId);
    if (!entry) return NextResponse.json({ error: 'Time entry not found' }, { status: 404 });

    // §33 — a USER reads only their own entries.
    const isAdmin = session.role === 'SUPER_ADMIN' || session.role === 'TENANT_ADMIN';
    if (!isAdmin && entry.userId !== session.userId) {
      return NextResponse.json({ error: 'You can only view your own time entries' }, { status: 403 });
    }

    return NextResponse.json({ success: true, timeEntry: isAdmin ? entry : redactEntryCost(entry) });
  } catch (error) {
    logError('agency:fetch time entry error', error, { tenantId, timeEntryId: id });
    return NextResponse.json({ error: 'Failed to fetch time entry' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const gate = await requireAgencyPermission('agency.time.write');
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
    const result = await updateTimeEntry(id, tenantId, body, {
      username: session.username,
      tenantId,
      log: (action, detail) => createLog(session.username, action, detail, tenantId, ipAddress),
    }, { userId: session.userId, role: session.role });
    if (!result.ok || !result.data) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    const isAdmin = session.role === 'SUPER_ADMIN' || session.role === 'TENANT_ADMIN';
    return NextResponse.json({ success: true, timeEntry: isAdmin ? result.data : redactEntryCost(result.data) });
  } catch (error) {
    logError('agency:update time entry error', error, { tenantId, timeEntryId: id });
    return NextResponse.json({ error: 'Failed to update time entry' }, { status: 500 });
  }
}
