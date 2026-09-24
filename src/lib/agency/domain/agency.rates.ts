/**
 * Agency Vertical — Domain: rate economics service (Module 6, §101–§122)
 *
 * The ONLY writer path for rate-card operations. React components never touch
 * MongoDB — they go API route → this service → db.ts.
 *
 * Responsibilities:
 *   - Two economic truths never merge (§56): COST cards carry internal
 *     labor economics, BILLING cards carry client-facing pricing.
 *   - Cards archive, never delete (§75); an archived card accepts no new
 *     entries or assignments but history keeps reading it (§76).
 *   - Versioning (§64/§122): "rate changed from today" ALWAYS closes the old
 *     version and creates a new one — an old version is never mutated except
 *     by its own closing effectiveTo.
 *   - Assignments (§68/§77/§79): a user's cost-card assignments may never
 *     overlap; an OPEN-ENDED assignment is replaceable forward in time
 *     (auto-closed the day before the new one starts), a CLOSED range is
 *     history and overlaps reject.
 *   - Audit (§82): RATE_CARD_CREATED/UPDATED/ARCHIVED, RATE_ENTRY_CREATED/
 *     UPDATED, USER_COST_RATE_ASSIGNED/CHANGED/ENDED.
 */
import {
  getClientById, getUserById,
  getRateCards, getRateCardById,
  createRateCard as createRateCardRepo, updateRateCard as updateRateCardRepo,
  listRateCardEntries, listAllRateCardEntries, getRateCardEntryById,
  createRateCardEntry, updateRateCardEntry,
  createRateEntryVersion, closeRateEntryVersion, listRateEntryVersions,
  getUserCostAssignments, getUserCostAssignmentById, getUserCostAssignmentsByCard,
  createUserCostAssignment, updateUserCostAssignment,
} from '@/lib/db';
import type {
  RateCard, RateCardEntry, RateEntryVersion, UserCostAssignment,
} from '../types/rate';
import type { RateCardListFilters } from '@/lib/db';
import { rangesOverlap, dayBefore } from '../types/rate';
import {
  validateRateCardCreate, validateRateCardUpdate, validateRateEntry,
  validateUserCostAssignment,
  type RateCardPayload, type RateEntryPayload, type UserCostAssignmentPayload,
} from '../validators/rate';
import { checkProjectUserIntegrity } from './project-integrity';
import { agencyToday } from './agency.settings';
import { type AuditContext, type DomainResult } from './agency.clients';

const notFound = (what: string): DomainResult<never> =>
  ({ ok: false, status: 404, error: `${what} not found` });

const badRequest = (error: string): DomainResult<never> =>
  ({ ok: false, status: 400, error });

const conflict = (error: string): DomainResult<never> =>
  ({ ok: false, status: 409, error });

/** §85 — one card with its entries and full version history (§131). */
export interface RateCardDetail {
  card: RateCard;
  entries: Array<RateCardEntry & { versions: RateEntryVersion[] }>;
  /** §88 — COST cards only: who is assigned to this card (full history). */
  assignments?: UserCostAssignment[];
}

/** A rate-card list row: the card plus its entry count (§84 list column). */
export interface RateCardListRow extends RateCard {
  entryCount: number;
}

// ---------- read ----------

/** §84 — the card list with entry counts, one tenant-wide entries scan. */
export async function listRateCards(
  tenantId: string,
  filters: RateCardListFilters = {}
): Promise<DomainResult<RateCardListRow[]>> {
  const [cards, allEntries] = await Promise.all([
    getRateCards(tenantId, filters),
    listAllRateCardEntries(tenantId),
  ]);
  const counts = new Map<string, number>();
  for (const entry of allEntries) {
    counts.set(entry.rateCardId, (counts.get(entry.rateCardId) ?? 0) + 1);
  }
  return {
    ok: true,
    status: 200,
    data: cards.map(card => ({ ...card, entryCount: counts.get(card.id) ?? 0 })),
  };
}

