/**
 * Module 15 — Integration: the alerts API surface (§21–§24).
 *
 * Runs the REAL route handlers (list / summary / evaluate / acknowledge /
 * resolve / alert-rules) and the REAL evaluator + dedupe planner over a
 * stateful in-memory mirror of the two alert stores, with only the
 * session/tenant edges and the M13/M14 ENGINE SOURCES mocked. Pins:
 *
 *   §21   evaluation strategy — summary evaluates (idempotent, no duplicate
 *         fingerprints on re-run); the list route never evaluates
 *   §6    fingerprint upserts through the REAL evaluator — CREATE / UPDATE /
 *         AUTO_RESOLVE / REOPEN all observed end-to-end
 *   §19   lifecycle — acknowledge/resolve transitions, 409 on illegal moves,
 *         404 for missing AND cross-tenant ids (§113 identical), audit rows
 *   §114  a USER sees the alert COUNTS (cost-bearing included) but never the
 *         cost-bearing ROWS
 *   §24   rule PATCH — enable/disable + configuration, validation 400s,
 *         unknown rule 404, USER 403; disable = silence (auto-resolve)
 *   §113  tenant isolation — tenant B's evaluation never sees A's data
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TokenPayload } from '@/lib/auth';
import type { Tenant, User } from '@/lib/db';
import type { AlertRule, AgencyAlertRecord } from '@/lib/agency/alerts/types';
import type { Project } from '@/lib/agency/types/project';
import type { ProjectProfitability } from '@/lib/agency/types/profitability';
import type { ReceivableInvoiceRow, ReceivablesMetrics } from '@/lib/agency/types/receivables';
import type {
  ProjectTimeAggregates, ProjectExpenseAggregates,
} from '@/lib/agency/queries/profitability-metrics';
import { todayInTimezone, addDays } from '@/lib/agency/types/dates';
import { makeMoney } from '@/lib/agency/types/money';
import { AGENCY_A, AGENCY_B } from '../fixtures/agency-fixtures';

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, getSessionUser: vi.fn() };
});

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...actual,
    getSessionUserDeps: undefined,
    getTenantById: vi.fn(),
    getUserById: vi.fn(),
    getLogs: vi.fn(),
    createLog: vi.fn(),
    connectDb: vi.fn(),
    initLocalDb: vi.fn(),
    getProjects: vi.fn(),
    getAlertRules: vi.fn(),
    createAlertRule: vi.fn(),
    getAlertRuleById: vi.fn(),
    updateAlertRule: vi.fn(),
    listAgencyAlerts: vi.fn(),
    getAgencyAlertById: vi.fn(),
    createAgencyAlert: vi.fn(),
    updateAgencyAlert: vi.fn(),
  };
});

// The M13/M14 engine sources the evaluator consumes (§90) — mocked so the
// REAL evaluator + planner + routes run end-to-end over controlled inputs.
vi.mock('@/lib/agency/profitability', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/agency/profitability')>();
  return { ...actual, getPortfolioProfitability: vi.fn() };
});

vi.mock('@/lib/agency/queries/profitability-metrics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/agency/queries/profitability-metrics')>();
  return {
    ...actual,
    getProjectTimeAggregates: vi.fn(),
    getProjectExpenseAggregates: vi.fn(),
  };
});

vi.mock('@/lib/agency/queries/receivables-summary', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/agency/queries/receivables-summary')>();
  return { ...actual, getReceivablesMetrics: vi.fn() };
});

import { getSessionUser } from '@/lib/auth';
import {
  getTenantById, getUserById, createLog, connectDb, initLocalDb, getProjects,
  getAlertRules, createAlertRule, getAlertRuleById, updateAlertRule,
  listAgencyAlerts, getAgencyAlertById, createAgencyAlert, updateAgencyAlert,
} from '@/lib/db';
import { getPortfolioProfitability } from '@/lib/agency/profitability';
import {
  getProjectTimeAggregates, getProjectExpenseAggregates,
} from '@/lib/agency/queries/profitability-metrics';
import { getReceivablesMetrics } from '@/lib/agency/queries/receivables-summary';
import { GET as listRoute } from '@/app/api/agency/alerts/route';
import { GET as summaryRoute } from '@/app/api/agency/alerts/summary/route';
import { POST as evaluateRoute } from '@/app/api/agency/alerts/evaluate/route';
import { POST as acknowledgeRoute } from '@/app/api/agency/alerts/[id]/acknowledge/route';
import { POST as resolveRoute } from '@/app/api/agency/alerts/[id]/resolve/route';
import { GET as rulesRoute } from '@/app/api/agency/alert-rules/route';
import { PATCH as rulePatchRoute } from '@/app/api/agency/alert-rules/[id]/route';
import { NextRequest } from 'next/server';

const mockSession = vi.mocked(getSessionUser);
const mockGetTenant = vi.mocked(getTenantById);
const mockGetUserById = vi.mocked(getUserById);
const mockCreateLog = vi.mocked(createLog);
const mockConnectDb = vi.mocked(connectDb);
const mockInitLocalDb = vi.mocked(initLocalDb);
const mockGetProjects = vi.mocked(getProjects);
const mockGetAlertRules = vi.mocked(getAlertRules);
const mockCreateAlertRule = vi.mocked(createAlertRule);
const mockGetAlertRuleById = vi.mocked(getAlertRuleById);
const mockUpdateAlertRule = vi.mocked(updateAlertRule);
const mockListAgencyAlerts = vi.mocked(listAgencyAlerts);
const mockGetAgencyAlertById = vi.mocked(getAgencyAlertById);
const mockCreateAgencyAlert = vi.mocked(createAgencyAlert);
const mockUpdateAgencyAlert = vi.mocked(updateAgencyAlert);
const mockPortfolio = vi.mocked(getPortfolioProfitability);
const mockTimeAgg = vi.mocked(getProjectTimeAggregates);
const mockExpenseAgg = vi.mocked(getProjectExpenseAggregates);
const mockReceivables = vi.mocked(getReceivablesMetrics);

const T: string = AGENCY_A.tenant.id;

// ---------- the stateful store mirror (same semantics as the repos) ----------

interface Mirror {
  rules: AlertRule[];
  alerts: AgencyAlertRecord[];
  seq: number;
}
const mirrors = new Map<string, Mirror>();
function mirror(tenantId: string): Mirror {
  let m = mirrors.get(tenantId);
  if (!m) {
    m = { rules: [], alerts: [], seq: 0 };
    mirrors.set(tenantId, m);
  }
  return m;
}

// ---------- the engine source fixtures (§90: consumed, never recomputed) ----------

const TODAY = todayInTimezone();

let engineProjects: Project[];
let engineRows: ProjectProfitability[];
let engineTime: Map<string, ProjectTimeAggregates>;
let engineExpenses: Map<string, ProjectExpenseAggregates>;
let engineInvoices: ReceivableInvoiceRow[];

/** A project that fires EVERY operational rule (see generateProjectAlerts). */
function loudEngine() {
  engineProjects = [{
    id: AGENCY_A.project.id, tenantId: T, clientId: AGENCY_A.client.id,
    name: 'Project A — Website Redesign', status: 'ACTIVE',
    billingModel: 'FIXED_FEE', currency: 'INR',
    createdAt: new Date('2026-08-01'), updatedAt: new Date('2026-08-01'),
  } as unknown as Project];
  engineRows = [{
    projectId: AGENCY_A.project.id,
    projectName: 'Project A — Website Redesign',
    clientId: AGENCY_A.client.id,
    currency: 'INR',
    revenueModel: 'FIXED_FEE',
    contractValue: makeMoney(500000, 'INR'),
    applicableRevenue: makeMoney(200000, 'INR'),
    deliveryCost: makeMoney(210000, 'INR'),
    laborCost: makeMoney(190000, 'INR'),
    expenseCost: makeMoney(20000, 'INR'),
    grossProfit: makeMoney(0, 'INR'),
    marginPercent: -5,
    billedAmount: makeMoney(150000, 'INR'),
    collectedAmount: makeMoney(100000, 'INR'),
    outstandingAmount: makeMoney(50000, 'INR'),
    unbilledAmount: makeMoney(50000, 'INR'),
    plannedHours: 100,
    actualHours: 82,
    remainingHours: 18,
    burn: { hours: 0.82, cost: 1.05, revenue: null },
    budgetBurnPercent: 105,
    targetMargin: 40,
    health: 'OVER_BUDGET',
    marginAlert: {
      severity: 'CRITICAL', currentMarginPercent: -5, targetMarginPercent: 40,
      reason: 'Current delivery cost is higher than the project economics support.',
    },
    hoursWarning: { level: 'APPROACHING', hourBurnPercent: 82, message: 'approaching' },
    notes: [],
    currencyMismatches: 0,
  }];
  engineTime = new Map([[AGENCY_A.project.id, {
    approvedMinutes: 4920, rateMissingCount: 0, laborCost: [], billableValue: [],
    unbilledTime: [{ amount: 45000, currency: 'INR' }], unbilledMinutes: 90,
  }]]);
  engineExpenses = new Map([[AGENCY_A.project.id, {
    cost: [], unbilledCharge: [{ amount: 5000, currency: 'INR' }],
  }]]);
  engineInvoices = [{
    invoiceId: 'inv-due-soon', invoiceNumber: 'INV-101', clientId: AGENCY_A.client.id,
    projectId: AGENCY_A.project.id, dueDate: addDays(TODAY, 3), ageDays: 0,
    agingBucket: 'CURRENT', collectionRisk: null, status: 'SENT', displayStatus: 'SENT',
    total: { amount: 50000, currency: 'INR' },
    paid: { amount: 0, currency: 'INR' },
    due: { amount: 50000, currency: 'INR' },
  }];
}

