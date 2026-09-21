import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { updateAgencyTaxProfile } from '@/lib/agency/domain/agency.tax';

export const dynamic = 'force-dynamic';

/**
 * /api/agency/tax/profiles/:id (Module 11, §115 TAX_PROFILE_UPDATED)
 *
 *   PATCH — partial update of a named tax configuration (agency.tax.manage):
 *          name/country/registration fields/stateOrRegion/taxTreatment/
 *          active. A missing profile and another tenant's profile are
 *          IDENTICAL 404s (§113).
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const gate = await requireAgencyPermission('agency.tax.manage');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const tenantId = gate.context.tenant.id || (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });
  const session = gate.context.session;

  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const ipAddress = firstClientIp(req);
    const result = await updateAgencyTaxProfile(tenantId, id, body, {
      username: session.username,
      tenantId,
      log: (action: string, detail: string) => createLog(session.username, action, detail, tenantId, ipAddress),
    });
    if (!result.ok || !result.data) {
      return NextResponse.json({ error: result.error ?? 'Failed to update tax profile' }, { status: result.status });
    }
    return NextResponse.json({ success: true, profile: result.data });
  } catch (error) {
    logError('agency:update tax profile error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to update tax profile' }, { status: 500 });
  }
}
