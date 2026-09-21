import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { updateRateEntry } from '@/lib/agency/domain/agency.rates';

export const dynamic = 'force-dynamic';

/**
 * /api/agency/rate-cards/:id/entries/:entryId (spec §100/§122, Module 6)
 *
 *   PATCH — edit entry metadata and/or change the rate. A rate change NEVER
 *           mutates history: the open version closes the day before the new
 *           effectiveFrom and a NEW version begins (§122). Backdating over
 *           existing history rejects.
 */
type RouteContext = { params: Promise<{ id: string; entryId: string }> };

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const gate = await requireAgencyPermission('agency.rates.manage');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const tenantId = gate.context.tenant.id || (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });
  const session = gate.context.session;
  const { id, entryId } = await ctx.params;

  try {
    const body = await req.json();
    const ipAddress = firstClientIp(req);
    const result = await updateRateEntry(id, entryId, tenantId, body, {
      username: session.username,
      tenantId,
      log: (action: string, detail: string) => createLog(session.username, action, detail, tenantId, ipAddress),
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    logError('agency:update rate entry error', error, { tenantId, rateCardId: id, entryId });
    return NextResponse.json({ error: 'Failed to update rate entry' }, { status: 500 });
  }
}
