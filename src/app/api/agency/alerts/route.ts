import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission, can } from '@/lib/agency/permissions/authorization';
import { asAuthorizedUser } from '@/lib/agency/types/permissions';
import { listAgencyAlerts } from '@/lib/db';
import { logError } from '@/lib/logger';
import {
  ALERT_RULE_TYPES, ALERT_SEVERITIES, ALERT_STATUSES, ALERT_CATEGORIES,
} from '@/lib/agency/alerts/types';
import type { AlertRuleType, AlertSeverity, AlertStatus } from '@/lib/agency/alerts/types';
import { categoryForRuleType, isCostBearingRuleType, ALERT_RULE_CATALOG } from '@/lib/agency/alerts/rules';

export const dynamic = 'force-dynamic';

/**
 * GET /api/agency/alerts?status=OPEN&severity=CRITICAL&category=CASH&ruleType=INVOICE_OVERDUE&limit=50
 * (Module 15 §22 — the Alert Center list)
 *
 * READ-ONLY over the stored alerts: this endpoint never evaluates (§21 —
 * evaluation lives in /alerts/summary and the admin /alerts/evaluate, so
 * opening the Alert Center can never double the portfolio query).
 *
 * §114 privacy: rows of cost-bearing rule types (PROJECT_OVER_BUDGET,
 * PROJECT_MARGIN_BELOW_TARGET) are REMOVED for sessions without
 * agency.profitability.read — a USER (PM included) sees every operational
 * and cash alert, never the cost structure behind them.
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
    const { searchParams } = new URL(req.url);

    // §114 — may this session see cost-bearing alert rows?
    const maySeeCost = can(asAuthorizedUser(gate.context.session), 'agency.profitability.read');

    // Filter whitelist — an unknown value is a 400, never a silent ignore
    // (a typo'd "OPNE" must not look like a successful unfiltered list).
    const status = searchParams.get('status');
    if (status !== null && !(ALERT_STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json({ error: 'status must be one of OPEN, ACKNOWLEDGED, RESOLVED' }, { status: 400 });
    }
    const severity = searchParams.get('severity');
    if (severity !== null && !(ALERT_SEVERITIES as readonly string[]).includes(severity)) {
      return NextResponse.json({ error: 'severity must be one of INFO, WARNING, CRITICAL' }, { status: 400 });
    }
    const ruleType = searchParams.get('ruleType');
    if (ruleType !== null && !(ALERT_RULE_TYPES as readonly string[]).includes(ruleType)) {
      return NextResponse.json({ error: 'Unknown ruleType' }, { status: 400 });
    }
    const category = searchParams.get('category');
    if (category !== null && !(ALERT_CATEGORIES as readonly string[]).includes(category)) {
      return NextResponse.json({ error: 'category must be one of PROJECTS, BILLING, CASH' }, { status: 400 });
    }

    // §23 — a category selects the rule types it owns (the catalog is the
    // single definition). Combined with ruleType, both must agree.
    const categoryTypes: AlertRuleType[] | undefined = category
      ? ALERT_RULE_TYPES.filter(t => categoryForRuleType(t) === category)
      : undefined;

    const limitRaw = searchParams.get('limit');
    let limit = 200;
    if (limitRaw !== null) {
      const n = Number(limitRaw);
      if (!Number.isInteger(n) || n < 1 || n > 1000) {
        return NextResponse.json({ error: 'limit must be a whole number between 1 and 1000' }, { status: 400 });
      }
      limit = n;
    }

    const alerts = await listAgencyAlerts(tenantId, {
      ...(status !== null && { status: status as AlertStatus }),
      ...(severity !== null && { severity: severity as AlertSeverity }),
      ...(ruleType !== null && { ruleType: ruleType as AlertRuleType }),
      limit,
    });

    const visible = alerts.filter(a =>
      (maySeeCost || !isCostBearingRuleType(a.ruleType))
      && (categoryTypes === undefined || categoryTypes.includes(a.ruleType))
    );

    // View rows: the record plus its catalog-derived category/label, so the
    // Alert Center never hardcodes rule metadata client-side.
    return NextResponse.json({
      success: true,
      count: visible.length,
      alerts: visible.map(a => ({
        ...a,
        category: categoryForRuleType(a.ruleType),
        ruleLabel: ALERT_RULE_CATALOG[a.ruleType].label,
      })),
    });
  } catch (error) {
    logError('agency:list alerts error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to load alerts' }, { status: 500 });
  }
}
