/**
 * Module 3 (Step 3.9 / §104) — Integration: Agency Project API.
 *
 * Runs the REAL route handlers with only the session/tenant/repository edges
 * mocked — the full pipeline executes between them:
 *   authenticate → resolve tenant → verify Agency capability → authorize
 *   (§28: admin writes, user reads) → validate → operate → audit → respond.
 *
 * Step 3.9 matrix:
 *   Integration — create project, assign team, create work item,
 *                 create milestone, activate (the §75 gate)
 *   Security    — cross-tenant client / project / manager / member (§113:
 *                 the probe response is IDENTICAL to the missing-reference
 *                 response — never an existence leak)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TokenPayload } from '@/lib/auth';
import type { Client, Tenant, User } from '@/lib/db';
import type { Project, WorkItem } from '@/lib/agency/types/project';
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
    getClientById: vi.fn(),
    getUserById: vi.fn(),
    getProjectById: vi.fn(),
    findProjectByCode: vi.fn(),
    // Module 3 — project codes are system-assigned. Mocked so the suite never
    // reaches the real allocator (which would fall through to the local-DB
    // file writer when no Mongo is configured).
    allocateProjectCode: vi.fn(),
    createProject: vi.fn(),
    updateProject: vi.fn(),
    getProjects: vi.fn(),
    searchProjects: vi.fn(),
    getProjectMembers: vi.fn(),
    createProjectMember: vi.fn(),
    updateProjectMember: vi.fn(),
    removeProjectMember: vi.fn(),
    getProjectWorkItems: vi.fn(),
    getWorkItemById: vi.fn(),
    listWorkItems: vi.fn(),
    getNextWorkItemSortOrder: vi.fn(),
    createWorkItem: vi.fn(),
    updateWorkItem: vi.fn(),
    getProjectMilestones: vi.fn(),
    createProjectMilestone: vi.fn(),
    getLogs: vi.fn(),
    createLog: vi.fn(),
  };
});

import { getSessionUser } from '@/lib/auth';
import {
  getTenantById, getClientById, getUserById,
  getProjectById, findProjectByCode, createProject, updateProject, getProjects, searchProjects,
  allocateProjectCode,
  getProjectMembers, createProjectMember, updateProjectMember, removeProjectMember, getProjectWorkItems, getWorkItemById, listWorkItems,
  getNextWorkItemSortOrder, createWorkItem, updateWorkItem,
  getProjectMilestones, createProjectMilestone, getLogs, createLog,
} from '@/lib/db';
import { GET as listProjects, POST as createProjectRoute } from '@/app/api/agency/projects/route';
import { GET as getProject, PATCH as patchProject } from '@/app/api/agency/projects/[id]/route';
import { POST as lifecycleAction } from '@/app/api/agency/projects/[id]/[action]/route';
import { GET as listMembersRoute, POST as addMember } from '@/app/api/agency/projects/[id]/members/route';
import { PATCH as patchMemberRoute, DELETE as deleteMemberRoute } from '@/app/api/agency/projects/[id]/members/[memberId]/route';
import { POST as removeMemberRoute } from '@/app/api/agency/projects/[id]/members/[memberId]/remove/route';
import { GET as listWorkItemsRoute, POST as createWorkItemRoute } from '@/app/api/agency/projects/[id]/work-items/route';
import { GET as getWorkItemRoute, PATCH as patchWorkItemRoute } from '@/app/api/agency/projects/[id]/work-items/[itemId]/route';
import { POST as archiveWorkItemRoute } from '@/app/api/agency/projects/[id]/work-items/[itemId]/archive/route';
import { POST as createMilestoneRoute } from '@/app/api/agency/projects/[id]/milestones/route';
import { NextRequest } from 'next/server';

const mockSession = vi.mocked(getSessionUser);
const mockGetTenant = vi.mocked(getTenantById);
const mockGetClientById = vi.mocked(getClientById);
const mockGetUserById = vi.mocked(getUserById);
const mockGetProjectById = vi.mocked(getProjectById);
const mockFindProjectByCode = vi.mocked(findProjectByCode);
const mockCreateProject = vi.mocked(createProject);
const mockAllocateProjectCode = vi.mocked(allocateProjectCode);
const mockUpdateProject = vi.mocked(updateProject);
const mockGetProjects = vi.mocked(getProjects);
const mockSearchProjects = vi.mocked(searchProjects);
const mockGetProjectMembers = vi.mocked(getProjectMembers);
const mockCreateProjectMember = vi.mocked(createProjectMember);
const mockUpdateProjectMember = vi.mocked(updateProjectMember);
const mockRemoveProjectMember = vi.mocked(removeProjectMember);
const mockGetProjectWorkItems = vi.mocked(getProjectWorkItems);
const mockGetWorkItemById = vi.mocked(getWorkItemById);
const mockListWorkItems = vi.mocked(listWorkItems);
const mockGetNextWorkItemSortOrder = vi.mocked(getNextWorkItemSortOrder);
const mockCreateWorkItem = vi.mocked(createWorkItem);
const mockUpdateWorkItem = vi.mocked(updateWorkItem);
const mockGetProjectMilestones = vi.mocked(getProjectMilestones);
const mockCreateProjectMilestone = vi.mocked(createProjectMilestone);
const mockGetLogs = vi.mocked(getLogs);
const mockCreateLog = vi.mocked(createLog);

function requestFor(url: string, init?: RequestInit): NextRequest {
  // DOM RequestInit vs Next's narrow spec type — cast across the harmless
  // signal-nullability difference.
  return new NextRequest(new URL(url, 'http://localhost:3100'), init as ConstructorParameters<typeof NextRequest>[1]);
}

function jsonRequest(url: string, method: string, body: unknown): NextRequest {
  return requestFor(url, { method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
}

/** Next 16 dynamic-route context: params is a Promise. */
function ctxFor(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function itemCtxFor(id: string, itemId: string): { params: Promise<{ id: string; itemId: string }> } {
  return { params: Promise.resolve({ id, itemId }) };
}

function memberCtxFor(id: string, memberId: string): { params: Promise<{ id: string; memberId: string }> } {
  return { params: Promise.resolve({ id, memberId }) };
}

function actionCtxFor(id: string, action: string): { params: Promise<{ id: string; action: string }> } {
  return { params: Promise.resolve({ id, action }) };
}

function projectFor(tenantId: string, overrides: Partial<Project> = {}): Project {
  return {
    id: AGENCY_A.project.id,
    tenantId,
    clientId: AGENCY_A.client.id,
    name: 'Website Redesign',
    billingModel: 'FIXED_FEE',
    currency: 'INR',
    status: 'DRAFT',
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
    ...overrides,
  } as Project;
}

function clientFor(tenantId: string): Client & { id: string } {
  return {
    id: AGENCY_A.client.id,
    tenantId,
    name: 'Client A Industries',
    email: 'billing@clienta.example',
    createdAt: new Date('2026-01-15T00:00:00Z'),
    status: 'ACTIVE',
  };
}

function userFor(tenantId: string, overrides: Record<string, unknown> = {}): User {
  return {
    _id: AGENCY_A.admin.userId,
    username: 'agency_a_admin',
    passwordHash: 'x',
    role: 'TENANT_ADMIN',
    tenantId,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as unknown as User;
}

function workItemFor(tenantId: string, overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 'wi-a100000000000000000000a',
    tenantId,
    projectId: AGENCY_A.project.id,
    name: 'Sitemap',
    description: 'XML sitemap and robots.txt',
    status: 'NOT_STARTED',
    estimatedMinutes: 480,
    sortOrder: 0,
    createdBy: `u-${tenantId}`,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    ...overrides,
  } as WorkItem;
}

/** Module 5 §32 — active by default; pass { active: false } for history rows. */
function memberFor(tenantId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'pm-1',
    tenantId,
    projectId: AGENCY_A.project.id,
    userId: AGENCY_A.member.userId,
    role: 'Developer',
    allocationPercent: 80,
    active: true,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    ...overrides,
  } as never;
}

