import { NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { getAlertRules } from '@/lib/db';
import { ensureDefaultAlertRules as seedRules } from '@/lib/agency/alerts/evaluator';
import { logError } from '@/lib/logger';
import { ALERT_RULE_CATALOG } from '@/lib/agency/alerts/rules';

export const dynamic = 'force-dynamic';

/**
 * GET /api/agency/alert-rules (Module 15 §22/§24 — the rules admin list)
 *
 * Read rides agency.dashboard.read (§28 pattern). Lazily seeds the default
 * catalog first (§4), so the admin screen always shows all 11 rules even
 * before the first evaluation. Rows carry the catalog label + category for
 * display; configuration is the tenant's stored overlay, not the effective
 * merge (the screen shows both: effective = catalog defaults ⊕ stored).
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
    // §4 — ensure the catalog exists before listing (idempotent; a
    // concurrent seed race is absorbed by the unique index).
    await seedRules(tenantId);
    const rules = await getAlertRules(tenantId);
    return NextResponse.json({
      success: true,
      rules: rules.map(r => ({
        ...r,
        label: ALERT_RULE_CATALOG[r.type].label,
        category: ALERT_RULE_CATALOG[r.type].category,
        defaultSeverity: ALERT_RULE_CATALOG[r.type].defaultSeverity,
        defaults: ALERT_RULE_CATALOG[r.type].defaults,
        costBearing: r.type === 'PROJECT_OVER_BUDGET' || r.type === 'PROJECT_MARGIN_BELOW_TARGET',
      })),
    });
  } catch (error) {
    logError('agency:list alert rules error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to load alert rules' }, { status: 500 });
  }
}
