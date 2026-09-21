/**
 * Module 1.26 — Security: tenant isolation + vertical boundary.
 *
 * PRD §102 with the Step 0.16 fixtures: Agency Tenant A must not see
 * Agency Tenant B's anything, and a Standard tenant must not be able to
 * invoke the Agency dashboard. These tests run the REAL API route handler
 * (GET /api/agency/dashboard) with only the session/tenant edges mocked —
 * the whole Module 1.18 chain executes between them.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TokenPayload } from '@/lib/auth';
import type { Tenant } from '@/lib/db';
import { AGENCY_A, AGENCY_B, STANDARD_TENANT } from '../fixtures/agency-fixtures';

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, getSessionUser: vi.fn() };
});

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return { ...actual, getTenantById: vi.fn() };
});

import { getSessionUser } from '@/lib/auth';
import { getTenantById } from '@/lib/db';
import { GET } from '@/app/api/agency/dashboard/route';
import { NextRequest } from 'next/server';

const mockSession = vi.mocked(getSessionUser);
const mockTenant = vi.mocked(getTenantById);

function requestFor(url: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3100'));
}

beforeEach(() => {
  mockSession.mockReset();
  mockTenant.mockReset();
});

/** Stand up the full happy-path chain for one tenant. */
function arrangeAgency(tenantId: string, appMode: Tenant['appMode'] = 'Agency') {
  const session: TokenPayload = {
    userId: `u-${tenantId}`, username: 'tester', role: 'TENANT_ADMIN', tenantId,
  };
  const tenant: Tenant = {
    id: tenantId, name: `Tenant ${tenantId}`, status: 'ACTIVE', plan: 'FREE',
    settings: {}, limits: { maxUsers: 5 }, appMode,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
  mockSession.mockResolvedValue(session);
  mockTenant.mockResolvedValue(tenant);
}

describe('Module 1.26 security — Agency Tenant A cannot see Agency Tenant B', () => {
  it("A's session only ever resolves A's tenant — a tenantId in the URL is ignored", async () => {
    arrangeAgency(AGENCY_A.tenant.id);
    // A probe trying to name B's tenant in the query string
    const res = await GET(requestFor(
      `/api/agency/dashboard?period=THIS_MONTH&tenantId=${AGENCY_B.tenant.id}`
    ));
    expect(res.status).toBe(200);
    // The tenant came from the VERIFIED JWT (A), never from the request.
    // (Module 17 §44: the rate-readiness engine also resolves the tenant
    // for its agency-timezone date anchor — so EVERY call must name A.)
    expect(mockTenant.mock.calls.length).toBeGreaterThan(0);
    expect(mockTenant).toHaveBeenCalledWith(AGENCY_A.tenant.id);
    for (const [resolvedId] of mockTenant.mock.calls) {
      expect(resolvedId).toBe(AGENCY_A.tenant.id);
    }
  });

  it("A's dashboard payload never contains B's identifiers", async () => {
    arrangeAgency(AGENCY_A.tenant.id);
    const res = await GET(requestFor('/api/agency/dashboard?period=THIS_MONTH'));
    const body = JSON.stringify(await res.json());
    expect(body).not.toContain(AGENCY_B.tenant.id);
    expect(body).not.toContain(AGENCY_B.client.id);
    expect(body).not.toContain(AGENCY_B.project.id);
  });

  it("B's session independently resolves B's tenant — sessions are the only boundary", async () => {
    arrangeAgency(AGENCY_B.tenant.id);
    const res = await GET(requestFor(
      `/api/agency/dashboard?period=THIS_MONTH&tenantId=${AGENCY_A.tenant.id}`
    ));
    expect(res.status).toBe(200);
    expect(mockTenant).toHaveBeenCalledWith(AGENCY_B.tenant.id);
    expect(mockTenant).not.toHaveBeenCalledWith(AGENCY_A.tenant.id);
  });

  it('no session → 401 before any tenant resolution happens', async () => {
    mockSession.mockResolvedValue(null);
    const res = await GET(requestFor('/api/agency/dashboard'));
    expect(res.status).toBe(401);
    expect(mockTenant).not.toHaveBeenCalled();
  });
});

describe('Module 1.26 security — Standard tenant cannot invoke the Agency dashboard', () => {
  it('Standard tenant → 403 application response with code + redirectTo', async () => {
    arrangeAgency(STANDARD_TENANT.tenant.id, 'Standard');
    const res = await GET(requestFor('/api/agency/dashboard'));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('NOT_AGENCY_TENANT');
    expect(body.redirectTo).toBe('/dashboard');
  });

  it('suspended agency tenant → 403 WORKSPACE_SUSPENDED (status, not vertical)', async () => {
    const session: TokenPayload = {
      userId: 'u-susp', username: 't', role: 'TENANT_ADMIN', tenantId: AGENCY_A.tenant.id,
    };
    mockSession.mockResolvedValue(session);
    mockTenant.mockResolvedValue({
      id: AGENCY_A.tenant.id, name: 'Suspended Agency', status: 'SUSPENDED', plan: 'FREE',
      settings: {}, limits: { maxUsers: 5 }, appMode: 'Agency',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    const res = await GET(requestFor('/api/agency/dashboard'));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('WORKSPACE_SUSPENDED');
  });
});

describe('Module 1.26 security — response hygiene (Module 1.17 contract)', () => {
  it('success: grouped view contract, never a raw MongoDB document', async () => {
    arrangeAgency(AGENCY_A.tenant.id);
    const res = await GET(requestFor('/api/agency/dashboard?period=THIS_MONTH'));
    expect(res.status).toBe(200);

    const raw = await res.text();
    expect(raw).not.toContain('"_id"');
    expect(raw).not.toContain('ObjectId');

    const body = JSON.parse(raw);
    expect(body.success).toBe(true);
    // the Module 1.17 grouped sections
    for (const section of [
      'period', 'dateRange', 'financial', 'delivery', 'profitability',
      'activity', 'receivables', 'projects', 'alerts', 'trends',
    ] as const) {
      expect(body.data, `data.${section}`).toHaveProperty(section);
    }
    expect(body.data.period.timezone).toBe('Asia/Kolkata');
  });

  it('success: carries the Module 1.25 Server-Timing phases', async () => {
    arrangeAgency(AGENCY_A.tenant.id);
    const res = await GET(requestFor('/api/agency/dashboard?period=THIS_MONTH'));
    expect(res.headers.get('server-timing')).toMatch(
      /^auth;dur=\d+, query;dur=\d+, total;dur=\d+$/
    );
  });

  it('rejection: carries the auth phase timing too', async () => {
    mockSession.mockResolvedValue(null);
    const res = await GET(requestFor('/api/agency/dashboard'));
    expect(res.headers.get('server-timing')).toMatch(/^auth;dur=\d+$/);
  });

  it('invalid custom range → 400, no partial data', async () => {
    arrangeAgency(AGENCY_A.tenant.id);
    const res = await GET(requestFor('/api/agency/dashboard?period=CUSTOM&from=2026-09-30&to=2026-09-01'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.data).toBeUndefined();
  });

  it('an unknown period falls back to THIS_MONTH rather than erroring', async () => {
    arrangeAgency(AGENCY_A.tenant.id);
    const res = await GET(requestFor('/api/agency/dashboard?period=NOT_A_PERIOD'));
    expect(res.status).toBe(200);
    const body = await res.json();
    // THIS_MONTH window in Sep 2026 starts on the 1st
    expect(body.data.period.from.endsWith('-01')).toBe(true);
  });
});
