/**
 * Agency Vertical — Domain: rate resolution engine (Module 6, §65–§67, §94–§97)
 *
 * THE rate lookup of the entire system. Module 7 Time Tracking calls these
 * functions — the engine lives HERE, never inside the time-entry module (§94).
 *
 *   resolveCostRate(tenantId, userId, date, role?)
 *     §66 order:  USER ASSIGNMENT  →  ORGANIZATION DEFAULT COST  →  NOT_CONFIGURED
 *
 *   resolveBillingRate(tenantId, clientId, projectId, date, role)
 *     §67 order:  (future: project override)  →  CLIENT RATE CARD
 *                 →  AGENCY DEFAULT BILLING CARD  →  NOT_CONFIGURED
 *     Module 6 deliberately does NOT implement the project override (§90) —
 *     the parameter and this comment are the reserved slot.
 *
 * NON-NEGOTIABLE (§96): a missing rate is NEVER zero. Zero-cost work would
 * falsely inflate profitability. The result is NOT_CONFIGURED and the caller
 * shows "not configured" / marks economics incomplete (§97).
 *
 * Determinism rules (documented once, binding):
 *   - Dates are business dates (YYYY-MM-DD); version/assignment ranges are
 *     INCLUSIVE with open-ended ends (§79 — see types/rate.ts).
 *   - If several ranges cover the date (a data-integrity violation of §77 —
 *     the domain prevents it), the one with the LATEST effectiveFrom wins.
 *     Never arbitrary, never first-come.
 *   - Archived cards still resolve (§76: history may reference them); the
 *     archive flag blocks NEW entries/assignments, not date-based reads.
 *   - Card matching for the client/org fallbacks scans cards oldest-first
 *     (createdAt) — deterministic when more than one card matches.
 *   - Entry matching for billing (and the cost org-default fallback) is by
 *     role/service label: case-insensitive exact match on the entry's name
 *     or role. No fuzzy guessing, no AI (conventions rule #10).
 */
import {
  getRateCards, getRateCardById, getRateCardEntryById,
  listRateCardEntries, listRateEntryVersions, getUserCostAssignments,
} from '@/lib/db';
import type {
  RateCard, RateCardEntry, ResolvedRate, RateUnit,
} from '../types/rate';
import { rangeCovers, rateNotConfigured } from '../types/rate';
import type { BusinessDate } from '../types/dates';

/** Case-insensitive exact role/service label match against an entry (§94 "role/service"). */
function exactMatchesRole(entry: RateCardEntry, role: string): boolean {
  const wanted = role.trim().toLowerCase();
  if (!wanted) return false;
  return entry.name.trim().toLowerCase() === wanted
    || (entry.role !== undefined && entry.role.trim().toLowerCase() === wanted);
}

const COMMON_PREFIXES_REGEX = /\b(project|senior|lead|associate|junior|principal)\s+/gi;

/** Normalized base title (e.g. "Project Manager" -> "manager", "Senior Developer" -> "developer"). */
function normalizeBaseRole(role: string): string {
  return role.trim().toLowerCase().replace(COMMON_PREFIXES_REGEX, '').trim();
}

/** Fallback match checking normalized base role. */
function baseRoleMatches(entry: RateCardEntry, role: string): boolean {
  const wantedBase = normalizeBaseRole(role);
  if (!wantedBase) return false;
  const nameBase = normalizeBaseRole(entry.name);
  const roleBase = entry.role ? normalizeBaseRole(entry.role) : '';
  return wantedBase === nameBase || (!!roleBase && wantedBase === roleBase);
}

/**
 * Resolve the version of one entry that covers `date`, returning the §95
 * contract body. Private — callers wrap it with their source label.
 */
async function resolveEntryVersion(
  tenantId: string,
  card: RateCard,
  entry: RateCardEntry,
  date: BusinessDate
): Promise<ResolvedRate> {
  const versions = await listRateEntryVersions(tenantId, card.id, entry.id);
  // Latest effectiveFrom among covering versions (determinism rule).
  const covering = versions
    .filter(v => rangeCovers(v, date))
    .sort((a, b) => (a.effectiveFrom > b.effectiveFrom ? -1 : 1));
  const version = covering[0];
  if (!version) return rateNotConfigured();
  return {
    status: 'RESOLVED',
    amount: version.amount,
    currency: version.currency,
    rateCardId: card.id,
    rateEntryId: entry.id,
    effectiveFrom: version.effectiveFrom,
    effectiveTo: version.effectiveTo ?? null,
    unit: entry.unit,
  };
}

/**
 * Scan cards (oldest-first) for the first entry matching `role`, then resolve
 * its version at `date`. Shared by the cost org-default fallback and both
 * billing tiers. Exact match takes precedence over base role fallback.
 */
