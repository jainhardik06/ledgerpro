import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { updateAgencyBillingSettings } from '@/lib/agency/domain/agency.settings';
import { toPublicAgencySettings } from '@/lib/agency/types/agency-settings';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/agency/settings/billing (Module 17, §45/§52)
 *
 * Merge-patch the billing section (agency.settings.manage): paymentTermsDays
 * / defaultTaxProfileId / defaultPaymentMethods. §45 — invoice NUMBERING is
 * not input: numberingMode is display-only and the validator has no field
 * for an invoiceNumber; the number stays server-controlled
 * (allocateInvoiceNumber, §74). The default tax profile is §67-validated
 * against the tenant's own active profiles before any write.
 */
export async function PATCH(req: NextRequest) {
  const gate = await requireAgencyPermission('agency.settings.manage');
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
    const result = await updateAgencyBillingSettings(tenantId, body, {
      username: session.username,
      tenantId,
      log: (action: string, detail: string) => createLog(session.username, action, detail, tenantId, ipAddress),
    });
    if (!result.ok || !result.data) {
      return NextResponse.json({ error: result.error ?? 'Failed to update billing settings' }, { status: result.status });
    }
    return NextResponse.json({ success: true, settings: toPublicAgencySettings(result.data) });
  } catch (error) {
    logError('agency:update billing settings error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to update billing settings' }, { status: 500 });
  }
}