/** Stand up the session + tenant chain for one tenant (admin by default). */
function arrange(
  tenantId: string,
  appMode: Tenant['appMode'] = 'Agency',
  role: TokenPayload['role'] = 'TENANT_ADMIN'
) {
  const session: TokenPayload = {
    userId: `u-${tenantId}`, username: 'tester', role, tenantId,
  };
  const tenant: Tenant = {
    id: tenantId, name: `Tenant ${tenantId}`, status: 'ACTIVE', plan: 'FREE',
    settings: {}, limits: { maxUsers: 5 }, appMode,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
  mockSession.mockResolvedValue(session);
  mockGetTenant.mockResolvedValue(tenant);
}

beforeEach(() => {
  for (const m of [
    mockSession, mockGetTenant, mockGetClientById, mockGetUserById,
    mockGetProjectById, mockFindProjectByCode, mockCreateProject, mockUpdateProject, mockGetProjects,
    mockSearchProjects, mockGetProjectMembers, mockCreateProjectMember,
    mockUpdateProjectMember, mockRemoveProjectMember,
    mockGetProjectWorkItems, mockGetWorkItemById, mockListWorkItems, mockGetNextWorkItemSortOrder,
    mockCreateWorkItem, mockUpdateWorkItem, mockGetProjectMilestones,
    mockCreateProjectMilestone, mockGetLogs, mockCreateLog, mockAllocateProjectCode,
  ]) m.mockReset();
  // §25 — new items append after the current last position; no file I/O.
  mockGetNextWorkItemSortOrder.mockResolvedValue(0);
  // Module 3 — the code allocator is a counter; a fixed answer keeps the
  // assertion deterministic without touching storage.
  mockAllocateProjectCode.mockResolvedValue(1);
  // Audit log writes are side effects — swallow them by default.
  mockCreateLog.mockResolvedValue({} as Awaited<ReturnType<typeof createLog>>);
});

// ---------- Step 3.9: integration ----------

describe('Module 3.9 integration — create project (§37/§74)', () => {
  it('creates a DRAFT project and audits the mutation (§86)', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetClientById.mockResolvedValue(clientFor(AGENCY_A.tenant.id));
    mockCreateProject.mockResolvedValue(projectFor(AGENCY_A.tenant.id, { status: 'DRAFT' }));

    const res = await createProjectRoute(jsonRequest('/api/agency/projects', 'POST', {
      clientId: AGENCY_A.client.id, name: 'Website Redesign',
      billingModel: 'FIXED_FEE', currency: 'inr',
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.project.name).toBe('Website Redesign');
    // The repository was called with the SESSION tenant — never a payload tenant
    expect(mockCreateProject).toHaveBeenCalledWith(
      AGENCY_A.tenant.id,
      expect.objectContaining({ clientId: AGENCY_A.client.id, currency: 'INR' })
    );
    expect(mockCreateLog).toHaveBeenCalledWith(
      expect.anything(), 'PROJECT_CREATED', expect.anything(), AGENCY_A.tenant.id, expect.anything()
    );
  });

  // ---------- Module 3 — system-assigned project codes ----------

  it('assigns a code from the tenant sequence when the payload omits one', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetClientById.mockResolvedValue(clientFor(AGENCY_A.tenant.id));
    mockCreateProject.mockResolvedValue(projectFor(AGENCY_A.tenant.id));
    mockAllocateProjectCode.mockResolvedValue(7);

    const res = await createProjectRoute(jsonRequest('/api/agency/projects', 'POST', {
      clientId: AGENCY_A.client.id, name: 'Website Redesign',
      billingModel: 'FIXED_FEE', currency: 'INR',
    }));
    expect(res.status).toBe(201);
    expect(mockAllocateProjectCode).toHaveBeenCalledWith(AGENCY_A.tenant.id);
    // PRJ-0007 — the sequence number zero-padded to 4
    expect(mockCreateProject).toHaveBeenCalledWith(
      AGENCY_A.tenant.id,
      expect.objectContaining({ code: 'PRJ-0007' })
    );
    // A generated code is unique by construction — no clash probe is issued.
    expect(mockFindProjectByCode).not.toHaveBeenCalled();
  });

  it('honours an explicitly supplied code and keeps the §111 uniqueness check', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetClientById.mockResolvedValue(clientFor(AGENCY_A.tenant.id));
    mockCreateProject.mockResolvedValue(projectFor(AGENCY_A.tenant.id));
    mockFindProjectByCode.mockResolvedValue(null);

    const res = await createProjectRoute(jsonRequest('/api/agency/projects', 'POST', {
      clientId: AGENCY_A.client.id, name: 'Website Redesign',
      billingModel: 'FIXED_FEE', currency: 'INR', code: 'ACME-WEB-001',
    }));
    expect(res.status).toBe(201);
    expect(mockCreateProject).toHaveBeenCalledWith(
      AGENCY_A.tenant.id,
      expect.objectContaining({ code: 'ACME-WEB-001' })
    );
    // The allocator is never consulted when the caller pinned a code.
    expect(mockAllocateProjectCode).not.toHaveBeenCalled();
  });

  it('still 409s when an explicitly supplied code is already taken (§111)', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetClientById.mockResolvedValue(clientFor(AGENCY_A.tenant.id));
    mockFindProjectByCode.mockResolvedValue(projectFor(AGENCY_A.tenant.id, { name: 'Existing Site' }));

    const res = await createProjectRoute(jsonRequest('/api/agency/projects', 'POST', {
      clientId: AGENCY_A.client.id, name: 'Website Redesign',
      billingModel: 'FIXED_FEE', currency: 'INR', code: 'ACME-WEB-001',
    }));
    expect(res.status).toBe(409);
    expect(mockCreateProject).not.toHaveBeenCalled();
  });

  it('returns the §73 advisory warnings alongside the 201', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetClientById.mockResolvedValue(clientFor(AGENCY_A.tenant.id));
    mockCreateProject.mockResolvedValue(projectFor(AGENCY_A.tenant.id));

    const res = await createProjectRoute(jsonRequest('/api/agency/projects', 'POST', {
      clientId: AGENCY_A.client.id, name: 'Website Redesign',
      billingModel: 'FIXED_FEE', currency: 'INR',
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(Array.isArray(body.warnings)).toBe(true);
    expect(body.warnings.join(' ')).toContain('contract value');
  });

  it('rejects a payload missing the §37 commercial core with 400', async () => {
    arrange(AGENCY_A.tenant.id);
    const res = await createProjectRoute(jsonRequest('/api/agency/projects', 'POST', { name: 'No client' }));
    expect(res.status).toBe(400);
    expect(mockCreateProject).not.toHaveBeenCalled();
  });

  it('members ride along from the wizard payload — each integrity-checked and audited', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetClientById.mockResolvedValue(clientFor(AGENCY_A.tenant.id));
    mockGetUserById.mockResolvedValue(userFor(AGENCY_A.tenant.id));
    mockCreateProject.mockResolvedValue(projectFor(AGENCY_A.tenant.id));
    mockCreateProjectMember.mockResolvedValue({ id: 'pm-1' } as never);

    const res = await createProjectRoute(jsonRequest('/api/agency/projects', 'POST', {
      clientId: AGENCY_A.client.id, name: 'Website Redesign',
      billingModel: 'FIXED_FEE', currency: 'INR',
      members: [{ userId: AGENCY_A.member.userId, role: 'Developer', allocationPercent: 50 }],
    }));
    expect(res.status).toBe(201);
    expect(mockCreateProjectMember).toHaveBeenCalledWith(
      AGENCY_A.tenant.id, AGENCY_A.project.id,
      expect.objectContaining({ userId: AGENCY_A.member.userId, role: 'Developer', allocationPercent: 50 })
    );
  });
});

describe('Module 3.9 integration — activate through the §75 gate', () => {
  it('activates a DRAFT with a valid commercial core and returns advisory warnings', async () => {
    arrange(AGENCY_A.tenant.id);
    const draft = projectFor(AGENCY_A.tenant.id, { status: 'DRAFT' }); // FIXED_FEE, no contractValue
    mockGetProjectById.mockResolvedValueOnce(draft);
    mockUpdateProject.mockResolvedValue(true);
    mockGetProjectById.mockResolvedValueOnce({ ...draft, status: 'ACTIVE' });

    const res = await lifecycleAction(
      requestFor(`/api/agency/projects/${draft.id}/activate`, { method: 'POST' }),
      actionCtxFor(draft.id, 'activate')
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.project.status).toBe('ACTIVE');
    expect(body.warnings.join(' ')).toContain('contract value');
    expect(mockUpdateProject).toHaveBeenCalledWith(draft.id, AGENCY_A.tenant.id, { status: 'ACTIVE' });
  });

  it('HARD-rejects a MILESTONE project with no milestone (§75)', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetProjectById.mockResolvedValue(projectFor(AGENCY_A.tenant.id, { status: 'DRAFT', billingModel: 'MILESTONE' }));
    mockGetProjectMilestones.mockResolvedValue([]);

    const res = await lifecycleAction(
      requestFor(`/api/agency/projects/${AGENCY_A.project.id}/activate`, { method: 'POST' }),
      actionCtxFor(AGENCY_A.project.id, 'activate')
    );
    expect(res.status).toBe(400);
    expect(mockUpdateProject).not.toHaveBeenCalled();
  });

  it('a non-cancelled milestone satisfies the gate — a CANCELLED one does not', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetProjectById.mockResolvedValue(projectFor(AGENCY_A.tenant.id, { status: 'DRAFT', billingModel: 'MILESTONE' }));
    mockGetProjectMilestones.mockResolvedValue([{ id: 'm1', status: 'CANCELLED', percentage: 100 } as never]);
    const rejected = await lifecycleAction(
      requestFor(`/api/agency/projects/${AGENCY_A.project.id}/activate`, { method: 'POST' }),
      actionCtxFor(AGENCY_A.project.id, 'activate')
    );
    expect(rejected.status).toBe(400);
  });

  it('rejects an illegal transition (ARCHIVED → anything is terminal, §41)', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetProjectById.mockResolvedValue(projectFor(AGENCY_A.tenant.id, { status: 'ARCHIVED' }));
    const res = await lifecycleAction(
      requestFor(`/api/agency/projects/${AGENCY_A.project.id}/activate`, { method: 'POST' }),
      actionCtxFor(AGENCY_A.project.id, 'activate')
    );
    expect(res.status).toBe(400);
    expect(mockUpdateProject).not.toHaveBeenCalled();
  });

  it('an unknown action name is a 404 — the URL space stays closed', async () => {
    arrange(AGENCY_A.tenant.id);
    const res = await lifecycleAction(
      requestFor(`/api/agency/projects/${AGENCY_A.project.id}/delete`, { method: 'POST' }),
      actionCtxFor(AGENCY_A.project.id, 'delete')
    );
    expect(res.status).toBe(404);
  });
});

describe('Module 3.9 integration — assign team (§59/§60)', () => {
  it('adds a member and audits PROJECT_MEMBER_ADDED', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetProjectById.mockResolvedValue(projectFor(AGENCY_A.tenant.id));
    mockGetUserById.mockResolvedValue(userFor(AGENCY_A.tenant.id, { _id: AGENCY_A.member.userId, role: 'USER' }));
    mockGetProjectMembers.mockResolvedValue([]);
    mockCreateProjectMember.mockResolvedValue({ id: 'pm-1', userId: AGENCY_A.member.userId } as never);

    const res = await addMember(
      jsonRequest(`/api/agency/projects/${AGENCY_A.project.id}/members`, 'POST', {
        userId: AGENCY_A.member.userId, role: 'Developer', allocationPercent: 80,
      }),
      ctxFor(AGENCY_A.project.id)
    );
    expect(res.status).toBe(201);
    expect(mockCreateProjectMember).toHaveBeenCalledWith(
      AGENCY_A.tenant.id, AGENCY_A.project.id,
      expect.objectContaining({ userId: AGENCY_A.member.userId, allocationPercent: 80 })
    );
    expect(mockCreateLog).toHaveBeenCalledWith(
      expect.anything(), 'PROJECT_MEMBER_ADDED', expect.anything(), AGENCY_A.tenant.id, expect.anything()
    );
  });

  it('rejects a duplicate membership with 409 (§59)', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetProjectById.mockResolvedValue(projectFor(AGENCY_A.tenant.id));
    mockGetUserById.mockResolvedValue(userFor(AGENCY_A.tenant.id, { _id: AGENCY_A.member.userId, role: 'USER' }));
    mockGetProjectMembers.mockResolvedValue([{ id: 'pm-0', userId: AGENCY_A.member.userId } as never]);

    const res = await addMember(
      jsonRequest(`/api/agency/projects/${AGENCY_A.project.id}/members`, 'POST', {
        userId: AGENCY_A.member.userId,
      }),
      ctxFor(AGENCY_A.project.id)
    );
    expect(res.status).toBe(409);
    expect(mockCreateProjectMember).not.toHaveBeenCalled();
  });
});

