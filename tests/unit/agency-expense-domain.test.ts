/**
 * Module 8 (§35–§55) — expense domain tests.
 *
 * Pins the rules that make expenses financially honest:
 *   - markup: 10000 at 20% → 12000, one final rounding (§43/§44)
 *   - billability is type AND flag; INTERNAL is never billable (§39)
 *   - the approval state machine and edit lifecycle (§40/§22/§28 patterns)
 *   - approval authority: PM/admin yes, own expense NEVER (§21 mirror)
 *   - §41/§42: exactly ONE core Transaction per expense, created at
 *     APPROVAL, idempotent via transactionId — re-approval never duplicates
 *   - §48/§49: invoice eligibility = APPROVED + billable + UNBILLED
 *   - tenant integrity (§47) with §113 identical-404s
 *   - ownership security (§33 pattern): a USER lists/edits only their own
 *
 * Repository writes are mocked to echo their input — the DOMAIN logic is
 * what these tests pin.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('@/lib/db', () => ({
  getProjectById: vi.fn(),
  getClientById: vi.fn(),
  getTenantById: vi.fn(),
  getExpenses: vi.fn(),
  getExpenseById: vi.fn(),
  createExpense: vi.fn(),
  updateExpense: vi.fn(),
  createTransaction: vi.fn(),
  // Transitively imported by agency.clients (AuditContext/DomainResult home).
  createClient: vi.fn(), getClients: vi.fn(),
  updateClient: vi.fn(), searchClients: vi.fn(), findClientByName: vi.fn(),
  getLogs: vi.fn(),
}));

import {
  getProjectById, getClientById, getExpenses,
  getExpenseById, createExpense as createExpenseRepo,
  updateExpense as updateExpenseRepo, createTransaction,
} from '@/lib/db';
import {
  createExpense, updateExpense, submitExpense, approveExpense, rejectExpense,
  createOrLinkExpenseTransaction, getUnbilledExpenses, listExpenses,
  markExpensesInvoiced,
} from '@/lib/agency/domain/agency.expenses';
import {
  canTransitionExpenseStatus, editPolicyForExpense, isExpenseInvoiceEligible,
  calculateExpenseMarkup, isConsistentBillability, redactExpenseCost,
  type Expense,
} from '@/lib/agency/types/expense';
import {
  validateExpenseCreate, validateExpenseUpdate,
} from '@/lib/agency/validators/expense';
import { makeMoney } from '@/lib/agency/types/money';
import { todayInTimezone } from '@/lib/agency/types/dates';
import type { Project } from '@/lib/agency/types/project';

const TENANT = 'tenant-a';
const TODAY = todayInTimezone();
const audit = { username: 'tester', tenantId: TENANT, log: vi.fn() };
const ACTOR_USER = { userId: 'user-1', role: 'USER' as const };
const ACTOR_ADMIN = { userId: 'admin-1', role: 'TENANT_ADMIN' as const };
const ACTOR_PM = { userId: 'pm-1', role: 'USER' as const };

const PROJECT: Project = {
  id: 'proj-1', tenantId: TENANT, clientId: 'client-1', name: 'Acme Web',
  status: 'ACTIVE', billingModel: 'TIME_AND_MATERIALS', currency: 'INR',
  projectManagerId: 'pm-1', createdAt: new Date('2026-01-01'),
};

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'exp-1', tenantId: TENANT, projectId: 'proj-1', clientId: 'client-1',
    vendorName: 'StockAI', description: 'API credits for the sprint',
    amount: makeMoney(10000, 'INR'),
    expenseType: 'BILLABLE', billable: true, markupPercent: 20,
    clientChargeAmount: makeMoney(12000, 'INR'),
    expenseDate: TODAY, status: 'DRAFT', billingStatus: 'UNBILLED',
    createdBy: 'user-1',
    createdAt: new Date('2026-01-06'), updatedAt: new Date('2026-01-06'),
    ...overrides,
  };
}

/** The repo create mock echoes its input with identity + lifecycle defaults. */
function echoCreate(tenantId: string, input: Record<string, unknown>): Expense {
  return {
    id: 'exp-new', tenantId, ...input,
    status: 'DRAFT', billingStatus: 'UNBILLED',
    createdAt: new Date(), updatedAt: new Date(),
  } as unknown as Expense;
}

