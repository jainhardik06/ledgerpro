/**
 * Module 16A — Unit: report view-model layer foundations (§28/§32/§36/§39).
 *
 * Covers the three Sprint 16A pieces:
 *   types.ts      — pure presentation helpers (utilization §32, row shaping)
 *   filters.ts    — the §28 common filter parse, fail-closed
 *   pagination.ts — the §39 page parse + slice (summary over ALL rows)
 */
import { describe, expect, it } from 'vitest';
import {
  timeRowFromMinutes,
  utilizationPercent,
} from '@/lib/agency/reports/types';
import { parseReportFilters } from '@/lib/agency/reports/filters';
import { parseReportPagination, slicePage } from '@/lib/agency/reports/pagination';
import { foldCurrency, sumRows, weightedMarginPercent } from '@/lib/agency/reports/summary';

const qs = (s: string) => new URLSearchParams(s);

// ---------- §32 utilization (pure presentation, minutes domain) ----------

describe('Module 16A unit — utilization (§32)', () => {
  it('utilization = billable / total × 100 on minutes', () => {
    expect(utilizationPercent(492, 600)).toBeCloseTo(82, 10); // 8.2h of 10h
  });

  it('total = 0 → 0%, never NaN (§32 explicit)', () => {
    expect(utilizationPercent(0, 0)).toBe(0);
    expect(Number.isNaN(utilizationPercent(0, 0))).toBe(false);
  });

  it('negative total is treated as no baseline → 0%', () => {
    expect(utilizationPercent(10, -5)).toBe(0);
  });

  it('timeRowFromMinutes derives hours + utilization from engine minutes', () => {
    const row = timeRowFromMinutes('u1', 'Dev', 492, 600);
    expect(row.billableHours).toBeCloseTo(8.2, 10);
    expect(row.nonBillableHours).toBeCloseTo(1.8, 10);
    expect(row.totalHours).toBeCloseTo(10, 10);
    expect(row.utilizationPercent).toBeCloseTo(82, 10);
  });

  it('timeRowFromMinutes with zero minutes → all zeros, utilization 0', () => {
    const row = timeRowFromMinutes('u1', null, 0, 0);
    expect(row.billableHours).toBe(0);
    expect(row.nonBillableHours).toBe(0);
    expect(row.totalHours).toBe(0);
    expect(row.utilizationPercent).toBe(0);
    expect(row.userName).toBeNull();
  });
});

// ---------- §28 common filter parse (fail-closed) ----------