describe('Module 3.9 integration — create work item (§61)', () => {
  it('creates a work item on an existing project and audits it (legacy hours → §9 minutes)', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetProjectById.mockResolvedValue(projectFor(AGENCY_A.tenant.id));
    mockCreateWorkItem.mockResolvedValue({ id: 'wi-1', name: 'Sitemap' } as never);

    const res = await createWorkItemRoute(
      jsonRequest(`/api/agency/projects/${AGENCY_A.project.id}/work-items`, 'POST', {
        name: 'Sitemap', estimatedHours: 8,
      }),
      ctxFor(AGENCY_A.project.id)
    );
    expect(res.status).toBe(201);
    // Module 4 §9 — the legacy decimal-hours input is converted losslessly;
    // only estimatedMinutes is stored. createdBy comes from the session;
    // sortOrder defaults (0 when the next-order probe is mocked to []).
    expect(mockCreateWorkItem).toHaveBeenCalledWith(
      AGENCY_A.tenant.id, AGENCY_A.project.id,
      expect.objectContaining({ name: 'Sitemap', estimatedMinutes: 480, createdBy: `u-${AGENCY_A.tenant.id}` })
    );
  });

  it('rejects a work item without a name (§61)', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetProjectById.mockResolvedValue(projectFor(AGENCY_A.tenant.id));
    const res = await createWorkItemRoute(
      jsonRequest(`/api/agency/projects/${AGENCY_A.project.id}/work-items`, 'POST', {}),
      ctxFor(AGENCY_A.project.id)
    );
    expect(res.status).toBe(400);
    expect(mockCreateWorkItem).not.toHaveBeenCalled();
  });
});

describe('Module 3.9 integration — create milestone (§46)', () => {
  it('creates an amount-based milestone and audits it', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetProjectById.mockResolvedValue(projectFor(AGENCY_A.tenant.id));
    mockCreateProjectMilestone.mockResolvedValue({ id: 'ms-1', name: 'Kickoff' } as never);

    const res = await createMilestoneRoute(
      jsonRequest(`/api/agency/projects/${AGENCY_A.project.id}/milestones`, 'POST', {
        name: 'Kickoff', sequence: 1, amount: 150000,
      }),
      ctxFor(AGENCY_A.project.id)
    );
    expect(res.status).toBe(201);
    expect(mockCreateProjectMilestone).toHaveBeenCalledWith(
      AGENCY_A.tenant.id, AGENCY_A.project.id,
      expect.objectContaining({ name: 'Kickoff', sequence: 1, amount: 150000 })
    );
  });

  it('rejects the §46 XOR violation (both amount and percentage)', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetProjectById.mockResolvedValue(projectFor(AGENCY_A.tenant.id));
    const res = await createMilestoneRoute(
      jsonRequest(`/api/agency/projects/${AGENCY_A.project.id}/milestones`, 'POST', {
        name: 'Broken', sequence: 1, amount: 1000, percentage: 30,
      }),
      ctxFor(AGENCY_A.project.id)
    );
    expect(res.status).toBe(400);
    expect(mockCreateProjectMilestone).not.toHaveBeenCalled();
  });

  it('rejects percentages that would push the total past 100 — BEFORE the write (§46)', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetProjectById.mockResolvedValue(projectFor(AGENCY_A.tenant.id));
    mockGetProjectMilestones.mockResolvedValue([{ id: 'ms-1', status: 'PLANNED', percentage: 80 } as never]);

    const res = await createMilestoneRoute(
      jsonRequest(`/api/agency/projects/${AGENCY_A.project.id}/milestones`, 'POST', {
        name: 'Over-allocated', sequence: 2, percentage: 30,
      }),
      ctxFor(AGENCY_A.project.id)
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('110');
    expect(mockCreateProjectMilestone).not.toHaveBeenCalled();
  });

  it('CANCELLED milestones do not count toward the 100% allocation', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetProjectById.mockResolvedValue(projectFor(AGENCY_A.tenant.id));
    mockGetProjectMilestones.mockResolvedValue([{ id: 'ms-1', status: 'CANCELLED', percentage: 80 } as never]);
    mockCreateProjectMilestone.mockResolvedValue({ id: 'ms-2' } as never);

    const res = await createMilestoneRoute(
      jsonRequest(`/api/agency/projects/${AGENCY_A.project.id}/milestones`, 'POST', {
        name: 'Replacement', sequence: 2, percentage: 100,
      }),
      ctxFor(AGENCY_A.project.id)
    );
    expect(res.status).toBe(201);
  });
});

describe('Module 3.9 integration — workspace read', () => {
  it('returns project + members + work items + milestones + activity (§102)', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetProjectById.mockResolvedValue(projectFor(AGENCY_A.tenant.id));
    mockGetProjectMembers.mockResolvedValue([{ id: 'pm-1', userId: AGENCY_A.member.userId } as never]);
    mockGetProjectWorkItems.mockResolvedValue([{ id: 'wi-1', name: 'Sitemap' } as never]);
    mockGetProjectMilestones.mockResolvedValue([]);
    mockGetLogs.mockResolvedValue([]);
    mockGetClientById.mockResolvedValue(clientFor(AGENCY_A.tenant.id));
    mockGetUserById.mockResolvedValue(userFor(AGENCY_A.tenant.id, { _id: AGENCY_A.member.userId, username: 'agency_a_dev', role: 'USER' }));

    const res = await getProject(
      requestFor(`/api/agency/projects/${AGENCY_A.project.id}`),
      ctxFor(AGENCY_A.project.id)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.project.id).toBe(AGENCY_A.project.id);
    expect(body.clientName).toBe('Client A Industries');
    expect(body.userLabels[AGENCY_A.member.userId]).toBe('agency_a_dev');
    expect(Array.isArray(body.activity)).toBe(true);
  });

  it('lists projects tenant-scoped with resolved label maps', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetProjects.mockResolvedValue([projectFor(AGENCY_A.tenant.id, { projectManagerId: AGENCY_A.admin.userId })]);
    mockGetClientById.mockResolvedValue(clientFor(AGENCY_A.tenant.id));
    mockGetUserById.mockResolvedValue(userFor(AGENCY_A.tenant.id));

    const res = await listProjects(requestFor('/api/agency/projects'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.projects).toHaveLength(1);
    expect(body.clientLabels[AGENCY_A.client.id]).toBe('Client A Industries');
    expect(body.managerLabels[AGENCY_A.admin.userId]).toBe('agency_a_admin');
    // The repository was called with the SESSION tenant, never a URL param
    expect(mockGetProjects).toHaveBeenCalledWith(
      AGENCY_A.tenant.id, expect.objectContaining({ page: 1 }), {}
    );
  });
});

// ---------- Step 3.9: security (§113 — identical responses, no leak) ----------

describe('Module 3.9 security — cross-tenant client reference (§80/§113)', () => {
  it('a cross-tenant client id on create is rejected EXACTLY like a missing one', async () => {
    arrange(AGENCY_A.tenant.id);
    const payload = {
      clientId: AGENCY_B.client.id, name: 'Evil Project',
      billingModel: 'FIXED_FEE', currency: 'INR',
    };
    // The repository is tenant-scoped: B's id does not resolve for A
    mockGetClientById.mockImplementation(async (id, tenantId) =>
      tenantId === AGENCY_B.tenant.id ? clientFor(AGENCY_B.tenant.id) : null);

    const crossTenant = await createProjectRoute(jsonRequest('/api/agency/projects', 'POST', payload));
    const missing = await createProjectRoute(jsonRequest('/api/agency/projects', 'POST', { ...payload, clientId: 'no-such-client' }));

    expect(crossTenant.status).toBe(400);
    expect(missing.status).toBe(400);
    // §113 — byte-identical failure: no hint that the client exists elsewhere
    expect(await crossTenant.json()).toEqual(await missing.json());
    expect(mockCreateProject).not.toHaveBeenCalled();
  });
});

describe('Module 3.9 security — cross-tenant project (§113)', () => {
  it("A's session asking for B's project id resolves 404 — never a leak", async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetProjectById.mockImplementation(async (id, tenantId) =>
      tenantId === AGENCY_B.tenant.id ? projectFor(AGENCY_B.tenant.id) : null);

    const res = await getProject(
      requestFor(`/api/agency/projects/${AGENCY_B.project.id}`),
      ctxFor(AGENCY_B.project.id)
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain(AGENCY_B.tenant.id);
    // The lookup used the SESSION tenant, not the resource's
    expect(mockGetProjectById).toHaveBeenCalledWith(AGENCY_B.project.id, AGENCY_A.tenant.id);
  });

  it("A cannot activate B's project — identical 404 to an unknown id", async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetProjectById.mockImplementation(async (id, tenantId) =>
      tenantId === AGENCY_B.tenant.id ? projectFor(AGENCY_B.tenant.id) : null);

    const crossTenant = await lifecycleAction(
      requestFor(`/api/agency/projects/${AGENCY_B.project.id}/activate`, { method: 'POST' }),
      actionCtxFor(AGENCY_B.project.id, 'activate')
    );
    const unknown = await lifecycleAction(
      requestFor('/api/agency/projects/no-such-project/activate', { method: 'POST' }),
      actionCtxFor('no-such-project', 'activate')
    );
    expect(crossTenant.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(await crossTenant.json()).toEqual(await unknown.json());
    expect(mockUpdateProject).not.toHaveBeenCalled();
  });
});

describe('Module 3.9 security — cross-tenant manager reference (§81/§113)', () => {
  it('a cross-tenant manager id is rejected EXACTLY like a missing one', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetClientById.mockResolvedValue(clientFor(AGENCY_A.tenant.id));
    // getUserById is not tenant-scoped — the domain integrity check is the gate
    mockGetUserById.mockImplementation(async (id) =>
      id === AGENCY_B.admin.userId ? userFor(AGENCY_B.tenant.id, { _id: AGENCY_B.admin.userId }) : null);

    const payload = {
      clientId: AGENCY_A.client.id, name: 'Evil Project',
      billingModel: 'FIXED_FEE', currency: 'INR',
    };
    const crossTenant = await createProjectRoute(
      jsonRequest('/api/agency/projects', 'POST', { ...payload, projectManagerId: AGENCY_B.admin.userId })
    );
    const missing = await createProjectRoute(
      jsonRequest('/api/agency/projects', 'POST', { ...payload, projectManagerId: 'no-such-user' })
    );
    expect(crossTenant.status).toBe(400);
    expect(missing.status).toBe(400);
    expect(await crossTenant.json()).toEqual(await missing.json());
    expect(mockCreateProject).not.toHaveBeenCalled();
  });
});

describe('Module 3.9 security — cross-tenant project member (§81/§113)', () => {
  it('adding a cross-tenant user as a member is rejected EXACTLY like a missing one', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetProjectById.mockResolvedValue(projectFor(AGENCY_A.tenant.id));
    mockGetUserById.mockImplementation(async (id) =>
      id === AGENCY_B.admin.userId ? userFor(AGENCY_B.tenant.id, { _id: AGENCY_B.admin.userId }) : null);

    const crossTenant = await addMember(
      jsonRequest(`/api/agency/projects/${AGENCY_A.project.id}/members`, 'POST', { userId: AGENCY_B.admin.userId }),
      ctxFor(AGENCY_A.project.id)
    );
    const missing = await addMember(
      jsonRequest(`/api/agency/projects/${AGENCY_A.project.id}/members`, 'POST', { userId: 'no-such-user' }),
      ctxFor(AGENCY_A.project.id)
    );
    expect(crossTenant.status).toBe(400);
    expect(missing.status).toBe(400);
    expect(await crossTenant.json()).toEqual(await missing.json());
    expect(mockCreateProjectMember).not.toHaveBeenCalled();
  });
});

