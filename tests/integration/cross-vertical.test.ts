/**
 * Module 1.27 — Cross-vertical regression.
 *
 * Money OS ships three verticals. After Module 1, ALL of them must keep
 * working: the Agency vertical must not have leaked appMode checks, changed
 * the vertical registry, or altered the fallback behavior that existing
 * Standard and Student_Club tenants depend on.
 *
 *   Standard dashboard    — unchanged
 *   Student Club vertical — unchanged
 *   Agency dashboard      — available
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tenant } from '@/lib/db';

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
import { GET as getAgencyDashboard } from '@/app/api/agency/dashboard/route';
import {
  resolveVertical,
  verticalHasCapability,
  tenantHasCapability,
  VERTICAL_CAPABILITIES,
} from '@/lib/agency/types/vertical';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { NextRequest } from 'next/server';

const mockSession = vi.mocked(getSessionUser);
const mockTenant = vi.mocked(getTenantById);

function tenantFor(appMode: Tenant['appMode']): Tenant {
  return {
    id: `t-${appMode ?? 'legacy'}`, name: 'Regression Tenant', status: 'ACTIVE', plan: 'FREE',
    settings: {}, limits: { maxUsers: 5 }, appMode,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function sessionFor(tenant: Tenant) {
  return {
    userId: `u-${tenant.id}`, username: 'regression', role: 'TENANT_ADMIN' as const,
    tenantId: tenant.id!,
  };
}

beforeEach(() => {
  mockSession.mockReset();
  mockTenant.mockReset();
});

describe('Module 1.27 — the vertical registry is unchanged', () => {
  it('resolveVertical maps the three appMode values exactly', () => {
    expect(resolveVertical('Standard')).toBe('Standard');
    expect(resolveVertical('Student_Club')).toBe('Student_Club');
    expect(resolveVertical('Agency')).toBe('Agency');
  });

  it('legacy/unknown appMode still falls back to Standard (old tenants keep their behavior)', () => {
    expect(resolveVertical(undefined)).toBe('Standard');
    expect(resolveVertical('Something_New')).toBe('Standard');
    expect(resolveVertical(null)).toBe('Standard');
  });

  it('Standard and Student_Club expose NO agency capabilities', () => {
    expect(VERTICAL_CAPABILITIES.Standard).toEqual([]);
    expect(VERTICAL_CAPABILITIES.Student_Club).toEqual([]);
    expect(verticalHasCapability('Standard', 'AGENCY_DASHBOARD')).toBe(false);
    expect(verticalHasCapability('Student_Club', 'AGENCY_DASHBOARD')).toBe(false);
  });

  it('Agency exposes the Agency dashboard capability', () => {
    expect(verticalHasCapability('Agency', 'AGENCY_DASHBOARD')).toBe(true);
  });

  it('tenantHasCapability drives the UI gate for each vertical', () => {
    expect(tenantHasCapability({ appMode: 'Standard' }, 'AGENCY_DASHBOARD')).toBe(false);
    expect(tenantHasCapability({ appMode: 'Student_Club' }, 'AGENCY_DASHBOARD')).toBe(false);
    expect(tenantHasCapability({ appMode: 'Agency' }, 'AGENCY_DASHBOARD')).toBe(true);
    // missing appMode (pre-Module-1 tenants) → Standard behavior
    expect(tenantHasCapability({}, 'AGENCY_DASHBOARD')).toBe(false);
    expect(tenantHasCapability(null, 'AGENCY_DASHBOARD')).toBe(false);
  });
});

describe('Module 1.27 — Standard tenant dashboard unchanged', () => {
  it('a Standard tenant still passes its own vertical resolution (no agency leakage)', async () => {
    const tenant = tenantFor('Standard');
    mockSession.mockResolvedValue(sessionFor(tenant));
    mockTenant.mockResolvedValue(tenant);
    // The standard dashboard data path does not go through the agency gate;
    // the agency gate must cleanly decline (application response, not 500).
    const res = await getAgencyDashboard(
      new NextRequest(new URL('/api/agency/dashboard', 'http://localhost:3100'))
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('NOT_AGENCY_TENANT');
    expect(body.redirectTo).toBe('/dashboard'); // routed home, never an auth error
  });

  it('the vertical context still resolves for Standard tenants on shared paths', async () => {
    const tenant = tenantFor('Standard');
    mockSession.mockResolvedValue(sessionFor(tenant));
    mockTenant.mockResolvedValue(tenant);
    const gate = await requireAgencyPermission('agency.dashboard.read');
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.status).toBe(403);
      expect(gate.code).toBe('NOT_AGENCY_TENANT');
    }
  });
});

describe('Module 1.27 — Student Club vertical unchanged', () => {
  it('a Student_Club tenant resolves to its own vertical, not Standard and not Agency', () => {
    expect(resolveVertical('Student_Club')).toBe('Student_Club');
  });

  it('a Student_Club tenant is declined by the agency gate with the application response', async () => {
    const tenant = tenantFor('Student_Club');
    mockSession.mockResolvedValue(sessionFor(tenant));
    mockTenant.mockResolvedValue(tenant);
    const res = await getAgencyDashboard(
      new NextRequest(new URL('/api/agency/dashboard', 'http://localhost:3100'))
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('NOT_AGENCY_TENANT');
    expect(body.redirectTo).toBe('/dashboard');
  });
});

describe('Module 1.27 — Agency dashboard available', () => {
  it('an Agency tenant reaches the dashboard with the full grouped contract', async () => {
    const tenant = tenantFor('Agency');
    mockSession.mockResolvedValue(sessionFor(tenant));
    mockTenant.mockResolvedValue(tenant);
    const res = await getAgencyDashboard(
      new NextRequest(new URL('/api/agency/dashboard?period=THIS_MONTH', 'http://localhost:3100'))
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.period).toBeDefined();
    expect(body.data.financial).toBeDefined();
    expect(body.data.projects).toEqual([]);
  });
});
