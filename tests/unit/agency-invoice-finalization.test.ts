/**
 * Module 9 (§79/§83) — invoice FINALIZATION + VOID tests (Sprint 9E).
 *
 * Pins the §148 gate properties:
 *   - Approved work → Invoice → UNIQUE number (§74, allocated at
 *     finalization only, exactly once)
 *   - Source records LOCKED: INVOICED + the §61 invoiceId, reservation trail
 *     superseded
 *   - Invoice status correct: DRAFT → SENT (§79 — finalization IS issuance)
 *   - Money is the ENGINE's output (§77/§78), never re-derived
 *   - A lost/stolen reservation is a 409 BEFORE any write (§65/§84)
 *   - A mid-batch stamp failure compensates: sources restored, invoice back
 *     to DRAFT (§83)
 *   - Void: DRAFT releases reservations (§66); SENT un-marks INVOICED back
 *     to UNBILLED (guarded by the §61 invoiceId); PAID and paid-partially
 *     invoices are never voidable
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('@/lib/db', () => ({
  getClientById: vi.fn(),
  getProjectById: vi.fn(),
  getProjects: vi.fn(),
  getTenantById: vi.fn(),
  getProjectMilestones: vi.fn(),
  getProjectMilestoneById: vi.fn(),
  updateProjectMilestone: vi.fn(),
  getTimeEntryById: vi.fn(),
  updateTimeEntry: vi.fn(),
  getTimeEntries: vi.fn(),
  getExpenseById: vi.fn(),
  updateExpense: vi.fn(),
  getExpenses: vi.fn(),
  getInvoices: vi.fn(),
  getInvoiceById: vi.fn(),
  createInvoice: vi.fn(),
  updateInvoice: vi.fn(),
  getInvoiceLines: vi.fn(),
  createInvoiceLine: vi.fn(),
  deleteInvoiceLine: vi.fn(),
  allocateInvoiceNumberForFiscalYear: vi.fn(),
  seedInvoiceSequenceFromLegacy: vi.fn(),
  // Transitively imported by agency.clients (AuditContext/DomainResult home).
  createClient: vi.fn(), getClients: vi.fn(),
  updateClient: vi.fn(), searchClients: vi.fn(), findClientByName: vi.fn(),
  getLogs: vi.fn(),
}));

import {
  getProjectMilestoneById, updateProjectMilestone as updateProjectMilestoneRepo,
  getTimeEntryById, updateTimeEntry as updateTimeEntryRepo,
  getExpenseById, updateExpense as updateExpenseRepo,
  getInvoiceById, updateInvoice as updateInvoiceRepo,
  getInvoiceLines,
  allocateInvoiceNumberForFiscalYear,
} from '@/lib/db';
import { finalizeInvoice, voidInvoice, sendInvoice } from '@/lib/agency/domain/agency.invoices';
import type { Invoice, InvoiceLine } from '@/lib/agency/types/invoice';
import { formatInvoiceNumber } from '@/lib/agency/types/invoice';
import type { TimeEntry } from '@/lib/agency/types/time';
import type { Expense } from '@/lib/agency/types/expense';
import type { ProjectMilestone } from '@/lib/agency/types/project';
import { makeMoney, zeroMoney } from '@/lib/agency/types/money';
import { todayInTimezone } from '@/lib/agency/types/dates';

const TENANT = 'tenant-a';
const TODAY = todayInTimezone();
const audit = { username: 'tester', tenantId: TENANT, log: vi.fn() };
const ACTOR_ADMIN = { userId: 'admin-1', role: 'TENANT_ADMIN' as const };

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-1', tenantId: TENANT, clientId: 'client-1', projectId: 'proj-1',
    issueDate: TODAY, dueDate: TODAY, currency: 'INR',
    subtotal: zeroMoney('INR'), discount: zeroMoney('INR'),
    taxLines: [], taxTotal: zeroMoney('INR'), total: zeroMoney('INR'),
    amountPaid: zeroMoney('INR'), amountDue: zeroMoney('INR'),
    status: 'DRAFT', createdBy: 'admin-1',
    createdAt: new Date('2026-09-01'), updatedAt: new Date('2026-09-01'),
    ...overrides,
  };
}

function timeEntry(overrides: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id: 'time-1', tenantId: TENANT, projectId: 'proj-1', userId: 'dev-1',
    date: TODAY, durationMinutes: 120, billable: true,
    approvalStatus: 'APPROVED', billingStatus: 'RESERVED', financialStatus: 'READY',
    reservedBy: 'admin-1', reservedAt: new Date('2026-09-10'), reservedInvoiceId: 'inv-1',
    calculatedCost: makeMoney(1800), calculatedBillableAmount: makeMoney(5000),
    createdAt: new Date('2026-09-01'), updatedAt: new Date('2026-09-01'),
    ...overrides,
  };
}

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'exp-1', tenantId: TENANT, projectId: 'proj-1', clientId: 'client-1',
    vendorName: 'StockAI', description: 'API credits',
    amount: makeMoney(10000), expenseType: 'BILLABLE', billable: true,
    markupPercent: 20, clientChargeAmount: makeMoney(12000),
    expenseDate: TODAY, status: 'APPROVED', billingStatus: 'RESERVED',
    reservedBy: 'admin-1', reservedAt: new Date('2026-09-10'), reservedInvoiceId: 'inv-1',
    createdBy: 'dev-1',
    createdAt: new Date('2026-09-01'), updatedAt: new Date('2026-09-01'),
    ...overrides,
  };
}

function milestone(overrides: Partial<ProjectMilestone> = {}): ProjectMilestone {
  return {
    id: 'mile-1', tenantId: TENANT, projectId: 'proj-1',
    name: 'Design', sequence: 2, amount: 200000,
    status: 'COMPLETED', billingStatus: 'RESERVED',
    reservedBy: 'admin-1', reservedAt: new Date('2026-09-10'), reservedInvoiceId: 'inv-1',
    createdAt: new Date('2026-01-02'),
    ...overrides,
  };
}

function line(overrides: Partial<InvoiceLine> = {}): InvoiceLine {
  return {
    id: 'line-1', tenantId: TENANT, invoiceId: 'inv-1', type: 'TIME',
    description: 'Development', amount: makeMoney(5000),
    createdAt: new Date('2026-09-01'), updatedAt: new Date('2026-09-01'),
    ...overrides,
  };
}

/** The standard finalize setup: a DRAFT holding one TIME + one EXPENSE line. */
function setupReservedDraft() {
  (getInvoiceById as Mock).mockResolvedValue(invoice());
  (getInvoiceLines as Mock).mockResolvedValue([
    line({ type: 'TIME', sourceId: 'time-1', amount: makeMoney(5000) }),
    line({ id: 'line-2', type: 'EXPENSE', sourceId: 'exp-1', amount: makeMoney(12000) }),
  ]);
  (getTimeEntryById as Mock).mockResolvedValue(timeEntry());
  (getExpenseById as Mock).mockResolvedValue(expense());
  (getProjectMilestoneById as Mock).mockResolvedValue(milestone());
  (allocateInvoiceNumberForFiscalYear as Mock).mockResolvedValue(42);
}

