/**
 * Module 15 — Alerts (spec §4–§22).
 *
 * Pins the pure alert machinery against the spec table:
 *
 *   §6/§19/§20   the dedupe planner decision matrix — CREATE / UPDATE /
 *                REOPEN / AUTO_RESOLVE / NONE, incl. band-transition and
 *                disable semantics
 *   §6           fingerprints — tenantId:ruleType:entityType:entityId
 *   §7           severity resolution — override wins, but an engine
 *                CRITICAL is never down-scaled
 *   §9           hours bands mutually exclusive (82% fires ONLY the 80 band;
 *                a disabled band is skipped, not fatal)
 *   §10/§12      over-budget + margin CONSUME the engine row (§90 — the
 *                generators never recompute)
 *   §14/§15/§16  unbilled time (§96-honest minutes), unbilled expenses,
 *                due-soon / overdue / large-overdue cash rules
 *   §17          LARGE threshold compares Money MAJOR units DIRECTLY
 *   §9/§18       scope discipline — ACTIVE/ON_HOLD operational, COMPLETED
 *                gets the single CRITICAL, DRAFT/CANCELLED/ARCHIVED silent
 *   §24          rule PATCH validation — whitelisted keys, bounded values
 */
import { describe, it, expect } from 'vitest';
import { makeMoney } from '@/lib/agency/types/money';
import type { Project, ProjectStatus } from '@/lib/agency/types/project';
import type { ProjectProfitability } from '@/lib/agency/types/profitability';
import type { ReceivableInvoiceRow } from '@/lib/agency/types/receivables';
import type {
  ProjectTimeAggregates, ProjectExpenseAggregates, CurrencyAmount,
} from '@/lib/agency/queries/profitability-metrics';
import {
  ALERT_RULE_CATALOG, buildFingerprint, effectiveRuleConfiguration,
  isCostBearingRuleType, categoryForRuleType,
} from '@/lib/agency/alerts/rules';
import { resolveSeverity, countBySeverity, maxSeverity } from '@/lib/agency/alerts/severity';
import { planAlertWrite, tallyPlans } from '@/lib/agency/alerts/dedupe';
import type { AlertCandidate } from '@/lib/agency/alerts/dedupe';
import type { AlertRule, AlertRuleType, AgencyAlertRecord } from '@/lib/agency/alerts/types';
import { ALERT_RULE_TYPES } from '@/lib/agency/alerts/types';
import { generateProjectAlerts, generateCashAlerts, generateAlertCandidates } from '@/lib/agency/alerts/generators';
import { validateAlertRuleUpdate } from '@/lib/agency/validators/alert';

const TENANT = 'tenant-a';
const NOW = new Date('2026-09-14T10:00:00Z');

// ---------- fixtures ----------

/** All 11 rules, enabled, with their catalog defaults (§4 seeding shape). */
function allRules(overrides: Partial<Record<AlertRuleType, Partial<AlertRule>>> = {}): AlertRule[] {
  return ALERT_RULE_TYPES.map(type => ({
    id: `rule-${type}`,
    tenantId: TENANT,
    type,
    enabled: true,
    configuration: { ...ALERT_RULE_CATALOG[type].defaults },
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides[type],
  }));
}

function ruleOf(rules: readonly AlertRule[], type: AlertRuleType): AlertRule {
  const r = rules.find(x => x.type === type);
  if (!r) throw new Error(`missing fixture rule ${type}`);
  return r;
}

function proj(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1',
    tenantId: TENANT,
    clientId: 'client-1',
    name: 'Alpha Redesign',
    status: 'ACTIVE',
    billingModel: 'TIME_AND_MATERIALS',
    currency: 'INR',
    createdAt: '2026-09-01',
    ...overrides,
  };
}

/** A ProjectProfitability row — the §68 engine output the generators consume. */
function pp(overrides: Partial<ProjectProfitability> = {}): ProjectProfitability {
  const INR = (amount: number) => makeMoney(amount, 'INR');
  return {
    projectId: 'proj-1',
    projectName: 'Alpha Redesign',
    clientId: 'client-1',
    currency: 'INR',
    revenueModel: 'TIME_MATERIALS',
    contractValue: INR(500000),
    applicableRevenue: INR(200000),
    deliveryCost: INR(100000),
    laborCost: INR(80000),
    expenseCost: INR(20000),
    grossProfit: INR(100000),
    marginPercent: 50,
    billedAmount: INR(150000),
    collectedAmount: INR(150000),
    outstandingAmount: INR(0),
    unbilledAmount: INR(0),
    plannedHours: 100,
    actualHours: 50,
    remainingHours: 50,
    burn: { hours: 0.5, cost: 0.5, revenue: null },
    budgetBurnPercent: 50,
    targetMargin: 40,
    health: 'HEALTHY',
    marginAlert: null,
    hoursWarning: null,
    notes: [],
    currencyMismatches: 0,
    ...overrides,
  };
}