beforeEach(() => {
  vi.clearAllMocks();
  (getProjectById as Mock).mockResolvedValue(PROJECT);
  (getClientById as Mock).mockResolvedValue({ id: 'client-1', tenantId: TENANT });
  (createExpenseRepo as Mock).mockImplementation(echoCreate);
  (updateExpenseRepo as Mock).mockResolvedValue(true);
  (createTransaction as Mock).mockImplementation((_tx: unknown) =>
    ({ id: 'tx-new', createdAt: new Date() }));
});

// ---------- §43/§44 markup ----------

describe('calculateExpenseMarkup (§43/§44)', () => {
  it('10000 at 20% → 12000 — cost + cost×markup%, one final rounding', () => {
    const charge = calculateExpenseMarkup(makeMoney(10000, 'INR'), 20);
    expect(charge.amount).toBe(12000);
    expect(charge.currency).toBe('INR');
  });

  it('rounds half-up once at the boundary', () => {
    // 3333.33 × 1.1 = 3666.663 → 3666.66
    expect(calculateExpenseMarkup(makeMoney(3333.33, 'INR'), 10).amount).toBe(3666.66);
    // 0% markup is identity.
    expect(calculateExpenseMarkup(makeMoney(100, 'INR'), 0).amount).toBe(100);
  });

  it('PASS_THROUGH at 0% recharges at cost', () => {
    expect(calculateExpenseMarkup(makeMoney(4500, 'INR'), 0).amount).toBe(4500);
  });
});

// ---------- §39 billability ----------

describe('billability (§39)', () => {
  it('INTERNAL is never billable; the other types carry the flag', () => {
    expect(isConsistentBillability('INTERNAL', true)).toBe(false);
    expect(isConsistentBillability('INTERNAL', false)).toBe(true);
    expect(isConsistentBillability('BILLABLE', true)).toBe(true);
    expect(isConsistentBillability('BILLABLE', false)).toBe(true);
    expect(isConsistentBillability('PASS_THROUGH', true)).toBe(true);
  });

  it('create rejects INTERNAL + billable, and markup on a non-billable expense', () => {
    const r1 = validateExpenseCreate({
      vendorName: 'V', description: 'D', amount: 100, expenseType: 'INTERNAL',
      billable: true, expenseDate: TODAY,
    }, TODAY);
    expect(r1.ok).toBe(false);
    expect(r1.ok === false && r1.errors.some(e => e.field === 'billable')).toBe(true);

    const r2 = validateExpenseCreate({
      vendorName: 'V', description: 'D', amount: 100, expenseType: 'BILLABLE',
      billable: false, markupPercent: 10, expenseDate: TODAY,
    }, TODAY);
    expect(r2.ok).toBe(false);
    expect(r2.ok === false && r2.errors.some(e => e.field === 'markupPercent')).toBe(true);
  });

  it('billable is never inferred — it is required (§39)', () => {
    const r = validateExpenseCreate({
      vendorName: 'V', description: 'D', amount: 100, expenseType: 'BILLABLE',
      expenseDate: TODAY,
    }, TODAY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some(e => e.field === 'billable')).toBe(true);
  });
});

// ---------- §40 lifecycle ----------