beforeEach(() => {
  vi.clearAllMocks();
  (updateInvoiceRepo as Mock).mockResolvedValue(true);
  (updateTimeEntryRepo as Mock).mockResolvedValue(true);
  (updateExpenseRepo as Mock).mockResolvedValue(true);
  (updateProjectMilestoneRepo as Mock).mockResolvedValue(true);
});

// ---------- §83 finalizeInvoice ----------

describe('finalizeInvoice (§83)', () => {
  it('issues the invoice: unique §74 number, SENT status, engine money, sources locked', async () => {
    setupReservedDraft();
    const result = await finalizeInvoice('inv-1', TENANT, ACTOR_ADMIN, audit);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // §74 — the number came from the central authority, exactly once.
    expect(allocateInvoiceNumberForFiscalYear).toHaveBeenCalledTimes(1);
    expect((updateInvoiceRepo as Mock).mock.calls[0][2]).toMatchObject({
      status: 'SENT',
      invoiceNumber: formatInvoiceNumber(42), // INV-000042
    });

    // §77/§78 — the stored money is the ENGINE pipeline output:
    // 5000 + 12000 = 17000 subtotal, no discount/tax → total 17000.
    const write = (updateInvoiceRepo as Mock).mock.calls[0][2];
    expect(write.subtotal.amount).toBe(17000);
    expect(write.total.amount).toBe(17000);
    expect(write.amountDue.amount).toBe(17000);

    // §61/§66 — every source is stamped INVOICED with the invoiceId and the
    // reservation trail superseded (nulled).
    const timeStamp = (updateTimeEntryRepo as Mock).mock.calls[0][2];
    expect(timeStamp).toEqual({
      billingStatus: 'INVOICED', invoiceId: 'inv-1',
      reservedBy: null, reservedAt: null, reservedInvoiceId: null,
    });
    const expStamp = (updateExpenseRepo as Mock).mock.calls[0][2];
    expect(expStamp).toEqual(timeStamp);

    // Audit trail.
    expect(audit.log).toHaveBeenCalledWith('INVOICE_FINALIZED', expect.stringContaining('INV-000042'));
    expect(audit.log).toHaveBeenCalledWith('ITEM_INVOICED', expect.stringContaining('time-1'));
  });

  it('computes discount + tax through the engine at final totals', async () => {
    setupReservedDraft();
    (getInvoiceById as Mock).mockResolvedValue(invoice({
      discount: makeMoney(2000),
      taxLines: [{ type: 'IGST', name: 'IGST', rate: 18, taxableAmount: makeMoney(15000), amount: makeMoney(2700) }],
    }));
    const result = await finalizeInvoice('inv-1', TENANT, ACTOR_ADMIN, audit);
    expect(result.ok).toBe(true);
    const write = (updateInvoiceRepo as Mock).mock.calls[0][2];
    // 17000 − 2000 = 15000 taxable; IGST 18% = 2700; total 17700.
    expect(write.subtotal.amount).toBe(17000);
    expect(write.discount.amount).toBe(2000);
    expect(write.taxLines).toHaveLength(1);
    expect(write.taxLines[0].amount.amount).toBe(2700);
    expect(write.total.amount).toBe(17700);
    expect(write.amountDue.amount).toBe(17700);
  });

  it('rejects an invoice with no lines — nothing is written', async () => {
    setupReservedDraft();
    (getInvoiceLines as Mock).mockResolvedValue([]);
    const result = await finalizeInvoice('inv-1', TENANT, ACTOR_ADMIN, audit);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(updateInvoiceRepo).not.toHaveBeenCalled();
    expect(allocateInvoiceNumberForFiscalYear).not.toHaveBeenCalled();
  });

  it('rejects a non-DRAFT invoice (§79)', async () => {
    setupReservedDraft();
    (getInvoiceById as Mock).mockResolvedValue(invoice({ status: 'SENT', invoiceNumber: 'INV-000041' }));
    const result = await finalizeInvoice('inv-1', TENANT, ACTOR_ADMIN, audit);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
    expect(updateInvoiceRepo).not.toHaveBeenCalled();
  });

  it('§113 — a missing invoice is a 404', async () => {
    setupReservedDraft();
    (getInvoiceById as Mock).mockResolvedValue(null);
    const result = await finalizeInvoice('inv-x', TENANT, ACTOR_ADMIN, audit);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
  });

  it('§65/§84 — a reservation stolen by another draft is a 409 BEFORE any write', async () => {
    setupReservedDraft();
    (getTimeEntryById as Mock).mockResolvedValue(timeEntry({ reservedInvoiceId: 'inv-OTHER' }));
    const result = await finalizeInvoice('inv-1', TENANT, ACTOR_ADMIN, audit);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
    if (result.ok === false) expect(result.code).toBe('RESERVATION_LOST');
    expect(updateInvoiceRepo).not.toHaveBeenCalled();
    expect(updateTimeEntryRepo).not.toHaveBeenCalled();
    expect(allocateInvoiceNumberForFiscalYear).not.toHaveBeenCalled();
  });

  it('§84 — a source already INVOICED elsewhere is a 409, never a finalize-anyway', async () => {
    setupReservedDraft();
    (getExpenseById as Mock).mockResolvedValue(expense({
      billingStatus: 'INVOICED', invoiceId: 'inv-OTHER',
      reservedInvoiceId: null, reservedBy: null, reservedAt: null,
    }));
    const result = await finalizeInvoice('inv-1', TENANT, ACTOR_ADMIN, audit);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
    expect(updateInvoiceRepo).not.toHaveBeenCalled();
  });

  it('§83 — a mid-batch stamp failure compensates: sources restored, invoice back to DRAFT', async () => {
    setupReservedDraft();
    // The time entry stamps fine; the EXPENSE stamp fails.
    (updateExpenseRepo as Mock).mockResolvedValue(false);
    const result = await finalizeInvoice('inv-1', TENANT, ACTOR_ADMIN, audit);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);
    expect((result as { error?: string }).error).toMatch(/rolled back/i);

    // The already-stamped TIME source was restored to its captured RESERVED state.
    const restore = (updateTimeEntryRepo as Mock).mock.calls[1][2];
    expect(restore).toMatchObject({
      billingStatus: 'RESERVED',
      reservedInvoiceId: 'inv-1',
      reservedBy: 'admin-1',
      invoiceId: null,
    });
    // The invoice was reverted to DRAFT without the number.
    const revert = (updateInvoiceRepo as Mock).mock.calls.find(
      (c: unknown[]) => (c[2] as Record<string, unknown>).status === 'DRAFT'
    );
    expect(revert).toBeTruthy();
    expect((revert![2] as Record<string, unknown>).invoiceNumber).toBeNull();
  });

  it('locks a MILESTONE source the same way (§73 frozen amount rides the line)', async () => {
    setupReservedDraft();
    (getInvoiceLines as Mock).mockResolvedValue([
      line({ type: 'MILESTONE', sourceId: 'mile-1', amount: makeMoney(200000) }),
    ]);
    const result = await finalizeInvoice('inv-1', TENANT, ACTOR_ADMIN, audit);
    expect(result.ok).toBe(true);
    // updateProjectMilestone(id, projectId, tenantId, stamp) — stamp is arg 3.
    const stamp = (updateProjectMilestoneRepo as Mock).mock.calls[0][3];
    expect(stamp).toEqual({
      billingStatus: 'INVOICED', invoiceId: 'inv-1',
      reservedBy: null, reservedAt: null, reservedInvoiceId: null,
    });
    expect((updateInvoiceRepo as Mock).mock.calls[0][2].total.amount).toBe(200000);
  });
});

