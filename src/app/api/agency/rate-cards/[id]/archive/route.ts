import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { archiveRateCard } from '@/lib/agency/domain/agency.rates';

export const dynamic = 'force-dynamic';

/**
 * /api/agency/rate-cards/:id/archive (spec §100/§75, Module 6)
 *
 *   POST — ACTIVE → ARCHIVED. Cards are never deleted; an archived card
 *          accepts no new entries or assignments but history keeps reading
 *          it (§76). Re-archive is an honest 400.
 */
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: RouteContext) {
  const gate = await requireAgencyPermission('agency.rates.manage');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const tenantId = gate.context.tenant.id || (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });
  const session = gate.context.session;
  const { id } = await ctx.params;

  try {
    const ipAddress = firstClientIp(_req);
    const result = await archiveRateCard(id, tenantId, {
      username: session.username,
      tenantId,
      log: (action: string, detail: string) => createLog(session.username, action, detail, tenantId, ipAddress),
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    logError('agency:archive rate card error', error, { tenantId, rateCardId: id });
    return NextResponse.json({ error: 'Failed to archive rate card' }, { status: 500 });
  }
}
