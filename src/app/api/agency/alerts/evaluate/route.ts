import { NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { logError } from '@/lib/logger';
import { evaluateTenantAlerts } from '@/lib/agency/alerts/evaluator';

export const dynamic = 'force-dynamic';

/**
 * POST /api/agency/alerts/evaluate (Module 15 §21 — explicit evaluation)
 *
 * Admin-only (agency.alerts.manage): run the evaluation pass on demand and
 * report exactly what happened — created / updated / reopened /
 * auto-resolved / totalActive. Idempotent (§6 fingerprints), so calling it
 * twice in a row is safe: the second pass updates and reports zeros.
 */
export async function POST() {
  const gate = await requireAgencyPermission('agency.alerts.manage');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const tenantId = gate.context.tenant.id || (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });

  try {
    const result = await evaluateTenantAlerts(tenantId);
    return NextResponse.json({ success: true, result });
  } catch (error) {
    logError('agency:alerts evaluate error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to evaluate alerts' }, { status: 500 });
  }
}