// ---------- §79 voidInvoice ----------

describe('voidInvoice (§79)', () => {
  it('from DRAFT: VOID + the §66 reservation release back to UNBILLED', async () => {
    setupReservedDraft();
    const result = await voidInvoice('inv-1', TENANT, ACTOR_ADMIN, audit);
    expect(result.ok).toBe(true);
    expect((updateInvoiceRepo as Mock).mock.calls[0][2]).toEqual({ status: 'VOID' });
    // §66 — the guarded reservation release (no invoiceId key: the source was
    // never INVOICED, only RESERVED).
    const release = (updateTimeEntryRepo as Mock).mock.calls[0][2];
    expect(release).toEqual({
      billingStatus: 'UNBILLED',
      reservedBy: null, reservedAt: null, reservedInvoiceId: null,
    });
    expect(audit.log).toHaveBeenCalledWith('INVOICE_VOIDED', expect.any(String));
  });

  it('from SENT: VOID + sources un-marked INVOICED back to UNBILLED (re-billable)', async () => {
    setupReservedDraft();
    (getInvoiceById as Mock).mockResolvedValue(invoice({ status: 'SENT', invoiceNumber: 'INV-000042' }));
    (getTimeEntryById as Mock).mockResolvedValue(timeEntry({
      billingStatus: 'INVOICED', invoiceId: 'inv-1',
      reservedInvoiceId: null, reservedBy: null, reservedAt: null,
    }));
    (getExpenseById as Mock).mockResolvedValue(expense({
      billingStatus: 'INVOICED', invoiceId: 'inv-1',
      reservedInvoiceId: null, reservedBy: null, reservedAt: null,
    }));
    const result = await voidInvoice('inv-1', TENANT, ACTOR_ADMIN, audit);
    expect(result.ok).toBe(true);
    const unmark = (updateTimeEntryRepo as Mock).mock.calls[0][2];
    expect(unmark).toEqual({
      billingStatus: 'UNBILLED', invoiceId: null,
      reservedBy: null, reservedAt: null, reservedInvoiceId: null,
    });
  });

  it('§61 guard — a source invoiced by ANOTHER invoice is never touched', async () => {
    setupReservedDraft();
    (getInvoiceById as Mock).mockResolvedValue(invoice({ status: 'SENT', invoiceNumber: 'INV-000042' }));
    (getTimeEntryById as Mock).mockResolvedValue(timeEntry({
      billingStatus: 'INVOICED', invoiceId: 'inv-OTHER',
      reservedInvoiceId: null, reservedBy: null, reservedAt: null,
    }));
    const result = await voidInvoice('inv-1', TENANT, ACTOR_ADMIN, audit);
    expect(result.ok).toBe(true);
    // The other invoice's source was never written — nor the expense, whose
    // §61 invoiceId is unset and therefore not this invoice's either.
    expect(updateTimeEntryRepo).toHaveBeenCalledTimes(0);
    expect(updateExpenseRepo).toHaveBeenCalledTimes(0);
  });

  it('PAID is never voidable (§79)', async () => {
    setupReservedDraft();
    (getInvoiceById as Mock).mockResolvedValue(invoice({ status: 'PAID' }));
    const result = await voidInvoice('inv-1', TENANT, ACTOR_ADMIN, audit);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
    expect(updateInvoiceRepo).not.toHaveBeenCalled();
  });

  it('an invoice with payments recorded is never voidable, even PARTIALLY_PAID', async () => {
    setupReservedDraft();
    (getInvoiceById as Mock).mockResolvedValue(invoice({
      status: 'PARTIALLY_PAID',
      total: makeMoney(17000), amountPaid: makeMoney(5000), amountDue: makeMoney(12000),
    }));
    const result = await voidInvoice('inv-1', TENANT, ACTOR_ADMIN, audit);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
    expect((result as { error?: string }).error).toMatch(/payments recorded/);
  });

  it('a VOID invoice is terminal', async () => {
    setupReservedDraft();
    (getInvoiceById as Mock).mockResolvedValue(invoice({ status: 'VOID' }));
    const result = await voidInvoice('inv-1', TENANT, ACTOR_ADMIN, audit);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
  });

  it('§113 — a missing invoice is a 404', async () => {
    setupReservedDraft();
    (getInvoiceById as Mock).mockResolvedValue(null);
    const result = await voidInvoice('inv-x', TENANT, ACTOR_ADMIN, audit);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
  });
});

