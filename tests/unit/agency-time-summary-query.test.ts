/**
 * Module 7 (§117) — the dashboard time-summary query (queries/time-summary.ts).
 *
 * Pins the §8 windowed-hours and §4/§7 all-time-money contracts over the
 * local store (same semantics as the Mongo pipeline — conventions rule 8):
 *
 *   §8  ALL in-window entries count as logged, regardless of approval;
 *       billableMinutes splits by the explicit §17 flag.
 *   §4  DeliveryCost = Σ calculatedCost over APPROVED entries — rejected,
 *       draft, submitted, and §24-blocked (no computed cost) entries
 *       contribute nothing, honestly.
 *   §7  UnbilledTime = Σ calculatedBillableAmount over APPROVED + billable
 *       + UNBILLED entries — non-billable and invoiced work never leak in.
 *   Mixed currencies resolve to NULL totals + flags — never a converted or
 *       fabricated number.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('@/lib/db', () => ({
  connectDb: vi.fn(),
  initLocalDb: vi.fn(),
}));

import { connectDb, initLocalDb } from '@/lib/db';
import { getDeliveryHoursMetrics, getTimeMoneyMetrics } from "@/lib/agency/queries/time-summary";
import type { TimeEntry } from '@/lib/agency/types/time';
import { makeMoney } from '@/lib/agency/types/money';

const TENANT = 'tenant-a';

function entry(overrides: Partial<TimeEntry> & { id: string }): TimeEntry {
  return {
    tenantId: TENANT,
    projectId: 'proj-1',
    userId: 'user-1',
    date: '2026-09-11',
    durationMinutes: 60,
    billable: true,
    approvalStatus: 'DRAFT',
    billingStatus: 'UNBILLED',
    financialStatus: 'READY',
    createdAt: new Date('2026-09-11'),
    updatedAt: new Date('2026-09-11'),
    ...overrides,
  };
}

describe('getDeliveryHoursMetrics (§8 windowed hours)', () => {
  beforeEach(() => {
    (connectDb as Mock).mockReset().mockResolvedValue({ db: null });
    (initLocalDb as Mock).mockReset();
  });

  it('ALL in-window entries count as logged regardless of approval state', async () => {
    (initLocalDb as Mock).mockReturnValue({
      timeEntries: [
        entry({ id: '1', approvalStatus: 'DRAFT', durationMinutes: 30 }),
        entry({ id: '2', approvalStatus: 'SUBMITTED', durationMinutes: 30 }),
        entry({ id: '3', approvalStatus: 'APPROVED', durationMinutes: 30 }),
        entry({ id: '4', approvalStatus: 'REJECTED', durationMinutes: 30 }),
      ],
    });
    const r = await getDeliveryHoursMetrics(TENANT, '2026-09-01', '2026-09-30');
    // §8: "time entries regardless of approval state count as logged".
    expect(r).toEqual({ totalMinutes: 120, billableMinutes: 120 });
  });

  it('billableMinutes splits by the explicit flag; the window bounds by business date', async () => {
    (initLocalDb as Mock).mockReturnValue({
      timeEntries: [
        entry({ id: '1', durationMinutes: 90, billable: true }),
        entry({ id: '2', durationMinutes: 30, billable: false }),
        entry({ id: '3', durationMinutes: 600, date: '2026-08-31' }), // before window
        entry({ id: '4', durationMinutes: 600, date: '2026-10-01' }), // after window
      ],
    });
    const r = await getDeliveryHoursMetrics(TENANT, '2026-09-01', '2026-09-30');
    expect(r).toEqual({ totalMinutes: 120, billableMinutes: 90 });
  });

  it('window boundaries are inclusive; other tenants never resolve', async () => {
    (initLocalDb as Mock).mockReturnValue({
      timeEntries: [
        entry({ id: '1', durationMinutes: 15, date: '2026-09-01' }),
        entry({ id: '2', durationMinutes: 15, date: '2026-09-30' }),
        entry({ id: '3', tenantId: 'tenant-b' as string, durationMinutes: 999 }),
      ],
    });
    const r = await getDeliveryHoursMetrics(TENANT, '2026-09-01', '2026-09-30');
    expect(r).toEqual({ totalMinutes: 30, billableMinutes: 30 });
  });
});

describe('getTimeMoneyMetrics (§4 delivery cost / §7 unbilled time)', () => {
  beforeEach(() => {
    (connectDb as Mock).mockReset().mockResolvedValue({ db: null });
    (initLocalDb as Mock).mockReset();
  });

  it('sums stored economics over APPROVED entries only — drafts/rejected/submitted contribute nothing', async () => {
    (initLocalDb as Mock).mockReturnValue({
      timeEntries: [
        entry({
          id: '1', approvalStatus: 'APPROVED', durationMinutes: 120,
          calculatedCost: makeMoney(1800, 'INR'),
          calculatedBillableAmount: makeMoney(5000, 'INR'),
        }),
        entry({
          id: '2', approvalStatus: 'APPROVED', durationMinutes: 60, billable: false,
          calculatedCost: makeMoney(900, 'INR'),
        }),
        entry({
          id: '3', approvalStatus: 'DRAFT', durationMinutes: 600,
          calculatedCost: makeMoney(9000, 'INR'),
          calculatedBillableAmount: makeMoney(25000, 'INR'),
        }),
        entry({
          id: '4', approvalStatus: 'REJECTED', durationMinutes: 600,
          calculatedCost: makeMoney(9000, 'INR'),
        }),
      ],
    });
    const r = await getTimeMoneyMetrics(TENANT);
    // §4: approved cost both sides — 1800 + 900 (non-billable cost still counts).
    expect(r.deliveryCost).toBe(2700);
    // §7: only the billable approved entry.
    expect(r.unbilledTime).toBe(5000);
    expect(r.mixedCostCurrencies).toBe(false);
    expect(r.mixedUnbilledCurrencies).toBe(false);
  });

  it('§24-blocked approvals (no computed economics) contribute nothing — never zero-fabricated', async () => {
    (initLocalDb as Mock).mockReturnValue({
      timeEntries: [
        entry({ id: '1', approvalStatus: 'APPROVED', financialStatus: 'RATE_CONFIGURATION_REQUIRED' }),
      ],
    });
    const r = await getTimeMoneyMetrics(TENANT);
    expect(r.deliveryCost).toBe(0);
    expect(r.unbilledTime).toBe(0);
  });

  it('§7 — invoiced and non-billable work never leaks into unbilled time', async () => {
    (initLocalDb as Mock).mockReturnValue({
      timeEntries: [
        entry({ id: '1', approvalStatus: 'APPROVED', calculatedBillableAmount: makeMoney(5000, 'INR') }),
        entry({ id: '2', approvalStatus: 'APPROVED', billingStatus: 'INVOICED' as TimeEntry['billingStatus'], calculatedBillableAmount: makeMoney(7000, 'INR') }),
        entry({ id: '3', approvalStatus: 'APPROVED', billable: false, calculatedBillableAmount: undefined }),
      ],
    });
    const r = await getTimeMoneyMetrics(TENANT);
    expect(r.unbilledTime).toBe(5000);
  });

  it('mixed currencies → null totals + flags (never converted, never fabricated)', async () => {
    (initLocalDb as Mock).mockReturnValue({
      timeEntries: [
        entry({ id: '1', approvalStatus: 'APPROVED', calculatedCost: makeMoney(1800, 'INR'), calculatedBillableAmount: makeMoney(5000, 'INR') }),
        entry({ id: '2', approvalStatus: 'APPROVED', calculatedCost: makeMoney(25, 'USD'), calculatedBillableAmount: makeMoney(70, 'USD') }),
      ],
    });
    const r = await getTimeMoneyMetrics(TENANT);
    expect(r.deliveryCost).toBeNull();
    expect(r.unbilledTime).toBeNull();
    expect(r.mixedCostCurrencies).toBe(true);
    expect(r.mixedUnbilledCurrencies).toBe(true);
  });
});
