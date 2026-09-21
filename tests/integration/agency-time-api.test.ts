/**
 * Module 7 (Sprint 7E / §30/§33/§34) — Integration: Agency Time API.
 *
 * Runs the REAL route handlers with only the session/tenant/repository and
 * rate-resolution edges mocked — the full pipeline executes between them:
 *   authenticate → resolve tenant → verify Agency capability → authorize
 *   (§4: time.write is a base capability of every agency member; §98-style
 *   approve tier) → validate → operate → audit → respond.
 *
 * Matrix:
 *   Integration — create (§5/§6/§15/§17), list + labels, detail, the §28
 *                 edit lifecycle, submit/approve/reject state machine
 *                 (§19–§21), §23 economics at approval, §24 last-chance
 *                 snapshot fill, timer start/stop/discard (§8–§13)
 *   Security    — §33 owner-or-admin scoping, §99 cost redaction for USER
 *                 consumers, §113 cross-tenant probes (404 identical to
 *                 missing), §21 self-approval/self-rejection blocks,
 *                 non-PM USER cannot approve, Standard tenant 403
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TokenPayload } from '@/lib/auth';
import type { Tenant, User, TimeEntryCreateInput } from '@/lib/db';
import type { Project, ProjectMember, WorkItem } from '@/lib/agency/types/project';
import type { TimeEntry, TimerSession, RateSnapshot } from '@/lib/agency/types/time';
import type { ResolvedRate } from '@/lib/agency/types/rate';
import { rateNotConfigured } from '@/lib/agency/types/rate';
import { todayInTimezone, DEFAULT_TENANT_TIMEZONE } from '@/lib/agency/types/dates';
import { AGENCY_A, AGENCY_B, STANDARD_TENANT } from '../fixtures/agency-fixtures';

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
    getProjectById: vi.fn(),
    getProjectMembers: vi.fn(),
    getWorkItemById: vi.fn(),
    getTimeEntries: vi.fn(),
    getTimeEntryById: vi.fn(),
    createTimeEntry: vi.fn(),
    updateTimeEntry: vi.fn(),
    getActiveTimerSession: vi.fn(),
    createTimerSession: vi.fn(),
    updateTimerSession: vi.fn(),
    createLog: vi.fn(),
    // imported by agency.clients (AuditContext/DomainResult home) — same module
    getLogs: vi.fn(), createClient: vi.fn(), getClients: vi.fn(),
    updateClient: vi.fn(), searchClients: vi.fn(), findClientByName: vi.fn(),
    // imported by rate-resolution (mocked below, but the factory must exist)
    getRateCards: vi.fn(), getRateCardById: vi.fn(), getRateCardEntryById: vi.fn(),
    listRateCardEntries: vi.fn(), listRateEntryVersions: vi.fn(),
    getUserCostAssignments: vi.fn(),
  };
});

vi.mock('@/lib/agency/domain/rate-resolution', () => ({
  resolveCostRate: vi.fn(),
  resolveBillingRate: vi.fn(),
}));

import { getSessionUser } from '@/lib/auth';
import {
  getTenantById, getUserById, getProjectById, getProjectMembers, getWorkItemById,
  getTimeEntries, getTimeEntryById, createTimeEntry as createTimeEntryRepo,
  updateTimeEntry as updateTimeEntryRepo, getActiveTimerSession,
  createTimerSession, updateTimerSession, createLog,
} from '@/lib/db';
import { resolveCostRate, resolveBillingRate } from '@/lib/agency/domain/rate-resolution';
import { GET as listEntries, POST as createEntryRoute } from '@/app/api/agency/time/route';
import { GET as getEntry, PATCH as patchEntry } from '@/app/api/agency/time/[id]/route';
import { POST as submitEntry } from '@/app/api/agency/time/[id]/submit/route';
import { POST as approveEntry } from '@/app/api/agency/time/[id]/approve/route';
import { POST as rejectEntry } from '@/app/api/agency/time/[id]/reject/route';
import { GET as approvalQueue } from '@/app/api/agency/time/approvals/route';
import { POST as startTimerRoute } from '@/app/api/agency/timer/start/route';
import { POST as stopTimerRoute } from '@/app/api/agency/timer/stop/route';
import { POST as discardTimerRoute } from '@/app/api/agency/timer/discard/route';
import { NextRequest } from 'next/server';

const mockSession = vi.mocked(getSessionUser);
const mockGetTenant = vi.mocked(getTenantById);
const mockGetUserById = vi.mocked(getUserById);
const mockGetProjectById = vi.mocked(getProjectById);
const mockGetProjectMembers = vi.mocked(getProjectMembers);
const mockGetWorkItemById = vi.mocked(getWorkItemById);
const mockGetTimeEntries = vi.mocked(getTimeEntries);
const mockGetTimeEntryById = vi.mocked(getTimeEntryById);
const mockCreateTimeEntryRepo = vi.mocked(createTimeEntryRepo);
const mockUpdateTimeEntryRepo = vi.mocked(updateTimeEntryRepo);
const mockGetActiveTimer = vi.mocked(getActiveTimerSession);
const mockCreateTimerSession = vi.mocked(createTimerSession);
const mockUpdateTimerSession = vi.mocked(updateTimerSession);
const mockCreateLog = vi.mocked(createLog);
const mockResolveCost = vi.mocked(resolveCostRate);
const mockResolveBilling = vi.mocked(resolveBillingRate);

// ---------- helpers ----------

function requestFor(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3100'), init as ConstructorParameters<typeof NextRequest>[1]);
}

function jsonRequest(url: string, method: string, body: unknown): NextRequest {
  return requestFor(url, { method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
}

function ctxFor(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

const T: string = AGENCY_A.tenant.id;
const ADMIN = AGENCY_A.admin;     // TENANT_ADMIN — the entry AUTHOR in most flows
const MEMBER = AGENCY_A.member;   // USER — the project's MANAGER (§21 approver tier)

function userFor(userId: string, tenantId = T): User {
  return {
    id: userId, username: userId === ADMIN.userId ? 'a_admin' : 'a_dev',
    passwordHash: 'x', role: userId === ADMIN.userId ? 'TENANT_ADMIN' : 'USER',
    tenantId, createdAt: new Date('2026-01-01T00:00:00Z'),
  } as unknown as User;
}

/** The project — its manager is MEMBER, so MEMBER can approve ADMIN's time. */
function projectFor(overrides: Partial<Project> = {}): Project {
  return {
    id: AGENCY_A.project.id, tenantId: T, clientId: AGENCY_A.client.id,
    name: 'Project A', status: 'ACTIVE', billingModel: 'TIME_AND_MATERIALS',
    currency: 'INR', projectManagerId: MEMBER.userId,
    createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as unknown as Project;
}

function memberRow(): ProjectMember {
  return { id: 'pm-1', tenantId: T, projectId: AGENCY_A.project.id, userId: ADMIN.userId, role: 'Developer', active: true } as unknown as ProjectMember;
}

function entryFor(overrides: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id: 'entry-1', tenantId: T, projectId: AGENCY_A.project.id,
    userId: ADMIN.userId, date: '2026-09-01', durationMinutes: 90,
    billable: true, approvalStatus: 'DRAFT', billingStatus: 'UNBILLED',
    financialStatus: 'RATE_CONFIGURATION_REQUIRED',
    createdAt: new Date('2026-09-01T10:00:00Z'), updatedAt: new Date('2026-09-01T10:00:00Z'),
    ...overrides,
  };
}

