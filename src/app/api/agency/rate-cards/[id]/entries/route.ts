import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission, can } from '@/lib/agency/permissions/authorization';
import { createLog, getRateCardById } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { asAuthorizedUser } from '@/lib/agency/types/permissions';
import { listRateCardEntries } from '@/lib/db';
import { createRateEntry } from '@/lib/agency/domain/agency.rates';

export const dynamic = 'force-dynamic';

/**
 * /api/agency/rate-cards/:id/entries (spec §100/§87, Module 6)
 *
 *   GET  — the card's rate lines. COST cards require agency.rates.cost.read
 *          (§99); BILLING cards ride agency.rates.billing.read.
 *   POST — add a rate line with its FIRST version (agency.rates.manage):
 *          §87 fields, §73 HOUR-only cost rates, §76 archived cards reject.
 */
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const gate = await requireAgencyPermission('agency.rates.billing.read');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const tenantId = gate.context.tenant.id || (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });
  const { id } = await ctx.params;

  try {
    // The card's type decides the read permission (§99 split).
    const card = await getRateCardById(id, tenantId);
    if (!card) return NextResponse.json({ error: 'Rate card not found' }, { status: 404 });
    if (card.type === 'COST') {
      const user = asAuthorizedUser(gate.context.session);
      if (!can(user, 'agency.rates.cost.read', { tenantId })) {
        return NextResponse.json({ error: 'You do not have permission to view cost rates' }, { status: 403 });
      }
    }
    const entries = await listRateCardEntries(id, tenantId);
    return NextResponse.json({ success: true, entries, card: { id: card.id, name: card.name, type: card.type, currency: card.currency, status: card.status } });
  } catch (error) {
    logError('agency:fetch rate entries error', error, { tenantId, rateCardId: id });
    return NextResponse.json({ error: 'Failed to fetch rate entries' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: RouteContext) {
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
    const body = await req.json();
    const ipAddress = firstClientIp(req);
    const result = await createRateEntry(id, tenantId, body, {
      username: session.username,
      tenantId,
      log: (action: string, detail: string) => createLog(session.username, action, detail, tenantId, ipAddress),
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true, entry: result.data }, { status: 201 });
  } catch (error) {
    logError('agency:create rate entry error', error, { tenantId, rateCardId: id });
    return NextResponse.json({ error: 'Failed to create rate entry' }, { status: 500 });
  }
}
