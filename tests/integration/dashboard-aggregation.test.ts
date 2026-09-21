/**
 * Module 1.26 — Integration: dashboard query + aggregation correctness.
 *
 * getAgencyDashboard() is the single composer (Step 0.12 / Module 1.19):
 * the API route calls it and the React layer only renders. These tests pin:
 *   - the payload is structurally complete (every contract section present)
 *   - metric objects are built correctly by buildDashboardMetrics
 *     (kind, value, sourceReady propagation — no raw numbers leak)
 *   - Module 1.22: all sources are not-ready → sourceReady false everywhere
 *     (zero never masquerades as live data)
 *   - derived totals are derived, never independent (unbilled = sum of lines)
 */
import { describe, expect, it } from 'vitest';
import {
  getAgencyDashboard,
  buildDashboardMetrics,
  getAgencyUnbilledSummary,
  buildProjectHealthRow,
} from '@/lib/agency/analytics/dashboard';
import type {
  AgencyFinancialSummary, AgencyReceivablesSummary, AgencyWorkSummary,
} from '@/lib/agency/types/agency.dashboard';

const TODAY = '2026-09-09';

describe('Module 1.26 integration — dashboard query composition', () => {
  it('returns the complete payload contract: every section present', () => {
    const d = getAgencyDashboard('THIS_MONTH', 'Asia/Kolkata', TODAY);
    for (const key of [
      'metrics', 'financialSummary', 'receivables', 'work', 'unbilled',
      'snapshot', 'trends', 'projects', 'alerts', 'period', 'periodScope',
      'dateRange', 'deltas',
    ] as const) {
      expect(d, `payload.${key} must be present`).toHaveProperty(key);
    }
  });

  it('Module 1.22/Module 3 §92: project metrics are LIVE, later-module metrics stay not-ready — never fake live zeros', () => {
    const d = getAgencyDashboard('THIS_MONTH', 'Asia/Kolkata', TODAY);
    const m = d.metrics;
    // Module 3 (Step 3.8): the project entity exists and its planned
    // metrics are live — with NO sources passed, the zero-value fallback
    // still marks them ready (the store exists; the values are real zeros).
    for (const metric of [m.contractedRevenue, m.activeProjects, m.atRiskProjects]) {
      expect(metric.sourceReady, `${metric.kind} metric must be sourceReady:true after Module 3`).toBe(true);
    }
    // Everything owned by later modules stays pending — a metric never
    // renders as live before its source entity exists.
    const laterModuleMetrics = [
      m.billedRevenue, m.collectedRevenue, m.unbilledRevenue,
      m.totalHours, m.billableHours, m.nonBillableHours,
      m.billablePercent, m.deliveryCost, m.projectProfit, m.averageMargin,
      m.outstandingReceivables, m.dueSoonReceivables, m.overdueReceivables,
      m.overdueInvoiceCount, m.cashCollectionRate,
    ];
    for (const metric of laterModuleMetrics) {
      expect(metric.sourceReady, `${metric.kind} metric must be sourceReady:false until its module lands`).toBe(false);
    }
  });

  it('deltas never appear before values do: all null at Module 1', () => {
    const d = getAgencyDashboard('THIS_MONTH', 'Asia/Kolkata', TODAY);
    expect(d.deltas).toEqual({
      contractedRevenue: null, billedRevenue: null,
      collectedRevenue: null, unbilledRevenue: null,
    });
  });

  it('portfolio table, alerts, and trends are empty (honestly, not fabricated)', () => {
    const d = getAgencyDashboard('THIS_MONTH', 'Asia/Kolkata', TODAY);
    expect(d.projects).toEqual([]);
    expect(d.alerts).toEqual([]);
    expect(d.trends).toEqual({ points: [], sourceReady: false });
  });

  it('atRisk count is derived from the portfolio rows (aggregation, not a second source)', () => {
    const d = getAgencyDashboard('THIS_MONTH', 'Asia/Kolkata', TODAY);
    const expected = d.projects.filter(
      p => p.status === 'AT_RISK' || p.status === 'OVER_BUDGET'
    ).length;
    expect(d.metrics.atRiskProjects.value).toBe(expected);
  });
});