describe('approval state machine (§40/§50)', () => {
  it('DRAFT → SUBMITTED → APPROVED | REJECTED; APPROVED → REJECTED | REIMBURSED; REJECTED → DRAFT', () => {
    expect(canTransitionExpenseStatus('DRAFT', 'SUBMITTED')).toBe(true);
    expect(canTransitionExpenseStatus('SUBMITTED', 'APPROVED')).toBe(true);
    expect(canTransitionExpenseStatus('SUBMITTED', 'REJECTED')).toBe(true);
    expect(canTransitionExpenseStatus('APPROVED', 'REJECTED')).toBe(true);
    expect(canTransitionExpenseStatus('APPROVED', 'REIMBURSED')).toBe(true);
    expect(canTransitionExpenseStatus('REJECTED', 'DRAFT')).toBe(true);
    // The impossible jumps.
    expect(canTransitionExpenseStatus('DRAFT', 'APPROVED')).toBe(false);
    expect(canTransitionExpenseStatus('REJECTED', 'SUBMITTED')).toBe(false);
    expect(canTransitionExpenseStatus('REIMBURSED', 'DRAFT')).toBe(false);
  });

  it('edit policy: DRAFT/REJECTED FULL, SUBMITTED LOCKED, APPROVED NOTES_ONLY, INVOICED always LOCKED', () => {
    expect(editPolicyForExpense(expense({ status: 'DRAFT' }))).toBe('FULL');
    expect(editPolicyForExpense(expense({ status: 'REJECTED' }))).toBe('FULL');
    expect(editPolicyForExpense(expense({ status: 'SUBMITTED' }))).toBe('LOCKED');
    expect(editPolicyForExpense(expense({ status: 'APPROVED' }))).toBe('NOTES_ONLY');
    expect(editPolicyForExpense(expense({ status: 'REIMBURSED' }))).toBe('LOCKED');
    expect(editPolicyForExpense(expense({ status: 'DRAFT', billingStatus: 'INVOICED' }))).toBe('LOCKED');
  });
});

// ---------- §48/§49 billing classification ----------

describe('invoice eligibility (§48/§49)', () => {
  it('eligible = APPROVED + billable + UNBILLED — nothing else', () => {
    expect(isExpenseInvoiceEligible(expense({ status: 'APPROVED' }))).toBe(true);
    expect(isExpenseInvoiceEligible(expense({ status: 'SUBMITTED' }))).toBe(false);
    expect(isExpenseInvoiceEligible(expense({ status: 'APPROVED', billable: false }))).toBe(false);
    expect(isExpenseInvoiceEligible(expense({ status: 'APPROVED', billingStatus: 'INVOICED' }))).toBe(false);
    expect(isExpenseInvoiceEligible(expense({ status: 'REIMBURSED' }))).toBe(false);
  });

  it('getUnbilledExpenses queries the exact §48 set', async () => {
    (getExpenses as Mock).mockResolvedValue([]);
    await getUnbilledExpenses(TENANT);
    expect(getExpenses).toHaveBeenCalledWith(TENANT, {
      billable: true, status: 'APPROVED', billingStatus: 'UNBILLED',
    });
  });
});

// ---------- §99 cost privacy ----------

describe('redactExpenseCost (§99 pattern)', () => {
  it('strips amount and markup; keeps the client-facing charge', () => {
    const red = redactExpenseCost(expense());
    expect('amount' in red).toBe(false);
    expect('markupPercent' in red).toBe(false);
    expect(red.clientChargeAmount?.amount).toBe(12000);
    expect(red.vendorName).toBe('StockAI');
  });
});

// ---------- §47/§113 integrity ----------