/** A quiet engine: the loud conditions are gone (auto-resolve scenario). */
function quietEngine() {
  engineRows = [{
    ...engineRows[0],
    actualHours: 50, plannedHours: 100, remainingHours: 50,
    burn: { hours: 0.5, cost: 0.5, revenue: null },
    budgetBurnPercent: 50, health: 'HEALTHY', marginAlert: null, hoursWarning: null,
    unbilledAmount: makeMoney(0, 'INR'),
  }];
  engineTime = new Map([[AGENCY_A.project.id, {
    approvedMinutes: 3000, rateMissingCount: 0, laborCost: [], billableValue: [],
    unbilledTime: [], unbilledMinutes: 0,
  }]]);
  engineExpenses = new Map([[AGENCY_A.project.id, { cost: [], unbilledCharge: [] }]]);
  engineInvoices = [];
}

beforeEach(() => {
  for (const m of [mockSession, mockGetTenant, mockGetUserById, mockCreateLog, mockConnectDb,
    mockInitLocalDb, mockGetProjects, mockGetAlertRules, mockCreateAlertRule, mockGetAlertRuleById,
    mockUpdateAlertRule, mockListAgencyAlerts, mockGetAgencyAlertById, mockCreateAgencyAlert,
    mockUpdateAgencyAlert, mockPortfolio, mockTimeAgg, mockExpenseAgg, mockReceivables]) {
    m.mockReset();
  }
  mockCreateLog.mockResolvedValue({} as Awaited<ReturnType<typeof createLog>>);

  mirrors.clear();
  loudEngine();

  // ---- store mirror: same semantics as the repos (§6/§19) ----
  mockGetAlertRules.mockImplementation(async (tenantId: string) => [...mirror(tenantId).rules]);
  mockCreateAlertRule.mockImplementation(async (tenantId: string, input: { type: AlertRule['type']; enabled: boolean; configuration: AlertRule['configuration'] }) => {
    const m = mirror(tenantId);
    if (m.rules.some(r => r.type === input.type)) {
      // The unique {tenantId, type} index rejects the loser of a seed race.
      const e = new Error('E11000 duplicate key') as Error & { code: number };
      e.code = 11000;
      throw e;
    }
    const now = new Date();
    const rule: AlertRule = {
      id: `rule-${++m.seq}`, tenantId, type: input.type,
      enabled: input.enabled, configuration: { ...input.configuration },
      createdAt: now, updatedAt: now,
    };
    m.rules.push(rule);
    return rule;
  });
  mockGetAlertRuleById.mockImplementation(async (id: string, tenantId: string) =>
    mirror(tenantId).rules.find(r => r.id === id) ?? null);
  mockUpdateAlertRule.mockImplementation(async (id: string, tenantId: string, updates: Partial<Pick<AlertRule, 'enabled' | 'configuration'>>) => {
    const rule = mirror(tenantId).rules.find(r => r.id === id);
    if (!rule) return false;
    if (updates.enabled !== undefined) rule.enabled = updates.enabled;
    if (updates.configuration !== undefined) rule.configuration = { ...rule.configuration, ...updates.configuration };
    rule.updatedAt = new Date();
    return true;
  });
  mockListAgencyAlerts.mockImplementation(async (tenantId: string, filters: { status?: string; severity?: string; ruleType?: string; limit?: number } = {}) => {
    let rows = mirror(tenantId).alerts.filter(a =>
      (filters.status === undefined || a.status === filters.status)
      && (filters.severity === undefined || a.severity === filters.severity)
      && (filters.ruleType === undefined || a.ruleType === filters.ruleType));
    if (filters.limit !== undefined) rows = rows.slice(0, filters.limit);
    // CLONES, like a real query snapshot: the evaluator reads `stored` before
    // executing writes, and the real store would not reflect those writes
    // back into an already-materialized result set.
    return rows.map(a => ({ ...a }));
  });
  mockGetAgencyAlertById.mockImplementation(async (id: string, tenantId: string) =>
    mirror(tenantId).alerts.find(a => a.id === id) ?? null);
  mockCreateAgencyAlert.mockImplementation(async (tenantId: string, input: Omit<AgencyAlertRecord, 'id'>) => {
    const m = mirror(tenantId);
    if (m.alerts.some(a => a.fingerprint === input.fingerprint)) {
      const e = new Error('E11000 duplicate key') as Error & { code: number };
      e.code = 11000;
      throw e;
    }
    const record: AgencyAlertRecord = { ...input, tenantId, id: `alert-${++m.seq}` };
    m.alerts.push(record);
    return record;
  });
  mockUpdateAgencyAlert.mockImplementation(async (id: string, tenantId: string, changes: Record<string, unknown>) => {
    const record = mirror(tenantId).alerts.find(a => a.id === id);
    if (!record) return false;
    for (const [key, value] of Object.entries(changes)) {
      const row = record as unknown as Record<string, unknown>;
      if (value === undefined) {
        delete row[key]; // $unset semantics
      } else {
        row[key] = value;
      }
    }
    return true;
  });

  // ---- engine sources (§90): consumed by the REAL evaluator ----
  mockGetProjects.mockImplementation(async (tenantId: string) =>
    engineProjects.filter(p => p.tenantId === tenantId) as Awaited<ReturnType<typeof getProjects>>);
  mockPortfolio.mockImplementation(async () => ({
    projects: engineRows,
    byClient: [],
    summary: {
      projectCount: engineRows.length, mixedCurrencies: false,
      contractValue: null, applicableRevenue: null, deliveryCost: null,
      grossProfit: null, marginPercent: null, billedAmount: null,
      collectedAmount: null, unbilledAmount: null,
    },
  }) as Awaited<ReturnType<typeof getPortfolioProfitability>>);
  mockTimeAgg.mockImplementation(async () => new Map(engineTime) as Awaited<ReturnType<typeof getProjectTimeAggregates>>);
  mockExpenseAgg.mockImplementation(async () => new Map(engineExpenses) as Awaited<ReturnType<typeof getProjectExpenseAggregates>>);
  mockReceivables.mockImplementation(async (tenantId: string) => ({
    outstanding: 50000, dueSoon: 50000, overdueAmount: 0, overdueCount: 0,
    openInvoiceCount: 1,
    byAgingBucket: { CURRENT: 50000, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 },
    byClient: [], byProject: [],
    // Tenant-scoped, like the real query (§113): B's A/R is B's own.
    invoices: tenantId === T ? engineInvoices : [],
    currency: 'INR', mixedCurrencies: false,
  }) as ReceivablesMetrics);
});