function time(overrides: Partial<ProjectTimeAggregates> = {}): ProjectTimeAggregates {
  return {
    approvedMinutes: 0,
    rateMissingCount: 0,
    laborCost: [],
    billableValue: [],
    unbilledTime: [],
    unbilledMinutes: 0,
    ...overrides,
  };
}

function exp(overrides: Partial<ProjectExpenseAggregates> = {}): ProjectExpenseAggregates {
  return { cost: [], unbilledCharge: [], ...overrides };
}

const INR_BUCKET = (amount: number): CurrencyAmount => ({ amount, currency: 'INR' });

/** A Module 14 open A/R row (§96). */
function ar(overrides: Partial<ReceivableInvoiceRow> = {}): ReceivableInvoiceRow {
  return {
    invoiceId: 'inv-1',
    invoiceNumber: 'INV-001',
    clientId: 'client-1',
    projectId: 'proj-1',
    dueDate: '2026-09-21',
    ageDays: 0,
    agingBucket: 'CURRENT',
    collectionRisk: null,
    status: 'SENT',
    displayStatus: 'SENT',
    total: INR_BUCKET(100000),
    paid: INR_BUCKET(0),
    due: INR_BUCKET(100000),
    ...overrides,
  };
}

const rulesWith = (type: AlertRuleType, config: AlertRule['configuration']): AlertRule[] =>
  allRules({ [type]: { configuration: config } });

const candidate = (over: Partial<AlertCandidate> = {}): AlertCandidate => ({
  ruleType: 'INVOICE_OVERDUE',
  entityType: 'INVOICE',
  entityId: 'inv-1',
  entityLabel: 'Invoice INV-001',
  severity: 'WARNING',
  title: 'Invoice overdue',
  message: 'Invoice INV-001 is 3 days past due',
  invoiceId: 'inv-1',
  ...over,
});

type StoredAlertKey = 'id' | 'tenantId' | 'status' | 'ruleType' | 'entityType' | 'entityId'
  | 'fingerprint' | 'acknowledgedBy' | 'resolvedBy';
const storedRecord = (
  over: Partial<Pick<AgencyAlertRecord, StoredAlertKey>> = {}
): Pick<AgencyAlertRecord, StoredAlertKey> => ({
  id: 'alert-1',
  tenantId: TENANT,
  ruleType: 'INVOICE_OVERDUE',
  entityType: 'INVOICE',
  entityId: 'inv-1',
  fingerprint: `${TENANT}:INVOICE_OVERDUE:INVOICE:inv-1`,
  status: 'OPEN',
  ...over,
});

// ---------- §6: fingerprint ----------

describe('Module 15 unit — fingerprint (§6)', () => {
  it('is tenantId:ruleType:entityType:entityId', () => {
    expect(buildFingerprint('t1', 'INVOICE_OVERDUE', 'INVOICE', 'inv-9'))
      .toBe('t1:INVOICE_OVERDUE:INVOICE:inv-9');
  });

  it('separates the hours bands (band transitions open a NEW alert)', () => {
    const f75 = buildFingerprint(TENANT, 'PROJECT_HOURS_75', 'PROJECT', 'p1');
    const f80 = buildFingerprint(TENANT, 'PROJECT_HOURS_80', 'PROJECT', 'p1');
    const f100 = buildFingerprint(TENANT, 'PROJECT_HOURS_100', 'PROJECT', 'p1');
    expect(new Set([f75, f80, f100]).size).toBe(3);
  });

  it('separates tenants (an alert can never leak across tenants)', () => {
    expect(buildFingerprint('t1', 'INVOICE_OVERDUE', 'INVOICE', 'inv-1'))
      .not.toBe(buildFingerprint('t2', 'INVOICE_OVERDUE', 'INVOICE', 'inv-1'));
  });
});

// ---------- catalog ----------