/** §85 — one card with its entries and full version history (§131). */
export async function getRateCardDetail(
  rateCardId: string,
  tenantId: string
): Promise<DomainResult<RateCardDetail>> {
  const card = await getRateCardById(rateCardId, tenantId);
  if (!card) return notFound('Rate card');
  const [entries, versions] = await Promise.all([
    listRateCardEntries(rateCardId, tenantId),
    listRateEntryVersions(tenantId, rateCardId),
  ]);
  const byEntry = new Map<string, RateEntryVersion[]>();
  for (const version of versions) {
    const list = byEntry.get(version.rateCardEntryId) ?? [];
    list.push(version);
    byEntry.set(version.rateCardEntryId, list);
  }
  // §88 — the cost card detail carries its user assignments so the detail
  // page can render "who is on this card" without a second round trip.
  // Billing cards never have assignments (§89) — no query, no field.
  const assignments = card.type === 'COST'
    ? await getUserCostAssignmentsByCard(rateCardId, tenantId)
    : undefined;
  return {
    ok: true,
    status: 200,
    data: {
      card,
      entries: entries.map(e => ({ ...e, versions: byEntry.get(e.id) ?? [] })),
      ...(assignments ? { assignments } : {}),
    },
  };
}

// ---------- rate card lifecycle ----------

/** §86 — create a card. Client-scoped cards require a SAME-TENANT client (§91/§113). */
export async function createRateCard(
  tenantId: string,
  payload: RateCardPayload,
  audit: AuditContext
): Promise<DomainResult<RateCard>> {
  const validated = validateRateCardCreate(payload);
  if (!validated.ok) {
    return badRequest(validated.errors.map(e => `${e.field}: ${e.message}`).join('; '));
  }
  const { name, type, scope, currency } = validated.value;

  let clientId: string | undefined;
  if (scope === 'CLIENT') {
    clientId = validated.value.clientId;
    // §113 — a missing client and another tenant's client are identical here.
    const client = await getClientById(clientId!, tenantId);
    if (!client) return badRequest('Client not found');
  }

  const card = await createRateCardRepo(tenantId, { name, type, currency, scope, clientId });
  await audit.log('RATE_CARD_CREATED', `Rate card "${name}" created (${type}, ${scope}${clientId ? `, client ${clientId}` : ''}, ${currency})`);
  return { ok: true, status: 201, data: card };
}

/**
 * §100 PATCH — name (and the client binding of a CLIENT card) may change.
 * type/scope/currency are IMMUTABLE: they define the card's role in the
 * resolution engine and its monetary meaning — a different type or currency
 * is a different card.
 */
export async function updateRateCard(
  rateCardId: string,
  tenantId: string,
  payload: RateCardPayload,
  audit: AuditContext
): Promise<DomainResult<null>> {
  const card = await getRateCardById(rateCardId, tenantId);
  if (!card) return notFound('Rate card');

  if (payload.type !== undefined && payload.type !== card.type) {
    return badRequest('Rate card type is immutable — create a new card instead');
  }
  if (payload.scope !== undefined && payload.scope !== card.scope) {
    return badRequest('Rate card scope is immutable — create a new card instead');
  }
  if (payload.currency !== undefined && payload.currency !== card.currency) {
    return badRequest('Rate card currency is immutable — create a new card instead');
  }

  const validated = validateRateCardUpdate(payload);
  if (!validated.ok) {
    return badRequest(validated.errors.map(e => `${e.field}: ${e.message}`).join('; '));
  }

  const updates: Record<string, unknown> = {};
  if (validated.value.name !== undefined && validated.value.name !== card.name) {
    updates.name = validated.value.name;
  }
  if (validated.value.clientId !== undefined && validated.value.clientId !== card.clientId) {
    if (card.scope !== 'CLIENT') {
      return badRequest('Only client-scoped rate cards can be tied to a client');
    }
    const client = await getClientById(validated.value.clientId, tenantId);
    if (!client) return badRequest('Client not found');
    updates.clientId = validated.value.clientId;
  }
  if (Object.keys(updates).length === 0) {
    return badRequest('No valid rate card fields provided');
  }

  const success = await updateRateCardRepo(rateCardId, tenantId, updates);
  if (!success) return notFound('Rate card');
  await audit.log('RATE_CARD_UPDATED', `Rate card "${card.name}" updated (${Object.keys(updates).join(', ')})`);
  return { ok: true, status: 200 };
}

