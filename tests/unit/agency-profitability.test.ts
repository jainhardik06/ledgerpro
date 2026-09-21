/**
 * Module 13 — the profitability engine (spec §58–§84).
 *
 * Pins the §82 calculation matrix and the contracts around it:
 *
 *   §82 matrix    Fixed Fee 500k revenue / 300k cost → 200k profit → 40%
 *                 T&M 100h × ₹2500 revenue, 100h × ₹900 cost + ₹20k
 *                 expense → ₹140k profit → 56%
 *                 Zero revenue → margin = N/A (null) — never a fake 0%,
 *                 never a division by zero
 *   §60/§66       collected cash NEVER enters the profit formulas
 *   §62           revenue per billing model (fixed contract / approved
 *                 billable time in ALL billing states / completed milestones)
 *   §63           labor = approved × frozen snapshot; expenses = approved
 *   §67           unbilled per model (incl. the fixed-fee contract-level read)
 *   §74           THREE separate burns + the max(hours, cost) headline
 *   §75           the four-state health rules (incl. the approaching band)
 *   §76           hours warnings at 80 / 100 / >100
 *   §77           the margin alert explains itself with the numbers
 *   §78           drill-down: labor by member × frozen rate, expenses by vendor
 *   §127          other-currency sources are excluded + counted, never converted
 *   §81           portfolio rollup (via the local store, same semantics as Mongo)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('@/lib/db', () => ({
  connectDb: vi.fn(),
  initLocalDb: vi.fn(),
  getProjectById: vi.fn(),
  getProjects: vi.fn(),
  getUserById: vi.fn(),
  getClientById: vi.fn(),
}));

import { connectDb, initLocalDb, getProjects, getClientById } from '@/lib/db';
import {
  computeProjectProfitability, buildProfitabilityDrillDown, getPortfolioProfitability,
} from '@/lib/agency/profitability';
import { computeProjectFinancialHealth, marginAlertFor } from '@/lib/agency/profitability/projectHealth';
import { computeProjectBudgetBurn, hoursBudgetWarning } from '@/lib/agency/profitability/projectBudget';
import { getProjectTimeAggregates } from '@/lib/agency/queries/profitability-metrics';
import type { ProjectTimeAggregates, ProjectExpenseAggregates, ProjectInvoiceAggregates, ProjectMilestoneAggregates } from '@/lib/agency/queries/profitability-metrics';
import { makeMoney } from '@/lib/agency/types/money';
import type { Project, ProjectMilestone } from '@/lib/agency/types/project';
import type { TimeEntry } from '@/lib/agency/types/time';
import type { Expense } from '@/lib/agency/types/expense';
import type { Invoice } from '@/lib/agency/types/invoice';

const TENANT = 'tenant-a';

// ---------- fixtures ----------

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

function inv(overrides: Partial<ProjectInvoiceAggregates> = {}): ProjectInvoiceAggregates {
  return { invoiceCount: 0, billed: [], collected: [], ...overrides };
}

function mile(overrides: Partial<ProjectMilestoneAggregates> = {}): ProjectMilestoneAggregates {
  return {
    completedCount: 0, completedAmount: 0, completedPercent: 0, completedPercentCount: 0,
    unbilledCount: 0, unbilledAmount: 0, unbilledPercent: 0,
    ...overrides,
  };
}

function timeEntry(overrides: Partial<TimeEntry> & { id: string }): TimeEntry {
  return {
    tenantId: TENANT,
    projectId: 'proj-1',
    userId: 'user-1',
    date: '2026-09-10',
    durationMinutes: 60,
    billable: true,
    approvalStatus: 'APPROVED',
    billingStatus: 'UNBILLED',
    financialStatus: 'READY',
    createdAt: new Date('2026-09-10'),
    updatedAt: new Date('2026-09-10'),
    ...overrides,
  };
}

function expense(overrides: Partial<Expense> & { id: string }): Expense {
  return {
    tenantId: TENANT,
    projectId: 'proj-1',
    vendorName: 'Stock Assets',
    description: 'assets',
    amount: makeMoney(0, 'INR'),
    expenseType: 'BILLABLE',
    billable: true,
    expenseDate: '2026-09-10',
    status: 'APPROVED',
    billingStatus: 'UNBILLED',
    createdBy: 'user-1',
    createdAt: new Date('2026-09-10'),
    updatedAt: new Date('2026-09-10'),
    ...overrides,
  };
}

function invoice(overrides: Partial<Invoice> & { id: string }): Invoice {
  return {
    tenantId: TENANT,
    clientId: 'client-1',
    projectId: 'proj-1',
    issueDate: '2026-09-10',
    dueDate: '2026-09-20',
    currency: 'INR',
    subtotal: makeMoney(0, 'INR'),
    discount: makeMoney(0, 'INR'),
    taxLines: [],
    taxTotal: makeMoney(0, 'INR'),
    total: makeMoney(0, 'INR'),
    amountPaid: makeMoney(0, 'INR'),
    amountDue: makeMoney(0, 'INR'),
    status: 'SENT',
    createdBy: 'user-1',
    createdAt: new Date('2026-09-10'),
    updatedAt: new Date('2026-09-10'),
    ...overrides,
  };
}

function milestone(overrides: Partial<ProjectMilestone> & { id: string }): ProjectMilestone {
  return {
    tenantId: TENANT,
    projectId: 'proj-1',
    name: 'M1',
    sequence: 1,
    status: 'COMPLETED',
    billingStatus: 'UNBILLED',
    createdAt: new Date('2026-09-10'),
    updatedAt: new Date('2026-09-10'),
    ...overrides,
  };
}

// ---------- §82: the calculation matrix ----------

describe('§82 matrix — Fixed Fee', () => {
  it('500k revenue, 300k cost → 200k profit → 40% margin', () => {
    const r = computeProjectProfitability({
      project: proj({ billingModel: 'FIXED_FEE', contractValue: 500000 }),
      time: time({ approvedMinutes: 6000, laborCost: [{ currency: 'INR', amount: 250000 }] }),
      expenses: exp({ cost: [{ currency: 'INR', amount: 50000 }] }),
    });
    expect(r.revenueModel).toBe('FIXED_FEE');
    expect(r.applicableRevenue.amount).toBe(500000);
    expect(r.laborCost.amount).toBe(250000);
    expect(r.expenseCost.amount).toBe(50000);
    expect(r.deliveryCost.amount).toBe(300000);
    expect(r.grossProfit.amount).toBe(200000);
    expect(r.marginPercent).toBe(40);
  });
});

describe('§82 matrix — Time & Materials', () => {
  it('100h × ₹2500 revenue, 100h × ₹900 cost + ₹20k expense → ₹140k profit → 56%', () => {
    const r = computeProjectProfitability({
      project: proj({ billingModel: 'TIME_AND_MATERIALS' }),
      time: time({
        approvedMinutes: 6000, // 100h
        laborCost: [{ currency: 'INR', amount: 90000 }],     // 100h × ₹900
        billableValue: [{ currency: 'INR', amount: 250000 }], // 100h × ₹2500
      }),
      expenses: exp({ cost: [{ currency: 'INR', amount: 20000 }] }),
    });
    expect(r.revenueModel).toBe('TIME_MATERIALS');
    expect(r.actualHours).toBe(100);
    expect(r.applicableRevenue.amount).toBe(250000);
    expect(r.laborCost.amount).toBe(90000);
    expect(r.expenseCost.amount).toBe(20000);
    expect(r.deliveryCost.amount).toBe(110000);
    expect(r.grossProfit.amount).toBe(140000);
    // §83 — full precision internally (56.000…1 is honest), 1-decimal only at the renderer.
    expect(r.marginPercent).toBeCloseTo(56, 10);
  });
});

describe('§82 matrix — Zero Revenue', () => {
  it('margin is N/A (null) — never a fake 0%, never a division by zero', () => {
    const r = computeProjectProfitability({
      project: proj({ billingModel: 'TIME_AND_MATERIALS' }),
      time: time({ approvedMinutes: 3000, laborCost: [{ currency: 'INR', amount: 50000 }] }),
    });
    expect(r.applicableRevenue.amount).toBe(0); // a REAL zero
    expect(r.marginPercent).toBeNull();          // §82: N/A
    expect(r.grossProfit.amount).toBe(-50000);   // profit may be negative
  });

  it('zero-cost project with revenue still reports a margin', () => {
    const r = computeProjectProfitability({
      project: proj({ billingModel: 'FIXED_FEE', contractValue: 500000 }),
    });
    expect(r.marginPercent).toBe(100);
    expect(r.grossProfit.amount).toBe(500000);
  });
});

// ---------- §60/§66: five dimensions, cash never profit ----------

describe('§60/§66 — billed and collected are separate from profit', () => {
  it('collected cash never enters the revenue or margin', () => {
    const r = computeProjectProfitability({
      project: proj({ billingModel: 'TIME_AND_MATERIALS' }),
      time: time({
        approvedMinutes: 6000,
        laborCost: [{ currency: 'INR', amount: 90000 }],
        billableValue: [{ currency: 'INR', amount: 250000 }],
      }),
      invoices: inv({
        invoiceCount: 2,
        billed: [{ currency: 'INR', amount: 200000 }],
        collected: [{ currency: 'INR', amount: 150000 }],
      }),
    });
    // Profit follows EARNED revenue (250k), not billed (200k) or collected (150k).
    expect(r.applicableRevenue.amount).toBe(250000);
    expect(r.grossProfit.amount).toBe(160000);
    expect(r.marginPercent).toBe(64);
    // The cash dimensions exist beside it, never inside it.
    expect(r.billedAmount.amount).toBe(200000);
    expect(r.collectedAmount.amount).toBe(150000);
    expect(r.outstandingAmount.amount).toBe(50000);
  });

  it('DRAFT and VOID invoices never count as billed', () => {
    const r = computeProjectProfitability({
      project: proj(),
      invoices: inv({ invoiceCount: 0, billed: [], collected: [] }),
    });
    expect(r.billedAmount.amount).toBe(0);
    expect(r.collectedAmount.amount).toBe(0);
  });
});

// ---------- §62: revenue per billing model ----------

describe('§62 — applicable revenue', () => {
  it('MILESTONE: amount milestones + percentage × contract value', () => {
    const r = computeProjectProfitability({
      project: proj({ billingModel: 'MILESTONE', contractValue: 1000000 }),
      milestones: mile({ completedCount: 3, completedAmount: 200000, completedPercent: 50, completedPercentCount: 2 }),
    });
    expect(r.revenueModel).toBe('MILESTONE');
    expect(r.applicableRevenue.amount).toBe(700000); // 200k + 50% × 1M
  });

  it('MILESTONE percentage without a contract value is counted, never fabricated', () => {
    const r = computeProjectProfitability({
      project: proj({ billingModel: 'MILESTONE' }), // no contractValue
      milestones: mile({ completedAmount: 100000, completedPercent: 40, completedPercentCount: 1 }),
    });
    expect(r.applicableRevenue.amount).toBe(100000);
    expect(r.notes.some(n => n.includes('cannot be valued'))).toBe(true);
  });

  it('FIXED_FEE without a contract value is a real zero + note, never invented', () => {
    const r = computeProjectProfitability({
      project: proj({ billingModel: 'FIXED_FEE' }),
    });
    expect(r.applicableRevenue.amount).toBe(0);
    expect(r.marginPercent).toBeNull();
    expect(r.notes.some(n => n.includes('no contract value'))).toBe(true);
  });

  it('§62 — T&M revenue keeps invoiced time: the query sums billable value across ALL billing states', async () => {
    (connectDb as Mock).mockResolvedValue({ db: null });
    (initLocalDb as Mock).mockReturnValue({
      timeEntries: [
        timeEntry({ id: '1', billingStatus: 'UNBILLED', calculatedCost: makeMoney(3000, 'INR'), calculatedBillableAmount: makeMoney(8000, 'INR'), durationMinutes: 120 }),
        timeEntry({ id: '2', billingStatus: 'RESERVED', calculatedCost: makeMoney(1500, 'INR'), calculatedBillableAmount: makeMoney(4000, 'INR'), durationMinutes: 60 }),
        timeEntry({ id: '3', billingStatus: 'INVOICED', calculatedCost: makeMoney(1500, 'INR'), calculatedBillableAmount: makeMoney(4000, 'INR'), durationMinutes: 60 }),
        timeEntry({ id: '4', billable: false, calculatedCost: makeMoney(1500, 'INR'), durationMinutes: 60 }), // cost only
      ],
    });
    const map = await getProjectTimeAggregates(TENANT, ['proj-1']);
    const agg = map.get('proj-1')!;
    expect(agg.billableValue).toEqual([{ currency: 'INR', amount: 16000 }]); // ALL states
    expect(agg.laborCost).toEqual([{ currency: 'INR', amount: 7500 }]);
    expect(agg.unbilledTime).toEqual([{ currency: 'INR', amount: 8000 }]);  // §67 subset only
    expect(agg.approvedMinutes).toBe(300);
  });
});

// ---------- §67: unbilled work ----------

describe('§67 — unbilled work', () => {
  it('T&M: unbilled time + unbilled chargeable expenses', () => {
    const r = computeProjectProfitability({
      project: proj(),
      time: time({ unbilledTime: [{ currency: 'INR', amount: 60000 }] }),
      expenses: exp({ unbilledCharge: [{ currency: 'INR', amount: 10000 }] }),
    });
    expect(r.unbilledAmount.amount).toBe(70000);
  });

  it('FIXED_FEE: unbilled = max(0, contractValue − billed) at the contract level', () => {
    const r = computeProjectProfitability({
      project: proj({ billingModel: 'FIXED_FEE', contractValue: 500000 }),
      invoices: inv({ invoiceCount: 1, billed: [{ currency: 'INR', amount: 200000 }] }),
    });
    expect(r.unbilledAmount.amount).toBe(300000);
  });

  it('FIXED_FEE: over-billed contract clamps to zero, never negative', () => {
    const r = computeProjectProfitability({
      project: proj({ billingModel: 'FIXED_FEE', contractValue: 500000 }),
      invoices: inv({ invoiceCount: 1, billed: [{ currency: 'INR', amount: 600000 }] }),
    });
    expect(r.unbilledAmount.amount).toBe(0);
  });

  it('MILESTONE: unbilled amounts + unbilled percentage × contract value', () => {
    const r = computeProjectProfitability({
      project: proj({ billingModel: 'MILESTONE', contractValue: 500000 }),
      milestones: mile({ unbilledAmount: 100000, unbilledPercent: 20 }),
    });
    expect(r.unbilledAmount.amount).toBe(200000); // 100k + 20% × 500k
  });
});

// ---------- §74: three separate burns ----------

describe('§74 — budget burn', () => {
  it('the spec example: hours 316/400 = 79%, cost ₹245k/₹300k, revenue ₹300k/₹500k', () => {
    const r = computeProjectProfitability({
      project: proj({
        plannedHours: 400,
        budgetCost: 300000,
        revenueBudget: 500000,
      }),
      time: time({
        approvedMinutes: 18960, // 316h
        laborCost: [{ currency: 'INR', amount: 245000 }],
        billableValue: [{ currency: 'INR', amount: 300000 }],
      }),
    });
    expect(r.burn.hours).toBeCloseTo(0.79, 10);
    expect(r.burn.cost).toBeCloseTo(245000 / 300000, 10);
    expect(r.burn.revenue).toBeCloseTo(0.6, 10);
    // Headline = max(hours, cost) — the worst budget dimension.
    expect(r.budgetBurnPercent).toBeCloseTo(245000 / 300000, 10);
    expect(r.remainingHours).toBe(84);
    expect(r.actualHours).toBe(316);
  });

  it('no baselines → all three burns null, headline null (never a fake 0%)', () => {
    const r = computeProjectProfitability({
      project: proj(),
      time: time({ approvedMinutes: 600, laborCost: [{ currency: 'INR', amount: 9000 }] }),
    });
    expect(r.burn.hours).toBeNull();
    expect(r.burn.cost).toBeNull();
    expect(r.burn.revenue).toBeNull();
    expect(r.budgetBurnPercent).toBeNull();
    expect(r.remainingHours).toBeNull();
    expect(r.plannedHours).toBeNull();
    expect(r.actualHours).toBe(10); // actuals exist regardless of baselines
  });

  it('revenue burn is informational — never a health input (§74)', () => {
    const r = computeProjectProfitability({
      project: proj({ revenueBudget: 1000000, targetMargin: 40 }),
      time: time({ billableValue: [{ currency: 'INR', amount: 100000 }], laborCost: [{ currency: 'INR', amount: 1000 }] }),
    });
    expect(r.burn.revenue).toBeCloseTo(0.1, 10); // 10% revenue burn…
    expect(r.health).toBe('HEALTHY');            // …is not a problem state
  });
});

// ---------- §75: health engine ----------

describe('§75 — computeProjectFinancialHealth', () => {
  const H = computeProjectFinancialHealth;

  it('HEALTHY: burns < 75% and margin ≥ target', () => {
    expect(H({ hoursBurn: 0.5, costBurn: 0.6, marginPercent: 50, targetMargin: 40 })).toBe('HEALTHY');
  });

  it('WATCH: burn in the 75–90% band', () => {
    expect(H({ hoursBurn: 0.80, costBurn: 0.5, marginPercent: 50, targetMargin: 40 })).toBe('WATCH');
    expect(H({ hoursBurn: 0.5, costBurn: 0.90, marginPercent: 50, targetMargin: 40 })).toBe('WATCH'); // 90% itself is watch, not risk
  });

  it('WATCH: margin approaching target (within the band below it)', () => {
    expect(H({ hoursBurn: 0.5, costBurn: 0.5, marginPercent: 35, targetMargin: 40 })).toBe('WATCH');
    expect(H({ hoursBurn: 0.5, costBurn: 0.5, marginPercent: 30, targetMargin: 40 })).toBe('WATCH'); // exactly target − 10
  });

  it('AT_RISK: margin meaningfully below target (past the approaching band)', () => {
    expect(H({ hoursBurn: 0.5, costBurn: 0.5, marginPercent: 25, targetMargin: 40 })).toBe('AT_RISK');
  });

  it('AT_RISK: burn > 90%', () => {
    expect(H({ hoursBurn: 0.95, costBurn: 0.5, marginPercent: 50, targetMargin: 40 })).toBe('AT_RISK');
    expect(H({ hoursBurn: 0.5, costBurn: 0.91, marginPercent: 50, targetMargin: 40 })).toBe('AT_RISK');
  });

  it('OVER_BUDGET: either burn > 100%, and it outranks everything', () => {
    expect(H({ hoursBurn: 1.05, costBurn: 0.5, marginPercent: 50, targetMargin: 40 })).toBe('OVER_BUDGET');
    expect(H({ hoursBurn: 0.5, costBurn: 1.01, marginPercent: 50, targetMargin: 40 })).toBe('OVER_BUDGET');
    expect(H({ hoursBurn: 1.05, costBurn: 0.95, marginPercent: 20, targetMargin: 40 })).toBe('OVER_BUDGET');
  });

  it('null baselines are never forced into a risk state (§82 discipline)', () => {
    expect(H({ hoursBurn: null, costBurn: null, marginPercent: null, targetMargin: null })).toBe('HEALTHY');
    expect(H({ hoursBurn: null, costBurn: 0.5, marginPercent: null, targetMargin: 40 })).toBe('HEALTHY');
  });

  it('missing targetMargin falls back to the default (40)', () => {
    expect(H({ hoursBurn: 0.5, costBurn: 0.5, marginPercent: 45, targetMargin: null })).toBe('HEALTHY');
    expect(H({ hoursBurn: 0.5, costBurn: 0.5, marginPercent: 20, targetMargin: null })).toBe('AT_RISK');
  });
});

// ---------- §76: hours warnings ----------

describe('§76 — hoursBudgetWarning', () => {
  it('under 80% → no warning', () => {
    expect(hoursBudgetWarning(0.79)).toBeNull();
    expect(hoursBudgetWarning(null)).toBeNull();
  });
  it('80% → APPROACHING', () => {
    expect(hoursBudgetWarning(0.80)?.level).toBe('APPROACHING');
  });
  it('100% → EXHAUSTED', () => {
    expect(hoursBudgetWarning(1.00)?.level).toBe('EXHAUSTED');
  });
  it('>100% → OVER', () => {
    const w = hoursBudgetWarning(1.05);
    expect(w?.level).toBe('OVER');
    expect(w?.hourBurnPercent).toBe(105);
  });
});

// ---------- §77: the margin alert ----------

describe('§77 — marginAlertFor', () => {
  it('explains an AT_RISK margin with the deterministic reason', () => {
    const health = computeProjectFinancialHealth({ hoursBurn: 0.5, costBurn: 0.5, marginPercent: 25, targetMargin: 40 });
    const alert = marginAlertFor({ hoursBurn: 0.5, costBurn: 0.5, marginPercent: 25, targetMargin: 40 }, health);
    expect(alert).not.toBeNull();
    expect(alert!.severity).toBe('CRITICAL');
    expect(alert!.currentMarginPercent).toBe(25);
    expect(alert!.targetMarginPercent).toBe(40);
    expect(alert!.reason).toContain('higher than the project economics support');
    expect(alert!.reason).toContain('25.0%');
    expect(alert!.reason).toContain('40.0%');
  });

  it('an approaching (WATCH) margin is a WARNING', () => {
    const health = computeProjectFinancialHealth({ hoursBurn: 0.5, costBurn: 0.5, marginPercent: 35, targetMargin: 40 });
    const alert = marginAlertFor({ hoursBurn: 0.5, costBurn: 0.5, marginPercent: 35, targetMargin: 40 }, health);
    expect(alert?.severity).toBe('WARNING');
  });

  it('no alert at or above target, and none when margin has no baseline', () => {
    expect(marginAlertFor({ hoursBurn: 0.5, costBurn: 0.5, marginPercent: 45, targetMargin: 40 }, 'HEALTHY')).toBeNull();
    expect(marginAlertFor({ hoursBurn: 0.5, costBurn: 0.5, marginPercent: null, targetMargin: 40 }, 'HEALTHY')).toBeNull();
  });

  it('a burn-driven OVER_BUDGET with margin below target carries a CRITICAL alert', () => {
    const alert = marginAlertFor({ hoursBurn: 1.05, costBurn: 0.5, marginPercent: 30, targetMargin: 40 }, 'OVER_BUDGET');
    expect(alert?.severity).toBe('CRITICAL');
  });
});

// ---------- §78: drill-down ----------

describe('§78 — buildProfitabilityDrillDown', () => {
  it('labor by member × frozen rate, expenses by vendor, cost-desc; other currencies excluded', () => {
    const dd = buildProfitabilityDrillDown('INR', [
      { userId: 'user-1', rateAmount: 900, currency: 'INR', minutes: 2400, cost: 36000, entryCount: 3 },
      { userId: 'user-2', rateAmount: 2500, currency: 'INR', minutes: 1200, cost: 50000, entryCount: 2 },
      { userId: 'user-2', rateAmount: 2800, currency: 'INR', minutes: 600, cost: 28000, entryCount: 1 }, // rate changed mid-project → two honest lines
      { userId: 'user-3', rateAmount: 50, currency: 'USD', minutes: 600, cost: 500, entryCount: 1 },    // §127 excluded
    ], [
      { vendorName: 'Stock Assets', currency: 'INR', cost: 10000, expenseCount: 2 },
      { vendorName: 'Overseas Lic', currency: 'USD', cost: 800, expenseCount: 1 }, // §127 excluded
    ], { 'user-1': 'Dev A', 'user-2': 'Dev B' });

    // cost-desc: 50k (Dev B @2500) > 36k (Dev A) > 28k (Dev B @2800 — the
    // rate change shows as its own honest line, §78).
    expect(dd.labor.map(l => [l.userName, l.rate!.amount])).toEqual([
      ['Dev B', 2500],
      ['Dev A', 900],
      ['Dev B', 2800],
    ]);
    expect(dd.labor[0].hours).toBe(20);
    expect(dd.labor[0].rate!.amount).toBe(2500); // frozen snapshot, never live
    expect(dd.labor.every(l => l.cost.currency === 'INR')).toBe(true);
    expect(dd.labor.some(l => l.userId === 'user-3')).toBe(false);
    expect(dd.expenses.map(e => e.vendorName)).toEqual(['Stock Assets']);
    // A user with no resolved label is null, never a fabricated name.
    expect(dd.labor.find(l => l.userId === 'user-1')!.userName).toBe('Dev A');
  });

  it('a rate line the snapshot never priced carries rate null and cost 0 (§96 honesty)', () => {
    const dd = buildProfitabilityDrillDown('INR', [
      { userId: 'user-9', rateAmount: null, currency: 'INR', minutes: 120, cost: 0, entryCount: 1 },
    ], [], {});
    expect(dd.labor[0].rate).toBeNull();
    expect(dd.labor[0].cost.amount).toBe(0);
    expect(dd.labor[0].userName).toBeNull();
  });
});

// ---------- §127: currency discipline ----------

describe('§127 — other-currency sources are excluded + counted, never converted', () => {
  it('mismatched buckets leave the framed number, get counted, and produce a note', () => {
    const r = computeProjectProfitability({
      project: proj(),
      time: time({
        approvedMinutes: 600,
        laborCost: [{ currency: 'INR', amount: 9000 }, { currency: 'USD', amount: 450 }],
        billableValue: [{ currency: 'INR', amount: 25000 }, { currency: 'USD', amount: 1250 }],
        unbilledTime: [{ currency: 'INR', amount: 25000 }, { currency: 'EUR', amount: 300 }],
      }),
      expenses: exp({ cost: [{ currency: 'GBP', amount: 100 }], unbilledCharge: [{ currency: 'GBP', amount: 100 }] }),
    });
    expect(r.applicableRevenue.amount).toBe(25000); // USD 1250 never converted in
    expect(r.laborCost.amount).toBe(9000);
    expect(r.expenseCost.amount).toBe(0);
    expect(r.unbilledAmount.amount).toBe(25000);
    expect(r.currencyMismatches).toBe(5);
    expect(r.notes.some(n => n.includes('§127'))).toBe(true);
  });

  it('invoice currencies other than the project currency are excluded from billed/collected', () => {
    const r = computeProjectProfitability({
      project: proj(),
      invoices: inv({
        invoiceCount: 2,
        billed: [{ currency: 'INR', amount: 100000 }, { currency: 'USD', amount: 2000 }],
        collected: [{ currency: 'USD', amount: 2000 }],
      }),
    });
    expect(r.billedAmount.amount).toBe(100000);
    expect(r.collectedAmount.amount).toBe(0);
    expect(r.currencyMismatches).toBe(2);
  });
});

// ---------- §81: portfolio rollup (local store, Mongo-identical semantics) ----------

describe('§81 — getPortfolioProfitability', () => {
  beforeEach(() => {
    (connectDb as Mock).mockReset().mockResolvedValue({ db: null });
    (initLocalDb as Mock).mockReset();
    (getProjects as Mock).mockReset();
    (getClientById as Mock).mockReset();
  });

  const projTm = proj({ id: 'proj-1', name: 'T&M Site', startDate: '2026-09-01' });
  const projFf = proj({
    id: 'proj-2', name: 'Fixed Build', startDate: '2026-08-01',
    billingModel: 'FIXED_FEE', contractValue: 300000, clientId: 'client-2',
  });

  function seedStore() {
    (initLocalDb as Mock).mockReturnValue({
      timeEntries: [
        timeEntry({
          id: 't1', projectId: 'proj-1', durationMinutes: 6000,
          calculatedCost: makeMoney(90000, 'INR'),
          calculatedBillableAmount: makeMoney(250000, 'INR'),
        }),
      ],
      expenses: [
        expense({ id: 'e1', projectId: 'proj-1', amount: makeMoney(20000, 'INR'), clientChargeAmount: makeMoney(20000, 'INR') }),
      ],
      invoices: [
        invoice({ id: 'i1', projectId: 'proj-1', total: makeMoney(100000, 'INR'), amountPaid: makeMoney(60000, 'INR'), amountDue: makeMoney(40000, 'INR') }),
      ],
      projectMilestones: [] as ProjectMilestone[],
    });
  }

  it('rolls projects, clients and totals from one engine', async () => {
    (getProjects as Mock).mockResolvedValue([projTm, projFf]);
    (getClientById as Mock).mockImplementation(async (id: string) =>
      id === 'client-1' ? { id, name: 'Acme' } : { id, name: 'Beta' });
    seedStore();

    const portfolio = await getPortfolioProfitability(TENANT);
    expect(portfolio.projects).toHaveLength(2);

    const tm = portfolio.projects.find(p => p.projectId === 'proj-1')!;
    expect(tm.applicableRevenue.amount).toBe(250000);
    expect(tm.deliveryCost.amount).toBe(110000);
    expect(tm.grossProfit.amount).toBe(140000);
    expect(tm.billedAmount.amount).toBe(100000);
    expect(tm.collectedAmount.amount).toBe(60000);

    const ff = portfolio.projects.find(p => p.projectId === 'proj-2')!;
    expect(ff.applicableRevenue.amount).toBe(300000);
    expect(ff.grossProfit.amount).toBe(300000);

    // Totals: 550k revenue, 110k cost, 440k profit → 80%.
    expect(portfolio.summary.mixedCurrencies).toBe(false);
    expect(portfolio.summary.applicableRevenue!.amount).toBe(550000);
    expect(portfolio.summary.deliveryCost!.amount).toBe(110000);
    expect(portfolio.summary.grossProfit!.amount).toBe(440000);
    expect(portfolio.summary.marginPercent).toBe(80);
    // contractValue total is null unless EVERY project carries one (proj-1 has none).
    expect(portfolio.summary.contractValue).toBeNull();
    // Client rollup.
    expect(portfolio.byClient).toHaveLength(2);
    const acme = portfolio.byClient.find(c => c.clientId === 'client-1')!;
    expect(acme.clientName).toBe('Acme');
    expect(acme.applicableRevenue!.amount).toBe(250000);
    expect(acme.marginPercent).toBeCloseTo(56, 10);
  });

  it('§64 — a lossy portfolio folds to a NEGATIVE grossProfit, never a throw (§82 margin null)', async () => {
    // Regression: the folds once called makeMoney(profit), which throws on a
    // negative — a T&M project with zero revenue and approved cost took the
    // whole profitability route down with it. A loss is a real number.
    (getProjects as Mock).mockResolvedValue([projTm]);
    (getClientById as Mock).mockResolvedValue({ name: 'Acme' });
    (initLocalDb as Mock).mockReturnValue({
      timeEntries: [], // T&M with no approved time → zero revenue
      expenses: [
        expense({ id: 'e1', projectId: 'proj-1', amount: makeMoney(12000, 'INR'), clientChargeAmount: makeMoney(12000, 'INR') }),
      ],
      invoices: [], projectMilestones: [] as ProjectMilestone[],
    });

    const portfolio = await getPortfolioProfitability(TENANT);
    expect(portfolio.projects).toHaveLength(1);
    expect(portfolio.projects[0].applicableRevenue.amount).toBe(0);
    expect(portfolio.projects[0].deliveryCost.amount).toBe(12000);
    expect(portfolio.projects[0].grossProfit.amount).toBe(-12000);
    // Summary fold survives and reports the honest loss.
    expect(portfolio.summary.mixedCurrencies).toBe(false);
    expect(portfolio.summary.applicableRevenue!.amount).toBe(0);
    expect(portfolio.summary.deliveryCost!.amount).toBe(12000);
    expect(portfolio.summary.grossProfit!.amount).toBe(-12000);
    expect(portfolio.summary.marginPercent).toBeNull(); // §82 — never a fake -Infinity/0
    // Client rollup folds the same loss without throwing.
    expect(portfolio.byClient).toHaveLength(1);
    expect(portfolio.byClient[0].grossProfit!.amount).toBe(-12000);
    expect(portfolio.byClient[0].marginPercent).toBeNull();
  });

  it('?from/?to selects PROJECTS by start date — never the money inside', async () => {
    (getProjects as Mock).mockResolvedValue([projTm, projFf]);
    (getClientById as Mock).mockResolvedValue({ name: 'X' });
    seedStore();

    const portfolio = await getPortfolioProfitability(TENANT, { from: '2026-09-01' });
    expect(portfolio.projects.map(p => p.projectId)).toEqual(['proj-1']);
    expect(portfolio.summary.applicableRevenue!.amount).toBe(250000); // proj-2's money untouched, project excluded
  });

  it('problems-first sort (OVER_BUDGET > AT_RISK > WATCH > HEALTHY), then name', async () => {
    const healthy = proj({ id: 'p-h', name: 'A Healthy', startDate: '2026-09-01' });
    const over = proj({ id: 'p-o', name: 'Z Over', startDate: '2026-09-01', plannedHours: 100 });
    (getProjects as Mock).mockResolvedValue([healthy, over]);
    (getClientById as Mock).mockResolvedValue({ name: 'X' });
    (initLocalDb as Mock).mockReturnValue({
      timeEntries: [
        timeEntry({
          id: 't1', projectId: 'p-o', durationMinutes: 12000, // 200h on a 100h plan → OVER
          calculatedCost: makeMoney(100000, 'INR'),
          calculatedBillableAmount: makeMoney(200000, 'INR'),
        }),
      ],
      expenses: [], invoices: [], projectMilestones: [] as ProjectMilestone[],
    });

    const portfolio = await getPortfolioProfitability(TENANT);
    expect(portfolio.projects.map(p => p.projectId)).toEqual(['p-o', 'p-h']);
    expect(portfolio.projects[0].health).toBe('OVER_BUDGET');
    expect(portfolio.projects[0].hoursWarning?.level).toBe('OVER');
  });

  it('§127 — a currency-mixing portfolio reports null money and real counts', async () => {
    (getProjects as Mock).mockResolvedValue([
      projTm,
      proj({ id: 'proj-3', name: 'USD Project', currency: 'USD', startDate: '2026-09-01' }),
    ]);
    (getClientById as Mock).mockResolvedValue({ name: 'X' });
    seedStore();

    const portfolio = await getPortfolioProfitability(TENANT);
    expect(portfolio.summary.mixedCurrencies).toBe(true);
    expect(portfolio.summary.applicableRevenue).toBeNull();
    expect(portfolio.summary.grossProfit).toBeNull();
    expect(portfolio.summary.marginPercent).toBeNull();
    expect(portfolio.summary.projectCount).toBe(2); // counts stay real
    // The per-project rows keep their own honest single-currency numbers.
    expect(portfolio.projects.find(p => p.projectId === 'proj-3')!.currency).toBe('USD');
  });
});
