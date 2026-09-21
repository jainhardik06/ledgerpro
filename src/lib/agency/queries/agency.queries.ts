/**
 * Agency Vertical — Queries (Step 0.4 skeleton)
 *
 * Read-side, server-side aggregation queries (PRD §105: indexed queries,
 * pagination, server-side aggregation — never fetch-everything-into-the-browser).
 *
 * Bound by docs/agency/phase-1/01-architecture-map.md:
 *   - Every query takes a session-resolved tenantId and scopes by it.
 *   - Query shapes must match the index strategy defined per-sprint
 *     (and registered in connectDb() alongside core indexes).
 *
 * No business calculations here — computed metrics belong in analytics/.
 */
export const AGENCY_QUERIES = 'agency';