/** §75/§76 — ACTIVE → ARCHIVED. History keeps reading the card. */
export async function archiveRateCard(
  rateCardId: string,
  tenantId: string,
  audit: AuditContext
): Promise<DomainResult<null>> {
  const card = await getRateCardById(rateCardId, tenantId);
  if (!card) return notFound('Rate card');
  if (card.status === 'ARCHIVED') {
    return badRequest('Rate card is already archived');
  }
  const success = await updateRateCardRepo(rateCardId, tenantId, { status: 'ARCHIVED' });
  if (!success) return notFound('Rate card');
  await audit.log('RATE_CARD_ARCHIVED', `Rate card "${card.name}" archived — it can no longer receive new entries or assignments, but history is preserved`);
  return { ok: true, status: 200 };
}

/** Restore rides RATE_CARD_UPDATED (§82 has no separate restore event). */
export async function restoreRateCard(
  rateCardId: string,
  tenantId: string,
  audit: AuditContext
): Promise<DomainResult<null>> {
  const card = await getRateCardById(rateCardId, tenantId);
  if (!card) return notFound('Rate card');
  if (card.status !== 'ARCHIVED') {
    return badRequest('Rate card is not archived');
  }
  const success = await updateRateCardRepo(rateCardId, tenantId, { status: 'ACTIVE' });
  if (!success) return notFound('Rate card');
  await audit.log('RATE_CARD_UPDATED', `Rate card "${card.name}" restored to active`);
  return { ok: true, status: 200 };
}

// ---------- rate entries ----------

/**
 * §87 — add one rate line to a card, with its FIRST version. Cost cards are
 * HOUR-only in Phase 1 (§73) and never billable (they price internal labor);
 * billing cards derive sane defaults when the payload omits them.
 */
export async function createRateEntry(
  rateCardId: string,
  tenantId: string,
  payload: RateEntryPayload,
  audit: AuditContext
): Promise<DomainResult<RateCardEntry>> {
  const card = await getRateCardById(rateCardId, tenantId);
  if (!card) return notFound('Rate card');
  // §76 — an archived card accepts no new entries.
  if (card.status === 'ARCHIVED') {
    return badRequest('Rate card is archived — restore it before adding rates');
  }

  const validated = validateRateEntry(payload);
  if (!validated.ok) {
    return badRequest(validated.errors.map(e => `${e.field}: ${e.message}`).join('; '));
  }
  const v = validated.value;
  if (v.amount === undefined) return badRequest('amount: Rate is required');

  let { unit, billingType, billable } = v;
  let { role, serviceType } = v;
  if (card.type === 'COST') {
    if (unit !== undefined && unit !== 'HOUR') {
      return badRequest('Cost rates must use the HOUR unit');
    }
    unit = 'HOUR';
    billingType = 'HOURLY';
    // A cost rate prices internal labor — it is never itself a billable line.
    billable = false;
  } else {
    if (unit === undefined) unit = 'HOUR';
    if (billingType === undefined) billingType = unit === 'FIXED' ? 'FIXED' : 'HOURLY';
    if (billable === undefined) billable = billingType !== 'NON_BILLABLE';
  }
  // '' on role/serviceType means "clear" — undefined means "not sent"; for a
  // CREATE both end up absent.
  if (role === '') role = undefined;
  if (serviceType === '') serviceType = undefined;

  const entry = await createRateCardEntry(tenantId, rateCardId, {
    name: v.name!,
    role,
    serviceType,
    unit: unit!,
    amount: v.amount,
    currency: card.currency,
    billable: billable!,
    billingType: billingType!,
  });
  // The first version opens at the payload's effectiveFrom (§87 field).
  await createRateEntryVersion(tenantId, rateCardId, entry.id, {
    amount: v.amount,
    currency: card.currency,
    effectiveFrom: v.effectiveFrom!,
  });
  await audit.log('RATE_ENTRY_CREATED', `Rate "${v.name}" added to card "${card.name}" (${card.currency} ${v.amount}/${unit!.toLowerCase()} from ${v.effectiveFrom})`);
  return { ok: true, status: 201, data: entry };
}

/**
 * §122 — the historical-integrity rule in action. A PATCH may (a) edit entry
 * metadata, and/or (b) change the rate — which NEVER updates the old version:
 * the open version closes the day before the new effectiveFrom and a NEW
 * version begins. Rates only ever move forward in time.
 */
