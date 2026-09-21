/**
 * Module 10 (§110/§116) — Integration: the payments list API.
 *
 * Runs the REAL route handler, the REAL validators, and the REAL §116
 * domain report (getPaymentMethodSummary) with only the persistence edge
 * mocked — the same seam the webhook integration test uses (db.ts's local
 * reads resolve through internal calls that a module mock can't reach).
 * Pins the §116 report surface added in the final validation pass:
 *   - methodSummary — per-method counts over the FULL history, collected =
 *     Σ CONFIRMED only (REVERSED left the set), §127 mixed-currency null
 *   - methodSummary is a REPORT: unaffected by the list filters
 *   - collections-by-project — ?projectId= resolves the project's invoices
 *     and keeps only their payments; a project with no invoices is an
 *     honest empty list
 *   - the method list filter
 *   - §113 — another tenant sees nothing (rows AND summary)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TokenPayload } from '@/lib/auth';
import type { Tenant, User, PaymentFilters } from '@/lib/db';
import type { Payment } from '@/lib/agency/types/payment';
import type { Invoice } from '@/lib/agency/types/invoice';
import { makeMoney, zeroMoney } from '@/lib/agency/types/money';
import { todayInTimezone, DEFAULT_TENANT_TIMEZONE } from '@/lib/agency/types/dates';
import { AGENCY_A, AGENCY_B } from '../fixtures/agency-fixtures';

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
    createLog: vi.fn(),
    // the persistence edge this route reads through (the webhook-test seam):
    getPayments: vi.fn(),
    getInvoices: vi.fn(),
    getInvoiceById: vi.fn(),
    getClientById: vi.fn(),
    // imported by agency.clients (AuditContext/DomainResult home) — same module
    getLogs: vi.fn(), createClient: vi.fn(), getClients: vi.fn(),
    updateClient: vi.fn(), searchClients: vi.fn(), findClientByName: vi.fn(),
  };
});

import { getSessionUser } from '@/lib/auth';
import {
  getTenantById, getUserById, createLog,
  getPayments, getInvoices, getInvoiceById, getClientById,
} from '@/lib/db';
import { GET as paymentsRoute } from '@/app/api/agency/payments/route';
import { NextRequest } from 'next/server';

const mockSession = vi.mocked(getSessionUser);
const mockGetTenant = vi.mocked(getTenantById);
const mockGetUserById = vi.mocked(getUserById);
const mockCreateLog = vi.mocked(createLog);
const mockGetPayments = vi.mocked(getPayments);
const mockGetInvoices = vi.mocked(getInvoices);
const mockGetInvoiceById = vi.mocked(getInvoiceById);
const mockGetClientById = vi.mocked(getClientById);

const T: string = AGENCY_A.tenant.id;
const ADMIN = AGENCY_A.admin;
const TODAY = todayInTimezone(DEFAULT_TENANT_TIMEZONE);

function requestFor(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3100'), init as ConstructorParameters<typeof NextRequest>[1]);
}

function userFor(userId: string, tenantId = T): User {
  return {
    id: userId, username: 'a_admin', passwordHash: 'x', role: 'TENANT_ADMIN',
    tenantId, createdAt: new Date('2026-01-01T00:00:00Z'),
  } as unknown as User;
}

function arrange(tenantId: string) {
  const session: TokenPayload = { userId: ADMIN.userId, username: 'a_admin', role: 'TENANT_ADMIN', tenantId };
  const tenant: Tenant = {
    id: tenantId, name: `Tenant ${tenantId}`, status: 'ACTIVE', plan: 'FREE',
    settings: {}, limits: { maxUsers: 5 }, appMode: 'Agency',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
  mockSession.mockResolvedValue(session);
  mockGetTenant.mockResolvedValue(tenant);
  mockGetUserById.mockImplementation(async (id: string) => id === ADMIN.userId ? userFor(id, tenantId) : null);
  return session;
}

function invoiceFor(id: string, projectId?: string): Invoice {
  return {
    id, tenantId: T, clientId: 'client-a', ...(projectId !== undefined && { projectId }),
    invoiceNumber: `INV-${id.slice(-6)}`, issueDate: TODAY, dueDate: TODAY, currency: 'INR',
    subtotal: makeMoney(100000), discount: zeroMoney('INR'),
    taxLines: [], taxTotal: zeroMoney('INR'), total: makeMoney(100000),
    amountPaid: zeroMoney('INR'), amountDue: makeMoney(100000),
    status: 'SENT', createdBy: ADMIN.userId,
    createdAt: new Date('2026-09-01'), updatedAt: new Date('2026-09-01'),
  };
}

function paymentFor(overrides: Partial<Payment>): Payment {
  return {
    id: 'pay-1', tenantId: T, invoiceId: 'inv-p1', clientId: 'client-a',
    amount: makeMoney(40000), receivedAt: TODAY, method: 'BANK_TRANSFER',
    status: 'CONFIRMED', createdBy: ADMIN.userId,
    createdAt: new Date('2026-09-02'), updatedAt: new Date('2026-09-02'),
    ...overrides,
  };
}

/**
 * The seeded position (all tenant A):
 *   inv-p1 (project 1): pay-bt1  BANK_TRANSFER 40000 CONFIRMED
 *                        pay-bt2  BANK_TRANSFER 20000 REVERSED
 *   inv-p2 (project 2): pay-rz1  RAZORPAY      60000 CONFIRMED (INR)
 *                        pay-rz2  RAZORPAY      500   CONFIRMED (USD — §127 mix)
 *   inv-np (no project): pay-up1 UPI            10000 PENDING
 */
