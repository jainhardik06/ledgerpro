import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission, can } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { asAuthorizedUser } from '@/lib/agency/types/permissions';
import { listRateCards, createRateCard } from '@/lib/agency/domain/agency.rates';
import type { RateCardListRow } from '@/lib/agency/domain/agency.rates';
import type { RateCardType, RateCardScope, RateCardStatus } from '@/lib/agency/types/rate';

export const dynamic = 'force-dynamic';

/**
 * /api/agency/rate-cards (spec §100, Module 6)
 *
 *   GET  — the card list (§84) with entry counts. Reads ride on
 *          agency.rates.billing.read (all agency users). §99 COST-RATE
 *          PRIVACY: users without agency.rates.cost.read see cost cards
 *          WITHOUT entries or counts — rates never leak (§104).
 *   POST — create a card (agency.rates.manage): §91 required core, client
 *          integrity for CLIENT scope.
 */
export async function GET(req: NextRequest) {
  const gate = await requireAgencyPermission('agency.rates.billing.read');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const tenantId = gate.context.tenant.id || (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });

  try {
    const sp = new URL(req.url).searchParams;
    const filters: { type?: RateCardType; scope?: RateCardScope; clientId?: string; status?: RateCardStatus } = {};
    const type = sp.get('type');
    if (type === 'COST' || type === 'BILLING') filters.type = type;
    const scope = sp.get('scope');
    if (scope === 'ORGANIZATION' || scope === 'CLIENT') filters.scope = scope;
    const clientId = sp.get('clientId');
    if (clientId) filters.clientId = clientId;
    const status = sp.get('status');
    if (status === 'ACTIVE' || status === 'ARCHIVED') filters.status = status;

    const result = await listRateCards(tenantId, filters);
    if (!result.ok || !result.data) {
      return NextResponse.json({ error: result.error ?? 'Failed to fetch rate cards' }, { status: result.status });
    }

    // §99/§104 — cost cards carry salary-adjacent economics. Non-cost-readers
    // see the card exists, but never its entries or counts.
    const user = asAuthorizedUser(gate.context.session);
    const mayReadCost = can(user, 'agency.rates.cost.read', { tenantId });
    type CardRow = RateCardListRow & { costRedacted?: boolean };
    const cards: CardRow[] = result.data.map(row =>
      row.type === 'COST' && !mayReadCost
        ? { ...row, entryCount: 0, costRedacted: true }
        : row
    );
    return NextResponse.json({ success: true, cards, costRatesReadable: mayReadCost });
  } catch (error) {
    logError('agency:fetch rate cards error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to fetch rate cards' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAgencyPermission('agency.rates.manage');
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
    const result = await createRateCard(tenantId, body, {
      username: session.username,
      tenantId,
      log: (action: string, detail: string) => createLog(session.username, action, detail, tenantId, ipAddress),
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true, card: result.data }, { status: 201 });
  } catch (error) {
    logError('agency:create rate card error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to create rate card' }, { status: 500 });
  }
}
