import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { listWithholdingRules, createWithholdingRule } from '@/lib/agency/domain/agency.tax';
import type { WithholdingRuleListFilters } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * /api/agency/withholding-rules (Module 11 §18–§21/§29)
 *
 *   GET  — the tenant's effective-dated withholding rule CONFIGURATIONS
 *          (agency.dashboard.read). Optional filters: ?active=true&jurisdiction=IN.
 *   POST — create a rule (agency.tax.manage): jurisdiction, effectiveFrom,
 *          ruleCode and rate required. Rules are DATA — nothing here
 *          hard-codes a section number of any Income Tax Act (§19); the
 *          2025-Act framework from 2026-04-01 arrives as tenant-entered
 *          configuration, and the suggester (§20) matches on jurisdiction +
 *          effective date + threshold, never on a baked-in rate.
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
    const sp = new URL(req.url).searchParams;
    const filters: WithholdingRuleListFilters = {};
    const active = sp.get('active');
    if (active === 'true') filters.active = true;
    if (active === 'false') filters.active = false;
    const jurisdiction = sp.get('jurisdiction');
    if (jurisdiction) filters.jurisdiction = jurisdiction.trim().toUpperCase();

    const result = await listWithholdingRules(tenantId, filters);
    if (!result.ok || !result.data) {
      return NextResponse.json({ error: result.error ?? 'Failed to fetch withholding rules' }, { status: result.status });
    }
    return NextResponse.json({ success: true, rules: result.data });
  } catch (error) {
    logError('agency:fetch withholding rules error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to fetch withholding rules' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
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
    const result = await createWithholdingRule(tenantId, body, {
      username: session.username,
      tenantId,
      log: (action: string, detail: string) => createLog(session.username, action, detail, tenantId, ipAddress),
    });
    if (!result.ok || !result.data) {
      return NextResponse.json({ error: result.error ?? 'Failed to create withholding rule' }, { status: result.status });
    }
    return NextResponse.json({ success: true, rule: result.data }, { status: 201 });
  } catch (error) {
    logError('agency:create withholding rule error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to create withholding rule' }, { status: 500 });
  }
}
