/**
 * Module 7 (§5–§34) — time tracking domain tests.
 *
 * Pins the rules that make time financially honest:
 *   - the approval state machine and edit lifecycle (§19/§20/§22/§28)
 *   - rate snapshots frozen at creation (§6/§7), economics at approval (§23)
 *   - missing rates NEVER zero — RATE_CONFIGURATION_REQUIRED (§24)
 *   - approval authority: PM/admin yes, own time NEVER (§21)
 *   - timer: one active per user (§11), timestamp-derived duration (§12),
 *     current-day entries only (§13), no inflation (Rule 6)
 *   - tenant integrity (§32) and ownership security (§33)
 *
 * Rate resolution is mocked (its matrix lives in agency-rates-domain tests);
 * repository writes are mocked to echo their input — the DOMAIN logic is
 * what these tests pin.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('@/lib/db', () => ({
  getProjectById: vi.fn(),
  getProjectMembers: vi.fn(),
  getTenantById: vi.fn(),
  getWorkItemById: vi.fn(),
  getUserById: vi.fn(),
  getTimeEntries: vi.fn(),
  getTimeEntryById: vi.fn(),
  createTimeEntry: vi.fn(),
  updateTimeEntry: vi.fn(),
  getActiveTimerSession: vi.fn(),
  createTimerSession: vi.fn(),
  updateTimerSession: vi.fn(),
  getTimerSessionById: vi.fn(),
  // Transitively imported by agency.clients (AuditContext/DomainResult home).
  createClient: vi.fn(), getClients: vi.fn(), getClientById: vi.fn(),
  updateClient: vi.fn(), searchClients: vi.fn(), findClientByName: vi.fn(),
  getLogs: vi.fn(),
}));

vi.mock('@/lib/agency/domain/rate-resolution', () => ({
  resolveCostRate: vi.fn(),
  resolveBillingRate: vi.fn(),
}));

import {
  getProjectById, getProjectMembers, getWorkItemById, getUserById,
  getTimeEntryById, createTimeEntry as createTimeEntryRepo,
  updateTimeEntry as updateTimeEntryRepo,
  getActiveTimerSession, createTimerSession, updateTimerSession,
} from '@/lib/db';
import { resolveCostRate, resolveBillingRate } from '@/lib/agency/domain/rate-resolution';
import {
  createTimeEntry, updateTimeEntry, submitTimeEntry, approveTimeEntry, rejectTimeEntry,
  startTimer, stopTimer, discardTimer, elapsedMinutes, calculateTimeEntryEconomics,
} from '@/lib/agency/domain/agency.time';
import {
  canTransitionApprovalStatus, editPolicyFor, formatDuration,
  minutesFromHoursInput, snapshotFromResolved,
  type TimeEntry, type TimerSession, type RateSnapshot,
} from '@/lib/agency/types/time';
import { todayInTimezone } from '@/lib/agency/types/dates';
import type { Project, ProjectMember } from '@/lib/agency/types/project';
import type { User } from '@/lib/db';

const TENANT = 'tenant-a';
const TODAY = todayInTimezone();
const YESTERDAY = '2026-01-05';
const audit = { username: 'tester', tenantId: TENANT, log: vi.fn() };
const ACTOR_USER = { userId: 'user-1', role: 'USER' as const };
const ACTOR_ADMIN = { userId: 'admin-1', role: 'TENANT_ADMIN' as const };

const PROJECT: Project = {
  id: 'proj-1', tenantId: TENANT, clientId: 'client-1', name: 'Acme Web',
  status: 'ACTIVE', billingModel: 'TIME_AND_MATERIALS', currency: 'INR',
  projectManagerId: 'pm-1', createdAt: new Date('2026-01-01'),
};

const MEMBER: ProjectMember = {
  id: 'member-1', tenantId: TENANT, projectId: 'proj-1',
  userId: 'user-1', role: 'Developer', active: true,
  createdAt: new Date('2026-01-01'),
};

const USER_1: User = { id: 'user-1', username: 'dev', role: 'USER', tenantId: TENANT, status: 'ACTIVE', passwordHash: 'x', createdAt: new Date('2026-01-01') };

const COST_SNAPSHOT: RateSnapshot = {
  amount: 900, currency: 'INR', unit: 'HOUR', source: 'USER_COST_ASSIGNMENT',
  rateCardId: 'card-cost', rateCardEntryId: 'entry-dev', effectiveFrom: '2026-01-01',
};
const BILLING_SNAPSHOT: RateSnapshot = {
  amount: 2500, currency: 'INR', unit: 'HOUR', source: 'CLIENT_RATE_CARD',
  rateCardId: 'card-bill', rateCardEntryId: 'entry-bill', effectiveFrom: '2026-01-01',
};

function entry(overrides: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id: 'te-1', tenantId: TENANT, projectId: 'proj-1', userId: 'user-1',
    date: TODAY, durationMinutes: 120, billable: true,
    approvalStatus: 'DRAFT', billingStatus: 'UNBILLED', financialStatus: 'READY',
    costRateSnapshot: COST_SNAPSHOT, billingRateSnapshot: BILLING_SNAPSHOT,
    createdAt: new Date('2026-01-06'), updatedAt: new Date('2026-01-06'),
    ...overrides,
  };
}

/** The repo create mock echoes its input with identity + defaults. */
function echoCreate(tenantId: string, input: Record<string, unknown>): TimeEntry {
  return {
    id: 'te-new', tenantId, ...input,
    approvalStatus: 'DRAFT', billingStatus: 'UNBILLED',
    createdAt: new Date(), updatedAt: new Date(),
  } as unknown as TimeEntry;
}

