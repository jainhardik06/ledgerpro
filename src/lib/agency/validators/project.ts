/**
 * Agency Vertical — Validators: project input (Module 3, Step 3.5 / spec §100)
 *
 * Reusable, framework-free validation for project, member, work-item and
 * milestone payloads. Pure functions: (input) → { ok, value, warnings } |
 * { ok: false, errors } — no NextResponse coupling.
 *
 * The commercial rules (spec §73–§75, §100):
 *   billingModel   enum (FIXED_FEE | TIME_AND_MATERIALS | MILESTONE)
 *   currency       3-letter ISO-style code, required
 *   money fields   non-negative numbers when present — negatives REJECT
 *   targetMargin   0–100 inclusive — outside REJECT
 *   plannedHours   non-negative when present
 *   timeline       endDate < startDate REJECT (§73)
 *
 * WARNINGS, never rejects (a draft may be incomplete, §74):
 *   fixed-fee project without a contract value / revenue baseline (§73)
 *   target margin higher than the planned budget allows (§54)
 *   T&M project without planned hours (§75: recommended, not required)
 */
import {
  PROJECT_STATUSES, WORK_ITEM_STATUSES, MILESTONE_STATUSES,
  milestoneHasSingleCommercialDefinition,
  type ProjectStatus, type WorkItemStatus, type MilestoneStatus,
} from '../types/project';
import { BILLING_MODELS, type BillingModel } from '../types/client';
import { isBusinessDate } from '../types/dates';

export interface ProjectFieldError {
  field: string;
  message: string;
}

const CURRENCY_RE = /^[A-Z]{3}$/;
const MAX_NAME = 120;

function str(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t === '' ? undefined : t;
}

function num(v: unknown, field: string, errors: ProjectFieldError[], opts: { min?: number; max?: number; integer?: boolean } = {}): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    errors.push({ field, message: `${field} must be a number` });
    return undefined;
  }
  if (opts.integer && !Number.isInteger(v)) {
    errors.push({ field, message: `${field} must be a whole number` });
    return undefined;
  }
  if (opts.min !== undefined && v < opts.min) {
    errors.push({ field, message: `${field} cannot be less than ${opts.min}` });
    return undefined;
  }
  if (opts.max !== undefined && v > opts.max) {
    errors.push({ field, message: `${field} cannot be greater than ${opts.max}` });
    return undefined;
  }
  return v;
}

function bounded(v: unknown, label: string, field: string, max: number, errors: ProjectFieldError[]): string | undefined {
  const s = str(v);
  if (s === undefined) return undefined;
  if (s.length > max) errors.push({ field, message: `${label} is too long (max ${max} characters)` });
  return s;
}

function dateStr(v: unknown, label: string, field: string, errors: ProjectFieldError[]): string | undefined {
  const s = str(v);
  if (s === undefined) return undefined;
  if (!isBusinessDate(s)) {
    errors.push({ field, message: `${label} must be a valid date (YYYY-MM-DD)` });
    return undefined;
  }
  return s;
}

function enumIn<T extends string>(v: unknown, allowed: readonly T[], label: string, field: string, errors: ProjectFieldError[]): T | undefined {
  const s = str(v);
  if (s === undefined) return undefined;
  if (!allowed.includes(s as T)) errors.push({ field, message: `${label} must be one of: ${allowed.join(', ')}` });
  return s as T | undefined;
}

// ---------- project create/update (spec §100) ----------

export interface ProjectPayload {
  clientId?: unknown;
  name?: unknown;
  code?: unknown;
  description?: unknown;
  billingModel?: unknown;
  currency?: unknown;
  status?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  contractValue?: unknown;
  revenueBudget?: unknown;
  budgetCost?: unknown;
  targetMargin?: unknown;
  plannedHours?: unknown;
  projectManagerId?: unknown;
  projectType?: unknown;
  tags?: unknown;
}

export interface ProjectValidated {
  clientId?: string;
  name?: string;
  code?: string;
  description?: string;
  billingModel?: BillingModel;
  currency?: string;
  startDate?: string;
  endDate?: string;
  contractValue?: number;
  revenueBudget?: number;
  budgetCost?: number;
  targetMargin?: number;
  plannedHours?: number;
  projectManagerId?: string;
  projectType?: string;
  tags?: string[];
}

