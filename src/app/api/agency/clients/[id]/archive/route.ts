import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { archiveAgencyClient } from '@/lib/agency/domain/agency.clients';

export const dynamic = 'force-dynamic';

/**
 * POST /api/agency/clients/:id/archive (spec §29)
 *
 * Archive is the delete surrogate (§15): the client's financial history
 * stays resolvable; hard DELETE does not exist for agency clients.
 * Requires the agency.clients.manage permission (§28 — admin only).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAgencyPermission('agency.clients.manage');
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
    const result = await archiveAgencyClient(id, tenantId, {
      username: session.username,
      tenantId,
      log: (action, detail) => createLog(session.username, action, detail, tenantId, ipAddress),
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true, client: result.data });
  } catch (error) {
    logError('agency:archive client error', error, { tenantId, clientId: id });
    return NextResponse.json({ error: 'Failed to archive client' }, { status: 500 });
  }
}
