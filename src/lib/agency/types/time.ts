/**
 * Agency Vertical — Types: time tracking contract (Module 7, spec §5–§34)
 *
 * CLIENT-SAFE: types and pure functions only — no imports of lib/db, mongodb,
 * or any server-only module. React components import from here.
 *
 * THE TIME TRACKING RULEBOOK. Module 7 turns "this person is assigned to the
 * project" into "this person actually spent 2 hours on this project" (§4).
 * Everything here exists to keep that statement financially honest:
 *
 *   DURATION (§14)   — durationMinutes is the ONLY stored duration: a
 *                      positive integer, never decimal hours (80, not 1.33).
 *   SNAPSHOT (§6)    — a TimeEntry never depends on a live rate after
 *                      creation: the resolved cost/billing rates are frozen
 *                      onto the entry, so later card changes cannot rewrite
 *                      history (§7).
 *   EXPLICIT STATE   — approvalStatus and billingStatus are stored, never
 *                      inferred from missing data (§19, global Rule 3).
 *   ECONOMICS (§23)  — cost = hours × costRateSnapshot; billable value =
 *                      hours × billingRateSnapshot — computed at APPROVAL
 *                      from the frozen snapshot, never from live rates.
 *   MISSING RATE     — never zero (§24, and §96 of the rate contract): an
 *                      entry may be tracked without rates, but financial
 *                      recognition stays blocked via the explicit
 *                      financialStatus = RATE_CONFIGURATION_REQUIRED.
 *
 * Timer sessions (§9) are a SEPARATE entity: the timer is durable server-side
 * state (§10), one active timer per user (§11), and its elapsed time derives
 * from timestamps — never from interval accumulation (§12).
 */
import type { BusinessDate } from './dates';
import type { Money } from './money';
import type { ResolvedRate } from './rate';

// ---------- approval & billing state (§19, §5) ----------

export type TimeApprovalStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';

export const TIME_APPROVAL_STATUSES: readonly TimeApprovalStatus[] = [
  'DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED',
] as const;

/**
 * §5/§64 — the billing lifecycle. Module 9 widens the Module 7 union with
 * RESERVED: the item is selected by a DRAFT invoice (§63) — locked against a
 * second draft, not yet billed. INVOICED arrives at finalization.
 */
export type TimeBillingStatus = 'UNBILLED' | 'RESERVED' | 'INVOICED';

export const TIME_BILLING_STATUSES: readonly TimeBillingStatus[] = [
  'UNBILLED', 'RESERVED', 'INVOICED',
] as const;

/**
 * §24 — the explicit financial-recognition state. READY means every required
 * snapshot resolved and economics were computed. RATE_CONFIGURATION_REQUIRED
 * means the entry is TRACKED (it exists, flows through approval) but carries
 * no financial amounts — never zero (§96).
 */
export type TimeFinancialStatus = 'READY' | 'RATE_CONFIGURATION_REQUIRED';

/**
 * The states that make an entry invoice-eligible (Module 9 will re-check):
 * approved workflow-wise, financially recognized, billable, not yet billed.
 */
export function isInvoiceEligible(entry: Pick<TimeEntry, 'approvalStatus' | 'billingStatus' | 'billable' | 'financialStatus'>): boolean {
  return entry.approvalStatus === 'APPROVED'
    && entry.billingStatus === 'UNBILLED'
    && entry.billable === true
    && entry.financialStatus === 'READY';
}

// ---------- rate snapshot (§6) ----------

/**
 * WHERE a snapshot came from (§6). The labels are the TIME-MODULE's — the
 * resolver (types/rate.ts) calls the first one 'USER_ASSIGNMENT'; the mapping
 * happens once, in snapshotFromResolved below.
 */
export type RateSnapshotSource =
  | 'USER_COST_ASSIGNMENT'
  | 'CLIENT_RATE_CARD'
  | 'ORGANIZATION_RATE_CARD'
  | 'PROJECT_OVERRIDE';

/**
 * §6 — the frozen rate stored directly on a TimeEntry. `unit` is not in the
 * §6 sketch but is required to know whether `amount` multiplies by hours
 * (rate.ts §113) — time economics only ever price HOUR rates.
 */
export interface RateSnapshot {
  amount: number;
  currency: string;

  rateCardId?: string;
  rateCardEntryId?: string;

  effectiveFrom?: string;

  unit: 'HOUR' | 'DAY' | 'FIXED';

  source: RateSnapshotSource;
}