/**
 * Shared field rules for create and update. `required` flips the core
 * commercial fields on for creation (§37) and off for PATCH (partial §25-style).
 * Status is deliberately NOT settable through either path — the dedicated
 * activate/pause/complete/cancel/archive actions own the lifecycle (§41).
 */
function validateProjectFields(
  payload: ProjectPayload,
  required: boolean
): { value: ProjectValidated; errors: ProjectFieldError[]; warnings: string[] } {
  const errors: ProjectFieldError[] = [];
  const warnings: string[] = [];

  const clientId = bounded(payload.clientId, 'Client', 'clientId', 100, errors);
  if (required && !clientId) errors.push({ field: 'clientId', message: 'Client is required' });

  const name = bounded(payload.name, 'Project name', 'name', MAX_NAME, errors);
  if (required && !name) errors.push({ field: 'name', message: 'Project name is required' });

  const code = bounded(payload.code, 'Project code', 'code', 40, errors);
  const description = bounded(payload.description, 'Description', 'description', 2000, errors);

  const billingModel = enumIn(payload.billingModel, BILLING_MODELS, 'Billing model', 'billingModel', errors);
  if (required && !billingModel) errors.push({ field: 'billingModel', message: 'Billing model is required' });

  const currencyRaw = str(payload.currency)?.toUpperCase();
  if (currencyRaw !== undefined && !CURRENCY_RE.test(currencyRaw)) {
    errors.push({ field: 'currency', message: 'Currency must be a 3-letter ISO code (e.g. INR, USD)' });
  }
  if (required && !currencyRaw) errors.push({ field: 'currency', message: 'Currency is required' });

  if (payload.status !== undefined) {
    const s = str(payload.status) as ProjectStatus | undefined;
    if (!s || !PROJECT_STATUSES.includes(s)) {
      errors.push({ field: 'status', message: 'Status must be one of: ' + PROJECT_STATUSES.join(', ') });
    } else {
      // Lifecycle changes go through the dedicated actions, never a payload.
      errors.push({ field: 'status', message: 'Project status changes use the activate/pause/complete/cancel/archive actions' });
    }
  }

  const startDate = dateStr(payload.startDate, 'Start date', 'startDate', errors);
  const endDate = dateStr(payload.endDate, 'End date', 'endDate', errors);
  if (startDate && endDate && endDate < startDate) {
    errors.push({ field: 'endDate', message: 'End date cannot be before the start date' });
  }

  const contractValue = num(payload.contractValue, 'contractValue', errors, { min: 0 });
  const revenueBudget = num(payload.revenueBudget, 'revenueBudget', errors, { min: 0 });
  const budgetCost = num(payload.budgetCost, 'budgetCost', errors, { min: 0 });
  const targetMargin = num(payload.targetMargin, 'targetMargin', errors, { min: 0, max: 100 });
  const plannedHours = num(payload.plannedHours, 'plannedHours', errors, { min: 0 });
  const projectManagerId = bounded(payload.projectManagerId, 'Project manager', 'projectManagerId', 100, errors);
  const projectType = bounded(payload.projectType, 'Project type', 'projectType', 100, errors);

  let tags: string[] | undefined;
  if (payload.tags !== undefined) {
    if (!Array.isArray(payload.tags)) {
      errors.push({ field: 'tags', message: 'Tags must be a list' });
    } else {
      const cleaned = payload.tags
        .map(t => (typeof t === 'string' ? t.trim() : ''))
        .filter(t => t.length > 0)
        .map(t => t.slice(0, 40));
      if (cleaned.length > 10) errors.push({ field: 'tags', message: 'At most 10 tags' });
      else tags = [...new Set(cleaned)];
    }
  }

  // ---- warnings (§73/§74: incomplete drafts are legal) ----
  if (billingModel === 'FIXED_FEE' && contractValue === undefined && revenueBudget === undefined) {
    warnings.push('Fixed-fee project has no contract value yet — set one before activation (recommended)');
  }
  if (billingModel === 'TIME_AND_MATERIALS' && plannedHours === undefined) {
    warnings.push('T&M project has no planned hours baseline — revenue will derive from billable hours once Time Tracking lands');
  }
  // §54 — impossible margin: the budget can't deliver the target
  if (
    revenueBudget !== undefined && revenueBudget > 0 &&
    budgetCost !== undefined && targetMargin !== undefined
  ) {
    const expectedMargin = ((revenueBudget - budgetCost) / revenueBudget) * 100;
    if (expectedMargin < targetMargin) {
      warnings.push(
        `Your target margin (${targetMargin}%) is higher than the planned budget allows (${expectedMargin.toFixed(1)}%)`
      );
    }
  }

  const value: ProjectValidated = {
    ...(clientId !== undefined && { clientId }),
    ...(name !== undefined && { name }),
    ...(code !== undefined && { code }),
    ...(description !== undefined && { description }),
    ...(billingModel !== undefined && { billingModel }),
    ...(currencyRaw !== undefined && { currency: currencyRaw }),
    ...(startDate !== undefined && { startDate }),
    ...(endDate !== undefined && { endDate }),
    ...(contractValue !== undefined && { contractValue }),
    ...(revenueBudget !== undefined && { revenueBudget }),
    ...(budgetCost !== undefined && { budgetCost }),
    ...(targetMargin !== undefined && { targetMargin }),
    ...(plannedHours !== undefined && { plannedHours }),
    ...(projectManagerId !== undefined && { projectManagerId }),
    ...(projectType !== undefined && { projectType }),
    ...(tags !== undefined && { tags }),
  };
  return { value, errors, warnings };
}

