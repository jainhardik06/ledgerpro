/**
 * Module 6 Sprint 6.8 — project financial readiness (§108–§110/§125–§127).
 *
 * The readiness engine resolves each active member's cost/billing rate via
 * the REAL resolution engine; these tests mock rate-resolution (its own
 * matrix is covered in agency-rates-domain.test.ts) and assert the §109
 * checks, the §125 RATE_READY/BILLING_READY roll-ups, and the §127
 * warn-never-block contract: missing rates produce warnings, not failures.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('@/lib/agency/domain/rate-resolution', () => ({
  resolveCostRate: vi.fn(),
  resolveBillingRate: vi.fn(),
}));

import { resolveCostRate, resolveBillingRate } from '@/lib/agency/domain/rate-resolution';
import { computeProjectReadiness, type ReadinessCheck } from '@/lib/agency/domain/project-readiness';
import type { Project, ProjectMember, WorkItem } from '@/lib/agency/types/project';
import type { ResolvedRate } from '@/lib/agency/types/rate';

const TENANT = 'tenant-a';

const RESOLVED: ResolvedRate = {
  status: 'RESOLVED', amount: 900, currency: 'INR',
  rateCardId: 'card-1', rateEntryId: 'entry-1',
  effectiveFrom: '2026-01-01', effectiveTo: null,
  source: 'USER_ASSIGNMENT', unit: 'HOUR',
};

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1', tenantId: TENANT, clientId: 'client-1', name: 'Website Redesign',
    status: 'ACTIVE', billingModel: 'TIME_AND_MATERIALS', currency: 'INR',
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function member(overrides: Partial<ProjectMember> = {}): ProjectMember {
  return {
    id: `member-${Math.random().toString(36).slice(2)}`, tenantId: TENANT, projectId: 'proj-1',
    userId: 'user-1', role: 'Senior Developer', active: true,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function workItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: `wi-${Math.random().toString(36).slice(2)}`, tenantId: TENANT, projectId: 'proj-1',
    name: 'Homepage Development', status: 'IN_PROGRESS', sortOrder: 1, createdBy: 'user-1',
    createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function check(r: { checks: ReadinessCheck[] }, key: string) {
  return r.checks.find(c => c.key === key);
}

describe('computeProjectReadiness (§108–§110/§125–§127)', () => {
  beforeEach(() => {
    (resolveCostRate as Mock).mockReset().mockResolvedValue({ status: 'NOT_CONFIGURED' });
    (resolveBillingRate as Mock).mockReset().mockResolvedValue({ status: 'NOT_CONFIGURED' });
  });

  it('an empty draft fails every check and never throws (§127: warn, not block)', async () => {
    const r = await computeProjectReadiness(TENANT, project({ clientId: '', billingModel: undefined as unknown as Project['billingModel'], status: 'DRAFT' }), []);
    // Every applicable check fails; the billing check is the exception —
    // with no model at all it doesn't apply, so it reads ready/N-A.
    for (const key of ['client', 'billingModel', 'revenueBudget', 'costBudget', 'plannedHours', 'team', 'costRates', 'projectActive', 'workItems']) {
      expect(check(r, key)?.ready).toBe(false);
    }
    expect(check(r, 'billingRates')?.ready).toBe(true);
    expect(r.rateReady).toBe(false);
    // No billing model at all → the billing roll-up doesn't apply.
    expect(r.billingReady).toBe(null);
    expect(r.readyForTracking).toBe(false);
    expect(r.configuredCostRates).toEqual({ configured: 0, total: 0 });
  });

  it('a T&M project with no team is honestly not BILLING_READY (§96, never zero)', async () => {
    const r = await computeProjectReadiness(TENANT, project(), []);
    expect(r.rateReady).toBe(false);
    expect(r.billingReady).toBe(false);
    expect(check(r, 'team')?.detail).toContain('No active team members');
  });

  it('a fully configured FIXED_FEE project is RATE_READY; billing is honestly N/A', async () => {
    (resolveCostRate as Mock).mockResolvedValue(RESOLVED);
    const p = project({
      billingModel: 'FIXED_FEE',
      revenueBudget: 200000, budgetCost: 90000, plannedHours: 160,
    });
    const r = await computeProjectReadiness(TENANT, p, [member()], [workItem()]);
    expect(r.checks.every(c => c.ready)).toBe(true);
    expect(r.rateReady).toBe(true);
    // §125 — BILLING_READY only exists for T&M; fixed-fee bills as a whole.
    expect(r.billingReady).toBe(null);
    // §126 — fixed-fee with full config, team and work is ready for tracking.
    expect(r.readyForTracking).toBe(true);
    expect(r.configuredBillingRates).toBe(null);
    expect(check(r, 'billingRates')?.detail).toContain('billed as a whole');
  });

  it('T&M with partial coverage reports N/M counts and both roll-ups false', async () => {
    (resolveCostRate as Mock).mockImplementation(async (_t: string, userId: string) =>
      userId === 'user-1' ? RESOLVED : { status: 'NOT_CONFIGURED' });
    (resolveBillingRate as Mock).mockImplementation(async (_t: string, _c: string, _p: string, _d: string, role: string) =>
      role === 'Senior Developer' ? RESOLVED : { status: 'NOT_CONFIGURED' });

    const r = await computeProjectReadiness(TENANT, project({
      revenueBudget: 200000, budgetCost: 90000, plannedHours: 160,
    }), [
      member({ userId: 'user-1', role: 'Senior Developer' }),
      member({ userId: 'user-2', role: 'Designer' }),
    ]);

    expect(r.configuredCostRates).toEqual({ configured: 1, total: 2 });
    expect(r.configuredBillingRates).toEqual({ configured: 1, total: 2 });
    expect(r.rateReady).toBe(false);
    expect(r.billingReady).toBe(false);
    expect(check(r, 'costRates')?.detail).toContain('1/2');
    expect(check(r, 'billingRates')?.detail).toContain('1/2');
  });

  it('a fully configured T&M project is both RATE_READY and BILLING_READY', async () => {
    (resolveCostRate as Mock).mockResolvedValue(RESOLVED);
    (resolveBillingRate as Mock).mockResolvedValue({ ...RESOLVED, amount: 2500, source: 'CLIENT_RATE_CARD' });
    const r = await computeProjectReadiness(TENANT, project({
      revenueBudget: 200000, budgetCost: 90000, plannedHours: 160,
    }), [
      member({ userId: 'user-1', role: 'Senior Developer' }),
      member({ userId: 'user-2', role: 'Designer' }),
    ], [workItem()]);
    expect(r.rateReady).toBe(true);
    expect(r.billingReady).toBe(true);
    expect(r.checks.every(c => c.ready)).toBe(true);
    expect(r.readyForTracking).toBe(true);
  });

  it('a T&M member without a role label cannot resolve billing — honestly not configured', async () => {
    (resolveCostRate as Mock).mockResolvedValue(RESOLVED);
    (resolveBillingRate as Mock).mockResolvedValue(RESOLVED);
    const r = await computeProjectReadiness(TENANT, project(), [
      member({ userId: 'user-1', role: undefined }),
    ]);
    // resolveBillingRate is never even called for the roleless member (§89).
    expect(resolveBillingRate as Mock).not.toHaveBeenCalled();
    expect(r.billingReady).toBe(false);
    expect(r.configuredBillingRates).toEqual({ configured: 0, total: 1 });
    expect(r.rateReady).toBe(true);
  });

  it('inactive (removed) members are excluded from the team and rate totals (§37)', async () => {
    (resolveCostRate as Mock).mockResolvedValue(RESOLVED);
    const r = await computeProjectReadiness(TENANT, project(), [
      member({ userId: 'user-1' }),
      member({ userId: 'user-2', active: false }),
    ]);
    expect(r.configuredCostRates).toEqual({ configured: 1, total: 1 });
    expect(check(r, 'team')?.detail).toContain('1 active member');
    expect(r.rateReady).toBe(true);
  });

  it('§126 — a DRAFT project with full economics is still not READY_FOR_TRACKING', async () => {
    (resolveCostRate as Mock).mockResolvedValue(RESOLVED);
    const r = await computeProjectReadiness(TENANT, project({ status: 'DRAFT' }), [member()], [workItem()]);
    expect(r.rateReady).toBe(true);
    expect(check(r, 'projectActive')?.ready).toBe(false);
    expect(check(r, 'projectActive')?.detail).toContain('DRAFT');
    // Economics complete, structure not — the composite says so honestly.
    expect(r.readyForTracking).toBe(false);
  });

  it('§126 — archived-only work items are not a time-logging target', async () => {
    (resolveCostRate as Mock).mockResolvedValue(RESOLVED);
    const r = await computeProjectReadiness(TENANT, project(), [member()], [
      workItem({ status: 'ARCHIVED' }),
      workItem({ status: 'ARCHIVED' }),
    ]);
    expect(check(r, 'workItems')?.ready).toBe(false);
    expect(check(r, 'workItems')?.detail).toContain('No open work items');
    expect(r.readyForTracking).toBe(false);
  });

  it('§126 — missing cost rates block the composite even when structure is complete', async () => {
    (resolveCostRate as Mock).mockResolvedValue({ status: 'NOT_CONFIGURED' });
    const r = await computeProjectReadiness(TENANT, project(), [member()], [workItem()]);
    expect(check(r, 'projectActive')?.ready).toBe(true);
    expect(check(r, 'workItems')?.ready).toBe(true);
    // §96/§126 — unpriced labor means UNKNOWN cost, so tracking isn't ready.
    expect(r.readyForTracking).toBe(false);
  });

  it('§126 — a non-T&M project needs no billing rates for the composite', async () => {
    (resolveCostRate as Mock).mockResolvedValue(RESOLVED);
    const r = await computeProjectReadiness(TENANT, project({ billingModel: 'FIXED_FEE' }), [member()], [workItem()]);
    expect(r.billingReady).toBe(null);
    expect(r.readyForTracking).toBe(true);
  });
});
