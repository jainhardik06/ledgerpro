/**
 * Module 6 (Sprint 6.1) — unit: rate domain types + validators (pure layer).
 *
 * Covers:
 *   §77  overlap predicate — the MANDATORY assignment-overlap guard
 *   §79  inclusive date convention, open-ended ranges, dayBefore
 *   §95  ResolvedRate contract shape
 *   §105/§106 rate math (minor-unit discipline)
 *   §91–§93 card / entry / assignment validation
 */
import { describe, it, expect } from 'vitest';
import {
  rangesOverlap, rangeCovers, dayBefore, rateNotConfigured,
  rateAmountFor, laborContribution,
} from '@/lib/agency/types/rate';
import {
  validateRateCardCreate, validateRateCardUpdate,
  validateRateEntry, validateUserCostAssignment,
} from '@/lib/agency/validators/rate';

describe('Module 6 unit — effective-range algebra (§77/§79)', () => {
  it('detects a genuine overlap (the §77 invalid example)', () => {
    // Jan 1 → Jun 30 vs Apr 1 → Dec 31: Apr–Jun has two rates — invalid.
    expect(rangesOverlap(
      { effectiveFrom: '2026-01-01', effectiveTo: '2026-06-30' },
      { effectiveFrom: '2026-04-01', effectiveTo: '2026-12-31' }
    )).toBe(true);
  });

  it('accepts adjacent ranges — inclusive bounds touch but never share a day', () => {
    // Old closes the day before the new starts (§79 convention).
    expect(rangesOverlap(
      { effectiveFrom: '2026-01-01', effectiveTo: '2026-03-31' },
      { effectiveFrom: '2026-04-01', effectiveTo: '2026-12-31' }
    )).toBe(false);
    // Boundary identity: end == start is a shared day → overlap.
    expect(rangesOverlap(
      { effectiveFrom: '2026-01-01', effectiveTo: '2026-04-01' },
      { effectiveFrom: '2026-04-01', effectiveTo: '2026-12-31' }
    )).toBe(true);
  });

  it('treats an open-ended range as extending to +∞ (§79)', () => {
    expect(rangesOverlap(
      { effectiveFrom: '2026-01-01' }, // open
      { effectiveFrom: '2030-01-01', effectiveTo: '2030-12-31' }
    )).toBe(true);
    expect(rangesOverlap(
      { effectiveFrom: '2026-01-01', effectiveTo: '2026-06-30' },
      { effectiveFrom: '2027-01-01' } // open
    )).toBe(false);
    expect(rangesOverlap(
      { effectiveFrom: '2026-01-01' }, // both open
      { effectiveFrom: '2026-02-01' }
    )).toBe(true);
  });

  it('does not flag a closed range that ended before another began', () => {
    expect(rangesOverlap(
      { effectiveFrom: '2025-01-01', effectiveTo: '2025-12-31' },
      { effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31' }
    )).toBe(false);
  });

  it('never lets a degenerate (from > to) range overlap anything', () => {
    expect(rangesOverlap(
      { effectiveFrom: '2026-06-30', effectiveTo: '2026-01-01' },
      { effectiveFrom: '2026-01-01' }
    )).toBe(false);
  });

  it('rangeCovers is inclusive on both ends and open-ended after the start (§79)', () => {
    const r = { effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31' };
    expect(rangeCovers(r, '2026-01-01')).toBe(true);
    expect(rangeCovers(r, '2026-12-31')).toBe(true);
    expect(rangeCovers(r, '2025-12-31')).toBe(false);
    expect(rangeCovers(r, '2027-01-01')).toBe(false);
    const open = { effectiveFrom: '2026-01-01' };
    expect(rangeCovers(open, '2031-05-05')).toBe(true);
    expect(rangeCovers(open, '2025-12-31')).toBe(false);
  });

  it('dayBefore returns the inclusive close for a new version (§79)', () => {
    expect(dayBefore('2026-01-01')).toBe('2025-12-31');
    expect(dayBefore('2026-03-01')).toBe('2026-02-28');
  });
});

describe('Module 6 unit — ResolvedRate contract (§95/§96)', () => {
  it('rateNotConfigured carries status only — never a fabricated zero', () => {
    expect(rateNotConfigured()).toEqual({ status: 'NOT_CONFIGURED' });
    expect(rateNotConfigured().amount).toBeUndefined();
  });
});

describe('Module 6 unit — rate math (§105/§106)', () => {
  it('computes money from duration with the money rulebook (rate snapped to minor units first)', () => {
    expect(rateAmountFor(900, 8)).toBe(7200);
    expect(rateAmountFor(2500, 8)).toBe(20000);
    // 333.335 snaps to 333.34 minor units (33334), × 3 = 1000.02 — the
    // rulebook rounds the RATE once, then multiplies as an integer. Never
    // raw float math (333.335 × 3 drifts to 1000.00499…).
    expect(rateAmountFor(333.335, 3)).toBe(1000.02);
  });

  it('labor contribution is client value minus internal cost — not profit (§106/§107)', () => {
    expect(laborContribution(20000, 7200)).toBe(12800);
  });
});

describe('Module 6 unit — rate card validation (§91)', () => {
  const base = { name: 'Agency Cost 2026', type: 'COST', scope: 'ORGANIZATION', currency: 'INR' };

  it('accepts the required core and uppercases the currency', () => {
    const r = validateRateCardCreate({ ...base, currency: 'inr' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.currency).toBe('INR');
  });

  it('requires name, type, scope and currency', () => {
    const r = validateRateCardCreate({});
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const fields = r.errors.map(e => e.field);
      expect(fields).toEqual(expect.arrayContaining(['name', 'type', 'scope', 'currency']));
    }
  });

  it('demands clientId iff scope = CLIENT (§91)', () => {
    expect(validateRateCardCreate({ ...base, scope: 'CLIENT' }).ok).toBe(false);
    expect(validateRateCardCreate({ ...base, scope: 'CLIENT', clientId: 'cl-1' }).ok).toBe(true);
    // And forbids it for organization cards.
    expect(validateRateCardCreate({ ...base, clientId: 'cl-1' }).ok).toBe(false);
  });

  it('rejects non-ISO currencies and bad enums', () => {
    expect(validateRateCardCreate({ ...base, currency: 'rupees' }).ok).toBe(false);
    expect(validateRateCardCreate({ ...base, type: 'BOTH' }).ok).toBe(false);
    expect(validateRateCardCreate({ ...base, scope: 'GLOBAL' }).ok).toBe(false);
  });

  it('PATCH is partial: any subset validates (M4/M5 lesson)', () => {
    const r = validateRateCardUpdate({ name: 'Renamed Card' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.name).toBe('Renamed Card');
  });

  it('a sent-but-empty name is a real error, never a silent drop', () => {
    expect(validateRateCardUpdate({ name: '' }).ok).toBe(false);
    expect(validateRateCardUpdate({ name: '   ' }).ok).toBe(false);
  });
});

describe('Module 6 unit — rate entry validation (§92)', () => {
  const base = { name: 'Senior Developer', unit: 'HOUR', amount: 2500, effectiveFrom: '2026-01-01' };

  it('accepts a complete entry', () => {
    const r = validateRateEntry(base);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.amount).toBe(2500);
  });

  it('requires name and effectiveFrom; rejects negative amounts (§91/§92)', () => {
    expect(validateRateEntry({}).ok).toBe(false);
    const neg = validateRateEntry({ ...base, amount: -1 });
    expect(neg.ok).toBe(false);
    if (!neg.ok) expect(neg.errors.some(e => e.field === 'amount')).toBe(true);
  });

  it('rejects unknown units and billing types (§71/§72)', () => {
    expect(validateRateEntry({ ...base, unit: 'PIECE' }).ok).toBe(false);
    expect(validateRateEntry({ ...base, billingType: 'RETAINER' }).ok).toBe(false);
  });

  it('rejects NON_BILLABLE + billable=true as a contradiction (§72)', () => {
    const r = validateRateEntry({ ...base, billingType: 'NON_BILLABLE', billable: true });
    expect(r.ok).toBe(false);
  });

  it('rejects malformed effective dates (§78)', () => {
    expect(validateRateEntry({ ...base, effectiveFrom: 'Jan 1 2026' }).ok).toBe(false);
  });
});

describe('Module 6 unit — user cost assignment validation (§93)', () => {
  const base = { rateCardId: 'rc-1', rateCardEntryId: 'entry-1', effectiveFrom: '2026-01-01' };

  it('accepts an open-ended assignment', () => {
    const r = validateUserCostAssignment(base);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.effectiveTo).toBeUndefined();
  });

  it('requires a rate card, a rate entry and an effective-from date (§131)', () => {
    const r = validateUserCostAssignment({});
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const fields = r.errors.map(e => e.field);
      expect(fields).toEqual(expect.arrayContaining(['rateCardId', 'rateCardEntryId', 'effectiveFrom']));
    }
  });

  it('rejects effectiveTo before effectiveFrom (inclusive convention, §79)', () => {
    expect(validateUserCostAssignment({ ...base, effectiveTo: '2025-12-31' }).ok).toBe(false);
    // Same day is fine (single-day assignment).
    expect(validateUserCostAssignment({ ...base, effectiveTo: '2026-01-01' }).ok).toBe(true);
  });
});
