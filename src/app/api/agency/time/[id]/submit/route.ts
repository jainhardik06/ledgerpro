import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { submitTimeEntry } from '@/lib/agency/domain/agency.time';
import { redactEntryCost } from '@/lib/agency/types/time';

export const dynamic = 'force-dynamic';

/**
 * POST /api/agency/time/:id/submit (Module 7 §19/§30)
 *
 * DRAFT → SUBMITTED. The owner moves their entry into the approval queue.
 */
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteContext) {
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
    const ipAddress = firstClientIp(req);
    const result = await submitTimeEntry(id, tenantId, {
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
    logError('agency:submit time entry error', error, { tenantId, timeEntryId: id });
    return NextResponse.json({ error: 'Failed to submit time entry' }, { status: 500 });
  }
}
