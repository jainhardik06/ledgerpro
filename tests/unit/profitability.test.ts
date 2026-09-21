/**
 * Module 1.26 — Unit: margin (profitability engine, Module 1.12).
 *
 * The engine is the SINGLE owner of the profit/margin formulas:
 *   Gross Profit = Revenue − Delivery Cost          (§5)
 *   Gross Margin = (Revenue − Cost) / Revenue       (§6)
 * Margin is null when Revenue = 0 — never a fabricated 0% or ±∞.
 */
import { describe, expect, it } from 'vitest';
import { computeProfitability } from '@/lib/agency/domain/profitability';

describe('Module 1.26 unit — gross profit (§5)', () => {
  it('profit = revenue − delivery cost', () => {
    expect(computeProfitability({ revenue: 1_520_000, deliveryCost: 860_000 }).grossProfit)
      .toBe(660_000); // the PRD example: ₹15.2L − ₹8.6L = ₹6.6L
  });

  it('zero cost → profit equals revenue', () => {
    expect(computeProfitability({ revenue: 500_000, deliveryCost: 0 }).grossProfit).toBe(500_000);
  });

  it('cost above revenue → negative profit (a loss is a loss, never clamped)', () => {
    expect(computeProfitability({ revenue: 100_000, deliveryCost: 250_000 }).grossProfit).toBe(-150_000);
  });

  it('deterministic — same inputs, same output', () => {
    const a = computeProfitability({ revenue: 123_456, deliveryCost: 45_678 });
    const b = computeProfitability({ revenue: 123_456, deliveryCost: 45_678 });
    expect(a).toEqual(b);
  });
});

describe('Module 1.26 unit — gross margin (§6)', () => {
  it('margin = (revenue − cost) / revenue', () => {
    const { grossMargin } = computeProfitability({ revenue: 1_520_000, deliveryCost: 860_000 });
    expect(grossMargin).toBeCloseTo(660_000 / 1_520_000, 12); // ≈ 43.4%
    expect(grossMargin).toBeCloseTo(0.4342, 3);
  });

  it('NO-BASELINE RULE: revenue = 0 → margin null, never 0 and never ±∞', () => {
    expect(computeProfitability({ revenue: 0, deliveryCost: 0 }).grossMargin).toBeNull();
    expect(computeProfitability({ revenue: 0, deliveryCost: 50_000 }).grossMargin).toBeNull();
  });

  it('full margin (no cost) → 1', () => {
    expect(computeProfitability({ revenue: 400_000, deliveryCost: 0 }).grossMargin).toBe(1);
  });

  it('negative margin when cost exceeds revenue', () => {
    expect(computeProfitability({ revenue: 100_000, deliveryCost: 250_000 }).grossMargin).toBe(-1.5);
  });
});