describe('Module 1.26 integration — metric object construction (aggregation correctness)', () => {
  const financial: AgencyFinancialSummary = {
    contractedRevenue: 1_520_000, billedRevenue: 1_200_000, collectedRevenue: 900_000,
    cashCollectionRate: 75,
    unbilledRevenue: 320_000, deliveryCost: 860_000, projectProfit: 660_000,
    averageMargin: 43.42, // PERCENT (0–100) — the percentage-metric convention
  };
  const receivables: AgencyReceivablesSummary = {
    outstanding: 840_000, overdueAmount: 210_000, overdueCount: 4, dueSoon: 120_000,
    byAgingBucket: { CURRENT: 630_000, '1-30': 100_000, '31-60': 60_000, '61-90': 30_000, '90+': 20_000 },
  };
  const work: AgencyWorkSummary = {
    activeProjects: 12, hoursLogged: 1_240, billableHours: 910,
    nonBillableHours: 330, billablePercent: 73.4, // PERCENT (0–100) — §8 production scale
  };

  it('builds the typed metric set: right kind, right value, ready flags propagate per source', () => {
    const m = buildDashboardMetrics(financial, receivables, work, 3, {
      projects: true, time: false, invoices: true, payments: false,
    });

    // kind correctness — the UI switch depends on it
    expect(m.contractedRevenue.kind).toBe('money');
    expect(m.activeProjects.kind).toBe('count');
    expect(m.totalHours.kind).toBe('hours');
    expect(m.averageMargin.kind).toBe('percentage');
    expect(m.cashCollectionRate.kind).toBe('percentage');

    // value correctness — inputs map 1:1, never recomputed
    expect(m.contractedRevenue.value).toBe(1_520_000);
    expect(m.collectedRevenue.value).toBe(900_000);
    expect(m.activeProjects.value).toBe(12);
    expect(m.billableHours.value).toBe(910);
    expect(m.billablePercent.value).toBeCloseTo(73.4, 12);
    expect(m.cashCollectionRate.value).toBe(75);

    // sourceReady follows its owning source entity (Module 1.22 semantics)
    expect(m.contractedRevenue.sourceReady).toBe(true);   // projects
    expect(m.billedRevenue.sourceReady).toBe(true);        // invoices
    expect(m.collectedRevenue.sourceReady).toBe(false);    // payments not ready
    // §117 — the rate needs BOTH the invoiced and the collected side live
    expect(m.cashCollectionRate.sourceReady).toBe(false);
    expect(m.totalHours.sourceReady).toBe(false);          // time not ready
    expect(m.unbilledRevenue.sourceReady).toBe(false);     // needs projects AND time
    expect(m.deliveryCost.sourceReady).toBe(false);        // needs projects AND time
  });

  it('percentage metrics keep null as null — never coerced to 0', () => {
    const m = buildDashboardMetrics(
      { ...financial, averageMargin: null },
      receivables, work, 0,
      { projects: true, time: true, invoices: true, payments: true },
    );
    expect(m.averageMargin.value).toBeNull();
  });

  it('receivables map into their distinct metrics (outstanding ≠ due soon ≠ overdue)', () => {
    const m = buildDashboardMetrics(financial, receivables, work, 0, {
      projects: true, time: true, invoices: true, payments: true,
    });
    expect(m.outstandingReceivables.value).toBe(840_000);
    expect(m.dueSoonReceivables.value).toBe(120_000);
    expect(m.overdueReceivables.value).toBe(210_000);
    expect(m.overdueInvoiceCount.value).toBe(4);
  });
});

describe('Module 1.26 integration — derived totals are derived', () => {
  it('totalUnbilled is ALWAYS the sum of the three lines, never an independent value', () => {
    const u = getAgencyUnbilledSummary();
    expect(u.totalUnbilled).toBe(u.unbilledTime + u.unbilledExpenses + u.unbilledMilestones);
  });

  it('buildProjectHealthRow routes status through the deterministic engine (never caller-assigned)', () => {
    const row = buildProjectHealthRow({
      projectId: 'p1', name: 'Redesign', clientName: 'Client A',
      contractValue: 500_000, cost: 480_000, billed: 300_000, collected: 250_000,
      margin: 4, budgetBurn: 96, completed: false, // PERCENT (0–100) — the table's display scale
    });
    // burn 96% > 90% AND margin 4% <= 15% → AT_RISK (engine takes 0–1 ratios;
    // buildProjectHealthRow converts at the single boundary)
    expect(row.status).toBe('AT_RISK');
    expect(row.contractValue).toBe(500_000);
    expect(row.margin).toBe(4);
  });

  it('buildProjectHealthRow percent inputs map to the same verdicts as their 0–1 ratios (scale boundary)', () => {
    const verdict = (margin: number | null, budgetBurn: number | null) =>
      buildProjectHealthRow({
        projectId: 'p', name: 'P', clientName: 'C',
        contractValue: 100, cost: 0, billed: 0, collected: 0,
        margin, budgetBurn, completed: false,
      }).status;
    // margin 20% is inside the WATCH band [15%, 25%) with no burn baseline
    expect(verdict(20, null)).toBe('WATCH');
    // margin 40% ≥ target with burn 60% < 75% → HEALTHY
    expect(verdict(40, 60)).toBe('HEALTHY');
    // burn 101% → OVER_BUDGET regardless of margin
    expect(verdict(50, 101)).toBe('OVER_BUDGET');
    // null margin / null burn never satisfy a risk branch (§82 discipline)
    expect(verdict(null, null)).toBe('HEALTHY');
  });
});