describe('Module 15 unit — rule catalog', () => {
  it('has exactly the 11 §4 rule types, each with category + default severity', () => {
    expect(ALERT_RULE_TYPES).toHaveLength(11);
    for (const type of ALERT_RULE_TYPES) {
      expect(ALERT_RULE_CATALOG[type].type).toBe(type);
      expect(['PROJECTS', 'BILLING', 'CASH']).toContain(categoryForRuleType(type));
      expect(['INFO', 'WARNING', 'CRITICAL']).toContain(ALERT_RULE_CATALOG[type].defaultSeverity);
    }
  });

  it('§114 — exactly OVER_BUDGET and MARGIN_BELOW_TARGET are cost-bearing', () => {
    expect(isCostBearingRuleType('PROJECT_OVER_BUDGET')).toBe(true);
    expect(isCostBearingRuleType('PROJECT_MARGIN_BELOW_TARGET')).toBe(true);
    for (const type of ALERT_RULE_TYPES) {
      if (type !== 'PROJECT_OVER_BUDGET' && type !== 'PROJECT_MARGIN_BELOW_TARGET') {
        expect(isCostBearingRuleType(type)).toBe(false);
      }
    }
  });

  it('effectiveRuleConfiguration overlays stored overrides on catalog defaults', () => {
    const rule = ruleOf(rulesWith('INVOICE_DUE_SOON', { days: 14 }), 'INVOICE_DUE_SOON');
    expect(effectiveRuleConfiguration(rule).days).toBe(14);
    // A missing override keeps the default — a broken config can't kill a rule.
    expect(effectiveRuleConfiguration(ruleOf(allRules(), 'INVOICE_DUE_SOON')).days).toBe(7);
    // Defaults never leak INTO other rules (LARGE has no days default).
    expect(effectiveRuleConfiguration(ruleOf(rulesWith('LARGE_INVOICE_OVERDUE', {}), 'LARGE_INVOICE_OVERDUE')).days)
      .toBeUndefined();
  });
});

// ---------- §7: severity ----------

describe('Module 15 unit — severity resolution (§7)', () => {
  it('defaults to the catalog default', () => {
    expect(resolveSeverity({ type: 'INVOICE_DUE_SOON', configuration: {} })).toBe('WARNING');
    expect(resolveSeverity({ type: 'UNBILLED_APPROVED_TIME', configuration: {} })).toBe('INFO');
  });

  it('the engine severity applies when the rule carries no override', () => {
    expect(resolveSeverity({ type: 'PROJECT_MARGIN_BELOW_TARGET', configuration: {} }, 'CRITICAL'))
      .toBe('CRITICAL');
  });

  it('a tenant override may RAISE above the default, never lower it', () => {
    // CRITICAL override on a WARNING-default rule → raised.
    expect(resolveSeverity({ type: 'INVOICE_DUE_SOON', configuration: { severity: 'CRITICAL' } }))
      .toBe('CRITICAL');
    // WARNING override on a CRITICAL-default rule stays CRITICAL (raise-only).
    expect(resolveSeverity({ type: 'LARGE_INVOICE_OVERDUE', configuration: { severity: 'WARNING' } }))
      .toBe('CRITICAL');
  });

  it('§7 — an override NEVER down-scales an engine CRITICAL', () => {
    expect(resolveSeverity(
      { type: 'PROJECT_MARGIN_BELOW_TARGET', configuration: { severity: 'INFO' } },
      'CRITICAL'
    )).toBe('CRITICAL');
  });

  it('maxSeverity never down-scales', () => {
    expect(maxSeverity('INFO', 'CRITICAL')).toBe('CRITICAL');
    expect(maxSeverity('CRITICAL', 'INFO')).toBe('CRITICAL');
    expect(maxSeverity('WARNING', 'WARNING')).toBe('WARNING');
  });

  it('countBySeverity tallies all three severities from zero', () => {
    expect(countBySeverity([])).toEqual({ INFO: 0, WARNING: 0, CRITICAL: 0 });
    expect(countBySeverity([{ severity: 'CRITICAL' }, { severity: 'CRITICAL' }, { severity: 'INFO' }]))
      .toEqual({ INFO: 1, WARNING: 0, CRITICAL: 2 });
  });
});

// ---------- §6/§19/§20: the dedupe planner decision matrix ----------

