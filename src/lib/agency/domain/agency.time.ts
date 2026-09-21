/**
 * Agency Vertical — Domain: time tracking service (Module 7, spec §5–§34)
 *
 * The ONLY writer path for time entries and timer sessions. React components
 * never touch MongoDB — they go API route → this service → db.ts.
 *
 * Responsibilities:
 *   - Snapshots (§6/§7): cost/billing rates are resolved and frozen onto the
 *     entry at creation. An entry NEVER depends on a live rate after that —
 *     later card changes cannot rewrite history (Rule 2).
 *   - Economics (§23): calculated at APPROVAL from the frozen snapshots.
 *     Missing rates are NEVER zero (§24, rate contract §96): the entry is
 *     tracked but financialStatus stays RATE_CONFIGURATION_REQUIRED — the
 *     spec-recommended policy (allow tracking, block recognition).
 *   - State machine (§19/§20/§22/§28): DRAFT → SUBMITTED → APPROVED |
 *     REJECTED → DRAFT → SUBMITTED…; INVOICED entries are financially
 *     locked; SUBMITTED entries are not editable pending review; APPROVED
 *     entries are notes-only.
 *   - Approval authority (§21): the tenant's admins, the project's manager —
 *     and NEVER the entry's own author, regardless of role.
 *   - Timer (§9–§13): durable server-side sessions, one RUNNING per user,
 *     elapsed = now − startedAt (never interval accumulation), current-day
 *     entries only.
 *   - Integrity (§32): project / work item / user all tenant-bound; §113 —
 *     a cross-tenant reference is indistinguishable from a missing one.
 *   - Audit (§29): CREATED / UPDATED / SUBMITTED / APPROVED / REJECTED.
 *     MARKED_INVOICED is emitted by Module 9's finalization, not here.
 *     UNLOCKED stays unimplemented until a correction workflow exists.
 */
import {
  getProjectById, getProjectMembers, getWorkItemById, getUserById,
  getTimeEntries, getTimeEntryById, createTimeEntry as createTimeEntryRepo,
  updateTimeEntry as updateTimeEntryRepo, getActiveTimerSession,
  createTimerSession, updateTimerSession,
  type TimeEntryFilters, type TimeEntryCreateInput,
} from '@/lib/db';
import type { TimeEntry, TimerSession, RateSnapshot, TimeEntryUpdate } from '../types/time';
import {
  canTransitionApprovalStatus, editPolicyFor, snapshotFromResolved,
  MAX_DURATION_MINUTES,
} from '../types/time';
import { calculateTimeEconomics } from './time-calculation';
import type { BusinessDate } from '../types/dates';
import { agencyToday } from './agency.settings';
import { resolveCostRate, resolveBillingRate } from './rate-resolution';
import {
  validateTimeEntryCreate, validateTimeEntryUpdate,
  validateTimerStart, validateTimerStopReview, validateRejectionReason,
  type ValidatedTimeEntry,
} from '../validators/time';
import { checkProjectUserIntegrity } from './project-integrity';
import { type AuditContext, type DomainResult } from './agency.clients';

const notFound = (what: string): DomainResult<never> =>
  ({ ok: false, status: 404, error: `${what} not found` });

const badRequest = (error: string, code?: string): DomainResult<never> =>
  ({ ok: false, status: 400, error, ...(code && { code }) });

const conflict = (error: string, code?: string): DomainResult<never> =>
  ({ ok: false, status: 409, error, ...(code && { code }) });

const forbidden = (error: string): DomainResult<never> =>
  ({ ok: false, status: 403, error });

/** §21 — who may approve. Admins or the project's manager; the domain decides. */
function isApprover(role: string, projectManagerId: string | undefined, actorUserId: string): boolean {
  if (role === 'SUPER_ADMIN' || role === 'TENANT_ADMIN') return true;
  return !!projectManagerId && projectManagerId === actorUserId;
}

/** §33 security — a USER edits only their own entries; admins may correct. */
function mayModifyEntry(entry: TimeEntry, actorUserId: string, role: string): boolean {
  return role === 'SUPER_ADMIN' || role === 'TENANT_ADMIN' || entry.userId === actorUserId;
}

