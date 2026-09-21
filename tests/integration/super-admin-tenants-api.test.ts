/**
 * /api/super-admin/tenants/[id] — the platform console's single-tenant read and
 * its operator write.
 *
 * Two contracts are pinned here:
 *
 *   1. PRIVILEGE. Anonymous, TENANT_ADMIN and USER sessions are all rejected
 *      with 401 before any resource lookup — the platform scope never leaks to
 *      a tenant session.
 *   2. THE WRITE IS AN ALLOWLIST. The route used to hand the parsed body
 *      straight to updateTenant, which $set it onto the tenant document; a
 *      caller could rename a tenant, rewrite its limits or plant arbitrary
 *      keys. These tests fail if that ever comes back.
 *
 * The read's team section is also pinned against credential leakage:
 * getUsersByTenant returns whole user documents (passwordHash included), so the
 * route projects explicitly and this suite asserts nothing sensitive survives
 * serialization.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, getSessionUser: vi.fn() };
});

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...actual,
    getTenantById: vi.fn(),
    getUsersByTenant: vi.fn(),
    updateTenant: vi.fn(),
    createLog: vi.fn(),
  };
});

import { getSessionUser } from '@/lib/auth';
import { getTenantById, getUsersByTenant, updateTenant, createLog } from '@/lib/db';
import { GET as tenantDetailRoute, PUT as tenantUpdateRoute } from '@/app/api/super-admin/tenants/[id]/route';

const mockSession = vi.mocked(getSessionUser);
const mockGetTenantById = getTenantById as unknown as Mock;
const mockGetUsersByTenant = getUsersByTenant as unknown as Mock;
const mockUpdateTenant = updateTenant as unknown as Mock;
const mockCreateLog = createLog as unknown as Mock;

const SUPER = { userId: 'su1', username: 'superadmin', role: 'SUPER_ADMIN' as const };
const ADMIN = { userId: 'u1', username: 'admin', role: 'TENANT_ADMIN' as const, tenantId: 't1' };
const USER = { userId: 'u2', username: 'member', role: 'USER' as const, tenantId: 't1' };

function requestFor(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3100'), init as ConstructorParameters<typeof NextRequest>[1]);
}

function jsonRequest(method: string, body: unknown): NextRequest {
  return requestFor('/api/super-admin/tenants/t1', {
    method,
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Next 16 dynamic-route context: params is a Promise. */
function ctxFor(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

const TENANT = {
  id: 't1',
  _id: undefined,
  name: 'Webasthetic',
  status: 'ACTIVE' as const,
  plan: 'FREE' as const,
  appMode: 'Standard' as const,
  settings: { appName: 'Webasthetic Books' },
  limits: { maxUsers: 5 },
  attribution: { utm_source: 'producthunt' },
  createdAt: new Date('2026-01-15T00:00:00.000Z'),
};

const USERS = [
  {
    id: 'u1', username: 'admin', passwordHash: '$2a$12$super-secret-hash',
    role: 'TENANT_ADMIN' as const, tenantId: 't1', status: 'ACTIVE' as const,
    createdAt: new Date('2026-01-15T00:00:00.000Z'),
  },
  {
    id: 'u2', username: 'member', passwordHash: '$2a$12$another-secret-hash',
    role: 'USER' as const, tenantId: 't1', status: 'LOCKED' as const,
    createdAt: new Date('2026-02-01T00:00:00.000Z'),
  },
];

beforeEach(() => {
  // mockReset, not clearAllMocks: clearing keeps the previous test's
  // implementation in place and leaks state across cases.
  mockSession.mockReset();
  mockGetTenantById.mockReset();
  mockGetUsersByTenant.mockReset();
  mockUpdateTenant.mockReset();
  mockCreateLog.mockReset();
  mockCreateLog.mockResolvedValue({ id: 'log1' });
});

describe('GET /api/super-admin/tenants/[id] — privilege gate', () => {
  it('401 for an anonymous session, before any lookup', async () => {
    mockSession.mockResolvedValue(null);
    const res = await tenantDetailRoute({} as never, ctxFor('t1'));
    expect(res.status).toBe(401);
    expect(mockGetTenantById).not.toHaveBeenCalled();
    expect(mockGetUsersByTenant).not.toHaveBeenCalled();
  });

  it('401 for a TENANT_ADMIN', async () => {
    mockSession.mockResolvedValue(ADMIN);
    const res = await tenantDetailRoute({} as never, ctxFor('t1'));
    expect(res.status).toBe(401);
    expect(mockGetTenantById).not.toHaveBeenCalled();
  });

  it('401 for a plain USER', async () => {
    mockSession.mockResolvedValue(USER);
    const res = await tenantDetailRoute({} as never, ctxFor('t1'));
    expect(res.status).toBe(401);
  });

  it('404 for an unknown tenant', async () => {
    mockSession.mockResolvedValue(SUPER);
    mockGetTenantById.mockResolvedValue(null);
    const res = await tenantDetailRoute({} as never, ctxFor('missing'));
    expect(res.status).toBe(404);
  });
});

describe('GET /api/super-admin/tenants/[id] — the record', () => {
  beforeEach(() => {
    mockSession.mockResolvedValue(SUPER);
    mockGetTenantById.mockResolvedValue(TENANT);
    mockGetUsersByTenant.mockResolvedValue(USERS);
  });

  it('returns the stored tenant fields and the team counts', async () => {
    const res = await tenantDetailRoute({} as never, ctxFor('t1'));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.tenant).toMatchObject({
      id: 't1',
      name: 'Webasthetic',
      status: 'ACTIVE',
      plan: 'FREE',
      appMode: 'Standard',
      limits: { maxUsers: 5 },
      attribution: { utm_source: 'producthunt' },
    });
    expect(body.team.total).toBe(2);
    expect(body.team.admins).toBe(1);
    expect(body.team.active).toBe(1);
    expect(body.team.members.map((m: { username: string }) => m.username)).toEqual(['admin', 'member']);
  });

  it('never serializes a password hash', async () => {
    const res = await tenantDetailRoute({} as never, ctxFor('t1'));
    const raw = JSON.stringify(await res.json());
    expect(raw).not.toContain('passwordHash');
    expect(raw).not.toContain('secret-hash');
  });

  it("defaults a tenant with no appMode to 'Standard' rather than omitting it", async () => {
    mockGetTenantById.mockResolvedValue({ ...TENANT, appMode: undefined });
    const res = await tenantDetailRoute({} as never, ctxFor('t1'));
    const body = await res.json();
    expect(body.tenant.appMode).toBe('Standard');
  });

  it('reports no attribution as null, not as an empty object that reads like data', async () => {
    mockGetTenantById.mockResolvedValue({ ...TENANT, attribution: undefined });
    const res = await tenantDetailRoute({} as never, ctxFor('t1'));
    const body = await res.json();
    expect(body.tenant.attribution).toBeNull();
  });
});