describe('createExpense integrity (§47/§113)', () => {
  it('derives the client from the project and freezes the client charge', async () => {
    const r = await createExpense(TENANT, ACTOR_USER, {
      projectId: 'proj-1', vendorName: 'StockAI', description: 'API credits',
      amount: 10000, expenseType: 'BILLABLE', billable: true, markupPercent: 20,
      expenseDate: TODAY,
    }, audit);
    expect(r.ok).toBe(true);
    if (r.ok && r.data) {
      expect(r.data.clientId).toBe('client-1');
      expect(r.data.clientChargeAmount?.amount).toBe(12000);
      expect(r.data.status).toBe('DRAFT');
      expect(r.data.createdBy).toBe('user-1');
    }
    expect(audit.log).toHaveBeenCalledWith('EXPENSE_CREATED', expect.stringContaining('exp-new'));
  });

  it('standalone expense with a tenant client is valid (§47)', async () => {
    const r = await createExpense(TENANT, ACTOR_USER, {
      clientId: 'client-1', vendorName: 'Figma', description: 'Seats',
      amount: 3000, expenseType: 'INTERNAL', billable: false,
      expenseDate: TODAY,
    }, audit);
    expect(r.ok).toBe(true);
    if (r.ok && r.data) expect(r.data.clientChargeAmount).toBeUndefined();
  });

  it('a cross-tenant project is an IDENTICAL 404 (§113)', async () => {
    (getProjectById as Mock).mockResolvedValue(null); // another tenant's id
    const r = await createExpense(TENANT, ACTOR_USER, {
      projectId: 'proj-other', vendorName: 'V', description: 'D',
      amount: 100, expenseType: 'INTERNAL', billable: false, expenseDate: TODAY,
    }, audit);
    expect(r).toMatchObject({ ok: false, status: 404 });
  });

  it('rejects a future expense date and non-positive amounts at the validator', () => {
    const r = validateExpenseCreate({
      vendorName: 'V', description: 'D', amount: 100, expenseType: 'INTERNAL',
      billable: false, expenseDate: '2999-01-01',
    }, TODAY);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.errors.some(e => e.field === 'expenseDate')).toBe(true);

    const r2 = validateExpenseCreate({
      vendorName: 'V', description: 'D', amount: 0, expenseType: 'INTERNAL',
      billable: false, expenseDate: TODAY,
    }, TODAY);
    expect(r2.ok).toBe(false);
  });
});

// ---------- §41/§42 the Transaction bridge ----------

describe('createOrLinkExpenseTransaction (§41/§42)', () => {
  it('creates ONE Debit transaction at cost, dated the expense date, by the creator', async () => {
    const r = await createOrLinkExpenseTransaction(expense({ status: 'SUBMITTED' }), TENANT);
    expect(r.transactionId).toBe('tx-new');
    expect(createTransaction).toHaveBeenCalledTimes(1);
    expect(createTransaction).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: TENANT,
      userId: 'user-1',
      clientId: 'client-1',
      projectId: 'proj-1',
      type: 'Debit',
      amount: 10000,
      date: TODAY,
    }));
  });

  it('is idempotent — an expense that already carries transactionId NEVER gets a second one', async () => {
    const r = await createOrLinkExpenseTransaction(expense({ transactionId: 'tx-existing' }), TENANT);
    expect(r.transactionId).toBe('tx-existing');
    expect(createTransaction).not.toHaveBeenCalled();
  });
});

// ---------- approval authority (§40/§21 mirror) ----------

describe('approveExpense (§40/§21/§41)', () => {
  it('tenant admin can approve their own expense without restriction', async () => {
    (getExpenseById as Mock).mockResolvedValue(expense({ status: 'SUBMITTED', createdBy: 'admin-1' }));
    (updateExpenseRepo as Mock).mockResolvedValue(true);
    const r = await approveExpense('exp-1', TENANT, ACTOR_ADMIN, audit);
    expect(r.ok).toBe(true);
  });

  it('a non-admin user cannot approve their own expense even if PM', async () => {
    (getExpenseById as Mock).mockResolvedValue(expense({ status: 'SUBMITTED', createdBy: 'pm-1' }));
    const r = await approveExpense('exp-1', TENANT, ACTOR_PM, audit);
    expect(r).toMatchObject({ ok: false, status: 403 });
  });

  it('the project manager may approve; the transaction is linked once', async () => {
    (getExpenseById as Mock).mockResolvedValue(expense({ status: 'SUBMITTED', createdBy: 'user-1' }));
    (updateExpenseRepo as Mock).mockImplementation(async (_id: string, _t: string, u: Record<string, unknown>) => {
      // echo the write back through the re-fetch
      (getExpenseById as Mock).mockResolvedValue(expense({ status: 'APPROVED', ...u } as Partial<Expense>));
      return true;
    });
    const r = await approveExpense('exp-1', TENANT, ACTOR_PM, audit);
    expect(r.ok).toBe(true);
    expect(createTransaction).toHaveBeenCalledTimes(1);
    expect(updateExpenseRepo).toHaveBeenCalledWith('exp-1', TENANT, expect.objectContaining({
      status: 'APPROVED',
      transactionId: 'tx-new',
    }));
  });

  it('re-approval after a partial failure links the SAME transaction — no duplicate (§42)', async () => {
    // A transaction was created but the status write failed (retry), or a
    // correction-rejection was reworked and resubmitted: either way the
    // expense still carries its transactionId into a fresh approval.
    (getExpenseById as Mock).mockResolvedValue(expense({ status: 'SUBMITTED', transactionId: 'tx-existing' }));
    const r = await approveExpense('exp-1', TENANT, ACTOR_ADMIN, audit);
    expect(r.ok).toBe(true);
    expect(createTransaction).not.toHaveBeenCalled();
    expect(updateExpenseRepo).toHaveBeenCalledWith('exp-1', TENANT, expect.objectContaining({
      status: 'APPROVED',
      transactionId: 'tx-existing',
      clientChargeAmount: expect.objectContaining({ amount: 12000 }),
    }));
  });

  it('a non-submitted expense cannot be approved (409)', async () => {
    (getExpenseById as Mock).mockResolvedValue(expense({ status: 'DRAFT' }));
    const r = await approveExpense('exp-1', TENANT, ACTOR_ADMIN, audit);
    expect(r).toMatchObject({ ok: false, status: 409 });
  });

  it('a plain USER who is not the PM cannot approve (403)', async () => {
    (getExpenseById as Mock).mockResolvedValue(expense({ status: 'SUBMITTED' }));
    const r = await approveExpense('exp-1', TENANT, ACTOR_USER, audit);
    expect(r).toMatchObject({ ok: false, status: 403 });
  });
});