describe('Module 15 unit — dedupe planner matrix (§6/§19/§20)', () => {
  it('no existing + condition present → CREATE an OPEN record with the fingerprint', () => {
    const plan = planAlertWrite(TENANT, candidate(), undefined, NOW);
    expect(plan.action).toBe('CREATE');
    if (plan.action !== 'CREATE') return;
    expect(plan.record.status).toBe('OPEN');
    expect(plan.record.fingerprint).toBe(`${TENANT}:INVOICE_OVERDUE:INVOICE:inv-1`);
    expect(plan.record.triggeredAt).toBe(NOW);
  });

  it('no existing + no condition → NONE', () => {
    expect(planAlertWrite(TENANT, undefined, undefined, NOW)).toEqual({ action: 'NONE' });
  });

  it('OPEN + condition → UPDATE refreshes the payload but never status/lifecycle', () => {
    const plan = planAlertWrite(TENANT, candidate({ message: 'now 4 days past due' }), storedRecord(), NOW);
    expect(plan.action).toBe('UPDATE');
    if (plan.action !== 'UPDATE') return;
    expect(plan.changes.message).toBe('now 4 days past due');
    expect(plan.changes).not.toHaveProperty('status');
    expect(plan.changes).not.toHaveProperty('triggeredAt');
    expect(plan.changes).not.toHaveProperty('acknowledgedAt');
  });

  it('ACKNOWLEDGED + condition → UPDATE (a continuing condition is not a new notification)', () => {
    const plan = planAlertWrite(TENANT, candidate(), storedRecord({ status: 'ACKNOWLEDGED' }), NOW);
    expect(plan.action).toBe('UPDATE');
  });

  it('OPEN/ACKNOWLEDGED + no condition → AUTO_RESOLVE (system write, no actor)', () => {
    for (const status of ['OPEN', 'ACKNOWLEDGED'] as const) {
      const plan = planAlertWrite(TENANT, undefined, storedRecord({ status }), NOW);
      expect(plan.action).toBe('AUTO_RESOLVE');
      if (plan.action !== 'AUTO_RESOLVE') return;
      expect(plan.id).toBe('alert-1');
    }
  });

  it('RESOLVED + condition → REOPEN a NEW OPEN cycle (ack/resolve cleared, triggeredAt reset)', () => {
    const plan = planAlertWrite(
      TENANT, candidate({ message: 'returned' }),
      storedRecord({ status: 'RESOLVED', resolvedBy: 'admin', acknowledgedBy: 'admin' }),
      NOW
    );
    expect(plan.action).toBe('REOPEN');
    if (plan.action !== 'REOPEN') return;
    expect(plan.record.status).toBe('OPEN');
    expect(plan.record.triggeredAt).toBe(NOW);
    // The evaluator's cycleChanges clears the lifecycle fields via undefined →
    // $unset; the record here must not carry them forward.
    expect(plan.record).not.toHaveProperty('acknowledgedBy');
    expect(plan.record).not.toHaveProperty('resolvedBy');
  });

  it('RESOLVED + no condition → NONE (stays resolved, untouched)', () => {
    expect(planAlertWrite(TENANT, undefined, storedRecord({ status: 'RESOLVED' }), NOW))
      .toEqual({ action: 'NONE' });
  });

  it('UPDATE with an absent optional field keeps the stored one (no clearing)', () => {
    // refreshable() only sets keys the candidate carries — an entity without a
    // projectId must not blank the stored projectId with undefined.
    const plan = planAlertWrite(
      TENANT,
      candidate({ projectId: undefined, message: 'refreshed' }),
      storedRecord({ ruleType: 'INVOICE_OVERDUE' }),
      NOW
    );
    expect(plan.action).toBe('UPDATE');
    if (plan.action !== 'UPDATE') return;
    expect(plan.changes).not.toHaveProperty('projectId');
  });

  it('tallyPlans counts each write kind', () => {
    const tally = tallyPlans([
      { action: 'NONE' },
      { action: 'CREATE', fingerprint: 'f', record: {} as never },
      { action: 'UPDATE', fingerprint: 'f', id: 'a', changes: {} },
      { action: 'REOPEN', fingerprint: 'f', id: 'b', record: {} as never },
      { action: 'AUTO_RESOLVE', fingerprint: 'f', id: 'c' },
    ]);
    expect(tally).toEqual({ created: 1, updated: 1, reopened: 1, autoResolved: 1 });
  });
});

// ---------- §9: hours bands ----------

