/**
 * Agency Vertical — Types: authorization capabilities (Step 0.7)
 *
 * CLIENT-SAFE: types and pure functions only. No server imports.
 *
 * The agency permission vocabulary. Distinct from the vertical capabilities
 * in vertical.ts (which answer "is this feature enabled for the workspace?");
 * these answer "may this USER perform this action?"
 *
 * Model (PRD §60): evolve toward capability-based permissions WITHOUT
 * replacing the existing SUPER_ADMIN/TENANT_ADMIN/USER hierarchy.
 */
import type { TokenPayload } from '@/lib/auth';

/** The user/session shape can() accepts — structural, so both JWT payloads and API user objects work. */
export interface AuthorizedUser {
  userId: string;
  role: 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'USER';
  tenantId?: string;
}

/** Phase 1 agency permissions. */
export type AgencyPermission =
  | 'agency.dashboard.read'
  // Module 2 (spec §28): TENANT_ADMIN manages clients, USER reads them.
  // Reading rides on agency.dashboard.read; this is the write gate.
  | 'agency.clients.manage'
  // Module 3: TENANT_ADMIN manages projects (create, lifecycle, team,
  // work items, milestones), USER reads them via agency.dashboard.read.
  | 'agency.projects.manage'
  // Module 6 (§98): TENANT_ADMIN manages rate cards, entries and cost
  // assignments. USER is read-only — and only for the rates they may see
  // (the cost/billing read split below).
  | 'agency.rates.manage'
  // Module 6 (§99) — COST-RATE PRIVACY: an internal cost rate effectively
  // exposes salary/compensation economics. It is readable by admins only,
  // separately from billing rates, so the split can never be "fixed later"
  // by merging permissions.
  | 'agency.rates.cost.read'
  // Module 6 (§98/§99) — billing rates are client-facing pricing: agency
  // staff (incl. USERs — PMs view applicable billing rates) may read them.
  | 'agency.rates.billing.read'
  // Module 7 (§17/§21) — logging one's own time is a base capability of every
  // agency workspace member (§4: low-friction adoption). The DOMAIN enforces
  // ownership — a USER writes only their own entries; admins may correct.
  | 'agency.time.write'
  // Module 7 (§21) — approval is PM / Tenant Admin / finance territory. The
  // permission tier is admins here; the domain ADDITIONALLY grants the
  // project's own manager, and NEVER allows approving one's own time.
  | 'agency.time.approve'
  // Module 8 (§39/§51) — recording expenses is a base capability of every
  // agency member (like time §4). The DOMAIN enforces ownership — a USER
  // writes only their own expenses; admins may correct.
  | 'agency.expenses.write'
  // Module 8 (§40) — approval tier mirrors time (§21): admins (the project's
  // manager is granted by the domain, which knows projectManagerId).
  // Self-approval is NEVER allowed, regardless of role.
  | 'agency.expenses.approve'
  // Module 9 (§67/§81) — creating drafts and composing lines. Admin/finance
  // territory: an invoice is a client-facing financial document, not a
  // self-service artifact. The DOMAIN enforces DRAFT-only edits and §70
  // source eligibility on every line.
  | 'agency.invoices.write'
  // Module 10 (§110) — recording, confirming, failing and reversing
  // payments. Admin/finance territory (like invoicing §67): money movement
  // is never self-service. The DOMAIN enforces the §102 state machine, the
  // §91 overpayment rejection and the §108 account requirement.
  | 'agency.payments.write'
  // Module 11 (§29/§114 billing.tax.manage) — the agency's own billing
  // identity, tax profiles and (later sprints) invoice tax configuration.
  // Admin/finance territory: tax configuration shapes client-facing
  // financial documents. Reads ride on agency.dashboard.read.
  | 'agency.tax.manage'
  // Modules 11–14 (§114 profitability.read) — internal profitability is NOT
  // automatically visible to every team member: it exposes labor cost (the
  // same salary-economics privacy class as agency.rates.cost.read — cost is
  // Σ approved-time × frozen cost-rate snapshots, §63). Admins only; USERs
  // (PMs included) see delivery and billing surfaces, not the cost ledger.
  | 'agency.profitability.read'
  // Module 15 (§28 pattern; alerts admin §24) — managing alerts: the alert
  // lifecycle (acknowledge/resolve) and the rule configuration (enable/
  // disable, thresholds). Admin territory like the other manage perms —
  // alert READS ride agency.dashboard.read; severity counts are safe for
  // everyone, cost-bearing ROWS additionally need agency.profitability.read
  // (§114 privacy).
  | 'agency.alerts.manage'
  // Module 17 (§55/§56) — administering the agency workspace's configuration
  // (identity, billing defaults, alert thresholds, tax defaults, payment
  // credentials). Admin territory: settings shape every engine downstream.
  // Reads ride agency.dashboard.read — the settings PAGE is visible to all
  // agency users; only the write path is gated here (§55: "Unauthorized
  // users cannot modify settings").
  | 'agency.settings.manage'
  // Reserved for later modules (PRD §60) — do not wire until their sprints:
  // | 'agency.projects.read' | 'agency.projects.write'
  ;

/** Anything can() may need to check against (e.g. a project's owning tenant). */
export interface ResourceContext {
  tenantId?: string;
  [key: string]: unknown;
}

/** Narrow a session/user object to the structural shape can() needs. */
export function asAuthorizedUser(user: Pick<TokenPayload, 'userId' | 'role' | 'tenantId'> | null | undefined): AuthorizedUser | null {
  if (!user || !user.userId || !user.role) return null;
  return { userId: user.userId, role: user.role, tenantId: user.tenantId };
}