// ---------- gates (same contract as Module 2.8) ----------

describe('Module 3.9 — authentication, vertical and authorization gates', () => {
  it('401s when unauthenticated', async () => {
    mockSession.mockResolvedValue(null);
    const res = await listProjects(requestFor('/api/agency/projects'));
    expect(res.status).toBe(401);
  });

  it('403s with NOT_AGENCY_TENANT for a Standard tenant', async () => {
    arrange(STANDARD_TENANT.tenant.id, 'Standard');
    const res = await listProjects(requestFor('/api/agency/projects'));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('NOT_AGENCY_TENANT');
  });

  it('lets a USER read the project list (§28 reads)', async () => {
    arrange(AGENCY_A.tenant.id, 'Agency', 'USER');
    mockGetProjects.mockResolvedValue([]);
    const res = await listProjects(requestFor('/api/agency/projects'));
    expect(res.status).toBe(200);
  });

  it('403s a USER creating a project (§28 writes are admin-only)', async () => {
    arrange(AGENCY_A.tenant.id, 'Agency', 'USER');
    const res = await createProjectRoute(jsonRequest('/api/agency/projects', 'POST', {
      clientId: 'cl-1', name: 'X', billingModel: 'FIXED_FEE', currency: 'INR',
    }));
    expect(res.status).toBe(403);
    expect(mockCreateProject).not.toHaveBeenCalled();
  });

  it('403s a USER activating a project', async () => {
    arrange(AGENCY_A.tenant.id, 'Agency', 'USER');
    const res = await lifecycleAction(
      requestFor(`/api/agency/projects/${AGENCY_A.project.id}/activate`, { method: 'POST' }),
      actionCtxFor(AGENCY_A.project.id, 'activate')
    );
    expect(res.status).toBe(403);
    expect(mockUpdateProject).not.toHaveBeenCalled();
  });
});

// ---------- Step 3.10 final-audit behaviors (§69/§111/§115) ----------

describe('Module 3 final audit — project-code uniqueness (§111)', () => {
  it('409s when creating a project with an already-used code', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetClientById.mockResolvedValue(clientFor(AGENCY_A.tenant.id));
    mockFindProjectByCode.mockResolvedValue(projectFor(AGENCY_A.tenant.id, { name: 'Other Project', code: 'ACME-WEB-001' }));

    const res = await createProjectRoute(jsonRequest('/api/agency/projects', 'POST', {
      clientId: AGENCY_A.client.id, name: 'Website Redesign',
      billingModel: 'FIXED_FEE', currency: 'INR', code: 'acme-web-001',
    }));
    expect(res.status).toBe(409);
    const body = await res.json();
    // The error names the clashing project — the probe is tenant-scoped, so
    // no cross-tenant information can leak through it.
    expect(body.error).toContain('already used');
    expect(mockCreateProject).not.toHaveBeenCalled();
  });

  it('409s when PATCH sets a code that another project already uses', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetProjectById.mockResolvedValue(projectFor(AGENCY_A.tenant.id)); // codeless draft
    mockFindProjectByCode.mockResolvedValue(projectFor(AGENCY_A.tenant.id, { name: 'Other Project', code: 'ACME-WEB-001' }));

    const res = await patchProject(
      jsonRequest(`/api/agency/projects/${AGENCY_A.project.id}`, 'PATCH', { code: 'ACME-WEB-001' }),
      ctxFor(AGENCY_A.project.id)
    );
    expect(res.status).toBe(409);
    expect(mockUpdateProject).not.toHaveBeenCalled();
  });

  it('lets a codeless draft take a free code, probing with its own id excluded', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetProjectById.mockResolvedValueOnce(projectFor(AGENCY_A.tenant.id)); // codeless draft
    mockFindProjectByCode.mockResolvedValue(null); // free
    mockUpdateProject.mockResolvedValue(true);
    mockGetProjectById.mockResolvedValue(projectFor(AGENCY_A.tenant.id, { code: 'ACME-WEB-001' }));

    const res = await patchProject(
      jsonRequest(`/api/agency/projects/${AGENCY_A.project.id}`, 'PATCH', { code: 'ACME-WEB-001' }),
      ctxFor(AGENCY_A.project.id)
    );
    expect(res.status).toBe(200);
    expect(mockFindProjectByCode).toHaveBeenCalledWith(AGENCY_A.tenant.id, 'ACME-WEB-001', AGENCY_A.project.id);
  });
});

describe('Module 3 final audit — §115 milestone allocation warning at activation', () => {
  it('activates but warns when percentage milestones total ≠ 100', async () => {
    arrange(AGENCY_A.tenant.id);
    const draft = projectFor(AGENCY_A.tenant.id, { status: 'DRAFT', billingModel: 'MILESTONE' });
    mockGetProjectById.mockResolvedValueOnce(draft);
    mockGetProjectMilestones.mockResolvedValue([
      { id: 'm1', status: 'PLANNED', percentage: 40 } as never,
      { id: 'm2', status: 'PLANNED', percentage: 20 } as never,
    ]);
    mockUpdateProject.mockResolvedValue(true);
    mockGetProjectById.mockResolvedValueOnce({ ...draft, status: 'ACTIVE' });

    const res = await lifecycleAction(
      requestFor(`/api/agency/projects/${draft.id}/activate`, { method: 'POST' }),
      actionCtxFor(draft.id, 'activate')
    );
    expect(res.status).toBe(200); // advisory, never a block
    const body = await res.json();
    expect(body.warnings.join(' ')).toContain('60%');
    expect(body.warnings.join(' ')).toContain('100%');
  });

  it('no allocation warning when percentages total exactly 100, or milestones are amount-based', async () => {
    arrange(AGENCY_A.tenant.id);
    const draft = projectFor(AGENCY_A.tenant.id, { status: 'DRAFT', billingModel: 'MILESTONE' });
    mockGetProjectById.mockResolvedValueOnce(draft);
    mockGetProjectMilestones.mockResolvedValue([
      { id: 'm1', status: 'PLANNED', percentage: 60 } as never,
      { id: 'm2', status: 'PLANNED', percentage: 40 } as never,
    ]);
    mockUpdateProject.mockResolvedValue(true);
    mockGetProjectById.mockResolvedValueOnce({ ...draft, status: 'ACTIVE' });

    const res = await lifecycleAction(
      requestFor(`/api/agency/projects/${draft.id}/activate`, { method: 'POST' }),
      actionCtxFor(draft.id, 'activate')
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.warnings || []).toEqual([]);
  });

  it('CANCELLED milestones are excluded from the allocation sum', async () => {
    arrange(AGENCY_A.tenant.id);
    const draft = projectFor(AGENCY_A.tenant.id, { status: 'DRAFT', billingModel: 'MILESTONE' });
    mockGetProjectById.mockResolvedValueOnce(draft);
    mockGetProjectMilestones.mockResolvedValue([
      { id: 'm1', status: 'PLANNED', percentage: 100 } as never,
      { id: 'm2', status: 'CANCELLED', percentage: 50 } as never,
    ]);
    mockUpdateProject.mockResolvedValue(true);
    mockGetProjectById.mockResolvedValueOnce({ ...draft, status: 'ACTIVE' });

    const res = await lifecycleAction(
      requestFor(`/api/agency/projects/${draft.id}/activate`, { method: 'POST' }),
      actionCtxFor(draft.id, 'activate')
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.warnings || []).toEqual([]);
  });
});

describe('Module 3 final audit — list sorting (§69)', () => {
  it('passes a whitelisted sort through to the repository', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetProjects.mockResolvedValue([]);

    const res = await listProjects(requestFor('/api/agency/projects?sort=contractValue&sortDir=desc'));
    expect(res.status).toBe(200);
    expect(mockGetProjects).toHaveBeenCalledWith(
      AGENCY_A.tenant.id,
      expect.objectContaining({ sort: { field: 'contractValue', direction: -1 } }),
      expect.anything()
    );
  });

  it('falls back to the default order for an unknown sort field', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetProjects.mockResolvedValue([]);

    const res = await listProjects(requestFor('/api/agency/projects?sort=password&sortDir=asc'));
    expect(res.status).toBe(200);
    const listOptions = mockGetProjects.mock.calls[0]?.[1];
    expect(listOptions?.sort).toBeUndefined();
  });
});

// ---------- Module 4: lightweight project work items (§9–§27) ----------

describe('Module 4 integration — filtered/searched/sorted list (§24/§25)', () => {
  const LIST_URL = `/api/agency/projects/${AGENCY_A.project.id}/work-items`;

  it('passes status/search/sort through to the repository (§24/§25)', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetProjectById.mockResolvedValue(projectFor(AGENCY_A.tenant.id));
    mockListWorkItems.mockResolvedValue([]);

    const res = await listWorkItemsRoute(
      requestFor(`${LIST_URL}?status=IN_PROGRESS&search=sitemap&sort=estimatedMinutes&sortDir=desc`),
      ctxFor(AGENCY_A.project.id)
    );
    expect(res.status).toBe(200);
    expect(mockListWorkItems).toHaveBeenCalledWith(
      AGENCY_A.tenant.id, AGENCY_A.project.id,
      { search: 'sitemap', sort: { field: 'estimatedMinutes', direction: -1 } },
      { status: 'IN_PROGRESS' }
    );
  });

  it('view=mine resolves the assignee from the SESSION, never the client (§24)', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetProjectById.mockResolvedValue(projectFor(AGENCY_A.tenant.id));
    mockListWorkItems.mockResolvedValue([]);

    const res = await listWorkItemsRoute(
      requestFor(`${LIST_URL}?view=mine`),
      ctxFor(AGENCY_A.project.id)
    );
    expect(res.status).toBe(200);
    expect(mockListWorkItems).toHaveBeenCalledWith(
      AGENCY_A.tenant.id, AGENCY_A.project.id, {}, { assignedTo: `u-${AGENCY_A.tenant.id}` }
    );
  });

  it('view=unassigned and view=all send the matching filters', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetProjectById.mockResolvedValue(projectFor(AGENCY_A.tenant.id));
    mockListWorkItems.mockResolvedValue([]);

    await listWorkItemsRoute(requestFor(`${LIST_URL}?view=unassigned`), ctxFor(AGENCY_A.project.id));
    expect(mockListWorkItems).toHaveBeenLastCalledWith(
      AGENCY_A.tenant.id, AGENCY_A.project.id, {}, { unassigned: true }
    );
    await listWorkItemsRoute(requestFor(`${LIST_URL}?view=all`), ctxFor(AGENCY_A.project.id));
    expect(mockListWorkItems).toHaveBeenLastCalledWith(AGENCY_A.tenant.id, AGENCY_A.project.id, {}, {});
  });

  it('an unknown sort field silently falls back to the default order (§25)', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetProjectById.mockResolvedValue(projectFor(AGENCY_A.tenant.id));
    mockListWorkItems.mockResolvedValue([]);

    const res = await listWorkItemsRoute(
      requestFor(`${LIST_URL}?sort=passwordHash&sortDir=desc`),
      ctxFor(AGENCY_A.project.id)
    );
    expect(res.status).toBe(200);
    const options = mockListWorkItems.mock.calls[0]?.[2];
    expect(options?.sort).toBeUndefined();
  });

  it('resolves assignee usernames — ids never reach the UI raw (§20)', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetProjectById.mockResolvedValue(projectFor(AGENCY_A.tenant.id));
    mockListWorkItems.mockResolvedValue([
      workItemFor(AGENCY_A.tenant.id, { assignedTo: AGENCY_A.member.userId }),
      workItemFor(AGENCY_A.tenant.id, { id: 'wi-2', name: 'Wireframes', assignedTo: '' }),
    ]);
    mockGetUserById.mockResolvedValue(userFor(AGENCY_A.tenant.id, { _id: AGENCY_A.member.userId, username: 'agency_a_dev', role: 'USER' }));

    const res = await listWorkItemsRoute(requestFor(LIST_URL), ctxFor(AGENCY_A.project.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.workItems).toHaveLength(2);
    expect(body.userLabels[AGENCY_A.member.userId]).toBe('agency_a_dev');
    // A single lookup for the single distinct assignee — no fan-out per row
    expect(mockGetUserById).toHaveBeenCalledTimes(1);
  });

  it('404s when the project does not resolve for this tenant (§15)', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetProjectById.mockResolvedValue(null);

    const res = await listWorkItemsRoute(requestFor(LIST_URL), ctxFor(AGENCY_A.project.id));
    expect(res.status).toBe(404);
    expect(mockListWorkItems).not.toHaveBeenCalled();
  });
});