describe('Module 15 unit — hours bands (§9, mutually exclusive)', () => {
  const hoursRow = (planned: number, actual: number) =>
    pp({ plannedHours: planned, actualHours: actual, burn: { hours: planned ? actual / planned : null, cost: null, revenue: null } });

  it('82% fires ONLY the 80 band (never 75 too)', () => {
    const out = generateProjectAlerts([{ row: hoursRow(100, 82), status: 'ACTIVE' }], allRules());
    expect(out.map(c => c.ruleType)).toEqual(['PROJECT_HOURS_80']);
  });

  it('100% fires ONLY the 100 band (exhausted outranks the lower bands)', () => {
    const out = generateProjectAlerts([{ row: hoursRow(100, 130), status: 'ACTIVE' }], allRules());
    expect(out.map(c => c.ruleType)).toEqual(['PROJECT_HOURS_100']);
  });

  it('below 75% fires nothing', () => {
    const out = generateProjectAlerts([{ row: hoursRow(100, 74), status: 'ACTIVE' }], allRules());
    expect(out).toEqual([]);
  });

  it('a disabled higher band is skipped — 82% with the 80 band disabled falls to the 75 band', () => {
    const rules = allRules({ PROJECT_HOURS_80: { enabled: false } });
    const out = generateProjectAlerts([{ row: hoursRow(100, 82), status: 'ACTIVE' }], rules);
    expect(out.map(c => c.ruleType)).toEqual(['PROJECT_HOURS_75']);
  });

  it('all bands disabled → no hours candidates (§19: disable = silence)', () => {
    const rules = allRules({
      PROJECT_HOURS_75: { enabled: false },
      PROJECT_HOURS_80: { enabled: false },
      PROJECT_HOURS_100: { enabled: false },
    });
    expect(generateProjectAlerts([{ row: hoursRow(100, 85), status: 'ACTIVE' }], rules)).toEqual([]);
  });

  it('no plannedHours baseline → no hours alert (never a division by nothing)', () => {
    const out = generateProjectAlerts([{ row: hoursRow(0, 50), status: 'ACTIVE' }], allRules());
    expect(out.filter(c => c.ruleType.startsWith('PROJECT_HOURS'))).toEqual([]);
  });

  it('carries the utilization value + threshold and the entity label', () => {
    const out = generateProjectAlerts([{ row: hoursRow(100, 82), status: 'ACTIVE' }], allRules());
    expect(out[0].value).toBe(82);
    expect(out[0].threshold).toBe(80);
    expect(out[0].entityLabel).toBe('Alpha Redesign');
    expect(out[0].entityId).toBe('proj-1');
  });
});

// ---------- §10/§12: over-budget + margin (§90 consume) ----------

describe('Module 15 unit — over-budget + margin (§10/§12, §90 consume)', () => {
  it('cost burn > threshold fires OVER_BUDGET from row.burn.cost (never recomputed)', () => {
    const out = generateProjectAlerts(
      [{ row: pp({ deliveryCost: makeMoney(105000, 'INR'), burn: { hours: null, cost: 1.05, revenue: null } }), status: 'ACTIVE' }],
      allRules()
    );
    expect(out.map(c => c.ruleType)).toEqual(['PROJECT_OVER_BUDGET']);
    expect(out[0].value).toBe(105);
    expect(out[0].threshold).toBe(100);
    expect(out[0].metadata?.costBurnRatio).toBe(1.05);
  });

  it('cost burn exactly at 100% does NOT fire (strictly over budget)', () => {
    const out = generateProjectAlerts(
      [{ row: pp({ burn: { hours: null, cost: 1.0, revenue: null } }), status: 'ACTIVE' }],
      allRules()
    );
    expect(out).toEqual([]);
  });

  it('burn.cost null (no cost baseline) → no alert, never a fabricated burn', () => {
    const out = generateProjectAlerts(
      [{ row: pp({ burn: { hours: null, cost: null, revenue: null } }), status: 'ACTIVE' }],
      allRules()
    );
    expect(out).toEqual([]);
  });

  it('a tenant-tuned threshold (110%) raises the bar', () => {
    const rules = rulesWith('PROJECT_OVER_BUDGET', { percentage: 110 });
    const row = pp({ burn: { hours: null, cost: 1.05, revenue: null } });
    expect(generateProjectAlerts([{ row, status: 'ACTIVE' }], rules)).toEqual([]);
    const rowOver = pp({ burn: { hours: null, cost: 1.11, revenue: null } });
    expect(generateProjectAlerts([{ row: rowOver, status: 'ACTIVE' }], rules).map(c => c.ruleType))
      .toEqual(['PROJECT_OVER_BUDGET']);
  });

  it('marginAlert present → candidate consumes it wholesale (§90: value, target, reason)', () => {
    const row = pp({
      marginAlert: {
        severity: 'WARNING',
        currentMarginPercent: 20,
        targetMarginPercent: 40,
        reason: 'Current delivery cost is higher than the project economics support.',
      },
    });
    const out = generateProjectAlerts([{ row, status: 'ACTIVE' }], allRules());
    expect(out.map(c => c.ruleType)).toEqual(['PROJECT_MARGIN_BELOW_TARGET']);
    expect(out[0].value).toBe(20);
    expect(out[0].threshold).toBe(40);
    expect(out[0].message).toContain('project economics');
  });

  it('the engine CRITICAL escalation survives (§7 — never down-scaled)', () => {
    const row = pp({
      marginAlert: {
        severity: 'CRITICAL',
        currentMarginPercent: 5,
        targetMarginPercent: 40,
        reason: 'Margin is far below the target.',
      },
    });
    const rules = rulesWith('PROJECT_MARGIN_BELOW_TARGET', { severity: 'INFO' });
    const out = generateProjectAlerts([{ row, status: 'ACTIVE' }], rules);
    expect(out[0].severity).toBe('CRITICAL');
  });
});