// ---------- §31 resolveTimeEntryRates ----------

export interface ResolvedEntryRates {
  costRateSnapshot: RateSnapshot | null;
  billingRateSnapshot: RateSnapshot | null;
  financialStatus: TimeEntry['financialStatus'];
}

/**
 * §6 — resolve and freeze both rate sides for an entry context. The billing
 * side resolves only for billable work (§17); its role comes from the user's
 * PROJECT MEMBERSHIP (billing prices a service, rate contract §89) — a user
 * who is not a member of the project has no delivery role, so billing stays
 * honestly unconfigured. Non-HOUR units cannot price hours (rate contract
 * §113) and are treated as not-configured rather than mis-multiplied.
 */
export async function resolveTimeEntryRates(input: {
  tenantId: string;
  projectId: string;
  userId: string;
  date: BusinessDate;
  billable: boolean;
}): Promise<ResolvedEntryRates> {
  const [project, members] = await Promise.all([
    getProjectById(input.projectId, input.tenantId),
    getProjectMembers(input.projectId, input.tenantId),
  ]);
  const role = members.find(m => m.userId === input.userId && m.active !== false)?.role;

  const costResolved = await resolveCostRate(input.tenantId, input.userId, input.date, role);
  let costRateSnapshot = snapshotFromResolved(costResolved);
  if (costRateSnapshot && costRateSnapshot.unit !== 'HOUR') costRateSnapshot = null;

  let billingRateSnapshot: RateSnapshot | null = null;
  if (input.billable && project?.clientId) {
    const billingResolved = await resolveBillingRate(
      input.tenantId, project.clientId, input.projectId, input.date, role ?? ''
    );
    billingRateSnapshot = snapshotFromResolved(billingResolved);
    if (billingRateSnapshot && billingRateSnapshot.unit !== 'HOUR') billingRateSnapshot = null;
  }

  // §24 — cost is always required; billing only for billable work. Missing
  // is NEVER zero: recognition stays blocked.
  const financialStatus: TimeEntry['financialStatus'] =
    costRateSnapshot && (!input.billable || billingRateSnapshot)
      ? 'READY'
      : 'RATE_CONFIGURATION_REQUIRED';

  return { costRateSnapshot, billingRateSnapshot, financialStatus };
}

// ---------- §31 calculateTimeEntryEconomics ----------

/**
 * §23 — delegates to the §127 shared engine (time-calculation.ts): cost =
 * hours × costRateSnapshot; billable value = hours × billingRateSnapshot.
 * Pure: computes from the FROZEN snapshots only. A missing side yields no
 * amount (never zero, §24/§96).
 */
export const calculateTimeEntryEconomics = calculateTimeEconomics;

// ---------- integrity (§32) ----------

/**
 * §32 — project belongs to tenant, work item belongs to project, user
 * belongs to tenant. All violations read identically (§113). Discriminated
 * so callers can `if (!ok) return it` into any DomainResult<T>.
 */
type EntryIntegrityResult =
  | { ok: true; projectManagerId?: string }
  | { ok: false; status: number; error: string };

const integrityFail = (status: number, error: string): EntryIntegrityResult =>
  ({ ok: false, status, error });

async function verifyEntryIntegrity(
  tenantId: string,
  projectId: string,
  workItemId: string | undefined,
  userId: string
): Promise<EntryIntegrityResult> {
  const project = await getProjectById(projectId, tenantId);
  if (!project) return integrityFail(404, 'Project not found');

  if (workItemId) {
    const workItem = await getWorkItemById(workItemId, projectId, tenantId);
    if (!workItem) return integrityFail(400, 'Work item not found on this project');
  }

  const user = await getUserById(userId);
  const userCheck = checkProjectUserIntegrity(user, tenantId, 'time entry author');
  if (!userCheck.ok) return integrityFail(400, userCheck.error);

  return { ok: true, projectManagerId: project.projectManagerId };
}

/** §16 — workItemId '' means "administrative/internal time, no work item". */
function normalizeWorkItemId(workItemId: string | undefined): string | undefined {
  return workItemId === '' ? undefined : workItemId;
}

// ---------- create (§5/§15) ----------

