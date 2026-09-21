/**
 * Agency Vertical — Types: rate economics contract (Module 6, spec §55–§97)
 *
 * CLIENT-SAFE: types and pure functions only — no imports of lib/db, mongodb,
 * or any server-only module. React components import from here.
 *
 * THE RATE ECONOMICS RULEBOOK. Module 6 separates two economic truths that
 * must never be merged (§56):
 *
 *   INTERNAL ECONOMICS  — what the agency's labor COSTS (cost rate, ₹900/hr)
 *   CLIENT ECONOMICS    — what the client is CHARGED (billing rate, ₹2,500/hr)
 *
 * Architecture (§131 — supersedes the flat §59–§61 sketches):
 *
 *   RateCard ──┬── Entry: Senior Developer ──┬── Version 2025 → ₹700
 *              │                            └── Version 2026 → ₹900
 *              ├── Entry: Designer ──────────┬── Version 2025 → ₹600
 *              │                            └── Version 2026 → ₹700
 *              └── …
 *
 *   UserCostAssignment → points at a COST card + entry (via role match), so
 *   historical time entries stay financially stable when rates change (§64,
 *   §122: close old version + create new version — NEVER mutate history).
 *
 * Units: HOUR / DAY / FIXED only (§71); cost rates are HOUR-only in Phase 1
 * (§73). Billing types: HOURLY / FIXED / NON_BILLABLE (§72) — an ENTRY-level
 * concept, deliberately distinct from the project-level BillingModel.
 *
 * A missing rate is NEVER zero (§96): zero-cost work would falsely inflate
 * profitability. Resolution returns NOT_CONFIGURED and the UI shows
 * "not configured" (§97 — never hide missing financial configuration).
 */
import type { BusinessDate } from './dates';
import { addDays } from './dates';
import { toMinorUnits, fromMinorUnits } from './money';

// ---------- units & billing types (§71–§72) ----------

/** Rate units supported in Phase 1 (§71). PIECE/MONTH/PROJECT/PERCENTAGE come later if real use cases require. */
export type RateUnit = 'HOUR' | 'DAY' | 'FIXED';

export const RATE_UNITS: readonly RateUnit[] = ['HOUR', 'DAY', 'FIXED'] as const;

/** Phase 1 billing types (§72) — entry-level, NOT the project BillingModel. */
export type RateBillingType = 'HOURLY' | 'FIXED' | 'NON_BILLABLE';

export const RATE_BILLING_TYPES: readonly RateBillingType[] = [
  'HOURLY', 'FIXED', 'NON_BILLABLE',
] as const;

// ---------- RateCard (§59–§60, §63, §75–§76) ----------

/** Which economic truth a card carries (§56/§63) — never merged. */
export type RateCardType = 'COST' | 'BILLING';

export const RATE_CARD_TYPES: readonly RateCardType[] = ['COST', 'BILLING'] as const;

/**
 * §60 — one entity covers both the organization default card and the
 * client-specific card; `clientId` is required iff scope = CLIENT (§91).
 */
export type RateCardScope = 'ORGANIZATION' | 'CLIENT';

export const RATE_CARD_SCOPES: readonly RateCardScope[] = ['ORGANIZATION', 'CLIENT'] as const;

/** Rate cards are archived, never deleted (§75) — history may depend on them. */
export type RateCardStatus = 'ACTIVE' | 'ARCHIVED';

export const RATE_CARD_STATUSES: readonly RateCardStatus[] = ['ACTIVE', 'ARCHIVED'] as const;

/**
 * A named pricing structure (§57): a COST card models the agency's internal
 * labor economics; a BILLING card models client-facing pricing. The card is
 * NOT a user — users are attached via UserCostAssignment (cost side) or the
 * client/project hierarchy (billing side, §68/§89).
 */
export interface RateCard {
  id: string;
  tenantId: string;

  name: string;
  type: RateCardType;

  /** ISO-4217 (§74). Cost cards should use the agency's cost currency. */
  currency: string;

