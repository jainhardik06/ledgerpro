import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission, can } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { asAuthorizedUser } from '@/lib/agency/types/permissions';
import { getRateCardDetail, updateRateCard } from '@/lib/agency/domain/agency.rates';

export const dynamic = 'force-dynamic';

/**
 * /api/agency/rate-cards/:id (spec §100, Module 6)
 *
 *   GET   — the card with its entries and full version history (§85/§131).
 *           COST cards require agency.rates.cost.read (§99 privacy);
 *           BILLING cards ride agency.rates.billing.read.
 *   PATCH — update name / client binding (agency.rates.manage). type, scope
 *           and currency are immutable (domain rule).
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
    const result = await getRateCardDetail(id, tenantId);
    if (!result.ok || !result.data) {
      return NextResponse.json({ error: result.error ?? 'Rate card not found' }, { status: result.status });
    }
    // §99 — the detail view is where rates actually live; cost cards are
    // admin-only down to the entry.
    if (result.data.card.type === 'COST') {
      const user = asAuthorizedUser(gate.context.session);
      if (!can(user, 'agency.rates.cost.read', { tenantId })) {
        return NextResponse.json({ error: 'You do not have permission to view cost rates' }, { status: 403 });
      }
    }
    return NextResponse.json({ success: true, ...result.data });
  } catch (error) {
    logError('agency:fetch rate card error', error, { tenantId, rateCardId: id });
    return NextResponse.json({ error: 'Failed to fetch rate card' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
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
    const result = await updateRateCard(id, tenantId, body, {
      username: session.username,
      tenantId,
      log: (action: string, detail: string) => createLog(session.username, action, detail, tenantId, ipAddress),
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    logError('agency:update rate card error', error, { tenantId, rateCardId: id });
    return NextResponse.json({ error: 'Failed to update rate card' }, { status: 500 });
  }
}