beforeEach(() => {
  vi.clearAllMocks();
  (getProjectById as Mock).mockResolvedValue(PROJECT);
  (getProjectMembers as Mock).mockResolvedValue([MEMBER]);
  (getWorkItemById as Mock).mockResolvedValue({ id: 'wi-1', tenantId: TENANT, projectId: 'proj-1' });
  (getUserById as Mock).mockImplementation(async (id: string) =>
    id === 'user-1' ? USER_1
      : id === 'pm-1' ? { ...USER_1, id: 'pm-1', username: 'pm' }
      : id === 'admin-1' ? { ...USER_1, id: 'admin-1', role: 'TENANT_ADMIN', username: 'admin' }
      : null);
  (resolveCostRate as unknown as Mock).mockResolvedValue({
    status: 'RESOLVED', amount: 900, currency: 'INR', unit: 'HOUR',
    rateCardId: 'card-cost', rateEntryId: 'entry-dev', effectiveFrom: '2026-01-01',
    source: 'USER_ASSIGNMENT',
  });
  (resolveBillingRate as unknown as Mock).mockResolvedValue({
    status: 'RESOLVED', amount: 2500, currency: 'INR', unit: 'HOUR',
    rateCardId: 'card-bill', rateEntryId: 'entry-bill', effectiveFrom: '2026-01-01',
    source: 'CLIENT_RATE_CARD',
  });
  (createTimeEntryRepo as Mock).mockImplementation(echoCreate);
  (updateTimeEntryRepo as Mock).mockResolvedValue(true);
  (createTimerSession as Mock).mockImplementation(
    (_t: string, userId: string, projectId: string, workItemId?: string) => ({
      id: 'ts-1', tenantId: TENANT, userId, projectId, workItemId,
      startedAt: new Date(), status: 'RUNNING', createdAt: new Date(),
    })
  );
  (updateTimerSession as Mock).mockResolvedValue(true);
  (getActiveTimerSession as Mock).mockResolvedValue(null);
  (getTimeEntryById as Mock).mockResolvedValue(null);
});

// ---------- pure type layer (§14/§6/§19/§20/§22/§28) ----------