describe('Module 4 integration — single work item read (§16/§113)', () => {
  const itemId = 'wi-a100000000000000000000a';

  it('returns the item with its assignee label', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetWorkItemById.mockResolvedValue(workItemFor(AGENCY_A.tenant.id, { assignedTo: AGENCY_A.member.userId }));
    mockGetUserById.mockResolvedValue(userFor(AGENCY_A.tenant.id, { _id: AGENCY_A.member.userId, username: 'agency_a_dev', role: 'USER' }));

    const res = await getWorkItemRoute(
      requestFor(`/api/agency/projects/${AGENCY_A.project.id}/work-items/${itemId}`),
      itemCtxFor(AGENCY_A.project.id, itemId)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.workItem.name).toBe('Sitemap');
    expect(body.workItem.estimatedMinutes).toBe(480);
    expect(body.userLabels[AGENCY_A.member.userId]).toBe('agency_a_dev');
  });

  it("A's session asking for B's work item gets the IDENTICAL 404 as an unknown id (§113)", async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetWorkItemById.mockImplementation(async (id, _projectId, tenantId) =>
      tenantId === AGENCY_B.tenant.id ? workItemFor(AGENCY_B.tenant.id) : null);

    const crossTenant = await getWorkItemRoute(
      requestFor(`/api/agency/projects/${AGENCY_A.project.id}/work-items/wi-b`),
      itemCtxFor(AGENCY_A.project.id, 'wi-b')
    );
    const unknown = await getWorkItemRoute(
      requestFor(`/api/agency/projects/${AGENCY_A.project.id}/work-items/wi-nope`),
      itemCtxFor(AGENCY_A.project.id, 'wi-nope')
    );
    expect(crossTenant.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(await crossTenant.json()).toEqual(await unknown.json());
    // The lookup used the SESSION tenant
    expect(mockGetWorkItemById).toHaveBeenCalledWith('wi-b', AGENCY_A.project.id, AGENCY_A.tenant.id);
  });
});

describe('Module 4 integration — create (§8/§9/§17/§26)', () => {
  it('stores minutes, appends the sort order and stamps createdBy from the session', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetProjectById.mockResolvedValue(projectFor(AGENCY_A.tenant.id));
    mockGetNextWorkItemSortOrder.mockResolvedValue(7);
    mockCreateWorkItem.mockResolvedValue(workItemFor(AGENCY_A.tenant.id, { sortOrder: 7 }));

    const res = await createWorkItemRoute(
      jsonRequest(`/api/agency/projects/${AGENCY_A.project.id}/work-items`, 'POST', {
        name: 'Sitemap', estimatedMinutes: 90,
      }),
      ctxFor(AGENCY_A.project.id)
    );
    expect(res.status).toBe(201);
    expect(mockCreateWorkItem).toHaveBeenCalledWith(
      AGENCY_A.tenant.id, AGENCY_A.project.id,
      expect.objectContaining({
        name: 'Sitemap', estimatedMinutes: 90, sortOrder: 7,
        createdBy: `u-${AGENCY_A.tenant.id}`,
      })
    );
    expect(mockCreateLog).toHaveBeenCalledWith(
      expect.anything(), 'WORK_ITEM_CREATED', expect.anything(), AGENCY_A.tenant.id, expect.anything()
    );
  });

  it('an initial assignment is integrity-checked and double-audited (§15/§26)', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetProjectById.mockResolvedValue(projectFor(AGENCY_A.tenant.id));
    mockGetUserById.mockResolvedValue(userFor(AGENCY_A.tenant.id, { _id: AGENCY_A.member.userId, role: 'USER' }));
    mockCreateWorkItem.mockResolvedValue(workItemFor(AGENCY_A.tenant.id, { assignedTo: AGENCY_A.member.userId }));

    const res = await createWorkItemRoute(
      jsonRequest(`/api/agency/projects/${AGENCY_A.project.id}/work-items`, 'POST', {
        name: 'Sitemap', assignedTo: AGENCY_A.member.userId,
      }),
      ctxFor(AGENCY_A.project.id)
    );
    expect(res.status).toBe(201);
    const actions = mockCreateLog.mock.calls.map(c => c[1]);
    expect(actions).toContain('WORK_ITEM_CREATED');
    expect(actions).toContain('WORK_ITEM_ASSIGNED');
  });

  it('accepts the legacy decimal-hours input but stores minutes (§9)', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetProjectById.mockResolvedValue(projectFor(AGENCY_A.tenant.id));
    mockCreateWorkItem.mockResolvedValue(workItemFor(AGENCY_A.tenant.id, { estimatedMinutes: 480 }));

    const res = await createWorkItemRoute(
      jsonRequest(`/api/agency/projects/${AGENCY_A.project.id}/work-items`, 'POST', {
        name: 'Sitemap', estimatedHours: 8,
      }),
      ctxFor(AGENCY_A.project.id)
    );
    expect(res.status).toBe(201);
    const repoInput = mockCreateWorkItem.mock.calls[0]?.[2];
    expect(repoInput).toEqual(expect.objectContaining({ estimatedMinutes: 480 }));
    expect(repoInput).not.toHaveProperty('estimatedHours');
  });
});

