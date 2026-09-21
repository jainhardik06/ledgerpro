/**
 * Agency Vertical — Permissions (Step 0.4 skeleton)
 *
 * Agency capability layer over the existing RBAC (SUPER_ADMIN / TENANT_ADMIN / USER).
 * PRD §60: evolve toward capability-based permissions WITHOUT breaking existing tenants.
 *
 * Responsibilities:
 *   - Gate all /api/agency/* routes: authenticated + tenant resolved + appMode === 'Agency'.
 *   - Later: capability checks (projects.read, time.approve, invoices.write, …)
 *     mapped from the existing role hierarchy until finer roles exist.
 *
 * Dependency direction: may import lib/auth and domain types only.
 */
export const AGENCY_PERMISSIONS = 'agency';