export async function createTimeEntry(
  tenantId: string,
  payload: Record<string, unknown>,
  audit: AuditContext,
  actor: { userId: string; role: string },
  /** The author of the time. Defaults to the actor; admins may log for others. */
  forUserId?: string
): Promise<DomainResult<TimeEntry>> {
  // §44 — business-date math anchors to the agency timezone.
  const today = await agencyToday(tenantId);
  const validated = validateTimeEntryCreate(payload, today);
  if (!validated.ok) {
    return badRequest(validated.errors.map(e => `${e.field}: ${e.message}`).join('; '));
  }
  const input: ValidatedTimeEntry = {
    ...validated.value,
    workItemId: normalizeWorkItemId(validated.value.workItemId),
  };
  const userId = forUserId ?? actor.userId;

  const integrity = await verifyEntryIntegrity(tenantId, input.projectId, input.workItemId, userId);
  if (!integrity.ok) return integrity;

  // §6 — freeze both rates at creation. §24 — missing rates never block
  // tracking; they block financial recognition via financialStatus.
  const rates = await resolveTimeEntryRates({
    tenantId, projectId: input.projectId, userId,
    date: input.date, billable: input.billable,
  });

  const repoInput: TimeEntryCreateInput = {
    projectId: input.projectId,
    ...(input.workItemId !== undefined && { workItemId: input.workItemId }),
    userId,
    date: input.date,
    durationMinutes: input.durationMinutes,
    billable: input.billable,
    financialStatus: rates.financialStatus,
    ...(rates.costRateSnapshot && { costRateSnapshot: rates.costRateSnapshot }),
    ...(rates.billingRateSnapshot && { billingRateSnapshot: rates.billingRateSnapshot }),
    ...(input.notes !== undefined && input.notes !== '' && { notes: input.notes }),
  };
  const entry = await createTimeEntryRepo(tenantId, repoInput);

  await audit.log('TIME_ENTRY_CREATED', `Time entry ${entry.id} created: ${input.durationMinutes}m on project ${input.projectId}${input.workItemId ? ` / work item ${input.workItemId}` : ''} for ${userId} (${input.date})`);
  return { ok: true, status: 201, data: entry };
}

// ---------- update (§28 lifecycle) ----------

