/**
 * Agency Vertical — Domain (Step 0.4 skeleton)
 *
 * Home of Agency entity definitions and tenant-scoped repositories.
 * Bound by docs/agency/phase-1/02-data-boundary.md:
 *   - Agency entities live here; core entities stay in src/lib/db.ts.
 *   - Every agency entity carries tenantId; every query is tenant-scoped
 *     with a session-resolved tenantId (never client-supplied).
 *   - Repositories are the ONLY writers of agency fields on core entities.
 *
 * Populated per-sprint (Clients & Projects first). Intentionally empty at Step 0.
 */
export const AGENCY_DOMAIN = 'agency';