describe('Module 4 integration — PATCH actions (§11/§12/§17/§26)', () => {
  const itemId = 'wi-a100000000000000000000a';

  function arrangeItem(item: WorkItem, updated?: WorkItem) {
    arrange(AGENCY_A.tenant.id);
    mockGetWorkItemById.mockResolvedValueOnce(item);
    if (updated) mockGetWorkItemById.mockResolvedValueOnce(updated);
    mockUpdateWorkItem.mockResolvedValue(true);
  }

  it('?action=status moves NOT_STARTED → IN_PROGRESS and audits the change', async () => {
    const item = workItemFor(AGENCY_A.tenant.id, { status: 'NOT_STARTED' });
    arrangeItem(item, { ...item, status: 'IN_PROGRESS' });

    const res = await patchWorkItemRoute(
      jsonRequest(`/api/agency/projects/${AGENCY_A.project.id}/work-items/${itemId}?action=status`, 'PATCH', { status: 'IN_PROGRESS' }),
      itemCtxFor(AGENCY_A.project.id, itemId)
    );
    expect(res.status).toBe(200);
    expect(mockUpdateWorkItem).toHaveBeenCalledWith(
      itemId, AGENCY_A.project.id, AGENCY_A.tenant.id, { status: 'IN_PROGRESS' }
    );
    expect(mockCreateLog).toHaveBeenCalledWith(
      expect.anything(), 'WORK_ITEM_STATUS_CHANGED', expect.stringContaining('IN_PROGRESS'), AGENCY_A.tenant.id, expect.anything()
    );
  });

  it('?action=status rejects the NOT_STARTED → DONE skip (§11)', async () => {
    arrangeItem(workItemFor(AGENCY_A.tenant.id, { status: 'NOT_STARTED' }));

    const res = await patchWorkItemRoute(
      jsonRequest(`/api/agency/projects/${AGENCY_A.project.id}/work-items/${itemId}?action=status`, 'PATCH', { status: 'DONE' }),
      itemCtxFor(AGENCY_A.project.id, itemId)
    );
    expect(res.status).toBe(400);
    expect(mockUpdateWorkItem).not.toHaveBeenCalled();
  });

  it('?action=status reopens DONE → IN_PROGRESS (client changes, §11)', async () => {
    const item = workItemFor(AGENCY_A.tenant.id, { status: 'DONE' });
    arrangeItem(item, { ...item, status: 'IN_PROGRESS' });

    const res = await patchWorkItemRoute(
      jsonRequest(`/api/agency/projects/${AGENCY_A.project.id}/work-items/${itemId}?action=status`, 'PATCH', { status: 'IN_PROGRESS' }),
      itemCtxFor(AGENCY_A.project.id, itemId)
    );
    expect(res.status).toBe(200);
    expect(mockUpdateWorkItem).toHaveBeenCalledWith(
      itemId, AGENCY_A.project.id, AGENCY_A.tenant.id, { status: 'IN_PROGRESS' }
    );
  });

  it('?action=status can NEVER archive — that is the dedicated action (§16)', async () => {
    arrangeItem(workItemFor(AGENCY_A.tenant.id, { status: 'IN_PROGRESS' }));

    const res = await patchWorkItemRoute(
      jsonRequest(`/api/agency/projects/${AGENCY_A.project.id}/work-items/${itemId}?action=status`, 'PATCH', { status: 'ARCHIVED' }),
      itemCtxFor(AGENCY_A.project.id, itemId)
    );
    expect(res.status).toBe(400);
    expect(mockUpdateWorkItem).not.toHaveBeenCalled();
  });

  it('?action=assign sets the single primary assignee (§12)', async () => {
    const item = workItemFor(AGENCY_A.tenant.id, { assignedTo: '' });
    arrangeItem(item, { ...item, assignedTo: AGENCY_A.member.userId });
    mockGetUserById.mockResolvedValue(userFor(AGENCY_A.tenant.id, { _id: AGENCY_A.member.userId, role: 'USER' }));

    const res = await patchWorkItemRoute(
      jsonRequest(`/api/agency/projects/${AGENCY_A.project.id}/work-items/${itemId}?action=assign`, 'PATCH', { userId: AGENCY_A.member.userId }),
      itemCtxFor(AGENCY_A.project.id, itemId)
    );
    expect(res.status).toBe(200);
    expect(mockUpdateWorkItem).toHaveBeenCalledWith(
      itemId, AGENCY_A.project.id, AGENCY_A.tenant.id, { assignedTo: AGENCY_A.member.userId }
    );
    expect(mockCreateLog).toHaveBeenCalledWith(
      expect.anything(), 'WORK_ITEM_ASSIGNED', expect.anything(), AGENCY_A.tenant.id, expect.anything()
    );
  });

  it('?action=assign is 409 when the user is already the assignee', async () => {
    arrangeItem(workItemFor(AGENCY_A.tenant.id, { assignedTo: AGENCY_A.member.userId }));
    mockGetUserById.mockResolvedValue(userFor(AGENCY_A.tenant.id, { _id: AGENCY_A.member.userId, role: 'USER' }));

    const res = await patchWorkItemRoute(
      jsonRequest(`/api/agency/projects/${AGENCY_A.project.id}/work-items/${itemId}?action=assign`, 'PATCH', { userId: AGENCY_A.member.userId }),
      itemCtxFor(AGENCY_A.project.id, itemId)
    );
    expect(res.status).toBe(409);
    expect(mockUpdateWorkItem).not.toHaveBeenCalled();
  });

  it('?action=unassign clears the assignment and audits it (§26)', async () => {
    const item = workItemFor(AGENCY_A.tenant.id, { assignedTo: AGENCY_A.member.userId });
    arrangeItem(item, { ...item, assignedTo: '' });

    const res = await patchWorkItemRoute(
      jsonRequest(`/api/agency/projects/${AGENCY_A.project.id}/work-items/${itemId}?action=unassign`, 'PATCH', {}),
      itemCtxFor(AGENCY_A.project.id, itemId)
    );
    expect(res.status).toBe(200);
    expect(mockUpdateWorkItem).toHaveBeenCalledWith(
      itemId, AGENCY_A.project.id, AGENCY_A.tenant.id, { assignedTo: '' }
    );
    expect(mockCreateLog).toHaveBeenCalledWith(
      expect.anything(), 'WORK_ITEM_UNASSIGNED', expect.anything(), AGENCY_A.tenant.id, expect.anything()
    );
  });

  it('a plain PATCH renames and updates the estimate, keeping createdBy immutable', async () => {
    const item = workItemFor(AGENCY_A.tenant.id);
    arrangeItem(item, { ...item, name: 'Sitemap v2', estimatedMinutes: 600 });

    const res = await patchWorkItemRoute(
      jsonRequest(`/api/agency/projects/${AGENCY_A.project.id}/work-items/${itemId}`, 'PATCH', {
        name: 'Sitemap v2', estimatedMinutes: 600, createdBy: 'attacker',
      }),
      itemCtxFor(AGENCY_A.project.id, itemId)
    );
    expect(res.status).toBe(200);
    expect(mockUpdateWorkItem).toHaveBeenCalledWith(
      itemId, AGENCY_A.project.id, AGENCY_A.tenant.id,
      expect.not.objectContaining({ createdBy: expect.anything() })
    );
    expect(mockCreateLog).toHaveBeenCalledWith(
      expect.anything(), 'WORK_ITEM_UPDATED', expect.anything(), AGENCY_A.tenant.id, expect.anything()
    );
  });

  it('a plain PATCH with assignedTo: "" unassigns and audits WORK_ITEM_UNASSIGNED (§16/§26)', async () => {
    // Regression (Module 4 final audit): the validator used to strip '' to
    // "absent", so this PATCH silently did nothing.
    const item = workItemFor(AGENCY_A.tenant.id, { assignedTo: AGENCY_A.member.userId });
    arrangeItem(item, { ...item, assignedTo: '' });

    const res = await patchWorkItemRoute(
      jsonRequest(`/api/agency/projects/${AGENCY_A.project.id}/work-items/${itemId}`, 'PATCH', {
        assignedTo: '',
      }),
      itemCtxFor(AGENCY_A.project.id, itemId)
    );
    expect(res.status).toBe(200);
    expect(mockUpdateWorkItem).toHaveBeenCalledWith(
      itemId, AGENCY_A.project.id, AGENCY_A.tenant.id, { assignedTo: '' }
    );
    expect(mockCreateLog).toHaveBeenCalledWith(
      expect.anything(), 'WORK_ITEM_UNASSIGNED', expect.anything(), AGENCY_A.tenant.id, expect.anything()
    );
  });

  it('the Unassigned filter matches an explicit empty assignee, not only a missing field (§24)', async () => {
    // Regression (Module 4 final audit): Mongo {assignedTo: null} does not
    // match '' — a just-unassigned item vanished from the Unassigned view.
    arrange(AGENCY_A.tenant.id);
    mockGetProjectById.mockResolvedValue(projectFor(AGENCY_A.tenant.id));
    mockListWorkItems.mockResolvedValue([
      workItemFor(AGENCY_A.tenant.id, { assignedTo: '' }),
      workItemFor(AGENCY_A.tenant.id, { name: 'Other' }),
    ]);

    const res = await listWorkItemsRoute(
      requestFor(`/api/agency/projects/${AGENCY_A.project.id}/work-items?view=unassigned`),
      ctxFor(AGENCY_A.project.id)
    );
    expect(res.status).toBe(200);
    // The filter handed to the repository must cover BOTH shapes.
    expect(mockListWorkItems).toHaveBeenCalledWith(
      AGENCY_A.tenant.id, AGENCY_A.project.id,
      expect.anything(),
      expect.objectContaining({ unassigned: true })
    );
  });
});

describe('Module 4 integration — archive (§11/§16/§26)', () => {
  const itemId = 'wi-a100000000000000000000a';

  it('archives from IN_PROGRESS, leaving history resolvable (no DELETE exists)', async () => {
    const item = workItemFor(AGENCY_A.tenant.id, { status: 'IN_PROGRESS' });
    arrange(AGENCY_A.tenant.id);
    mockGetWorkItemById.mockResolvedValueOnce(item);
    mockGetWorkItemById.mockResolvedValueOnce({ ...item, status: 'ARCHIVED' });
    mockUpdateWorkItem.mockResolvedValue(true);

    const res = await archiveWorkItemRoute(
      requestFor(`/api/agency/projects/${AGENCY_A.project.id}/work-items/${itemId}/archive`, { method: 'POST' }),
      itemCtxFor(AGENCY_A.project.id, itemId)
    );
    expect(res.status).toBe(200);
    expect(mockUpdateWorkItem).toHaveBeenCalledWith(
      itemId, AGENCY_A.project.id, AGENCY_A.tenant.id, { status: 'ARCHIVED' }
    );
    expect(mockCreateLog).toHaveBeenCalledWith(
      expect.anything(), 'WORK_ITEM_ARCHIVED', expect.anything(), AGENCY_A.tenant.id, expect.anything()
    );
  });

  it('re-archiving is 400 — ARCHIVED is terminal (§11)', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetWorkItemById.mockResolvedValue(workItemFor(AGENCY_A.tenant.id, { status: 'ARCHIVED' }));

    const res = await archiveWorkItemRoute(
      requestFor(`/api/agency/projects/${AGENCY_A.project.id}/work-items/${itemId}/archive`, { method: 'POST' }),
      itemCtxFor(AGENCY_A.project.id, itemId)
    );
    expect(res.status).toBe(400);
    expect(mockUpdateWorkItem).not.toHaveBeenCalled();
  });

  it("A's archive probe against B's work item is the IDENTICAL 404 as unknown (§113)", async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetWorkItemById.mockImplementation(async (id, _projectId, tenantId) =>
      tenantId === AGENCY_B.tenant.id ? workItemFor(AGENCY_B.tenant.id) : null);

    const crossTenant = await archiveWorkItemRoute(
      requestFor(`/api/agency/projects/${AGENCY_A.project.id}/work-items/wi-b/archive`, { method: 'POST' }),
      itemCtxFor(AGENCY_A.project.id, 'wi-b')
    );
    const unknown = await archiveWorkItemRoute(
      requestFor(`/api/agency/projects/${AGENCY_A.project.id}/work-items/wi-nope/archive`, { method: 'POST' }),
      itemCtxFor(AGENCY_A.project.id, 'wi-nope')
    );
    expect(crossTenant.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(await crossTenant.json()).toEqual(await unknown.json());
    expect(mockUpdateWorkItem).not.toHaveBeenCalled();
  });
});

describe('Module 4 security — cross-tenant assignee (§15/§113)', () => {
  const itemId = 'wi-a100000000000000000000a';

  it('assigning a cross-tenant user is rejected EXACTLY like a missing one', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetWorkItemById.mockResolvedValue(workItemFor(AGENCY_A.tenant.id, { assignedTo: '' }));
    // getUserById is not tenant-scoped — the domain integrity check is the gate
    mockGetUserById.mockImplementation(async (id) =>
      id === AGENCY_B.admin.userId ? userFor(AGENCY_B.tenant.id, { _id: AGENCY_B.admin.userId }) : null);

    const crossTenant = await patchWorkItemRoute(
      jsonRequest(`/api/agency/projects/${AGENCY_A.project.id}/work-items/${itemId}?action=assign`, 'PATCH', { userId: AGENCY_B.admin.userId }),
      itemCtxFor(AGENCY_A.project.id, itemId)
    );
    const missing = await patchWorkItemRoute(
      jsonRequest(`/api/agency/projects/${AGENCY_A.project.id}/work-items/${itemId}?action=assign`, 'PATCH', { userId: 'no-such-user' }),
      itemCtxFor(AGENCY_A.project.id, itemId)
    );
    expect(crossTenant.status).toBe(400);
    expect(missing.status).toBe(400);
    expect(await crossTenant.json()).toEqual(await missing.json());
    expect(mockUpdateWorkItem).not.toHaveBeenCalled();
  });
});