export async function updateTimeEntry(
  id: string,
  tenantId: string,
  payload: Record<string, unknown>,
  audit: AuditContext,
  actor: { userId: string; role: string }
): Promise<DomainResult<TimeEntry>> {
  const existing = await getTimeEntryById(id, tenantId);
  if (!existing) return notFound('Time entry');

  // §33 — ownership: a USER edits only their own entries.
  if (!mayModifyEntry(existing, actor.userId, actor.role)) {
    return forbidden('You can only modify your own time entries');
  }

  // §28 — the lifecycle decides what is editable.
  const policy = editPolicyFor(existing);
  if (policy === 'LOCKED') {
    // §22 — INVOICED: financially locked. SUBMITTED: awaiting review.
    const reason = existing.billingStatus === 'INVOICED'
      ? 'This entry is invoiced and financially locked (§22)'
      : 'This entry is submitted and awaiting review — ask the approver to reject it first';
    return conflict(reason);
  }

  // §44 — business-date math anchors to the agency timezone.
  const today = await agencyToday(tenantId);
  const validated = validateTimeEntryUpdate(payload, today);
  if (!validated.ok) {
    return badRequest(validated.errors.map(e => `${e.field}: ${e.message}`).join('; '));
  }
  const updates = validated.value;

  if (policy === 'NOTES_ONLY') {
    // §28 — restricted edit after approval: notes only, everything else
    // blocked (never a silent economic mutation, Rule 6).
    const illegal = Object.keys(updates).filter(k => k !== 'notes');
    if (illegal.length > 0) {
      return badRequest(`An approved entry can only have its notes edited (attempted: ${illegal.join(', ')})`);
    }
  }

  // Merge identity for re-validation of required constraints.
  const merged = {
    projectId: updates.projectId !== undefined ? updates.projectId : existing.projectId,
    workItemId: 'workItemId' in updates ? normalizeWorkItemId(updates.workItemId) : existing.workItemId,
    date: updates.date !== undefined ? updates.date : existing.date,
    durationMinutes: updates.durationMinutes !== undefined ? updates.durationMinutes : existing.durationMinutes,
    billable: updates.billable !== undefined ? updates.billable : existing.billable,
    notes: updates.notes !== undefined ? updates.notes : existing.notes,
  };

  const integrity = await verifyEntryIntegrity(tenantId, merged.projectId, merged.workItemId, existing.userId);
  if (!integrity.ok) return integrity;

  // §20 — editing a REJECTED entry returns it to the editable draft state.
  const statusTransition = existing.approvalStatus === 'REJECTED' ? { approvalStatus: 'DRAFT' as const } : {};

  // §6 — the entry is not finalized yet: economic edits re-resolve and
  // re-freeze the snapshots (DRAFT/REJECTED only — policy guaranteed above).
  const economicsChanged = policy === 'FULL' && (
    updates.projectId !== undefined
    || 'workItemId' in updates
    || updates.date !== undefined
    || updates.durationMinutes !== undefined
    || updates.billable !== undefined
  );

  const write: TimeEntryUpdate = { ...updates };
  if ('workItemId' in write) write.workItemId = normalizeWorkItemId(updates.workItemId);
  if (Object.keys(statusTransition).length > 0) Object.assign(write, statusTransition);

  if (economicsChanged) {
    const rates = await resolveTimeEntryRates({
      tenantId, projectId: merged.projectId, userId: existing.userId,
      date: merged.date, billable: merged.billable,
    });
    write.costRateSnapshot = rates.costRateSnapshot ?? null;
    write.billingRateSnapshot = rates.billingRateSnapshot ?? null;
    write.financialStatus = rates.financialStatus;
    // Economics (if any were computed) belong to approval; a pre-approval
    // entry carries no calculated amounts.
    write.calculatedCost = null;
    write.calculatedBillableAmount = null;
    write.rejectionReason = null;
  }

  if (Object.keys(write).length === 0) {
    return badRequest('No valid time entry fields provided');
  }

  const success = await updateTimeEntryRepo(id, tenantId, write);
  if (!success) return notFound('Time entry');

  await audit.log('TIME_ENTRY_UPDATED', `Time entry ${id} updated on project ${merged.projectId} (${Object.keys(write).filter(k => k !== 'updatedAt').join(', ')})${existing.approvalStatus === 'REJECTED' ? '; returned to DRAFT for resubmission' : ''}`);
  const updated = await getTimeEntryById(id, tenantId);
  return { ok: true, status: 200, data: updated! };
}

// ---------- submit / approve / reject (§19/§20/§21) ----------

export async function submitTimeEntry(
  id: string,
  tenantId: string,
  audit: AuditContext,
  actor: { userId: string; role: string }
): Promise<DomainResult<TimeEntry>> {
  const existing = await getTimeEntryById(id, tenantId);
  if (!existing) return notFound('Time entry');

  if (!mayModifyEntry(existing, actor.userId, actor.role)) {
    return forbidden('You can only submit your own time entries');
  }
  if (!canTransitionApprovalStatus(existing.approvalStatus, 'SUBMITTED')) {
    return conflict(`Cannot submit an entry in ${existing.approvalStatus} state`);
  }

  const success = await updateTimeEntryRepo(id, tenantId, { approvalStatus: 'SUBMITTED' });
  if (!success) return notFound('Time entry');
  await audit.log('TIME_ENTRY_SUBMITTED', `Time entry ${id} submitted for approval (${existing.durationMinutes}m on ${existing.date})`);
  const updated = await getTimeEntryById(id, tenantId);
  return { ok: true, status: 200, data: updated! };
}