// ---------- §14/§15/§16: unbilled + cash ----------

describe('Module 15 unit — unbilled time/expense (§14/§15, §96-honest)', () => {
  it('unbilled MINUTES > 0 fires, value = hours (minutes count even when unpriced)', () => {
    const out = generateProjectAlerts(
      [{ row: pp(), status: 'ACTIVE', time: time({ unbilledMinutes: 90 }) }],
      allRules()
    );
    expect(out.map(c => c.ruleType)).toEqual(['UNBILLED_APPROVED_TIME']);
    expect(out[0].value).toBe(1.5); // 90 minutes = 1.5h, no pricing involved
    expect(out[0].entityType).toBe('TIME');
  });

  it('zero unbilled minutes → no alert even when an unbilled VALUE bucket exists', () => {
    const out = generateProjectAlerts(
      [{ row: pp(), status: 'ACTIVE', time: time({ unbilledMinutes: 0, unbilledTime: [INR_BUCKET(0)] }) }],
      allRules()
    );
    expect(out).toEqual([]);
  });

  it('unbilled expenses fire on currency buckets (§127 — never merged)', () => {
    const out = generateProjectAlerts(
      [{ row: pp(), status: 'ACTIVE', expenses: exp({ unbilledCharge: [INR_BUCKET(5000), INR_BUCKET(12000)] }) }],
      allRules()
    );
    expect(out.map(c => c.ruleType)).toEqual(['UNBILLED_EXPENSE']);
    expect(out[0].value).toBe(12000); // the largest bucket
    expect((out[0].metadata?.unbilledCharge as CurrencyAmount[]).length).toBe(2);
  });
});

