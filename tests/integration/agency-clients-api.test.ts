/**
 * Module 2.8 — Integration: Agency Client API (spec §29/§30/§33).
 *
 * Runs the REAL route handlers with only the session/tenant/repository edges
 * mocked — the full pipeline executes between them:
 *   authenticate → resolve tenant → verify Agency capability → authorize
 *   (§28: admin writes, user reads) → validate → operate → audit → respond.
 *
 * Covers the Step 2.8 matrix: create, read, update, archive, restore,
 * search, duplicate warning, tenant isolation, authorization.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TokenPayload } from '@/lib/auth';
import type { Client, Tenant } from '@/lib/db';
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
    getClients: vi.fn(),
    searchClients: vi.fn(),
    createClient: vi.fn(),
    getClientById: vi.fn(),
    updateClient: vi.fn(),
    findClientByName: vi.fn(),
    getLogs: vi.fn(),
    getTransactions: vi.fn(),
    createLog: vi.fn(),
  };
});

import { getSessionUser } from '@/lib/auth';
import {
  getTenantById,
  getClients, searchClients, createClient, getClientById, updateClient,
  findClientByName, getLogs, getTransactions, createLog,
} from '@/lib/db';
import { GET as listClients, POST as createClientRoute } from '@/app/api/agency/clients/route';
import { GET as getClient, PATCH as patchClient } from '@/app/api/agency/clients/[id]/route';
import { POST as archiveClient } from '@/app/api/agency/clients/[id]/archive/route';
import { POST as restoreClient } from '@/app/api/agency/clients/[id]/restore/route';
import { NextRequest } from 'next/server';

const mockSession = vi.mocked(getSessionUser);
const mockGetTenant = vi.mocked(getTenantById);
const mockGetClients = vi.mocked(getClients);
const mockSearchClients = vi.mocked(searchClients);
const mockCreateClient = vi.mocked(createClient);
const mockGetClientById = vi.mocked(getClientById);
const mockUpdateClient = vi.mocked(updateClient);
const mockFindClientByName = vi.mocked(findClientByName);
const mockGetLogs = vi.mocked(getLogs);
const mockGetTransactions = vi.mocked(getTransactions);
const mockCreateLog = vi.mocked(createLog);

function requestFor(url: string, init?: RequestInit): NextRequest {
  // DOM RequestInit vs Next's narrow spec type — cast across the harmless
  // signal-nullability difference.
  return new NextRequest(new URL(url, 'http://localhost:3100'), init as ConstructorParameters<typeof NextRequest>[1]);
}

function jsonRequest(url: string, method: string, body: unknown): NextRequest {
  return requestFor(url, { method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
}

/** Next 16 dynamic-route context: params is a Promise. */
function ctxFor(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function clientFor(tenantId: string, overrides: Partial<Client> = {}): Client & { id: string } {
  return {
    id: `cl-${tenantId}`,
    tenantId,
    name: 'Client A Industries',
    email: 'billing@clienta.example',
    createdAt: new Date('2026-01-15T00:00:00Z'),
    status: 'ACTIVE',
    ...overrides,
  };
}

/** Stand up the session + tenant chain for one tenant (admin by default). */
function arrange(
  tenantId: string,
  appMode: Tenant['appMode'] = 'Agency',
  role: TokenPayload['role'] = 'TENANT_ADMIN'
) {
  const session: TokenPayload = {
    userId: `u-${tenantId}`, username: 'tester', role, tenantId,
  };
  const tenant: Tenant = {
    id: tenantId, name: `Tenant ${tenantId}`, status: 'ACTIVE', plan: 'FREE',
    settings: {}, limits: { maxUsers: 5 }, appMode,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
  mockSession.mockResolvedValue(session);
  mockGetTenant.mockResolvedValue(tenant);
}

beforeEach(() => {
  mockSession.mockReset();
  mockGetTenant.mockReset();
  mockGetClients.mockReset();
  mockSearchClients.mockReset();
  mockCreateClient.mockReset();
  mockGetClientById.mockReset();
  mockUpdateClient.mockReset();
  mockFindClientByName.mockReset();
  mockGetLogs.mockReset();
  mockGetTransactions.mockReset();
  mockCreateLog.mockReset();
  // Audit log writes are side effects — swallow them by default.
  mockCreateLog.mockResolvedValue({} as Awaited<ReturnType<typeof createLog>>);
});

describe('Module 2.8 — authentication and vertical gate', () => {
  it('401s when unauthenticated', async () => {
    mockSession.mockResolvedValue(null);
    const res = await listClients(requestFor('/api/agency/clients'));
    expect(res.status).toBe(401);
  });

  it('403s with NOT_AGENCY_TENANT for a Standard tenant', async () => {
    arrange(STANDARD_TENANT.tenant.id, 'Standard');
    const res = await listClients(requestFor('/api/agency/clients'));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('NOT_AGENCY_TENANT');
  });
});

describe('Module 2.8 — authorization (§28: admin writes, user reads)', () => {
  it('lets a USER read the client list', async () => {
    arrange(AGENCY_A.tenant.id, 'Agency', 'USER');
    mockGetClients.mockResolvedValue([]);
    const res = await listClients(requestFor('/api/agency/clients'));
    expect(res.status).toBe(200);
  });

  it('lets a USER read a client detail', async () => {
    arrange(AGENCY_A.tenant.id, 'Agency', 'USER');
    mockGetClientById.mockResolvedValue(clientFor(AGENCY_A.tenant.id));
    mockGetLogs.mockResolvedValue([]);
    mockGetTransactions.mockResolvedValue([]);
    const res = await getClient(requestFor(`/api/agency/clients/${AGENCY_A.client.id}`), ctxFor(AGENCY_A.client.id));
    expect(res.status).toBe(200);
  });

  it('403s a USER creating a client', async () => {
    arrange(AGENCY_A.tenant.id, 'Agency', 'USER');
    const res = await createClientRoute(jsonRequest('/api/agency/clients', 'POST', { name: 'New Co' }));
    expect(res.status).toBe(403);
  });

  it('403s a USER patching a client', async () => {
    arrange(AGENCY_A.tenant.id, 'Agency', 'USER');
    const res = await patchClient(jsonRequest(`/api/agency/clients/${AGENCY_A.client.id}`, 'PATCH', { notes: 'x' }), ctxFor(AGENCY_A.client.id));
    expect(res.status).toBe(403);
  });

  it('403s a USER archiving a client', async () => {
    arrange(AGENCY_A.tenant.id, 'Agency', 'USER');
    const res = await archiveClient(requestFor(`/api/agency/clients/${AGENCY_A.client.id}/archive`, { method: 'POST' }), ctxFor(AGENCY_A.client.id));
    expect(res.status).toBe(403);
  });

  it('403s a USER restoring a client', async () => {
    arrange(AGENCY_A.tenant.id, 'Agency', 'USER');
    const res = await restoreClient(requestFor(`/api/agency/clients/${AGENCY_A.client.id}/restore`, { method: 'POST' }), ctxFor(AGENCY_A.client.id));
    expect(res.status).toBe(403);
  });
});

describe('Module 2.8 — create (§18 duplicates, §31 validation)', () => {
  it('creates a client and audits the mutation (§27)', async () => {
    arrange(AGENCY_A.tenant.id);
    mockFindClientByName.mockResolvedValue([]);
    mockCreateClient.mockResolvedValue(clientFor(AGENCY_A.tenant.id, { name: 'Acme Studio' }));

    const res = await createClientRoute(jsonRequest('/api/agency/clients', 'POST', { name: 'Acme Studio' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.client.name).toBe('Acme Studio');
    // §27 — every mutation generates an audit event
    expect(mockCreateLog).toHaveBeenCalled();
    expect(mockCreateClient).toHaveBeenCalledWith(
      AGENCY_A.tenant.id, 'Acme Studio', undefined, expect.objectContaining({ name: 'Acme Studio' })
    );
  });

  it('rejects an invalid payload with 400 (no name)', async () => {
    arrange(AGENCY_A.tenant.id);
    const res = await createClientRoute(jsonRequest('/api/agency/clients', 'POST', { email: 'x@y.com' }));
    expect(res.status).toBe(400);
  });

  it('warns on a duplicate name with 409 DUPLICATE_WARNING (§18)', async () => {
    arrange(AGENCY_A.tenant.id);
    mockFindClientByName.mockResolvedValue([clientFor(AGENCY_A.tenant.id)]);

    const res = await createClientRoute(jsonRequest('/api/agency/clients', 'POST', { name: 'Client A Industries' }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('DUPLICATE_WARNING');
    expect(Array.isArray(body.existing)).toBe(true);
    // A warning is NOT a rejection — nothing was written
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it('proceeds on allowDuplicate: true (Create Anyway)', async () => {
    arrange(AGENCY_A.tenant.id);
    mockFindClientByName.mockResolvedValue([clientFor(AGENCY_A.tenant.id)]);
    mockCreateClient.mockResolvedValue(clientFor(AGENCY_A.tenant.id, { name: 'Client A Industries' }));

    const res = await createClientRoute(jsonRequest('/api/agency/clients', 'POST', {
      name: 'Client A Industries', allowDuplicate: true,
    }));
    expect(res.status).toBe(201);
    expect(mockCreateClient).toHaveBeenCalled();
  });
});

describe('Module 2.8 — read (list, search, detail)', () => {
  it('lists clients tenant-scoped, hiding ARCHIVED by default (§20)', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetClients.mockResolvedValue([
      clientFor(AGENCY_A.tenant.id),
      clientFor(AGENCY_A.tenant.id, { id: 'cl-archived', status: 'ARCHIVED' }),
    ]);
    const res = await listClients(requestFor('/api/agency/clients'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clients).toHaveLength(1);
    expect(body.clients[0].status).toBe('ACTIVE');
    // The repository was called with the SESSION tenant, never a URL param
    expect(mockGetClients).toHaveBeenCalledWith(AGENCY_A.tenant.id, expect.anything());
  });

  it('routes ?search= through the search repository (§19)', async () => {
    arrange(AGENCY_A.tenant.id);
    mockSearchClients.mockResolvedValue([clientFor(AGENCY_A.tenant.id)]);
    const res = await listClients(requestFor('/api/agency/clients?search=acme'));
    expect(res.status).toBe(200);
    expect(mockSearchClients).toHaveBeenCalledWith(
      AGENCY_A.tenant.id, 'acme', expect.objectContaining({ page: 1 })
    );
    expect(mockGetClients).not.toHaveBeenCalled();
  });

  it('resolves ARCHIVED clients via the explicit status filter (§20)', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetClients.mockResolvedValue([clientFor(AGENCY_A.tenant.id, { status: 'ARCHIVED' })]);
    const res = await listClients(requestFor('/api/agency/clients?status=ARCHIVED'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clients).toHaveLength(1);
    expect(body.clients[0].status).toBe('ARCHIVED');
  });

  it('returns client + activity + transactions on detail (§21/§26)', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetClientById.mockResolvedValue(clientFor(AGENCY_A.tenant.id));
    mockGetLogs.mockResolvedValue([]);
    mockGetTransactions.mockResolvedValue([]);
    const res = await getClient(requestFor(`/api/agency/clients/${AGENCY_A.client.id}`), ctxFor(AGENCY_A.client.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.client).toBeDefined();
    expect(Array.isArray(body.activity)).toBe(true);
    expect(Array.isArray(body.transactions)).toBe(true);
  });

  it('404s an unknown client in the same tenant', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetClientById.mockResolvedValue(null);
    const res = await getClient(requestFor('/api/agency/clients/does-not-exist'), ctxFor('does-not-exist'));
    expect(res.status).toBe(404);
  });
});

describe('Module 2.8 — tenant isolation (§33/§113)', () => {
  it("A's session asking for B's client id resolves 404 — never a leak", async () => {
    arrange(AGENCY_A.tenant.id);
    // The repository is tenant-scoped: B's id simply does not resolve
    mockGetClientById.mockImplementation(async (id, tenantId) =>
      tenantId === AGENCY_B.tenant.id ? clientFor(AGENCY_B.tenant.id) : null);

    const res = await getClient(requestFor(`/api/agency/clients/${AGENCY_B.client.id}`), ctxFor(AGENCY_B.client.id));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain(AGENCY_B.tenant.id);
    // The lookup used the SESSION tenant, not the resource's
    expect(mockGetClientById).toHaveBeenCalledWith(AGENCY_B.client.id, AGENCY_A.tenant.id);
  });

  it("A's list never returns B's clients", async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetClients.mockResolvedValue([clientFor(AGENCY_A.tenant.id)]);
    const res = await listClients(requestFor(`/api/agency/clients?tenantId=${AGENCY_B.tenant.id}`));
    expect(res.status).toBe(200);
    const body = JSON.stringify(await res.json());
    expect(body).not.toContain(AGENCY_B.tenant.id);
    expect(body).not.toContain(AGENCY_B.client.id);
  });

  it("A cannot patch B's client — the repository is tenant-scoped", async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetClientById.mockImplementation(async (id, tenantId) =>
      tenantId === AGENCY_B.tenant.id ? clientFor(AGENCY_B.tenant.id) : null);
    const res = await patchClient(jsonRequest(`/api/agency/clients/${AGENCY_B.client.id}`, 'PATCH', { notes: 'probe' }), ctxFor(AGENCY_B.client.id));
    expect(res.status).toBe(404);
    expect(mockUpdateClient).not.toHaveBeenCalled();
  });

  it("A cannot archive B's client", async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetClientById.mockImplementation(async (id, tenantId) =>
      tenantId === AGENCY_B.tenant.id ? clientFor(AGENCY_B.tenant.id) : null);
    const res = await archiveClient(requestFor(`/api/agency/clients/${AGENCY_B.client.id}/archive`, { method: 'POST' }), ctxFor(AGENCY_B.client.id));
    expect(res.status).toBe(404);
  });
});

describe('Module 2.8 — update and lifecycle (§14/§15)', () => {
  it('patches partial fields without a name (§29)', async () => {
    arrange(AGENCY_A.tenant.id);
    const before = clientFor(AGENCY_A.tenant.id);
    mockGetClientById.mockResolvedValueOnce(before);
    mockUpdateClient.mockResolvedValue(true);
    mockGetClientById.mockResolvedValueOnce({ ...before, notes: 'mornings', phone: '+91 90000 00000' });

    const res = await patchClient(jsonRequest(`/api/agency/clients/${before.id}`, 'PATCH', { notes: 'mornings', phone: '+91 90000 00000' }), ctxFor(before.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.client.notes).toBe('mornings');
    expect(mockUpdateClient).toHaveBeenCalledWith(
      before.id, AGENCY_A.tenant.id, expect.objectContaining({ notes: 'mornings' })
    );
  });

  it('blocks an illegal status smuggle through PATCH (ACTIVE → ARCHIVED)', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetClientById.mockResolvedValue(clientFor(AGENCY_A.tenant.id));
    const res = await patchClient(jsonRequest(`/api/agency/clients/${AGENCY_A.client.id}`, 'PATCH', { status: 'ARCHIVED' }), ctxFor(AGENCY_A.client.id));
    expect(res.status).toBe(400);
    expect(mockUpdateClient).not.toHaveBeenCalled();
  });

  it('warns on a duplicate rename with 409 (§18)', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetClientById.mockResolvedValue(clientFor(AGENCY_A.tenant.id));
    mockFindClientByName.mockResolvedValue([clientFor(AGENCY_A.tenant.id, { id: 'cl-other', name: 'Taken Name' })]);

    const res = await patchClient(jsonRequest(`/api/agency/clients/${AGENCY_A.client.id}`, 'PATCH', { name: 'Taken Name' }), ctxFor(AGENCY_A.client.id));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('DUPLICATE_WARNING');
  });

  it('archives from INACTIVE and audits the event (§15/§27)', async () => {
    arrange(AGENCY_A.tenant.id);
    const inactive = clientFor(AGENCY_A.tenant.id, { status: 'INACTIVE' });
    mockGetClientById.mockResolvedValueOnce(inactive);
    mockUpdateClient.mockResolvedValue(true);
    mockGetClientById.mockResolvedValueOnce({ ...inactive, status: 'ARCHIVED' });

    const res = await archiveClient(requestFor(`/api/agency/clients/${inactive.id}/archive`, { method: 'POST' }), ctxFor(inactive.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.client.status).toBe('ARCHIVED');
    expect(mockCreateLog).toHaveBeenCalled();
  });

  it('rejects archiving straight from ACTIVE (§14: ACTIVE → INACTIVE → ARCHIVED)', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetClientById.mockResolvedValue(clientFor(AGENCY_A.tenant.id));
    const res = await archiveClient(requestFor(`/api/agency/clients/${AGENCY_A.client.id}/archive`, { method: 'POST' }), ctxFor(AGENCY_A.client.id));
    expect(res.status).toBe(400);
    expect(mockUpdateClient).not.toHaveBeenCalled();
  });

  it('restores an ARCHIVED client to INACTIVE — not ACTIVE (§14)', async () => {
    arrange(AGENCY_A.tenant.id);
    const archived = clientFor(AGENCY_A.tenant.id, { status: 'ARCHIVED' });
    // Call sequence: restore guard (ARCHIVED) → transition re-fetch (ARCHIVED,
    // so INACTIVE is a legal target) → post-update read (INACTIVE).
    mockGetClientById.mockResolvedValueOnce(archived);
    mockGetClientById.mockResolvedValueOnce(archived);
    mockUpdateClient.mockResolvedValue(true);
    mockGetClientById.mockResolvedValueOnce({ ...archived, status: 'INACTIVE' });

    const res = await restoreClient(requestFor(`/api/agency/clients/${archived.id}/restore`, { method: 'POST' }), ctxFor(archived.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.client.status).toBe('INACTIVE');
    expect(mockUpdateClient).toHaveBeenCalledWith(
      archived.id, AGENCY_A.tenant.id, expect.objectContaining({ status: 'INACTIVE' })
    );
  });

  it('refuses to restore a client that is not ARCHIVED', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetClientById.mockResolvedValue(clientFor(AGENCY_A.tenant.id)); // ACTIVE
    const res = await restoreClient(requestFor(`/api/agency/clients/${AGENCY_A.client.id}/restore`, { method: 'POST' }), ctxFor(AGENCY_A.client.id));
    expect(res.status).toBe(400);
    expect(mockUpdateClient).not.toHaveBeenCalled();
  });
});