export type ProjectValidationResult =
  | { ok: true; value: ProjectValidated; warnings: string[] }
  | { ok: false; errors: ProjectFieldError[] };

/** Create additionally guarantees the §37 required core is present. */
export type ProjectCreateValidationResult =
  | { ok: true; value: ProjectValidated & { clientId: string; name: string; billingModel: BillingModel; currency: string }; warnings: string[] }
  | { ok: false; errors: ProjectFieldError[] };

export function validateProjectCreate(payload: ProjectPayload): ProjectCreateValidationResult {
  const { value, errors, warnings } = validateProjectFields(payload, true);
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    warnings,
    value: value as ProjectValidated & { clientId: string; name: string; billingModel: BillingModel; currency: string },
  };
}

export function validateProjectUpdate(payload: ProjectPayload): ProjectValidationResult {
  const { value, errors, warnings } = validateProjectFields(payload, false);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value, warnings };
}

// ---------- project member (spec §59–§60) ----------

export interface MemberPayload {
  userId?: unknown;
  role?: unknown;
  allocationPercent?: unknown;
  startDate?: unknown;
  endDate?: unknown;
}

export interface MemberValidated {
  userId?: string;
  role?: string;
  allocationPercent?: number;
  startDate?: string;
  endDate?: string;
}

export type MemberValidationResult =
  | { ok: true; value: MemberValidated & { userId: string }; warnings: string[] }
  | { ok: false; errors: ProjectFieldError[] };

export function validateProjectMember(payload: MemberPayload): MemberValidationResult {
  const errors: ProjectFieldError[] = [];
  const userId = bounded(payload.userId, 'User', 'userId', 100, errors);
  if (!userId) errors.push({ field: 'userId', message: 'User is required' });
  const role = bounded(payload.role, 'Role', 'role', 100, errors);
  // Module 5 §35 — 0 < allocationPercent <= 100. Zero is not a plan (use no
  // allocation instead); over-allocation ACROSS projects is deliberately
  // allowed (recorded for future Resource Planning, never blocked here).
  const allocationPercent = num(payload.allocationPercent, 'allocationPercent', errors, { max: 100 });
  if (allocationPercent !== undefined && allocationPercent <= 0) {
    errors.push({ field: 'allocationPercent', message: 'Allocation must be greater than 0' });
  }
  const startDate = dateStr(payload.startDate, 'Start date', 'startDate', errors);
  const endDate = dateStr(payload.endDate, 'End date', 'endDate', errors);
  if (startDate && endDate && endDate < startDate) {
    errors.push({ field: 'endDate', message: 'End date cannot be before the start date' });
  }
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    warnings: [],
    value: {
      userId: userId!,
      ...(role !== undefined && { role }),
      ...(allocationPercent !== undefined && { allocationPercent }),
      ...(startDate !== undefined && { startDate }),
      ...(endDate !== undefined && { endDate }),
    },
  };
}

