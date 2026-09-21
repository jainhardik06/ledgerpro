/**
 * Module 11 (Sprints 11.1–11.3 / §29) — Integration: Agency Tax API.
 *
 * Runs the REAL route handlers with only the session/tenant/repository edges
 * mocked — the full pipeline executes between them:
 *   authenticate → resolve tenant → verify Agency capability → authorize
 *   (agency.tax.manage is admin-only; reads ride agency.dashboard.read) →
 *   validate → operate → audit → respond.
 *
 * Matrix:
 *   Integration — billing profile GET (honest null) / PATCH (merge-patch),
 *                 tax profile list (filters) / create / partial update
 *   Security    — USER 403 on writes but 200 on reads, Standard tenant 403
 *                 (NOT_AGENCY_TENANT), §113 identical-404 for a foreign
 *                 tenant's tax profile, GSTIN §30 shape enforcement at the
 *                 API boundary
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TokenPayload } from '@/lib/auth';
import type { Tenant } from '@/lib/db';
import type { TaxProfile } from '@/lib/agency/types/tax';
import { AGENCY_A, STANDARD_TENANT } from '../fixtures/agency-fixtures';

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, getSessionUser: vi.fn() };
});

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...actual,
    getTenantById: vi.fn(),
    updateTenant: vi.fn(),
    getTaxProfiles: vi.fn(),
    getTaxProfileById: vi.fn(),
    createTaxProfile: vi.fn(),
    updateTaxProfile: vi.fn(),
    createLog: vi.fn(),
    // imported by agency.clients (AuditContext/DomainResult home) — same module
    createClient: vi.fn(), getClients: vi.fn(), updateClient: vi.fn(),
    searchClients: vi.fn(), findClientByName: vi.fn(), getLogs: vi.fn(),
    getClientById: vi.fn(), getUserById: vi.fn(),
  };
});

import { getSessionUser } from '@/lib/auth';
import {
  getTenantById, updateTenant, createLog,
  getTaxProfiles, getTaxProfileById, createTaxProfile, updateTaxProfile,
} from '@/lib/db';
import { GET as getBillingProfile, PATCH as patchBillingProfile } from '@/app/api/agency/billing-profile/route';
import { GET as listProfiles, POST as createProfileRoute } from '@/app/api/agency/tax/profiles/route';
import { PATCH as patchProfile } from '@/app/api/agency/tax/profiles/[id]/route';
import { NextRequest } from 'next/server';

const mockSession = vi.mocked(getSessionUser);
const mockGetTenant = vi.mocked(getTenantById);
const mockUpdateTenant = vi.mocked(updateTenant);
const mockCreateLog = vi.mocked(createLog);
const mockGetTaxProfiles = vi.mocked(getTaxProfiles);
const mockGetTaxProfileById = vi.mocked(getTaxProfileById);
const mockCreateTaxProfile = vi.mocked(createTaxProfile);
const mockUpdateTaxProfile = vi.mocked(updateTaxProfile);

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

function tenantFor(tenantId: string, overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: tenantId, name: `Tenant ${tenantId}`, status: 'ACTIVE', plan: 'FREE',
    settings: {}, limits: { maxUsers: 5 }, appMode: 'Agency',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function profileFor(tenantId: string, overrides: Partial<TaxProfile> = {}): TaxProfile {
  return {
    id: 'tax-profile-1',
    tenantId,
    name: 'GST Registered — Maharashtra',
    country: 'IN',
    registrationType: 'GSTIN',
    registrationNumber: '27AAPFU0939F1ZV',
    taxTreatment: 'REGISTERED',
    stateOrRegion: 'Maharashtra',
    active: true,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    ...overrides,
  };
}

/** Stand up the session + tenant chain for one tenant (admin by default). */
function arrange(
  tenantId: string,
  appMode: Tenant['appMode'] = 'Agency',
  role: TokenPayload['role'] = 'TENANT_ADMIN',
  userId?: string
) {
  const session: TokenPayload = {
    userId: userId ?? `u-${tenantId}`, username: 'tester', role, tenantId,
  };
  mockSession.mockResolvedValue(session);
  mockGetTenant.mockResolvedValue(tenantFor(tenantId, { appMode }));
  return session;
}

beforeEach(() => {
  for (const m of [
    mockSession, mockGetTenant, mockUpdateTenant, mockCreateLog,
    mockGetTaxProfiles, mockGetTaxProfileById, mockCreateTaxProfile, mockUpdateTaxProfile,
  ]) m.mockReset();
  mockCreateLog.mockResolvedValue({} as Awaited<ReturnType<typeof createLog>>);
  mockUpdateTenant.mockResolvedValue(true);
});

// ---------- §7 — billing profile ----------