  scope: RateCardScope;
  /** Required iff scope = CLIENT (§91). Must be a same-tenant client. */
  clientId?: string;

  /** ACTIVE → ARCHIVED only; ARCHIVED cards can't receive new assignments but stay readable by history (§76). */
  status: RateCardStatus;

  createdAt: Date | string;
  updatedAt?: Date | string;
}

// ---------- RateCardEntry (§62) ----------

/**
 * One rate line inside a card (§62): "Senior Developer → ₹2,500/hr". Entries
 * carry the service/role identity; amounts live in versions so history is
 * stable (§64). The entry never belongs to a person (§87).
 */
export interface RateCardEntry {
  id: string;
  tenantId: string;
  rateCardId: string;

  /** Service/role label, e.g. "Senior Developer" (§87: Role / Service Name). */
  name: string;
  /** Optional finer-grained identity (kept free-form in Phase 1). */
  role?: string;
  serviceType?: string;

  unit: RateUnit;

  /**
   * §92/§95 — for COST entries this is the CURRENT amount (latest version's).
   * Resolution reads versions; this denormalized field exists for list/detail
   * rendering only. amount >= 0.
   */
  amount: number;
  currency: string;

  /** Whether work at this rate is billable (§72 — NON_BILLABLE entries carry false). */
  billable: boolean;

  /** How the entry bills (§72) — mirrors unit for FIXED/NON_BILLABLE distinctions. */
  billingType: RateBillingType;

  createdAt: Date | string;
  updatedAt?: Date | string;
}

// ---------- RateEntryVersion (§61 refined by §131, §64, §79, §122) ----------

/**
 * The effective-dated amount of one entry (§131). Historical work resolves
 * against the version whose [effectiveFrom, effectiveTo] contains the date —
 * INCLUSIVE on both ends (§79 convention, documented once here):
 *
 *   - effectiveTo = null/undefined means OPEN-ENDED: valid until replaced.
 *   - When a new version begins at date N, the previous version's
 *     effectiveTo is closed at N − 1 day (inclusive).
 *
 * "Rate changed from today" ALWAYS means: close the old version, create a new
 * one — never UPDATE an old version's amount (§122).
 */
export interface RateEntryVersion {
  id: string;
  tenantId: string;
  rateCardId: string;
  rateCardEntryId: string;

  amount: number;
  currency: string;

  /** Inclusive start (YYYY-MM-DD). */
  effectiveFrom: BusinessDate;
  /** Inclusive end (YYYY-MM-DD); null/undefined = open-ended (§79). */
  effectiveTo?: BusinessDate | null;

  createdAt: Date | string;
}

// ---------- UserCostAssignment (§68–§69) ----------

/**
 * Which COST card applies to a user over a time range (§68). Only COST cards
 * may be assigned to users (§93); billing is determined by the client/project
 * hierarchy, never a permanent per-user card (§89 — the client buys a role,
 * not a person, and people leaving the agency must not break pricing).
 *
 * Effective ranges must never overlap for the same user (§77) — validated
 * against this table at assignment time, using the same inclusive convention
 * as versions (§79).
 */
export interface UserCostAssignment {
  id: string;
  tenantId: string;

  userId: string;
  rateCardId: string;
  /**
   * §131 — the assignment points at the appropriate cost ENTRY ("Senior
   * Developer → ₹900"), not just the card: without it, resolution could not
   * know which rate line applies to this user. Required since the field was
   * introduced with the entity (no legacy rows predate it).
   */
  rateCardEntryId: string;

  effectiveFrom: BusinessDate;
  effectiveTo?: BusinessDate | null;

  createdAt: Date | string;
}

// ---------- effective-range algebra (§77/§79) ----------

/** An effective range with a possibly-open end. */
export interface EffectiveRange {
  effectiveFrom: BusinessDate;
  effectiveTo?: BusinessDate | null;
}