// ---------- work item (spec §61, extended Module 4 §7–§18) ----------

export interface WorkItemPayload {
  name?: unknown;
  description?: unknown;
  status?: unknown;
  /** Module 4 §9 — canonical internal duration storage. */
  estimatedMinutes?: unknown;
  /** Legacy Module 3 field — accepted on input, converted ×60, never stored. */
  estimatedHours?: unknown;
  assignedTo?: unknown;
  sortOrder?: unknown;
}

export interface WorkItemValidated {
  name?: string;
  description?: string;
  status?: WorkItemStatus;
  estimatedMinutes?: number;
  assignedTo?: string;
  sortOrder?: number;
}

export type WorkItemValidationResult =
  | { ok: true; value: WorkItemValidated & { name: string }; warnings: string[] }
  | { ok: false; errors: ProjectFieldError[] };

export function validateWorkItem(payload: WorkItemPayload): WorkItemValidationResult {
  const errors: ProjectFieldError[] = [];
  const name = bounded(payload.name, 'Work item name', 'name', MAX_NAME, errors);
  if (!name) errors.push({ field: 'name', message: 'Work item name is required' });
  const description = bounded(payload.description, 'Description', 'description', 2000, errors);
  const status = enumIn(payload.status, WORK_ITEM_STATUSES, 'Work item status', 'status', errors);
  // §18 — estimatedMinutes >= 0; a legacy decimal-hours value is converted
  // losslessly (×60) so old callers keep working (§9 makes minutes canonical).
  const estimatedMinutes = num(payload.estimatedMinutes, 'estimatedMinutes', errors, { min: 0, integer: true });
  const estimatedHours = num(payload.estimatedHours, 'estimatedHours', errors, { min: 0 });
  if (estimatedMinutes !== undefined && estimatedHours !== undefined) {
    errors.push({ field: 'estimatedMinutes', message: 'Provide estimatedMinutes or estimatedHours, not both' });
  }
  const resolvedMinutes = estimatedMinutes !== undefined
    ? estimatedMinutes
    : estimatedHours !== undefined ? Math.round(estimatedHours * 60) : undefined;
  // §12/§16 — an explicit empty string CLEARS the assignee (unassign via
  // plain PATCH). The generic str()/bounded() helpers would strip '' to
  // "absent", which would silently drop the unassignment entirely.
  const assignedTo = payload.assignedTo === ''
    ? ''
    : bounded(payload.assignedTo, 'Assignee', 'assignedTo', 100, errors);
  const sortOrder = num(payload.sortOrder, 'sortOrder', errors, { min: 0, integer: true });
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    warnings: [],
    value: {
      name: name!,
      ...(description !== undefined && { description }),
      ...(status !== undefined && { status: status as WorkItemStatus }),
      ...(resolvedMinutes !== undefined && { estimatedMinutes: resolvedMinutes }),
      ...(assignedTo !== undefined && { assignedTo }),
      ...(sortOrder !== undefined && { sortOrder }),
    },
  };
}

// ---------- milestone (spec §46) ----------

export interface MilestonePayload {
  name?: unknown;
  description?: unknown;
  sequence?: unknown;
  amount?: unknown;
  percentage?: unknown;
  dueDate?: unknown;
  status?: unknown;
}

export interface MilestoneValidated {
  name?: string;
  description?: string;
  sequence?: number;
  amount?: number;
  percentage?: number;
  dueDate?: string;
  status?: MilestoneStatus;
}

export type MilestoneValidationResult =
  | { ok: true; value: MilestoneValidated & { name: string; sequence: number }; warnings: string[] }
  | { ok: false; errors: ProjectFieldError[] };