describe('Module 11 — billing profile API (§29 GET/PATCH /api/agency/billing-profile)', () => {
  it('GET returns an honest null before the agency configures a profile', async () => {
    arrange(AGENCY_A.tenant.id);
    const res = await getBillingProfile();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.billingProfile).toBeNull();
  });

  it('GET returns the stored profile from the tenant', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetTenant.mockResolvedValue(tenantFor(AGENCY_A.tenant.id, {
      billingProfile: { legalName: 'Atlas Digital Private Limited', country: 'IN' },
    }));
    const res = await getBillingProfile();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.billingProfile.legalName).toBe('Atlas Digital Private Limited');
  });

  it('PATCH creates the profile with the required legalName and audits it', async () => {
    const session = arrange(AGENCY_A.tenant.id);
    const res = await patchBillingProfile(jsonRequest('/api/agency/billing-profile', 'PATCH', {
      legalName: 'Atlas Digital Private Limited',
      country: 'IN',
      state: 'Maharashtra',
      taxIdentifiers: [{ type: 'GSTIN', value: '27AAPFU0939F1ZV' }],
    }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.billingProfile.legalName).toBe('Atlas Digital Private Limited');

    const [tenantIdArg, updateArg] = mockUpdateTenant.mock.calls[0]!;
    expect(tenantIdArg).toBe(AGENCY_A.tenant.id);
    expect(updateArg.billingProfile!.legalName).toBe('Atlas Digital Private Limited');
    expect(updateArg.billingProfile!.taxIdentifiers).toEqual([{ type: 'GSTIN', value: '27AAPFU0939F1ZV' }]);
    expect(mockCreateLog).toHaveBeenCalledWith(
      session.username, 'BILLING_PROFILE_UPDATED', expect.any(String), AGENCY_A.tenant.id, expect.anything()
    );
  });

  it('PATCH merges against the stored profile — a partial update keeps legalName', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetTenant.mockResolvedValue(tenantFor(AGENCY_A.tenant.id, {
      billingProfile: { legalName: 'Atlas Digital Private Limited', country: 'IN', state: 'Maharashtra' },
    }));
    const res = await patchBillingProfile(jsonRequest('/api/agency/billing-profile', 'PATCH', {
      state: 'Karnataka',
    }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.billingProfile.legalName).toBe('Atlas Digital Private Limited'); // merge kept it
    expect(body.billingProfile.state).toBe('Karnataka');
    expect(mockUpdateTenant.mock.calls[0]![1].billingProfile!.legalName).toBe('Atlas Digital Private Limited');
  });

  it('PATCH without a legalName on an empty profile is a 400 — no anonymous issuer', async () => {
    arrange(AGENCY_A.tenant.id);
    const res = await patchBillingProfile(jsonRequest('/api/agency/billing-profile', 'PATCH', {
      country: 'IN',
    }));
    expect(res.status).toBe(400);
    expect(mockUpdateTenant).not.toHaveBeenCalled();
  });

  it('a malformed GSTIN identifier is rejected at the API boundary (§30)', async () => {
    arrange(AGENCY_A.tenant.id);
    const res = await patchBillingProfile(jsonRequest('/api/agency/billing-profile', 'PATCH', {
      legalName: 'Atlas Digital Private Limited',
      taxIdentifiers: [{ type: 'GSTIN', value: '27AAPFU0939F1Z' }],
    }));
    expect(res.status).toBe(400);
    expect(mockUpdateTenant).not.toHaveBeenCalled();
  });

  it('USER may read the billing profile but never write it', async () => {
    arrange(AGENCY_A.tenant.id, 'Agency', 'USER', AGENCY_A.member.userId);
    const read = await getBillingProfile();
    expect(read.status).toBe(200);

    const write = await patchBillingProfile(jsonRequest('/api/agency/billing-profile', 'PATCH', {
      legalName: 'Should Not Work',
    }));
    expect(write.status).toBe(403);
    expect(mockUpdateTenant).not.toHaveBeenCalled();
  });

  it('a Standard tenant is turned away with NOT_AGENCY_TENANT', async () => {
    arrange(STANDARD_TENANT.tenant.id, 'Standard');
    const read = await getBillingProfile();
    expect(read.status).toBe(403);
    const body = await read.json();
    expect(body.code).toBe('NOT_AGENCY_TENANT');
  });
});

// ---------- §6 — tenant tax profiles ----------

