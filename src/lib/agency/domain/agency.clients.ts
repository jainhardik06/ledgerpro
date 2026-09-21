/**
 * Agency Vertical — Domain: client service (Module 2, Step 2.4)
 *
 * The ONLY writer/reader path for agency client operations. React components
 * never touch MongoDB directly — they go API route → this service → db.ts.
 *
 * Responsibilities:
 *   - Enforce the legal status lifecycle (§14) on every status mutation;
 *     archive/restore are transitions, not deletes (§15).
 *   - Tenant isolation: every call carries the session-resolved tenantId and
 *     every underlying query is scoped by it. A client id from another
 *     tenant resolves to "not found" — never a leak (§113).
 *   - Duplicate policy (§18): WARN, never auto-reject. createAgencyClient
 *     accepts `allowDuplicate` so the UI's "Create Anyway" is an explicit
 *     decision; without it, a same-name match returns the advisory result.
 *   - Audit: every mutation emits a createLog entry via the caller-supplied
 *     audit hook (routes own the session context; the service stays pure
 *     over its inputs).
 */
import {
  createClient, getClients, getClientById, updateClient, searchClients,
  findClientByName, getLogs, type Client, type ClientCreateInput, type ListOptions,
} from '@/lib/db';
import {
  validateClientCreate, validateClientUpdate, validateClientStatusTransition,
  type ClientCreatePayload,
} from '../validators/client';
import {
  canTransitionClientStatus, normalizeClientName,
  type ClientStatus,
} from '../types/client';

/** Session context the caller (API route) supplies for audit. */
export interface AuditContext {
  username: string;
  tenantId: string;
  log: (action: string, detail: string) => unknown;
}

export interface DomainResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  code?: string;
}

const notFound = (what: string): DomainResult<never> =>
  ({ ok: false, status: 404, error: `${what} not found` });

// ---------- read ----------

export async function listAgencyClients(
  tenantId: string,
  options: ListOptions & { search?: string; status?: ClientStatus } = {}
): Promise<Client[]> {
  if (options.search) {
    return searchClients(tenantId, options.search, options);
  }
  // Spec §20: default views hide ARCHIVED; archived clients stay resolvable
  // via explicit status filter or direct id.
  const rows = await getClients(tenantId, options);
  return options.status ? rows.filter(c => c.status === options.status) : rows.filter(c => c.status !== 'ARCHIVED');
}

export async function getAgencyClient(id: string, tenantId: string): Promise<DomainResult<Client>> {
  const client = await getClientById(id, tenantId);
  if (!client) return notFound('Client');
  return { ok: true, status: 200, data: client };
}

/**
 * Client activity timeline (spec §26): recent audit entries for this client,
 * aggregated from the tenant's immutable logs. Audit events today:
 * Client Created/Updated/Archived/Restored. Project/Invoice/Payment events
 * join the same timeline when those modules land.
 */
export async function getRecentLogsForTenant(
  tenantId: string,
  clientId: string,
  limit = 20
): Promise<Array<{ action: string; details: string; username: string; timestamp: Date | string }>> {
  const logs = await getLogs(tenantId, { limit: 100 });
  return logs
    .filter(l => typeof l.details === 'string' && l.details.includes(clientId) || (typeof l.details === 'string' && l.details.includes('agency client')))
    .slice(0, limit)
    .map(l => ({ action: l.action, details: l.details, username: l.username, timestamp: l.timestamp }));
}

// ---------- duplicate probe (§18) ----------

export interface DuplicateWarning {
  existing: Client[];
}

/**
 * Advisory duplicate check — never a rejection. Callers surface
 * "Create Anyway / View Existing / Cancel"; only the user's explicit
 * `allowDuplicate` proceeds.
 */
export async function checkClientDuplicate(
  tenantId: string,
  name: string
): Promise<DuplicateWarning | null> {
  const matches = await findClientByName(tenantId, name);
  return matches.length > 0 ? { existing: matches } : null;
}

// ---------- create ----------

export async function createAgencyClient(
  tenantId: string,
  payload: ClientCreatePayload,
  audit: AuditContext,
  options: { allowDuplicate?: boolean } = {}
): Promise<
  | DomainResult<Client>
  | (DomainResult<DuplicateWarning> & { code: 'DUPLICATE_WARNING' })