describe('time types (§14/§6/§19–§28)', () => {
  it('formats durations as 1h 20m, never decimal hours (§14)', () => {
    expect(formatDuration(80)).toBe('1h 20m');
    expect(formatDuration(60)).toBe('1h');
    expect(formatDuration(45)).toBe('45m');
  });

  it('converts legacy decimal-hours input at the boundary (§14)', () => {
    expect(minutesFromHoursInput(1.33)).toBe(80);
    expect(minutesFromHoursInput(2)).toBe(120);
  });

  it('maps the resolver contract to the §6 snapshot labels, once', () => {
    const snap = snapshotFromResolved({
      status: 'RESOLVED', amount: 900, currency: 'INR', unit: 'HOUR',
      rateCardId: 'card-cost', rateEntryId: 'entry-dev',
      effectiveFrom: '2026-01-01', source: 'USER_ASSIGNMENT',
    });
    expect(snap).not.toBeNull();
    expect(snap!.rateCardEntryId).toBe('entry-dev');       // rateEntryId → §6 name
    expect(snap!.source).toBe('USER_COST_ASSIGNMENT');      // resolver label → §6 label
    expect(snapshotFromResolved({ status: 'NOT_CONFIGURED' })).toBeNull();
  });

  it('enforces the approval state machine (§19/§20)', () => {
    expect(canTransitionApprovalStatus('DRAFT', 'SUBMITTED')).toBe(true);
    expect(canTransitionApprovalStatus('SUBMITTED', 'APPROVED')).toBe(true);
    expect(canTransitionApprovalStatus('SUBMITTED', 'REJECTED')).toBe(true);
    expect(canTransitionApprovalStatus('APPROVED', 'REJECTED')).toBe(true);
    expect(canTransitionApprovalStatus('REJECTED', 'DRAFT')).toBe(true);
    // Illegal arrows — status is never PATCHable.
    expect(canTransitionApprovalStatus('DRAFT', 'APPROVED')).toBe(false);
    expect(canTransitionApprovalStatus('APPROVED', 'DRAFT')).toBe(false);
    expect(canTransitionApprovalStatus('REJECTED', 'SUBMITTED')).toBe(false);
    expect(canTransitionApprovalStatus('DRAFT', 'REJECTED')).toBe(false);
  });

  it('applies the §28 edit lifecycle', () => {
    expect(editPolicyFor(entry({ approvalStatus: 'DRAFT' }))).toBe('FULL');
    expect(editPolicyFor(entry({ approvalStatus: 'REJECTED' }))).toBe('FULL');
    expect(editPolicyFor(entry({ approvalStatus: 'SUBMITTED' }))).toBe('LOCKED');
    expect(editPolicyFor(entry({ approvalStatus: 'APPROVED' }))).toBe('NOTES_ONLY');
    // §22 — INVOICED locks regardless of approval state.
    expect(editPolicyFor(entry({ approvalStatus: 'APPROVED', billingStatus: 'INVOICED' }))).toBe('LOCKED');
  });
});

// ---------- economics (§23/§24) ----------

describe('calculateTimeEntryEconomics (§23)', () => {
  it('computes cost and billable value from the frozen snapshots', () => {
    const e = calculateTimeEntryEconomics({
      durationMinutes: 120, billable: true,
      costRateSnapshot: COST_SNAPSHOT, billingRateSnapshot: BILLING_SNAPSHOT,
    });
    expect(e.calculatedCost).toEqual({ amount: 1800, currency: 'INR' });   // 2h × 900
    expect(e.calculatedBillableAmount).toEqual({ amount: 5000, currency: 'INR' }); // 2h × 2500
  });

  it('never fabricates amounts for missing snapshots (§24/§96)', () => {
    const e = calculateTimeEntryEconomics({ durationMinutes: 120, billable: true });
    expect(e.calculatedCost).toBeUndefined();
    expect(e.calculatedBillableAmount).toBeUndefined();
  });

  it('non-billable work carries cost but no billable value (§17)', () => {
    const e = calculateTimeEntryEconomics({
      durationMinutes: 60, billable: false, costRateSnapshot: COST_SNAPSHOT,
      billingRateSnapshot: BILLING_SNAPSHOT,
    });
    expect(e.calculatedCost).toEqual({ amount: 900, currency: 'INR' });
    expect(e.calculatedBillableAmount).toBeUndefined();
  });

  it('rounds once, in minor units, on fractional hours (§23/money contract)', () => {
    // makeMoney rounds the rate to 2dp at construction (833.34); the multiply
    // then runs in minor units: 83334 × 0.5 = 41667 → 416.67. One rounding
    // step, never floating-point drift.
    const e = calculateTimeEntryEconomics({
      durationMinutes: 30, billable: false,
      costRateSnapshot: { ...COST_SNAPSHOT, amount: 833.335 },
    });
    expect(e.calculatedCost!.amount).toBe(416.67);
  });
});