export async function updateRateEntry(
  rateCardId: string,
  entryId: string,
  tenantId: string,
  payload: RateEntryPayload,
  audit: AuditContext
): Promise<DomainResult<null>> {
  const card = await getRateCardById(rateCardId, tenantId);
  if (!card) return notFound('Rate card');
  const entry = await getRateCardEntryById(entryId, rateCardId, tenantId);
  if (!entry) return notFound('Rate entry');

  const versions = await listRateEntryVersions(tenantId, rateCardId, entryId);
  const openVersion = versions.find(v => v.effectiveTo == null) ?? null;

  // Merge row identity (M4/M5 lesson): PATCH is partial, the validator
  // demands name + effectiveFrom, so absent fields validate against the row.
  const merged: RateEntryPayload = {
    ...payload,
    name: payload.name !== undefined ? payload.name : entry.name,
    effectiveFrom: payload.effectiveFrom !== undefined
      ? payload.effectiveFrom
      : openVersion?.effectiveFrom,
  };
  const validated = validateRateEntry(merged);
  if (!validated.ok) {
    return badRequest(validated.errors.map(e => `${e.field}: ${e.message}`).join('; '));
  }
  const v = validated.value;

  // ----- (b) the rate itself: close old + create new (§122) -----
  if (payload.amount !== undefined && payload.amount !== openVersion?.amount) {
    if (payload.effectiveFrom === undefined) {
      return badRequest('effectiveFrom: Changing the rate requires the date the new rate begins');
    }
    // The validator above checked merged fields; narrow the payload's own
    // values away from `unknown` (guards above established both are present).
    const newFrom = payload.effectiveFrom as string;
    const newAmount = payload.amount as number;
    if (openVersion) {
      if (newFrom <= openVersion.effectiveFrom) {
        return badRequest('Rates change forward in time — the new effective date must be after the current version\'s start');
      }
      // §79 — inclusive close the day before the new version begins.
      await closeRateEntryVersion(openVersion.id, tenantId, dayBefore(newFrom));
    }
    await createRateEntryVersion(tenantId, rateCardId, entryId, {
      amount: newAmount,
      currency: card.currency,
      effectiveFrom: newFrom,
    });
    // Keep the denormalized current-amount on the entry in step.
    await updateRateCardEntry(entryId, rateCardId, tenantId, { amount: newAmount });
  }

  // ----- (a) metadata -----
  const metadata: Record<string, unknown> = {};
  if (v.name !== undefined && v.name !== entry.name) metadata.name = v.name;
  // '' means CLEAR (validator passthrough), undefined means not sent.
  if (payload.role !== undefined) {
    const cleared = v.role === '' ? '' : v.role;
    if ((cleared || undefined) !== (entry.role || undefined)) {
      if (cleared === '') metadata.role = '';
      else if (cleared !== undefined) metadata.role = cleared;
    }
  }
  if (payload.serviceType !== undefined) {
    const cleared = v.serviceType === '' ? '' : v.serviceType;
    if ((cleared || undefined) !== (entry.serviceType || undefined)) {
      if (cleared === '') metadata.serviceType = '';
      else if (cleared !== undefined) metadata.serviceType = cleared;
    }
  }
  if (v.unit !== undefined && v.unit !== entry.unit) {
    if (card.type === 'COST') return badRequest('Cost rates must use the HOUR unit');
    metadata.unit = v.unit;
  }
  if (v.billingType !== undefined && v.billingType !== entry.billingType) metadata.billingType = v.billingType;
  if (v.billable !== undefined && v.billable !== entry.billable) {
    if (card.type === 'COST') return badRequest('Cost rates are never billable');
    metadata.billable = v.billable;
  }
  if (Object.keys(metadata).length > 0) {
    await updateRateCardEntry(entryId, rateCardId, tenantId, metadata);
  }

  if (payload.amount !== undefined && Object.keys(metadata).length === 0 && payload.amount === openVersion?.amount) {
    // Pure idempotent PATCH — same rate, nothing else. Honest 200.
    return { ok: true, status: 200 };
  }

  await audit.log('RATE_ENTRY_UPDATED', `Rate "${entry.name}" on card "${card.name}" updated${payload.amount !== undefined ? ` — new rate ${card.currency} ${payload.amount} from ${payload.effectiveFrom} (history preserved)` : ''} (${[...Object.keys(metadata)].join(', ')})`);
  return { ok: true, status: 200 };
}

