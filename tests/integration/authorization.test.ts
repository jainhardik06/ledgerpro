/**
 * Module 1.26 — Integration: authorization (Module 1.18 chain).
 *
 *   Request → Session → Tenant → Agency Mode Check → Permission Check → Query
 *
 * Only the outermost edges are mocked (getSessionUser / getTenantById); the
 * ENTIRE chain between them runs for real — resolveVerticalContext, the
 * vertical gate, can(), and requireAgencyPermission.
 *
 * Rejection semantics under test:
 *   401 unauthenticated
 *   403 WORKSPACE_NOT_FOUND / WORKSPACE_SUSPENDED
 *   403 NOT_AGENCY_TENANT (application response: code + redirectTo)
 *   403 wrong permission
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TokenPayload } from '@/lib/auth';
import type { Tenant } from '@/lib/db';
import { AGENCY_A } from '../fixtures/agency-fixtures';

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
import { can } from '@/lib/agency/permissions/authorization';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';

const mockSession = vi.mocked(getSessionUser);
const mockTenant = vi.mocked(getTenantById);

function sessionFor(tenantId: string, role: TokenPayload['role'] = 'TENANT_ADMIN'): TokenPayload {
  return { userId: `u-${tenantId}`, username: 'tester', role, tenantId };
}

function tenantFor(tenantId: string, appMode: Tenant['appMode'], status: Tenant['status'] = 'ACTIVE'): Tenant {
  return {
    id: tenantId, name: `Tenant ${tenantId}`, status, plan: 'FREE',
    settings: {}, limits: { maxUsers: 5 }, appMode,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
}

beforeEach(() => {
  mockSession.mockReset();
  mockTenant.mockReset();
});

describe('Module 1.26 integration — Session gate', () => {
  it('no session → 401 unauthenticated', async () => {
    mockSession.mockResolvedValue(null);
    const gate = await requireAgencyPermission('agency.dashboard.read');
    expect(gate).toEqual({ ok: false, status: 401, error: 'Authentication required' });
  });

  it('session without a tenantId in the verified JWT → 401', async () => {
    mockSession.mockResolvedValue({ userId: 'u1', username: 't', role: 'TENANT_ADMIN' });
    const gate = await requireAgencyPermission('agency.dashboard.read');
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.status).toBe(401);
  });
});

describe('Module 1.26 integration — Tenant gate', () => {
  it('tenant record missing → 403 WORKSPACE_NOT_FOUND', async () => {
    mockSession.mockResolvedValue(sessionFor(AGENCY_A.tenant.id));
    mockTenant.mockResolvedValue(null);
    const gate = await requireAgencyPermission('agency.dashboard.read');
    expect(gate).toEqual({
      ok: false, status: 403, error: 'Workspace not found', code: 'WORKSPACE_NOT_FOUND',
    });
  });

  it('suspended tenant → 403 WORKSPACE_SUSPENDED', async () => {
    mockSession.mockResolvedValue(sessionFor(AGENCY_A.tenant.id));
    mockTenant.mockResolvedValue(tenantFor(AGENCY_A.tenant.id, 'Agency', 'SUSPENDED'));
    const gate = await requireAgencyPermission('agency.dashboard.read');
    expect(gate).toEqual({
      ok: false, status: 403, error: 'Workspace is suspended', code: 'WORKSPACE_SUSPENDED',
    });
  });

  it('tenant is always resolved from the SESSION tenantId — the request can never name a tenant', async () => {
    mockSession.mockResolvedValue(sessionFor(AGENCY_A.tenant.id));
    mockTenant.mockResolvedValue(tenantFor(AGENCY_A.tenant.id, 'Agency'));
    await requireAgencyPermission('agency.dashboard.read');
    expect(mockTenant).toHaveBeenCalledWith(AGENCY_A.tenant.id);
  });
});

describe('Module 1.26 integration — Agency Mode gate (non-agency = application response)', () => {
  it('Standard tenant → 403 with code NOT_AGENCY_TENANT + redirectTo /dashboard', async () => {
    mockSession.mockResolvedValue(sessionFor('c-tenant'));
    mockTenant.mockResolvedValue(tenantFor('c-tenant', 'Standard'));
    const gate = await requireAgencyPermission('agency.dashboard.read');
    expect(gate).toEqual({
      ok: false, status: 403,
      error: 'This feature requires the Agency workspace mode',
      code: 'NOT_AGENCY_TENANT', redirectTo: '/dashboard',
    });
  });

  it('Student_Club tenant → same application response (Module 1.27 regression surface)', async () => {
    mockSession.mockResolvedValue(sessionFor('club-tenant'));
    mockTenant.mockResolvedValue(tenantFor('club-tenant', 'Student_Club'));
    const gate = await requireAgencyPermission('agency.dashboard.read');
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.status).toBe(403);
      expect(gate.code).toBe('NOT_AGENCY_TENANT');
    }
  });

  it('a tenant with a legacy/unknown appMode falls back to Standard behavior → NOT_AGENCY_TENANT', async () => {
    mockSession.mockResolvedValue(sessionFor('legacy-tenant'));
    mockTenant.mockResolvedValue(tenantFor('legacy-tenant', undefined));
    const gate = await requireAgencyPermission('agency.dashboard.read');
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.code).toBe('NOT_AGENCY_TENANT');
  });
});

describe('Module 1.26 integration — Permission gate', () => {
  beforeEach(() => {
    mockSession.mockResolvedValue(sessionFor(AGENCY_A.tenant.id));
    mockTenant.mockResolvedValue(tenantFor(AGENCY_A.tenant.id, 'Agency'));
  });

  it('TENANT_ADMIN of an agency tenant passes the full chain', async () => {
    const gate = await requireAgencyPermission('agency.dashboard.read');
    expect(gate.ok).toBe(true);
    if (gate.ok) {
      expect(gate.context.tenant.id).toBe(AGENCY_A.tenant.id);
      expect(gate.context.vertical).toBe('Agency');
    }
  });

  it('USER of an agency tenant may read the dashboard (Module 1 decision)', async () => {
    mockSession.mockResolvedValue(sessionFor(AGENCY_A.tenant.id, 'USER'));
    const gate = await requireAgencyPermission('agency.dashboard.read');
    expect(gate.ok).toBe(true);
  });

  it('SUPER_ADMIN passes (impersonation carries the target tenantId)', async () => {
    mockSession.mockResolvedValue(sessionFor(AGENCY_A.tenant.id, 'SUPER_ADMIN'));
    const gate = await requireAgencyPermission('agency.dashboard.read');
    expect(gate.ok).toBe(true);
  });

  it('a capability with no rule entry → denied 403 (deny by default)', async () => {
    // 'PROJECTS' has no permission rule yet — deny, never accidentally allow.
    const gate = await requireAgencyPermission('PROJECTS' as never);
    expect(gate).toEqual({
      ok: false, status: 403, error: 'You do not have permission to perform this action',
    });
  });
});

describe('Module 1.26 integration — can() primitive', () => {
  it('null or malformed user → false', () => {
    expect(can(null, 'agency.dashboard.read')).toBe(false);
    expect(can(undefined, 'agency.dashboard.read')).toBe(false);
    expect(can({ userId: '', role: 'TENANT_ADMIN', tenantId: 't1' }, 'agency.dashboard.read')).toBe(false);
  });

  it('same-tenant resource → allowed', () => {
    const user = { userId: 'u1', role: 'TENANT_ADMIN' as const, tenantId: 't1' };
    expect(can(user, 'agency.dashboard.read', { tenantId: 't1' })).toBe(true);
  });

  it('cross-tenant resource → ALWAYS false, regardless of role', () => {
    // covered further in security.test.ts with the A/B fixtures
    const user = { userId: 'u1', role: 'SUPER_ADMIN' as const, tenantId: 't1' };
    expect(can(user, 'agency.dashboard.read', { tenantId: 't2' })).toBe(false);
  });
});
