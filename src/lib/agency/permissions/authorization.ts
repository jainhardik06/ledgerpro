/**
 * Agency Vertical — Permissions: authorization abstraction (Step 0.7)
 *
 * can(user, capability, resource)
 *
 * This is the single authorization decision point for the Agency vertical.
 * It PRESERVES the existing hierarchy (SUPER_ADMIN > TENANT_ADMIN > USER) and
 * layers agency capability checks on top — nothing is replaced, so existing
 * tenants and roles behave exactly as before.
 *
 * Decision matrix (initial):
 *   SUPER_ADMIN  → allowed (impersonation flows through with the target tenantId)
 *   TENANT_ADMIN → allowed for all initial capabilities
 *   USER         → allowed only for capabilities explicitly granted to USER below
 *
 * Adding a permission later = add the type + one rule entry. No route changes.
 */
import type { AgencyPermission, AuthorizedUser, ResourceContext } from '../types/permissions';

/**
 * Per-permission rules. Each entry decides for a user given an optional
 * resource context (resource.tenantId must match the user's when present).
 */
const RULES: Partial<Record<AgencyPermission, (user: AuthorizedUser, resource?: ResourceContext) => boolean>> = {
  // Module 1 — everyone in the agency workspace may see the Command Center.
  'agency.dashboard.read': (user, resource) =>
    user.role === 'SUPER_ADMIN' || user.role === 'TENANT_ADMIN' || user.role === 'USER',
  // Module 2 (spec §28) — TENANT_ADMIN (or SUPER_ADMIN, incl. impersonation)
  // manages clients: create, edit, archive, restore. USER is read-only via
  // agency.dashboard.read. Deliberately no per-action granularity yet.
  'agency.clients.manage': (user, resource) =>
    user.role === 'SUPER_ADMIN' || user.role === 'TENANT_ADMIN',
  // Module 3 — same split as clients (§28 pattern): admin writes, USER reads.
  'agency.projects.manage': (user, resource) =>
    user.role === 'SUPER_ADMIN' || user.role === 'TENANT_ADMIN',
  // Module 6 (§98) — rate cards, entries and cost assignments are managed by
  // admins; there is deliberately no PM write tier in Phase 1.
  'agency.rates.manage': (user, resource) =>
    user.role === 'SUPER_ADMIN' || user.role === 'TENANT_ADMIN',
  // Module 6 (§99) — COST-RATE PRIVACY: internal cost rates ≈ salary data.
  // Admins only. This is separate from billing-rate reads so the boundary is
  // an explicit permission, never an afterthought.
  'agency.rates.cost.read': (user, resource) =>
    user.role === 'SUPER_ADMIN' || user.role === 'TENANT_ADMIN',
  // Module 6 (§98/§99) — billing rates are client-facing pricing; the whole
  // agency workspace may read them (PMs view applicable billing rates).
  'agency.rates.billing.read': (user, resource) =>
    user.role === 'SUPER_ADMIN' || user.role === 'TENANT_ADMIN' || user.role === 'USER',
  // Module 7 (§4/§17) — logging time is low-friction by design: every agency
  // member may write time entries. Ownership (own entries only for USERs)
  // is enforced by the domain, not the permission tier.
  'agency.time.write': (user, resource) =>
    user.role === 'SUPER_ADMIN' || user.role === 'TENANT_ADMIN' || user.role === 'USER',
  // Module 7 (§21) — approval tier: admins (PMs of the specific project are
  // granted by the domain, which knows projectManagerId). Self-approval is
  // NEVER allowed, regardless of role.
  'agency.time.approve': (user, resource) =>
    user.role === 'SUPER_ADMIN' || user.role === 'TENANT_ADMIN',
  // Module 8 (§39/§51) — recording spend is low-friction by design (like
  // time §4): every agency member may record expenses. Ownership (own
  // expenses only for USERs) is enforced by the domain, not the tier.
  'agency.expenses.write': (user, resource) =>
    user.role === 'SUPER_ADMIN' || user.role === 'TENANT_ADMIN' || user.role === 'USER',
  // Module 8 (§40) — approval tier mirrors time (§21): admins (the project's
  // manager is granted by the domain). Self-approval is NEVER allowed.
  'agency.expenses.approve': (user, resource) =>
    user.role === 'SUPER_ADMIN' || user.role === 'TENANT_ADMIN',
  // Module 9 (§67/§81) — invoicing is admin/finance work: an invoice is a
  // client-facing financial document. The domain adds DRAFT-only editing and
  // §70 source eligibility on every line.
  'agency.invoices.write': (user, resource) =>
    user.role === 'SUPER_ADMIN' || user.role === 'TENANT_ADMIN',
  // Module 10 (§110) — moving money is admin/finance work (like invoicing
  // §67). The domain adds the §102 state machine, the §91 overpayment
  // rejection, the §108 account requirement and §113 tenant integrity.
  'agency.payments.write': (user, resource) =>
    user.role === 'SUPER_ADMIN' || user.role === 'TENANT_ADMIN',
  // Module 11 (§29/§114) — tax configuration (billing identity, tax
  // profiles, invoice taxation) is admin/finance work: it shapes the legal
  // content of client-facing financial documents. USERs read the resulting
  // configuration via agency.dashboard.read.
  'agency.tax.manage': (user, resource) =>
    user.role === 'SUPER_ADMIN' || user.role === 'TENANT_ADMIN',
  // Modules 11–14 (§114 profitability.read) — internal profitability (labor
  // cost = salary economics, §63) is admin/finance visibility only, mirroring
  // agency.rates.cost.read. A team member (USER, PM included) does not
  // automatically see whether/what the agency's people cost.
  'agency.profitability.read': (user, resource) =>
    user.role === 'SUPER_ADMIN' || user.role === 'TENANT_ADMIN',
  // Module 15 (§24/§28) — alert administration: acknowledge/resolve any
  // alert, evaluate on demand, and edit the rule configuration. Admin
  // territory, like the other manage permissions: alert visibility itself
  // rides agency.dashboard.read (with §114 cost-row filtering).
  'agency.alerts.manage': (user, resource) =>
    user.role === 'SUPER_ADMIN' || user.role === 'TENANT_ADMIN',
  // Module 17 (§55/§56) — agency settings administration (general, billing,
  // profitability thresholds, tax defaults, payment credentials). Admin
  // territory like every other manage permission; settings READS ride
  // agency.dashboard.read.
  'agency.settings.manage': (user, resource) =>
    user.role === 'SUPER_ADMIN' || user.role === 'TENANT_ADMIN',
};

