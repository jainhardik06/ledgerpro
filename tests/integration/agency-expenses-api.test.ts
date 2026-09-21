/**
 * Module 8 (Sprint 8B / §51/§54) — Integration: Agency Expenses API.
 *
 * Runs the REAL route handlers with only the session/tenant/repository edges
 * mocked — the full pipeline executes between them:
 *   authenticate → resolve tenant → verify Agency capability → authorize
 *   (§39: expenses.write is a base capability of every agency member; §40
 *   approve tier) → validate → operate → audit → respond.
 *
 * Matrix:
 *   Integration — create (§37/§39/§43: client charge freezes at 12000),
 *                 list + labels + view=unbilled (§48/§53), detail, the §22
 *                 edit lifecycle, submit/approve/reject state machine
 *                 (§40), §41/§42 the Transaction bridge at approval
 *   Security    — §33 owner-or-admin scoping, §99 cost redaction for USER
 *                 consumers, §113 cross-tenant probes (404 identical to
 *                 missing), §21 self-approval/self-rejection blocks,
 *                 non-PM USER cannot approve, Standard tenant 403
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TokenPayload } from '@/lib/auth';
import type { Tenant, User, Client, Transaction, ExpenseCreateInput } from '@/lib/db';
import type { Project } from '@/lib/agency/types/project';
import type { Expense } from '@/lib/agency/types/expense';
import { AGENCY_A, AGENCY_B, STANDARD_TENANT } from '../fixtures/agency-fixtures';

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, getSessionUser: vi.fn() };
});

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...actual,
    getTenantById: vi.fn(),
    getUserById: vi.fn(),
    getProjectById: vi.fn(),
    getClientById: vi.fn(),
    getExpenses: vi.fn(),
    getExpenseById: vi.fn(),
    createExpense: vi.fn(),
    updateExpense: vi.fn(),
    createTransaction: vi.fn(),
    createLog: vi.fn(),
    // imported by agency.clients (AuditContext/DomainResult home) — same module
    getLogs: vi.fn(), createClient: vi.fn(), getClients: vi.fn(),
    updateClient: vi.fn(), searchClients: vi.fn(), findClientByName: vi.fn(),
  };
});

import { getSessionUser } from '@/lib/auth';
import {
  getTenantById, getUserById, getProjectById, getClientById,
  getExpenses, getExpenseById,
  createExpense as createExpenseRepo, updateExpense as updateExpenseRepo,
  createTransaction, createLog,
} from '@/lib/db';
import { GET as listExpensesRoute, POST as createExpenseRoute } from '@/app/api/agency/expenses/route';
import { GET as getExpenseRoute, PATCH as patchExpenseRoute } from '@/app/api/agency/expenses/[id]/route';
import { POST as submitExpenseRoute } from '@/app/api/agency/expenses/[id]/submit/route';
import { POST as approveExpenseRoute } from '@/app/api/agency/expenses/[id]/approve/route';
import { POST as rejectExpenseRoute } from '@/app/api/agency/expenses/[id]/reject/route';
import { GET as approvalQueueRoute } from '@/app/api/agency/expenses/approvals/route';
import { NextRequest } from 'next/server';

const mockSession = vi.mocked(getSessionUser);
const mockGetTenant = vi.mocked(getTenantById);
const mockGetUserById = vi.mocked(getUserById);
const mockGetProjectById = vi.mocked(getProjectById);
const mockGetClientById = vi.mocked(getClientById);
const mockGetExpenses = vi.mocked(getExpenses);
const mockGetExpenseById = vi.mocked(getExpenseById);
const mockCreateExpenseRepo = vi.mocked(createExpenseRepo);
const mockUpdateExpenseRepo = vi.mocked(updateExpenseRepo);
const mockCreateTransaction = vi.mocked(createTransaction);
const mockCreateLog = vi.mocked(createLog);

// ---------- helpers ----------

function requestFor(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3100'), init as ConstructorParameters<typeof NextRequest>[1]);
}

function jsonRequest(url: string, method: string, body: unknown): NextRequest {
  return requestFor(url, { method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
}

function ctxFor(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

const T: string = AGENCY_A.tenant.id;
const ADMIN = AGENCY_A.admin;     // TENANT_ADMIN
const MEMBER = AGENCY_A.member;   // USER — the project's MANAGER (§21 approver tier)

function userFor(userId: string, tenantId = T): User {
  return {
    id: userId, username: userId === ADMIN.userId ? 'a_admin' : 'a_dev',
    passwordHash: 'x', role: userId === ADMIN.userId ? 'TENANT_ADMIN' : 'USER',
    tenantId, createdAt: new Date('2026-01-01T00:00:00Z'),
  } as unknown as User;
}

/** The project — its manager is MEMBER, so MEMBER can approve ADMIN's expenses. */
function projectFor(overrides: Partial<Project> = {}): Project {
  return {
    id: AGENCY_A.project.id, tenantId: T, clientId: AGENCY_A.client.id,
    name: 'Project A', status: 'ACTIVE', billingModel: 'TIME_AND_MATERIALS',
    currency: 'INR', projectManagerId: MEMBER.userId,
    createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as unknown as Project;
}

function expenseFor(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'exp-1', tenantId: T, projectId: AGENCY_A.project.id, clientId: AGENCY_A.client.id,
    vendorName: 'StockAI', description: 'API credits for the sprint',
    amount: { amount: 10000, currency: 'INR' },
    expenseType: 'BILLABLE', billable: true, markupPercent: 20,
    clientChargeAmount: { amount: 12000, currency: 'INR' },
    expenseDate: '2026-09-01', status: 'DRAFT', billingStatus: 'UNBILLED',
    createdBy: ADMIN.userId,
    createdAt: new Date('2026-09-01T10:00:00Z'), updatedAt: new Date('2026-09-01T10:00:00Z'),
    ...overrides,
  };
}