// ---------- session arrangement ----------

function arrange(role: 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'USER', tenantId = T, asWho: 'admin' | 'member' = 'admin'): void {
  const base = asWho === 'member' ? AGENCY_A.member : AGENCY_A.admin;
  const session: TokenPayload = {
    userId: base.userId, username: base.username, role, tenantId,
  };
  const tenant: Tenant = {
    id: tenantId, name: `Tenant ${tenantId}`, status: 'ACTIVE', plan: 'FREE',
    settings: {}, limits: { maxUsers: 5 }, appMode: 'Agency',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
  mockSession.mockResolvedValue(session);
  mockGetTenant.mockResolvedValue(tenant);
  mockGetUserById.mockImplementation(async (id: string) =>
    id === AGENCY_A.admin.userId || id === AGENCY_A.member.userId
      ? ({ id, username: 'seeded', passwordHash: 'x', role, tenantId, createdAt: new Date('2026-01-01T00:00:00Z') } as unknown as User)
      : null);
}

function requestFor(url: string, init?: ConstructorParameters<typeof NextRequest>[1]): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3100'), init);
}

function patchRequest(id: string, body: unknown): [NextRequest, { params: Promise<{ id: string }> }] {
  return [
    requestFor(`/api/agency/alert-rules/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }),
    { params: Promise.resolve({ id }) },
  ];
}

function idRequest(id: string, action: 'acknowledge' | 'resolve'): [NextRequest, { params: Promise<{ id: string }> }] {
  return [
    requestFor(`/api/agency/alerts/${id}/${action}`, { method: 'POST' }),
    { params: Promise.resolve({ id }) },
  ];
}

/** Every stored record for tenant A, straight from the mirror (assertions). */
function storedAlerts(): AgencyAlertRecord[] {
  return mirror(T).alerts;
}

// ---------- §21: the summary evaluates (and is idempotent) ----------

describe('§21 — GET /api/agency/alerts/summary: evaluate then report', () => {
  it('evaluates the loud engine into stored alerts and reports the counts', async () => {
    arrange('TENANT_ADMIN');
    const res = await summaryRoute();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // 82% hours (HOURS_80), over-budget, margin CRITICAL, unbilled time,
    // unbilled expense, due-soon invoice = 6 alerts.
    expect(body.counts.open).toBe(6);
    expect(body.counts.acknowledged).toBe(0);
    expect(body.counts.resolved).toBe(0);
    expect(body.counts.openBySeverity.CRITICAL).toBe(2); // over-budget + margin
    expect(body.top.length).toBeLessThanOrEqual(5);
    expect(storedAlerts()).toHaveLength(6);
  });

  it('re-evaluating is IDEMPOTENT — updates, never duplicate fingerprints', async () => {
    arrange('TENANT_ADMIN');
    await summaryRoute();
    const first = storedAlerts().length;
    const res = await summaryRoute();
    expect(res.status).toBe(200);
    expect(storedAlerts()).toHaveLength(first);
    const fingerprints = storedAlerts().map(a => a.fingerprint);
    expect(new Set(fingerprints).size).toBe(fingerprints.length);
  });

  it('lazily seeds the 11-rule catalog on first evaluation', async () => {
    arrange('TENANT_ADMIN');
    await summaryRoute();
    expect(mirror(T).rules).toHaveLength(11);
  });

  it('a USER may trigger evaluation too (dashboard.read); top rows are §114-filtered', async () => {
    arrange('USER', T, 'member');
    const res = await summaryRoute();
    expect(res.status).toBe(200);
    const body = await res.json();
    // COUNTS include the cost-bearing alerts (2)…
    expect(body.counts.open).toBe(6);
    // …but the top rows never do (§114).
    expect(body.top.every((a: AgencyAlertRecord) =>
      a.ruleType !== 'PROJECT_OVER_BUDGET' && a.ruleType !== 'PROJECT_MARGIN_BELOW_TARGET')).toBe(true);
  });
});

// ---------- §22: the list route (read-only, filters, §114) ----------

describe('§22 — GET /api/agency/alerts: the read-only list', () => {
  beforeEach(async () => {
    arrange('TENANT_ADMIN');
    await summaryRoute();
  });

  it('an admin sees every row including the cost-bearing ones', async () => {
    const res = await listRoute(requestFor('/api/agency/alerts'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(6);
    const types = (body.alerts as Array<{ ruleType: string }>).map(a => a.ruleType);
    expect(types).toContain('PROJECT_OVER_BUDGET');
    expect(types).toContain('PROJECT_MARGIN_BELOW_TARGET');
    // View metadata rides every row (§23 — no client-side rule metadata).
    expect(body.alerts[0].category).toBeDefined();
    expect(body.alerts[0].ruleLabel).toBeDefined();
  });

  it('§114 — a USER sees the same alerts MINUS the cost-bearing rows', async () => {
    arrange('USER', T, 'member');
    const res = await listRoute(requestFor('/api/agency/alerts'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(4);
    expect((body.alerts as Array<{ ruleType: string }>).map(a => a.ruleType)).not.toContain('PROJECT_OVER_BUDGET');
  });

  it('an invalid filter value is a 400, never a silent ignore', async () => {
    expect((await listRoute(requestFor('/api/agency/alerts?status=OPNE'))).status).toBe(400);
    expect((await listRoute(requestFor('/api/agency/alerts?severity=URGENT'))).status).toBe(400);
    expect((await listRoute(requestFor('/api/agency/alerts?ruleType=NOPE'))).status).toBe(400);
    expect((await listRoute(requestFor('/api/agency/alerts?category=HOME'))).status).toBe(400);
    expect((await listRoute(requestFor('/api/agency/alerts?limit=0'))).status).toBe(400);
  });

  it('category=CASH selects exactly the three cash rule types', async () => {
    const res = await listRoute(requestFor('/api/agency/alerts?category=CASH'));
    const body = await res.json();
    expect(body.count).toBe(1);
    expect((body.alerts as Array<{ ruleType: string }>)[0].ruleType).toBe('INVOICE_DUE_SOON');
  });

  it('status=RESOLVED returns only resolved rows (initially none)', async () => {
    const res = await listRoute(requestFor('/api/agency/alerts?status=RESOLVED'));
    const body = await res.json();
    expect(body.count).toBe(0);
    expect(body.alerts).toEqual([]);
  });
});

// ---------- §21: the explicit admin evaluate endpoint ----------

describe('§21 — POST /api/agency/alerts/evaluate', () => {
  it('a USER is 403 (agency.alerts.manage is admin-only)', async () => {
    arrange('USER', T, 'member');
    expect((await evaluateRoute()).status).toBe(403);
  });

  it('an admin evaluates and gets the pass report; a re-run creates nothing', async () => {
    arrange('TENANT_ADMIN');
    const first = await evaluateRoute();
    expect(first.status).toBe(200);
    expect((await first.json()).result).toMatchObject({ created: 6, updated: 0, reopened: 0, autoResolved: 0, totalActive: 6 });

    const second = await evaluateRoute();
    const report = (await second.json()).result;
    expect(report.created).toBe(0);
    expect(report.updated).toBe(6); // continuing conditions refresh, never re-notify
    expect(report.totalActive).toBe(6);
  });

  it('AUTO_RESOLVE: a quieted engine resolves every open alert with NO actor', async () => {
    arrange('TENANT_ADMIN');
    await evaluateRoute();
    quietEngine();
    const res = await evaluateRoute();
    const report = (await res.json()).result;
    expect(report.autoResolved).toBe(6);
    expect(report.totalActive).toBe(0);
    for (const record of storedAlerts()) {
      expect(record.status).toBe('RESOLVED');
      expect(record.resolvedBy).toBeUndefined(); // §19 — the system closes, no actor
      expect(record.resolvedAt).toBeDefined();
    }
  });

  it('REOPEN: a returned condition starts a NEW OPEN cycle (lifecycle cleared)', async () => {
    arrange('TENANT_ADMIN');
    await evaluateRoute();
    quietEngine();
    await evaluateRoute();
    // A human resolved one manually in between cycles.
    const target = storedAlerts()[0];
    await mockUpdateAgencyAlert(target.id, T, { status: 'RESOLVED', resolvedBy: 'admin', resolvedAt: new Date() });

    loudEngine();
    const res = await evaluateRoute();
    const report = (await res.json()).result;
    expect(report.reopened).toBe(6);
    for (const record of storedAlerts()) {
      expect(record.status).toBe('OPEN');
      expect(record.acknowledgedBy).toBeUndefined();
      expect(record.resolvedBy).toBeUndefined();
    }
  });
});

// ---------- §19: acknowledge / resolve lifecycle ----------

describe('§19 — POST /api/agency/alerts/:id/acknowledge + resolve', () => {
  beforeEach(async () => {
    arrange('TENANT_ADMIN');
    await summaryRoute();
  });

  it('acknowledges an OPEN alert, audits it, and stores the actor', async () => {
    const target = storedAlerts()[0];
    const [req, ctx] = idRequest(target.id, 'acknowledge');
    const res = await acknowledgeRoute(req, ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).alert.status).toBe('ACKNOWLEDGED');
    expect(target.status).toBe('ACKNOWLEDGED');
    expect(target.acknowledgedBy).toBe(AGENCY_A.admin.username);
    expect(mockCreateLog).toHaveBeenCalledWith(
      AGENCY_A.admin.username, 'ALERT_ACKNOWLEDGED', expect.stringContaining(target.id),
      T, expect.anything()
    );
  });

  it('a USER cannot acknowledge (agency.alerts.manage)', async () => {
    arrange('USER', T, 'member');
    const target = storedAlerts()[0];
    const [req, ctx] = idRequest(target.id, 'acknowledge');
    expect((await acknowledgeRoute(req, ctx)).status).toBe(403);
    expect(target.status).toBe('OPEN');
  });

  it('a RESOLVED alert cannot be acknowledged (409)', async () => {
    const target = storedAlerts()[0];
    await mockUpdateAgencyAlert(target.id, T, { status: 'RESOLVED', resolvedAt: new Date(), resolvedBy: 'admin' });
    const [req, ctx] = idRequest(target.id, 'acknowledge');
    expect((await acknowledgeRoute(req, ctx)).status).toBe(409);
  });

  it('OPEN → RESOLVED directly is legal; RESOLVED → RESOLVED again is 409', async () => {
    const target = storedAlerts()[0];
    const [req, ctx] = idRequest(target.id, 'resolve');
    expect((await resolveRoute(req, ctx)).status).toBe(200);
    expect(target.status).toBe('RESOLVED');
    expect(target.resolvedBy).toBe(AGENCY_A.admin.username);
    const again = await resolveRoute(...idRequest(target.id, 'resolve'));
    expect(again.status).toBe(409);
  });

  it('§113 — another tenant\'s alert id and a missing id are IDENTICAL 404s', async () => {
    const target = storedAlerts()[0];
    arrange('TENANT_ADMIN', AGENCY_B.tenant.id);
    // Tenant B's mirror is empty — the cross-tenant probe misses.
    const [req, ctx] = idRequest(target.id, 'acknowledge');
    const cross = await acknowledgeRoute(req, ctx);
    expect(cross.status).toBe(404);
    const [req2, ctx2] = idRequest('does-not-exist', 'resolve');
    expect((await resolveRoute(req2, ctx2)).status).toBe(404);
  });
});

// ---------- §24: rule administration ----------

describe('§24 — GET/PATCH /api/agency/alert-rules', () => {
  beforeEach(async () => {
    arrange('TENANT_ADMIN');
    await summaryRoute(); // seeds the catalog
  });

  it('GET lists all 11 rules with catalog metadata', async () => {
    const res = await rulesRoute();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rules).toHaveLength(11);
    const over = (body.rules as Array<{ type: string; costBearing: boolean }>).find(r => r.type === 'PROJECT_OVER_BUDGET');
    expect(over?.costBearing).toBe(true);
  });

  it('GET is shared context — a USER may read the rules', async () => {
    arrange('USER', T, 'member');
    expect((await rulesRoute()).status).toBe(200);
  });

  it('PATCH disables a rule — and disable means silence: the next evaluation auto-resolves its alerts', async () => {
    const rules = mirror(T).rules;
    const hours80 = rules.find(r => r.type === 'PROJECT_HOURS_80')!;
    const [req, ctx] = patchRequest(hours80.id, { enabled: false });
    const res = await rulePatchRoute(req, ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).rule.enabled).toBe(false);
    expect(mockCreateLog).toHaveBeenCalledWith(
      AGENCY_A.admin.username, 'ALERT_RULE_UPDATED', expect.stringContaining(hours80.id), T, expect.anything()
    );

    const evalRes = await evaluateRoute();
    const report = (await evalRes.json()).result;
    expect(report.autoResolved).toBe(1); // the silenced HOURS_80 alert
    expect(storedAlerts().find(a => a.ruleType === 'PROJECT_HOURS_80')?.status).toBe('RESOLVED');
  });

  it('PATCH tunes a threshold configuration (widening the due-soon window)', async () => {
    const dueSoon = mirror(T).rules.find(r => r.type === 'INVOICE_DUE_SOON')!;
    const [req, ctx] = patchRequest(dueSoon.id, { configuration: { days: 10 } });
    expect((await rulePatchRoute(req, ctx)).status).toBe(200);
    expect(mirror(T).rules.find(r => r.id === dueSoon.id)!.configuration.days).toBe(10);
  });

  it('PATCH rejects an unknown configuration key (400)', async () => {
    const dueSoon = mirror(T).rules.find(r => r.type === 'INVOICE_DUE_SOON')!;
    const [req, ctx] = patchRequest(dueSoon.id, { configuration: { day: 7 } });
    expect((await rulePatchRoute(req, ctx)).status).toBe(400);
  });

  it('PATCH on an unknown rule id is a 404', async () => {
    const [req, ctx] = patchRequest('rule-nope', { enabled: true });
    expect((await rulePatchRoute(req, ctx)).status).toBe(404);
  });

  it('a USER cannot PATCH (agency.alerts.manage)', async () => {
    arrange('USER', T, 'member');
    const dueSoon = mirror(T).rules.find(r => r.type === 'INVOICE_DUE_SOON')!;
    const [req, ctx] = patchRequest(dueSoon.id, { enabled: false });
    expect((await rulePatchRoute(req, ctx)).status).toBe(403);
  });
});

// ---------- §113: tenant isolation through the evaluator ----------

describe('§113 — tenant isolation', () => {
  it('tenant B\'s evaluation sees NONE of tenant A\'s data (projects scope the join)', async () => {
    arrange('TENANT_ADMIN');
    await summaryRoute(); // A has 6 alerts
    expect(storedAlerts()).toHaveLength(6);

    arrange('TENANT_ADMIN', AGENCY_B.tenant.id);
    const res = await summaryRoute();
    expect(res.status).toBe(200);
    const body = await res.json();
    // B's project list is empty → every A engine row is a ghost → silence.
    expect(body.counts.open).toBe(0);
    expect(mirror(AGENCY_B.tenant.id).alerts).toHaveLength(0);
    expect(mirror(T).alerts).toHaveLength(6); // A untouched
  });
});