/**
 * The authorization primitive.
 *
 * @param user     the session user (from asAuthorizedUser / the verified JWT)
 * @param capability agency permission to check
 * @param resource optional context; when it carries a tenantId, the user's
 *                 tenantId must match (cross-tenant access is always false)
 * @returns true when the action is allowed
 */
export function can(
  user: AuthorizedUser | null | undefined,
  capability: AgencyPermission,
  resource?: ResourceContext
): boolean {
  if (!user || !user.userId) return false;

  // Tenant boundary: a resource owned by another tenant is never accessible,
  // regardless of role. (SUPER_ADMIN impersonation carries the target tenantId.)
  if (resource?.tenantId && user.tenantId && resource.tenantId !== user.tenantId) {
    return false;
  }

  const rule = RULES[capability];
  return rule ? rule(user, resource) : false;
}

/**
 * Convenience for API routes: resolve the agency context (Step 0.5 vertical
 * gate) and apply can() for a permission in one call. Routes use this at the
 * top of each handler:
 *
 *   const gate = await requireAgencyPermission('agency.dashboard.read');
 *   if (!gate.ok) return NextResponse.json({ error: gate.error, ...gate }, { status: gate.status });
 *
 * The full Module 1.18 chain runs here in order:
 *   Session → Tenant → Agency Mode Check → Permission Check
 * and the failure branch carries the vertical gate's code/redirectTo
 * (application response for non-agency tenants) through to the route.
 *
 * The session's tenantId is the resource boundary by default — per-entity
 * ownership checks happen in repositories/domain code with the entity's
 * tenantId passed as the resource.
 */
export async function requireAgencyPermission(
  capability: AgencyPermission
): Promise<
  | { ok: true; context: import('../permissions/vertical').VerticalContext }
  | { ok: false; status: 401 | 403; error: string; code?: string; redirectTo?: string }
> {
  const { requireAgencyVertical } = await import('./vertical');
  const resolved = await requireAgencyVertical();
  if (!resolved.ok) return resolved;

  const user: AuthorizedUser = {
    userId: resolved.context.session.userId,
    role: resolved.context.session.role,
    tenantId: resolved.context.session.tenantId,
  };

  if (!can(user, capability, { tenantId: resolved.context.tenant.id || resolved.context.tenant._id?.toString() })) {
    return { ok: false, status: 403, error: 'You do not have permission to perform this action' };
  }

  return resolved;
}
