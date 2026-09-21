import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission, can } from '@/lib/agency/permissions/authorization';
import { asAuthorizedUser } from '@/lib/agency/types/permissions';
import { logError } from '@/lib/logger';
import { resolveCostRate, resolveBillingRate } from '@/lib/agency/domain/rate-resolution';
import { todayInTimezone } from '@/lib/agency/types/dates';
import { agencyTimezone } from '@/lib/agency/domain/agency.settings';

export const dynamic = 'force-dynamic';

/**
 * /api/agency/rates/resolve (spec §94/§100/§121, Module 6)
 *
 *   GET — the resolution engine, exposed for UI and E2E testability.
 *         Query: userId (cost side), clientId + role (billing side, §89 makes
 *         role required there), projectId (§90 reserved slot), date
 *         (default: today).
 *
 *         COST PRIVACY (§99/§104): a user's cost rate is salary data. Only
 *         agency.rates.cost.read holders may resolve ANY user; everyone else
 *         may resolve only THEMSELVES.
 *
 *         The billing side rides agency.rates.billing.read (§98). The
 *         projectId param is the §90 project-override slot — accepted, not
 *         yet consulted.
 */
export async function GET(req: NextRequest) {
  const gate = await requireAgencyPermission('agency.rates.billing.read');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const tenantId = gate.context.tenant.id || (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });
  const session = gate.context.session;

  try {
    const sp = new URL(req.url).searchParams;
    const userId = sp.get('userId');
    const clientId = sp.get('clientId');
    const projectId = sp.get('projectId');
    const role = sp.get('role') ?? undefined;
    // §44 — the default resolution date anchors to the agency timezone.
    const date = sp.get('date') ?? todayInTimezone(agencyTimezone(gate.context.tenant));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
    }

    const wantsCost = userId != null && userId !== '';
    const wantsBilling = clientId != null && clientId !== '';
    if (!wantsCost && !wantsBilling) {
      return NextResponse.json({ error: 'Provide userId (cost) and/or clientId (billing) to resolve' }, { status: 400 });
    }
    // §89 — billing prices a service, not a person: role is REQUIRED there.
    if (wantsBilling && (role == null || role === '')) {
      return NextResponse.json({ error: 'role is required for billing rate resolution (§89)' }, { status: 400 });
    }

    // §99 — cost rates are salary data. Cost readers resolve anyone; a plain
    // agency user may resolve only their own cost rate (§104 denies the rest).
    if (wantsCost) {
      const user = asAuthorizedUser(session);
      const mayReadAny = can(user, 'agency.rates.cost.read', { tenantId });
      if (!mayReadAny && session.userId !== userId) {
        return NextResponse.json({ error: 'You do not have permission to view cost rates' }, { status: 403 });
      }
    }

    const payload: {
      cost?: Awaited<ReturnType<typeof resolveCostRate>>;
      billing?: Awaited<ReturnType<typeof resolveBillingRate>>;
    } = {};

    if (wantsCost) {
      payload.cost = await resolveCostRate(tenantId, userId as string, date, role);
    }
    if (wantsBilling) {
      payload.billing = await resolveBillingRate(tenantId, clientId as string, projectId, date, role as string);
    }

    return NextResponse.json({ success: true, date, ...payload });
  } catch (error) {
    logError('agency:resolve rate error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to resolve rate' }, { status: 500 });
  }
}