describe('rejectExpense (§40/§21)', () => {
  it('requires a reason and non-admins cannot reject own expenses', async () => {
    (getExpenseById as Mock).mockResolvedValue(expense({ status: 'SUBMITTED', createdBy: 'pm-1' }));
    const r = await rejectExpense('exp-1', TENANT, 'dup', ACTOR_PM, audit);
    expect(r).toMatchObject({ ok: false, status: 403 });

    (getExpenseById as Mock).mockResolvedValue(expense({ status: 'SUBMITTED' }));
    const r2 = await rejectExpense('exp-1', TENANT, '', ACTOR_ADMIN, audit);
    expect(r2).toMatchObject({ ok: false, status: 400 });
  });

  it('rejecting an APPROVED expense is a correction: transaction kept, billing withdrawn (§20 pattern)', async () => {
    (getExpenseById as Mock).mockResolvedValue(expense({ status: 'APPROVED', transactionId: 'tx-existing' }));
    const r = await rejectExpense('exp-1', TENANT, 'not needed', ACTOR_ADMIN, audit);
    expect(r.ok).toBe(true);
    expect(createTransaction).not.toHaveBeenCalled();
    expect(updateExpenseRepo).toHaveBeenCalledWith('exp-1', TENANT, expect.objectContaining({
      status: 'REJECTED',
      rejectionReason: 'not needed',
      clientChargeAmount: null,
      billingStatus: 'UNBILLED',
    }));
  });
});

// ---------- updates (§22 pattern) ----------

