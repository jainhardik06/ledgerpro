/**
 * Module 10 (Sprint 10E §105/§106/§110) — Integration: the receivables API.
 *
 * Runs the REAL route handler AND the REAL receivables query (local-JSON
 * path — connectDb forced to {db: null}, initLocalDb seeded) with only the
 * session/tenant edges mocked. Pins:
 *   - outstanding / due-soon / overdue / aging ladder / per-client rows
 *     computed from seeded open invoices, "today" in the TENANT timezone
 *   - DRAFT (§74 unnumbered), PAID (nothing outstanding) and VOID invoices
 *     contribute nothing; a zero-balance open invoice is not a receivable
 *   - the dueSoonDays window override (§9 default 7)
 *   - §127 mixed-currency honesty: amounts null + mixedCurrencies true,
 *     counts still real
 *   - §113 cross-tenant probes see only their own invoices
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TokenPayload } from '@/lib/auth';
import type { Tenant, User, Client } from '@/lib/db';
import type { Invoice } from '@/lib/agency/types/invoice';
import { addDays, todayInTimezone, DEFAULT_TENANT_TIMEZONE } from '@/lib/agency/types/dates';
import { makeMoney, zeroMoney } from '@/lib/agency/types/money';
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
    getClientById: vi.fn(),
    getProjectById: vi.fn(),
    createLog: vi.fn(),
    connectDb: vi.fn(),
    initLocalDb: vi.fn(),
    // imported by agency.clients (AuditContext/DomainResult home) — same module
    getLogs: vi.fn(), createClient: vi.fn(), getClients: vi.fn(),
    updateClient: vi.fn(), searchClients: vi.fn(), findClientByName: vi.fn(),
  };
});

import { getSessionUser } from '@/lib/auth';
import { getTenantById, getUserById, getClientById, getProjectById, createLog, connectDb, initLocalDb } from '@/lib/db';
import { GET as receivablesRoute } from '@/app/api/agency/receivables/route';
import { GET as agingRoute } from '@/app/api/agency/receivables/aging/route';
import { GET as summaryRoute } from '@/app/api/agency/receivables/summary/route';
import { NextRequest } from 'next/server';

const mockSession = vi.mocked(getSessionUser);
const mockGetTenant = vi.mocked(getTenantById);
const mockGetUserById = vi.mocked(getUserById);
const mockGetClientById = vi.mocked(getClientById);
const mockGetProjectById = vi.mocked(getProjectById);
const mockCreateLog = vi.mocked(createLog);
const mockConnectDb = vi.mocked(connectDb);
const mockInitLocalDb = vi.mocked(initLocalDb);

const T: string = AGENCY_A.tenant.id;
const ADMIN = AGENCY_A.admin;

function requestFor(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3100'), init as ConstructorParameters<typeof NextRequest>[1]);
}

// "Today" exactly as the route computes it (tenant settings empty → default tz).
const TODAY = todayInTimezone(DEFAULT_TENANT_TIMEZONE);

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

function invoiceFor(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-1', tenantId: T, clientId: AGENCY_A.client.id,
    invoiceNumber: 'INV-2026-0001', issueDate: TODAY, dueDate: TODAY, currency: 'INR',
    subtotal: makeMoney(100000), discount: zeroMoney('INR'),
    taxLines: [], taxTotal: zeroMoney('INR'), total: makeMoney(100000),
    amountPaid: zeroMoney('INR'), amountDue: makeMoney(100000),
    status: 'SENT', createdBy: ADMIN.userId,
    createdAt: new Date('2026-09-01'), updatedAt: new Date('2026-09-01'),
    ...overrides,
  };
}

/**
 * The seeded position (all INR, tenant A):
 *   inv-late   SENT     due −40d  due 40000  → overdue, bucket 31-60, client A
 *   inv-soon   SENT     due  +3d  due 20000  → CURRENT + due-soon,   client A
 *   inv-older  OVERDUE  due −75d  due 30000  → overdue, bucket 61-90, client B
 *   inv-draft  DRAFT    due  +9d  due  5000  → not a receivable (§74)
 *   inv-paid   PAID     due  −5d  due     0  → nothing outstanding
 *   inv-void   VOID     due  −5d  due  7000  → retired
 */
