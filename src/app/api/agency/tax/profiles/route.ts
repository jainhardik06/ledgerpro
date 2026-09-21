import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { listTaxProfiles, createAgencyTaxProfile } from '@/lib/agency/domain/agency.tax';
import type { TaxTreatment } from '@/lib/agency/types/tax';
import { isTaxTreatment } from '@/lib/agency/types/tax';
import type { TaxProfileListFilters } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * /api/agency/tax/profiles (spec §29, Module 11)
 *
 *   GET  — the tenant's named tax configurations (§6). Reads ride on
 *          agency.dashboard.read. Optional filters: ?active=true&country=
 *          &taxTreatment=.
 *   POST — create a profile (agency.tax.manage): name + country +
 *          taxTreatment required; a GSTIN-typed registrationNumber must pass
 *          the §30 SHAPE check.
 */
export async function GET(req: NextRequest) {
  const gate = await requireAgencyPermission('agency.dashboard.read');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const tenantId = gate.context.tenant.id || (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });

  try {
    const sp = new URL(req.url).searchParams;
    const filters: TaxProfileListFilters = {};
    const active = sp.get('active');
    if (active === 'true') filters.active = true;
    if (active === 'false') filters.active = false;
    const country = sp.get('country');
    if (country) filters.country = country.trim();
    const taxTreatment = sp.get('taxTreatment');
    if (taxTreatment && isTaxTreatment(taxTreatment)) filters.taxTreatment = taxTreatment as TaxTreatment;

    const result = await listTaxProfiles(tenantId, filters);
    if (!result.ok || !result.data) {
      return NextResponse.json({ error: result.error ?? 'Failed to fetch tax profiles' }, { status: result.status });
    }
    return NextResponse.json({ success: true, profiles: result.data });
  } catch (error) {
    logError('agency:fetch tax profiles error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to fetch tax profiles' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAgencyPermission('agency.tax.manage');
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
    const result = await createAgencyTaxProfile(tenantId, body, {
      username: session.username,
      tenantId,
      log: (action: string, detail: string) => createLog(session.username, action, detail, tenantId, ipAddress),
    });
    if (!result.ok || !result.data) {
      return NextResponse.json({ error: result.error ?? 'Failed to create tax profile' }, { status: result.status });
    }
    return NextResponse.json({ success: true, profile: result.data }, { status: 201 });
  } catch (error) {
    logError('agency:create tax profile error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to create tax profile' }, { status: 500 });
  }
}