const COST_SNAPSHOT: RateSnapshot = { amount: 900, currency: 'INR', unit: 'HOUR', source: 'USER_COST_ASSIGNMENT', rateCardId: 'card-cost', rateCardEntryId: 'entry-cost', effectiveFrom: '2026-01-01' };
const BILLING_SNAPSHOT: RateSnapshot = { amount: 2500, currency: 'INR', unit: 'HOUR', source: 'CLIENT_RATE_CARD', rateCardId: 'card-bill', rateCardEntryId: 'entry-bill', effectiveFrom: '2026-01-01' };

function resolvedCost(amount = 900): ResolvedRate {
  return { status: 'RESOLVED', amount, currency: 'INR', rateCardId: 'card-cost', rateEntryId: 'entry-cost', effectiveFrom: '2026-01-01', unit: 'HOUR', source: 'USER_ASSIGNMENT' };
}
function resolvedBilling(amount = 2500): ResolvedRate {
  return { status: 'RESOLVED', amount, currency: 'INR', rateCardId: 'card-bill', rateEntryId: 'entry-bill', effectiveFrom: '2026-01-01', unit: 'HOUR', source: 'CLIENT_RATE_CARD' };
}

/** Stand up the session + tenant chain for one tenant. */
function arrange(
  tenantId: string,
  appMode: Tenant['appMode'] = 'Agency',
  role: TokenPayload['role'] = 'TENANT_ADMIN',
  userId?: string
) {
  const session: TokenPayload = {
    userId: userId ?? ADMIN.userId, username: role === 'USER' ? 'a_dev' : 'a_admin', role, tenantId,
  };
  const tenant: Tenant = {
    id: tenantId, name: `Tenant ${tenantId}`, status: 'ACTIVE', plan: 'FREE',
    settings: {}, limits: { maxUsers: 5 }, appMode,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
  mockSession.mockResolvedValue(session);
  mockGetTenant.mockResolvedValue(tenant);
  mockGetUserById.mockImplementation(async (id: string) =>
    id.startsWith('a') ? userFor(id, tenantId) : null);
  return session;
}

/** Realistic in-memory entry store: reads see writes, updates apply. */
let entryStore: Record<string, TimeEntry>;
function seedEntry(entry: TimeEntry): TimeEntry {
  entryStore[entry.id] = entry;
  return entry;
}

beforeEach(() => {
  for (const m of [
    mockSession, mockGetTenant, mockGetUserById, mockGetProjectById, mockGetProjectMembers,
    mockGetWorkItemById, mockGetTimeEntries, mockGetTimeEntryById, mockCreateTimeEntryRepo,
    mockUpdateTimeEntryRepo, mockGetActiveTimer, mockCreateTimerSession, mockUpdateTimerSession,
    mockCreateLog, mockResolveCost, mockResolveBilling,
  ]) m.mockReset();

  entryStore = {};
  mockCreateLog.mockResolvedValue({} as Awaited<ReturnType<typeof createLog>>);
  mockGetProjectById.mockImplementation(async (id: string) =>
    id === AGENCY_A.project.id ? projectFor() : null);
  mockGetProjectMembers.mockResolvedValue([memberRow()]);
  mockGetWorkItemById.mockResolvedValue(null);
  mockResolveCost.mockResolvedValue(rateNotConfigured());
  mockResolveBilling.mockResolvedValue(rateNotConfigured());
  mockGetTimeEntryById.mockImplementation(async (id: string) => entryStore[id] ?? null);
  mockUpdateTimeEntryRepo.mockImplementation(async (id: string, _tenantId: string, updates: Record<string, unknown>) => {
    const e = entryStore[id];
    if (!e) return false;
    for (const [k, v] of Object.entries(updates)) {
      if (v !== undefined) (e as unknown as Record<string, unknown>)[k] = v === null ? undefined : v;
    }
    return true;
  });
  mockCreateTimeEntryRepo.mockImplementation(async (tenantId: string, input: TimeEntryCreateInput) =>
    entryFor({ id: `entry-${Object.keys(entryStore).length + 1}`, tenantId, ...input } as Partial<TimeEntry>));
});

// ---------- create (§5/§6/§15/§17/§24) ----------

describe('Module 7E — create time entry (POST /api/agency/time)', () => {
  it('creates a DRAFT entry and audits TIME_ENTRY_CREATED', async () => {
    arrange(T);
    const res = await createEntryRoute(jsonRequest('/api/agency/time', 'POST', {
      projectId: AGENCY_A.project.id, date: '2026-09-01', durationMinutes: 90, billable: true,
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.timeEntry.approvalStatus).toBe('DRAFT');
    expect(body.timeEntry.billingStatus).toBe('UNBILLED');
    expect(mockCreateLog).toHaveBeenCalledWith(
      expect.anything(), 'TIME_ENTRY_CREATED', expect.anything(), T, expect.anything()
    );
  });

  it('§24 — missing rates never block tracking: RATE_CONFIGURATION_REQUIRED, no snapshots', async () => {
    arrange(T);
    const res = await createEntryRoute(jsonRequest('/api/agency/time', 'POST', {
      projectId: AGENCY_A.project.id, date: '2026-09-01', durationMinutes: 60, billable: true,
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.timeEntry.financialStatus).toBe('RATE_CONFIGURATION_REQUIRED');
    expect(body.timeEntry.costRateSnapshot).toBeUndefined();
    expect(body.timeEntry.billingRateSnapshot).toBeUndefined();
    expect(body.timeEntry.calculatedCost).toBeUndefined();
  });

  it('§6 — resolved rates freeze onto the entry at creation', async () => {
    arrange(T);
    mockResolveCost.mockResolvedValue(resolvedCost(900));
    mockResolveBilling.mockResolvedValue(resolvedBilling(2500));
    const res = await createEntryRoute(jsonRequest('/api/agency/time', 'POST', {
      projectId: AGENCY_A.project.id, date: '2026-09-01', durationMinutes: 120, billable: true,
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.timeEntry.costRateSnapshot).toEqual(COST_SNAPSHOT);
    expect(body.timeEntry.billingRateSnapshot).toEqual(BILLING_SNAPSHOT);
    expect(body.timeEntry.financialStatus).toBe('READY');
    // §23 — nothing is calculated before approval.
    expect(body.timeEntry.calculatedCost).toBeUndefined();
  });

  it('§4 — a USER may log time (base capability)', async () => {
    arrange(T, 'Agency', 'USER', MEMBER.userId);
    const res = await createEntryRoute(jsonRequest('/api/agency/time', 'POST', {
      projectId: AGENCY_A.project.id, date: '2026-09-01', durationMinutes: 30, billable: false,
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.timeEntry.userId).toBe(MEMBER.userId);
  });

  it('rejects a future date (§15)', async () => {
    arrange(T);
    const res = await createEntryRoute(jsonRequest('/api/agency/time', 'POST', {
      projectId: AGENCY_A.project.id, date: '2030-01-01', durationMinutes: 60, billable: true,
    }));
    expect(res.status).toBe(400);
  });

  it('rejects a work item that is not on the project (§32)', async () => {
    arrange(T);
    mockGetWorkItemById.mockResolvedValue(null);
    const res = await createEntryRoute(jsonRequest('/api/agency/time', 'POST', {
      projectId: AGENCY_A.project.id, workItemId: 'wi-elsewhere', date: '2026-09-01',
      durationMinutes: 60, billable: true,
    }));
    expect(res.status).toBe(400);
  });

  it('§113 — a cross-tenant project is the identical 404 as a missing one', async () => {
    arrange(T);
    // B's project and a nonexistent project both read null through the
    // tenant-scoped lookup — never an existence leak.
    const foreign = await createEntryRoute(jsonRequest('/api/agency/time', 'POST', {
      projectId: AGENCY_B.project.id, date: '2026-09-01', durationMinutes: 60, billable: true,
    }));
    expect(foreign.status).toBe(404);
    expect(await foreign.json()).toEqual({ error: 'Project not found' });
    const missing = await createEntryRoute(jsonRequest('/api/agency/time', 'POST', {
      projectId: 'nope', date: '2026-09-01', durationMinutes: 60, billable: true,
    }));
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'Project not found' });
  });

  it('a Standard tenant gets 403 — time is an Agency capability', async () => {
    arrange(STANDARD_TENANT.tenant.id, 'Standard');
    const res = await createEntryRoute(jsonRequest('/api/agency/time', 'POST', {
      projectId: AGENCY_A.project.id, date: '2026-09-01', durationMinutes: 60, billable: true,
    }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('NOT_AGENCY_TENANT');
  });
});

// ---------- list + detail (§25/§33/§99) ----------

describe('Module 7E — list + detail (§25/§33/§99/§113)', () => {
  it('§33/§99 — a USER lists their own entries with the cost side redacted', async () => {
    arrange(T, 'Agency', 'USER', MEMBER.userId);
    mockGetTimeEntries.mockResolvedValue([
      entryFor({ userId: MEMBER.userId, costRateSnapshot: COST_SNAPSHOT, billingRateSnapshot: BILLING_SNAPSHOT, calculatedCost: { amount: 900, currency: 'INR' } }),
    ]);
    const res = await listEntries(requestFor('/api/agency/time'));
    expect(res.status).toBe(200);
    // The domain forced the USER scope onto the repository call.
    expect(mockGetTimeEntries).toHaveBeenCalledWith(T, expect.objectContaining({ userId: MEMBER.userId }));
    const body = await res.json();
    expect(body.timeEntries).toHaveLength(1);
    expect(body.timeEntries[0].costRateSnapshot).toBeUndefined();
    expect(body.timeEntries[0].calculatedCost).toBeUndefined();
    expect(body.timeEntries[0].billingRateSnapshot).toBeDefined();
  });

  it('admins list with full economics and resolved labels', async () => {
    arrange(T);
    mockGetTimeEntries.mockResolvedValue([entryFor({ costRateSnapshot: COST_SNAPSHOT })]);
    const res = await listEntries(requestFor('/api/agency/time'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.timeEntries[0].costRateSnapshot).toBeDefined();
    expect(body.userLabels[ADMIN.userId]).toBeDefined();
    expect(body.projectNames[AGENCY_A.project.id]).toBe('Project A');
  });

  it('§99 — owner USER reads their own entry redacted; admin reads it full', async () => {
    seedEntry(entryFor({ userId: MEMBER.userId, costRateSnapshot: COST_SNAPSHOT }));
    arrange(T, 'Agency', 'USER', MEMBER.userId);
    const own = await getEntry(requestFor('/api/agency/time/entry-1'), ctxFor('entry-1'));
    expect(own.status).toBe(200);
    const ownBody = await own.json();
    expect(ownBody.timeEntry.costRateSnapshot).toBeUndefined();

    arrange(T);
    const admin = await getEntry(requestFor('/api/agency/time/entry-1'), ctxFor('entry-1'));
    expect(admin.status).toBe(200);
    expect((await admin.json()).timeEntry.costRateSnapshot).toEqual(COST_SNAPSHOT);
  });

  it('§33 — another USER cannot read someone else\'s entry', async () => {
    seedEntry(entryFor({ userId: ADMIN.userId }));
    arrange(T, 'Agency', 'USER', MEMBER.userId);
    const res = await getEntry(requestFor('/api/agency/time/entry-1'), ctxFor('entry-1'));
    expect(res.status).toBe(403);
  });

  it('§113 — a cross-tenant entry id is the identical 404 as a missing one', async () => {
    arrange(AGENCY_B.tenant.id);
    const foreign = await getEntry(requestFor('/api/agency/time/entry-1'), ctxFor('entry-1'));
    expect(foreign.status).toBe(404);
    expect(await foreign.json()).toEqual({ error: 'Time entry not found' });
  });
});

// ---------- edit lifecycle (§28) ----------

describe('Module 7E — edit lifecycle (PATCH /api/agency/time/:id)', () => {
  it('the owner edits a DRAFT entry (§28 full edit)', async () => {
    seedEntry(entryFor());
    arrange(T);
    const res = await patchEntry(jsonRequest('/api/agency/time/entry-1', 'PATCH', { durationMinutes: 120 }), ctxFor('entry-1'));
    expect(res.status).toBe(200);
    expect((await res.json()).timeEntry.durationMinutes).toBe(120);
    expect(mockCreateLog).toHaveBeenCalledWith(
      expect.anything(), 'TIME_ENTRY_UPDATED', expect.anything(), T, expect.anything()
    );
  });

  it('§33 — another USER cannot edit someone else\'s entry', async () => {
    seedEntry(entryFor({ userId: ADMIN.userId }));
    arrange(T, 'Agency', 'USER', MEMBER.userId);
    const res = await patchEntry(jsonRequest('/api/agency/time/entry-1', 'PATCH', { durationMinutes: 10 }), ctxFor('entry-1'));
    expect(res.status).toBe(403);
    expect(mockUpdateTimeEntryRepo).not.toHaveBeenCalled();
  });

  it('a SUBMITTED entry is locked pending review (§28)', async () => {
    seedEntry(entryFor({ approvalStatus: 'SUBMITTED' }));
    arrange(T);
    const res = await patchEntry(jsonRequest('/api/agency/time/entry-1', 'PATCH', { durationMinutes: 10 }), ctxFor('entry-1'));
    expect(res.status).toBe(409);
  });

  it('an APPROVED entry is notes-only (§28 restricted edit)', async () => {
    seedEntry(entryFor({ approvalStatus: 'APPROVED' }));
    arrange(T);
    const notes = await patchEntry(jsonRequest('/api/agency/time/entry-1', 'PATCH', { notes: 'clarified' }), ctxFor('entry-1'));
    expect(notes.status).toBe(200);

    seedEntry(entryFor({ approvalStatus: 'APPROVED' }));
    const illegal = await patchEntry(jsonRequest('/api/agency/time/entry-1', 'PATCH', { durationMinutes: 10 }), ctxFor('entry-1'));
    expect(illegal.status).toBe(400);
  });
});

// ---------- submit / approve / reject (§19–§23) ----------

describe('Module 7E — approval workflow (§19/§20/§21/§23/§24)', () => {
  it('DRAFT → SUBMITTED, then double-submit is a 409', async () => {
    seedEntry(entryFor());
    arrange(T);
    const first = await submitEntry(requestFor('/api/agency/time/entry-1/submit'), ctxFor('entry-1'));
    expect(first.status).toBe(200);
    expect((await first.json()).timeEntry.approvalStatus).toBe('SUBMITTED');

    const second = await submitEntry(requestFor('/api/agency/time/entry-1/submit'), ctxFor('entry-1'));
    expect(second.status).toBe(409);
  });

  it('tenant admin can approve their own time entry without restriction', async () => {
    seedEntry(entryFor({ userId: ADMIN.userId, approvalStatus: 'SUBMITTED' }));
    arrange(T);  // admin is the author
    const res = await approveEntry(requestFor('/api/agency/time/entry-1/approve'), ctxFor('entry-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.timeEntry.approvalStatus).toBe('APPROVED');
  });

  it('§21/§23 — the project\'s manager (a USER) approves; economics compute from filled snapshots', async () => {
    // Created without rates (§24); rates configured BEFORE approval → the
    // last-chance resolution fills the snapshots and §23 computes.
    seedEntry(entryFor({ userId: ADMIN.userId, approvalStatus: 'SUBMITTED' }));
    mockResolveCost.mockResolvedValue(resolvedCost(900));
    mockResolveBilling.mockResolvedValue(resolvedBilling(2500));
    arrange(T, 'Agency', 'USER', MEMBER.userId);  // MEMBER manages the project

    const res = await approveEntry(requestFor('/api/agency/time/entry-1/approve'), ctxFor('entry-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.timeEntry.approvalStatus).toBe('APPROVED');
    expect(body.timeEntry.costRateSnapshot).toEqual(COST_SNAPSHOT);
    expect(body.timeEntry.billingRateSnapshot).toEqual(BILLING_SNAPSHOT);
    expect(body.timeEntry.financialStatus).toBe('READY');
    expect(body.timeEntry.calculatedCost).toEqual({ amount: 1350, currency: 'INR' });  // 1.5h × 900
    expect(body.timeEntry.calculatedBillableAmount).toEqual({ amount: 3750, currency: 'INR' });  // 1.5h × 2500
    expect(mockCreateLog).toHaveBeenCalledWith(
      expect.anything(), 'TIME_ENTRY_APPROVED', expect.anything(), T, expect.anything()
    );
  });

  it('§24 — approval with rates still missing succeeds but recognition stays blocked', async () => {
    seedEntry(entryFor({ userId: ADMIN.userId, approvalStatus: 'SUBMITTED' }));
    arrange(T, 'Agency', 'USER', MEMBER.userId);
    const res = await approveEntry(requestFor('/api/agency/time/entry-1/approve'), ctxFor('entry-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.timeEntry.approvalStatus).toBe('APPROVED');
    expect(body.timeEntry.financialStatus).toBe('RATE_CONFIGURATION_REQUIRED');
    expect(body.timeEntry.calculatedCost).toBeUndefined();
  });

  it('§21 — a USER who is neither admin nor the project\'s manager cannot approve', async () => {
    mockGetProjectById.mockResolvedValue(projectFor({ projectManagerId: 'someone-else' }));
    seedEntry(entryFor({ userId: ADMIN.userId, approvalStatus: 'SUBMITTED' }));
    arrange(T, 'Agency', 'USER', MEMBER.userId);
    const res = await approveEntry(requestFor('/api/agency/time/entry-1/approve'), ctxFor('entry-1'));
    expect(res.status).toBe(403);
  });

  it('§20 — rejection requires a reason and withdraws economics', async () => {
    seedEntry(entryFor({
      userId: ADMIN.userId, approvalStatus: 'SUBMITTED',
      calculatedCost: { amount: 1350, currency: 'INR' },
      calculatedBillableAmount: { amount: 3750, currency: 'INR' },
    }));
    arrange(T, 'Agency', 'USER', MEMBER.userId);

    const noReason = await rejectEntry(jsonRequest('/api/agency/time/entry-1/reject', 'POST', {}), ctxFor('entry-1'));
    expect(noReason.status).toBe(400);

    const res = await rejectEntry(jsonRequest('/api/agency/time/entry-1/reject', 'POST', { reason: 'Wrong project' }), ctxFor('entry-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.timeEntry.approvalStatus).toBe('REJECTED');
    expect(body.timeEntry.rejectionReason).toBe('Wrong project');
    expect(body.timeEntry.calculatedCost).toBeUndefined();
    expect(body.timeEntry.calculatedBillableAmount).toBeUndefined();
  });

  it('tenant admin can reject their own entry without restriction', async () => {
    seedEntry(entryFor({ userId: ADMIN.userId, approvalStatus: 'SUBMITTED' }));
    arrange(T);
    const res = await rejectEntry(jsonRequest('/api/agency/time/entry-1/reject', 'POST', { reason: 'x' }), ctxFor('entry-1'));
    expect(res.status).toBe(200);
  });

  it('§20 — editing a REJECTED entry returns it to DRAFT', async () => {
    seedEntry(entryFor({ approvalStatus: 'REJECTED', rejectionReason: 'Wrong project' }));
    arrange(T);
    const res = await patchEntry(jsonRequest('/api/agency/time/entry-1', 'PATCH', { durationMinutes: 45 }), ctxFor('entry-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.timeEntry.approvalStatus).toBe('DRAFT');
    expect(body.timeEntry.rejectionReason).toBeUndefined();
  });

  it('the approval queue is admin-only (§30) and returns SUBMITTED entries with economics', async () => {
    mockGetTimeEntries.mockResolvedValue([
      entryFor({ userId: ADMIN.userId, approvalStatus: 'SUBMITTED', calculatedCost: { amount: 1350, currency: 'INR' } }),
    ]);
    arrange(T);
    const res = await approvalQueue(requestFor('/api/agency/time/approvals'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.timeEntries).toHaveLength(1);
    expect(body.timeEntries[0].calculatedCost).toBeDefined();
    expect(mockGetTimeEntries).toHaveBeenCalledWith(T, expect.objectContaining({ approvalStatus: 'SUBMITTED' }));

    arrange(T, 'Agency', 'USER', MEMBER.userId);
    const denied = await approvalQueue(requestFor('/api/agency/time/approvals'));
    expect(denied.status).toBe(403);
  });
});

// ---------- timer (§8–§13) ----------

describe('Module 7E — timer (§8/§11/§12/§13)', () => {
  function sessionFor(overrides: Partial<TimerSession> = {}): TimerSession {
    return {
      id: 'timer-1', tenantId: T, userId: ADMIN.userId, projectId: AGENCY_A.project.id,
      startedAt: new Date(Date.now() - 5 * 60000),  // 5 minutes ago
      status: 'RUNNING', createdAt: new Date(),
      ...overrides,
    };
  }

  it('starts a durable session and refuses a second (§11 409 + code)', async () => {
    arrange(T);
    mockGetActiveTimer.mockResolvedValue(null);
    mockCreateTimerSession.mockResolvedValue(sessionFor());
    const res = await startTimerRoute(jsonRequest('/api/agency/timer/start', 'POST', { projectId: AGENCY_A.project.id }));
    expect(res.status).toBe(201);
    expect((await res.json()).timerSession.status).toBe('RUNNING');

    mockGetActiveTimer.mockResolvedValue(sessionFor());
    const dup = await startTimerRoute(jsonRequest('/api/agency/timer/start', 'POST', { projectId: AGENCY_A.project.id }));
    expect(dup.status).toBe(409);
    expect((await dup.json()).code).toBe('TIMER_ALREADY_RUNNING');
  });

  it('an invalid review leaves the session RUNNING (§10 — nothing is lost)', async () => {
    arrange(T);
    mockGetActiveTimer.mockResolvedValue(sessionFor());
    const res = await stopTimerRoute(jsonRequest('/api/agency/timer/stop', 'POST', { review: { notes: 'no billable flag' } }));
    expect(res.status).toBe(400);
    expect(mockUpdateTimerSession).not.toHaveBeenCalled();
    expect(mockCreateTimeEntryRepo).not.toHaveBeenCalled();
  });

  it('stop without review halts the session and returns the elapsed minutes', async () => {
    arrange(T);
    mockGetActiveTimer.mockResolvedValue(sessionFor());
    mockUpdateTimerSession.mockResolvedValue(true);
    const res = await stopTimerRoute(jsonRequest('/api/agency/timer/stop', 'POST', {}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.elapsedMinutes).toBe(5);
    expect(body.timeEntry).toBeUndefined();
  });

  it('stop with review creates today\'s DRAFT entry; the override can only adjust DOWN (Rule 6)', async () => {
    arrange(T);
    mockGetActiveTimer.mockResolvedValue(sessionFor());
    mockUpdateTimerSession.mockResolvedValue(true);
    const res = await stopTimerRoute(jsonRequest('/api/agency/timer/stop', 'POST', {
      review: { billable: false, durationMinutes: 100 },  // 100 > elapsed 5 → capped
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.timeEntry.durationMinutes).toBe(5);
    expect(body.timeEntry.approvalStatus).toBe('DRAFT');
    // The domain derives "today" in the TENANT timezone — the expectation
    // must too (a UTC toISOString() disagrees with IST every evening).
    expect(body.timeEntry.date).toBe(todayInTimezone(DEFAULT_TENANT_TIMEZONE));
    expect(mockCreateLog).toHaveBeenCalledWith(
      expect.anything(), 'TIME_ENTRY_CREATED', expect.stringContaining('timer'), T, expect.anything()
    );
  });

  it('discard marks the session DISCARDED and creates nothing (§9 honest third state)', async () => {
    arrange(T);
    mockGetActiveTimer.mockResolvedValue(sessionFor());
    mockUpdateTimerSession.mockResolvedValue(true);
    const res = await discardTimerRoute(requestFor('/api/agency/timer/discard', { method: 'POST' }));
    expect(res.status).toBe(200);
    expect((await res.json()).timerSession.status).toBe('DISCARDED');
    expect(mockUpdateTimerSession).toHaveBeenCalledWith('timer-1', T, { status: 'DISCARDED' });
    expect(mockCreateTimeEntryRepo).not.toHaveBeenCalled();
  });
});