async function resolveByRoleInCards(
  tenantId: string,
  cards: RateCard[],
  role: string | undefined,
  date: BusinessDate
): Promise<ResolvedRate> {
  if (!role) return rateNotConfigured();
  const ordered = [...cards].sort((a, b) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  for (const card of ordered) {
    // Entries load per card; first exact match wins, then base role fallback.
    const entries = await listRateCardEntries(card.id, tenantId);
    let entry = entries.find(e => exactMatchesRole(e, role));
    if (!entry) {
      entry = entries.find(e => baseRoleMatches(e, role));
    }
    if (!entry) continue;
    const resolved = await resolveEntryVersion(tenantId, card, entry, date);
    if (resolved.status === 'RESOLVED') return resolved;
  }
  return rateNotConfigured();
}

// ---------- §66 cost resolution ----------

/**
 * The applicable INTERNAL cost rate for a user on a date.
 *
 * Order (§66): the user's assignment (which pins the exact entry, §131) →
 * the organization default cost card by role → NOT_CONFIGURED. The `role`
 * parameter is OPTIONAL and only feeds the org-default fallback — an
 * assignment needs no role because it pins its entry directly.
 */
export async function resolveCostRate(
  tenantId: string,
  userId: string,
  date: BusinessDate,
  role?: string
): Promise<ResolvedRate> {
  // 1. §66 — user-specific assignment.
  const assignments = await getUserCostAssignments(userId, tenantId, { includeEnded: true });
  const covering = assignments
    .filter(a => rangeCovers(a, date))
    .sort((a, b) => (a.effectiveFrom > b.effectiveFrom ? -1 : 1));
  const assignment = covering[0];
  if (assignment) {
    const card = await getRateCardById(assignment.rateCardId, tenantId);
    if (card && card.type === 'COST') {
      const entry = await getRateCardEntryById(assignment.rateCardEntryId, assignment.rateCardId, tenantId);
      if (entry) {
        const resolved = await resolveEntryVersion(tenantId, card, entry, date);
        if (resolved.status === 'RESOLVED') {
          return { ...resolved, source: 'USER_ASSIGNMENT' };
        }
      }
    }
    // A dangling assignment (card/entry/version gone missing) falls through
    // to the org default rather than silently zeroing — §96 in action.
  }

  // 2. §66 — organization default cost card, matched by role.
  const orgCostCards = await getRateCards(tenantId, { type: 'COST', scope: 'ORGANIZATION' });
  const fromOrg = await resolveByRoleInCards(tenantId, orgCostCards, role, date);
  if (fromOrg.status === 'RESOLVED') {
    return { ...fromOrg, source: 'ORGANIZATION_RATE_CARD' };
  }

  // 3. §66/§96 — no rate. NEVER zero.
  return rateNotConfigured();
}

// ---------- §67 billing resolution ----------

/**
 * The applicable CLIENT-FACING billing rate for a role/service on a date.
 *
 * Order (§67): (future: project-specific override — reserved, not yet
 * implemented §90) → the client's specific billing card → the agency default
 * billing card → NOT_CONFIGURED.
 *
 * `projectId` is accepted and currently unused except as the documented
 * reserved slot for the project-override tier (§90); `role` is REQUIRED —
 * billing prices a service, not a person (§89).
 */
export async function resolveBillingRate(
  tenantId: string,
  clientId: string,
  /** §90 reserved slot — the future project-specific override tier reads this. */
  projectId: string | null | undefined,
  date: BusinessDate,
  role: string
): Promise<ResolvedRate> {
  // 1. (Reserved §90) project-specific override — a future tier inserts here.

  // 2. §67 — the client's specific card overrides whatever it defines.
  if (clientId) {
    const clientCards = await getRateCards(tenantId, { type: 'BILLING', scope: 'CLIENT', clientId });
    const fromClient = await resolveByRoleInCards(tenantId, clientCards, role, date);
    if (fromClient.status === 'RESOLVED') {
      return { ...fromClient, source: 'CLIENT_RATE_CARD' };
    }
    // A client card that doesn't define this role falls through to the
    // agency default — the client overrides only what it prices.
  }

  // 3. §67 — the agency default billing card.
  const orgCards = await getRateCards(tenantId, { type: 'BILLING', scope: 'ORGANIZATION' });
  const fromOrg = await resolveByRoleInCards(tenantId, orgCards, role, date);
  if (fromOrg.status === 'RESOLVED') {
    return { ...fromOrg, source: 'ORGANIZATION_RATE_CARD' };
  }

  // 4. §67/§96 — no rate. NEVER zero.
  return rateNotConfigured();
}
