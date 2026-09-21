/**
 * Modules 11–14 combined (§114) — Integration: profitability permission gating.
 *
 * Runs the REAL route handlers (portfolio + per-project profitability, and
 * the Command Center aggregate) with only the session/tenant edges and the
 * store mocked. Pins the §114 privacy class:
 *   - agency.profitability.read is admin/finance only (SUPER_ADMIN /
 *     TENANT_ADMIN): labor cost is salary economics (§63), the same privacy
 *     class as agency.rates.cost.read
 *   - a USER is 403 on BOTH profitability routes — at the gate, before any
 *     query or audit fires
 *   - the dashboard itself stays shared context (§28): a USER gets a 200
 *     with the profitability lines in their HONEST pending state, never
 *     the cost ledger; an admin gets the engine numbers
 *   - §113: another tenant's project is an identical 404
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TokenPayload } from '@/lib/auth';
import type { Tenant, User } from '@/lib/db';
import type { Project } from '@/lib/agency/types/project';
import { AGENCY_A, AGENCY_B } from '../fixtures/agency-fixtures';

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, getSessionUser: vi.fn() };
});

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...actual,
    getTenantById: vi.fn(),
    getUserById: vi.fn(),
    getClientById: vi.fn(),
    getProjectById: vi.fn(),
    getProjects: vi.fn(),
    createLog: vi.fn(),
    connectDb: vi.fn(),
    initLocalDb: vi.fn(),
    getLogs: vi.fn(),
  };
});

import { getSessionUser } from '@/lib/auth';
import { getTenantById, getUserById, getClientById, getProjectById, getProjects, createLog, connectDb, initLocalDb } from '@/lib/db';
import { GET as portfolioRoute } from '@/app/api/agency/profitability/route';
import { GET as projectRoute } from '@/app/api/agency/projects/[id]/profitability/route';
import { GET as dashboardRoute } from '@/app/api/agency/dashboard/route';
import { NextRequest } from 'next/server';

const mockSession = vi.mocked(getSessionUser);
const mockGetTenant = vi.mocked(getTenantById);
const mockGetUserById = vi.mocked(getUserById);
const mockGetClientById = vi.mocked(getClientById);
const mockGetProjectById = vi.mocked(getProjectById);
const mockGetProjects = vi.mocked(getProjects);
const mockCreateLog = vi.mocked(createLog);
const mockConnectDb = vi.mocked(connectDb);
const mockInitLocalDb = vi.mocked(initLocalDb);

const T: string = AGENCY_A.tenant.id;

/** An EMPTY local store (the LocalDbSchema shape, all collections present). */
function emptyStore(): Record<string, unknown[]> {
  return {
    tenants: [], users: [], accounts: [], transactions: [], categories: [], budgets: [],
    recurring: [], clients: [], logs: [], flags: [], tickets: [], broadcasts: [],
    subscribers: [], incidents: [], maintenances: [],
    projects: [], projectMembers: [], workItems: [], projectMilestones: [],
    rateCards: [], rateCardEntries: [], rateEntryVersions: [], userCostAssignments: [],
    timeEntries: [], timerSessions: [],
    expenses: [],
    invoices: [], invoiceLines: [], invoiceCounters: [],
    payments: [],
    taxProfiles: [], withholdingRules: [], invoiceSequences: [],
    paymentLinks: [], webhookEvents: [],
  };
}

function requestFor(url: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3100'));
}

/**
 * Arrange a session of the given role on tenant A (or another tenant).
 * `asWho` picks the seeded user (admin or member) so getUserById resolves.
 */
function arrange(role: 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'USER', tenantId = T, asWho?: 'admin' | 'member'): TokenPayload {
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
  return session;
}

/** Agency A's project, minimal but engine-readable. */
function projectFor(tenantId = T, id = AGENCY_A.project.id): Project {
  return {
    id, tenantId, clientId: AGENCY_A.client.id, name: 'Project A — Website Redesign',
    status: 'ACTIVE', billingModel: 'FIXED_FEE', currency: 'INR',
    contractValue: 500000, plannedHours: 400, targetMargin: 40,
    startDate: '2026-08-01',
    createdAt: new Date('2026-08-01'), updatedAt: new Date('2026-08-01'),
  } as unknown as Project;
}

beforeEach(() => {
  for (const m of [mockSession, mockGetTenant, mockGetUserById, mockGetClientById, mockGetProjectById, mockGetProjects, mockCreateLog, mockConnectDb, mockInitLocalDb]) m.mockReset();
  mockCreateLog.mockResolvedValue({} as Awaited<ReturnType<typeof createLog>>);
  // Force every query onto the local-JSON path — deterministic, no live Mongo.
  mockConnectDb.mockResolvedValue({ db: null } as Awaited<ReturnType<typeof connectDb>>);
  mockInitLocalDb.mockReturnValue(emptyStore() as unknown as ReturnType<typeof initLocalDb>);
  mockGetProjects.mockResolvedValue([] as Awaited<ReturnType<typeof getProjects>>);
  mockGetProjectById.mockResolvedValue(null);
  mockGetClientById.mockResolvedValue(null);
});

