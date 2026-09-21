import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { testAgencyPaymentCredentials } from '@/lib/agency/domain/agency.settings';

export const dynamic = 'force-dynamic';

/**
 * POST /api/agency/settings/payment/test (Module 17, §52)
 *
 * Runs the cheap authenticated Razorpay edge (a 1-item list call — no money,
 * no writes) against the SUBMITTED pair when one is provided, otherwise the
 * tenant's STORED pair, otherwise the deployment env pair. Answers a
 * tri-state — { result: 'ok' | 'invalid' | 'unreachable' | 'unconfigured' } —
 * and NEVER echoes the secret or the ciphertext. Submitted credentials are
 * tested as submitted: this call stores nothing (§50).
 */
export async function POST(req: NextRequest) {
  const gate = await requireAgencyPermission('agency.settings.manage');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const tenantId = gate.context.tenant.id || (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });
  const session = gate.context.session;

  try {
    // Body is OPTIONAL — an empty request tests the stored/env pair.
    const body = await req.json().catch(() => ({}));
    const ipAddress = firstClientIp(req);
    const result = await testAgencyPaymentCredentials(tenantId, body);
    if (!result.ok || !result.data) {
      return NextResponse.json({ error: result.error ?? 'Failed to test payment credentials' }, { status: result.status });
    }
    // §74 — the outcome is auditable; the credentials never are.
    await createLog(session.username, 'PAYMENT_CREDENTIALS_TESTED',
      `Razorpay credential test — ${result.data.result} (${result.data.detail})`, tenantId, ipAddress).catch(() => undefined);
    return NextResponse.json({ success: true, ...result.data });
  } catch (error) {
    logError('agency:test payment credentials error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to test payment credentials' }, { status: 500 });
  }
}