function seedTenantA(): void {
  mockInitLocalDb.mockReturnValue({
    invoices: [
      invoiceFor({ id: 'inv-late', clientId: 'client-a', invoiceNumber: 'INV-2026-0001', dueDate: addDays(TODAY, -40), amountDue: makeMoney(40000) }),
      invoiceFor({ id: 'inv-soon', clientId: 'client-a', invoiceNumber: 'INV-2026-0002', dueDate: addDays(TODAY, 3), amountDue: makeMoney(20000) }),
      invoiceFor({ id: 'inv-older', clientId: 'client-b', invoiceNumber: 'INV-2026-0003', dueDate: addDays(TODAY, -75), amountDue: makeMoney(30000), status: 'OVERDUE' }),
      invoiceFor({ id: 'inv-draft', clientId: 'client-a', invoiceNumber: undefined, dueDate: addDays(TODAY, 9), amountDue: makeMoney(5000), status: 'DRAFT' }),
      invoiceFor({ id: 'inv-paid', clientId: 'client-a', invoiceNumber: 'INV-2026-0004', dueDate: addDays(TODAY, -5), amountDue: zeroMoney('INR'), amountPaid: makeMoney(100000), status: 'PAID' }),
      invoiceFor({ id: 'inv-void', clientId: 'client-b', invoiceNumber: 'INV-2026-0005', dueDate: addDays(TODAY, -5), amountDue: makeMoney(7000), status: 'VOID' }),
    ],
  } as unknown as ReturnType<typeof initLocalDb>);
}

beforeEach(() => {
  for (const m of [mockSession, mockGetTenant, mockGetUserById, mockGetClientById, mockGetProjectById, mockCreateLog, mockConnectDb, mockInitLocalDb]) m.mockReset();
  mockCreateLog.mockResolvedValue({} as Awaited<ReturnType<typeof createLog>>);
  // Force the query's local-JSON path — deterministic, no live Mongo.
  mockConnectDb.mockResolvedValue({ db: null } as Awaited<ReturnType<typeof connectDb>>);
  mockGetProjectById.mockResolvedValue(null);
  mockGetClientById.mockImplementation(async (id: string) =>
    id === 'client-a' || id === 'client-b'
      ? ({ id, tenantId: T, name: id === 'client-a' ? 'Client Alpha' : 'Client Beta' } as unknown as Client)
      : null);
  mockInitLocalDb.mockReturnValue({ invoices: [] } as unknown as ReturnType<typeof initLocalDb>);
});