describe('updateExpense (§22/§28 patterns)', () => {
  it('a SUBMITTED expense is locked (409) — reject first', async () => {
    (getExpenseById as Mock).mockResolvedValue(expense({ status: 'SUBMITTED' }));
    const r = await updateExpense('exp-1', TENANT, ACTOR_USER, { notes: 'x' }, audit);
    expect(r).toMatchObject({ ok: false, status: 409 });
  });

  it('an APPROVED expense accepts only notes and receiptReference (400 otherwise)', async () => {
    (getExpenseById as Mock).mockResolvedValue(expense({ status: 'APPROVED', transactionId: 'tx-1' }));
    const bad = await updateExpense('exp-1', TENANT, ACTOR_ADMIN, { amount: 999 }, audit);
    expect(bad).toMatchObject({ ok: false, status: 400 });

    const ok = await updateExpense('exp-1', TENANT, ACTOR_ADMIN, { receiptReference: 'rcpt-9' }, audit);
    expect(ok.ok).toBe(true);
  });

  it('an INVOICED expense is fully locked', async () => {
    (getExpenseById as Mock).mockResolvedValue(expense({ status: 'APPROVED', billingStatus: 'INVOICED' }));
    const r = await updateExpense('exp-1', TENANT, ACTOR_ADMIN, { notes: 'x' }, audit);
    expect(r).toMatchObject({ ok: false, status: 409 });
  });

  it('editing a REJECTED expense returns it to DRAFT and recomputes the charge (§20/§43)', async () => {
    (getExpenseById as Mock).mockResolvedValue(expense({ status: 'REJECTED', clientChargeAmount: undefined }));
    const r = await updateExpense('exp-1', TENANT, ACTOR_USER, { amount: 5000 }, audit);
    expect(r.ok).toBe(true);
    expect(updateExpenseRepo).toHaveBeenCalledWith('exp-1', TENANT, expect.objectContaining({
      amount: expect.objectContaining({ amount: 5000 }),
      clientChargeAmount: expect.objectContaining({ amount: 6000 }), // 5000 × 1.2
      status: 'DRAFT',
    }));
  });

  it('making an expense non-billable clears the stored charge (null, never a stale 12000)', async () => {
    (getExpenseById as Mock).mockResolvedValue(expense({ status: 'DRAFT' }));
    const r = await updateExpense('exp-1', TENANT, ACTOR_USER, { billable: false, markupPercent: null }, audit);
    expect(r.ok).toBe(true);
    expect(updateExpenseRepo).toHaveBeenCalledWith('exp-1', TENANT, expect.objectContaining({
      billable: false,
      markupPercent: null,
      clientChargeAmount: null,
    }));
  });

  it('a USER cannot edit someone else\'s expense (403)', async () => {
    (getExpenseById as Mock).mockResolvedValue(expense({ status: 'DRAFT', createdBy: 'user-2' }));
    const r = await updateExpense('exp-1', TENANT, ACTOR_USER, { notes: 'x' }, audit);
    expect(r).toMatchObject({ ok: false, status: 403 });
  });
});

describe('submitExpense (§40)', () => {
  it('submits a DRAFT owned by the actor; 409 from SUBMITTED', async () => {
    (getExpenseById as Mock).mockResolvedValue(expense({ status: 'DRAFT' }));
    const r = await submitExpense('exp-1', TENANT, ACTOR_USER, audit);
    expect(r.ok).toBe(true);
    expect(updateExpenseRepo).toHaveBeenCalledWith('exp-1', TENANT, { status: 'SUBMITTED' });

    (getExpenseById as Mock).mockResolvedValue(expense({ status: 'SUBMITTED' }));
    const r2 = await submitExpense('exp-1', TENANT, ACTOR_USER, audit);
    expect(r2).toMatchObject({ ok: false, status: 409 });
  });
});

// ---------- §53 views + §33 scoping ----------

describe('listExpenses scoping (§33 pattern)', () => {
  it('a USER is forced to their own expenses; admins see all', async () => {
    (getExpenses as Mock).mockResolvedValue([]);
    await listExpenses(TENANT, ACTOR_USER, { projectId: 'proj-1' });
    expect(getExpenses).toHaveBeenCalledWith(TENANT, { projectId: 'proj-1', createdBy: 'user-1' });

    (getExpenses as Mock).mockClear();
    await listExpenses(TENANT, ACTOR_ADMIN, { projectId: 'proj-1' });
    expect(getExpenses).toHaveBeenCalledWith(TENANT, { projectId: 'proj-1' });
  });
});

// ---------- §48/§120 invoice source references (Module 8D) ----------

