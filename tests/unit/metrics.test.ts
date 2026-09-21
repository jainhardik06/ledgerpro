/**
 * Module 1.26 — Unit: revenue / billing / collection / unbilled metrics.
 *
 * MODULE 1.5 SEPARATION under test: Contract Value, Invoiced, Collected, and
 * Unbilled are four DISTINCT metrics, each owned by exactly ONE function in
 * analytics/metrics.ts (Module 1.19). These tests pin:
 *
 *   1. Each owner returns the Module 1 zero-value contract (definitions §13)
 *      — the source entities don't exist yet, so values are honestly 0.
 *   2. The financial summary is a THIN grouping: every field equals its
 *      owning function's output — no field is computed from another metric.
 *   3. Profit/margin delegate to the profitability engine (§5/§6) with the
 *      no-baseline rule (margin null when revenue = 0).
 */
import { describe, expect, it } from 'vitest';
import {
  getContractedRevenue,
  getInvoicedRevenue,
  getCollectedRevenue,
  getUnbilledRevenue,
  getDeliveryCost,
  getProjectProfit,
  getProjectMargin,
  getFinancialSummary,
} from '@/lib/agency/analytics/metrics';
import { computeProfitability } from '@/lib/agency/domain/profitability';

describe('Module 1.26 unit — the four financial metric owners', () => {
  it('§1 contracted revenue: zero-value contract until projects/time land', () => {
    expect(getContractedRevenue()).toBe(0);
  });

  it('§2 invoiced revenue: zero-value contract until invoices land', () => {
    expect(getInvoicedRevenue()).toBe(0);
  });

  it('§3 collected revenue: zero-value contract until payments land', () => {
    expect(getCollectedRevenue()).toBe(0);
  });

  it('§7 unbilled revenue: zero-value contract until projects+time land', () => {
    expect(getUnbilledRevenue()).toBe(0);
  });

  it('§4 delivery cost: zero-value contract', () => {
    expect(getDeliveryCost()).toBe(0);
  });

  it('each owner is deterministic — repeated calls agree', () => {
    expect(getContractedRevenue()).toBe(getContractedRevenue());
    expect(getInvoicedRevenue()).toBe(getInvoicedRevenue());
    expect(getCollectedRevenue()).toBe(getCollectedRevenue());
    expect(getUnbilledRevenue()).toBe(getUnbilledRevenue());
  });
});

describe('Module 1.26 unit — metric separation (Module 1.5/1.19)', () => {
  it('the financial summary is a thin grouping of the owners — never a formula', () => {
    const summary = getFinancialSummary();
    // Every field must equal its OWNER's output. If a field were derived from
    // another metric (e.g. Collected shown as Revenue), this equality breaks.
    expect(summary.contractedRevenue).toBe(getContractedRevenue());
    expect(summary.billedRevenue).toBe(getInvoicedRevenue());
    expect(summary.collectedRevenue).toBe(getCollectedRevenue());
    expect(summary.unbilledRevenue).toBe(getUnbilledRevenue());
    expect(summary.deliveryCost).toBe(getDeliveryCost());
  });

  it('no metric can leak into another: zero-state means all owners are 0', () => {
    const s = getFinancialSummary();
    expect(s.contractedRevenue).toBe(0);
    expect(s.billedRevenue).toBe(0);
    expect(s.collectedRevenue).toBe(0);
    expect(s.unbilledRevenue).toBe(0);
  });
});

describe('Module 1.26 unit — profit & margin delegate to the profitability engine', () => {
  it('§5 gross profit = engine output over the same owners (§1 − §4)', () => {
    const expected = computeProfitability({
      revenue: getContractedRevenue(),
      deliveryCost: getDeliveryCost(),
    }).grossProfit;
    expect(getProjectProfit()).toBe(expected);
    expect(getProjectProfit()).toBe(0); // Module 1 zero state
  });

  it('§6 margin follows the no-baseline rule: revenue 0 → null, never 0', () => {
    const expected = computeProfitability({
      revenue: getContractedRevenue(),
      deliveryCost: getDeliveryCost(),
    }).grossMargin;
    expect(getProjectMargin()).toBe(expected);
    expect(getProjectMargin()).toBeNull(); // Revenue = 0 at Module 1
  });
});

describe('Module 13 (§118) unit — dashboard profit/margin take engine ACTUALS', () => {
  // The §70 agreement rule in miniature: the same numbers the profitability
  // reports show. Suite 43's live shape — revenue 5000, delivery cost 1800.
  const actuals = { applicableRevenue: 5000, deliveryCost: 1800 };

  it('§5 profit = engine grossProfit over the actuals (5000 − 1800 = 3200)', () => {
    expect(getProjectProfit(actuals.applicableRevenue, actuals.deliveryCost)).toBe(3200);
    expect(getProjectProfit(actuals.applicableRevenue, actuals.deliveryCost))
      .toBe(computeProfitability({ revenue: 5000, deliveryCost: 1800 }).grossProfit);
  });

  it('§6 margin is PERCENT (0–100): 3200/5000 = 64, never the 0–1 ratio', () => {
    expect(getProjectMargin(actuals.applicableRevenue, actuals.deliveryCost)).toBe(64);
    expect(getProjectMargin(actuals.applicableRevenue, actuals.deliveryCost))
      .toBeCloseTo(64, 12);
  });

  it('§6 no-baseline rule over actuals: revenue 0 → null margin, profit −cost', () => {
    expect(getProjectMargin(0, 1800)).toBeNull();
    expect(getProjectProfit(0, 1800)).toBe(-1800);
  });

  it('the financial summary threads the profitability source through the owners', () => {
    const summary = getFinancialSummary(
      1_000_000, // planned §1 (a DIFFERENT line — never a profit input)
      { unbilledRevenue: 500, deliveryCost: 999 }, // §4/§7 money sources
      { invoicedRevenue: 300, collectedRevenue: 100 }, // §2/§3 money sources
      actuals, // §118 — the ONE engine's actuals
    );
    // Profit/margin come ONLY from the engine actuals, not from planned
    // contract revenue minus actual cost (the fabrication §118 forbids).
    expect(summary.projectProfit).toBe(3200);
    expect(summary.averageMargin).toBe(64);
    // The other lines keep their own owners untouched.
    expect(summary.contractedRevenue).toBe(1_000_000);
    expect(summary.unbilledRevenue).toBe(500);
    expect(summary.deliveryCost).toBe(999);
    expect(summary.billedRevenue).toBe(300);
    expect(summary.collectedRevenue).toBe(100);
  });

  it('without the profitability source the owners fall back — never planned−actual math', () => {
    const summary = getFinancialSummary(1_000_000, { unbilledRevenue: 500, deliveryCost: 999 });
    // No engine actuals passed → zero-value contract (§13): the dashboard's
    // readiness flags keep these pending; a planned−actual profit never appears.
    expect(summary.projectProfit).toBe(0);
    expect(summary.averageMargin).toBeNull();
  });
});