describe('§114 — GET /api/agency/profitability (portfolio) permission gate', () => {
  it('no session → 401', async () => {
    mockSession.mockResolvedValue(null);
    const res = await portfolioRoute(requestFor('/api/agency/profitability'));
    expect(res.status).toBe(401);
  });

  it('a USER (PM included) is 403 at the gate — before any query or audit', async () => {
    arrange('USER', T, 'member');
    const res = await portfolioRoute(requestFor('/api/agency/profitability'));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('You do not have permission to perform this action');
    // No report ran, so no read audit fired either.
    expect(mockCreateLog).not.toHaveBeenCalled();
  });

  it('a TENANT_ADMIN gets the report (200, empty portfolio is a valid position)', async () => {
    arrange('TENANT_ADMIN', T, 'admin');
    const res = await portfolioRoute(requestFor('/api/agency/profitability'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.portfolio.projects).toEqual([]);
  });

  it('a SUPER_ADMIN gets the report too (impersonation carries the target tenantId)', async () => {
    arrange('SUPER_ADMIN', T, 'admin');
    const res = await portfolioRoute(requestFor('/api/agency/profitability'));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });
});

describe('§114 — GET /api/agency/projects/:id/profitability permission gate', () => {
  it('no session → 401', async () => {
    mockSession.mockResolvedValue(null);
    const res = await projectRoute(requestFor(`/api/agency/projects/${AGENCY_A.project.id}/profitability`), {
      params: Promise.resolve({ id: AGENCY_A.project.id }),
    } as unknown as Parameters<typeof projectRoute>[1]);
    expect(res.status).toBe(401);
  });

  it('a USER is 403 even for a project they are a member of (§78 labor cost is salary data)', async () => {
    arrange('USER', T, 'member');
    const res = await projectRoute(requestFor(`/api/agency/projects/${AGENCY_A.project.id}/profitability`), {
      params: Promise.resolve({ id: AGENCY_A.project.id }),
    } as unknown as Parameters<typeof projectRoute>[1]);
    expect(res.status).toBe(403);
    expect(mockCreateLog).not.toHaveBeenCalled();
  });

  it('a TENANT_ADMIN gets the project report (200)', async () => {
    arrange('TENANT_ADMIN', T, 'admin');
    mockGetProjectById.mockResolvedValue(projectFor());
    const res = await projectRoute(requestFor(`/api/agency/projects/${AGENCY_A.project.id}/profitability`), {
      params: Promise.resolve({ id: AGENCY_A.project.id }),
    } as unknown as Parameters<typeof projectRoute>[1]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.project.id).toBe(AGENCY_A.project.id);
  });

  it('§113 — another tenant\'s project is an identical 404 for admins', async () => {
    arrange('TENANT_ADMIN', AGENCY_B.tenant.id, 'admin');
    // The real repository tenant-scopes: tenant B's lookup never sees A's project.
    mockGetProjectById.mockImplementation(async (_id: string, tenantId?: string) =>
      tenantId === T ? projectFor() : null);
    const res = await projectRoute(requestFor(`/api/agency/projects/${AGENCY_A.project.id}/profitability`), {
      params: Promise.resolve({ id: AGENCY_A.project.id }),
    } as unknown as Parameters<typeof projectRoute>[1]);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Project not found');
  });
});

describe('§114 — GET /api/agency/dashboard: the profitability source is permission-conditional', () => {
  it('a USER gets a 200 (shared context, §28) with profitability honestly PENDING — never the cost ledger', async () => {
    arrange('USER', T, 'member');
    const res = await dashboardRoute(requestFor('/api/agency/dashboard?period=THIS_MONTH'));
    expect(res.status).toBe(200);
    const d = (await res.json()).data;
    expect(d.profitability.deliveryCost).toEqual({ kind: 'money', value: 0, sourceReady: false });
    expect(d.profitability.grossProfit).toEqual({ kind: 'money', value: 0, sourceReady: false });
    expect(d.profitability.grossMargin.sourceReady).toBe(false);
  });

  it('a TENANT_ADMIN gets the engine numbers: an empty portfolio is LIVE zero profit (§82: no baseline → null margin)', async () => {
    arrange('TENANT_ADMIN', T, 'admin');
    const res = await dashboardRoute(requestFor('/api/agency/dashboard?period=THIS_MONTH'));
    expect(res.status).toBe(200);
    const d = (await res.json()).data;
    expect(d.profitability.deliveryCost.sourceReady).toBe(true);
    expect(d.profitability.deliveryCost.value).toBe(0);
    expect(d.profitability.grossProfit.sourceReady).toBe(true);
    expect(d.profitability.grossProfit.value).toBe(0);
    expect(d.profitability.grossMargin).toEqual({ kind: 'percentage', value: null, sourceReady: true });
  });
});