describe('Module 11 — tax profiles API (§29 GET/POST /api/agency/tax/profiles)', () => {
  it('GET lists the tenant profiles with parsed filters', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetTaxProfiles.mockResolvedValue([profileFor(AGENCY_A.tenant.id)]);
    const res = await listProfiles(requestFor('/api/agency/tax/profiles?active=true&taxTreatment=REGISTERED'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.profiles).toHaveLength(1);
    expect(body.profiles[0].taxTreatment).toBe('REGISTERED');
    expect(mockGetTaxProfiles).toHaveBeenCalledWith(AGENCY_A.tenant.id, { active: true, taxTreatment: 'REGISTERED' });
  });

  it('POST creates a validated profile and audits TAX_PROFILE_CREATED', async () => {
    const session = arrange(AGENCY_A.tenant.id);
    mockCreateTaxProfile.mockResolvedValue(profileFor(AGENCY_A.tenant.id));
    const res = await createProfileRoute(jsonRequest('/api/agency/tax/profiles', 'POST', {
      name: 'GST Registered — Maharashtra',
      country: 'IN',
      taxTreatment: 'REGISTERED',
      registrationType: 'GSTIN',
      registrationNumber: '27AAPFU0939F1ZV',
      stateOrRegion: 'Maharashtra',
    }));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(mockCreateTaxProfile).toHaveBeenCalledWith(AGENCY_A.tenant.id, expect.objectContaining({
      name: 'GST Registered — Maharashtra',
      country: 'IN',
      taxTreatment: 'REGISTERED',
      registrationNumber: '27AAPFU0939F1ZV',
    }));
    expect(mockCreateLog).toHaveBeenCalledWith(
      session.username, 'TAX_PROFILE_CREATED', expect.any(String), AGENCY_A.tenant.id, expect.anything()
    );
  });

  it('POST rejects an unknown taxTreatment (the vocabulary is closed)', async () => {
    arrange(AGENCY_A.tenant.id);
    const res = await createProfileRoute(jsonRequest('/api/agency/tax/profiles', 'POST', {
      name: 'Bad', country: 'IN', taxTreatment: 'ZERO_RATED',
    }));
    expect(res.status).toBe(400);
    expect(mockCreateTaxProfile).not.toHaveBeenCalled();
  });

  it('POST rejects a malformed GSTIN registration number (§30 shape)', async () => {
    arrange(AGENCY_A.tenant.id);
    const res = await createProfileRoute(jsonRequest('/api/agency/tax/profiles', 'POST', {
      name: 'Bad GSTIN', country: 'IN', taxTreatment: 'REGISTERED',
      registrationType: 'GSTIN', registrationNumber: '27AAPFU0939F1Z',
    }));
    expect(res.status).toBe(400);
    expect(mockCreateTaxProfile).not.toHaveBeenCalled();
  });

  it('POST is admin-only (agency.tax.manage)', async () => {
    arrange(AGENCY_A.tenant.id, 'Agency', 'USER', AGENCY_A.member.userId);
    const res = await createProfileRoute(jsonRequest('/api/agency/tax/profiles', 'POST', {
      name: 'Nope', country: 'IN', taxTreatment: 'EXEMPT',
    }));
    expect(res.status).toBe(403);
    expect(mockCreateTaxProfile).not.toHaveBeenCalled();
  });
});

describe('Module 11 — tax profile update (PATCH /api/agency/tax/profiles/:id)', () => {
  it('partially updates and returns the re-read profile', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetTaxProfileById
      .mockResolvedValueOnce(profileFor(AGENCY_A.tenant.id))
      .mockResolvedValueOnce(profileFor(AGENCY_A.tenant.id, { active: false }));
    mockUpdateTaxProfile.mockResolvedValue(true);

    const res = await patchProfile(
      jsonRequest('/api/agency/tax/profiles/tax-profile-1', 'PATCH', { active: false }),
      ctxFor('tax-profile-1')
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.profile.active).toBe(false);
    expect(mockUpdateTaxProfile).toHaveBeenCalledWith('tax-profile-1', AGENCY_A.tenant.id, { active: false });
  });

  it('a missing profile and another tenant\'s profile are IDENTICAL 404s (§113)', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetTaxProfileById.mockResolvedValue(null); // B's id resolves null through A's tenant scope
    const res = await patchProfile(
      jsonRequest('/api/agency/tax/profiles/b-profile', 'PATCH', { active: false }),
      ctxFor('b-profile')
    );
    expect(res.status).toBe(404);
    expect(mockUpdateTaxProfile).not.toHaveBeenCalled();
  });

  it('an empty payload is an honest 400, never a phantom no-op write', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetTaxProfileById.mockResolvedValue(profileFor(AGENCY_A.tenant.id));
    const res = await patchProfile(
      jsonRequest('/api/agency/tax/profiles/tax-profile-1', 'PATCH', {}),
      ctxFor('tax-profile-1')
    );
    expect(res.status).toBe(400);
    expect(mockUpdateTaxProfile).not.toHaveBeenCalled();
  });
});
