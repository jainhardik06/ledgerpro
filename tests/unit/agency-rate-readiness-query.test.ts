/**
 * Module 6 (§123–§124) — the dashboard rate-readiness query.
 *
 * Verifies the operational questions the agency must answer before Time
 * Tracking: ready-for-tracking projects, projects missing rate
 * configuration, and active users without a cost rate. The rate resolution
 * itself is mocked (its matrix lives in agency-rates-domain.test.ts) — these
 * tests pin the SCOPING (ACTIVE ∪ ON_HOLD only) and the counting.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('@/lib/db', () => ({
  getProjects: vi.fn(),
  getProjectMembers: vi.fn(),
  getTenantById: vi.fn(),
  getProjectWorkItems: vi.fn(),
  getUsersByTenant: vi.fn(),
}));

vi.mock('@/lib/agency/domain/rate-resolution', () => ({
  resolveCostRate: vi.fn(),
  resolveBillingRate: vi.fn(),
}));

import { getProjects, getProjectMembers, getProjectWorkItems, getUsersByTenant } from '@/lib/db';
import { resolveCostRate, resolveBillingRate } from '@/lib/agency/domain/rate-resolution';
import { getRateReadinessMetrics } from '@/lib/agency/queries/rate-readiness';
import type { Project, ProjectMember, WorkItem } from '@/lib/agency/types/project';

const TENANT = 'tenant-a';

function project(id: string, overrides: Partial<Project> = {}): Project {
  return {
    id, tenantId: TENANT, clientId: 'client-1', name: `Project ${id}`,
    status: 'ACTIVE', billingModel: 'FIXED_FEE', currency: 'INR',
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

const MEMBER: ProjectMember = {
  id: 'member-1', tenantId: TENANT, projectId: 'proj-1',
  userId: 'user-1', role: 'Developer', active: true,
  createdAt: new Date('2026-01-01'),
};

const WORK_ITEM: WorkItem = {
  id: 'wi-1', tenantId: TENANT, projectId: 'proj-1',
  name: 'Build', status: 'IN_PROGRESS', sortOrder: 1, createdBy: 'user-1',
  createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
};

function user(id: string) {
  return { id, username: id, role: 'USER', tenantId: TENANT, status: 'ACTIVE', createdAt: new Date('2026-01-01') };
}

describe('getRateReadinessMetrics (§123–§124)', () => {
  beforeEach(() => {
    (getProjects as Mock).mockReset();
    (getProjectMembers as Mock).mockReset().mockResolvedValue([MEMBER]);
    (getProjectWorkItems as Mock).mockReset().mockResolvedValue([WORK_ITEM]);
    (getUsersByTenant as Mock).mockReset().mockResolvedValue([]);
    (resolveCostRate as unknown as Mock).mockReset().mockResolvedValue({ status: 'RESOLVED' });
    (resolveBillingRate as unknown as Mock).mockReset().mockResolvedValue({ status: 'NOT_CONFIGURED' });
  });

  it('scopes to ACTIVE ∪ ON_HOLD — drafts, cancelled and archived never count', async () => {
    (getProjects as Mock).mockResolvedValue([
      project('p1', { status: 'DRAFT' }),
      project('p2', { status: 'CANCELLED' }),
      project('p3', { status: 'COMPLETED' }),
    ]);
    const m = await getRateReadinessMetrics(TENANT);
    expect(m.projectsTotal).toBe(0);
    // No deliverable project is even member-scanned.
    expect(getProjectMembers as Mock).not.toHaveBeenCalled();
  });

  it('counts ready, missing-rate and unpriced-user signals (§123)', async () => {
    (getProjects as Mock).mockResolvedValue([
      project('ready'),                                    // full config → ready
      project('onhold', { status: 'ON_HOLD' }),            // full config → ready
      project('unpriced'),                                 // member resolves nothing
    ]);
    // The unpriced project's team carries a different member — the
    // resolution mock prices user-1, nobody else.
    (getProjectMembers as Mock).mockImplementation(async (projectId: string) =>
      projectId === 'unpriced' ? [{ ...MEMBER, userId: 'user-9' }] : [MEMBER]);
    (getUsersByTenant as Mock).mockResolvedValue([user('user-1'), user('user-2')]);
    (resolveCostRate as unknown as Mock).mockImplementation(
      async (_t: string, userId: string) =>
        userId === 'user-1' ? { status: 'RESOLVED' } : { status: 'NOT_CONFIGURED' }
    );

    const m = await getRateReadinessMetrics(TENANT);
    expect(m.projectsTotal).toBe(3);
    // §126 — only the ACTIVE project can be READY_FOR_TRACKING; the ON_HOLD
    // one is in scope (deliverable) but paused, so it honestly isn't ready.
    expect(m.projectsReadyForTracking).toBe(1);
    expect(m.projectsMissingRates).toBe(1);
    expect(m.usersWithoutCostRate).toBe(1);
    expect(m.usersTotal).toBe(2);
  });

  it('a T&M project missing billing rates counts as missing rate configuration', async () => {
    (getProjects as Mock).mockResolvedValue([
      project('tm', { billingModel: 'TIME_AND_MATERIALS' }),
    ]);
    // Cost resolves, billing doesn't (the default mock for
    // resolveBillingRate in this file is NOT_CONFIGURED).
    (getUsersByTenant as Mock).mockResolvedValue([]);
    const m = await getRateReadinessMetrics(TENANT);
    expect(m.projectsReadyForTracking).toBe(0);
    expect(m.projectsMissingRates).toBe(1);
  });

  it('locked users are excluded from the staffing-gap count', async () => {
    (getProjects as Mock).mockResolvedValue([]);
    (getUsersByTenant as Mock).mockResolvedValue([
      user('active-unpriced'),
      { ...user('locked'), status: 'LOCKED' },
    ]);
    (resolveCostRate as unknown as Mock).mockResolvedValue({ status: 'NOT_CONFIGURED' });
    const m = await getRateReadinessMetrics(TENANT);
    expect(m.usersTotal).toBe(1);
    expect(m.usersWithoutCostRate).toBe(1);
  });

  it('a fully priced workspace reports zero gaps', async () => {
    (getProjects as Mock).mockResolvedValue([project('ready')]);
    (getUsersByTenant as Mock).mockResolvedValue([user('u1')]);
    const m = await getRateReadinessMetrics(TENANT);
    expect(m.projectsMissingRates).toBe(0);
    expect(m.usersWithoutCostRate).toBe(0);
    expect(m.projectsReadyForTracking).toBe(1);
  });
});