// ---------- user cost assignments ----------

/**
 * §68/§88 — point a user at a COST card from a date. Rules:
 *   - the user must be a same-tenant organization user (§93)
 *   - the card must be a same-tenant ACTIVE COST card (§76/§93)
 *   - the new range may not overlap any existing assignment (§77) — EXCEPT
 *     that an OPEN-ENDED assignment is replaceable forward in time (§79):
 *     it closes the day before the new one starts.
 */
export async function assignUserCostRate(
  tenantId: string,
  userId: string,
  payload: UserCostAssignmentPayload,
  audit: AuditContext
): Promise<DomainResult<UserCostAssignment>> {
  const user = await getUserById(userId);
  const userCheck = checkProjectUserIntegrity(user, tenantId, 'cost rate assignment');
  if (!userCheck.ok) return badRequest(userCheck.error);

  const validated = validateUserCostAssignment(payload);
  if (!validated.ok) {
    return badRequest(validated.errors.map(e => `${e.field}: ${e.message}`).join('; '));
  }
  const { rateCardId, rateCardEntryId, effectiveFrom, effectiveTo } = validated.value;

  // §113 — a missing card and another tenant's card are identical (404).
  const card = await getRateCardById(rateCardId, tenantId);
  if (!card) return notFound('Rate card');
  if (card.type !== 'COST') {
    return badRequest('Only cost rate cards can be assigned to users');
  }
  if (card.status === 'ARCHIVED') {
    return badRequest('Rate card is archived — it cannot receive new assignments');
  }
  // §131 — the assignment pins the ENTRY; it must live on the SAME card.
  const entry = await getRateCardEntryById(rateCardEntryId, rateCardId, tenantId);
  if (!entry) return badRequest('Rate not found on that card');

  // §77/§79 — overlap screening against the user's full history.
  const existing = await getUserCostAssignments(userId, tenantId, { includeEnded: true });
  const newRange = { effectiveFrom, effectiveTo };
  const toClose: UserCostAssignment[] = [];
  for (const a of existing) {
    if (!rangesOverlap(a, newRange)) continue;
    if (a.effectiveTo == null && effectiveFrom > a.effectiveFrom) {
      toClose.push(a); // open-ended, replaced forward (§79)
    } else {
      // A closed range is history — rejects the overlap outright.
      return conflict(`This assignment overlaps an existing one (${a.effectiveFrom} → ${a.effectiveTo ?? 'open'}) — a user cannot have two cost rates on the same day`);
    }
  }
  for (const a of toClose) {
    await updateUserCostAssignment(a.id, userId, tenantId, { effectiveTo: dayBefore(effectiveFrom) });
    await audit.log('USER_COST_RATE_CHANGED', `User ${userId}'s previous cost assignment (${a.rateCardId}, from ${a.effectiveFrom}) closed at ${dayBefore(effectiveFrom)}`);
  }

  const assignment = await createUserCostAssignment(tenantId, userId, { rateCardId, rateCardEntryId, effectiveFrom, effectiveTo });
  await audit.log('USER_COST_RATE_ASSIGNED', `User ${userId} assigned cost rate "${entry.name}" (${card.currency} ${entry.amount}/hour) on card "${card.name}" from ${effectiveFrom}${effectiveTo ? ` to ${effectiveTo}` : ' (open-ended)'}`);
  return { ok: true, status: 201, data: assignment };
}

/**
 * §100 PATCH — the assignment's END only (re-pointing to a different card is
 * a NEW assignment; §122 spirit). Extending an end must not create overlap.
 */