> {
  const validated = validateClientCreate(payload);
  if (!validated.ok) {
    return { ok: false, status: 400, error: validated.errors.map(e => `${e.field}: ${e.message}`).join('; ') };
  }
  const input = validated.value;

  // §18 — warn, don't block. The frontend then re-submits with
  // allowDuplicate: true after "Create Anyway".
  if (!options.allowDuplicate) {
    const duplicate = await checkClientDuplicate(tenantId, input.name);
    if (duplicate) {
      return {
        ok: false, status: 409, code: 'DUPLICATE_WARNING',
        error: `A client named "${input.name}" already exists`,
        data: duplicate,
      };
    }
  }

  const client = await createClient(tenantId, input.name, input.email, input as ClientCreateInput);
  await audit.log('Add Client', `Created agency client: ${input.name} (${client.id})`);
  return { ok: true, status: 201, data: client };
}

// ---------- update ----------

export async function updateAgencyClient(
  id: string,
  tenantId: string,
  payload: ClientCreatePayload,
  audit: AuditContext
): Promise<DomainResult<Client> | (DomainResult<DuplicateWarning> & { code: 'DUPLICATE_WARNING' })> {
  const existing = await getClientById(id, tenantId);
  if (!existing) return notFound('Client');

  const validated = validateClientUpdate(payload);
  if (!validated.ok) {
    return { ok: false, status: 400, error: validated.errors.map(e => `${e.field}: ${e.message}`).join('; ') };
  }
  const updates = validated.value;

  // Status changes through the update path also obey the lifecycle (§14) —
  // the dedicated transition endpoints are the primary route, but a PATCH
  // carrying a status must not smuggle in an illegal hop.
  if (updates.status && updates.status !== (existing.status ?? 'ACTIVE')) {
    const transition = validateClientStatusTransition(existing.status ?? 'ACTIVE', updates.status);
    if (!transition.ok) return { ok: false, status: 400, error: transition.error };
  }

  // §18 on rename: warn rather than silently colliding with another client's name
  if (updates.name && normalizeClientName(updates.name) !== normalizeClientName(existing.name)) {
    const duplicate = await checkClientDuplicate(tenantId, updates.name);
    if (duplicate && !duplicate.existing.some(c => c.id === id)) {
      return {
        ok: false, status: 409, code: 'DUPLICATE_WARNING',
        error: `A client named "${updates.name}" already exists`,
        data: duplicate,
      };
    }
  }

  if (Object.keys(updates).length === 0) {
    return { ok: false, status: 400, error: 'No valid client fields provided' };
  }

  const success = await updateClient(id, tenantId, updates);
  if (!success) return notFound('Client');
  await audit.log('Edit Client', `Updated client ${id} (${Object.keys(updates).join(', ')})`);
  const updated = await getClientById(id, tenantId);
  return { ok: true, status: 200, data: updated! };
}

// ---------- status transitions (§14/§15) ----------

async function transitionClientStatus(
  id: string, tenantId: string, to: ClientStatus,
  action: string, audit: AuditContext
): Promise<DomainResult<Client>> {
  const existing = await getClientById(id, tenantId);
  if (!existing) return notFound('Client');

  const from = existing.status ?? 'ACTIVE';
  const transition = validateClientStatusTransition(from, to);
  if (!transition.ok) return { ok: false, status: 400, error: transition.error };

  const success = await updateClient(id, tenantId, { status: to });
  if (!success) return notFound('Client');
  await audit.log(action, `Client ${id} → ${to} (was ${from})`);
  const updated = await getClientById(id, tenantId);
  return { ok: true, status: 200, data: updated! };
}

/** Archive = the delete surrogate (§15). Financial history stays resolvable. */
export function archiveAgencyClient(id: string, tenantId: string, audit: AuditContext) {
  return transitionClientStatus(id, tenantId, 'ARCHIVED', 'Archive Client', audit);
}

/** Restore returns the client to INACTIVE — un-archiving is not re-activation (§14). */
export async function restoreAgencyClient(
  id: string, tenantId: string, audit: AuditContext
): Promise<DomainResult<Client>> {
  // Restore is only meaningful from ARCHIVED. A legal ACTIVE→INACTIVE hop
  // would otherwise make "restore" a backdoor status change.
  const client = await getClientById(id, tenantId);
  if (!client) return notFound('Client');
  if ((client.status ?? 'ACTIVE') !== 'ARCHIVED') {
    return { ok: false, status: 400, error: 'Only archived clients can be restored' };
  }
  return transitionClientStatus(id, tenantId, 'INACTIVE', 'Restore Client', audit);
}

/** Explicit lifecycle transitions for the UI's status control. */
export function setAgencyClientStatus(id: string, tenantId: string, to: ClientStatus, audit: AuditContext) {
  return transitionClientStatus(id, tenantId, to, 'Update Client Status', audit);
}

export { canTransitionClientStatus };