// ---------- create (§5/§15/§24/§32) ----------

describe('createTimeEntry (§5/§15/§24/§32)', () => {
  const PAYLOAD = { projectId: 'proj-1', date: YESTERDAY, durationMinutes: 480, billable: true };

  it('freezes both snapshots at creation with explicit state (§6/§19)', async () => {
    const result = await createTimeEntry(TENANT, PAYLOAD, audit, ACTOR_USER);
    expect(result.ok).toBe(true);
    const input = (createTimeEntryRepo as Mock).mock.calls[0][1];
    expect(input.costRateSnapshot.amount).toBe(900);
    expect(input.billingRateSnapshot.amount).toBe(2500);
    expect(input.financialStatus).toBe('READY');
    expect(input.approvalStatus).toBeUndefined();   // repo stamps DRAFT
    expect(input.billingStatus).toBeUndefined();    // repo stamps UNBILLED
  });

  it('allows historical dates for manual entries (§13)', async () => {
    const result = await createTimeEntry(TENANT, { ...PAYLOAD, date: '2026-01-02' }, audit, ACTOR_USER);
    expect(result.ok).toBe(true);
  });

  it('rejects future dates (time is work that already happened)', async () => {
    const result = await createTimeEntry(TENANT, { ...PAYLOAD, date: '2999-01-01' }, audit, ACTOR_USER);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
  });

  it('§24 — tracks the entry but blocks recognition when rates are missing', async () => {
    (resolveCostRate as unknown as Mock).mockResolvedValue({ status: 'NOT_CONFIGURED' });
    const result = await createTimeEntry(TENANT, PAYLOAD, audit, ACTOR_USER);
    expect(result.ok).toBe(true);   // tracking is never blocked (§24 policy)
    const input = (createTimeEntryRepo as Mock).mock.calls[0][1];
    expect(input.costRateSnapshot).toBeUndefined();
    expect(input.financialStatus).toBe('RATE_CONFIGURATION_REQUIRED');
  });

  it('§17 — non-billable work needs no billing rate to be financially ready', async () => {
    const result = await createTimeEntry(TENANT, { ...PAYLOAD, billable: false }, audit, ACTOR_USER);
    const input = (createTimeEntryRepo as Mock).mock.calls[0][1];
    expect(input.billingRateSnapshot).toBeUndefined();
    expect(input.financialStatus).toBe('READY');
  });

  it('§32 — a cross-tenant project is an identical 404', async () => {
    (getProjectById as Mock).mockResolvedValue(null);
    const result = await createTimeEntry(TENANT, PAYLOAD, audit, ACTOR_USER);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
  });

  it('§32 — a work item from another project rejects', async () => {
    (getWorkItemById as Mock).mockResolvedValue(null);
    const result = await createTimeEntry(TENANT, { ...PAYLOAD, workItemId: 'wi-x' }, audit, ACTOR_USER);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
  });

  it('§17 — billable must be explicit, never inferred', async () => {
    const result = await createTimeEntry(TENANT, { ...PAYLOAD, billable: undefined }, audit, ACTOR_USER);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Billable');
  });

  it('converts legacy decimal-hours duration at the boundary (§14)', async () => {
    const result = await createTimeEntry(TENANT, { ...PAYLOAD, durationMinutes: 1.5 }, audit, ACTOR_USER);
    expect(result.ok).toBe(true);
    const input = (createTimeEntryRepo as Mock).mock.calls[0][1];
    expect(input.durationMinutes).toBe(90);
  });
});

// ---------- update lifecycle (§20/§22/§28/§33) ----------

