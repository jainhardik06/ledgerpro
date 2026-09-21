/**
 * Module 9 (§56–§86) — invoice DOMAIN service tests (Sprint 9A core).
 *
 * Pins the rules that make billing honest:
 *   - §63/§65/§66 RESERVATION: add-line reserves the source; a second draft
 *     adding the same source gets a 409; remove-line releases back to
 *     UNBILLED (guarded — only the holding draft releases)
 *   - §70 eligibility at add-time: RESERVED and INVOICED sources are 409s
 *     with EXPLICIT messages (§84 — never silently dropped)
 *   - §73 percentage milestones freeze percentage × contractValue
 *   - §71 MANUAL/FIXED_FEE free-form lines; sourceId required for backed
 *   - §74 drafts carry no number
 *   - §67 currency + dueDate defaults from the client's profiles
 *   - §113 tenant integrity, DRAFT-only edits
 *
 * Repository writes are mocked to echo their input — the DOMAIN logic is
 * what these tests pin.
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
  getClientById, getProjectById, getTenantById,
  getProjectMilestoneById, updateProjectMilestone as updateProjectMilestoneRepo,
  getTimeEntryById, updateTimeEntry as updateTimeEntryRepo,
  getExpenseById, updateExpense as updateExpenseRepo,
  getInvoiceById, createInvoice as createInvoiceRepo,
  updateInvoice as updateInvoiceRepo,
  getInvoiceLines, createInvoiceLine, deleteInvoiceLine,
  allocateInvoiceNumberForFiscalYear, seedInvoiceSequenceFromLegacy,
} from '@/lib/db';
import {
  createInvoiceDraft, addInvoiceLine, removeInvoiceLine,
  updateInvoiceDraft, setInvoiceTaxation, allocateInvoiceNumber,
  reserveBillableItems, releaseBillableItems,
} from '@/lib/agency/domain/agency.invoices';
import { agencyToday } from '@/lib/agency/domain/agency.settings';
import {
  getBillableTime, getBillableExpenses, getBillableMilestones,
} from '@/lib/agency/domain/billing-sources';
import type { Invoice, InvoiceLine } from '@/lib/agency/types/invoice';
import { formatInvoiceNumber } from '@/lib/agency/types/invoice';
import type { TimeEntry } from '@/lib/agency/types/time';
import type { Expense } from '@/lib/agency/types/expense';
import type { Project, ProjectMilestone } from '@/lib/agency/types/project';
import { makeMoney, zeroMoney } from '@/lib/agency/types/money';
import { todayInTimezone } from '@/lib/agency/types/dates';

const TENANT = 'tenant-a';
const TODAY = todayInTimezone();
const audit = { username: 'tester', tenantId: TENANT, log: vi.fn() };
const ACTOR_ADMIN = { userId: 'admin-1', role: 'TENANT_ADMIN' as const };

const PROJECT: Project = {
  id: 'proj-1', tenantId: TENANT, clientId: 'client-1', name: 'Acme Web',
  status: 'ACTIVE', billingModel: 'TIME_AND_MATERIALS', currency: 'INR',
  contractValue: 500000, projectManagerId: 'pm-1', createdAt: new Date('2026-01-01'),
};

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
    approvalStatus: 'APPROVED', billingStatus: 'UNBILLED', financialStatus: 'READY',
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
    expenseDate: TODAY, status: 'APPROVED', billingStatus: 'UNBILLED',
    createdBy: 'dev-1',
    createdAt: new Date('2026-09-01'), updatedAt: new Date('2026-09-01'),
    ...overrides,
  };
}

function milestone(overrides: Partial<ProjectMilestone> = {}): ProjectMilestone {
  return {
    id: 'mile-1', tenantId: TENANT, projectId: 'proj-1',
    name: 'Design', sequence: 2, amount: 200000,
    status: 'COMPLETED', billingStatus: 'UNBILLED',
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

function echoCreateInvoice(tenantId: string, input: Record<string, unknown>): Invoice {
  return {
    id: 'inv-new', tenantId, ...input,
    createdAt: new Date(), updatedAt: new Date(),
  } as unknown as Invoice;
}

function echoCreateLine(tenantId: string, input: Record<string, unknown>): InvoiceLine {
  return {
    id: 'line-new', tenantId, ...input,
    createdAt: new Date(), updatedAt: new Date(),
  } as unknown as InvoiceLine;
}

beforeEach(() => {
  vi.clearAllMocks();
  (getClientById as Mock).mockResolvedValue({
    id: 'client-1', tenantId: TENANT, name: 'Acme',
    billingProfile: { currency: 'INR' },
    commercialDefaults: { paymentTerms: 'NET_15' },
  });
  (getProjectById as Mock).mockResolvedValue(PROJECT);
  (getInvoiceById as Mock).mockResolvedValue(invoice());
  (createInvoiceRepo as Mock).mockImplementation(echoCreateInvoice);
  (updateInvoiceRepo as Mock).mockResolvedValue(true);
  (getInvoiceLines as Mock).mockResolvedValue([]);
  (createInvoiceLine as Mock).mockImplementation(echoCreateLine);
  (deleteInvoiceLine as Mock).mockResolvedValue(true);
  (updateTimeEntryRepo as Mock).mockResolvedValue(true);
  (updateExpenseRepo as Mock).mockResolvedValue(true);
  (updateProjectMilestoneRepo as Mock).mockResolvedValue(true);
  (getTimeEntryById as Mock).mockResolvedValue(timeEntry());
  (getExpenseById as Mock).mockResolvedValue(expense());
  (getProjectMilestoneById as Mock).mockResolvedValue(milestone());
});

// ---------- §67 draft creation ----------

describe('createInvoiceDraft (§67/§68)', () => {
  it('creates a DRAFT with no invoiceNumber (§74) and zero money', async () => {
    const result = await createInvoiceDraft(TENANT, ACTOR_ADMIN, {
      clientId: 'client-1', projectId: 'proj-1',
    }, audit);
    expect(result.ok).toBe(true);
    expect(result.status).toBe(201);
    const created = (createInvoiceRepo as Mock).mock.calls[0][1];
    expect(created.status).toBeUndefined(); // repo stamps DRAFT
    expect(created.invoiceNumber).toBeUndefined();
    expect(created.clientId).toBe('client-1');
  });

  it('§68 — dueDate defaults from the client\'s payment terms (NET_15)', async () => {
    await createInvoiceDraft(TENANT, ACTOR_ADMIN, { clientId: 'client-1' }, audit);
    const created = (createInvoiceRepo as Mock).mock.calls[0][1];
    expect(created.dueDate).not.toBe(TODAY); // +15 days
    expect(created.issueDate).toBe(TODAY);
  });

  it('§113 — a cross-tenant client is an identical 404', async () => {
    (getClientById as Mock).mockResolvedValue(null);
    const result = await createInvoiceDraft(TENANT, ACTOR_ADMIN, { clientId: 'client-x' }, audit);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
  });

  it('rejects a project belonging to a different client', async () => {
    const result = await createInvoiceDraft(TENANT, ACTOR_ADMIN, {
      clientId: 'client-2', projectId: 'proj-1',
    }, audit);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
  });

  it('rejects dueDate before issueDate', async () => {
    const result = await createInvoiceDraft(TENANT, ACTOR_ADMIN, {
      clientId: 'client-1',
      issueDate: TODAY,
      dueDate: '2020-01-01',
    }, audit);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
  });

  // ---------- Module 17 §44 — the agency settings rungs ----------

  it('§44 — the "today" anchor follows the agency timezone', async () => {
    // 2026-06-15T20:00Z: already Jun 16 in Pacific/Kiritimati (+14) and
    // Asia/Kolkata (+5:30), still Jun 15 in Pacific/Pago_Pago (-11).
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T20:00:00Z'));
    (getTenantById as Mock).mockImplementation(async () => ({ agencySettings: { general: { timezone: 'Pacific/Pago_Pago' } } }));
    try {
      await createInvoiceDraft(TENANT, ACTOR_ADMIN, { clientId: 'client-1' }, audit);
      expect((createInvoiceRepo as Mock).mock.calls[0][1].issueDate).toBe('2026-06-15');

      (getTenantById as Mock).mockImplementation(async () => ({ agencySettings: { general: { timezone: 'Pacific/Kiritimati' } } }));
      await createInvoiceDraft(TENANT, ACTOR_ADMIN, { clientId: 'client-1' }, audit);
      expect((createInvoiceRepo as Mock).mock.calls[1][1].issueDate).toBe('2026-06-16');

      // Jun 16 is a legal "today" in Kolkata/Kiritimati but the FUTURE in
      // Pago_Pago — the anchor must reject it under that agency timezone.
      (getTenantById as Mock).mockImplementation(async () => ({ agencySettings: { general: { timezone: 'Pacific/Pago_Pago' } } }));
      const rejected = await createInvoiceDraft(TENANT, ACTOR_ADMIN, {
        clientId: 'client-1', issueDate: '2026-06-16',
      }, audit);
      expect(rejected.ok).toBe(false);
      expect(rejected.status).toBe(400);
    } finally {
      vi.useRealTimers();
      (getTenantById as Mock).mockReset(); // restore the bare undefined mock
    }
  });

  it('§44 — currency falls through to the agency default when the client carries none', async () => {
    (getTenantById as Mock).mockImplementation(async () => ({ agencySettings: { general: { defaultCurrency: 'USD' } } }));
    (getClientById as Mock).mockResolvedValue({ id: 'client-1', tenantId: TENANT, name: 'Acme' });
    try {
      await createInvoiceDraft(TENANT, ACTOR_ADMIN, { clientId: 'client-1' }, audit);
      expect((createInvoiceRepo as Mock).mock.calls[0][1].currency).toBe('USD');
    } finally {
      (getTenantById as Mock).mockReset();
    }
  });

  it('§44 — the client currency beats the agency default, explicit beats both', async () => {
    (getTenantById as Mock).mockImplementation(async () => ({ agencySettings: { general: { defaultCurrency: 'USD' } } }));
    try {
      // client-1 carries billingProfile.currency INR (beforeEach) — it wins.
      await createInvoiceDraft(TENANT, ACTOR_ADMIN, { clientId: 'client-1' }, audit);
      expect((createInvoiceRepo as Mock).mock.calls[0][1].currency).toBe('INR');
      // an explicit payload currency beats every default rung.
      await createInvoiceDraft(TENANT, ACTOR_ADMIN, { clientId: 'client-1', currency: 'EUR' }, audit);
      expect((createInvoiceRepo as Mock).mock.calls[1][1].currency).toBe('EUR');
    } finally {
      (getTenantById as Mock).mockReset();
    }
  });
});

// ---------- Module 17 §44 — the shared agency-timezone "today" ----------

describe('agencyToday (§44)', () => {
  it('returns the date in the tenant\'s agency timezone, defaulting when unset', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T20:00:00Z')); // Kiritimati: Jun 16; Pago_Pago: Jun 15
    try {
      (getTenantById as Mock).mockImplementation(async () => ({ agencySettings: { general: { timezone: 'Pacific/Kiritimati' } } }));
      await expect(agencyToday(TENANT)).resolves.toBe('2026-06-16');
      (getTenantById as Mock).mockImplementation(async () => ({ agencySettings: { general: { timezone: 'Pacific/Pago_Pago' } } }));
      await expect(agencyToday(TENANT)).resolves.toBe('2026-06-15');
      (getTenantById as Mock).mockImplementation(async () => null);
      await expect(agencyToday(TENANT)).resolves.toBe(todayInTimezone()); // §17.2 default zone
    } finally {
      vi.useRealTimers();
      (getTenantById as Mock).mockReset();
    }
  });
});

// ---------- §63 reservation ----------

describe('addInvoiceLine — reservation (§63/§65/§66)', () => {
  it('adding a TIME line RESERVES the entry (§63)', async () => {
    const result = await addInvoiceLine('inv-1', TENANT, ACTOR_ADMIN, {
      type: 'TIME', description: 'Development', sourceId: 'time-1',
    }, audit);
    expect(result.ok).toBe(true);
    expect(result.status).toBe(201);
    expect(result.data?.line.amount.amount).toBe(5000); // §23 frozen economics

    const update = (updateTimeEntryRepo as Mock).mock.calls[0];
    expect(update[2].billingStatus).toBe('RESERVED');
    expect(update[2].reservedBy).toBe('admin-1');
    expect(update[2].reservedInvoiceId).toBe('inv-1');
  });

  it('adding an EXPENSE line bills the CLIENT CHARGE (§49), reserves, and recomputes money', async () => {
    // The repo persisted the line — recalculation re-reads it.
    (getInvoiceLines as Mock).mockResolvedValue([
      line({ type: 'EXPENSE', sourceId: 'exp-1', amount: makeMoney(12000) }),
    ]);
    const result = await addInvoiceLine('inv-1', TENANT, ACTOR_ADMIN, {
      type: 'EXPENSE', description: 'Stock assets', sourceId: 'exp-1',
    }, audit);
    expect(result.ok).toBe(true);
    expect(result.data?.line.amount.amount).toBe(12000); // charge, never cost

    const expenseUpdate = (updateExpenseRepo as Mock).mock.calls[0];
    expect(expenseUpdate[2].billingStatus).toBe('RESERVED');

    // Engine recomputed the draft's totals from the line.
    const invoiceUpdate = (updateInvoiceRepo as Mock).mock.calls.find(
      (c: unknown[]) => c[0] === 'inv-1'
    )!;
    expect(invoiceUpdate[2].subtotal.amount).toBe(12000);
    expect(invoiceUpdate[2].total.amount).toBe(12000);
    expect(invoiceUpdate[2].amountDue.amount).toBe(12000);
  });

  it('§65 — a source RESERVED by another draft is a 409', async () => {
    (getTimeEntryById as Mock).mockResolvedValue(
      timeEntry({ billingStatus: 'RESERVED', reservedInvoiceId: 'inv-OTHER' })
    );
    const result = await addInvoiceLine('inv-1', TENANT, ACTOR_ADMIN, {
      type: 'TIME', description: 'Development', sourceId: 'time-1',
    }, audit);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
    expect(result.error).toMatch(/another draft/);
  });

  it('§84 — an INVOICED source is an explicit 409, never silently skipped', async () => {
    (getTimeEntryById as Mock).mockResolvedValue(
      timeEntry({ billingStatus: 'INVOICED', invoiceId: 'inv-OLD' })
    );
    const result = await addInvoiceLine('inv-1', TENANT, ACTOR_ADMIN, {
      type: 'TIME', description: 'Development', sourceId: 'time-1',
    }, audit);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
    expect(result.error).toMatch(/already invoiced/);
  });

  it('§70 — a DRAFT time entry is not billable (409 with the honest reason)', async () => {
    (getTimeEntryById as Mock).mockResolvedValue(
      timeEntry({ approvalStatus: 'DRAFT', calculatedBillableAmount: undefined })
    );
    const result = await addInvoiceLine('inv-1', TENANT, ACTOR_ADMIN, {
      type: 'TIME', description: 'Development', sourceId: 'time-1',
    }, audit);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
  });

  it('§113 — a cross-tenant source is an identical 404', async () => {
    (getTimeEntryById as Mock).mockResolvedValue(null);
    const result = await addInvoiceLine('inv-1', TENANT, ACTOR_ADMIN, {
      type: 'TIME', description: 'Development', sourceId: 'time-x',
    }, audit);
    expect(result.status).toBe(404);
  });

  it('a source from another project is rejected (scoping)', async () => {
    (getTimeEntryById as Mock).mockResolvedValue(timeEntry({ projectId: 'proj-OTHER' }));
    const result = await addInvoiceLine('inv-1', TENANT, ACTOR_ADMIN, {
      type: 'TIME', description: 'Development', sourceId: 'time-1',
    }, audit);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(result.error).toMatch(/invoice's project/);
  });

  it('a currency-mismatched source is rejected (never converted)', async () => {
    (getExpenseById as Mock).mockResolvedValue(
      expense({ clientChargeAmount: makeMoney(120, 'USD') })
    );
    const result = await addInvoiceLine('inv-1', TENANT, ACTOR_ADMIN, {
      type: 'EXPENSE', description: 'Stock assets', sourceId: 'exp-1',
    }, audit);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(result.error).toMatch(/never converted/);
  });

  it('only a DRAFT can gain lines', async () => {
    (getInvoiceById as Mock).mockResolvedValue(invoice({ status: 'SENT' }));
    const result = await addInvoiceLine('inv-1', TENANT, ACTOR_ADMIN, {
      type: 'MANUAL', description: 'Ad-hoc', amount: 5000,
    }, audit);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
  });
});

// ---------- §71 free-form lines ----------

describe('addInvoiceLine — MANUAL/FIXED_FEE (§71)', () => {
  it('a FIXED_FEE line carries its payload amount — no fabricated time revenue', async () => {
    const result = await addInvoiceLine('inv-1', TENANT, ACTOR_ADMIN, {
      type: 'FIXED_FEE', description: 'Website Development', amount: 500000,
    }, audit);
    expect(result.ok).toBe(true);
    expect(result.data?.line.amount.amount).toBe(500000);
    expect(result.data?.line.sourceId).toBeUndefined();
    // No reservation write happened — nothing to reserve.
    expect((updateTimeEntryRepo as Mock).mock.calls).toHaveLength(0);
  });

  it('a quantity × unitPrice MANUAL line prices through the engine', async () => {
    const result = await addInvoiceLine('inv-1', TENANT, ACTOR_ADMIN, {
      type: 'MANUAL', description: 'Licences',
      quantity: 42, unitPrice: 2500, amount: 0,
    }, audit);
    expect(result.ok).toBe(true);
    expect(result.data?.line.amount.amount).toBe(105000); // §72
  });

  it('a MANUAL line without an amount is a 400', async () => {
    const result = await addInvoiceLine('inv-1', TENANT, ACTOR_ADMIN, {
      type: 'MANUAL', description: 'Ad-hoc',
    }, audit);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
  });
});

// ---------- §73 milestone lines ----------

describe('addInvoiceLine — MILESTONE (§73)', () => {
  it('an amount-based milestone bills its amount', async () => {
    const result = await addInvoiceLine('inv-1', TENANT, ACTOR_ADMIN, {
      type: 'MILESTONE', description: 'Design Milestone', sourceId: 'mile-1',
    }, audit);
    expect(result.ok).toBe(true);
    expect(result.data?.line.amount.amount).toBe(200000);
  });

  it('§73 — a percentage milestone freezes percentage × contractValue', async () => {
    (getProjectMilestoneById as Mock).mockResolvedValue(
      milestone({ amount: undefined, percentage: 40 })
    );
    const result = await addInvoiceLine('inv-1', TENANT, ACTOR_ADMIN, {
      type: 'MILESTONE', description: 'Design Milestone', sourceId: 'mile-1',
    }, audit);
    expect(result.ok).toBe(true);
    expect(result.data?.line.amount.amount).toBe(200000); // 40% × 500000
  });

  it('a PLANNED milestone is not billable (§70)', async () => {
    (getProjectMilestoneById as Mock).mockResolvedValue(milestone({ status: 'PLANNED' }));
    const result = await addInvoiceLine('inv-1', TENANT, ACTOR_ADMIN, {
      type: 'MILESTONE', description: 'Design Milestone', sourceId: 'mile-1',
    }, audit);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
  });

  it('a percentage milestone with no project contract value is an honest 400 (§97)', async () => {
    (getProjectMilestoneById as Mock).mockResolvedValue(
      milestone({ amount: undefined, percentage: 40 })
    );
    (getProjectById as Mock).mockResolvedValue({ ...PROJECT, contractValue: undefined });
    const result = await addInvoiceLine('inv-1', TENANT, ACTOR_ADMIN, {
      type: 'MILESTONE', description: 'Design Milestone', sourceId: 'mile-1',
    }, audit);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(result.error).toMatch(/no contract value/);
  });
});

// ---------- §66 release ----------

describe('removeInvoiceLine — release (§66)', () => {
  it('removing a line releases the reservation back to UNBILLED', async () => {
    (getInvoiceLines as Mock).mockResolvedValue([
      line({ type: 'TIME', sourceId: 'time-1' }),
    ]);
    (getTimeEntryById as Mock).mockResolvedValue(
      timeEntry({ billingStatus: 'RESERVED', reservedInvoiceId: 'inv-1' })
    );
    const result = await removeInvoiceLine('inv-1', 'line-1', TENANT, audit);
    expect(result.ok).toBe(true);

    const update = (updateTimeEntryRepo as Mock).mock.calls[0];
    expect(update[2].billingStatus).toBe('UNBILLED');
    expect(update[2].reservedInvoiceId).toBeNull();
    expect(deleteInvoiceLine).toHaveBeenCalledWith('line-1', TENANT);
  });

  it('§66 guard — only the holding draft may release', async () => {
    (getInvoiceLines as Mock).mockResolvedValue([
      line({ type: 'TIME', sourceId: 'time-1' }),
    ]);
    (getTimeEntryById as Mock).mockResolvedValue(
      timeEntry({ billingStatus: 'RESERVED', reservedInvoiceId: 'inv-OTHER' })
    );
    await removeInvoiceLine('inv-1', 'line-1', TENANT, audit);
    // No UNBILLED write — the reservation belongs to another draft.
    expect((updateTimeEntryRepo as Mock).mock.calls).toHaveLength(0);
  });

  it('only a DRAFT can lose lines', async () => {
    (getInvoiceById as Mock).mockResolvedValue(invoice({ status: 'VOID' }));
    const result = await removeInvoiceLine('inv-1', 'line-1', TENANT, audit);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
  });
});

// ---------- batch reserve/release (§82) ----------

describe('reserveBillableItems / releaseBillableItems (§82)', () => {
  it('reserves each verified source and reports the count', async () => {
    const result = await reserveBillableItems(TENANT, 'inv-1', 'admin-1', [
      { type: 'TIME', sourceId: 'time-1' },
      { type: 'EXPENSE', sourceId: 'exp-1' },
    ], audit);
    expect(result.ok).toBe(true);
    expect(result.data?.reserved).toBe(2);
    expect((updateTimeEntryRepo as Mock).mock.calls).toHaveLength(1);
    expect((updateExpenseRepo as Mock).mock.calls).toHaveLength(1);
  });

  it('a mid-batch failure releases the already-reserved sources (§83 compensation)', async () => {
    // Stateful mocks: the reserve write persists, so the rollback's fresh
    // load sees the RESERVED stamp and may release it (§66 guard).
    let entry = timeEntry();
    (getTimeEntryById as Mock).mockImplementation(() => Promise.resolve(entry));
    (updateTimeEntryRepo as Mock).mockImplementation((_id: string, _t: string, patch: Record<string, unknown>) => {
      entry = { ...entry, ...patch } as TimeEntry;
      return Promise.resolve(true);
    });
    (getExpenseById as Mock).mockResolvedValue(
      expense({ billingStatus: 'INVOICED', invoiceId: 'inv-OLD' })
    );
    const result = await reserveBillableItems(TENANT, 'inv-1', 'admin-1', [
      { type: 'TIME', sourceId: 'time-1' },
      { type: 'EXPENSE', sourceId: 'exp-1' },
    ], audit);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
    // The TIME reservation was rolled back.
    const timeUpdates = (updateTimeEntryRepo as Mock).mock.calls;
    expect(timeUpdates[0][2].billingStatus).toBe('RESERVED');
    expect(timeUpdates[1][2].billingStatus).toBe('UNBILLED');
  });

  it('releaseBillableItems walks the lines and releases holders', async () => {
    (getInvoiceLines as Mock).mockResolvedValue([
      line({ type: 'TIME', sourceId: 'time-1' }),
      line({ type: 'MANUAL' }), // no source — skipped
    ]);
    (getTimeEntryById as Mock).mockResolvedValue(
      timeEntry({ billingStatus: 'RESERVED', reservedInvoiceId: 'inv-1' })
    );
    const result = await releaseBillableItems(TENANT, 'inv-1', audit);
    expect(result.ok).toBe(true);
    expect(result.data?.released).toBe(1);
  });
});

// ---------- §74 numbering authority ----------

describe('allocateInvoiceNumber (§74/§23)', () => {
  it('seeds from the legacy counter once, then formats the FY-scoped allocation', async () => {
    (allocateInvoiceNumberForFiscalYear as Mock).mockResolvedValue(42);
    const number = await allocateInvoiceNumber(TENANT, 'FY2026-27');
    expect(number).toBe('INV-000042');
    // §23 — the allocation is scoped to {tenant, fiscalYear}, and the legacy
    // tenant-wide counter is consulted (seeded) exactly once before it.
    expect(seedInvoiceSequenceFromLegacy).toHaveBeenCalledWith(TENANT, 'FY2026-27', 'INV-');
    expect(allocateInvoiceNumberForFiscalYear).toHaveBeenCalledWith(TENANT, 'FY2026-27', 'INV-');
  });

  it('§7/§23 — honors the tenant billing profile\'s configured invoicePrefix', async () => {
    (allocateInvoiceNumberForFiscalYear as Mock).mockResolvedValue(7);
    const number = await allocateInvoiceNumber(TENANT, 'FY2026-27', 'ATLAS-');
    expect(number).toBe('ATLAS-000007');
    expect(allocateInvoiceNumberForFiscalYear).toHaveBeenCalledWith(TENANT, 'FY2026-27', 'ATLAS-');
  });
});

// ---------- §63 PATCH + taxation ----------

describe('updateInvoiceDraft / setInvoiceTaxation (§63/§76/§77)', () => {
  it('PATCH accepts notes/terms/dueDate only; DRAFT-only', async () => {
    const result = await updateInvoiceDraft('inv-1', TENANT, { notes: 'Thank you' }, audit);
    expect(result.ok).toBe(true);
    expect(updateInvoiceRepo).toHaveBeenCalledWith('inv-1', TENANT, { notes: 'Thank you' });

    (getInvoiceById as Mock).mockResolvedValue(invoice({ status: 'SENT' }));
    const locked = await updateInvoiceDraft('inv-1', TENANT, { notes: 'x' }, audit);
    expect(locked.ok).toBe(false);
    expect(locked.status).toBe(409);
  });

  it('setInvoiceTaxation recomputes everything through the engine (§77)', async () => {
    (getInvoiceLines as Mock).mockResolvedValue([line({ amount: makeMoney(100000) })]);
    const result = await setInvoiceTaxation('inv-1', TENANT, {
      discountAmount: 5000,
      taxes: [{ name: 'IGST', rate: 18 }],
    }, audit);
    expect(result.ok).toBe(true);
    const update = (updateInvoiceRepo as Mock).mock.calls[0][2];
    expect(update.subtotal.amount).toBe(100000);
    expect(update.discount.amount).toBe(5000);
    expect(update.taxTotal.amount).toBe(17100); // 18% × 95000
    expect(update.total.amount).toBe(112100);
    expect(update.taxLines).toHaveLength(1);
    expect(update.taxLines[0].name).toBe('IGST');
  });

  it('a discount exceeding the subtotal is a 400, not a negative total', async () => {
    (getInvoiceLines as Mock).mockResolvedValue([line({ amount: makeMoney(100) })]);
    const result = await setInvoiceTaxation('inv-1', TENANT, { discountAmount: 500 }, audit);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
  });
});

// ---------- §144 aggregation ----------

describe('billing source aggregation (§69/§70/§144)', () => {
  it('getBillableTime returns only the eligible set with frozen amounts', async () => {
    const { getTimeEntries } = await import('@/lib/db');
    const eligible = timeEntry();
    const reserved = timeEntry({ id: 'time-2', billingStatus: 'RESERVED' });
    const draft = timeEntry({ id: 'time-3', approvalStatus: 'DRAFT' });
    const blocked = timeEntry({ id: 'time-4', financialStatus: 'RATE_CONFIGURATION_REQUIRED', calculatedBillableAmount: undefined });
    (getTimeEntries as Mock).mockResolvedValue([eligible, reserved, draft, blocked]);
    const items = await getBillableTime(TENANT, { projectId: 'proj-1' });
    expect(items).toHaveLength(1);
    expect(items[0].entry.id).toBe('time-1');
    expect(items[0].amount.amount).toBe(5000);
  });

  it('getBillableExpenses queries the §48 triple and drops charge-less expenses', async () => {
    const { getExpenses } = await import('@/lib/db');
    // The repo applies the filters it is handed (§48 triple) — honor them.
    (getExpenses as Mock).mockImplementation((_t: string, f: Record<string, unknown>) =>
      Promise.resolve(
        [
          expense(),
          expense({ id: 'exp-2', status: 'DRAFT' }),                              // filtered by the repo query
          expense({ id: 'exp-3', clientChargeAmount: undefined, markupPercent: 0 }), // no charge — dropped by the domain
        ].filter(e => f.status === undefined || e.status === f.status)
      )
    );
    const items = await getBillableExpenses(TENANT, { projectId: 'proj-1' });
    expect(getExpenses).toHaveBeenCalledWith(TENANT, expect.objectContaining({
      billable: true, status: 'APPROVED', billingStatus: 'UNBILLED',
    }));
    expect(items).toHaveLength(1);
    expect(items[0].amount.amount).toBe(12000);
  });

  it('getBillableMilestones: COMPLETED + UNBILLED + commercial definition; §97 counts unvaluable', async () => {
    const { getProjects, getProjectMilestones } = await import('@/lib/db');
    (getProjects as Mock).mockResolvedValue([PROJECT]);
    (getProjectMilestones as Mock).mockResolvedValue([
      milestone(),                                                        // billable (amount)
      milestone({ id: 'm2', status: 'PLANNED' }),                          // not completed
      milestone({ id: 'm3', billingStatus: 'RESERVED' }),                  // held by a draft
      milestone({ id: 'm4', billingStatus: 'INVOICED', invoiceId: 'inv-OLD' }),
      milestone({ id: 'm5', amount: undefined, percentage: 40 }),          // percentage → 200000
      milestone({ id: 'm6', amount: undefined, percentage: 10, description: 'no value' }), // unvaluable if no contract
    ]);
    (getProjectById as Mock).mockResolvedValue({ ...PROJECT, contractValue: 500000 });
    const result = await getBillableMilestones(TENANT, {});
    // m5 bills; m6 is percentage too and contractValue exists → also bills.
    // To exercise §97, contractValue must be missing:
    expect(result.items.map(i => i.milestone.id)).toContain('m5');
    expect(result.unvaluable).toBe(0);
  });

  it('§97 — percentage milestones with no contract value are counted, never hidden', async () => {
    const { getProjects, getProjectMilestones } = await import('@/lib/db');
    (getProjects as Mock).mockResolvedValue([{ ...PROJECT, contractValue: undefined }]);
    (getProjectMilestones as Mock).mockResolvedValue([
      milestone({ id: 'm1', amount: undefined, percentage: 40 }),
    ]);
    const result = await getBillableMilestones(TENANT, {});
    expect(result.items).toHaveLength(0);
    expect(result.unvaluable).toBe(1);
  });

  it('an amount milestone bills even without a project contract value', async () => {
    const { getProjects, getProjectMilestones } = await import('@/lib/db');
    (getProjects as Mock).mockResolvedValue([{ ...PROJECT, contractValue: undefined }]);
    (getProjectMilestones as Mock).mockResolvedValue([milestone()]);
    const result = await getBillableMilestones(TENANT, {});
    expect(result.items).toHaveLength(1);
    expect(result.items[0].amount.amount).toBe(200000);
  });
});
