import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { getAgencyBillingProfile, updateAgencyBillingProfile } from '@/lib/agency/domain/agency.tax';

export const dynamic = 'force-dynamic';

/**
 * /api/agency/billing-profile (spec §29, Module 11)
 *
 *   GET   — the agency's own billing identity (§7). Reads ride on
 *           agency.dashboard.read (every agency user — the issuer identity
 *           appears on invoices). Honest null before configuration.
 *   PATCH — merge-patch the profile (agency.tax.manage): legalName required
 *           once and never clearable; taxIdentifiers[] full-replace (§9).
 */
export async function GET() {
  const gate = await requireAgencyPermission('agency.dashboard.read');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const tenantId = gate.context.tenant.id || (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });

  try {
    const billingProfile = await getAgencyBillingProfile(tenantId);
    return NextResponse.json({ success: true, billingProfile });
  } catch (error) {
    logError('agency:fetch billing profile error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to fetch billing profile' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
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
    const result = await updateAgencyBillingProfile(tenantId, body, {
      username: session.username,
      tenantId,
      log: (action: string, detail: string) => createLog(session.username, action, detail, tenantId, ipAddress),
    });
    if (!result.ok || !result.data) {
      return NextResponse.json({ error: result.error ?? 'Failed to update billing profile' }, { status: result.status });
    }
    return NextResponse.json({ success: true, billingProfile: result.data });
  } catch (error) {
    logError('agency:update billing profile error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to update billing profile' }, { status: 500 });
  }
}
