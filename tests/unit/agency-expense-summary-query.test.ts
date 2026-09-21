/**
 * Module 8 (§119) — the dashboard expense-summary query
 * (queries/expense-summary.ts).
 *
 * Pins the §4/§7 money contracts over the local store (same semantics as
 * the Mongo pipeline — conventions rule 8):
 *
 *   §4  DeliveryCost (expense part) = Σ amount over APPROVED expenses —
 *       drafts/submitted/rejected contribute nothing (no §41 transaction,
 *       no recognized spend); INVOICED and internal spend BOTH count
 *       (costs regardless of who pays them back).
 *   §7  UnbilledExpenses = Σ clientChargeAmount over APPROVED + billable +
 *       UNBILLED (the §48 invoice-eligible set) — invoiced, non-billable
 *       and unapproved never leak in, and the value is the CLIENT CHARGE,
 *       never the raw cost.
 *   Mixed currencies → NULL totals (never converted, never fabricated);
 *   single-currency totals carry their currency so the composer can refuse
 *   to add time money and expense money denominated differently.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('@/lib/db', () => ({
  connectDb: vi.fn(),
  initLocalDb: vi.fn(),
}));

import { connectDb, initLocalDb } from '@/lib/db';
import { getExpenseMoneyMetrics } from '@/lib/agency/queries/expense-summary';
import type { Expense } from '@/lib/agency/types/expense';
import { makeMoney } from '@/lib/agency/types/money';

const TENANT = 'tenant-a';

function expense(overrides: Partial<Expense> & { id: string }): Expense {
  return {
    tenantId: TENANT,
    vendorName: 'StockAI',
    description: 'API credits',
    amount: makeMoney(10000, 'INR'),
    expenseType: 'BILLABLE',
    billable: true,
    clientChargeAmount: makeMoney(12000, 'INR'),
    expenseDate: '2026-09-11',
    status: 'DRAFT',
    billingStatus: 'UNBILLED',
    createdBy: 'user-1',
    createdAt: new Date('2026-09-11'),
    updatedAt: new Date('2026-09-11'),
    ...overrides,
  };
}

describe('getExpenseMoneyMetrics (§4 expense cost / §7 unbilled expenses)', () => {
  beforeEach(() => {
    (connectDb as Mock).mockReset().mockResolvedValue({ db: null });
    (initLocalDb as Mock).mockReset();
  });

  it('§4 — Σ amount over APPROVED only; drafts/submitted/rejected contribute nothing', async () => {
    (initLocalDb as Mock).mockReturnValue({
      expenses: [
        expense({ id: '1', status: 'APPROVED' }),
        expense({ id: '2', status: 'DRAFT' }),
        expense({ id: '3', status: 'SUBMITTED' }),
        expense({ id: '4', status: 'REJECTED' }),
      ],
    });
    const r = await getExpenseMoneyMetrics(TENANT);
    expect(r.deliveryCost.total).toBe(10000);
    expect(r.deliveryCost.currency).toBe('INR');
    expect(r.deliveryCost.mixed).toBe(false);
  });

  it('§4 — INVOICED and internal spend are still costs (approval made them real)', async () => {
    (initLocalDb as Mock).mockReturnValue({
      expenses: [
        expense({ id: '1', status: 'APPROVED', billingStatus: 'INVOICED', invoiceId: 'inv-1' }),
        expense({ id: '2', status: 'APPROVED', expenseType: 'INTERNAL', billable: false, clientChargeAmount: undefined }),
      ],
    });
    const r = await getExpenseMoneyMetrics(TENANT);
    expect(r.deliveryCost.total).toBe(20000);
    // §7 — neither carries unbilled value.
    expect(r.unbilledExpenses.total).toBe(0);
    expect(r.unbilledExpenses.currency).toBeNull();
  });

  it('§7 — unbilled = Σ clientChargeAmount over APPROVED + billable + UNBILLED, never the raw cost', async () => {
    (initLocalDb as Mock).mockReturnValue({
      expenses: [
        // Eligible: 12000 + 24000.
        expense({ id: '1', status: 'APPROVED' }),
        expense({ id: '2', status: 'APPROVED', amount: makeMoney(20000, 'INR'), clientChargeAmount: makeMoney(24000, 'INR') }),
        // Invoiced — never leaks in.
        expense({ id: '3', status: 'APPROVED', billingStatus: 'INVOICED', invoiceId: 'inv-1' }),
        // Not approved / not billable — never eligible.
        expense({ id: '4', status: 'SUBMITTED' }),
        expense({ id: '5', status: 'APPROVED', billable: false, clientChargeAmount: undefined }),
      ],
    });
    const r = await getExpenseMoneyMetrics(TENANT);
    expect(r.unbilledExpenses.total).toBe(36000);
    expect(r.unbilledExpenses.currency).toBe('INR');
    // §4 counts every APPROVED expense (10000 + 20000 + 10000 + 10000) —
    // the invoiced and non-billable ones are still real spend.
    expect(r.deliveryCost.total).toBe(50000);
  });

  it('mixed currencies → null totals + flags (never converted, never fabricated)', async () => {
    (initLocalDb as Mock).mockReturnValue({
      expenses: [
        expense({ id: '1', status: 'APPROVED', amount: makeMoney(10000, 'INR'), clientChargeAmount: makeMoney(12000, 'INR') }),
        expense({ id: '2', status: 'APPROVED', amount: makeMoney(50, 'USD'), clientChargeAmount: makeMoney(60, 'USD') }),
      ],
    });
    const r = await getExpenseMoneyMetrics(TENANT);
    expect(r.deliveryCost).toEqual({ total: null, currency: null, mixed: true });
    expect(r.unbilledExpenses).toEqual({ total: null, currency: null, mixed: true });
  });

  it('tenant isolation — other tenants never resolve; an empty store is honest zeros with no currency', async () => {
    (initLocalDb as Mock).mockReturnValue({
      expenses: [
        expense({ id: '1', tenantId: 'tenant-b' as string, status: 'APPROVED' }),
        expense({ id: '2', tenantId: 'tenant-b' as string, status: 'APPROVED', billingStatus: 'INVOICED' }),
      ],
    });
    const r = await getExpenseMoneyMetrics(TENANT);
    expect(r.deliveryCost).toEqual({ total: 0, currency: null, mixed: false });
    expect(r.unbilledExpenses).toEqual({ total: 0, currency: null, mixed: false });
  });
});