describe('updateTimeEntry (§20/§22/§28/§33)', () => {
  it('§20 — editing a rejected entry returns it to DRAFT and re-snapshots', async () => {
    (getTimeEntryById as Mock).mockResolvedValue(
      entry({ approvalStatus: 'REJECTED', rejectionReason: 'wrong duration' })
    );
    const result = await updateTimeEntry('te-1', TENANT, { durationMinutes: 240 }, audit, ACTOR_USER);
    expect(result.ok).toBe(true);
    const write = (updateTimeEntryRepo as Mock).mock.calls[0][2];
    expect(write.approvalStatus).toBe('DRAFT');
    expect(write.durationMinutes).toBe(240);
    expect(write.rejectionReason).toBeNull();   // cleared for resubmission
  });

  it('§28 — SUBMITTED entries are locked pending review', async () => {
    (getTimeEntryById as Mock).mockResolvedValue(entry({ approvalStatus: 'SUBMITTED' }));
    const result = await updateTimeEntry('te-1', TENANT, { durationMinutes: 240 }, audit, ACTOR_USER);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
  });

  it('§28 — approved entries are notes-only', async () => {
    (getTimeEntryById as Mock).mockResolvedValue(entry({ approvalStatus: 'APPROVED' }));
    const bad = await updateTimeEntry('te-1', TENANT, { durationMinutes: 240 }, audit, ACTOR_USER);
    expect(bad.ok).toBe(false);
    expect(bad.status).toBe(400);

    const good = await updateTimeEntry('te-1', TENANT, { notes: 'clarified' }, audit, ACTOR_USER);
    expect(good.ok).toBe(true);
    const write = (updateTimeEntryRepo as Mock).mock.calls[0][2];
    expect(write.notes).toBe('clarified');
  });

  it('§22 — invoiced entries are financially locked', async () => {
    (getTimeEntryById as Mock).mockResolvedValue(
      entry({ approvalStatus: 'APPROVED', billingStatus: 'INVOICED' })
    );
    const result = await updateTimeEntry('te-1', TENANT, { notes: 'attempt' }, audit, ACTOR_ADMIN);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
    expect(result.error).toContain('invoiced');
  });

  it('§33 — a USER cannot modify another user\'s entry', async () => {
    (getTimeEntryById as Mock).mockResolvedValue(entry({ userId: 'someone-else' }));
    const result = await updateTimeEntry('te-1', TENANT, { notes: 'x' }, audit, ACTOR_USER);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
  });
});

// ---------- submit / approve / reject (§19/§20/§21/§23) ----------