export function validateProjectMilestone(payload: MilestonePayload): MilestoneValidationResult {
  const errors: ProjectFieldError[] = [];
  const name = bounded(payload.name, 'Milestone name', 'name', MAX_NAME, errors);
  if (!name) errors.push({ field: 'name', message: 'Milestone name is required' });
  const description = bounded(payload.description, 'Description', 'description', 2000, errors);

  const sequence = num(payload.sequence, 'sequence', errors, { min: 1, integer: true });
  if (sequence === undefined) errors.push({ field: 'sequence', message: 'Sequence is required (a positive whole number)' });

  const amount = num(payload.amount, 'amount', errors, { min: 0 });
  const percentage = num(payload.percentage, 'percentage', errors, { min: 0, max: 100 });
  if (percentage === 0) errors.push({ field: 'percentage', message: 'Percentage must be greater than 0' });

  // §46 — exactly one commercial definition
  if (!milestoneHasSingleCommercialDefinition({ amount, percentage })) {
    errors.push({ field: 'amount', message: 'A milestone needs either an amount or a percentage — never both, never neither' });
  }

  const dueDate = dateStr(payload.dueDate, 'Due date', 'dueDate', errors);
  const status = enumIn(payload.status, MILESTONE_STATUSES, 'Milestone status', 'status', errors);

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    warnings: [],
    value: {
      name: name!,
      sequence: sequence!,
      ...(description !== undefined && { description }),
      ...(amount !== undefined && { amount }),
      ...(percentage !== undefined && { percentage }),
      ...(dueDate !== undefined && { dueDate }),
      ...(status !== undefined && { status: status as MilestoneStatus }),
    },
  };
}

// ---------- milestone update (PATCH) — all fields optional (§85) ----------

/**
 * Lenient variant used exclusively by the PATCH route. Unlike the create
 * validator, `name` and `sequence` are not required — a status-only patch
 * like `{ status: "COMPLETED" }` is fully valid here.
 *
 * The commercial XOR constraint (§46) only fires when at least one of
 * `amount` / `percentage` is present in the payload, so it cannot be used
 * to silently wipe a commercial definition.
 */
export interface MilestoneUpdatePayload {
  name?: unknown;
  description?: unknown;
  sequence?: unknown;
  amount?: unknown;
  percentage?: unknown;
  dueDate?: unknown;
  status?: unknown;
}

export type MilestoneUpdateValidationResult =
  | { ok: true; value: MilestoneValidated; warnings: string[] }
  | { ok: false; errors: ProjectFieldError[] };

export function validateMilestoneUpdate(payload: MilestoneUpdatePayload): MilestoneUpdateValidationResult {
  const errors: ProjectFieldError[] = [];
  const name = bounded(payload.name, 'Milestone name', 'name', MAX_NAME, errors);
  const description = bounded(payload.description, 'Description', 'description', 2000, errors);
  const sequence = num(payload.sequence, 'sequence', errors, { min: 1, integer: true });
  const amount = num(payload.amount, 'amount', errors, { min: 0 });
  const percentage = num(payload.percentage, 'percentage', errors, { min: 0, max: 100 });
  if (percentage === 0) errors.push({ field: 'percentage', message: 'Percentage must be greater than 0' });

  // Only enforce XOR when the caller is explicitly providing commercial fields.
  const touchesCommercial = payload.amount !== undefined || payload.percentage !== undefined;
  if (touchesCommercial && amount !== undefined && percentage !== undefined) {
    errors.push({ field: 'amount', message: 'A milestone needs either an amount or a percentage — never both' });
  }

  const dueDate = dateStr(payload.dueDate, 'Due date', 'dueDate', errors);
  const status = enumIn(payload.status, MILESTONE_STATUSES, 'Milestone status', 'status', errors);

  if (errors.length > 0) return { ok: false, errors };

  const value: MilestoneValidated = {
    ...(name !== undefined && { name }),
    ...(description !== undefined && { description }),
    ...(sequence !== undefined && { sequence }),
    ...(amount !== undefined && { amount }),
    ...(percentage !== undefined && { percentage }),
    ...(dueDate !== undefined && { dueDate }),
    ...(status !== undefined && { status: status as MilestoneStatus }),
  };

  if (Object.keys(value).length === 0) {
    return { ok: false, errors: [{ field: 'body', message: 'No valid milestone fields provided' }] };
  }

  return { ok: true, warnings: [], value };
}

