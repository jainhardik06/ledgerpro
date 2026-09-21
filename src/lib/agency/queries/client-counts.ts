/**
 * Agency Vertical — Queries: client counts (Module 2, Step 2.7)
 *
 * Live counts for the Agency Snapshot / dashboard integration. Follows the
 * queries/conventions.ts rules: indexed countDocuments (not find-then-sum),
 * tenantId first, local-JSON fallback with identical semantics.
 *
 * Legacy compatibility (spec §106): clients that predate Module 2 carry no
 * `status` field and resolve to ACTIVE on read — the count must include
 * them, so the filter matches either an explicit ACTIVE status or a missing
 * status. Index: clients { tenantId: 1, status: 1 } (created in connectDb).
 */
import { connectDb, initLocalDb } from '@/lib/db';

/** AGENCY_QUERY_INDEXES registry entry (see conventions.ts rule 2). */
// clients: [{ key: { tenantId: 1, status: 1 }, name: 'clients_tenant_status' }]

/**
 * Count the tenant's ACTIVE clients — the Module 1 "Active Clients" snapshot
 * line goes live on this number (spec §92: after Module 2, activeClients).
 * PROSPECT/PAUSED/INACTIVE/ARCHIVED clients are excluded: the line is
 * "Active Clients", not "All Clients".
 */
export async function countActiveClients(tenantId: string): Promise<number> {
  const { db } = await connectDb();
  if (db) {
    try {
      return await db.collection('clients').countDocuments({
        tenantId,
        $or: [
          { status: 'ACTIVE' },
          { status: { $exists: false } }, // pre-Module 2 clients (§106)
        ],
      });
    } catch {
      // fall through to the local store
    }
  }
  const data = initLocalDb();
  return data.clients
    .filter(c => c.tenantId === tenantId)
    .filter(c => (c.status ?? 'ACTIVE') === 'ACTIVE')
    .length;
}