describe('Module 8 (§119) integration — time + expense money composition', () => {
  const timeMoney = { deliveryCost: 1800, unbilledTime: 5000, costCurrency: 'INR', unbilledCurrency: 'INR' };
  const expenseMoney = { deliveryCost: 10000, unbilledExpenses: 12000, costCurrency: 'INR', unbilledCurrency: 'INR' };
  const work = { hoursLogged: 3, billableHours: 2.75 };

  it('§4/§7 combine across the two stores: cost 1800+10000, unbilled 5000+12000, all live', () => {
    const d = getAgencyDashboard('THIS_MONTH', 'Asia/Kolkata', TODAY, undefined, {
      work, timeMoney, expenseMoney,
    });
    expect(d.metrics.deliveryCost.value).toBe(11_800);
    expect(d.metrics.deliveryCost.sourceReady).toBe(true);
    expect(d.metrics.unbilledRevenue.value).toBe(17_000);
    expect(d.metrics.unbilledRevenue.sourceReady).toBe(true);
    // The breakdown keeps its per-source lines; the total is their sum.
    expect(d.unbilled.unbilledTime).toBe(5000);
    expect(d.unbilled.unbilledExpenses).toBe(12_000);
    expect(d.unbilled.totalUnbilled).toBe(17_000);
  });

  it('an empty expense side (no currency, zero totals) still combines — zeros are real', () => {
    const d = getAgencyDashboard('THIS_MONTH', 'Asia/Kolkata', TODAY, undefined, {
      work,
      timeMoney,
      expenseMoney: { deliveryCost: 0, unbilledExpenses: 0, costCurrency: null, unbilledCurrency: null },
    });
    expect(d.metrics.deliveryCost.value).toBe(1800);
    expect(d.metrics.unbilledRevenue.value).toBe(5000);
    expect(d.metrics.deliveryCost.sourceReady).toBe(true);
  });

  it('an unresolved expense query degrades the money side to pending — a time-only cost is never shown as the complete delivery cost', () => {
    const d = getAgencyDashboard('THIS_MONTH', 'Asia/Kolkata', TODAY, undefined, {
      work, timeMoney,   // no expenseMoney
    });
    expect(d.metrics.deliveryCost.sourceReady).toBe(false);
    expect(d.metrics.unbilledRevenue.sourceReady).toBe(false);
    // Hours stay live — they never depended on the expense store.
    expect(d.metrics.totalHours.sourceReady).toBe(true);
  });

  it('currency disagreement (time INR, expenses USD) → pending money, never a cross-currency sum', () => {
    const d = getAgencyDashboard('THIS_MONTH', 'Asia/Kolkata', TODAY, undefined, {
      work,
      timeMoney,
      expenseMoney: { deliveryCost: 100, unbilledExpenses: 120, costCurrency: 'USD', unbilledCurrency: 'USD' },
    });
    expect(d.metrics.deliveryCost.sourceReady).toBe(false);
    expect(d.metrics.unbilledRevenue.sourceReady).toBe(false);
  });

  it('mixed-currency null totals from either store keep the money side pending', () => {
    const d = getAgencyDashboard('THIS_MONTH', 'Asia/Kolkata', TODAY, undefined, {
      work,
      timeMoney: { deliveryCost: null, unbilledTime: null, costCurrency: null, unbilledCurrency: null },
      expenseMoney,
    });
    expect(d.metrics.deliveryCost.sourceReady).toBe(false);
    expect(d.metrics.unbilledRevenue.sourceReady).toBe(false);
  });
});

describe('Module 10 (§117) integration — Cash Collection Rate', () => {
  // The route resolves receivables and invoice money from the SAME query —
  // a live rate therefore always has both in scope (mirrored here).
  const receivables = {
    outstanding: 60_000, dueSoon: 0, overdueAmount: 0, overdueCount: 0,
    byAgingBucket: { CURRENT: 60_000, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 } as const,
  };

  it('collected ÷ invoiced, live, on the 0–100 scale (240000/300000 → 80)', () => {
    const d = getAgencyDashboard('THIS_MONTH', 'Asia/Kolkata', TODAY, undefined, {
      receivables,
      invoiceMoney: { invoicedRevenue: 300_000, collectedRevenue: 240_000 },
    });
    const rate = d.metrics.cashCollectionRate;
    expect(rate.kind).toBe('percentage');
    expect(rate.sourceReady).toBe(true);
    expect(rate.value).toBe(80);
  });

  it('needs BOTH sides resolved — a missing collected side keeps it pending', () => {
    const d = getAgencyDashboard('THIS_MONTH', 'Asia/Kolkata', TODAY, undefined, {
      receivables,
      invoiceMoney: { invoicedRevenue: 300_000 },   // collected unresolved (mixed currency)
    });
    expect(d.metrics.cashCollectionRate.sourceReady).toBe(false);
    expect(d.metrics.cashCollectionRate.value).toBeNull();
  });

  it('nothing invoiced yet (honest single-currency zero) → live metric, null value — never a fake 0%', () => {
    const d = getAgencyDashboard('THIS_MONTH', 'Asia/Kolkata', TODAY, undefined, {
      receivables,
      invoiceMoney: { invoicedRevenue: 0, collectedRevenue: 0 },
    });
    expect(d.metrics.cashCollectionRate.sourceReady).toBe(true);
    expect(d.metrics.cashCollectionRate.value).toBeNull();
  });

  it('no invoice-money source at all → pending, never a fabricated ratio', () => {
    const d = getAgencyDashboard('THIS_MONTH', 'Asia/Kolkata', TODAY);
    expect(d.metrics.cashCollectionRate.sourceReady).toBe(false);
    expect(d.metrics.cashCollectionRate.value).toBeNull();
  });
});