describe('Module 10E — GET /api/agency/receivables', () => {
  it('computes outstanding / dueSoon / overdue / aging / byClient from the seeded open invoices (§105/§106)', async () => {
    arrange(T);
    seedTenantA();
    const res = await receivablesRoute(requestFor('/api/agency/receivables'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    const r = body.receivables;
    expect(r.asOf).toBe(TODAY);
    expect(r.dueSoonDays).toBe(7);           // §9 default
    expect(r.outstanding).toBe(90000);        // 40k + 20k + 30k
    expect(r.dueSoon).toBe(20000);            // only the +3d invoice
    expect(r.overdueAmount).toBe(70000);      // 40k + 30k
    expect(r.overdueCount).toBe(2);
    expect(r.openInvoiceCount).toBe(3);
    expect(r.currency).toBe('INR');
    expect(r.mixedCurrencies).toBe(false);
    expect(r.byAgingBucket).toEqual({ CURRENT: 20000, '1-30': 0, '31-60': 40000, '61-90': 30000, '90+': 0 });
    // §106 — sorted by outstanding desc, names resolved.
    expect(r.byClient).toEqual([
      { clientId: 'client-a', invoiceCount: 2, outstanding: 60000, overdue: 40000, currency: 'INR', clientName: 'Client Alpha' },
      { clientId: 'client-b', invoiceCount: 1, outstanding: 30000, overdue: 30000, currency: 'INR', clientName: 'Client Beta' },
    ]);
    expect(mockCreateLog).toHaveBeenCalledWith(
      'a_admin', 'AGENCY_RECEIVABLES_READ', expect.any(String), T, expect.anything()
    );
  });

  it('honours the dueSoonDays window override', async () => {
    arrange(T);
    seedTenantA();
    const res = await receivablesRoute(requestFor('/api/agency/receivables?dueSoonDays=1'));
    expect(res.status).toBe(200);
    const r = (await res.json()).receivables;
    expect(r.dueSoonDays).toBe(1);
    expect(r.dueSoon).toBe(0); // the +3d invoice is outside a 1-day window
    expect(r.outstanding).toBe(90000); // everything else unchanged
  });

  it('a missing client renders its id-hint row with clientName null — never a fabricated name', async () => {
    arrange(T);
    seedTenantA();
    mockGetClientById.mockResolvedValue(null);
    const res = await receivablesRoute(requestFor('/api/agency/receivables'));
    expect(res.status).toBe(200);
    const r = (await res.json()).receivables;
    expect(r.byClient.length).toBe(2);
    for (const row of r.byClient) expect(row.clientName).toBeNull();
    expect(r.byClient.map((row: { clientId: string }) => row.clientId)).toEqual(['client-a', 'client-b']);
  });

  it('§127 — mixed currencies: amounts null + mixedCurrencies true, counts still real', async () => {
    arrange(T);
    mockInitLocalDb.mockReturnValue({
      invoices: [
        invoiceFor({ id: 'inv-inr', clientId: 'client-a', dueDate: addDays(TODAY, -10), amountDue: makeMoney(40000) }),
        invoiceFor({
          id: 'inv-usd', clientId: 'client-a', dueDate: addDays(TODAY, -12),
          currency: 'USD', subtotal: { amount: 500, currency: 'USD' }, total: { amount: 500, currency: 'USD' },
          amountDue: { amount: 500, currency: 'USD' },
        }),
      ],
    } as unknown as ReturnType<typeof initLocalDb>);
    const res = await receivablesRoute(requestFor('/api/agency/receivables'));
    expect(res.status).toBe(200);
    const r = (await res.json()).receivables;
    expect(r.mixedCurrencies).toBe(true);
    expect(r.outstanding).toBeNull();        // 40000 INR + 500 USD — never converted
    expect(r.overdueAmount).toBeNull();
    expect(r.currency).toBeNull();
    // Due-soon is genuinely EMPTY here (both invoices are past due) — an
    // honest 0, not a mixed-null.
    expect(r.dueSoon).toBe(0);
    for (const bucket of Object.values(r.byAgingBucket)) expect(bucket).toBeNull();
    expect(r.overdueCount).toBe(2);          // counts are currency-free — still real
    expect(r.openInvoiceCount).toBe(2);
  });

  it('§113 — another tenant\'s invoices never appear', async () => {
    arrange(AGENCY_B.tenant.id);
    seedTenantA(); // the STORE is full of tenant A invoices
    const res = await receivablesRoute(requestFor('/api/agency/receivables'));
    expect(res.status).toBe(200);
    const r = (await res.json()).receivables;
    expect(r.outstanding).toBe(0);
    expect(r.openInvoiceCount).toBe(0);
    expect(r.byClient).toEqual([]);
  });

  it('an empty tenant sees a clean zero position, not an error', async () => {
    arrange(T);
    const res = await receivablesRoute(requestFor('/api/agency/receivables'));
    expect(res.status).toBe(200);
    const r = (await res.json()).receivables;
    expect(r).toMatchObject({
      outstanding: 0, dueSoon: 0, overdueAmount: 0, overdueCount: 0, openInvoiceCount: 0,
      mixedCurrencies: false,
    });
    expect(r.byAgingBucket).toEqual({ CURRENT: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 });
  });

  it('no session → 401 (the route is session-gated, unlike the webhook)', async () => {
    mockSession.mockResolvedValue(null);
    const res = await receivablesRoute(requestFor('/api/agency/receivables'));
    expect(res.status).toBe(401);
  });
});

describe('Module 10 §110 — GET /api/agency/receivables/aging (the dedicated aging endpoint)', () => {
  it('returns the ladder computed from the same engine as the main report (§106)', async () => {
    arrange(T);
    seedTenantA();
    const res = await agingRoute(requestFor('/api/agency/receivables/aging'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.aging).toEqual({
      asOf: TODAY,
      byAgingBucket: { CURRENT: 20000, '1-30': 0, '31-60': 40000, '61-90': 30000, '90+': 0 },
      overdueCount: 2,
      openInvoiceCount: 3,
      currency: 'INR',
      mixedCurrencies: false,
    });
  });

  it('§127 — mixed currencies: every bucket null, counts still real', async () => {
    arrange(T);
    mockInitLocalDb.mockReturnValue({
      invoices: [
        invoiceFor({ id: 'inv-inr', clientId: 'client-a', dueDate: addDays(TODAY, -10), amountDue: makeMoney(40000) }),
        invoiceFor({
          id: 'inv-usd', clientId: 'client-a', dueDate: addDays(TODAY, -35),
          currency: 'USD', subtotal: { amount: 500, currency: 'USD' }, total: { amount: 500, currency: 'USD' },
          amountDue: { amount: 500, currency: 'USD' },
        }),
      ],
    } as unknown as ReturnType<typeof initLocalDb>);
    const res = await agingRoute(requestFor('/api/agency/receivables/aging'));
    expect(res.status).toBe(200);
    const a = (await res.json()).aging;
    expect(a.mixedCurrencies).toBe(true);
    expect(a.currency).toBeNull();
    for (const bucket of Object.values(a.byAgingBucket)) expect(bucket).toBeNull();
    expect(a.overdueCount).toBe(2);
    expect(a.openInvoiceCount).toBe(2);
  });

  it('§113 — another tenant sees a clean zero ladder', async () => {
    arrange(AGENCY_B.tenant.id);
    seedTenantA(); // the STORE is full of tenant A invoices
    const res = await agingRoute(requestFor('/api/agency/receivables/aging'));
    expect(res.status).toBe(200);
    const a = (await res.json()).aging;
    expect(a.byAgingBucket).toEqual({ CURRENT: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 });
    expect(a.overdueCount).toBe(0);
    expect(a.openInvoiceCount).toBe(0);
  });

  it('no session → 401', async () => {
    mockSession.mockResolvedValue(null);
    const res = await agingRoute(requestFor('/api/agency/receivables/aging'));
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Module 14 — the A/R list rows (§96), their order (§97), the filters (§98),
// the /summary endpoint (§87) and the §105/§106 acceptance matrix.
// ---------------------------------------------------------------------------

describe('Module 14 — GET /api/agency/receivables: the A/R list rows (§96/§97/§101/§102)', () => {
  it('every open owed invoice is a row with stored facts + DERIVED age/bucket/risk/display', async () => {
    arrange(T);
    seedTenantA();
    const res = await receivablesRoute(requestFor('/api/agency/receivables'));
    expect(res.status).toBe(200);
    const r = (await res.json()).receivables;
    expect(r.invoices.map((row: { invoiceId: string }) => row.invoiceId)).toEqual(['inv-older', 'inv-late', 'inv-soon']);
    expect(r.invoices[0]).toEqual({
      invoiceId: 'inv-older', invoiceNumber: 'INV-2026-0003',
      clientId: 'client-b', projectId: null,
      dueDate: addDays(TODAY, -75),
      ageDays: 75, agingBucket: '61-90', collectionRisk: 'OVERDUE_60_PLUS',
      status: 'OVERDUE', displayStatus: 'OVERDUE',
      total: { amount: 100000, currency: 'INR' },
      paid: { amount: 0, currency: 'INR' },
      due: { amount: 30000, currency: 'INR' },
      clientName: 'Client Beta', projectName: null,
    });
    // inv-late is STORED SENT but past due with money owed → displays OVERDUE
    // (§80/§91) while the stored fact stays visible on the row.
    expect(r.invoices[1]).toMatchObject({
      invoiceId: 'inv-late', status: 'SENT', displayStatus: 'OVERDUE',
      ageDays: 40, agingBucket: '31-60', collectionRisk: 'OVERDUE_30_PLUS',
    });
    // Not yet due → age 0, no risk badge, honest SENT.
    expect(r.invoices[2]).toMatchObject({
      invoiceId: 'inv-soon', displayStatus: 'SENT', ageDays: 0,
      agingBucket: 'CURRENT', collectionRisk: null,
    });
  });

  it('§97 — the order is most-overdue first, then outstanding amount, due date, client', async () => {
    arrange(T);
    seedTenantA();
    const res = await receivablesRoute(requestFor('/api/agency/receivables'));
    expect(res.status).toBe(200);
    const r = (await res.json()).receivables;
    // 75d → 40d → 0d: the risk ladder IS the order.
    expect(r.invoices.map((row: { ageDays: number }) => row.ageDays)).toEqual([75, 40, 0]);
  });

  it('§95/§96 — byProject groups by project with standalone invoices under one null row (sorted last)', async () => {
    arrange(T);
    mockInitLocalDb.mockReturnValue({
      invoices: [
        invoiceFor({ id: 'inv-pa1', clientId: 'client-a', projectId: 'proj-a', dueDate: addDays(TODAY, -10), amountDue: makeMoney(30000) }),
        invoiceFor({ id: 'inv-pa2', clientId: 'client-a', projectId: 'proj-a', dueDate: addDays(TODAY, 5), amountDue: makeMoney(10000) }),
        invoiceFor({ id: 'inv-pb1', clientId: 'client-b', projectId: 'proj-b', dueDate: addDays(TODAY, -20), amountDue: makeMoney(20000) }),
        invoiceFor({ id: 'inv-sa1', clientId: 'client-a', dueDate: addDays(TODAY, -3), amountDue: makeMoney(5000) }),
      ],
    } as unknown as ReturnType<typeof initLocalDb>);
    mockGetProjectById.mockImplementation(async (id: string) =>
      id === 'proj-a' || id === 'proj-b'
        ? ({ id, tenantId: T, name: id === 'proj-a' ? 'Project Alpha' : 'Project Beta' } as never)
        : null);
    const res = await receivablesRoute(requestFor('/api/agency/receivables'));
    expect(res.status).toBe(200);
    const r = (await res.json()).receivables;
    expect(r.byProject).toEqual([
      { projectId: 'proj-a', invoiceCount: 2, outstanding: 40000, overdue: 30000, currency: 'INR', projectName: 'Project Alpha' },
      { projectId: 'proj-b', invoiceCount: 1, outstanding: 20000, overdue: 20000, currency: 'INR', projectName: 'Project Beta' },
      { projectId: null, invoiceCount: 1, outstanding: 5000, overdue: 5000, currency: 'INR', projectName: null },
    ]);
    // The rows carry the same project grouping (§95 agrees with §96 — one engine).
    expect(r.invoices.find((row: { invoiceId: string }) => row.invoiceId === 'inv-sa1').projectName).toBeNull();
    expect(r.invoices.find((row: { invoiceId: string }) => row.invoiceId === 'inv-pb1').projectName).toBe('Project Beta');
  });
});

describe('Module 14 — GET /api/agency/receivables: the §98 filters', () => {
  it('clientId narrows EVERY surface to that client (one filtered fact set)', async () => {
    arrange(T);
    seedTenantA();
    const res = await receivablesRoute(requestFor('/api/agency/receivables?clientId=client-a'));
    expect(res.status).toBe(200);
    const r = (await res.json()).receivables;
    expect(r.outstanding).toBe(60000);          // 40k + 20k — client B's 30k is gone
    expect(r.openInvoiceCount).toBe(2);
    expect(r.byClient.map((row: { clientId: string }) => row.clientId)).toEqual(['client-a']);
    expect(r.invoices.map((row: { invoiceId: string }) => row.invoiceId)).toEqual(['inv-late', 'inv-soon']);
    expect(r.byAgingBucket).toEqual({ CURRENT: 20000, '1-30': 0, '31-60': 40000, '61-90': 0, '90+': 0 });
  });

  it('projectId narrows to that project (and standalone invoices only when asked by id)', async () => {
    arrange(T);
    mockInitLocalDb.mockReturnValue({
      invoices: [
        invoiceFor({ id: 'inv-pa1', clientId: 'client-a', projectId: 'proj-a', dueDate: addDays(TODAY, -10), amountDue: makeMoney(30000) }),
        invoiceFor({ id: 'inv-sa1', clientId: 'client-a', dueDate: addDays(TODAY, -3), amountDue: makeMoney(5000) }),
      ],
    } as unknown as ReturnType<typeof initLocalDb>);
    const res = await receivablesRoute(requestFor('/api/agency/receivables?projectId=proj-a'));
    expect(res.status).toBe(200);
    const r = (await res.json()).receivables;
    expect(r.openInvoiceCount).toBe(1);
    expect(r.outstanding).toBe(30000);
    expect(r.invoices[0].invoiceId).toBe('inv-pa1');
  });

  it('status matches the DERIVED display status: OVERDUE catches stored SENT past due (§80/§91)', async () => {
    arrange(T);
    seedTenantA();
    const overdue = (await (await receivablesRoute(requestFor('/api/agency/receivables?status=OVERDUE'))).json()).receivables;
    expect(overdue.openInvoiceCount).toBe(2);   // inv-late (stored SENT, displays OVERDUE) + inv-older
    expect(overdue.outstanding).toBe(70000);
    expect(overdue.invoices.map((row: { invoiceId: string }) => row.invoiceId)).toEqual(['inv-older', 'inv-late']);

    const sent = (await (await receivablesRoute(requestFor('/api/agency/receivables?status=SENT'))).json()).receivables;
    expect(sent.openInvoiceCount).toBe(1);      // only inv-soon still displays SENT
    expect(sent.invoices[0].invoiceId).toBe('inv-soon');
  });

  it('agingBucket isolates one rung of the ladder', async () => {
    arrange(T);
    seedTenantA();
    const res = await receivablesRoute(requestFor('/api/agency/receivables?agingBucket=31-60'));
    expect(res.status).toBe(200);
    const r = (await res.json()).receivables;
    expect(r.invoices.map((row: { invoiceId: string }) => row.invoiceId)).toEqual(['inv-late']);
    expect(r.byAgingBucket).toEqual({ CURRENT: 0, '1-30': 0, '31-60': 40000, '61-90': 0, '90+': 0 });
  });

  it('from/to is the inclusive DUE-DATE window', async () => {
    arrange(T);
    seedTenantA();
    // [today−50, today+7] keeps inv-late (−40) and inv-soon (+3), drops inv-older (−75).
    const res = await receivablesRoute(requestFor(`/api/agency/receivables?from=${addDays(TODAY, -50)}&to=${addDays(TODAY, 7)}`));
    expect(res.status).toBe(200);
    const r = (await res.json()).receivables;
    expect(r.invoices.map((row: { invoiceId: string }) => row.invoiceId)).toEqual(['inv-late', 'inv-soon']);
  });

  it('currency narrows the fact set before any math (§127)', async () => {
    arrange(T);
    mockInitLocalDb.mockReturnValue({
      invoices: [
        invoiceFor({ id: 'inv-inr', clientId: 'client-a', dueDate: addDays(TODAY, -10), amountDue: makeMoney(40000) }),
        invoiceFor({
          id: 'inv-usd', clientId: 'client-b', dueDate: addDays(TODAY, -12),
          currency: 'USD', subtotal: { amount: 500, currency: 'USD' }, total: { amount: 500, currency: 'USD' },
          amountDue: { amount: 500, currency: 'USD' },
        }),
      ],
    } as unknown as ReturnType<typeof initLocalDb>);
    const usd = (await (await receivablesRoute(requestFor('/api/agency/receivables?currency=USD'))).json()).receivables;
    expect(usd.mixedCurrencies).toBe(false);    // the USD-only fact set is single-currency
    expect(usd.outstanding).toBe(500);
    expect(usd.currency).toBe('USD');
    expect(usd.invoices.map((row: { invoiceId: string }) => row.invoiceId)).toEqual(['inv-usd']);
  });

  it('fail-closed: an INVALID filter is a 400, never a silently-empty report', async () => {
    arrange(T);
    seedTenantA();
    for (const qs of [
      'status=PAID',            // not a receivable display status
      'status=DRAFT',
      'agingBucket=0-30',       // not a bucket
      'from=2026-13-01',        // not a date
      `from=${TODAY}&to=${addDays(TODAY, -1)}`, // from after to
      'currency=usd',           // lowercase is not an ISO code
      'dueSoonDays=0',          // below the §90 window floor
      'dueSoonDays=91',
      'clientId=%20',           // whitespace-only
    ]) {
      const res = await receivablesRoute(requestFor(`/api/agency/receivables?${qs}`));
      expect(res.status).toBe(400); // validated: ?${qs}
      const body = await res.json();
      expect(typeof body.error).toBe('string');
    }
    // The summary and aging endpoints share the same fail-closed contract.
    for (const route of [summaryRoute, agingRoute]) {
      const res = await route(requestFor('/api/agency/receivables?status=PAID'));
      expect(res.status).toBe(400);
    }
  });

  it('the filters apply to the dedicated aging endpoint too (§98)', async () => {
    arrange(T);
    seedTenantA();
    const res = await agingRoute(requestFor('/api/agency/receivables/aging?clientId=client-a'));
    expect(res.status).toBe(200);
    const a = (await res.json()).aging;
    expect(a.byAgingBucket).toEqual({ CURRENT: 20000, '1-30': 0, '31-60': 40000, '61-90': 0, '90+': 0 });
    expect(a.overdueCount).toBe(1);
    expect(a.openInvoiceCount).toBe(2);
  });
});

describe('Module 14 — GET /api/agency/receivables/summary (§87: the position, without the rows)', () => {
  it('carries every summary surface and NO invoice rows — agreeing with the main report', async () => {
    arrange(T);
    seedTenantA();
    const [summaryRes, mainRes] = await Promise.all([
      summaryRoute(requestFor('/api/agency/receivables')),
      receivablesRoute(requestFor('/api/agency/receivables')),
    ]);
    expect(summaryRes.status).toBe(200);
    const body = await summaryRes.json();
    expect(body.success).toBe(true);
    const s = body.summary;
    expect(s.invoices).toBeUndefined();         // §87 — the point of this endpoint
    expect(s.byProject).toBeUndefined();
    expect(s).toMatchObject({
      asOf: TODAY, dueSoonDays: 7,
      outstanding: 90000, dueSoon: 20000, overdueAmount: 70000,
      overdueCount: 2, openInvoiceCount: 3,
      currency: 'INR', mixedCurrencies: false,
    });
    expect(s.byAgingBucket).toEqual({ CURRENT: 20000, '1-30': 0, '31-60': 40000, '61-90': 30000, '90+': 0 });
    expect(s.byClient).toEqual([
      { clientId: 'client-a', invoiceCount: 2, outstanding: 60000, overdue: 40000, currency: 'INR', clientName: 'Client Alpha' },
      { clientId: 'client-b', invoiceCount: 1, outstanding: 30000, overdue: 30000, currency: 'INR', clientName: 'Client Beta' },
    ]);
    // One engine: the main report's non-row surfaces are identical.
    const main = (await mainRes.json()).receivables;
    expect(s.outstanding).toBe(main.outstanding);
    expect(s.byAgingBucket).toEqual(main.byAgingBucket);
    expect(s.byClient).toEqual(main.byClient);
  });

  it('no session → 401', async () => {
    mockSession.mockResolvedValue(null);
    const res = await summaryRoute(requestFor('/api/agency/receivables/summary'));
    expect(res.status).toBe(401);
  });
});

describe('Module 14 — §105/§106 acceptance matrix (the gate scenarios)', () => {
  /**
   * The §105 matrix (single currency, tenant A):
   *   inv-current  due tomorrow, 100k unpaid      → CURRENT bucket
   *   inv-over10   due −10d,     100k unpaid      → 1-30 bucket + OVERDUE_10_PLUS
   *   inv-partial  100k total / 70k paid / 30k due → row shows due 30k ONLY
   *   inv-paid     fully paid                     → absent from A/R entirely
   */
  function seedMatrix(): void {
    mockInitLocalDb.mockReturnValue({
      invoices: [
        invoiceFor({ id: 'inv-current', clientId: 'client-a', dueDate: addDays(TODAY, 1), amountDue: makeMoney(100000) }),
        invoiceFor({ id: 'inv-over10', clientId: 'client-a', dueDate: addDays(TODAY, -10), amountDue: makeMoney(100000) }),
        invoiceFor({
          id: 'inv-partial', clientId: 'client-b', dueDate: addDays(TODAY, 2),
          amountPaid: makeMoney(70000), amountDue: makeMoney(30000), status: 'PARTIALLY_PAID',
        }),
        invoiceFor({
          id: 'inv-paid', clientId: 'client-b', dueDate: addDays(TODAY, -5),
          amountPaid: makeMoney(100000), amountDue: zeroMoney('INR'), status: 'PAID',
        }),
      ],
    } as unknown as ReturnType<typeof initLocalDb>);
  }

  it('every finalized unpaid invoice is in A/R; partials show outstanding only; paid disappears (§106)', async () => {
    arrange(T);
    seedMatrix();
    const res = await receivablesRoute(requestFor('/api/agency/receivables'));
    expect(res.status).toBe(200);
    const r = (await res.json()).receivables;
    expect(r.openInvoiceCount).toBe(3);         // paid is gone
    expect(r.invoices.map((row: { invoiceId: string }) => row.invoiceId)).toEqual(['inv-over10', 'inv-current', 'inv-partial']);
    // The partial row shows the REMAINING 30k, never the 100k total (§92).
    const partial = r.invoices.find((row: { invoiceId: string }) => row.invoiceId === 'inv-partial');
    expect(partial.total).toEqual({ amount: 100000, currency: 'INR' });
    expect(partial.paid).toEqual({ amount: 70000, currency: 'INR' });
    expect(partial.due).toEqual({ amount: 30000, currency: 'INR' });
    expect(partial.displayStatus).toBe('PARTIALLY_PAID');
    // Outstanding = 100k + 100k + 30k (the partial contributes its balance only).
    expect(r.outstanding).toBe(230000);
  });

  it('overdue money lands in the correct bucket with the correct risk band (§88/§89/§101)', async () => {
    arrange(T);
    seedMatrix();
    const res = await receivablesRoute(requestFor('/api/agency/receivables'));
    const r = (await res.json()).receivables;
    expect(r.byAgingBucket).toEqual({ CURRENT: 130000, '1-30': 100000, '31-60': 0, '61-90': 0, '90+': 0 });
    expect(r.overdueAmount).toBe(100000);
    expect(r.overdueCount).toBe(1);
    expect(r.invoices[0]).toMatchObject({
      invoiceId: 'inv-over10', ageDays: 10, agingBucket: '1-30', collectionRisk: 'OVERDUE_10_PLUS',
    });
  });

  it('§113 — the matrix through tenant B\'s eyes: empty, every surface (§106 tenant isolation)', async () => {
    arrange(AGENCY_B.tenant.id);
    seedMatrix();
    const res = await receivablesRoute(requestFor('/api/agency/receivables'));
    expect(res.status).toBe(200);
    const r = (await res.json()).receivables;
    expect(r).toMatchObject({ outstanding: 0, overdueCount: 0, openInvoiceCount: 0 });
    expect(r.invoices).toEqual([]);
    expect(r.byClient).toEqual([]);
    expect(r.byProject).toEqual([]);
  });
});