/** Stand up the session + tenant chain for one tenant. */
function arrange(
  tenantId: string,
  appMode: Tenant['appMode'] = 'Agency',
  role: TokenPayload['role'] = 'TENANT_ADMIN',
  userId?: string
) {
  const session: TokenPayload = {
    userId: userId ?? ADMIN.userId, username: role === 'USER' ? 'a_dev' : 'a_admin', role, tenantId,
  };
  const tenant: Tenant = {
    id: tenantId, name: `Tenant ${tenantId}`, status: 'ACTIVE', plan: 'FREE',
    settings: {}, limits: { maxUsers: 5 }, appMode,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
  mockSession.mockResolvedValue(session);
  mockGetTenant.mockResolvedValue(tenant);
  mockGetUserById.mockImplementation(async (id: string) =>
    id === ADMIN.userId || id === MEMBER.userId ? userFor(id, tenantId) : null);
  return session;
}

/** Realistic in-memory expense store: reads see writes, updates apply. */
let expenseStore: Record<string, Expense>;
function seedExpense(expense: Expense): Expense {
  expenseStore[expense.id] = expense;
  return expense;
}

beforeEach(() => {
  for (const m of [
    mockSession, mockGetTenant, mockGetUserById, mockGetProjectById, mockGetClientById,
    mockGetExpenses, mockGetExpenseById, mockCreateExpenseRepo, mockUpdateExpenseRepo,
    mockCreateTransaction, mockCreateLog,
  ]) m.mockReset();

  expenseStore = {};
  mockCreateLog.mockResolvedValue({} as Awaited<ReturnType<typeof createLog>>);
  mockGetProjectById.mockImplementation(async (id: string) =>
    id === AGENCY_A.project.id ? projectFor() : null);
  mockGetClientById.mockImplementation(async (id: string) =>
    id === AGENCY_A.client.id ? ({ id, tenantId: T, name: 'Client A' } as unknown as Client) : null);
  mockGetUserById.mockImplementation(async (id: string) =>
    id === ADMIN.userId || id === MEMBER.userId ? userFor(id) : null);
  mockGetExpenses.mockResolvedValue([]);
  mockGetExpenseById.mockImplementation(async (id: string) => expenseStore[id] ?? null);
  mockUpdateExpenseRepo.mockImplementation(async (id: string, _tenantId: string, updates: Record<string, unknown>) => {
    const e = expenseStore[id];
    if (!e) return false;
    for (const [k, v] of Object.entries(updates)) {
      if (v !== undefined) (e as unknown as Record<string, unknown>)[k] = v === null ? undefined : v;
    }
    return true;
  });
  mockCreateExpenseRepo.mockImplementation(async (tenantId: string, input: ExpenseCreateInput) =>
    expenseFor({
      id: `exp-${Object.keys(expenseStore).length + 1}`, tenantId,
      clientChargeAmount: undefined,
      ...input,
    } as Partial<Expense>));
  mockCreateTransaction.mockImplementation(async (tx: Record<string, unknown>) =>
    ({ id: `tx-${(tx.amount as number)}`, createdAt: new Date() } as unknown as Transaction));
});

// ---------- create (§37/§39/§41/§43/§47) ----------

describe('Module 8B — create expense (POST /api/agency/expenses)', () => {
  it('creates a DRAFT expense with the frozen client charge (§43: 10000 at 20% → 12000) and NO transaction (§41)', async () => {
    arrange(T);
    const res = await createExpenseRoute(jsonRequest('/api/agency/expenses', 'POST', {
      projectId: AGENCY_A.project.id, vendorName: 'StockAI', description: 'API credits',
      amount: 10000, expenseType: 'BILLABLE', billable: true, markupPercent: 20,
      expenseDate: '2026-09-01', receiptReference: 'drive/abc123',
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.expense.status).toBe('DRAFT');
    expect(body.expense.billingStatus).toBe('UNBILLED');
    expect(body.expense.clientChargeAmount).toEqual({ amount: 12000, currency: 'INR' });
    expect(body.expense.clientId).toBe(AGENCY_A.client.id); // derived from the project (§47)
    // §41 — drafts NEVER touch the core ledger.
    expect(mockCreateTransaction).not.toHaveBeenCalled();
    expect(mockCreateLog).toHaveBeenCalledWith(
      expect.anything(), 'EXPENSE_CREATED', expect.anything(), T, expect.anything()
    );
  });

  it('a standalone expense (clientId, no project) is valid (§47)', async () => {
    arrange(T);
    const res = await createExpenseRoute(jsonRequest('/api/agency/expenses', 'POST', {
      clientId: AGENCY_A.client.id, vendorName: 'Figma', description: 'Seats',
      amount: 3000, expenseType: 'INTERNAL', billable: false, expenseDate: '2026-09-01',
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.expense.clientChargeAmount).toBeUndefined();
  });

  it('§39 — INTERNAL + billable is a 400; billable is never inferred', async () => {
    arrange(T);
    const res = await createExpenseRoute(jsonRequest('/api/agency/expenses', 'POST', {
      vendorName: 'V', description: 'D', amount: 100, expenseType: 'INTERNAL',
      billable: true, expenseDate: '2026-09-01',
    }));
    expect(res.status).toBe(400);

    const res2 = await createExpenseRoute(jsonRequest('/api/agency/expenses', 'POST', {
      vendorName: 'V', description: 'D', amount: 100, expenseType: 'BILLABLE',
      expenseDate: '2026-09-01',
    }));
    expect(res2.status).toBe(400);
  });

  it('§113 — another tenant\'s project is an IDENTICAL 404', async () => {
    arrange(T);
    const res = await createExpenseRoute(jsonRequest('/api/agency/expenses', 'POST', {
      projectId: AGENCY_B.project.id, vendorName: 'V', description: 'D',
      amount: 100, expenseType: 'INTERNAL', billable: false, expenseDate: '2026-09-01',
    }));
    expect(res.status).toBe(404);
  });

  it('Standard tenants cannot reach the agency API (vertical gate)', async () => {
    arrange(STANDARD_TENANT.tenant.id, 'Standard');
    const res = await createExpenseRoute(jsonRequest('/api/agency/expenses', 'POST', {
      vendorName: 'V', description: 'D', amount: 100, expenseType: 'INTERNAL',
      billable: false, expenseDate: '2026-09-01',
    }));
    expect(res.status).toBe(403);
  });
});

// ---------- list (§33/§48/§53/§99) ----------

describe('Module 8B — list expenses (GET /api/agency/expenses)', () => {
  it('a USER is scoped to their own expenses and receives redacted costs (§33/§99)', async () => {
    arrange(T, 'Agency', 'USER', MEMBER.userId);
    mockGetExpenses.mockResolvedValue([expenseFor({ createdBy: MEMBER.userId })]);
    const res = await listExpensesRoute(requestFor('/api/agency/expenses'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(mockGetExpenses).toHaveBeenCalledWith(T, expect.objectContaining({ createdBy: MEMBER.userId }));
    expect(body.expenses).toHaveLength(1);
    // §99 — amount and markupPercent stripped; clientCharge stays.
    expect(body.expenses[0].amount).toBeUndefined();
    expect(body.expenses[0].markupPercent).toBeUndefined();
    expect(body.expenses[0].clientChargeAmount.amount).toBe(12000);
    expect(body.userLabels).toBeDefined();
    expect(body.projectNames).toBeDefined();
    expect(body.clientNames).toBeDefined();
  });

  it('an admin sees everyone with full economics', async () => {
    arrange(T);
    mockGetExpenses.mockResolvedValue([expenseFor()]);
    const res = await listExpensesRoute(requestFor('/api/agency/expenses'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(mockGetExpenses).toHaveBeenCalledWith(T, expect.objectContaining({}));
    expect(body.expenses[0].amount).toEqual({ amount: 10000, currency: 'INR' });
    expect(body.expenses[0].markupPercent).toBe(20);
  });

  it('view=unbilled returns the §48 set for admins and 403 for USERs', async () => {
    arrange(T);
    mockGetExpenses.mockResolvedValue([]);
    const res = await listExpensesRoute(requestFor('/api/agency/expenses?view=unbilled'));
    expect(res.status).toBe(200);
    expect(mockGetExpenses).toHaveBeenCalledWith(T, {
      billable: true, status: 'APPROVED', billingStatus: 'UNBILLED',
    });

    arrange(T, 'Agency', 'USER', MEMBER.userId);
    const res2 = await listExpensesRoute(requestFor('/api/agency/expenses?view=unbilled'));
    expect(res2.status).toBe(403);
  });

  it('§53 — vendor filter passes through to the store (by-vendor report)', async () => {
    arrange(T);
    mockGetExpenses.mockResolvedValue([]);
    const res = await listExpensesRoute(requestFor('/api/agency/expenses?vendor=stock'));
    expect(res.status).toBe(200);
    expect(mockGetExpenses).toHaveBeenCalledWith(T, expect.objectContaining({ vendor: 'stock' }));
  });

  it('§33 — the createdBy param is honored for admins (MINE scope) and dropped for USERs', async () => {
    arrange(T);
    mockGetExpenses.mockResolvedValue([]);
    const res = await listExpensesRoute(requestFor(`/api/agency/expenses?createdBy=${MEMBER.userId}`));
    expect(res.status).toBe(200);
    expect(mockGetExpenses).toHaveBeenCalledWith(T, expect.objectContaining({ createdBy: MEMBER.userId }));

    arrange(T, 'Agency', 'USER', MEMBER.userId);
    const res2 = await listExpensesRoute(requestFor(`/api/agency/expenses?createdBy=${ADMIN.userId}`));
    expect(res2.status).toBe(200);
    // The USER's own scope wins — a smuggled createdBy never widens it.
    expect(mockGetExpenses).toHaveBeenCalledWith(T, expect.objectContaining({ createdBy: MEMBER.userId }));
  });
});

// ---------- detail (§33/§99/§113) ----------

describe('Module 8B — expense detail (GET /api/agency/expenses/:id)', () => {
  it('the owner reads their expense; another USER gets 403; cross-tenant is an identical 404', async () => {
    arrange(T, 'Agency', 'USER', MEMBER.userId);
    seedExpense(expenseFor({ createdBy: MEMBER.userId }));
    const res = await getExpenseRoute(requestFor('/api/agency/expenses/exp-1'), ctxFor('exp-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.expense.amount).toBeUndefined(); // §99

    seedExpense(expenseFor({ id: 'exp-2', createdBy: ADMIN.userId }));
    const res2 = await getExpenseRoute(requestFor('/api/agency/expenses/exp-2'), ctxFor('exp-2'));
    expect(res2.status).toBe(403);

    // §113 — B's expense under A's session is indistinguishable from missing.
    const res3 = await getExpenseRoute(requestFor('/api/agency/expenses/exp-b'), ctxFor('exp-b'));
    expect(res3.status).toBe(404);
  });
});

// ---------- the lifecycle (§22/§40) ----------

describe('Module 8B — edit + submit + approve + reject', () => {
  it('PATCH recomputes the charge on amount change; SUBMITTED is locked (409)', async () => {
    arrange(T, 'Agency', 'USER', MEMBER.userId);
    seedExpense(expenseFor({ createdBy: MEMBER.userId }));
    const res = await patchExpenseRoute(
      jsonRequest('/api/agency/expenses/exp-1', 'PATCH', { amount: 5000 }),
      ctxFor('exp-1')
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.expense.amount).toBeUndefined(); // still §99-redacted for the USER actor
    expect(mockUpdateExpenseRepo).toHaveBeenCalledWith('exp-1', T, expect.objectContaining({
      amount: { amount: 5000, currency: 'INR' },
      clientChargeAmount: { amount: 6000, currency: 'INR' }, // 5000 × 1.2 (§43)
    }));

    seedExpense(expenseFor({ id: 'exp-2', status: 'SUBMITTED', createdBy: MEMBER.userId }));
    const res2 = await patchExpenseRoute(
      jsonRequest('/api/agency/expenses/exp-2', 'PATCH', { notes: 'x' }),
      ctxFor('exp-2')
    );
    expect(res2.status).toBe(409);
  });

  it('submit moves DRAFT → SUBMITTED and audits', async () => {
    arrange(T, 'Agency', 'USER', MEMBER.userId);
    seedExpense(expenseFor({ createdBy: MEMBER.userId }));
    const res = await submitExpenseRoute(requestFor('/api/agency/expenses/exp-1/submit', { method: 'POST' }), ctxFor('exp-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.expense.status).toBe('SUBMITTED');
    expect(mockCreateLog).toHaveBeenCalledWith(
      expect.anything(), 'EXPENSE_SUBMITTED', expect.anything(), T, expect.anything()
    );
  });

  it('approve (by the PM): ONE Debit transaction is created and linked (§41)', async () => {
    arrange(T, 'Agency', 'USER', MEMBER.userId); // MEMBER is the project manager
    seedExpense(expenseFor({ status: 'SUBMITTED', createdBy: ADMIN.userId }));
    const res = await approveExpenseRoute(requestFor('/api/agency/expenses/exp-1/approve', { method: 'POST' }), ctxFor('exp-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.expense.status).toBe('APPROVED');
    expect(body.expense.transactionId).toBe('tx-10000');
    expect(mockCreateTransaction).toHaveBeenCalledTimes(1);
    expect(mockCreateTransaction).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: T,
      userId: ADMIN.userId,
      clientId: AGENCY_A.client.id,
      projectId: AGENCY_A.project.id,
      type: 'Debit',
      amount: 10000,
      date: '2026-09-01',
    }));
  });

  it('re-approval links the SAME transaction — never a duplicate (§42)', async () => {
    arrange(T, 'Agency', 'USER', MEMBER.userId);
    seedExpense(expenseFor({ status: 'SUBMITTED', createdBy: ADMIN.userId, transactionId: 'tx-existing' }));
    const res = await approveExpenseRoute(requestFor('/api/agency/expenses/exp-1/approve', { method: 'POST' }), ctxFor('exp-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.expense.transactionId).toBe('tx-existing');
    expect(mockCreateTransaction).not.toHaveBeenCalled();
  });

  it('tenant admin can approve their own expense; non-PM user cannot approve', async () => {
    arrange(T); // ADMIN created it
    seedExpense(expenseFor({ status: 'SUBMITTED', createdBy: ADMIN.userId }));
    const res = await approveExpenseRoute(requestFor('/api/agency/expenses/exp-1/approve', { method: 'POST' }), ctxFor('exp-1'));
    expect(res.status).toBe(200);

    // A USER who is neither admin nor the project's PM.
    arrange(T, 'Agency', 'USER', 'a999000000000000000000009');
    const res3 = await approveExpenseRoute(requestFor('/api/agency/expenses/exp-1/approve', { method: 'POST' }), ctxFor('exp-1'));
    expect(res3.status).toBe(403);
  });

  it('approve on a DRAFT expense is a 409 (state machine §40)', async () => {
    arrange(T, 'Agency', 'USER', MEMBER.userId);
    seedExpense(expenseFor({ status: 'DRAFT', createdBy: ADMIN.userId }));
    const res = await approveExpenseRoute(requestFor('/api/agency/expenses/exp-1/approve', { method: 'POST' }), ctxFor('exp-1'));
    expect(res.status).toBe(409);
    expect(mockCreateTransaction).not.toHaveBeenCalled();
  });

  it('reject requires a reason (§40) and returns the expense to rework', async () => {
    arrange(T, 'Agency', 'USER', MEMBER.userId);
    seedExpense(expenseFor({ status: 'SUBMITTED', createdBy: ADMIN.userId }));
    const res = await rejectExpenseRoute(
      jsonRequest('/api/agency/expenses/exp-1/reject', 'POST', {}),
      ctxFor('exp-1')
    );
    expect(res.status).toBe(400);

    const res2 = await rejectExpenseRoute(
      jsonRequest('/api/agency/expenses/exp-1/reject', 'POST', { reason: 'wrong vendor' }),
      ctxFor('exp-1')
    );
    expect(res2.status).toBe(200);
    const body = await res2.json();
    expect(body.expense.status).toBe('REJECTED');
    expect(body.expense.rejectionReason).toBe('wrong vendor');
  });

  it('rejecting an APPROVED expense is a correction: transaction kept, billing withdrawn', async () => {
    arrange(T, 'Agency', 'USER', MEMBER.userId);
    seedExpense(expenseFor({ status: 'APPROVED', createdBy: ADMIN.userId, transactionId: 'tx-existing' }));
    const res = await rejectExpenseRoute(
      jsonRequest('/api/agency/expenses/exp-1/reject', 'POST', { reason: 'duplicate' }),
      ctxFor('exp-1')
    );
    expect(res.status).toBe(200);
    expect(mockCreateTransaction).not.toHaveBeenCalled();
    expect(mockUpdateExpenseRepo).toHaveBeenCalledWith('exp-1', T, expect.objectContaining({
      status: 'REJECTED',
      clientChargeAmount: null,
      billingStatus: 'UNBILLED',
    }));
  });
});

// ---------- the approval queue (§53) ----------

describe('Module 8B — approval queue (GET /api/agency/expenses/approvals)', () => {
  it('is gated on agency.expenses.approve — USERs get 403, admins get the queue', async () => {
    arrange(T, 'Agency', 'USER', MEMBER.userId);
    const res = await approvalQueueRoute(requestFor('/api/agency/expenses/approvals'));
    expect(res.status).toBe(403);

    arrange(T);
    mockGetExpenses.mockResolvedValue([expenseFor({ status: 'SUBMITTED', createdBy: ADMIN.userId })]);
    const res2 = await approvalQueueRoute(requestFor('/api/agency/expenses/approvals'));
    expect(res2.status).toBe(200);
    const body = await res2.json();
    expect(mockGetExpenses).toHaveBeenCalledWith(T, expect.objectContaining({ status: 'SUBMITTED' }));
    expect(body.expenses).toHaveLength(1);
    // Approvers see the full economic picture (§99 does not apply).
    expect(body.expenses[0].amount).toEqual({ amount: 10000, currency: 'INR' });
  });
});