const SEED_INVOICES: Invoice[] = [
  invoiceFor('inv-p1', 'proj-1'), invoiceFor('inv-p2', 'proj-2'), invoiceFor('inv-np'),
];
const SEED_PAYMENTS: Payment[] = [
  paymentFor({ id: 'pay-bt1', invoiceId: 'inv-p1', method: 'BANK_TRANSFER', status: 'CONFIRMED', amount: makeMoney(40000) }),
  paymentFor({ id: 'pay-bt2', invoiceId: 'inv-p1', method: 'BANK_TRANSFER', status: 'REVERSED', amount: makeMoney(20000) }),
  paymentFor({ id: 'pay-rz1', invoiceId: 'inv-p2', method: 'RAZORPAY', status: 'CONFIRMED', amount: makeMoney(60000) }),
  paymentFor({ id: 'pay-rz2', invoiceId: 'inv-p2', method: 'RAZORPAY', status: 'CONFIRMED', amount: { amount: 500, currency: 'USD' } }),
  paymentFor({ id: 'pay-up1', invoiceId: 'inv-np', method: 'UPI', status: 'PENDING', amount: makeMoney(10000) }),
];

/**
 * Faithful fakes of the db.ts local-JSON semantics: tenant-scoped, filter
 * passthrough, newest received first. Only the persistence edge is faked —
 * the route, validators, and §116 domain report under test are real.
 */
function seedTenantA(): void {
  mockGetPayments.mockImplementation(async (tenantId: string, filters: PaymentFilters = {}) =>
    SEED_PAYMENTS
      .filter(p => p.tenantId === tenantId
        && (filters.invoiceId === undefined || p.invoiceId === filters.invoiceId)
        && (filters.clientId === undefined || p.clientId === filters.clientId)
        && (filters.status === undefined || p.status === filters.status)
        && (filters.method === undefined || p.method === filters.method)
        && (filters.gatewayPaymentId === undefined || p.gatewayPaymentId === filters.gatewayPaymentId)
        && (filters.dateFrom === undefined || p.receivedAt >= filters.dateFrom)
        && (filters.dateTo === undefined || p.receivedAt <= filters.dateTo))
      .sort((a, b) => (a.receivedAt !== b.receivedAt ? (a.receivedAt > b.receivedAt ? -1 : 1) : 0)));
  mockGetInvoices.mockImplementation(async (tenantId: string, filters: { clientId?: string; projectId?: string; status?: string } = {}) =>
    SEED_INVOICES
      .filter(i => i.tenantId === tenantId
        && (filters.clientId === undefined || i.clientId === filters.clientId)
        && (filters.projectId === undefined || i.projectId === filters.projectId)
        && (filters.status === undefined || i.status === filters.status)));
  mockGetInvoiceById.mockImplementation(async (id: string, tenantId: string) =>
    SEED_INVOICES.find(i => i.id === id && i.tenantId === tenantId) ?? null);
  mockGetClientById.mockResolvedValue(null);
}