// ---------- §81/§82 sendInvoice ----------

describe('sendInvoice (§81/§82)', () => {
  it('records the delivery: sentAt stamped + INVOICE_SENT audited, sources untouched', async () => {
    (getInvoiceById as Mock).mockResolvedValue(invoice({
      status: 'SENT', invoiceNumber: 'INV-000042', total: makeMoney(17000), amountDue: makeMoney(17000),
    }));
    const result = await sendInvoice('inv-1', TENANT, ACTOR_ADMIN, audit);
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);

    // The ONLY write is the sentAt stamp — no status/money/source mutation.
    expect(updateInvoiceRepo).toHaveBeenCalledTimes(1);
    const write = (updateInvoiceRepo as Mock).mock.calls[0][2];
    expect(Object.keys(write)).toEqual(['sentAt']);
    expect(write.sentAt).toBeInstanceOf(Date);
    expect(updateTimeEntryRepo).not.toHaveBeenCalled();
    expect(updateExpenseRepo).not.toHaveBeenCalled();
    expect(updateProjectMilestoneRepo).not.toHaveBeenCalled();
    expect(allocateInvoiceNumberForFiscalYear).not.toHaveBeenCalled();

    expect(audit.log).toHaveBeenCalledWith('INVOICE_SENT', expect.stringContaining('INV-000042'));
  });

  it('a re-send is allowed and re-stamps (the audit trail shows every send)', async () => {
    (getInvoiceById as Mock).mockResolvedValue(invoice({
      status: 'SENT', invoiceNumber: 'INV-000042', sentAt: new Date('2026-09-10T10:00:00Z'),
    }));
    const result = await sendInvoice('inv-1', TENANT, ACTOR_ADMIN, audit);
    expect(result.ok).toBe(true);
    expect(updateInvoiceRepo).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledWith('INVOICE_SENT', expect.stringContaining('re-send'));
  });

  it('a DRAFT cannot be sent — it carries no invoice number (§74)', async () => {
    (getInvoiceById as Mock).mockResolvedValue(invoice());
    const result = await sendInvoice('inv-1', TENANT, ACTOR_ADMIN, audit);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
    expect((result as { error?: string }).error).toMatch(/Finalize the invoice/);
    expect(updateInvoiceRepo).not.toHaveBeenCalled();
  });

  it('a VOID invoice cannot be sent (§79 terminal state)', async () => {
    (getInvoiceById as Mock).mockResolvedValue(invoice({ status: 'VOID' }));
    const result = await sendInvoice('inv-1', TENANT, ACTOR_ADMIN, audit);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
    expect((result as { error?: string }).error).toMatch(/voided/);
    expect(updateInvoiceRepo).not.toHaveBeenCalled();
  });

  it('§113 — a missing invoice is a 404', async () => {
    (getInvoiceById as Mock).mockResolvedValue(null);
    const result = await sendInvoice('inv-x', TENANT, ACTOR_ADMIN, audit);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
  });

  it('a repo miss on the stamp surfaces as 404, never a false success', async () => {
    (getInvoiceById as Mock).mockResolvedValue(invoice({ status: 'SENT', invoiceNumber: 'INV-000042' }));
    (updateInvoiceRepo as Mock).mockResolvedValue(false);
    const result = await sendInvoice('inv-1', TENANT, ACTOR_ADMIN, audit);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
  });
});