/** §6/§96 — a NOT_CONFIGURED resolution maps to NO snapshot (absent ≠ zero). */
export function snapshotFromResolved(resolved: ResolvedRate): RateSnapshot | null {
  if (resolved.status !== 'RESOLVED' || resolved.amount === undefined) return null;
  // Label normalization (documented once): the resolver's USER_ASSIGNMENT is
  // this module's USER_COST_ASSIGNMENT (§6). PROJECT_OVERRIDE has no resolver
  // tier yet (§90 reserved slot).
  const source: RateSnapshotSource = resolved.source === 'USER_ASSIGNMENT'
    ? 'USER_COST_ASSIGNMENT'
    : (resolved.source as RateSnapshotSource | undefined) ?? 'ORGANIZATION_RATE_CARD';
  return {
    amount: resolved.amount,
    currency: resolved.currency ?? 'INR',
    rateCardId: resolved.rateCardId,
    // Field-name mapping (documented once): the resolver's rateEntryId IS the
    // §6 rateCardEntryId.
    rateCardEntryId: resolved.rateEntryId,
    effectiveFrom: resolved.effectiveFrom,
    unit: resolved.unit ?? 'HOUR',
    source,
  };
}

// ---------- time entry (§5) ----------

export interface TimeEntry {
  id: string;
  tenantId: string;

  projectId: string;
  workItemId?: string;
  userId: string;

  /** Business date YYYY-MM-DD (§13). */
  date: string;

  /** §14 — positive integer minutes. Never decimal hours. */
  durationMinutes: number;

  /** §17 — explicit, never inferred from the project's billing model. */
  billable: boolean;

  approvalStatus: TimeApprovalStatus;
  billingStatus: TimeBillingStatus;

  /** §24 — explicit financial recognition state (Rule 3: never inferred). */
  financialStatus: TimeFinancialStatus;

  /** §6 — frozen at creation; absent when the rate was not configured. */
  costRateSnapshot?: RateSnapshot;
  /** §6 — frozen at creation; absent when not billable or rate missing. */
  billingRateSnapshot?: RateSnapshot;

  /** §23 — computed at approval from the snapshots; absent while blocked. */
  calculatedCost?: Money;
  calculatedBillableAmount?: Money;

  /** Module 9 (§61) — the invoice that billed this entry; null while the
   *  reservation is being cleared or the INVOICED mark reverted (§83). */
  invoiceId?: string | null;

  /** §63/§66 — the reservation trail while a draft invoice holds this entry.
   *  Null = cleared (no draft holds it). */
  reservedBy?: string | null;
  reservedAt?: Date | string | null;
  reservedInvoiceId?: string | null;

  /** §20 — the approver's reason, stored when rejected. */
  rejectionReason?: string;

  notes?: string;

  createdAt: Date | string;
  updatedAt: Date | string;
}

// ---------- timer session (§9) ----------

export type TimerStatus = 'RUNNING' | 'STOPPED' | 'DISCARDED';

export const TIMER_STATUSES: readonly TimerStatus[] = ['RUNNING', 'STOPPED', 'DISCARDED'] as const;

export interface TimerSession {
  id: string;
  tenantId: string;

  userId: string;

  projectId: string;
  workItemId?: string;

  startedAt: Date | string;

  status: TimerStatus;

  createdAt: Date | string;
}

// ---------- approval state machine (§19/§20/§22/§28) ----------

/**
 * Legal approvalStatus transitions. Dedicated actions own the arrows:
 *
 *   DRAFT     → SUBMITTED   submitTimeEntry (owner)
 *   SUBMITTED → APPROVED    approveTimeEntry (approver, never own time §21)
 *   SUBMITTED → REJECTED    rejectTimeEntry  (approver, reason required §20)
 *   APPROVED  → REJECTED    rejectTimeEntry  (the correction path — a bad
 *                                            approval returns the entry to
 *                                            editable state instead of being
 *                                            silently edited §28)
 *   REJECTED  → DRAFT       editing a rejected entry returns it to the
 *                            editable state (§20 recommended transition)
 *
 * Everything else (including any transition INTO a state via PATCH) is
 * illegal — status is never a PATCHable field.
 */
const APPROVAL_TRANSITIONS: Record<TimeApprovalStatus, readonly TimeApprovalStatus[]> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['APPROVED', 'REJECTED'],
  APPROVED: ['REJECTED'],
  REJECTED: ['DRAFT'],
};