beforeEach(() => {
  for (const m of [mockSession, mockGetTenant, mockGetUserById, mockCreateLog, mockGetPayments, mockGetInvoices, mockGetInvoiceById, mockGetClientById]) m.mockReset();
  mockCreateLog.mockResolvedValue({} as Awaited<ReturnType<typeof createLog>>);
  // the §113 probes and the empty-tenant cases still need defined reads
  mockGetPayments.mockResolvedValue([]);
  mockGetInvoices.mockResolvedValue([]);
  mockGetInvoiceById.mockResolvedValue(null);
  mockGetClientById.mockResolvedValue(null);
});

describe('Module 10 §116 — GET /api/agency/payments report surface', () => {
  it('methodSummary — per-method counts, collected over CONFIRMED only, REVERSED excluded', async () => {
    arrange(T);
    seedTenantA();
    const res = await paymentsRoute(requestFor('/api/agency/payments'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.methodSummary).toEqual([
      // PAYMENT_METHODS order; only methods with payments appear.
      { method: 'BANK_TRANSFER', count: 2, collected: 40000, currency: 'INR' }, // the REVERSED 20000 is not CONFIRMED
      { method: 'UPI', count: 1, collected: 0, currency: null },                 // PENDING — nothing collected
      { method: 'RAZORPAY', count: 2, collected: null, currency: null },         // §127 — 60000 INR + 500 USD, never converted
    ]);
  });

  it('methodSummary is a REPORT over the full history — list filters do not narrow it', async () => {
    arrange(T);
    seedTenantA();
    const res = await paymentsRoute(requestFor('/api/agency/payments?method=RAZORPAY'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.payments.map((p: Payment) => p.id)).toEqual(['pay-rz1', 'pay-rz2']); // the filter narrows rows
    expect(body.methodSummary.find((r: { method: string }) => r.method === 'BANK_TRANSFER')).toEqual({
      method: 'BANK_TRANSFER', count: 2, collected: 40000, currency: 'INR',
    }); // ...but not the summary
  });

  it('§116 collections-by-project — ?projectId= keeps only that project\'s invoice payments', async () => {
    arrange(T);
    seedTenantA();
    const res = await paymentsRoute(requestFor('/api/agency/payments?projectId=proj-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.payments.map((p: Payment) => p.id).sort()).toEqual(['pay-bt1', 'pay-bt2']);
  });

  it('a project with no invoices is an honest empty list, never an error', async () => {
    arrange(T);
    seedTenantA();
    const res = await paymentsRoute(requestFor('/api/agency/payments?projectId=proj-none'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.payments).toEqual([]);
    // the summary still reports the tenant's full history
    expect(body.methodSummary.length).toBe(3);
  });

  it('§113 — another tenant sees neither rows nor summary', async () => {
    arrange(AGENCY_B.tenant.id);
    seedTenantA(); // the STORE is full of tenant A payments
    const res = await paymentsRoute(requestFor('/api/agency/payments'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.payments).toEqual([]);
    expect(body.methodSummary).toEqual([]);
  });

  it('no session → 401', async () => {
    mockSession.mockResolvedValue(null);
    const res = await paymentsRoute(requestFor('/api/agency/payments'));
    expect(res.status).toBe(401);
  });
});