export async function updateUserCostRate(
  tenantId: string,
  userId: string,
  assignmentId: string,
  payload: { effectiveTo?: unknown },
  audit: AuditContext
): Promise<DomainResult<null>> {
  const assignment = await getUserCostAssignmentById(assignmentId, userId, tenantId);
  if (!assignment) return notFound('Cost rate assignment');

  if (payload.effectiveTo === undefined) {
    return badRequest('No valid assignment fields provided');
  }
  let effectiveTo: string | null | undefined;
  if (payload.effectiveTo === null || payload.effectiveTo === '') {
    effectiveTo = null; // re-open the assignment
  } else {
    const validated = validateUserCostAssignment({
      rateCardId: assignment.rateCardId,
      rateCardEntryId: assignment.rateCardEntryId, // §131 — the validator demands the pinned entry
      effectiveFrom: assignment.effectiveFrom,
      effectiveTo: payload.effectiveTo,
    });
    if (!validated.ok) {
      return badRequest(validated.errors.map(e => `${e.field}: ${e.message}`).join('; '));
    }
    effectiveTo = validated.value.effectiveTo;
  }

  // Overlap re-screen (§77): changing this range must not collide with the
  // user's OTHER assignments. The assignment under edit is excluded.
  const existing = await getUserCostAssignments(userId, tenantId, { includeEnded: true });
  const newRange = { effectiveFrom: assignment.effectiveFrom, effectiveTo };
  for (const a of existing) {
    if (a.id === assignmentId) continue;
    if (rangesOverlap(a, newRange)) {
      return conflict(`That change overlaps another assignment (${a.effectiveFrom} → ${a.effectiveTo ?? 'open'})`);
    }
  }

  const success = await updateUserCostAssignment(assignmentId, userId, tenantId, { effectiveTo });
  if (!success) return notFound('Cost rate assignment');
  await audit.log('USER_COST_RATE_CHANGED', `User ${userId}'s cost assignment (${assignment.rateCardId}) end ${effectiveTo == null ? 're-opened' : `set to ${effectiveTo}`}`);
  return { ok: true, status: 200 };
}

/** §88 — a list row for a user's cost assignment, enriched for display. */
export interface UserCostAssignmentRow extends UserCostAssignment {
  cardName: string;
  cardCurrency: string;
  entryName: string;
  entryAmount: number;
}

/**
 * §88/§100 GET — a user's cost-card assignments, newest first, enriched with
 * the card/entry display fields so the UI never needs a second round trip.
 * `includeEnded` is what powers the history view (default: open-ended only).
 */
export async function listUserCostAssignments(
  tenantId: string,
  userId: string,
  options: { includeEnded?: boolean } = {}
): Promise<DomainResult<UserCostAssignmentRow[]>> {
  const user = await getUserById(userId);
  const userCheck = checkProjectUserIntegrity(user, tenantId, 'cost rate assignment');
  if (!userCheck.ok) return notFound('User');

  const assignments = await getUserCostAssignments(userId, tenantId, {
    includeEnded: options.includeEnded ?? false,
  });

  // Enrich with card + entry display fields. Cards may be archived — that is
  // fine, history keeps reading them (§76).
  const rows: UserCostAssignmentRow[] = [];
  for (const a of assignments) {
    const card = await getRateCardById(a.rateCardId, tenantId);
    const entry = card
      ? await getRateCardEntryById(a.rateCardEntryId, a.rateCardId, tenantId)
      : null;
    rows.push({
      ...a,
      cardName: card?.name ?? '(deleted card)',
      cardCurrency: card?.currency ?? '',
      entryName: entry?.name ?? '(deleted rate)',
      entryAmount: entry?.amount ?? 0,
    });
  }
  return { ok: true, status: 200, data: rows };
}

/** §101 — end an assignment at a date (default: today). History stays readable. */
export async function endUserCostRate(
  tenantId: string,
  userId: string,
  assignmentId: string,
  audit: AuditContext,
  endDate?: string
): Promise<DomainResult<null>> {
  const assignment = await getUserCostAssignmentById(assignmentId, userId, tenantId);
  if (!assignment) return notFound('Cost rate assignment');
  if (assignment.effectiveTo != null) {
    return badRequest('Cost rate assignment is already ended');
  }
  const effectiveTo = endDate ?? await agencyToday(tenantId); // §44 — agency tz
  if (effectiveTo < assignment.effectiveFrom) {
    return badRequest('End date cannot be before the assignment\'s start');
  }
  const success = await updateUserCostAssignment(assignmentId, userId, tenantId, { effectiveTo });
  if (!success) return notFound('Cost rate assignment');
  await audit.log('USER_COST_RATE_ENDED', `User ${userId}'s cost assignment (${assignment.rateCardId}) ended at ${effectiveTo}`);
  return { ok: true, status: 200 };
}