describe('Module 13 (§118) integration — dashboard profit/margin from the ONE engine', () => {
  const work = { hoursLogged: 2.75, billableHours: 2.75 };
  const timeMoney = { deliveryCost: 1800, unbilledTime: 5000, costCurrency: 'INR', unbilledCurrency: 'INR' };
  const expenseMoney = { deliveryCost: 0, unbilledExpenses: 0, costCurrency: null, unbilledCurrency: null };

  it('engine actuals go live: profit 5000−1800 = 3200, margin 64 on the 0–100 scale', () => {
    const d = getAgencyDashboard('THIS_MONTH', 'Asia/Kolkata', TODAY, undefined, {
      work, timeMoney, expenseMoney,
      profitability: { applicableRevenue: 5000, deliveryCost: 1800 },
    });
    expect(d.metrics.projectProfit.kind).toBe('money');
    expect(d.metrics.projectProfit.sourceReady).toBe(true);
    expect(d.metrics.projectProfit.value).toBe(3200);
    expect(d.metrics.averageMargin.kind).toBe('percentage');
    expect(d.metrics.averageMargin.sourceReady).toBe(true);
    expect(d.metrics.averageMargin.value).toBeCloseTo(64, 12);
  });

  it('§82 over the engine pair: revenue 0 → live margin null (no baseline), profit −cost', () => {
    const d = getAgencyDashboard('THIS_MONTH', 'Asia/Kolkata', TODAY, undefined, {
      work, timeMoney, expenseMoney,
      profitability: { applicableRevenue: 0, deliveryCost: 12000 },
    });
    expect(d.metrics.projectProfit.sourceReady).toBe(true);
    expect(d.metrics.projectProfit.value).toBe(-12000);
    expect(d.metrics.averageMargin.sourceReady).toBe(true);
    expect(d.metrics.averageMargin.value).toBeNull();
  });

  it('§127 mixed-currency portfolio (null totals) → profit/margin stay pending, never converted', () => {
    const d = getAgencyDashboard('THIS_MONTH', 'Asia/Kolkata', TODAY, undefined, {
      work, timeMoney, expenseMoney,
      profitability: { applicableRevenue: null, deliveryCost: null },
    });
    expect(d.metrics.projectProfit.sourceReady).toBe(false);
    expect(d.metrics.averageMargin.sourceReady).toBe(false);
  });

  it('without the engine source profit NEVER falls back to planned contract − actual cost', () => {
    const d = getAgencyDashboard('THIS_MONTH', 'Asia/Kolkata', TODAY, undefined, {
      work, timeMoney, expenseMoney,
      contractedRevenue: 1_000_000, // the PLANNED Module 3 contract — not a profit input
      // no profitability source: the honest state is the zero-value contract,
      // pending — never 1000000 − 1800.
    });
    expect(d.metrics.projectProfit.value).toBe(0);
    expect(d.metrics.projectProfit.sourceReady).toBe(false);
    expect(d.metrics.averageMargin.value).toBeNull();
  });

  it('profit/margin do not wait on the time sources — the engine pair alone makes them live', () => {
    const d = getAgencyDashboard('THIS_MONTH', 'Asia/Kolkata', TODAY, undefined, {
      profitability: { applicableRevenue: 5000, deliveryCost: 1800 },
      // no work/timeMoney/expenseMoney: the deliveryCost KPI stays pending,
      // but profit/margin are engine-owned and go live regardless (§70).
    });
    expect(d.metrics.deliveryCost.sourceReady).toBe(false);
    expect(d.metrics.projectProfit.sourceReady).toBe(true);
    expect(d.metrics.projectProfit.value).toBe(3200);
    expect(d.metrics.averageMargin.sourceReady).toBe(true);
  });
});
