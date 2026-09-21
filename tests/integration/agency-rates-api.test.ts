/**
 * Module 6 (Sprint 6.9 / §100/§104/§119) — Integration: Agency Rates API.
 *
 * Runs the REAL route handlers with only the session/tenant/repository edges
 * mocked — the full pipeline executes between them:
 *   authenticate → resolve tenant → verify Agency capability → authorize
 *   (§98: manage + cost.read are admin-only, billing.read is everyone) →
 *   validate → operate → audit → respond.
 *
 * Matrix:
 *   Integration — card CRUD + archive/restore, entries + §122 versioned rate
 *                 change, user cost assignments (§77/§79/§101), the §94
 *                 resolution endpoint
 *   Security    — §99/§104 cost-rate privacy (USER sees redacted lists, gets
 *                 403 on cost detail/assignments, and may resolve only their
 *                 OWN cost rate), §113 cross-tenant probes (404, identical to
 *                 missing), §98 manage gate (USER cannot write)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TokenPayload } from '@/lib/auth';
import type { Tenant, User } from '@/lib/db';
import type {
  RateCard, RateCardEntry, RateEntryVersion, UserCostAssignment,
} from '@/lib/agency/types/rate';
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
    getClientById: vi.fn(),
    getUserById: vi.fn(),
    getLogs: vi.fn(),
    createLog: vi.fn(),
    getRateCards: vi.fn(),
    getRateCardById: vi.fn(),
    createRateCard: vi.fn(),
    updateRateCard: vi.fn(),
    listRateCardEntries: vi.fn(),
    listAllRateCardEntries: vi.fn(),
    getRateCardEntryById: vi.fn(),
    createRateCardEntry: vi.fn(),
    updateRateCardEntry: vi.fn(),
    createRateEntryVersion: vi.fn(),
    closeRateEntryVersion: vi.fn(),
    listRateEntryVersions: vi.fn(),
    getUserCostAssignments: vi.fn(),
    getUserCostAssignmentById: vi.fn(),
    getUserCostAssignmentsByCard: vi.fn(),
    createUserCostAssignment: vi.fn(),
    updateUserCostAssignment: vi.fn(),
    // imported by agency.clients (AuditContext/DomainResult home) — same module
    createClient: vi.fn(), getClients: vi.fn(), updateClient: vi.fn(),
    searchClients: vi.fn(), findClientByName: vi.fn(),
  };
});

import { getSessionUser } from '@/lib/auth';
import {
  getTenantById, getClientById, getUserById, createLog,
  getRateCards, getRateCardById, createRateCard, updateRateCard,
  listRateCardEntries, listAllRateCardEntries, getRateCardEntryById,
  createRateCardEntry, updateRateCardEntry,
  createRateEntryVersion, closeRateEntryVersion, listRateEntryVersions,
  getUserCostAssignments, getUserCostAssignmentById, getUserCostAssignmentsByCard,
  createUserCostAssignment, updateUserCostAssignment,
} from '@/lib/db';
import { GET as listCards, POST as createCardRoute } from '@/app/api/agency/rate-cards/route';
import { GET as getCard, PATCH as patchCard } from '@/app/api/agency/rate-cards/[id]/route';
import { POST as archiveCard } from '@/app/api/agency/rate-cards/[id]/archive/route';
import { POST as restoreCard } from '@/app/api/agency/rate-cards/[id]/restore/route';
import { GET as listEntries, POST as createEntryRoute } from '@/app/api/agency/rate-cards/[id]/entries/route';
import { PATCH as patchEntry } from '@/app/api/agency/rate-cards/[id]/entries/[entryId]/route';
import { GET as listAssignments, POST as assignRoute } from '@/app/api/agency/users/[userId]/cost-rates/route';
import { PATCH as patchAssignment } from '@/app/api/agency/users/[userId]/cost-rates/[assignmentId]/route';
import { POST as endAssignment } from '@/app/api/agency/users/[userId]/cost-rates/[assignmentId]/end/route';
import { GET as resolveRate } from '@/app/api/agency/rates/resolve/route';
import { NextRequest } from 'next/server';

const mockSession = vi.mocked(getSessionUser);
const mockGetTenant = vi.mocked(getTenantById);
const mockGetClientById = vi.mocked(getClientById);
const mockGetUserById = vi.mocked(getUserById);
const mockCreateLog = vi.mocked(createLog);
const mockGetRateCards = vi.mocked(getRateCards);
const mockGetRateCardById = vi.mocked(getRateCardById);
const mockCreateRateCard = vi.mocked(createRateCard);
const mockUpdateRateCard = vi.mocked(updateRateCard);
const mockListRateCardEntries = vi.mocked(listRateCardEntries);
const mockListAllRateCardEntries = vi.mocked(listAllRateCardEntries);
const mockGetRateCardEntryById = vi.mocked(getRateCardEntryById);
const mockCreateRateCardEntry = vi.mocked(createRateCardEntry);
const mockUpdateRateCardEntry = vi.mocked(updateRateCardEntry);
const mockCreateRateEntryVersion = vi.mocked(createRateEntryVersion);
const mockCloseRateEntryVersion = vi.mocked(closeRateEntryVersion);
const mockListRateEntryVersions = vi.mocked(listRateEntryVersions);
const mockGetUserCostAssignments = vi.mocked(getUserCostAssignments);
const mockGetUserCostAssignmentById = vi.mocked(getUserCostAssignmentById);
const mockGetUserCostAssignmentsByCard = vi.mocked(getUserCostAssignmentsByCard);
const mockCreateUserCostAssignment = vi.mocked(createUserCostAssignment);
const mockUpdateUserCostAssignment = vi.mocked(updateUserCostAssignment);

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

function entryCtxFor(id: string, entryId: string): { params: Promise<{ id: string; entryId: string }> } {
  return { params: Promise.resolve({ id, entryId }) };
}

function userCtxFor(userId: string): { params: Promise<{ userId: string }> } {
  return { params: Promise.resolve({ userId }) };
}

function assignmentCtxFor(userId: string, assignmentId: string): { params: Promise<{ userId: string; assignmentId: string }> } {
  return { params: Promise.resolve({ userId, assignmentId }) };
}

function cardFor(tenantId: string, overrides: Partial<RateCard> = {}): RateCard {
  return {
    id: 'rate-card-1',
    tenantId,
    name: 'Agency Cost 2026',
    type: 'COST',
    currency: 'INR',
    scope: 'ORGANIZATION',
    status: 'ACTIVE',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function entryFor(tenantId: string, overrides: Partial<RateCardEntry> = {}): RateCardEntry {
  return {
    id: 'entry-senior',
    tenantId,
    rateCardId: 'rate-card-1',
    name: 'Senior Developer',
    unit: 'HOUR',
    amount: 900,
    currency: 'INR',
    billable: false,
    billingType: 'HOURLY',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function versionFor(tenantId: string, overrides: Partial<RateEntryVersion> = {}): RateEntryVersion {
  return {
    id: 'version-1',
    tenantId,
    rateCardId: 'rate-card-1',
    rateCardEntryId: 'entry-senior',
    amount: 900,
    currency: 'INR',
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function assignmentFor(tenantId: string, overrides: Partial<UserCostAssignment> = {}): UserCostAssignment {
  return {
    id: 'assignment-1',
    tenantId,
    userId: AGENCY_A.member.userId,
    rateCardId: 'rate-card-1',
    rateCardEntryId: 'entry-senior',
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
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
  const tenant: Tenant = {
    id: tenantId, name: `Tenant ${tenantId}`, status: 'ACTIVE', plan: 'FREE',
    settings: {}, limits: { maxUsers: 5 }, appMode,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
  mockSession.mockResolvedValue(session);
  mockGetTenant.mockResolvedValue(tenant);
  return session;
}

beforeEach(() => {
  for (const m of [
    mockSession, mockGetTenant, mockGetClientById, mockGetUserById, mockCreateLog,
    mockGetRateCards, mockGetRateCardById, mockCreateRateCard, mockUpdateRateCard,
    mockListRateCardEntries, mockListAllRateCardEntries, mockGetRateCardEntryById,
    mockCreateRateCardEntry, mockUpdateRateCardEntry,
    mockCreateRateEntryVersion, mockCloseRateEntryVersion, mockListRateEntryVersions,
    mockGetUserCostAssignments, mockGetUserCostAssignmentById, mockGetUserCostAssignmentsByCard,
    mockCreateUserCostAssignment, mockUpdateUserCostAssignment,
  ]) m.mockReset();
  mockCreateLog.mockResolvedValue({} as Awaited<ReturnType<typeof createLog>>);
});

// ---------- §84 list + §99 redaction ----------

describe('Module 6.9 — rate card list (§84/§99)', () => {
  it('admins get cards with entry counts and costRatesReadable: true', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetRateCards.mockResolvedValue([
      cardFor(AGENCY_A.tenant.id),
      cardFor(AGENCY_A.tenant.id, { id: 'billing-card-1', name: 'Standard Billing', type: 'BILLING' }),
    ]);
    mockListAllRateCardEntries.mockResolvedValue([entryFor(AGENCY_A.tenant.id)]);

    const res = await listCards(requestFor('/api/agency/rate-cards'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.costRatesReadable).toBe(true);
    expect(body.cards).toHaveLength(2);
    const cost = body.cards.find((c: { type: string }) => c.type === 'COST');
    expect(cost.entryCount).toBe(1);
    expect(cost.costRedacted).toBeUndefined();
  });

  it('§99/§104 — a USER sees cost cards with redacted counts, never the entries', async () => {
    arrange(AGENCY_A.tenant.id, 'Agency', 'USER', AGENCY_A.member.userId);
    mockGetRateCards.mockResolvedValue([cardFor(AGENCY_A.tenant.id)]);
    mockListAllRateCardEntries.mockResolvedValue([entryFor(AGENCY_A.tenant.id)]);

    const res = await listCards(requestFor('/api/agency/rate-cards'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.costRatesReadable).toBe(false);
    expect(body.cards[0].entryCount).toBe(0);
    expect(body.cards[0].costRedacted).toBe(true);
  });

  it('a Standard tenant gets 403 — rates are an Agency capability', async () => {
    arrange(STANDARD_TENANT.tenant.id, 'Standard');
    const res = await listCards(requestFor('/api/agency/rate-cards'));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('NOT_AGENCY_TENANT');
  });
});

// ---------- card lifecycle ----------

describe('Module 6.9 — card create/detail/archive (§86/§91/§75/§113)', () => {
  it('creates a card and audits RATE_CARD_CREATED (§86)', async () => {
    arrange(AGENCY_A.tenant.id);
    mockCreateRateCard.mockResolvedValue(cardFor(AGENCY_A.tenant.id, { name: 'Standard Billing', type: 'BILLING' }));

    const res = await createCardRoute(jsonRequest('/api/agency/rate-cards', 'POST', {
      name: 'Standard Billing', type: 'BILLING', scope: 'ORGANIZATION', currency: 'inr',
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.card.name).toBe('Standard Billing');
    // The repository was called with the SESSION tenant and normalized currency.
    expect(mockCreateRateCard).toHaveBeenCalledWith(
      AGENCY_A.tenant.id,
      expect.objectContaining({ type: 'BILLING', currency: 'INR' })
    );
    expect(mockCreateLog).toHaveBeenCalledWith(
      expect.anything(), 'RATE_CARD_CREATED', expect.anything(), AGENCY_A.tenant.id, expect.anything()
    );
  });

  it('§98 — a USER cannot create cards (manage is admin-only)', async () => {
    arrange(AGENCY_A.tenant.id, 'Agency', 'USER', AGENCY_A.member.userId);
    const res = await createCardRoute(jsonRequest('/api/agency/rate-cards', 'POST', {
      name: 'X', type: 'BILLING', scope: 'ORGANIZATION', currency: 'INR',
    }));
    expect(res.status).toBe(403);
    expect(mockCreateRateCard).not.toHaveBeenCalled();
  });

  it('§91/§113 — a CLIENT-scoped card with a missing-or-foreign client gets the identical 400', async () => {
    arrange(AGENCY_A.tenant.id);
    // §113 — B's client and a nonexistent client are indistinguishable here:
    // both are "not found for this tenant", never an existence leak.
    mockGetClientById.mockResolvedValue(null);
    const foreign = await createCardRoute(jsonRequest('/api/agency/rate-cards', 'POST', {
      name: 'B Pricing', type: 'BILLING', scope: 'CLIENT',
      clientId: AGENCY_B.client.id, currency: 'INR',
    }));
    expect(foreign.status).toBe(400);

    const missing = await createCardRoute(jsonRequest('/api/agency/rate-cards', 'POST', {
      name: 'Ghost Pricing', type: 'BILLING', scope: 'CLIENT',
      clientId: 'does-not-exist', currency: 'INR',
    }));
    expect(missing.status).toBe(400);
    const a = await foreign.json();
    const b = await missing.json();
    expect(a.error).toBe(b.error);
    expect(mockCreateRateCard).not.toHaveBeenCalled();
  });

  it('detail returns entries, versions and (COST only) assignments (§85/§88)', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetRateCardById.mockResolvedValue(cardFor(AGENCY_A.tenant.id));
    mockListRateCardEntries.mockResolvedValue([entryFor(AGENCY_A.tenant.id)]);
    mockListRateEntryVersions.mockResolvedValue([versionFor(AGENCY_A.tenant.id)]);
    mockGetUserCostAssignmentsByCard.mockResolvedValue([assignmentFor(AGENCY_A.tenant.id)]);

    const res = await getCard(requestFor('/api/agency/rate-cards/rate-card-1'), ctxFor('rate-card-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.card.type).toBe('COST');
    expect(body.entries[0].versions).toHaveLength(1);
    expect(body.assignments).toHaveLength(1);
  });

  it('§99 — a USER gets 403 on a COST card detail (rates are salary data)', async () => {
    arrange(AGENCY_A.tenant.id, 'Agency', 'USER', AGENCY_A.member.userId);
    mockGetRateCardById.mockResolvedValue(cardFor(AGENCY_A.tenant.id));
    mockListRateCardEntries.mockResolvedValue([]);
    mockListRateEntryVersions.mockResolvedValue([]);

    const res = await getCard(requestFor('/api/agency/rate-cards/rate-card-1'), ctxFor('rate-card-1'));
    expect(res.status).toBe(403);
  });

  it('§113 — another tenant\'s card is an identical 404', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetRateCardById.mockResolvedValue(null); // B's card doesn't exist for A
    const res = await getCard(requestFor('/api/agency/rate-cards/b-card'), ctxFor('b-card'));
    expect(res.status).toBe(404);
  });

  it('archives and restores (§75 — never delete)', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetRateCardById.mockResolvedValue(cardFor(AGENCY_A.tenant.id));
    mockUpdateRateCard.mockResolvedValue(true);

    const archived = await archiveCard(requestFor('/api/agency/rate-cards/rate-card-1/archive'), ctxFor('rate-card-1'));
    expect(archived.status).toBe(200);
    expect(mockCreateLog).toHaveBeenCalledWith(
      expect.anything(), 'RATE_CARD_ARCHIVED', expect.anything(), AGENCY_A.tenant.id, expect.anything()
    );

    // Re-archive is an honest 400.
    mockGetRateCardById.mockResolvedValue(cardFor(AGENCY_A.tenant.id, { status: 'ARCHIVED' }));
    const again = await archiveCard(requestFor('/api/agency/rate-cards/rate-card-1/archive'), ctxFor('rate-card-1'));
    expect(again.status).toBe(400);

    const restored = await restoreCard(requestFor('/api/agency/rate-cards/rate-card-1/restore'), ctxFor('rate-card-1'));
    expect(restored.status).toBe(200);
  });
});

// ---------- entries + §122 versioned change ----------

describe('Module 6.9 — entries and the §122 rate change', () => {
  it('adds a rate line with its FIRST version (§87)', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetRateCardById.mockResolvedValue(cardFor(AGENCY_A.tenant.id));
    mockCreateRateCardEntry.mockResolvedValue(entryFor(AGENCY_A.tenant.id));

    const res = await createEntryRoute(
      jsonRequest('/api/agency/rate-cards/rate-card-1/entries', 'POST', {
        name: 'Senior Developer', amount: 900, effectiveFrom: '2026-01-01',
      }),
      ctxFor('rate-card-1')
    );
    expect(res.status).toBe(201);
    // §73 — a COST entry is forced HOUR / not billable / HOURLY.
    expect(mockCreateRateCardEntry).toHaveBeenCalledWith(
      AGENCY_A.tenant.id, 'rate-card-1',
      expect.objectContaining({ unit: 'HOUR', billable: false, billingType: 'HOURLY' })
    );
    expect(mockCreateRateEntryVersion).toHaveBeenCalledWith(
      AGENCY_A.tenant.id, 'rate-card-1', 'entry-senior',
      expect.objectContaining({ amount: 900, effectiveFrom: '2026-01-01' })
    );
  });

  it('§76 — an archived card accepts no new entries', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetRateCardById.mockResolvedValue(cardFor(AGENCY_A.tenant.id, { status: 'ARCHIVED' }));
    const res = await createEntryRoute(
      jsonRequest('/api/agency/rate-cards/rate-card-1/entries', 'POST', {
        name: 'X', amount: 1, effectiveFrom: '2026-01-01',
      }),
      ctxFor('rate-card-1')
    );
    expect(res.status).toBe(400);
    expect(mockCreateRateCardEntry).not.toHaveBeenCalled();
  });

  it('§99 — a USER gets 403 on a COST card\'s entries', async () => {
    arrange(AGENCY_A.tenant.id, 'Agency', 'USER', AGENCY_A.member.userId);
    mockGetRateCardById.mockResolvedValue(cardFor(AGENCY_A.tenant.id));
    const res = await listEntries(requestFor('/api/agency/rate-cards/rate-card-1/entries'), ctxFor('rate-card-1'));
    expect(res.status).toBe(403);
  });

  it('§122 — changing the rate closes the old version the day before and opens a new one', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetRateCardById.mockResolvedValue(cardFor(AGENCY_A.tenant.id));
    mockGetRateCardEntryById.mockResolvedValue(entryFor(AGENCY_A.tenant.id));
    mockListRateEntryVersions.mockResolvedValue([versionFor(AGENCY_A.tenant.id)]);
    mockCloseRateEntryVersion.mockResolvedValue(true);
    mockUpdateRateCardEntry.mockResolvedValue(true);

    const res = await patchEntry(
      jsonRequest('/api/agency/rate-cards/rate-card-1/entries/entry-senior', 'PATCH', {
        amount: 1000, effectiveFrom: '2026-07-01',
      }),
      entryCtxFor('rate-card-1', 'entry-senior')
    );
    expect(res.status).toBe(200);
    expect(mockCloseRateEntryVersion).toHaveBeenCalledWith('version-1', AGENCY_A.tenant.id, '2026-06-30');
    expect(mockCreateRateEntryVersion).toHaveBeenCalledWith(
      AGENCY_A.tenant.id, 'rate-card-1', 'entry-senior',
      expect.objectContaining({ amount: 1000, effectiveFrom: '2026-07-01' })
    );
    expect(mockCreateLog).toHaveBeenCalledWith(
      expect.anything(), 'RATE_ENTRY_UPDATED', expect.anything(), AGENCY_A.tenant.id, expect.anything()
    );
  });

  it('§122 — backdating over the current version rejects', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetRateCardById.mockResolvedValue(cardFor(AGENCY_A.tenant.id));
    mockGetRateCardEntryById.mockResolvedValue(entryFor(AGENCY_A.tenant.id));
    mockListRateEntryVersions.mockResolvedValue([versionFor(AGENCY_A.tenant.id)]);

    const res = await patchEntry(
      jsonRequest('/api/agency/rate-cards/rate-card-1/entries/entry-senior', 'PATCH', {
        amount: 800, effectiveFrom: '2025-06-01',
      }),
      entryCtxFor('rate-card-1', 'entry-senior')
    );
    expect(res.status).toBe(400);
    expect(mockCloseRateEntryVersion).not.toHaveBeenCalled();
  });
});

// ---------- user cost assignments (§77/§79/§88/§101/§104) ----------

describe('Module 6.9 — user cost assignments (§88/§104)', () => {
  it('admins list a user\'s assignments enriched with card/entry display fields', async () => {
    arrange(AGENCY_A.tenant.id);
    const user = { _id: AGENCY_A.member.userId, username: 'agency_a_dev', role: 'USER', tenantId: AGENCY_A.tenant.id } as unknown as User;
    mockGetUserById.mockResolvedValue(user);
    mockGetUserCostAssignments.mockResolvedValue([assignmentFor(AGENCY_A.tenant.id)]);
    mockGetRateCardById.mockResolvedValue(cardFor(AGENCY_A.tenant.id));
    mockGetRateCardEntryById.mockResolvedValue(entryFor(AGENCY_A.tenant.id));

    const res = await listAssignments(
      requestFor(`/api/agency/users/${AGENCY_A.member.userId}/cost-rates`),
      userCtxFor(AGENCY_A.member.userId)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.assignments[0].cardName).toBe('Agency Cost 2026');
    expect(body.assignments[0].entryAmount).toBe(900);
  });

  it('§104 — a USER gets 403 on another user\'s cost assignments', async () => {
    arrange(AGENCY_A.tenant.id, 'Agency', 'USER', AGENCY_A.member.userId);
    const res = await listAssignments(
      requestFor(`/api/agency/users/${AGENCY_A.member.userId}/cost-rates`),
      userCtxFor(AGENCY_A.member.userId)
    );
    expect(res.status).toBe(403);
    expect(mockGetUserCostAssignments).not.toHaveBeenCalled();
  });

  it('assigns a cost rate and audits USER_COST_RATE_ASSIGNED (§88)', async () => {
    arrange(AGENCY_A.tenant.id);
    const dev = { _id: AGENCY_A.member.userId, username: 'agency_a_dev', role: 'USER', tenantId: AGENCY_A.tenant.id } as unknown as User;
    mockGetUserById.mockResolvedValue(dev);
    mockGetRateCardById.mockResolvedValue(cardFor(AGENCY_A.tenant.id));
    mockGetRateCardEntryById.mockResolvedValue(entryFor(AGENCY_A.tenant.id));
    mockGetUserCostAssignments.mockResolvedValue([]);
    mockCreateUserCostAssignment.mockResolvedValue(assignmentFor(AGENCY_A.tenant.id));

    const res = await assignRoute(
      jsonRequest(`/api/agency/users/${AGENCY_A.member.userId}/cost-rates`, 'POST', {
        rateCardId: 'rate-card-1', rateCardEntryId: 'entry-senior', effectiveFrom: '2026-01-01',
      }),
      userCtxFor(AGENCY_A.member.userId)
    );
    expect(res.status).toBe(201);
    expect(mockCreateUserCostAssignment).toHaveBeenCalledWith(
      AGENCY_A.tenant.id, AGENCY_A.member.userId,
      expect.objectContaining({ rateCardId: 'rate-card-1', rateCardEntryId: 'entry-senior' })
    );
    expect(mockCreateLog).toHaveBeenCalledWith(
      expect.anything(), 'USER_COST_RATE_ASSIGNED', expect.anything(), AGENCY_A.tenant.id, expect.anything()
    );
  });

  it('§77 — a closed-range overlap is a 409, not a silent replace', async () => {
    arrange(AGENCY_A.tenant.id);
    const dev = { _id: AGENCY_A.member.userId, username: 'agency_a_dev', role: 'USER', tenantId: AGENCY_A.tenant.id } as unknown as User;
    mockGetUserById.mockResolvedValue(dev);
    mockGetRateCardById.mockResolvedValue(cardFor(AGENCY_A.tenant.id));
    mockGetRateCardEntryById.mockResolvedValue(entryFor(AGENCY_A.tenant.id));
    // Existing CLOSED history 2026-01-01 → 2026-03-31.
    mockGetUserCostAssignments.mockResolvedValue([
      assignmentFor(AGENCY_A.tenant.id, { effectiveFrom: '2026-01-01', effectiveTo: '2026-03-31' }),
    ]);

    const res = await assignRoute(
      jsonRequest(`/api/agency/users/${AGENCY_A.member.userId}/cost-rates`, 'POST', {
        rateCardId: 'rate-card-1', rateCardEntryId: 'entry-senior', effectiveFrom: '2026-03-01',
      }),
      userCtxFor(AGENCY_A.member.userId)
    );
    expect(res.status).toBe(409);
    expect(mockCreateUserCostAssignment).not.toHaveBeenCalled();
  });

  it('§79 — an open-ended assignment is replaced forward (auto-closed the day before)', async () => {
    arrange(AGENCY_A.tenant.id);
    const dev = { _id: AGENCY_A.member.userId, username: 'agency_a_dev', role: 'USER', tenantId: AGENCY_A.tenant.id } as unknown as User;
    mockGetUserById.mockResolvedValue(dev);
    mockGetRateCardById.mockResolvedValue(cardFor(AGENCY_A.tenant.id));
    mockGetRateCardEntryById.mockResolvedValue(entryFor(AGENCY_A.tenant.id));
    mockGetUserCostAssignments.mockResolvedValue([assignmentFor(AGENCY_A.tenant.id)]);
    mockUpdateUserCostAssignment.mockResolvedValue(true);
    mockCreateUserCostAssignment.mockResolvedValue(assignmentFor(AGENCY_A.tenant.id, { effectiveFrom: '2026-07-01' }));

    const res = await assignRoute(
      jsonRequest(`/api/agency/users/${AGENCY_A.member.userId}/cost-rates`, 'POST', {
        rateCardId: 'rate-card-1', rateCardEntryId: 'entry-senior', effectiveFrom: '2026-07-01',
      }),
      userCtxFor(AGENCY_A.member.userId)
    );
    expect(res.status).toBe(201);
    expect(mockUpdateUserCostAssignment).toHaveBeenCalledWith(
      'assignment-1', AGENCY_A.member.userId, AGENCY_A.tenant.id, { effectiveTo: '2026-06-30' }
    );
  });

  it('§101 — ends an open assignment (default today)', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetUserCostAssignmentById.mockResolvedValue(assignmentFor(AGENCY_A.tenant.id));
    mockUpdateUserCostAssignment.mockResolvedValue(true);

    const res = await endAssignment(
      requestFor(`/api/agency/users/${AGENCY_A.member.userId}/cost-rates/assignment-1/end`),
      assignmentCtxFor(AGENCY_A.member.userId, 'assignment-1')
    );
    expect(res.status).toBe(200);
    expect(mockCreateLog).toHaveBeenCalledWith(
      expect.anything(), 'USER_COST_RATE_ENDED', expect.anything(), AGENCY_A.tenant.id, expect.anything()
    );
  });

  it('PATCH sets an explicit end date with the §77 re-screen', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetUserCostAssignmentById.mockResolvedValue(assignmentFor(AGENCY_A.tenant.id));
    mockGetUserCostAssignments.mockResolvedValue([]);
    mockUpdateUserCostAssignment.mockResolvedValue(true);

    const res = await patchAssignment(
      jsonRequest(`/api/agency/users/${AGENCY_A.member.userId}/cost-rates/assignment-1`, 'PATCH', {
        effectiveTo: '2026-12-31',
      }),
      assignmentCtxFor(AGENCY_A.member.userId, 'assignment-1')
    );
    expect(res.status).toBe(200);
    expect(mockUpdateUserCostAssignment).toHaveBeenCalledWith(
      'assignment-1', AGENCY_A.member.userId, AGENCY_A.tenant.id, { effectiveTo: '2026-12-31' }
    );
  });
});

// ---------- the §94 resolution endpoint ----------

describe('Module 6.9 — /api/agency/rates/resolve (§94/§99/§104/§121)', () => {
  function arrangeResolvedCost() {
    mockGetUserCostAssignments.mockResolvedValue([assignmentFor(AGENCY_A.tenant.id)]);
    mockGetRateCardById.mockResolvedValue(cardFor(AGENCY_A.tenant.id));
    mockGetRateCardEntryById.mockResolvedValue(entryFor(AGENCY_A.tenant.id));
    mockListRateEntryVersions.mockResolvedValue([versionFor(AGENCY_A.tenant.id)]);
  }

  it('an admin resolves any user\'s cost rate via the real engine', async () => {
    arrange(AGENCY_A.tenant.id);
    arrangeResolvedCost();

    const res = await resolveRate(requestFor(
      `/api/agency/rates/resolve?userId=${AGENCY_A.member.userId}&date=2026-06-15`
    ));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cost.status).toBe('RESOLVED');
    expect(body.cost.amount).toBe(900);
    expect(body.cost.source).toBe('USER_ASSIGNMENT');
  });

  it('§99/§104 — a USER resolving ANOTHER user\'s cost rate gets 403', async () => {
    arrange(AGENCY_A.tenant.id, 'Agency', 'USER', AGENCY_A.member.userId);
    const res = await resolveRate(requestFor(
      `/api/agency/rates/resolve?userId=${AGENCY_A.admin.userId}&date=2026-06-15`
    ));
    expect(res.status).toBe(403);
  });

  it('a USER resolving their OWN cost rate is allowed (self-service)', async () => {
    arrange(AGENCY_A.tenant.id, 'Agency', 'USER', AGENCY_A.member.userId);
    arrangeResolvedCost();

    const res = await resolveRate(requestFor(
      `/api/agency/rates/resolve?userId=${AGENCY_A.member.userId}&date=2026-06-15`
    ));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cost.status).toBe('RESOLVED');
  });

  it('billing resolution rides billing.read — a USER may resolve, honestly NOT_CONFIGURED (§96)', async () => {
    arrange(AGENCY_A.tenant.id, 'Agency', 'USER', AGENCY_A.member.userId);
    mockGetRateCards.mockResolvedValue([]);

    const res = await resolveRate(requestFor(
      `/api/agency/rates/resolve?clientId=${AGENCY_A.client.id}&role=Senior%20Developer&date=2026-06-15`
    ));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.billing.status).toBe('NOT_CONFIGURED');
    expect(body.billing.amount).toBeUndefined();
  });

  it('resolves a client card rate end to end (§67)', async () => {
    arrange(AGENCY_A.tenant.id);
    const clientCard = cardFor(AGENCY_A.tenant.id, {
      id: 'client-billing-1', name: 'Client A Pricing', type: 'BILLING', scope: 'CLIENT',
      clientId: AGENCY_A.client.id,
    });
    mockGetRateCards.mockResolvedValue([clientCard]);
    mockListRateCardEntries.mockResolvedValue([
      entryFor(AGENCY_A.tenant.id, { rateCardId: 'client-billing-1', name: 'Senior Developer', billable: true, amount: 2500 }),
    ]);
    mockListRateEntryVersions.mockResolvedValue([
      versionFor(AGENCY_A.tenant.id, { rateCardId: 'client-billing-1', amount: 2500 }),
    ]);

    const res = await resolveRate(requestFor(
      `/api/agency/rates/resolve?clientId=${AGENCY_A.client.id}&role=Senior%20Developer&date=2026-06-15`
    ));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.billing.status).toBe('RESOLVED');
    expect(body.billing.amount).toBe(2500);
    expect(body.billing.source).toBe('CLIENT_RATE_CARD');
  });

  it('§89 — billing resolution without a role is a 400, never a guess', async () => {
    arrange(AGENCY_A.tenant.id);
    const res = await resolveRate(requestFor(
      `/api/agency/rates/resolve?clientId=${AGENCY_A.client.id}&date=2026-06-15`
    ));
    expect(res.status).toBe(400);
  });

  it('a request with neither side is a 400', async () => {
    arrange(AGENCY_A.tenant.id);
    const res = await resolveRate(requestFor('/api/agency/rates/resolve'));
    expect(res.status).toBe(400);
  });

  it('a malformed date is a 400', async () => {
    arrange(AGENCY_A.tenant.id);
    const res = await resolveRate(requestFor(
      `/api/agency/rates/resolve?userId=${AGENCY_A.member.userId}&date=june-15`
    ));
    expect(res.status).toBe(400);
  });
});
