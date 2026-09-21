/**
 * Module 1.26 — Unit: receivable aging (definitions §9).
 *
 * The aging contract: days past due are computed on the YYYY-MM-DD string
 * domain (never timezone-shifting Date math), and each invoice falls in
 * exactly one bucket: CURRENT / 1-30 / 31-60 / 61-90 / 90+.
 * At Module 1 the buckets are zero-value (invoices arrive in Sprint 6) —
 * the bucket structure itself is what must not drift.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  agingBucket,
  daysOverdue,
  diffDays,
  dueDateFromTerms,
  collectionRisk,
} from '@/lib/agency/types/dates';
import { getReceivablesSummary, getOutstandingReceivables, getOverdueReceivables } from '@/lib/agency/analytics/metrics';

// The query module pulls '@/lib/db' transitively; the unit suite never talks
// to a database, so the module is a stub (same pattern as the profitability
// unit tests) — we only exercise its PURE exports here.
vi.mock('@/lib/db', () => ({
  connectDb: vi.fn(),
  initLocalDb: vi.fn(),
}));
import { sortReceivableRows } from '@/lib/agency/queries/receivables-summary';
import type { ReceivableInvoiceRow } from '@/lib/agency/types/receivables';

describe('Module 1.26 unit — aging bucket boundaries (§9)', () => {
  it('not past due (0 or negative days) → CURRENT', () => {
    expect(agingBucket(0)).toBe('CURRENT');
    expect(agingBucket(-3)).toBe('CURRENT');
  });

  it('1–30 days past due → 1-30', () => {
    expect(agingBucket(1)).toBe('1-30');
    expect(agingBucket(30)).toBe('1-30');
  });

  it('31–60 days → 31-60', () => {
    expect(agingBucket(31)).toBe('31-60');
    expect(agingBucket(60)).toBe('31-60');
  });

  it('61–90 days → 61-90', () => {
    expect(agingBucket(61)).toBe('61-90');
    expect(agingBucket(90)).toBe('61-90');
  });

  it('beyond 90 days → 90+', () => {
    expect(agingBucket(91)).toBe('90+');
    expect(agingBucket(365)).toBe('90+');
  });
});

describe('Module 1.26 unit — days overdue on the string date domain', () => {
  const today = '2026-09-09';

  it('due today → 0 days overdue (not past due)', () => {
    expect(daysOverdue('2026-09-09', today)).toBe(0);
  });

  it('due in the future → clamped to 0, never negative', () => {
    expect(daysOverdue('2026-09-15', today)).toBe(0);
  });

  it('due 5 days ago → 5', () => {
    expect(daysOverdue('2026-09-04', today)).toBe(5);
  });

  it('crosses month and year boundaries correctly', () => {
    expect(daysOverdue('2026-08-31', today)).toBe(9);
    expect(daysOverdue('2025-12-31', '2026-01-01')).toBe(1);
  });

  it('diffDays is signed (b − a)', () => {
    expect(diffDays('2026-09-09', '2026-09-04')).toBe(-5);
  });
});

describe('Module 1.26 unit — due dates from payment terms (§54)', () => {
  it('NET_30: issue + 30 days', () => {
    expect(dueDateFromTerms('2026-08-01', 'NET_30')).toBe('2026-08-31');
  });

  it('DUE_ON_RECEIPT: due the same day', () => {
    expect(dueDateFromTerms('2026-09-09', 'DUE_ON_RECEIPT')).toBe('2026-09-09');
  });

  it('CUSTOM requires explicit days', () => {
    expect(() => dueDateFromTerms('2026-08-01', 'CUSTOM')).toThrow();
    expect(dueDateFromTerms('2026-08-01', 'CUSTOM', 10)).toBe('2026-08-11');
  });
});

describe('Module 1.26 unit — Module 1 receivables zero-value contract', () => {
  it('outstanding and overdue owners return the §13 zero contract', () => {
    expect(getOutstandingReceivables()).toBe(0);
    expect(getOverdueReceivables()).toBe(0);
  });

  it('the aging structure is complete: all five buckets present, honestly zero', () => {
    const summary = getReceivablesSummary();
    expect(summary.byAgingBucket).toEqual({
      CURRENT: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0,
    });
    expect(summary.outstanding).toBe(0);
    expect(summary.overdueAmount).toBe(0);
    expect(summary.overdueCount).toBe(0);
    expect(summary.dueSoon).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Module 14 — collection risk bands (§101) and the A/R list ordering (§97)
// ---------------------------------------------------------------------------

describe('Module 14 unit — collectionRisk bands (§101: deterministic, from days past due)', () => {
  it('not past due → null (no badge, no predictive scoring)', () => {
    expect(collectionRisk(0)).toBeNull();
    expect(collectionRisk(-7)).toBeNull();
  });

  it('1–9 days past due → OVERDUE (the plain band)', () => {
    expect(collectionRisk(1)).toBe('OVERDUE');
    expect(collectionRisk(9)).toBe('OVERDUE');
  });

  it('10+ / 30+ / 60+ / 90+ escalate monotonically at their exact boundaries', () => {
    expect(collectionRisk(10)).toBe('OVERDUE_10_PLUS');
    expect(collectionRisk(29)).toBe('OVERDUE_10_PLUS');
    expect(collectionRisk(30)).toBe('OVERDUE_30_PLUS');
    expect(collectionRisk(59)).toBe('OVERDUE_30_PLUS');
    expect(collectionRisk(60)).toBe('OVERDUE_60_PLUS');
    expect(collectionRisk(89)).toBe('OVERDUE_60_PLUS');
    expect(collectionRisk(90)).toBe('OVERDUE_90_PLUS');
    expect(collectionRisk(400)).toBe('OVERDUE_90_PLUS');
  });

  it('the band agrees with the aging bucket at every boundary (one derivation, two projections)', () => {
    // daysPastDue → (agingBucket, collectionRisk) stay in lockstep.
    for (const [days, bucket, risk] of [
      [0, 'CURRENT', null],
      [9, '1-30', 'OVERDUE'],
      [10, '1-30', 'OVERDUE_10_PLUS'],
      [30, '1-30', 'OVERDUE_30_PLUS'],
      [31, '31-60', 'OVERDUE_30_PLUS'],
      [60, '31-60', 'OVERDUE_60_PLUS'],
      [61, '61-90', 'OVERDUE_60_PLUS'],
      [90, '61-90', 'OVERDUE_90_PLUS'],
      [91, '90+', 'OVERDUE_90_PLUS'],
    ] as const) {
      expect(agingBucket(days)).toBe(bucket);
      expect(collectionRisk(days)).toBe(risk);
    }
  });
});

describe('Module 14 unit — sortReceivableRows (§97: most-overdue / highest-risk first)', () => {
  const row = (over: Partial<ReceivableInvoiceRow>): ReceivableInvoiceRow => ({
    invoiceId: 'inv',
    invoiceNumber: 'INV-1',
    clientId: 'c1',
    projectId: null,
    dueDate: '2026-09-01',
    ageDays: 0,
    agingBucket: 'CURRENT',
    collectionRisk: null,
    status: 'SENT',
    displayStatus: 'SENT',
    total: { amount: 100, currency: 'INR' },
    paid: { amount: 0, currency: 'INR' },
    due: { amount: 100, currency: 'INR' },
    ...over,
  });

  it('older age (more overdue) sorts before newer', () => {
    const older = row({ invoiceId: 'a', ageDays: 45 });
    const newer = row({ invoiceId: 'b', ageDays: 5 });
    expect(sortReceivableRows([newer, older]).map(r => r.invoiceId)).toEqual(['a', 'b']);
  });

  it('same age → bigger outstanding amount first', () => {
    const big = row({ invoiceId: 'big', ageDays: 10, due: { amount: 50000, currency: 'INR' } });
    const small = row({ invoiceId: 'small', ageDays: 10, due: { amount: 500, currency: 'INR' } });
    expect(sortReceivableRows([small, big]).map(r => r.invoiceId)).toEqual(['big', 'small']);
  });

  it('same age and amount → earlier due date first, then client name (with resolved names), then invoice number', () => {
    const early = row({ invoiceId: 'x', invoiceNumber: 'INV-9', clientId: 'cA', dueDate: '2026-08-01' });
    const late = row({ invoiceId: 'y', invoiceNumber: 'INV-2', clientId: 'cB', dueDate: '2026-08-15' });
    expect(sortReceivableRows([late, early]).map(r => r.invoiceId)).toEqual(['x', 'y']);

    const sameDate = row({ invoiceId: 'z', invoiceNumber: 'INV-5', clientId: 'cA', dueDate: '2026-08-01' });
    const other = row({ invoiceId: 'w', invoiceNumber: 'INV-4', clientId: 'cB', dueDate: '2026-08-01' });
    // Client name resolution flips the raw-id order: cA's display name sorts
    // AFTER cB's, so with names w comes first; without names cA < cB and z does.
    const names: Record<string, string> = { cA: 'Zeta Client', cB: 'Alpha Client' };
    expect(sortReceivableRows([other, sameDate], names).map(r => r.invoiceId)).toEqual(['w', 'z']);
    expect(sortReceivableRows([other, sameDate]).map(r => r.invoiceId)).toEqual(['z', 'w']);
  });

  it('not-yet-due rows (age 0) sort after every overdue row, by due amount then date', () => {
    const future = row({ invoiceId: 'future', ageDays: 0, dueDate: '2026-10-01', due: { amount: 90000, currency: 'INR' } });
    const overdue = row({ invoiceId: 'overdue', ageDays: 1, dueDate: '2026-08-30' });
    expect(sortReceivableRows([future, overdue]).map(r => r.invoiceId)).toEqual(['overdue', 'future']);
  });
});