describe('Module 15 unit — cash rules (§15–§17)', () => {
  it('due today (0 days left) is due-soon', () => {
    const out = generateCashAlerts([ar({ dueDate: '2026-09-14' })], allRules(), '2026-09-14');
    expect(out.map(c => c.ruleType)).toEqual(['INVOICE_DUE_SOON']);
    expect(out[0].value).toBe(0);
  });

  it('the 7-day window boundary is inclusive', () => {
    expect(generateCashAlerts([ar({ dueDate: '2026-09-21' })], allRules(), '2026-09-14')
      .map(c => c.ruleType)).toEqual(['INVOICE_DUE_SOON']);
    expect(generateCashAlerts([ar({ dueDate: '2026-09-22' })], allRules(), '2026-09-14'))
      .toEqual([]);
  });

  it('a tenant-tuned window (14 days) widens the net', () => {
    const rules = rulesWith('INVOICE_DUE_SOON', { days: 14 });
    expect(generateCashAlerts([ar({ dueDate: '2026-09-22' })], rules, '2026-09-14')
      .map(c => c.ruleType)).toEqual(['INVOICE_DUE_SOON']);
  });

  it('past due is OVERDUE, not DUE_SOON (the two windows never overlap)', () => {
    const out = generateCashAlerts(
      [ar({ dueDate: '2026-09-10', ageDays: 4, due: INR_BUCKET(5000) })],
      allRules(), '2026-09-14'
    );
    expect(out.map(c => c.ruleType)).toEqual(['INVOICE_OVERDUE']);
  });

  it('§17 — a LARGE overdue invoice fires BOTH the plain and the large rule', () => {
    const out = generateCashAlerts(
      [ar({ dueDate: '2026-09-01', ageDays: 13, due: INR_BUCKET(150000) })],
      allRules(), '2026-09-14'
    );
    expect(out.map(c => c.ruleType)).toEqual(['INVOICE_OVERDUE', 'LARGE_INVOICE_OVERDUE']);
    expect(out[1].value).toBe(150000);      // the due amount (MAJOR units)
    expect(out[1].threshold).toBe(100000);  // the default threshold (MAJOR units)
  });

  it('§17 — the threshold is a DIRECT major-unit comparison (₹1,00,000 = 100000)', () => {
    // Exactly at the default threshold: fires (>=).
    expect(generateCashAlerts(
      [ar({ dueDate: '2026-09-01', ageDays: 13, due: INR_BUCKET(100000) })],
      allRules(), '2026-09-14'
    ).map(c => c.ruleType)).toEqual(['INVOICE_OVERDUE', 'LARGE_INVOICE_OVERDUE']);
    // One rupee below: not large.
    expect(generateCashAlerts(
      [ar({ dueDate: '2026-09-01', ageDays: 13, due: INR_BUCKET(99999) })],
      allRules(), '2026-09-14'
    ).map(c => c.ruleType)).toEqual(['INVOICE_OVERDUE']);
  });

  it('a small overdue invoice fires only the plain OVERDUE rule', () => {
    const out = generateCashAlerts(
      [ar({ dueDate: '2026-09-12', ageDays: 2, due: INR_BUCKET(5000) })],
      allRules(), '2026-09-14'
    );
    expect(out.map(c => c.ruleType)).toEqual(['INVOICE_OVERDUE']);
  });

  it('not yet due and not in the window → silence', () => {
    expect(generateCashAlerts([ar({ dueDate: '2026-10-01' })], allRules(), '2026-09-14')).toEqual([]);
  });

  it('candidates carry the invoice entity label and projectId when linked', () => {
    const out = generateCashAlerts([ar({ dueDate: '2026-09-10', ageDays: 4 })], allRules(), '2026-09-14');
    expect(out[0].entityLabel).toBe('Invoice INV-001');
    expect(out[0].invoiceId).toBe('inv-1');
    expect(out[0].projectId).toBe('proj-1');
    // A standalone invoice carries no projectId (the key is absent, not null).
    const standalone = generateCashAlerts(
      [ar({ projectId: null })], allRules(), '2026-09-14'
    );
    expect(standalone[0]).not.toHaveProperty('projectId');
  });
});

// ---------- §9/§18: scope discipline ----------

describe('Module 15 unit — scope discipline (§9/§18)', () => {
  /** A row that would fire EVERY project rule if scope allowed it. */
  const loudRow = () => pp({
    plannedHours: 100,
    actualHours: 120,
    burn: { hours: 1.2, cost: 1.2, revenue: null },
    marginAlert: {
      severity: 'WARNING', currentMarginPercent: 10, targetMarginPercent: 40, reason: 'Margin below target.',
    },
    unbilledAmount: makeMoney(50000, 'INR'),
  });
  const loudTime = time({ unbilledMinutes: 120 });
  const loudExpenses = exp({ unbilledCharge: [INR_BUCKET(5000)] });

  it.each<[ProjectStatus, AlertRuleType[]]>([
    // ACTIVE + ON_HOLD: everything operational fires.
    ['ACTIVE', ['PROJECT_HOURS_100', 'PROJECT_OVER_BUDGET', 'PROJECT_MARGIN_BELOW_TARGET', 'UNBILLED_APPROVED_TIME', 'UNBILLED_EXPENSE']],
    ['ON_HOLD', ['PROJECT_HOURS_100', 'PROJECT_OVER_BUDGET', 'PROJECT_MARGIN_BELOW_TARGET', 'UNBILLED_APPROVED_TIME', 'UNBILLED_EXPENSE']],
    // COMPLETED: ONLY the single CRITICAL completed-unbilled rule.
    ['COMPLETED', ['COMPLETED_PROJECT_UNBILLED_WORK']],
    // DRAFT/CANCELLED/ARCHIVED: total silence.
    ['DRAFT', []],
    ['CANCELLED', []],
    ['ARCHIVED', []],
  ])('status %s → exactly %s', (status, expected) => {
    const out = generateProjectAlerts(
      [{ row: loudRow(), status, time: loudTime, expenses: loudExpenses }],
      allRules()
    );
    expect([...out].sort((a, b) => a.ruleType.localeCompare(b.ruleType)).map(c => c.ruleType))
      .toEqual([...expected].sort((a, b) => a.localeCompare(b)));
  });

  it('a COMPLETED project with everything unbilled fires exactly ONE alert (no stacking)', () => {
    const out = generateProjectAlerts(
      [{ row: loudRow(), status: 'COMPLETED', time: loudTime, expenses: loudExpenses }],
      allRules()
    );
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe('CRITICAL');
  });

  it('a COMPLETED project with nothing unbilled fires nothing', () => {
    expect(generateProjectAlerts([{ row: pp(), status: 'COMPLETED' }], allRules())).toEqual([]);
  });
});