describe('Module 4 — authorization gates (§28: admin writes, user reads)', () => {
  const itemId = 'wi-a100000000000000000000a';

  it('lets a USER read the work-item list', async () => {
    arrange(AGENCY_A.tenant.id, 'Agency', 'USER');
    mockGetProjectById.mockResolvedValue(projectFor(AGENCY_A.tenant.id));
    mockListWorkItems.mockResolvedValue([]);

    const res = await listWorkItemsRoute(
      requestFor(`/api/agency/projects/${AGENCY_A.project.id}/work-items`),
      ctxFor(AGENCY_A.project.id)
    );
    expect(res.status).toBe(200);
  });

  it('403s a USER creating a work item', async () => {
    arrange(AGENCY_A.tenant.id, 'Agency', 'USER');
    const res = await createWorkItemRoute(
      jsonRequest(`/api/agency/projects/${AGENCY_A.project.id}/work-items`, 'POST', { name: 'X' }),
      ctxFor(AGENCY_A.project.id)
    );
    expect(res.status).toBe(403);
    expect(mockCreateWorkItem).not.toHaveBeenCalled();
  });

  it('403s a USER changing status and archiving', async () => {
    arrange(AGENCY_A.tenant.id, 'Agency', 'USER');
    const patch = await patchWorkItemRoute(
      jsonRequest(`/api/agency/projects/${AGENCY_A.project.id}/work-items/${itemId}?action=status`, 'PATCH', { status: 'IN_PROGRESS' }),
      itemCtxFor(AGENCY_A.project.id, itemId)
    );
    const archive = await archiveWorkItemRoute(
      requestFor(`/api/agency/projects/${AGENCY_A.project.id}/work-items/${itemId}/archive`, { method: 'POST' }),
      itemCtxFor(AGENCY_A.project.id, itemId)
    );
    expect(patch.status).toBe(403);
    expect(archive.status).toBe(403);
    expect(mockUpdateWorkItem).not.toHaveBeenCalled();
  });
});

// ---------- Module 5: project team (§30–§49) ----------

describe('Module 5 integration — member list (§47/§42)', () => {
  it('lists ACTIVE memberships by default and resolves display usernames', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetProjectById.mockResolvedValue(projectFor(AGENCY_A.tenant.id));
    mockGetProjectMembers.mockResolvedValue([
      memberFor(AGENCY_A.tenant.id, { id: 'pm-1', userId: AGENCY_A.member.userId }),
    ]);
    mockGetUserById.mockResolvedValue(userFor(AGENCY_A.tenant.id, { _id: AGENCY_A.member.userId, username: 'dev_one' }));

    const res = await listMembersRoute(
      requestFor(`/api/agency/projects/${AGENCY_A.project.id}/members`),
      ctxFor(AGENCY_A.project.id)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.members).toHaveLength(1);
    expect(body.userLabels[AGENCY_A.member.userId]).toBe('dev_one');
    // Default is the §42 team view — the repository decides active-only.
    expect(mockGetProjectMembers).toHaveBeenCalledWith(
      AGENCY_A.project.id, AGENCY_A.tenant.id, { includeInactive: false }
    );
  });

  it('?includeInactive=true surfaces removed history (§37)', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetProjectById.mockResolvedValue(projectFor(AGENCY_A.tenant.id));
    mockGetProjectMembers.mockResolvedValue([]);

    const res = await listMembersRoute(
      requestFor(`/api/agency/projects/${AGENCY_A.project.id}/members?includeInactive=true`),
      ctxFor(AGENCY_A.project.id)
    );
    expect(res.status).toBe(200);
    expect(mockGetProjectMembers).toHaveBeenCalledWith(
      AGENCY_A.project.id, AGENCY_A.tenant.id, { includeInactive: true }
    );
  });
});

describe('Module 5 integration — add member (§44/§40/§35)', () => {
  it('re-adds a previously removed member as a fresh row (§37/§40)', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetProjectById.mockResolvedValue(projectFor(AGENCY_A.tenant.id));
    mockGetUserById.mockResolvedValue(userFor(AGENCY_A.tenant.id, { _id: AGENCY_A.member.userId, role: 'USER' }));
    // The repository contract: the DEFAULT (§42 team view) call returns only
    // ACTIVE rows — the removed membership must not trip the §40 dup check.
    const history = [memberFor(AGENCY_A.tenant.id, { id: 'pm-old', userId: AGENCY_A.member.userId, active: false })];
    mockGetProjectMembers.mockImplementation(async (_p: string, _t: string, options?: { includeInactive?: boolean }) =>
      options?.includeInactive ? history : history.filter(m => (m as { active?: boolean }).active !== false));
    mockCreateProjectMember.mockResolvedValue({ id: 'pm-new' } as never);

    const res = await addMember(
      jsonRequest(`/api/agency/projects/${AGENCY_A.project.id}/members`, 'POST', {
        userId: AGENCY_A.member.userId, role: 'Developer', allocationPercent: 60,
      }),
      ctxFor(AGENCY_A.project.id)
    );
    expect(res.status).toBe(201);
    expect(mockCreateProjectMember).toHaveBeenCalledWith(
      AGENCY_A.tenant.id, AGENCY_A.project.id,
      expect.objectContaining({ userId: AGENCY_A.member.userId, allocationPercent: 60 })
    );
  });

  it('rejects allocationPercent of 0 with 400 (§35 — strictly 0 < x <= 100)', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetProjectById.mockResolvedValue(projectFor(AGENCY_A.tenant.id));
    const res = await addMember(
      jsonRequest(`/api/agency/projects/${AGENCY_A.project.id}/members`, 'POST', {
        userId: AGENCY_A.member.userId, allocationPercent: 0,
      }),
      ctxFor(AGENCY_A.project.id)
    );
    expect(res.status).toBe(400);
    expect(mockCreateProjectMember).not.toHaveBeenCalled();
  });

  it('rejects a cross-tenant user with 400 (§38) — tenant validated, not UI-trusted', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetProjectById.mockResolvedValue(projectFor(AGENCY_A.tenant.id));
    mockGetUserById.mockResolvedValue(userFor(AGENCY_B.tenant.id, { _id: AGENCY_A.member.userId }));

    const res = await addMember(
      jsonRequest(`/api/agency/projects/${AGENCY_A.project.id}/members`, 'POST', {
        userId: AGENCY_A.member.userId,
      }),
      ctxFor(AGENCY_A.project.id)
    );
    expect(res.status).toBe(400);
    expect(mockCreateProjectMember).not.toHaveBeenCalled();
  });
  it('a cross-tenant project id is a 404 on the members endpoints — identical to a missing one (§51/§113)', async () => {
    arrange(AGENCY_A.tenant.id);
    // Tenant-scoped read: Agency B's project is simply not found.
    mockGetProjectById.mockResolvedValue(null);

    const get = await listMembersRoute(
      requestFor(`/api/agency/projects/${AGENCY_A.project.id}/members`),
      ctxFor(AGENCY_A.project.id)
    );
    const post = await addMember(
      jsonRequest(`/api/agency/projects/${AGENCY_A.project.id}/members`, 'POST', {
        userId: AGENCY_A.member.userId,
      }),
      ctxFor(AGENCY_A.project.id)
    );
    expect(get.status).toBe(404);
    expect(post.status).toBe(404);
    expect(mockCreateProjectMember).not.toHaveBeenCalled();
  });
});

describe('Module 5 integration — update member (§47 PATCH)', () => {
  it('updates role/allocation and audits the §50 granular events', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetProjectById.mockResolvedValue(projectFor(AGENCY_A.tenant.id));
    mockGetProjectMembers.mockResolvedValue([
      memberFor(AGENCY_A.tenant.id, { id: 'pm-1', userId: AGENCY_A.member.userId }),
    ]);
    mockUpdateProjectMember.mockResolvedValue(true);

    const res = await patchMemberRoute(
      jsonRequest(`/api/agency/projects/${AGENCY_A.project.id}/members/pm-1`, 'PATCH', {
        role: 'Lead Developer', allocationPercent: 40,
      }),
      memberCtxFor(AGENCY_A.project.id, 'pm-1')
    );
    expect(res.status).toBe(200);
    // Identity (userId) never reaches the write; only mutable fields do.
    expect(mockUpdateProjectMember).toHaveBeenCalledWith(
      'pm-1', AGENCY_A.project.id, AGENCY_A.tenant.id,
      { role: 'Lead Developer', allocationPercent: 40 }
    );
    // §50 — role and allocation are distinct audit events.
    expect(mockCreateLog).toHaveBeenCalledWith(
      expect.anything(), 'PROJECT_MEMBER_ROLE_CHANGED', expect.anything(), AGENCY_A.tenant.id, expect.anything()
    );
    expect(mockCreateLog).toHaveBeenCalledWith(
      expect.anything(), 'PROJECT_MEMBER_ALLOCATION_CHANGED', expect.anything(), AGENCY_A.tenant.id, expect.anything()
    );
  });

  it('a date-only PATCH audits the umbrella PROJECT_MEMBER_UPDATED', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetProjectById.mockResolvedValue(projectFor(AGENCY_A.tenant.id));
    mockGetProjectMembers.mockResolvedValue([
      memberFor(AGENCY_A.tenant.id, { id: 'pm-1', userId: AGENCY_A.member.userId }),
    ]);
    mockUpdateProjectMember.mockResolvedValue(true);

    const res = await patchMemberRoute(
      jsonRequest(`/api/agency/projects/${AGENCY_A.project.id}/members/pm-1`, 'PATCH', {
        startDate: '2026-09-15', endDate: '2026-12-15',
      }),
      memberCtxFor(AGENCY_A.project.id, 'pm-1')
    );
    expect(res.status).toBe(200);
    expect(mockCreateLog).toHaveBeenCalledWith(
      expect.anything(), 'PROJECT_MEMBER_UPDATED', expect.anything(), AGENCY_A.tenant.id, expect.anything()
    );
  });

  it('an idempotent PATCH is a 200, never a phantom 404 (final-audit regression)', async () => {
    // The repository signals existence (matchedCount), not modification —
    // resending the SAME values must not "lose" the row.
    arrange(AGENCY_A.tenant.id);
    mockGetProjectById.mockResolvedValue(projectFor(AGENCY_A.tenant.id));
    mockGetProjectMembers.mockResolvedValue([
      memberFor(AGENCY_A.tenant.id, { id: 'pm-1', userId: AGENCY_A.member.userId, role: 'Designer', allocationPercent: 80 }),
    ]);
    mockUpdateProjectMember.mockResolvedValue(true);

    const res = await patchMemberRoute(
      jsonRequest(`/api/agency/projects/${AGENCY_A.project.id}/members/pm-1`, 'PATCH', {
        role: 'Designer', allocationPercent: 80,
      }),
      memberCtxFor(AGENCY_A.project.id, 'pm-1')
    );
    expect(res.status).toBe(200);
  });

  it('a PATCH that carries no meaningful field is an honest 400', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetProjectById.mockResolvedValue(projectFor(AGENCY_A.tenant.id));
    mockGetProjectMembers.mockResolvedValue([
      memberFor(AGENCY_A.tenant.id, { id: 'pm-1', userId: AGENCY_A.member.userId }),
    ]);

    const res = await patchMemberRoute(
      jsonRequest(`/api/agency/projects/${AGENCY_A.project.id}/members/pm-1`, 'PATCH', {}),
      memberCtxFor(AGENCY_A.project.id, 'pm-1')
    );
    expect(res.status).toBe(400);
    expect(mockUpdateProjectMember).not.toHaveBeenCalled();
  });

  it('refuses to edit a removed membership (§37 — history is immutable)', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetProjectById.mockResolvedValue(projectFor(AGENCY_A.tenant.id));
    mockGetProjectMembers.mockResolvedValue([
      memberFor(AGENCY_A.tenant.id, { id: 'pm-1', active: false }),
    ]);

    const res = await patchMemberRoute(
      jsonRequest(`/api/agency/projects/${AGENCY_A.project.id}/members/pm-1`, 'PATCH', { role: 'X' }),
      memberCtxFor(AGENCY_A.project.id, 'pm-1')
    );
    expect(res.status).toBe(400);
    expect(mockUpdateProjectMember).not.toHaveBeenCalled();
  });

  it('a membership from another tenant is simply not found — 404, no leak (§113)', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetProjectById.mockResolvedValue(projectFor(AGENCY_A.tenant.id));
    // Tenant-scoped read: the foreign row never appears, so a cross-tenant
    // memberId and a missing one are INDISTINGUISHABLE.
    mockGetProjectMembers.mockResolvedValue([]);

    const res = await patchMemberRoute(
      jsonRequest(`/api/agency/projects/${AGENCY_A.project.id}/members/pm-foreign`, 'PATCH', { role: 'X' }),
      memberCtxFor(AGENCY_A.project.id, 'pm-foreign')
    );
    expect(res.status).toBe(404);
    expect(mockUpdateProjectMember).not.toHaveBeenCalled();
  });
});