/**
 * §77 — do two INCLUSIVE ranges overlap? An open-ended range (effectiveTo
 * null/undefined) extends to +∞. Adjacent ranges (A ends exactly when B
 * starts) do NOT overlap: inclusive bounds touch but never share a day.
 */
export function rangesOverlap(a: EffectiveRange, b: EffectiveRange): boolean {
  const aTo = a.effectiveTo ?? null;
  const bTo = b.effectiveTo ?? null;

  // Degenerate/invalid ranges (from > to) never overlap anything.
  if (aTo !== null && a.effectiveFrom > aTo) return false;
  if (bTo !== null && b.effectiveFrom > bTo) return false;

  // Standard inclusive-interval overlap:
  // overlap iff aFrom <= bTo && bFrom <= aTo, treating null as +∞.
  const aEndsBeforeBStarts = aTo !== null && aTo < b.effectiveFrom;
  const bEndsBeforeAStarts = bTo !== null && bTo < a.effectiveFrom;
  return !(aEndsBeforeBStarts || bEndsBeforeAStarts);
}

/**
 * §79 — does the range cover a given date? Inclusive on both ends; an
 * open-ended range covers every date >= effectiveFrom.
 */
export function rangeCovers(range: EffectiveRange, date: BusinessDate): boolean {
  if (date < range.effectiveFrom) return false;
  if (range.effectiveTo != null && date > range.effectiveTo) return false;
  return true;
}

/** §79 — the day BEFORE a new version's start; the inclusive close for the old one. */
export function dayBefore(date: BusinessDate): BusinessDate {
  return addDays(date, -1);
}

// ---------- ResolvedRate (§95) ----------

/** Where a resolved rate came from — makes financial debugging possible (§95). */
export type ResolvedRateSource =
  | 'USER_ASSIGNMENT'      // cost: the user's assignment pointed at a cost card
  | 'CLIENT_RATE_CARD'     // billing: the client's specific card
  | 'ORGANIZATION_RATE_CARD'; // billing/cost: the agency default card

export type ResolvedRateStatus = 'RESOLVED' | 'NOT_CONFIGURED';

/**
 * §95 — the resolution contract. NEVER return a bare number: amount, currency,
 * provenance (card + entry + effective range) and source travel together, and
 * a missing rate is NOT_CONFIGURED (§96) rather than a fabricated zero.
 *
 * When status = NOT_CONFIGURED every other field is absent — callers render
 * "Cost rate not configured" and profitability marks the economics incomplete
 * (§97), never 100%-margin illusions.
 */
export interface ResolvedRate {
  status: ResolvedRateStatus;
  amount?: number;
  currency?: string;

  rateCardId?: string;
  rateEntryId?: string;

  effectiveFrom?: BusinessDate;
  effectiveTo?: BusinessDate | null;

  source?: ResolvedRateSource;

  /**
   * The entry's unit (HOUR/DAY/FIXED) — not in the §95 sketch, but future
   * time entries must know whether `amount` multiplies by hours before any
   * money is computed (§113).
   */
  unit?: RateUnit;
}

/** The canonical NOT_CONFIGURED result — single source, never re-built ad-hoc. */
export function rateNotConfigured(): ResolvedRate {
  return { status: 'NOT_CONFIGURED' };
}

// ---------- rate math (§105–§106) ----------

/**
 * §105 — money from duration. Cost/billing value of `quantity` units at
 * `amount` per unit (e.g. 8 hours × ₹900). Follows the money rulebook: the
 * rate is snapped to minor units first (it is a 2-decimal value by contract),
 * multiplied as an integer, then converted back once — never raw float math.
 */
export function rateAmountFor(amount: number, quantity: number): number {
  return fromMinorUnits(Math.round(toMinorUnits(amount) * quantity));
}

/**
 * §106 — labor contribution = client value − internal cost. Deliberately NOT
 * "profit": expenses and other delivery costs don't exist yet (§107).
 */
export function laborContribution(clientValue: number, internalCost: number): number {
  return fromMinorUnits(toMinorUnits(clientValue) - toMinorUnits(internalCost));
}