describe('markExpensesInvoiced (§48/§120/§133)', () => {
  it('stamps the whole eligible batch: billingStatus INVOICED + invoiceId lineage, one audit per expense', async () => {
    (getExpenseById as Mock)
      .mockResolvedValueOnce(expense({ id: 'exp-1', status: 'APPROVED' }))
      .mockResolvedValueOnce(expense({ id: 'exp-2', status: 'APPROVED', vendorName: 'Figma' }));
    const r = await markExpensesInvoiced(TENANT, ['exp-1', 'exp-2'], 'inv-100', audit);
    expect(r.ok).toBe(true);
    if (r.ok && r.data) expect(r.data.updated).toBe(2);
    expect(updateExpenseRepo).toHaveBeenCalledTimes(2);
    expect(updateExpenseRepo).toHaveBeenCalledWith('exp-1', TENANT, { billingStatus: 'INVOICED', invoiceId: 'inv-100' });
    expect(updateExpenseRepo).toHaveBeenCalledWith('exp-2', TENANT, { billingStatus: 'INVOICED', invoiceId: 'inv-100' });
    expect(audit.log).toHaveBeenCalledTimes(2);
    expect(audit.log).toHaveBeenCalledWith('EXPENSE_INVOICED', expect.stringContaining('invoice inv-100'));
  });

  it('all-or-nothing (§133): one ineligible expense rejects the batch BEFORE any write', async () => {
    (getExpenseById as Mock)
      .mockResolvedValueOnce(expense({ id: 'exp-1', status: 'APPROVED' }))
      .mockResolvedValueOnce(expense({ id: 'exp-2', status: 'SUBMITTED' }));  // not approved
    const r = await markExpensesInvoiced(TENANT, ['exp-1', 'exp-2'], 'inv-100', audit);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(409);
      expect(r.error).toContain('exp-2');
    }
    expect(updateExpenseRepo).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('an already-invoiced expense is a 409 naming its invoice — never silently re-stamped', async () => {
    (getExpenseById as Mock).mockResolvedValueOnce(
      expense({ id: 'exp-1', status: 'APPROVED', billingStatus: 'INVOICED', invoiceId: 'inv-099' })
    );
    const r = await markExpensesInvoiced(TENANT, ['exp-1'], 'inv-100', audit);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(409);
      expect(r.error).toContain('inv-099');
    }
    expect(updateExpenseRepo).not.toHaveBeenCalled();
  });

  it('internal / non-billable / draft expenses are never invoice-eligible (§48)', async () => {
    for (const overrides of [
      { expenseType: 'INTERNAL' as const, billable: false, clientChargeAmount: undefined },
      { billable: false, clientChargeAmount: undefined },
      { status: 'DRAFT' as const },
    ]) {
      (getExpenseById as Mock).mockReset().mockResolvedValue(expense({ id: 'exp-x', ...overrides }));
      const r = await markExpensesInvoiced(TENANT, ['exp-x'], 'inv-100', audit);
      expect(r.ok, JSON.stringify(overrides)).toBe(false);
      if (!r.ok) expect(r.status).toBe(409);
    }
    expect(updateExpenseRepo).not.toHaveBeenCalled();
  });

  it('§113 — a cross-tenant expense id is an identical 404, nothing written', async () => {
    (getExpenseById as Mock).mockResolvedValueOnce(null);
    const r = await markExpensesInvoiced(TENANT, ['exp-other-tenant'], 'inv-100', audit);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(404);
    expect(updateExpenseRepo).not.toHaveBeenCalled();
  });

  it('validates the inputs: empty batch and missing invoiceId are 400s', async () => {
    expect((await markExpensesInvoiced(TENANT, [], 'inv-100', audit)).status).toBe(400);
    expect((await markExpensesInvoiced(TENANT, ['exp-1'], '', audit)).status).toBe(400);
    expect((await markExpensesInvoiced(TENANT, 'exp-1', 'inv-100', audit)).status).toBe(400);
  });
});

// ---------- PATCH validator partiality (Module 4/5 lessons) ----------

describe('validateExpenseUpdate partiality', () => {
  it('PATCH is partial — absent keys stay absent, no required-field demands', () => {
    const r = validateExpenseUpdate({ notes: 'updated' }, TODAY);
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.keys(r.value)).toEqual(['notes']);
  });

  it("'' and null clear the clearable optionals", () => {
    const r = validateExpenseUpdate({ receiptReference: '', markupPercent: null, notes: null }, TODAY);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.receiptReference).toBe('');
      expect(r.value.markupPercent).toBeNull();
      expect(r.value.notes).toBeNull();
    }
  });
});
