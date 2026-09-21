import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { getReconciliationOverview } from '@/lib/agency/queries/reconciliation-overview';

export const dynamic = 'force-dynamic';

/**
 * GET /api/agency/payments/reconciliation (Module 10 §115/§128, 10F)
 *
 * Failed-transaction and stuck-payment visibility for gateway money:
 *   - every gateway payment with its §115 reconciliation state;
 *   - the §128 consistency diagnostic for each invoice touched by gateway
 *     money (the §104 engine's expected position vs the stored money);
 *   - §129 integrity flags (CONFIRMED payments missing their transaction).
 *
 * Read-only. The write path is POST /api/agency/payments/:id/reconcile
 * (manual retry/recovery) — never this route.
 */
export async function GET(req: NextRequest) {
  const gate = await requireAgencyPermission('agency.dashboard.read');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const tenantId = gate.context.tenant.id || (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });
  const session = gate.context.session;

  try {
    const overview = await getReconciliationOverview(tenantId);
    await createLog(
      session.username, 'AGENCY_RECONCILIATION_READ',
      `Reconciliation overview: ${overview.counts.total} gateway payment(s) — ${overview.counts.byReconciliationStatus.PENDING} pending, ${overview.counts.byReconciliationStatus.ERROR} error, ${overview.inconsistentInvoices} inconsistent invoice(s)`,
      tenantId, firstClientIp(req)
    ).catch(() => undefined);
    return NextResponse.json({ success: true, reconciliation: overview });
  } catch (error) {
    logError('agency:reconciliation overview error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to load reconciliation overview' }, { status: 500 });
  }
}