describe('submit/approve/reject (§19/§20/§21/§23)', () => {
  it('submits a draft (§19)', async () => {
    (getTimeEntryById as Mock).mockResolvedValue(entry());
    const result = await submitTimeEntry('te-1', TENANT, audit, ACTOR_USER);
    expect(result.ok).toBe(true);
    expect((updateTimeEntryRepo as Mock).mock.calls[0][2]).toEqual({ approvalStatus: 'SUBMITTED' });
  });

  it('cannot submit twice (§19 state machine)', async () => {
    (getTimeEntryById as Mock).mockResolvedValue(entry({ approvalStatus: 'SUBMITTED' }));
    const result = await submitTimeEntry('te-1', TENANT, audit, ACTOR_USER);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
  });

  it('§23 — approval computes economics from the frozen snapshots', async () => {
    (getTimeEntryById as Mock).mockResolvedValue(entry({ approvalStatus: 'SUBMITTED' }));
    const result = await approveTimeEntry('te-1', TENANT, audit, ACTOR_ADMIN);
    expect(result.ok).toBe(true);
    const write = (updateTimeEntryRepo as Mock).mock.calls[0][2];
    expect(write.approvalStatus).toBe('APPROVED');
    expect(write.calculatedCost).toEqual({ amount: 1800, currency: 'INR' });
    expect(write.calculatedBillableAmount).toEqual({ amount: 5000, currency: 'INR' });
  });

  it('tenant admin can approve their own time without restriction', async () => {
    (getTimeEntryById as Mock).mockResolvedValue(
      entry({ approvalStatus: 'SUBMITTED', userId: 'admin-1' })
    );
    const result = await approveTimeEntry('te-1', TENANT, audit, ACTOR_ADMIN);
    expect(result.ok).toBe(true);
  });

  it('a regular user cannot approve their own time even if PM', async () => {
    (getTimeEntryById as Mock).mockResolvedValue(
      entry({ approvalStatus: 'SUBMITTED', userId: 'pm-1' })
    );
    const result = await approveTimeEntry('te-1', TENANT, audit, { userId: 'pm-1', role: 'USER' });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
  });

  it('§21 — the project\'s manager may approve (PM tier)', async () => {
    (getTimeEntryById as Mock).mockResolvedValue(entry({ approvalStatus: 'SUBMITTED' }));
    const result = await approveTimeEntry('te-1', TENANT, audit, { userId: 'pm-1', role: 'USER' });
    expect(result.ok).toBe(true);
  });

  it('§21 — a regular user who is not the PM cannot approve', async () => {
    (getTimeEntryById as Mock).mockResolvedValue(
      entry({ approvalStatus: 'SUBMITTED', userId: 'someone-else' })
    );
    const result = await approveTimeEntry('te-1', TENANT, audit, ACTOR_USER);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
  });

  it('§24 — approval with missing rates succeeds but stays blocked', async () => {
    (getTimeEntryById as Mock).mockResolvedValue(
      entry({ approvalStatus: 'SUBMITTED', financialStatus: 'RATE_CONFIGURATION_REQUIRED',
        costRateSnapshot: undefined, billingRateSnapshot: undefined })
    );
    (resolveCostRate as unknown as Mock).mockResolvedValue({ status: 'NOT_CONFIGURED' });
    const result = await approveTimeEntry('te-1', TENANT, audit, ACTOR_ADMIN);
    expect(result.ok).toBe(true);
    const write = (updateTimeEntryRepo as Mock).mock.calls[0][2];
    expect(write.financialStatus).toBe('RATE_CONFIGURATION_REQUIRED');
    expect(write.calculatedCost).toBeUndefined();
  });

  it('§24 — a snapshot missing at creation gets its last chance at approval, existing ones never change (Rule 2)', async () => {
    (getTimeEntryById as Mock).mockResolvedValue(
      entry({ approvalStatus: 'SUBMITTED',
        costRateSnapshot: undefined,
        billingRateSnapshot: BILLING_SNAPSHOT })
    );
    (resolveBillingRate as unknown as Mock).mockResolvedValue({ status: 'NOT_CONFIGURED' });
    const result = await approveTimeEntry('te-1', TENANT, audit, ACTOR_ADMIN);
    expect(result.ok).toBe(true);
    const write = (updateTimeEntryRepo as Mock).mock.calls[0][2];
    expect(write.costRateSnapshot.amount).toBe(900);   // resolved now (was missing)
    expect(write.billingRateSnapshot).toEqual(BILLING_SNAPSHOT); // preserved verbatim
    expect(write.financialStatus).toBe('READY');       // both sides present
  });

  it('§20 — rejection requires a reason and withdraws economics', async () => {
    (getTimeEntryById as Mock).mockResolvedValue(entry({ approvalStatus: 'SUBMITTED' }));
    const noReason = await rejectTimeEntry('te-1', TENANT, undefined, audit, ACTOR_ADMIN);
    expect(noReason.ok).toBe(false);
    expect(noReason.status).toBe(400);

    const result = await rejectTimeEntry('te-1', TENANT, 'wrong work item', audit, ACTOR_ADMIN);
    expect(result.ok).toBe(true);
    const write = (updateTimeEntryRepo as Mock).mock.calls[0][2];
    expect(write.approvalStatus).toBe('REJECTED');
    expect(write.rejectionReason).toBe('wrong work item');
    expect(write.calculatedCost).toBeNull();
    expect(write.calculatedBillableAmount).toBeNull();
  });

  it('the author cannot reject their own submitted entry (§21 gate)', async () => {
    (getTimeEntryById as Mock).mockResolvedValue(entry({ approvalStatus: 'SUBMITTED' }));
    const result = await rejectTimeEntry('te-1', TENANT, 'nope', audit, ACTOR_USER);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
  });

  it('cannot approve an entry that is not SUBMITTED (§19)', async () => {
    (getTimeEntryById as Mock).mockResolvedValue(entry({ approvalStatus: 'DRAFT' }));
    const result = await approveTimeEntry('te-1', TENANT, audit, ACTOR_ADMIN);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
  });
});