export async function approveTimeEntry(
  id: string,
  tenantId: string,
  audit: AuditContext,
  actor: { userId: string; role: string }
): Promise<DomainResult<TimeEntry>> {
  const existing = await getTimeEntryById(id, tenantId);
  if (!existing) return notFound('Time entry');

  // Tenant admin and super admin have full authority to approve anything without restrictions.
  // Non-admins cannot approve their own time.
  const isAdmin = actor.role === 'TENANT_ADMIN' || actor.role === 'SUPER_ADMIN';
  if (!isAdmin && existing.userId === actor.userId) {
    return forbidden('You cannot approve your own time entry');
  }

  const project = await getProjectById(existing.projectId, tenantId);
  if (!project) return notFound('Project');
  if (!isAdmin && !isApprover(actor.role, project.projectManagerId, actor.userId)) {
    return forbidden('Only the project manager or a workspace admin may approve time');
  }

  if (!canTransitionApprovalStatus(existing.approvalStatus, 'APPROVED')) {
    return conflict(`Cannot approve an entry in ${existing.approvalStatus} state`);
  }

  // §24 — finalization moment: a snapshot side that was missing at creation
  // gets ONE last chance to resolve now (rates configured since). Existing
  // snapshots are NEVER overwritten (Rule 2 — historical stability).
  let costRateSnapshot = existing.costRateSnapshot ?? null;
  let billingRateSnapshot = existing.billingRateSnapshot ?? null;
  if (!costRateSnapshot || (existing.billable && !billingRateSnapshot)) {
    const rates = await resolveTimeEntryRates({
      tenantId, projectId: existing.projectId, userId: existing.userId,
      date: existing.date, billable: existing.billable,
    });
    costRateSnapshot = costRateSnapshot ?? rates.costRateSnapshot;
    billingRateSnapshot = billingRateSnapshot ?? rates.billingRateSnapshot;
  }
  const financialStatus: TimeEntry['financialStatus'] =
    costRateSnapshot && (!existing.billable || billingRateSnapshot)
      ? 'READY'
      : 'RATE_CONFIGURATION_REQUIRED';

  // §23 — economics are computed HERE, from the frozen snapshots.
  const economics = calculateTimeEntryEconomics({
    durationMinutes: existing.durationMinutes,
    billable: existing.billable,
    costRateSnapshot: costRateSnapshot ?? undefined,
    billingRateSnapshot: billingRateSnapshot ?? undefined,
  });

  const success = await updateTimeEntryRepo(id, tenantId, {
    approvalStatus: 'APPROVED',
    costRateSnapshot: costRateSnapshot ?? undefined,
    billingRateSnapshot: billingRateSnapshot ?? undefined,
    financialStatus,
    ...(economics.calculatedCost && { calculatedCost: economics.calculatedCost }),
    ...(economics.calculatedBillableAmount && { calculatedBillableAmount: economics.calculatedBillableAmount }),
    rejectionReason: null,
  });
  if (!success) return notFound('Time entry');

  await audit.log('TIME_ENTRY_APPROVED', `Time entry ${id} approved${financialStatus === 'RATE_CONFIGURATION_REQUIRED' ? ' (financial recognition blocked: rate configuration required)' : ''}`);
  const updated = await getTimeEntryById(id, tenantId);
  return { ok: true, status: 200, data: updated! };
}

export async function rejectTimeEntry(
  id: string,
  tenantId: string,
  reason: unknown,
  audit: AuditContext,
  actor: { userId: string; role: string }
): Promise<DomainResult<TimeEntry>> {
  const existing = await getTimeEntryById(id, tenantId);
  if (!existing) return notFound('Time entry');

  // Tenant admin and super admin have full authority to reject anything without restrictions.
  // Non-admins cannot reject their own time.
  const isAdmin = actor.role === 'TENANT_ADMIN' || actor.role === 'SUPER_ADMIN';
  if (!isAdmin && existing.userId === actor.userId) {
    return forbidden('You cannot reject your own time entry');
  }
  const project = await getProjectById(existing.projectId, tenantId);
  if (!project) return notFound('Project');
  if (!isAdmin && !isApprover(actor.role, project.projectManagerId, actor.userId)) {
    return forbidden('Only the project manager or a workspace admin may reject time');
  }

  if (!canTransitionApprovalStatus(existing.approvalStatus, 'REJECTED')) {
    return conflict(`Cannot reject an entry in ${existing.approvalStatus} state`);
  }

  const cleanReason = validateRejectionReason(reason);
  if (!cleanReason) {
    return badRequest('A rejection reason is required');
  }

  const success = await updateTimeEntryRepo(id, tenantId, {
    approvalStatus: 'REJECTED',
    rejectionReason: cleanReason,
    // §20 — rejection returns the entry to editable state; any economics
    // computed at approval are withdrawn until re-approval.
    calculatedCost: null,
    calculatedBillableAmount: null,
  });
  if (!success) return notFound('Time entry');

  await audit.log('TIME_ENTRY_REJECTED', `Time entry ${id} rejected: ${cleanReason}`);
  const updated = await getTimeEntryById(id, tenantId);
  return { ok: true, status: 200, data: updated! };
}

