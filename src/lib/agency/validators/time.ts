/**
 * Agency Vertical — Validators: time tracking input (Module 7, spec §15/§33)
 *
 * Reusable, framework-free validation for time-entry and timer payloads.
 * Pure functions: (input) → { ok, value } | { ok: false, errors } — no
 * NextResponse coupling.
 *
 * The rules (spec §15, §13, §14, §17, §32):
 *   projectId        required (must belong to the tenant — domain checks)
 *   workItemId       optional (§16 — null allowed for administrative or
 *                    internal time; must belong to the project — domain)
 *   date             valid YYYY-MM-DD, required; NOT in the future (time is
 *                    work that already happened; timers additionally capture
 *                    the CURRENT day only — domain checks §13)
 *   durationMinutes  positive integer, ≤ one full day (§14); legacy
 *                    decimal-hours input ("2.5") is converted at this boundary
 *   billable         explicit boolean, required (§17 — never inferred)
 *   notes            optional, ≤ 2000 chars
 *
 * Module 4/5 audit lessons applied here (same as validators/rate.ts):
 *   - PATCH is PARTIAL: required fields are validated against the ROW's
 *     current value by the domain (which merges identity before calling).
 *   - An explicit empty string MEANS "clear" for notes / workItemId.
 *   - approvalStatus / billingStatus / snapshots / calculated amounts are
 *     NEVER PATCHable — they are owned by the dedicated actions and the
 *     approval calculation (§19/§23/§22).
 */
import {
  MAX_DURATION_MINUTES, MIN_DURATION_MINUTES, minutesFromHoursInput,
} from '../types/time';
import { isBusinessDate } from '../types/dates';

export interface TimeFieldError {
  field: string;
  message: string;
}

const MAX_NOTES = 2000;

function str(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t === '' ? undefined : t;
}

/** '' passthrough for CLEARABLE optionals (notes, workItemId) — Module 4 lesson. */
function clearableStr(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  return v.trim();
}

export interface TimeEntryPayload {
  projectId?: string;
  workItemId?: string;
  date?: string;
  durationMinutes?: number;
  billable?: boolean;
  notes?: string;
}

export interface ValidatedTimeEntry {
  projectId: string;
  workItemId?: string;
  date: string;
  durationMinutes: number;
  billable: boolean;
  notes?: string;
}

function validateDuration(v: unknown, field: string, errors: TimeFieldError[]): number | undefined {
  if (v === undefined || v === null) return undefined;
  let minutes: number | undefined;
  if (typeof v === 'number' && Number.isFinite(v)) {
    // §14 — accept integer minutes; a decimal in the minutes field is a
    // decimal-HOURS legacy input, converted at this boundary (Module 4 §9
    // pattern). durationMinutes: 80 stays 80; 1.33 becomes 80.
    minutes = Number.isInteger(v) ? v : minutesFromHoursInput(v);
  } else if (typeof v === 'string' && v.trim() !== '') {
    const parsed = Number(v);
    if (Number.isFinite(parsed)) minutes = Number.isInteger(parsed) ? parsed : minutesFromHoursInput(parsed);
  }
  if (minutes === undefined) {
    errors.push({ field, message: 'Duration must be a number of minutes' });
    return undefined;
  }
  if (minutes < MIN_DURATION_MINUTES || minutes > MAX_DURATION_MINUTES) {
    errors.push({ field, message: `Duration must be between ${MIN_DURATION_MINUTES} and ${MAX_DURATION_MINUTES} minutes` });
    return undefined;
  }
  return minutes;
}

function validateDate(v: unknown, field: string, errors: TimeFieldError[], today?: string): string | undefined {
  const s = str(v);
  if (s === undefined) return undefined;
  if (!isBusinessDate(s)) {
    errors.push({ field, message: 'Date must be a valid date (YYYY-MM-DD)' });
    return undefined;
  }
  if (today && s > today) {
    errors.push({ field, message: 'Date cannot be in the future — time entries record work that already happened' });
    return undefined;
  }
  return s;
}