export function canTransitionApprovalStatus(from: TimeApprovalStatus, to: TimeApprovalStatus): boolean {
  return APPROVAL_TRANSITIONS[from]?.includes(to) ?? false;
}

// ---------- edit lifecycle (§28) ----------

export type EditPolicy = 'FULL' | 'NOTES_ONLY' | 'LOCKED';

/**
 * §28 — the clean lifecycle:
 *
 *   before approval (DRAFT/REJECTED) → FULL edit (a REJECTED edit also
 *     returns the entry to DRAFT, §20)
 *   SUBMITTED                        → LOCKED pending review (recall = the
 *     approver rejects; there is no separate withdraw action in Phase 1)
 *   APPROVED, UNBILLED               → NOTES_ONLY (restricted edit + audit)
 *   billingStatus INVOICED (§22)     → LOCKED — no normal user may change
 *     duration, billable, snapshots or invoice linkage; corrections happen
 *     through a future controlled adjustment workflow
 */
export function editPolicyFor(entry: Pick<TimeEntry, 'approvalStatus' | 'billingStatus'>): EditPolicy {
  if (entry.billingStatus === 'INVOICED') return 'LOCKED';
  // §63 — a RESERVED entry is held by a draft invoice; its economics must
  // not drift while the draft exists. Remove the line (or void the draft)
  // to release it back to UNBILLED.
  if (entry.billingStatus === 'RESERVED') return 'LOCKED';
  if (entry.approvalStatus === 'SUBMITTED') return 'LOCKED';
  if (entry.approvalStatus === 'APPROVED') return 'NOTES_ONLY';
  return 'FULL';
}

/** The economic fields that become immutable once INVOICED (§22). */
export const INVOICED_LOCKED_FIELDS: readonly string[] = [
  'projectId', 'workItemId', 'date', 'durationMinutes', 'billable',
  'costRateSnapshot', 'billingRateSnapshot', 'calculatedCost',
  'calculatedBillableAmount', 'invoiceId',
] as const;

// ---------- duration (§14) ----------

/**
 * The repo write shape (§22/§28). Optional fields may be explicitly CLEARED
 * with null (rejection reason after resubmission, economics after
 * rejection); undefined means "leave unchanged". Mongo $set strips the
 * undefined keys; the doc mapper folds null back to undefined on read.
 */
export type TimeEntryUpdate = Partial<Omit<
  TimeEntry,
  'id' | 'tenantId' | 'userId' | 'createdAt'
  | 'rejectionReason' | 'calculatedCost' | 'calculatedBillableAmount'
  | 'costRateSnapshot' | 'billingRateSnapshot'
  | 'reservedBy' | 'reservedAt' | 'reservedInvoiceId'
>> & {
  rejectionReason?: string | null;
  calculatedCost?: Money | null;
  calculatedBillableAmount?: Money | null;
  costRateSnapshot?: RateSnapshot | null;
  billingRateSnapshot?: RateSnapshot | null;
  /** §63/§66 — reservation trail; null releases back to UNBILLED. */
  reservedBy?: string | null;
  reservedAt?: Date | string | null;
  reservedInvoiceId?: string | null;
};

/** Phase 1 bounds: at least one minute, at most one full day per entry. */
export const MIN_DURATION_MINUTES = 1;
export const MAX_DURATION_MINUTES = 24 * 60;

/** §14 — display formatting: 80 → "1h 20m". Pure, client-safe. */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * §14 — legacy decimal-hours input ("1.33") is converted at the validator
 * boundary, exactly like work-item estimates (Module 4 §9). 1.33h → 80m
 * (rounded to the nearest minute; the entry never stores decimals).
 */
export function minutesFromHoursInput(hours: number): number {
  return Math.round(hours * 60);
}

/** §23 — the factor snapshots multiply by: 120 minutes → 2 hours. */
export function hoursFromMinutes(minutes: number): number {
  return minutes / 60;
}

// ---------- §99 cost privacy (serialization) ----------

/**
 * §99 (rate-contract privacy, applied to time): an entry's cost side — the
 * frozen cost snapshot and the calculated cost — effectively exposes
 * compensation economics. The API strips it for non-admin consumers; admins
 * (and the audit trail) see the full record. Pure, client-safe.
 */
export function redactEntryCost<T extends TimeEntry>(entry: T): Omit<T, 'costRateSnapshot' | 'calculatedCost'> {
  const { costRateSnapshot: _c, calculatedCost: _m, ...rest } = entry;
  return rest;
}
