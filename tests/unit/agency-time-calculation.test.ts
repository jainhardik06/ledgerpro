/**
 * Module 7, Sprint 7D/7E — unit tests for the §127 time economics engine
 * (src/lib/agency/domain/time-calculation.ts).
 *
 * Pure-function tests: no db mocks needed. These lock the calculation
 * contract the whole vertical depends on:
 *
 *   §23   cost = hours × costRateSnapshot; billable = hours × billingRateSnapshot
 *   §24   missing snapshot side → NO amount (never zero)
 *   money all arithmetic in minor units, half-up once (833.34 × 0.5 = 416.67,
 *         not 416.665)
 *   mixed aggregation over mixed currencies → null totals + flag, never a
 *         converted or thrown number
 */
import { describe, it, expect } from 'vitest';
import { calculateTimeEconomics, aggregateTimeEconomics } from '@/lib/agency/domain/time-calculation';
import type { RateSnapshot } from '@/lib/agency/types/time';
import { makeMoney } from '@/lib/agency/types/money';

const COST_900: RateSnapshot = { amount: 900, currency: 'INR', unit: 'HOUR', source: 'USER_COST_ASSIGNMENT' };
const BILL_2500: RateSnapshot = { amount: 2500, currency: 'INR', unit: 'HOUR', source: 'CLIENT_RATE_CARD' };

describe('calculateTimeEconomics (§23/§24)', () => {
  it('90 billable minutes at 900/2500 → 1350 cost, 3750 billable', () => {
    const r = calculateTimeEconomics({
      durationMinutes: 90, billable: true,
      costRateSnapshot: COST_900, billingRateSnapshot: BILL_2500,
    });
    expect(r.calculatedCost).toEqual(makeMoney(1350, 'INR'));
    expect(r.calculatedBillableAmount).toEqual(makeMoney(3750, 'INR'));
  });

  it('8 hours → the §136 release-gate numbers (7200 / 20000)', () => {
    const r = calculateTimeEconomics({
      durationMinutes: 480, billable: true,
      costRateSnapshot: COST_900, billingRateSnapshot: BILL_2500,
    });
    expect(r.calculatedCost).toEqual(makeMoney(7200, 'INR'));
    expect(r.calculatedBillableAmount).toEqual(makeMoney(20000, 'INR'));
  });

  it('§24 — missing snapshots yield NO amounts, never zero', () => {
    const r = calculateTimeEconomics({ durationMinutes: 60, billable: true });
    expect(r.calculatedCost).toBeUndefined();
    expect(r.calculatedBillableAmount).toBeUndefined();
  });

  it('§17 — non-billable work carries cost only', () => {
    const r = calculateTimeEconomics({
      durationMinutes: 60, billable: false,
      costRateSnapshot: COST_900, billingRateSnapshot: BILL_2500,
    });
    expect(r.calculatedCost).toEqual(makeMoney(900, 'INR'));
    expect(r.calculatedBillableAmount).toBeUndefined();
  });

  it('a billing snapshot without billable=true prices nothing', () => {
    // Defensive: even if a caller passes both, the flag gates the amount.
    const r = calculateTimeEconomics({
      durationMinutes: 60, billable: false,
      billingRateSnapshot: BILL_2500,
    });
    expect(r.calculatedBillableAmount).toBeUndefined();
  });

  it('minor-unit rounding: 30m at 833.335 (snapped 833.34) → 416.67', () => {
    const r = calculateTimeEconomics({
      durationMinutes: 30, billable: false,
      costRateSnapshot: { amount: 833.335, currency: 'INR', unit: 'HOUR', source: 'ORGANIZATION_RATE_CARD' },
    });
    // makeMoney rounds 833.335 → 833.34 at construction; × 0.5 in minor
    // units = 416.67 exactly.
    expect(r.calculatedCost).toEqual(makeMoney(416.67, 'INR'));
  });

  it('1 minute at 900 → 15.00 (13.89 for 833.34 — minute-level precision holds)', () => {
    const r = calculateTimeEconomics({
      durationMinutes: 1, billable: false, costRateSnapshot: COST_900,
    });
    expect(r.calculatedCost).toEqual(makeMoney(15, 'INR'));
  });

  it('cost and bill sides are currency-independent (INR cost, USD billing)', () => {
    const r = calculateTimeEconomics({
      durationMinutes: 120, billable: true,
      costRateSnapshot: { amount: 900, currency: 'INR', unit: 'HOUR', source: 'USER_COST_ASSIGNMENT' },
      billingRateSnapshot: { amount: 30, currency: 'USD', unit: 'HOUR', source: 'CLIENT_RATE_CARD' },
    });
    expect(r.calculatedCost).toEqual(makeMoney(1800, 'INR'));
    expect(r.calculatedBillableAmount).toEqual(makeMoney(60, 'USD'));
  });
});

