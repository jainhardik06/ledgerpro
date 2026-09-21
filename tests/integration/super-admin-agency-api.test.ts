/**
 * Post-Phase-1 super-admin surface — API privilege gates + assembly.
 *
 * Pins the REAL route handlers over mocked sessions and engine sources:
 *   - /api/super-admin/agency        (platform analytics)
 *   - /api/super-admin/tenants/[id]/agency  (per-tenant privileged snapshot)
 *
 * The gates are the security contract: anonymous, TENANT_ADMIN and USER
 * sessions are all rejected with 401 — the platform scope must never leak
 * to a tenant session. The positive SUPER_ADMIN paths verify the assembly
 * (one engine set, pending-source degradation, non-agency honesty) with
 * controlled engine outputs. The REAL-server gate is additionally pinned by
 * Bruno suite 49-SuperAdmin-Agency-E2E.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, getSessionUser: vi.fn() };
});

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...actual,
    connectDb: vi.fn(),
    initLocalDb: vi.fn(),
    getTenants: vi.fn(),
    getTenantById: vi.fn(),
  };
});

vi.mock('@/lib/agency/queries/platform-analytics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/agency/queries/platform-analytics')>();
  return { ...actual, getPlatformAgencyRows: vi.fn() };
});

vi.mock('@/lib/agency/queries/client-counts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/agency/queries/client-counts')>();
  return { ...actual, countActiveClients: vi.fn() };
});

vi.mock('@/lib/agency/queries/project-metrics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/agency/queries/project-metrics')>();
  return { ...actual, getProjectPortfolioMetrics: vi.fn() };
});

vi.mock('@/lib/agency/queries/rate-readiness', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/agency/queries/rate-readiness')>();
  return { ...actual, getRateReadinessMetrics: vi.fn() };
});

vi.mock('@/lib/agency/queries/time-summary', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/agency/queries/time-summary')>();
  return { ...actual, getDeliveryHoursMetrics: vi.fn() };
});

vi.mock('@/lib/agency/queries/receivables-summary', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/agency/queries/receivables-summary')>();
  return { ...actual, getReceivablesMetrics: vi.fn(), getInvoiceMoneyMetrics: vi.fn() };
});

vi.mock('@/lib/agency/profitability', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/agency/profitability')>();
  return { ...actual, getPortfolioProfitability: vi.fn() };
});

import { getSessionUser } from '@/lib/auth';
import { getTenants, getTenantById } from '@/lib/db';
import { getPlatformAgencyRows } from '@/lib/agency/queries/platform-analytics';
import { countActiveClients } from '@/lib/agency/queries/client-counts';
import { getProjectPortfolioMetrics } from '@/lib/agency/queries/project-metrics';
import { getRateReadinessMetrics } from '@/lib/agency/queries/rate-readiness';
import { getDeliveryHoursMetrics } from '@/lib/agency/queries/time-summary';
import { getReceivablesMetrics, getInvoiceMoneyMetrics } from '@/lib/agency/queries/receivables-summary';
import { getPortfolioProfitability } from '@/lib/agency/profitability';
import { GET as analyticsRoute } from '@/app/api/super-admin/agency/route';
import { GET as snapshotRoute } from '@/app/api/super-admin/tenants/[id]/agency/route';

const mockSession = vi.mocked(getSessionUser);

const SUPER = { userId: 'su1', username: 'superadmin', role: 'SUPER_ADMIN' as const };
const ADMIN = { userId: 'u1', username: 'admin', role: 'TENANT_ADMIN' as const, tenantId: 't1' };
const USER = { userId: 'u2', username: 'member', role: 'USER' as const, tenantId: 't1' };

function agencyTenant(id: string, name: string) {
  return { id, name, status: 'ACTIVE' as const, plan: 'ENTERPRISE' as const, appMode: 'Agency' as const, limits: { maxUsers: 10 }, settings: {} };
}

beforeEach(() => {
  mockSession.mockReset();
  (getPlatformAgencyRows as unknown as Mock).mockReset();
  (getTenants as unknown as Mock).mockReset();
  (getTenantById as unknown as Mock).mockReset();
  (countActiveClients as unknown as Mock).mockReset();
  (getProjectPortfolioMetrics as unknown as Mock).mockReset();
  (getRateReadinessMetrics as unknown as Mock).mockReset();
  (getDeliveryHoursMetrics as unknown as Mock).mockReset();
  (getReceivablesMetrics as unknown as Mock).mockReset();
  (getInvoiceMoneyMetrics as unknown as Mock).mockReset();
  (getPortfolioProfitability as unknown as Mock).mockReset();
});

describe('GET /api/super-admin/agency — the privilege gate', () => {
  it('401 for an anonymous session', async () => {
    mockSession.mockResolvedValue(null);
    const res = await analyticsRoute();
    expect(res.status).toBe(401);
    expect(getPlatformAgencyRows).not.toHaveBeenCalled();
  });

  it('401 for a TENANT_ADMIN — the platform scope never leaks to a tenant session', async () => {
    mockSession.mockResolvedValue(ADMIN);
    const res = await analyticsRoute();
    expect(res.status).toBe(401);
    expect(getPlatformAgencyRows).not.toHaveBeenCalled();
  });

  it('401 for a plain USER', async () => {
    mockSession.mockResolvedValue(USER);
    const res = await analyticsRoute();
    expect(res.status).toBe(401);
  });

  it('200 for SUPER_ADMIN — summary assembled from the platform pass + tenant identities', async () => {
    mockSession.mockResolvedValue(SUPER);
    (getPlatformAgencyRows as unknown as Mock).mockResolvedValue([
      {
        tenantId: 't1', clients: 3, totalProjects: 2, activeProjects: 1,
        hoursLogged: 10, billableHours: 6, hours30d: 4,
        hasRateSetup: true, hasTimeEntries: true, hasIssuedInvoices: true,
        invoiced: { total: 1000, currency: 'INR', byCurrency: { INR: 1000 } },
        collected: { total: 600, currency: 'INR', byCurrency: { INR: 600 } },
        outstanding: { total: 400, currency: 'INR', byCurrency: { INR: 400 } },
      },
    ]);
    (getTenants as unknown as Mock).mockResolvedValue([agencyTenant('t1', 'Acme Agency')]);

    const res = await analyticsRoute();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.adoption).toEqual({ agencyTenants: 1, activeTenants: 1, agencySharePercent: 100 });
    expect(body.activation.withClients).toBe(1);
    expect(body.activation.withInvoices).toBe(1);
    expect(body.volume.invoiced.total).toBe(1000);
    expect(body.tenants[0].name).toBe('Acme Agency');
    expect(body.tenants[0].invoiced.total).toBe(1000);
  });
});

describe('GET /api/super-admin/tenants/[id]/agency — the privileged snapshot', () => {
  const call = (id: string) => snapshotRoute({} as never, { params: Promise.resolve({ id }) });

  it('401 for a TENANT_ADMIN before any resource lookup', async () => {
    mockSession.mockResolvedValue(ADMIN);
    const res = await call('t1');
    expect(res.status).toBe(401);
    expect(getTenantById).not.toHaveBeenCalled();
  });

  it('404 for an unknown tenant', async () => {
    mockSession.mockResolvedValue(SUPER);
    (getTenantById as unknown as Mock).mockResolvedValue(null);
    const res = await call('nope');
    expect(res.status).toBe(404);
  });

  it('answers isAgency: false for a Standard tenant — honest, not an error, and no engines run', async () => {
    mockSession.mockResolvedValue(SUPER);
    (getTenantById as unknown as Mock).mockResolvedValue({ ...agencyTenant('t1', 'Standard Co'), appMode: 'Standard' });
    const res = await call('t1');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isAgency).toBe(false);
    expect(body.tenant.name).toBe('Standard Co');
    expect(countActiveClients).not.toHaveBeenCalled();
    expect(getPortfolioProfitability).not.toHaveBeenCalled();
  });

  it('assembles the agency snapshot from the SAME engines the tenant dashboard reads', async () => {
    mockSession.mockResolvedValue(SUPER);
    (getTenantById as unknown as Mock).mockResolvedValue(agencyTenant('t1', 'Acme Agency'));
    (countActiveClients as unknown as Mock).mockResolvedValue(3);
    (getProjectPortfolioMetrics as unknown as Mock).mockResolvedValue({
      activeProjects: 2, contractedRevenue: 500000, plannedMargin: 40, rows: [],
    });
    (getRateReadinessMetrics as unknown as Mock).mockResolvedValue({
      projectsTotal: 2, projectsReadyForTracking: 1, projectsMissingRates: 1,
      usersWithoutCostRate: 1, usersTotal: 4,
    });
    (getDeliveryHoursMetrics as unknown as Mock).mockResolvedValue({ totalMinutes: 600, billableMinutes: 420 });
    (getReceivablesMetrics as unknown as Mock).mockResolvedValue({
      outstanding: 40000, dueSoon: 0, overdueAmount: 15000, overdueCount: 1,
      currency: 'INR', mixedCurrencies: false,
    });
    (getInvoiceMoneyMetrics as unknown as Mock).mockResolvedValue({
      invoicedRevenue: 100000, collectedRevenue: 60000,
      invoicedCurrency: 'INR', collectedCurrency: 'INR',
      mixedInvoicedCurrencies: false, mixedCollectedCurrencies: false,
    });
    (getPortfolioProfitability as unknown as Mock).mockResolvedValue({
      projects: [], byClient: [],
      summary: {
        projectCount: 2, mixedCurrencies: false,
        contractValue: { amount: 500000, currency: 'INR' },
        applicableRevenue: { amount: 350000, currency: 'INR' },
        deliveryCost: { amount: 200000, currency: 'INR' },
        grossProfit: { amount: 150000, currency: 'INR' },
        marginPercent: 42.9,
        billedAmount: { amount: 100000, currency: 'INR' },
        collectedAmount: { amount: 60000, currency: 'INR' },
        unbilledAmount: { amount: 50000, currency: 'INR' },
      },
    });

    const res = await call('t1');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isAgency).toBe(true);
    expect(body.activeClients).toBe(3);
    expect(body.activeProjects).toBe(2);
    expect(body.hoursLast30d).toBe(10);
    expect(body.billableHoursLast30d).toBe(7);
    expect(body.receivables.outstanding).toBe(40000);
    expect(body.receivables.overdueCount).toBe(1);
    expect(body.money.invoicedRevenue).toBe(100000);
    expect(body.profitability.grossProfit).toBe(150000);
    expect(body.profitability.marginPercent).toBeCloseTo(42.9, 5);
    expect(body.rateReadiness.usersWithoutCostRate).toBe(1);
    // Every engine consulted exactly once, for THIS tenant.
    expect(countActiveClients).toHaveBeenCalledWith('t1');
    expect(getPortfolioProfitability).toHaveBeenCalledWith('t1');
  });

  it('degrades to a pending field when one engine fails — never a 500, never a fake number', async () => {
    mockSession.mockResolvedValue(SUPER);
    (getTenantById as unknown as Mock).mockResolvedValue(agencyTenant('t1', 'Acme Agency'));
    (countActiveClients as unknown as Mock).mockResolvedValue(3);
    (getProjectPortfolioMetrics as unknown as Mock).mockRejectedValue(new Error('boom'));
    (getDeliveryHoursMetrics as unknown as Mock).mockResolvedValue({ totalMinutes: 60, billableMinutes: 60 });
    (getRateReadinessMetrics as unknown as Mock).mockRejectedValue(new Error('boom'));
    (getReceivablesMetrics as unknown as Mock).mockRejectedValue(new Error('boom'));
    (getInvoiceMoneyMetrics as unknown as Mock).mockRejectedValue(new Error('boom'));
    (getPortfolioProfitability as unknown as Mock).mockRejectedValue(new Error('boom'));

    const res = await call('t1');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isAgency).toBe(true);
    expect(body.activeClients).toBe(3);
    expect(body.activeProjects).toBeUndefined();      // pending — source failed
    expect(body.hoursLast30d).toBe(1);                // the healthy source still reports
    expect(body.profitability).toBeUndefined();
  });
});
