import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { updateAgencyPaymentSettings } from '@/lib/agency/domain/agency.settings';
import { toPublicAgencySettings } from '@/lib/agency/types/agency-settings';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/agency/settings/payment (Module 17, §48–§50/§52)
 *
 * The payment-settings lifecycle, all through one PATCH (agency.settings.manage):
 *   add/update  razorpayEnabled / razorpayKeyId + optional razorpayKeySecret /
 *               webhookSecret (encrypted at rest, §49 — fail-closed 503 when
 *               AGENCY_MASTER_KEY is not configured)
 *   rotate      a new secret simply overwrites the stored ciphertext
 *   disable     razorpayEnabled: false
 *
 * §50 — the response is the client-safe projection: razorpayKeyId is the one
 * public payment field, has* booleans replace the secrets, and the secret
 * plaintext/ciphertext NEVER appears in any response (including this one).
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
    const result = await updateAgencyPaymentSettings(tenantId, body, {
      username: session.username,
      tenantId,
      log: (action: string, detail: string) => createLog(session.username, action, detail, tenantId, ipAddress),
    });
    if (!result.ok || !result.data) {
      return NextResponse.json({ error: result.error ?? 'Failed to update payment settings' }, { status: result.status });
    }
    return NextResponse.json({ success: true, settings: toPublicAgencySettings(result.data) });
  } catch (error) {
    logError('agency:update payment settings error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to update payment settings' }, { status: 500 });
  }
}