describe('Module 5 integration — remove member (§45/§47)', () => {
  it('POST /remove soft-deactivates, keeps history and audits PROJECT_MEMBER_REMOVED', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetProjectById.mockResolvedValue(projectFor(AGENCY_A.tenant.id));
    mockGetProjectMembers.mockResolvedValue([
      memberFor(AGENCY_A.tenant.id, { id: 'pm-1', userId: AGENCY_A.member.userId }),
    ]);
    mockRemoveProjectMember.mockResolvedValue(true);

    const res = await removeMemberRoute(
      requestFor(`/api/agency/projects/${AGENCY_A.project.id}/members/pm-1/remove`, { method: 'POST' }),
      memberCtxFor(AGENCY_A.project.id, 'pm-1')
    );
    expect(res.status).toBe(200);
    expect(mockRemoveProjectMember).toHaveBeenCalledWith('pm-1', AGENCY_A.project.id, AGENCY_A.tenant.id);
    expect(mockCreateLog).toHaveBeenCalledWith(
      expect.anything(), 'PROJECT_MEMBER_REMOVED',
      expect.stringContaining('kept as history'), AGENCY_A.tenant.id, expect.anything()
    );
  });

  it('double-removal is a 400 — the row already carries active=false', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetProjectById.mockResolvedValue(projectFor(AGENCY_A.tenant.id));
    mockGetProjectMembers.mockResolvedValue([
      memberFor(AGENCY_A.tenant.id, { id: 'pm-1', active: false }),
    ]);

    const res = await removeMemberRoute(
      requestFor(`/api/agency/projects/${AGENCY_A.project.id}/members/pm-1/remove`, { method: 'POST' }),
      memberCtxFor(AGENCY_A.project.id, 'pm-1')
    );
    expect(res.status).toBe(400);
    expect(mockRemoveProjectMember).not.toHaveBeenCalled();
  });

  it('DELETE is the legacy alias for the same soft removal (§47)', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetProjectById.mockResolvedValue(projectFor(AGENCY_A.tenant.id));
    mockGetProjectMembers.mockResolvedValue([
      memberFor(AGENCY_A.tenant.id, { id: 'pm-1' }),
    ]);
    mockRemoveProjectMember.mockResolvedValue(true);

    const res = await deleteMemberRoute(
      requestFor(`/api/agency/projects/${AGENCY_A.project.id}/members/pm-1`, { method: 'DELETE' }),
      memberCtxFor(AGENCY_A.project.id, 'pm-1')
    );
    expect(res.status).toBe(200);
    expect(mockRemoveProjectMember).toHaveBeenCalledWith('pm-1', AGENCY_A.project.id, AGENCY_A.tenant.id);
  });
});

describe('Module 5 integration — project manager consistency (§39/§48)', () => {
  it('activation auto-adds the PM as a member with role "Project Manager"', async () => {
    arrange(AGENCY_A.tenant.id);
    const managerId = `u-${AGENCY_A.tenant.id}`;
    const draft = projectFor(AGENCY_A.tenant.id, { status: 'DRAFT', projectManagerId: managerId });
    mockGetProjectById.mockResolvedValueOnce(draft);
    mockUpdateProject.mockResolvedValue(true);
    mockGetProjectById.mockResolvedValueOnce({ ...draft, status: 'ACTIVE' });
    mockGetProjectMembers.mockResolvedValue([]);
    mockCreateProjectMember.mockResolvedValue({ id: 'pm-auto' } as never);

    const res = await lifecycleAction(
      requestFor(`/api/agency/projects/${draft.id}/activate`, { method: 'POST' }),
      actionCtxFor(draft.id, 'activate')
    );
    expect(res.status).toBe(200);
    expect(mockCreateProjectMember).toHaveBeenCalledWith(
      AGENCY_A.tenant.id, AGENCY_A.project.id,
      expect.objectContaining({ userId: managerId, role: 'Project Manager' })
    );
    expect(mockCreateLog).toHaveBeenCalledWith(
      expect.anything(), 'PROJECT_MEMBER_ADDED',
      expect.stringContaining('§39'), AGENCY_A.tenant.id, expect.anything()
    );
  });

  it('activation skips the auto-add when the PM is already an active member', async () => {
    arrange(AGENCY_A.tenant.id);
    const managerId = `u-${AGENCY_A.tenant.id}`;
    const draft = projectFor(AGENCY_A.tenant.id, { status: 'DRAFT', projectManagerId: managerId });
    mockGetProjectById.mockResolvedValueOnce(draft);
    mockUpdateProject.mockResolvedValue(true);
    mockGetProjectById.mockResolvedValueOnce({ ...draft, status: 'ACTIVE' });
    mockGetProjectMembers.mockResolvedValue([
      memberFor(AGENCY_A.tenant.id, { userId: managerId }),
    ]);

    const res = await lifecycleAction(
      requestFor(`/api/agency/projects/${draft.id}/activate`, { method: 'POST' }),
      actionCtxFor(draft.id, 'activate')
    );
    expect(res.status).toBe(200);
    expect(mockCreateProjectMember).not.toHaveBeenCalled();
  });

  it('PATCHing projectManagerId routes through setProjectManager (§48)', async () => {
    arrange(AGENCY_A.tenant.id);
    const managerId = 'mgr-a100000000000000000000a';
    mockGetProjectById.mockResolvedValue(projectFor(AGENCY_A.tenant.id));
    mockGetUserById.mockResolvedValue(userFor(AGENCY_A.tenant.id, { _id: managerId, role: 'USER' }));
    mockUpdateProject.mockResolvedValue(true);
    mockGetProjectMembers.mockResolvedValue([]);
    mockCreateProjectMember.mockResolvedValue({ id: 'pm-auto' } as never);

    const res = await patchProject(
      jsonRequest(`/api/agency/projects/${AGENCY_A.project.id}`, 'PATCH', { projectManagerId: managerId }),
      ctxFor(AGENCY_A.project.id)
    );
    expect(res.status).toBe(200);
    expect(mockUpdateProject).toHaveBeenCalledWith(
      AGENCY_A.project.id, AGENCY_A.tenant.id, { projectManagerId: managerId }
    );
    expect(mockCreateProjectMember).toHaveBeenCalledWith(
      AGENCY_A.tenant.id, AGENCY_A.project.id,
      expect.objectContaining({ userId: managerId, role: 'Project Manager' })
    );
    expect(mockCreateLog).toHaveBeenCalledWith(
      expect.anything(), 'PROJECT_MANAGER_CHANGED',
      expect.stringContaining(managerId), AGENCY_A.tenant.id, expect.anything()
    );
  });

  it('PATCHing to a cross-tenant manager is rejected before any write (§48/§113)', async () => {
    arrange(AGENCY_A.tenant.id);
    const managerId = 'mgr-b100000000000000000000b';
    mockGetProjectById.mockResolvedValue(projectFor(AGENCY_A.tenant.id));
    mockGetUserById.mockResolvedValue(userFor(AGENCY_B.tenant.id, { _id: managerId }));

    const res = await patchProject(
      jsonRequest(`/api/agency/projects/${AGENCY_A.project.id}`, 'PATCH', { projectManagerId: managerId }),
      ctxFor(AGENCY_A.project.id)
    );
    expect(res.status).toBe(400);
    expect(mockUpdateProject).not.toHaveBeenCalled();
    expect(mockCreateProjectMember).not.toHaveBeenCalled();
  });
});

describe('Module 5 — authorization gates (§28: admin writes, user reads)', () => {
  it('lets a USER read the member list', async () => {
    arrange(AGENCY_A.tenant.id, 'Agency', 'USER');
    mockGetProjectById.mockResolvedValue(projectFor(AGENCY_A.tenant.id));
    mockGetProjectMembers.mockResolvedValue([]);

    const res = await listMembersRoute(
      requestFor(`/api/agency/projects/${AGENCY_A.project.id}/members`),
      ctxFor(AGENCY_A.project.id)
    );
    expect(res.status).toBe(200);
  });

  it('403s a USER adding, updating and removing members', async () => {
    arrange(AGENCY_A.tenant.id, 'Agency', 'USER');
    const add = await addMember(
      jsonRequest(`/api/agency/projects/${AGENCY_A.project.id}/members`, 'POST', {
        userId: AGENCY_A.member.userId,
      }),
      ctxFor(AGENCY_A.project.id)
    );
    const patch = await patchMemberRoute(
      jsonRequest(`/api/agency/projects/${AGENCY_A.project.id}/members/pm-1`, 'PATCH', { role: 'X' }),
      memberCtxFor(AGENCY_A.project.id, 'pm-1')
    );
    const remove = await removeMemberRoute(
      requestFor(`/api/agency/projects/${AGENCY_A.project.id}/members/pm-1/remove`, { method: 'POST' }),
      memberCtxFor(AGENCY_A.project.id, 'pm-1')
    );
    expect(add.status).toBe(403);
    expect(patch.status).toBe(403);
    expect(remove.status).toBe(403);
    expect(mockCreateProjectMember).not.toHaveBeenCalled();
    expect(mockUpdateProjectMember).not.toHaveBeenCalled();
    expect(mockRemoveProjectMember).not.toHaveBeenCalled();
  });
});