describe('Module 16A unit — common report filters (§28)', () => {
  it('empty query → empty filters (all reports run unfiltered)', () => {
    const r = parseReportFilters(qs(''));
    expect(r).toEqual({ ok: true, value: { filters: {} } });
  });

  it('valid full set parses verbatim', () => {
    const r = parseReportFilters(
      qs('from=2026-01-01&to=2026-06-30&clientId=c1&projectId=p1&userId=u1&currency=INR&status=ACTIVE'),
      { allowedStatuses: ['DRAFT', 'ACTIVE', 'COMPLETED'] }
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.filters).toEqual({
        from: '2026-01-01',
        to: '2026-06-30',
        clientId: 'c1',
        projectId: 'p1',
        userId: 'u1',
        currency: 'INR',
        status: 'ACTIVE',
      });
    }
  });

  it('invalid from → error, never a silently unfiltered report', () => {
    const r = parseReportFilters(qs('from=2026-13-01'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('from');
  });

  it('from after to → error (the window is inverted)', () => {
    const r = parseReportFilters(qs('from=2026-06-30&to=2026-01-01'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('from must not be after to');
  });

  it('empty clientId → error (an empty id is not "all clients")', () => {
    const r = parseReportFilters(qs('clientId=%20'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('clientId');
  });

  it('lowercase currency → error (§127 requires ISO uppercase)', () => {
    const r = parseReportFilters(qs('currency=inr'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('currency');
  });

  it('status outside the report whitelist → error naming the legal set', () => {
    const r = parseReportFilters(qs('status=PAID'), { allowedStatuses: ['SENT', 'PARTIALLY_PAID'] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('SENT, PARTIALLY_PAID');
  });

  it('status on a report with no status filter → error', () => {
    const r = parseReportFilters(qs('status=ACTIVE'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('not a valid filter');
  });

  it('boundary dates pass (format-level validation, the shared M13/M14 helper)', () => {
    expect(parseReportFilters(qs('from=2024-02-29&to=2024-02-29')).ok).toBe(true); // leap day
    expect(parseReportFilters(qs('from=2026-2-30')).ok).toBe(false); // not zero-padded
    expect(parseReportFilters(qs('from=2026-13-01')).ok).toBe(false); // month 13
    expect(parseReportFilters(qs('from=2026-00-10')).ok).toBe(false); // month 00
  });
});

// ---------- §39 pagination (parse + slice) ----------

describe('Module 16A unit — report pagination (§39)', () => {
  it('defaults: limit 50, offset 0', () => {
    const r = parseReportPagination(qs(''));
    expect(r).toEqual({ ok: true, value: { limit: 50, offset: 0 } });
  });

  it('valid limit/offset parse', () => {
    const r = parseReportPagination(qs('limit=25&offset=50'));
    expect(r).toEqual({ ok: true, value: { limit: 25, offset: 50 } });
  });

  it('limit 0 / negative / non-integer / above cap → errors, never clamps', () => {
    expect(parseReportPagination(qs('limit=0')).ok).toBe(false);
    expect(parseReportPagination(qs('limit=-5')).ok).toBe(false);
    expect(parseReportPagination(qs('limit=10.5')).ok).toBe(false);
    expect(parseReportPagination(qs('limit=1001')).ok).toBe(false);
    expect(parseReportPagination(qs('limit=1000')).ok).toBe(true);
  });

  it('negative or non-integer offset → error', () => {
    expect(parseReportPagination(qs('offset=-1')).ok).toBe(false);
    expect(parseReportPagination(qs('offset=1.5')).ok).toBe(false);
    expect(parseReportPagination(qs('offset=0')).ok).toBe(true);
  });

  it('slicePage returns the page and the FULL total', () => {
    const rows = Array.from({ length: 120 }, (_, i) => i);
    const page = slicePage(rows, 50, 100);
    expect(page.rows).toEqual([100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119]);
    expect(page.pagination).toEqual({ total: 120, limit: 50, offset: 100 });
  });

  it('slicePage past the end → empty page, total still real', () => {
    const page = slicePage([1, 2, 3], 50, 50);
    expect(page.rows).toEqual([]);
    expect(page.pagination.total).toBe(3);
  });

  it('offset inside the set → partial page', () => {
    const page = slicePage([1, 2, 3, 4, 5], 3, 3);
    expect(page.rows).toEqual([4, 5]);
    expect(page.pagination).toEqual({ total: 5, limit: 3, offset: 3 });
  });
});

// ---------- §29/§127 summary fold (engine-mirroring math) ----------

describe('Module 16B unit — summary fold (§29/§127)', () => {
  it('single-currency rows fold to that currency, mixed = false', () => {
    expect(foldCurrency([{ currency: 'INR' }, { currency: 'INR' }])).toEqual({
      currency: 'INR',
      mixedCurrencies: false,
    });
  });

  it('mixed currencies fold to null + mixed flag (never a converted number)', () => {
    expect(foldCurrency([{ currency: 'INR' }, { currency: 'USD' }])).toEqual({
      currency: null,
      mixedCurrencies: true,
    });
  });

  it('empty row set → no currency, not "mixed"', () => {
    expect(foldCurrency([])).toEqual({ currency: null, mixedCurrencies: false });
  });

  it('sumRows sums plain numbers', () => {
    expect(sumRows([{ v: 100 }, { v: 250 }], r => r.v)).toBe(350);
  });

  it('sumRows over a null (unknown optional) → null, never a partial Σ', () => {
    const rows = [{ v: 100 }, { v: null as number | null }, { v: 50 }];
    expect(sumRows(rows, r => r.v)).toBeNull();
  });

  it('sumRows of an empty set → 0', () => {
    expect(sumRows([], () => 0)).toBe(0);
  });

  it('weighted margin = Σprofit / Σrevenue × 100 (§29 — a ₹1L and a ₹1Cr project never weigh equally)', () => {
    // Two projects: 40% of 100000 and 10% of 10000000.
    // Naive average would say 25%; weighted says (40000+1000000)/10100000 ≈ 10.3%.
    const profit = 40000 + 1000000;
    const revenue = 100000 + 10000000;
    expect(weightedMarginPercent(profit, revenue)).toBeCloseTo((profit / revenue) * 100, 10);
    expect(weightedMarginPercent(profit, revenue)!).not.toBeCloseTo(25, 1);
  });

  it('revenue = 0 → margin null, never 0% and never ±∞ (§82)', () => {
    expect(weightedMarginPercent(0, 0)).toBeNull();
    expect(weightedMarginPercent(-5000, 0)).toBeNull();
  });

  it('unknown totals (mixed currency / optional) → margin null', () => {
    expect(weightedMarginPercent(null, 100)).toBeNull();
    expect(weightedMarginPercent(100, null)).toBeNull();
  });

  it('negative profit → negative margin (a loss is a real number, §64)', () => {
    expect(weightedMarginPercent(-150000, 100000)).toBe(-150);
  });
});