// ---------- timer (§8–§13) ----------

/**
 * §12 — elapsed derives from timestamps, never interval accumulation.
 * Floored to whole minutes (the honest, conservative count); the review
 * override lets the author record the true duration.
 */
export function elapsedMinutes(session: TimerSession, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(session.startedAt).getTime()) / 60000));
}

export async function startTimer(
  tenantId: string,
  payload: Record<string, unknown>,
  audit: AuditContext,
  actor: { userId: string; role: string }
): Promise<DomainResult<TimerSession>> {
  const validated = validateTimerStart(payload);
  if (!validated.ok) {
    return badRequest(validated.errors.map(e => `${e.field}: ${e.message}`).join('; '));
  }

  // §11 — one active timer per user. The prompt to stop/review is the 409.
  const active = await getActiveTimerSession(actor.userId, tenantId);
  if (active) {
    return conflict('You already have a running timer — stop and review it before starting another', 'TIMER_ALREADY_RUNNING');
  }

  const workItemId = normalizeWorkItemId(validated.value.workItemId);
  const integrity = await verifyEntryIntegrity(tenantId, validated.value.projectId, workItemId, actor.userId);
  if (!integrity.ok) return integrity;

  const session = await createTimerSession(tenantId, actor.userId, validated.value.projectId, workItemId);
  await audit.log('TIMER_STARTED', `Timer ${session.id} started on project ${validated.value.projectId}${workItemId ? ` / work item ${workItemId}` : ''}`);
  return { ok: true, status: 201, data: session };
}

export interface TimerStopResult {
  session: TimerSession;
  elapsedMinutes: number;
  entry?: TimeEntry;
}

/**
 * §8 — stop → review → save. Stopping WITHOUT a review payload halts the
 * session and returns the elapsed time (the UI routes to the review form,
 * whose save is a normal manual create with today's date, §13). Stopping
 * WITH a review payload creates the final DRAFT TimeEntry directly.
 */
export async function stopTimer(
  tenantId: string,
  payload: Record<string, unknown>,
  audit: AuditContext,
  actor: { userId: string; role: string }
): Promise<DomainResult<TimerStopResult>> {
  const session = await getActiveTimerSession(actor.userId, tenantId);
  if (!session) return notFound('Running timer');

  const elapsed = elapsedMinutes(session);

  // Validate the review BEFORE stopping — an invalid review leaves the
  // session running so nothing is lost (§10: the server is the truth).
  let review: ReturnType<typeof validateTimerStopReview> | null = null;
  if (payload.review !== undefined && payload.review !== null) {
    review = validateTimerStopReview(payload.review as Record<string, unknown>);
    if (!review.ok) {
      return badRequest(review.errors.map(e => `${e.field}: ${e.message}`).join('; '));
    }
  }

  const stopped = await updateTimerSession(session.id, tenantId, { status: 'STOPPED' });
  if (!stopped) return notFound('Running timer');
  await audit.log('TIMER_STOPPED', `Timer ${session.id} stopped after ${elapsed}m on project ${session.projectId}`);

  const result: TimerStopResult = { session: { ...session, status: 'STOPPED' }, elapsedMinutes: elapsed };

  // No review payload → the UI completes the review via a normal create.
  if (!review) {
    return { ok: true, status: 200, data: result };
  }

  // The author may adjust DOWN to the honest duration, never inflate past
  // the real elapsed time (Rule 6 — no silent financial mutation).
  const duration = review.value.durationMinutes !== undefined
    ? Math.min(review.value.durationMinutes, Math.max(elapsed, 1))
    : elapsed;
  if (duration < 1) {
    return badRequest('The timer ran for less than a minute — record the work as a manual entry instead');
  }

  // §14/§12 — a session left running past a full day cannot become one
  // inflated entry; the review override is mandatory in that case.
  if (elapsed > MAX_DURATION_MINUTES && review.value.durationMinutes === undefined) {
    return badRequest('The timer ran for more than 24 hours — provide the honest duration in the review');
  }

  const entryResult = await createTimeEntry(
    tenantId,
    {
      projectId: session.projectId,
      ...(review.value.workItemId !== undefined
        ? { workItemId: review.value.workItemId }
        : (session.workItemId !== undefined && { workItemId: session.workItemId })),
      date: await agencyToday(tenantId),   // §13 — timers capture the CURRENT day only (§44: agency tz)
      durationMinutes: duration,
      billable: review.value.billable,
      ...(review.value.notes !== undefined && review.value.notes !== '' && { notes: review.value.notes }),
    },
    audit,
    actor
  );
  if (!entryResult.ok) {
    // The session stays STOPPED (honest); the entry failure propagates so
    // the UI can retry the save as a manual create.
    return { ok: false, status: entryResult.status, error: entryResult.error };
  }

  result.entry = entryResult.data;
  await audit.log('TIME_ENTRY_CREATED', `Time entry ${entryResult.data!.id} created from timer ${session.id}: ${duration}m on project ${session.projectId}`);
  return { ok: true, status: 200, data: result };
}