describe('PUT /api/super-admin/tenants/[id] — privilege gate', () => {
  it('401 for anonymous, and nothing is written', async () => {
    mockSession.mockResolvedValue(null);
    const res = await tenantUpdateRoute(jsonRequest('PUT', { status: 'SUSPENDED' }), ctxFor('t1'));
    expect(res.status).toBe(401);
    expect(mockUpdateTenant).not.toHaveBeenCalled();
  });

  it('401 for a TENANT_ADMIN, and nothing is written', async () => {
    mockSession.mockResolvedValue(ADMIN);
    const res = await tenantUpdateRoute(jsonRequest('PUT', { status: 'SUSPENDED' }), ctxFor('t1'));
    expect(res.status).toBe(401);
    expect(mockUpdateTenant).not.toHaveBeenCalled();
  });

  it('401 for a plain USER', async () => {
    mockSession.mockResolvedValue(USER);
    const res = await tenantUpdateRoute(jsonRequest('PUT', { status: 'SUSPENDED' }), ctxFor('t1'));
    expect(res.status).toBe(401);
    expect(mockUpdateTenant).not.toHaveBeenCalled();
  });
});

describe('PUT /api/super-admin/tenants/[id] — the accepted changes', () => {
  beforeEach(() => {
    mockSession.mockResolvedValue(SUPER);
    mockUpdateTenant.mockResolvedValue(true);
  });

  it('suspends a tenant and writes an audit entry', async () => {
    const res = await tenantUpdateRoute(jsonRequest('PUT', { status: 'SUSPENDED' }), ctxFor('t1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, applied: { status: 'SUSPENDED' } });
    expect(mockUpdateTenant).toHaveBeenCalledWith('t1', { status: 'SUSPENDED' });
    expect(mockCreateLog).toHaveBeenCalledWith(
      'superadmin',
      'Update Tenant',
      expect.stringContaining('SUSPENDED')
    );
  });

  it('changes a plan', async () => {
    const res = await tenantUpdateRoute(jsonRequest('PUT', { plan: 'ENTERPRISE' }), ctxFor('t1'));
    expect(res.status).toBe(200);
    expect(mockUpdateTenant).toHaveBeenCalledWith('t1', { plan: 'ENTERPRISE' });
  });

  it('accepts both fields together', async () => {
    const res = await tenantUpdateRoute(jsonRequest('PUT', { status: 'ACTIVE', plan: 'STARTER' }), ctxFor('t1'));
    expect(res.status).toBe(200);
    expect(mockUpdateTenant).toHaveBeenCalledWith('t1', { status: 'ACTIVE', plan: 'STARTER' });
  });

  it('passes ONLY whitelisted keys through — a smuggled field is dropped, not written', async () => {
    const res = await tenantUpdateRoute(
      jsonRequest('PUT', {
        status: 'SUSPENDED',
        name: 'Renamed By Attacker',
        limits: { maxUsers: 9999 },
        settings: { appName: 'pwned' },
        _id: 'other-tenant',
        evil: true,
      }),
      ctxFor('t1')
    );
    expect(res.status).toBe(200);
    expect(mockUpdateTenant).toHaveBeenCalledTimes(1);
    expect(mockUpdateTenant).toHaveBeenCalledWith('t1', { status: 'SUSPENDED' });
  });
});

describe('PUT /api/super-admin/tenants/[id] — rejected requests', () => {
  beforeEach(() => {
    mockSession.mockResolvedValue(SUPER);
    mockUpdateTenant.mockResolvedValue(true);
  });

  it('400 on an unknown status value', async () => {
    const res = await tenantUpdateRoute(jsonRequest('PUT', { status: 'DELETED' }), ctxFor('t1'));
    expect(res.status).toBe(400);
    expect(mockUpdateTenant).not.toHaveBeenCalled();
  });

  it('400 on an unknown plan value', async () => {
    const res = await tenantUpdateRoute(jsonRequest('PUT', { plan: 'GOLD' }), ctxFor('t1'));
    expect(res.status).toBe(400);
    expect(mockUpdateTenant).not.toHaveBeenCalled();
  });

  it('400 when the body carries no recognized field — a silent no-op must not read as success', async () => {
    const res = await tenantUpdateRoute(jsonRequest('PUT', { nickname: 'nope' }), ctxFor('t1'));
    expect(res.status).toBe(400);
    expect(mockUpdateTenant).not.toHaveBeenCalled();
  });

  it('400 on an empty body', async () => {
    const res = await tenantUpdateRoute(jsonRequest('PUT', {}), ctxFor('t1'));
    expect(res.status).toBe(400);
    expect(mockUpdateTenant).not.toHaveBeenCalled();
  });

  it('400 on malformed JSON', async () => {
    const res = await tenantUpdateRoute(jsonRequest('PUT', '{not json'), ctxFor('t1'));
    expect(res.status).toBe(400);
    expect(mockUpdateTenant).not.toHaveBeenCalled();
  });

  it('400 when the tenant does not exist (updateTenant matched nothing)', async () => {
    mockUpdateTenant.mockResolvedValue(false);
    const res = await tenantUpdateRoute(jsonRequest('PUT', { status: 'SUSPENDED' }), ctxFor('missing'));
    expect(res.status).toBe(400);
    expect(mockCreateLog).not.toHaveBeenCalled();
  });
});