/** §15 — creation. projectId/date/durationMinutes/billable required. */
export function validateTimeEntryCreate(
  payload: TimeEntryPayload,
  today: string
): { ok: true; value: ValidatedTimeEntry } | { ok: false; errors: TimeFieldError[] } {
  const errors: TimeFieldError[] = [];
  const value: ValidatedTimeEntry = {
    projectId: '',
    date: '',
    durationMinutes: 0,
    billable: false,
  };

  const projectId = str(payload.projectId);
  if (!projectId) errors.push({ field: 'projectId', message: 'Project is required' });
  else value.projectId = projectId;

  const date = validateDate(payload.date, 'date', errors, today);
  if (!date) errors.push({ field: 'date', message: 'Date is required' });
  else value.date = date;

  const duration = validateDuration(payload.durationMinutes, 'durationMinutes', errors);
  if (duration === undefined) errors.push({ field: 'durationMinutes', message: 'Duration is required' });
  else value.durationMinutes = duration;

  if (typeof payload.billable !== 'boolean') {
    errors.push({ field: 'billable', message: 'Billable must be explicitly true or false (never inferred)' });
  } else {
    value.billable = payload.billable;
  }

  const workItemId = clearableStr(payload.workItemId);
  if (workItemId !== undefined) value.workItemId = workItemId;

  const notes = clearableStr(payload.notes);
  if (notes !== undefined) {
    if (notes.length > MAX_NOTES) errors.push({ field: 'notes', message: `Notes are too long (max ${MAX_NOTES} characters)` });
    else value.notes = notes;
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, value };
}

/**
 * §28 — partial PATCH. Only the edit-lifecycle-legal fields validate here;
 * the domain decides which of them the entry's state actually permits.
 */
export function validateTimeEntryUpdate(
  payload: TimeEntryPayload,
  today: string
): { ok: true; value: Partial<ValidatedTimeEntry> } | { ok: false; errors: TimeFieldError[] } {
  const errors: TimeFieldError[] = [];
  const value: Partial<ValidatedTimeEntry> = {};

  const projectId = str(payload.projectId);
  if (projectId !== undefined) value.projectId = projectId;

  const date = validateDate(payload.date, 'date', errors, today);
  if (date !== undefined) value.date = date;

  const duration = validateDuration(payload.durationMinutes, 'durationMinutes', errors);
  if (duration !== undefined) value.durationMinutes = duration;

  if (payload.billable !== undefined) {
    if (typeof payload.billable !== 'boolean') {
      errors.push({ field: 'billable', message: 'Billable must be true or false' });
    } else {
      value.billable = payload.billable;
    }
  }

  const workItemId = clearableStr(payload.workItemId);
  if (workItemId !== undefined) value.workItemId = workItemId;

  const notes = clearableStr(payload.notes);
  if (notes !== undefined) {
    if (notes.length > MAX_NOTES) errors.push({ field: 'notes', message: `Notes are too long (max ${MAX_NOTES} characters)` });
    else value.notes = notes;
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, value };
}

export interface TimerStartPayload {
  projectId?: string;
  workItemId?: string;
}

/** §9/§11 — timer start: project required, work item optional (§16). */
export function validateTimerStart(
  payload: TimerStartPayload
): { ok: true; value: { projectId: string; workItemId?: string } } | { ok: false; errors: TimeFieldError[] } {
  const errors: TimeFieldError[] = [];
  const projectId = str(payload.projectId);
  if (!projectId) errors.push({ field: 'projectId', message: 'Project is required to start a timer' });

  const workItemId = clearableStr(payload.workItemId);
  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, value: { projectId: projectId!, ...(workItemId !== undefined && { workItemId }) } };
}

export interface TimerStopReview {
  billable?: boolean;
  notes?: string;
  /** Optional honest override — the domain caps it at the real elapsed time. */
  durationMinutes?: number;
  workItemId?: string;
}

export function validateTimerStopReview(
  payload: TimerStopReview
): { ok: true; value: Required<Pick<TimerStopReview, 'billable'>> & Partial<Omit<TimerStopReview, 'billable'>> } | { ok: false; errors: TimeFieldError[] } {
  const errors: TimeFieldError[] = [];
  if (typeof payload.billable !== 'boolean') {
    errors.push({ field: 'billable', message: 'Billable must be explicitly true or false to save the entry' });
    return { ok: false, errors };
  }
  const value: Required<Pick<TimerStopReview, 'billable'>> & Partial<Omit<TimerStopReview, 'billable'>> = { billable: payload.billable };

  const duration = validateDuration(payload.durationMinutes, 'durationMinutes', errors);
  if (duration !== undefined) value.durationMinutes = duration;

  const notes = clearableStr(payload.notes);
  if (notes !== undefined) {
    if (notes.length > MAX_NOTES) errors.push({ field: 'notes', message: `Notes are too long (max ${MAX_NOTES} characters)` });
    else value.notes = notes;
  }

  const workItemId = clearableStr(payload.workItemId);
  if (workItemId !== undefined) value.workItemId = workItemId;

  return errors.length > 0 ? { ok: false, errors } : { ok: true, value };
}

/** §20 — a rejection carries a reason (bounded, human-readable). */
export function validateRejectionReason(reason: unknown): string | null {
  const s = str(reason);
  if (!s) return null;
  return s.length > MAX_NOTES ? s.slice(0, MAX_NOTES) : s;
}