/** DISCARDED — the model's honest third state (§9): abandoned, no entry. */
export async function discardTimer(
  tenantId: string,
  audit: AuditContext,
  actor: { userId: string; role: string }
): Promise<DomainResult<TimerSession>> {
  const session = await getActiveTimerSession(actor.userId, tenantId);
  if (!session) return notFound('Running timer');

  const discarded = await updateTimerSession(session.id, tenantId, { status: 'DISCARDED' });
  if (!discarded) return notFound('Running timer');
  await audit.log('TIMER_DISCARDED', `Timer ${session.id} discarded on project ${session.projectId}`);
  return { ok: true, status: 200, data: { ...session, status: 'DISCARDED' } };
}

export async function getActiveTimer(
  tenantId: string,
  actor: { userId: string; role: string }
): Promise<{ session: TimerSession | null; elapsedMinutes: number }> {
  const session = await getActiveTimerSession(actor.userId, tenantId);
  return { session, elapsedMinutes: session ? elapsedMinutes(session) : 0 };
}

// ---------- views (§25) ----------

/**
 * §25/§33 — the general list. A USER always sees their own time (the
 * `userId` filter is forced to the actor); admins may list anyone's. The
 * route additionally redacts cost-side fields for non-admin consumers (§99).
 */
export async function listTimeEntries(
  tenantId: string,
  actor: { userId: string; role: string },
  filters: TimeEntryFilters = {}
): Promise<TimeEntry[]> {
  const scoped = actor.role === 'SUPER_ADMIN' || actor.role === 'TENANT_ADMIN'
    ? filters
    : { ...filters, userId: actor.userId };
  return getTimeEntries(tenantId, scoped);
}

export async function getMyTime(
  tenantId: string,
  actor: { userId: string; role: string },
  filters: TimeEntryFilters = {}
): Promise<TimeEntry[]> {
  return getTimeEntries(tenantId, { ...filters, userId: actor.userId });
}

export async function getProjectTime(
  tenantId: string,
  projectId: string,
  filters: TimeEntryFilters = {}
): Promise<DomainResult<TimeEntry[]>> {
  const project = await getProjectById(projectId, tenantId);
  if (!project) return notFound('Project');
  const entries = await getTimeEntries(tenantId, { ...filters, projectId });
  return { ok: true, status: 200, data: entries };
}

export async function getApprovalQueue(
  tenantId: string,
  actor: { userId: string; role: string },
  filters: TimeEntryFilters = {}
): Promise<DomainResult<TimeEntry[]>> {
  // Phase 1: the queue is tenant-wide for approvers. (§21 authority was
  // already enforced at the route's permission gate; per-PM filtering is a
  // UI concern, not a data-integrity one.)
  const entries = await getTimeEntries(tenantId, { ...filters, approvalStatus: 'SUBMITTED' });
  return { ok: true, status: 200, data: entries };
}
