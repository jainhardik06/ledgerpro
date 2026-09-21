import { NextResponse } from 'next/server';
import { requireAgencyPermission, can } from '@/lib/agency/permissions/authorization';
import { asAuthorizedUser } from '@/lib/agency/types/permissions';
import { logError } from '@/lib/logger';
import { evaluateTenantAlerts, getAlertsSummary } from '@/lib/agency/alerts/evaluator';

export const dynamic = 'force-dynamic';

/**
 * GET /api/agency/alerts/summary (Module 15 §21/§22 — the alert headline)
 *
 * The ONE snapshot-evaluation read (§21): evaluate the tenant's alerts
 * (consume the M13/M14 engines, reconcile through the dedupe planner),
 * then report counts + the top severity-ranked unresolved alerts. Anyone
 * who can read the dashboard may trigger it — the evaluator is idempotent
 * (fingerprint upserts), so concurrent callers cannot stack duplicates.
 *
 * §114 privacy: the COUNTS always include cost-bearing alerts (a count
 * leaks no cost); the TOP rows are filtered for sessions without
 * agency.profitability.read.
 *
 * Fail closed: if the evaluation's sources fail, the whole request 500s —
 * never a partially-recomputed alert store, never stale rows presented as
 * current.
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
    await evaluateTenantAlerts(tenantId);
    const maySeeCost = can(asAuthorizedUser(gate.context.session), 'agency.profitability.read');
    const summary = await getAlertsSummary(tenantId, { maySeeCost, topLimit: 5 });
    return NextResponse.json({ success: true, ...summary });
  } catch (error) {
    logError('agency:alerts summary error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to evaluate alerts' }, { status: 500 });
  }
}
