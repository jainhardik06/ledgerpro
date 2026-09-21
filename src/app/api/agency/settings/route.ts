import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { logError } from '@/lib/logger';
import { getPublicAgencySettings } from '@/lib/agency/domain/agency.settings';

export const dynamic = 'force-dynamic';

/**
 * GET /api/agency/settings (Module 17, §48/§52)
 *
 * The effective settings (stored ⊕ §17.2 defaults) in the CLIENT-SAFE
 * projection: the payment section carries razorpayEnabled, razorpayKeyId and
 * has*Secret booleans ONLY — the encrypted secrets never leave the server,
 * not even to admins (§48: "never send the original secret after initial
 * save"). Reads ride agency.dashboard.read: every agency member may see the
 * workspace configuration; the WRITE paths are agency.settings.manage.
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
    const settings = await getPublicAgencySettings(tenantId);
    return NextResponse.json({ success: true, settings });
  } catch (error) {
    logError('agency:fetch settings error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to fetch agency settings' }, { status: 500 });
  }
}

// PATCH lives per-section (§52) — see ./general, ./billing, ./profitability,
// ./tax, ./payment. This handler exists so a bare PATCH to the collection
// root can never mutate anything (fail closed with an explicit 405).
export async function PATCH(_req: NextRequest) {
  return NextResponse.json(
    { error: 'PATCH a specific settings section: /api/agency/settings/{general|billing|profitability|tax|payment}' },
    { status: 405 }
  );
}