// ---------- the entry point ----------

describe('Module 15 unit — generateAlertCandidates (the one entry point)', () => {
  it('joins portfolio rows with projects and skips engine ghosts', () => {
    const out = generateAlertCandidates({
      today: '2026-09-14',
      rules: allRules(),
      projects: [proj()], // only proj-1 exists; the proj-ghost row must vanish
      portfolio: [
        pp({ projectId: 'proj-1', plannedHours: 100, actualHours: 82, burn: { hours: 0.82, cost: null, revenue: null } }),
        pp({ projectId: 'proj-ghost', projectName: 'Ghost', plannedHours: 100, actualHours: 90, burn: { hours: 0.9, cost: null, revenue: null } }),
      ],
      timeAggregates: new Map(),
      expenseAggregates: new Map(),
      receivableInvoices: [],
    });
    expect(out.map(c => c.ruleType)).toEqual(['PROJECT_HOURS_80']);
    expect(out[0].entityId).toBe('proj-1');
  });

  it('is deterministic: same sources → same candidates, always (§84 discipline)', () => {
    const sources = {
      today: '2026-09-14' as const,
      rules: allRules(),
      projects: [proj()],
      portfolio: [pp({ plannedHours: 100, actualHours: 90, burn: { hours: 0.9, cost: null, revenue: null } })],
      timeAggregates: new Map([['proj-1', time({ unbilledMinutes: 60 })]]),
      expenseAggregates: new Map<string, ProjectExpenseAggregates>(),
      receivableInvoices: [ar({ dueDate: '2026-09-10', ageDays: 4 })],
    };
    expect(generateAlertCandidates(sources)).toEqual(generateAlertCandidates(sources));
  });
});

// ---------- §24: rule PATCH validation ----------

describe('Module 15 unit — rule PATCH validation (§24)', () => {
  it('accepts a valid patch and prunes nothing', () => {
    const res = validateAlertRuleUpdate({ enabled: false, configuration: { days: 14 } });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.enabled).toBe(false);
      expect(res.value.configuration).toEqual({ days: 14 });
    }
  });

  it('accepts an empty payload (a no-op PATCH is not an error)', () => {
    const res = validateAlertRuleUpdate({});
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value).toEqual({});
  });

  it('rejects a non-boolean enabled', () => {
    const res = validateAlertRuleUpdate({ enabled: 'yes' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some(e => e.field === 'enabled')).toBe(true);
  });

  it('rejects an unknown configuration key (a typo never looks like a save)', () => {
    const res = validateAlertRuleUpdate({ configuration: { day: 7 } });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some(e => e.field === 'configuration.day')).toBe(true);
  });

  it('bounds days: whole numbers 1–365', () => {
    for (const days of [0, -1, 1.5, 366]) {
      expect(validateAlertRuleUpdate({ configuration: { days } }).ok).toBe(false);
    }
    for (const days of [1, 7, 365]) {
      expect(validateAlertRuleUpdate({ configuration: { days } }).ok).toBe(true);
    }
  });

  it('bounds amount: positive, up to 1e12 (MAJOR units)', () => {
    for (const amount of [0, -100, 1e12 + 1]) {
      expect(validateAlertRuleUpdate({ configuration: { amount } }).ok).toBe(false);
    }
    for (const amount of [1, 100000, 1e12]) {
      expect(validateAlertRuleUpdate({ configuration: { amount } }).ok).toBe(true);
    }
  });

  it('bounds percentage: positive, up to 1000 (tuning headroom above 100)', () => {
    for (const percentage of [0, -5, 1001]) {
      expect(validateAlertRuleUpdate({ configuration: { percentage } }).ok).toBe(false);
    }
    for (const percentage of [1, 75, 110, 1000]) {
      expect(validateAlertRuleUpdate({ configuration: { percentage } }).ok).toBe(true);
    }
  });

  it('rejects a severity outside the §7 union', () => {
    expect(validateAlertRuleUpdate({ configuration: { severity: 'URGENT' } }).ok).toBe(false);
    expect(validateAlertRuleUpdate({ configuration: { severity: 'INFO' } }).ok).toBe(true);
  });

  it('rejects a non-object configuration', () => {
    const res = validateAlertRuleUpdate({ configuration: [1, 2] });
    expect(res.ok).toBe(false);
  });
});
