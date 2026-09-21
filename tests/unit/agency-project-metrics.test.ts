/**
 * Module 3 (Step 3.8/§92, tested in Step 3.9) — unit: project metric
 * calculations over a controlled store.
 *
 * getProjectPortfolioMetrics is the Module 3 dashboard source. Its scope
 * definitions are contract, not implementation detail:
 *
 *   activeProjects     ACTIVE only (ON_HOLD is paused delivery)
 *   contractedRevenue  Σ (contractValue ?? revenueBudget ?? 0) over ACTIVE
 *   plannedMargin      (ΣrevenueBudget − ΣbudgetCost) / ΣrevenueBudget over
 *                      ACTIVE projects carrying BOTH baselines; null when
 *                      none does (§6 no-baseline rule)
 *   portfolio rows     ACTIVE ∪ ON_HOLD ∪ COMPLETED
 *
 * Only the store edge is mocked (local JSON fallback semantics) — the
 * aggregation itself is the real code under test.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '@/lib/agency/types/project';

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...actual,
    connectDb: vi.fn(),
    initLocalDb: vi.fn(),
    getProjects: vi.fn(),
    getClients: vi.fn(),
  };
});

import { connectDb, initLocalDb, getClients } from '@/lib/db';
import {
  getProjectPortfolioMetrics, getClientProjectSummaries,
} from '@/lib/agency/queries/project-metrics';

const mockConnectDb = vi.mocked(connectDb);
const mockInitLocalDb = vi.mocked(initLocalDb);
const mockGetClients = vi.mocked(getClients);

const TENANT = 'tenant-metrics';

function project(overrides: Partial<Project> & { id: string }): Project {
  return {
    tenantId: TENANT,
    name: `Project ${overrides.id}`,
    clientId: 'cl-1',
    billingModel: 'FIXED_FEE',
    currency: 'INR',
    status: 'DRAFT',
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
    ...overrides,
  } as Project;
}

function arrangeStore(projects: Project[]) {
  // Force the local-JSON fallback path — identical semantics per the
  // queries/conventions.ts rules, and fully under the test's control.
  mockConnectDb.mockResolvedValue({ db: null } as Awaited<ReturnType<typeof connectDb>>);
  mockInitLocalDb.mockReturnValue({ projects } as ReturnType<typeof initLocalDb>);
  mockGetClients.mockResolvedValue([{ id: 'cl-1', name: 'Client One' } as never]);
}

beforeEach(() => {
  mockConnectDb.mockReset();
  mockInitLocalDb.mockReset();
  mockGetClients.mockReset();
});

describe('Module 3 unit — activeProjects and contractedRevenue (§92)', () => {
  it('counts ACTIVE projects only — ON_HOLD is paused delivery, not active', async () => {
    arrangeStore([
      project({ id: 'p1', status: 'ACTIVE' }),
      project({ id: 'p2', status: 'ON_HOLD' }),
      project({ id: 'p3', status: 'DRAFT' }),
      project({ id: 'p4', status: 'COMPLETED' }),
    ]);
    const m = await getProjectPortfolioMetrics(TENANT);
    expect(m.activeProjects).toBe(1);
  });

  it('sums contractValue first, falling back to revenueBudget (§1 committed value)', async () => {
    arrangeStore([
      project({ id: 'p1', status: 'ACTIVE', contractValue: 500000 }),
      project({ id: 'p2', status: 'ACTIVE', revenueBudget: 300000 }), // no contractValue
      project({ id: 'p3', status: 'ACTIVE', contractValue: 200000, revenueBudget: 999999 }), // contract wins
      project({ id: 'p4', status: 'DRAFT', contractValue: 9900000 }), // not ACTIVE
    ]);
    const m = await getProjectPortfolioMetrics(TENANT);
    expect(m.contractedRevenue).toBe(500000 + 300000 + 200000);
  });

  it('a project with no commercial value contributes a real zero, never NaN', async () => {
    arrangeStore([project({ id: 'p1', status: 'ACTIVE' })]);
    const m = await getProjectPortfolioMetrics(TENANT);
    expect(m.contractedRevenue).toBe(0);
  });
});

describe('Module 3 unit — planned margin calculation (§92/§6)', () => {
  it('computes (ΣrevenueBudget − ΣbudgetCost) / ΣrevenueBudget over ACTIVE projects with both baselines', async () => {
    arrangeStore([
      project({ id: 'p1', status: 'ACTIVE', revenueBudget: 500000, budgetCost: 300000 }), // 40%
      project({ id: 'p2', status: 'ACTIVE', revenueBudget: 200000, budgetCost: 100000 }), // 50%
    ]);
    const m = await getProjectPortfolioMetrics(TENANT);
    // Portfolio-level: (700k − 400k) / 700k × 100 — aggregate, not an average of margins
    expect(m.plannedMargin).toBeCloseTo(42.857, 2);
  });

  it('is null when no ACTIVE project carries both baselines (§6 no-baseline rule)', async () => {
    arrangeStore([
      project({ id: 'p1', status: 'ACTIVE', revenueBudget: 500000 }),               // no cost
      project({ id: 'p2', status: 'ACTIVE', budgetCost: 300000 }),                  // no revenue
      project({ id: 'p3', status: 'ON_HOLD', revenueBudget: 500000, budgetCost: 100000 }), // not ACTIVE
    ]);
    const m = await getProjectPortfolioMetrics(TENANT);
    expect(m.plannedMargin).toBeNull();
  });

  it('computes over the WITH-baseline subset when only some projects qualify', async () => {
    arrangeStore([
      project({ id: 'p1', status: 'ACTIVE', revenueBudget: 400000, budgetCost: 200000 }),
      project({ id: 'p2', status: 'ACTIVE', revenueBudget: 0, budgetCost: 100000 }), // zero revenue excluded
    ]);
    const m = await getProjectPortfolioMetrics(TENANT);
    expect(m.plannedMargin).toBeCloseTo(50, 10);
  });
});

describe('Module 3 unit — portfolio health rows (§92)', () => {
  it('scopes to ACTIVE ∪ ON_HOLD ∪ COMPLETED — DRAFT/CANCELLED/ARCHIVED excluded', async () => {
    arrangeStore([
      project({ id: 'p1', status: 'ACTIVE' }),
      project({ id: 'p2', status: 'ON_HOLD' }),
      project({ id: 'p3', status: 'COMPLETED' }),
      project({ id: 'p4', status: 'DRAFT' }),
      project({ id: 'p5', status: 'CANCELLED' }),
      project({ id: 'p6', status: 'ARCHIVED' }),
    ]);
    const m = await getProjectPortfolioMetrics(TENANT);
    expect(m.rows.map(r => r.projectId).sort()).toEqual(['p1', 'p2', 'p3']);
  });

  it('marks actuals honestly: cost/billed/collected are real zeros, margin/burn null (§92)', async () => {
    arrangeStore([project({ id: 'p1', status: 'ACTIVE' })]);
    const m = await getProjectPortfolioMetrics(TENANT);
    expect(m.rows[0].cost).toBe(0);
    expect(m.rows[0].billed).toBe(0);
    expect(m.rows[0].collected).toBe(0);
    expect(m.rows[0].margin).toBeNull();
    expect(m.rows[0].budgetBurn).toBeNull();
  });

  it('resolves client names for the batch; an unknown client shows "—"', async () => {
    arrangeStore([project({ id: 'p1', status: 'ACTIVE', clientId: 'cl-unknown' })]);
    const m = await getProjectPortfolioMetrics(TENANT);
    expect(m.rows[0].clientName).toBe('—');
  });
});

describe('Module 3 unit — client project summaries (§93/§94)', () => {
  it('summarizes count, activeCount and planned value per client (non-archived)', async () => {
    arrangeStore([
      project({ id: 'p1', status: 'ACTIVE', clientId: 'cl-1', contractValue: 100000 }),
      project({ id: 'p2', status: 'DRAFT', clientId: 'cl-1', revenueBudget: 50000 }),
      project({ id: 'p3', status: 'COMPLETED', clientId: 'cl-2', contractValue: 700000 }),
      project({ id: 'p4', status: 'ARCHIVED', clientId: 'cl-1', contractValue: 9900000 }), // excluded
    ]);
    const summaries = await getClientProjectSummaries(TENANT);
    expect(summaries.get('cl-1')).toEqual({ count: 2, activeCount: 1, plannedValue: 150000 });
    expect(summaries.get('cl-2')).toEqual({ count: 1, activeCount: 0, plannedValue: 700000 });
  });
});