describe('aggregateTimeEconomics (§118/§119 aggregation)', () => {
  it('empty set → zero minutes, null totals, no mixed flags', () => {
    const t = aggregateTimeEconomics([]);
    expect(t.totalMinutes).toBe(0);
    expect(t.totalCost).toBeNull();
    expect(t.totalBillable).toBeNull();
    expect(t.mixedCostCurrencies).toBe(false);
    expect(t.mixedBillableCurrencies).toBe(false);
  });

  it('sums stored economics and minutes across entries', () => {
    const t = aggregateTimeEconomics([
      { durationMinutes: 90, calculatedCost: makeMoney(1350, 'INR'), calculatedBillableAmount: makeMoney(3750, 'INR') },
      { durationMinutes: 30, calculatedCost: makeMoney(450, 'INR'), calculatedBillableAmount: makeMoney(1250, 'INR') },
    ]);
    expect(t.totalMinutes).toBe(120);
    expect(t.totalCost).toEqual(makeMoney(1800, 'INR'));
    expect(t.totalBillable).toEqual(makeMoney(5000, 'INR'));
    expect(t.mixedCostCurrencies).toBe(false);
  });

  it('draft/blocked entries contribute duration but no money (§24 honest)', () => {
    const t = aggregateTimeEconomics([
      { durationMinutes: 60, calculatedCost: makeMoney(900, 'INR'), calculatedBillableAmount: makeMoney(2500, 'INR') },
      { durationMinutes: 45 },  // DRAFT — tracked, financially unrecognized
    ]);
    expect(t.totalMinutes).toBe(105);
    expect(t.totalCost).toEqual(makeMoney(900, 'INR'));
    expect(t.totalBillable).toEqual(makeMoney(2500, 'INR'));
  });

  it('mixed cost currencies → null totalCost + flag, billable still sums', () => {
    const t = aggregateTimeEconomics([
      { durationMinutes: 60, calculatedCost: makeMoney(900, 'INR'), calculatedBillableAmount: makeMoney(2500, 'INR') },
      { durationMinutes: 60, calculatedCost: makeMoney(12, 'USD'), calculatedBillableAmount: makeMoney(2500, 'INR') },
    ]);
    expect(t.totalCost).toBeNull();
    expect(t.mixedCostCurrencies).toBe(true);
    expect(t.totalBillable).toEqual(makeMoney(5000, 'INR'));
    expect(t.mixedBillableCurrencies).toBe(false);
  });

  it('mixed billable currencies → null totalBillable + flag', () => {
    const t = aggregateTimeEconomics([
      { durationMinutes: 60, calculatedCost: makeMoney(900, 'INR'), calculatedBillableAmount: makeMoney(2500, 'INR') },
      { durationMinutes: 60, calculatedCost: makeMoney(900, 'INR'), calculatedBillableAmount: makeMoney(30, 'USD') },
    ]);
    expect(t.totalCost).toEqual(makeMoney(1800, 'INR'));
    expect(t.totalBillable).toBeNull();
    expect(t.mixedBillableCurrencies).toBe(true);
  });

  it('single-currency zero amounts still aggregate (0 is a real computed value)', () => {
    const t = aggregateTimeEconomics([
      { durationMinutes: 60, calculatedCost: makeMoney(0, 'INR'), calculatedBillableAmount: makeMoney(0, 'INR') },
    ]);
    expect(t.totalCost).toEqual(makeMoney(0, 'INR'));
    expect(t.totalBillable).toEqual(makeMoney(0, 'INR'));
    expect(t.mixedCostCurrencies).toBe(false);
  });
});