// ---------- timer (§9–§13) ----------

describe('timer sessions (§9–§13)', () => {
  const runningSession = (startedAt: Date): TimerSession => ({
    id: 'ts-1', tenantId: TENANT, userId: 'user-1', projectId: 'proj-1',
    workItemId: 'wi-1', startedAt, status: 'RUNNING', createdAt: startedAt,
  });

  it('elapsed derives from timestamps, never intervals (§12)', () => {
    const started = new Date(Date.now() - 90 * 60000 - 30000); // 90.5 min
    expect(elapsedMinutes(runningSession(started))).toBe(90);
  });

  it('starts a durable session (§9/§10)', async () => {
    const result = await startTimer(TENANT, { projectId: 'proj-1', workItemId: 'wi-1' }, audit, ACTOR_USER);
    expect(result.ok).toBe(true);
    expect(result.status).toBe(201);
    expect((createTimerSession as Mock).mock.calls[0]).toEqual(
      [TENANT, 'user-1', 'proj-1', 'wi-1']
    );
  });

  it('§11 — one active timer per user: the second start is a 409', async () => {
    (getActiveTimerSession as Mock).mockResolvedValue(runningSession(new Date()));
    const result = await startTimer(TENANT, { projectId: 'proj-1' }, audit, ACTOR_USER);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
  });

  it('§8/§13 — stop with review creates the draft entry, current day only', async () => {
    const started = new Date(Date.now() - 95 * 60000);
    (getActiveTimerSession as Mock).mockResolvedValue(runningSession(started));
    const result = await stopTimer(TENANT, { review: { billable: true, notes: 'API work' } }, audit, ACTOR_USER);
    expect(result.ok).toBe(true);
    expect(result.data!.elapsedMinutes).toBe(95);
    const input = (createTimeEntryRepo as Mock).mock.calls[0][1];
    expect(input.date).toBe(TODAY);              // §13 — current day
    expect(input.durationMinutes).toBe(95);      // §12 — from timestamps
    expect(input.billable).toBe(true);
    expect(result.data!.entry).toBeDefined();
  });

  it('Rule 6 — a review override can only adjust DOWN, never inflate', async () => {
    const started = new Date(Date.now() - 60 * 60000);
    (getActiveTimerSession as Mock).mockResolvedValue(runningSession(started));
    const result = await stopTimer(TENANT, { review: { billable: true, durationMinutes: 400 } }, audit, ACTOR_USER);
    expect(result.ok).toBe(true);
    const input = (createTimeEntryRepo as Mock).mock.calls[0][1];
    expect(input.durationMinutes).toBe(60);      // capped at real elapsed
  });

  it('§8 — stop without review halts the session and returns the elapsed time', async () => {
    const started = new Date(Date.now() - 30 * 60000);
    (getActiveTimerSession as Mock).mockResolvedValue(runningSession(started));
    const result = await stopTimer(TENANT, {}, audit, ACTOR_USER);
    expect(result.ok).toBe(true);
    expect(result.data!.entry).toBeUndefined();
    expect(result.data!.elapsedMinutes).toBe(30);
    expect(updateTimerSession as Mock).toHaveBeenCalledWith('ts-1', TENANT, { status: 'STOPPED' });
  });

  it('an invalid review leaves the session running (nothing is lost)', async () => {
    (getActiveTimerSession as Mock).mockResolvedValue(runningSession(new Date()));
    const result = await stopTimer(TENANT, { review: { notes: 'no billable flag' } }, audit, ACTOR_USER);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(updateTimerSession as Mock).not.toHaveBeenCalled();
  });

  it('§9 — discard is the honest third state, no entry is created', async () => {
    (getActiveTimerSession as Mock).mockResolvedValue(runningSession(new Date()));
    const result = await discardTimer(TENANT, audit, ACTOR_USER);
    expect(result.ok).toBe(true);
    expect(updateTimerSession as Mock).toHaveBeenCalledWith('ts-1', TENANT, { status: 'DISCARDED' });
    expect(createTimeEntryRepo as Mock).not.toHaveBeenCalled();
  });
});
