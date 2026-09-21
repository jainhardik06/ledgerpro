/**
 * Agency Vertical — Types: Project contract (Module 3, spec §36–§63)
 *
 * CLIENT-SAFE: types and pure functions only — no imports of lib/db, mongodb,
 * or any server-only module. React components import from here.
 *
 * The Project is the primary unit of Agency delivery and eventually the
 * primary unit of Agency profitability (§34):
 *
 *   Client → Project → Delivery → Cost → Revenue → Profit
 *
 * It is a defined piece of client work with commercial value, time period,
 * budget, delivery owner and financial objective — NOT a collection of tasks
 * (§35). Work items are financial context for future time tracking, not a
 * project-management system (§63).
 *
 * Commercial fields are deliberately SPLIT (§51–§52): `contractValue` is the
 * negotiated fee, `revenueBudget` the commercial ceiling. They start equal
 * for fixed-fee projects but future change orders make them diverge — never
 * bake them into one field.
 */
import type { BillingModel } from './client';

// ---------- status lifecycle (spec §39–§41) ----------

/** Project lifecycle (§39). Delivery states, not a task pipeline. */
export type ProjectStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'ON_HOLD'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'ARCHIVED';

export const PROJECT_STATUSES: readonly ProjectStatus[] = [
  'DRAFT', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED', 'ARCHIVED',
] as const;

/**
 * A project starts its life incomplete on purpose (§74): Draft allows
 * "create now, configure later, activate when ready".
 */
export const DEFAULT_PROJECT_STATUS: ProjectStatus = 'DRAFT';

/**
 * Module 3 — project codes are SYSTEM-ASSIGNED, one flat sequence per tenant
 * (PRJ-0001, PRJ-0002, …). The number comes from the atomic allocator
 * (lib/db.ts allocateProjectCode); this renders it for display.
 *
 * There is no longer a UI to type a code, but the field stays on the model and
 * the create payload: existing projects carry real user-entered codes, and the
 * API still honours a caller-supplied one (§38 immutability, §111 uniqueness).
 */
export const PROJECT_CODE_PREFIX = 'PRJ-';

/** Render an allocated sequence number as its project code (1 → PRJ-0001). */
export function formatProjectCode(sequence: number): string {
  return `${PROJECT_CODE_PREFIX}${String(sequence).padStart(4, '0')}`;
}

/**
 * Legal status transitions (spec §41).
 *
 *   DRAFT → ACTIVE
 *   ACTIVE ⇄ ON_HOLD
 *   ACTIVE / ON_HOLD → COMPLETED
 *   DRAFT / ACTIVE / ON_HOLD → CANCELLED
 *   COMPLETED → ARCHIVED
 *
 * COMPLETED → ACTIVE exists ONLY as the explicit reopen action (§41: never
 * automatic) — the domain service exposes it solely through the dedicated
 * activate route, never as a PATCH status smuggle. CANCELLED and ARCHIVED
 * are terminal in Phase 1.
 */
const ALLOWED_PROJECT_TRANSITIONS: Readonly<Record<ProjectStatus, readonly ProjectStatus[]>> = {
  DRAFT: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['ON_HOLD', 'COMPLETED', 'CANCELLED'],
  ON_HOLD: ['ACTIVE', 'COMPLETED', 'CANCELLED'],
  COMPLETED: ['ARCHIVED', 'ACTIVE'], // ACTIVE = explicit reopen only
  CANCELLED: [],
  ARCHIVED: [],
};

/** Pure transition check — the domain service is the only caller that writes. */
export function canTransitionProjectStatus(from: ProjectStatus, to: ProjectStatus): boolean {
  return ALLOWED_PROJECT_TRANSITIONS[from]?.includes(to) ?? false;
}

// ---------- Project (spec §36–§38, §51–§52, §78–§79) ----------

/**
 * The Module 3 Project. Required: tenantId, clientId, name, status,
 * billingModel, currency (§37). Everything commercial is optional — a draft
 * may legitimately have no contract value yet (internal discovery project).
 */
export interface Project {
  id: string;
  tenantId: string;

  /** §80: must reference a client of the SAME tenant — enforced at every layer. */
  clientId: string;

  name: string;
  /**
   * Short code for time entries, invoices, reports and exports (§38) —
   * e.g. ACME-WEB-001. Optional in Phase 1; immutable once set (rename
   * requires an explicit admin change).
   */
  code?: string;
  /**
   * §111 — uppercased/trimmed `code`, stamped by the repository whenever a
   * code is set. Uniqueness key is (tenantId, normalizedCode); plain `code`
   * keeps the user's original casing for display.
   */
  normalizedCode?: string;
  description?: string;

  status: ProjectStatus;

  /** Stored from day one even though the rate engine arrives with Time (§44). */
  billingModel: BillingModel;
  currency: string;

  /** Timeline (§37 strongly recommended) — business dates, YYYY-MM-DD strings. */
  startDate?: string;
  endDate?: string;

  /** Negotiated fee (§43). Missing on a FIXED_FEE draft is a WARNING, not a reject (§73–§74). */
  contractValue?: number;
  /**
   * Commercial ceiling (§51): = contractValue for fixed fee, expected billable
   * value for T&M, sum of milestone amounts for milestone projects. Separate
   * from contractValue so change orders can later diverge them (§52).
   */
  revenueBudget?: number;

  /** Planned cost of delivery (§53). */
  budgetCost?: number;
  /** Target margin, 0–100 (§37/§54). */
  targetMargin?: number;
  /** Delivery baseline for future Time Tracking — planned, never actual (§56). */
  plannedHours?: number;

  /** Accountability owner (§58) — NOT the same as project membership. */
  projectManagerId?: string;

  /**
   * Optional organization-configurable label (§78) — "Web Development",
   * "Branding", … Never a hard-coded industry taxonomy.
   */
  projectType?: string;
  /** Optional simple tags for future reporting (§79) — never mandatory. */
  tags?: string[];

  createdAt: Date | string;
  updatedAt?: Date | string;
}

// ---------- ProjectMember (spec §59–§60, extended Module 5 §32–§41) ----------

/**
 * Role on the project — a free-form CONTEXT LABEL (Module 5 §33): "Designer",
 * "Developer", "QA", "Project Manager"… It NEVER determines system
 * permissions; those stay with Money OS RBAC/capabilities.
 */
export type ProjectMemberRole = string;

/**
 * A person participating in delivery (§59). Three DISTINCT concepts
 * (Module 5 §31): User (organization person) ≠ Project Member (project
 * participant) ≠ Project Manager (accountable coordinator, lives on the
 * Project as projectManagerId).
 *
 * `allocationPercent` is the approximate planned share of the person's
 * working capacity (§34) — METADATA ONLY in Phase 1, never scheduling, and
 * over-allocation across projects is recorded, not blocked (§35; future
 * Resource Planning surfaces it).
 *
 * `active` (Module 5 §37): removal soft-deactivates the membership — the
 * history row stays for audit and future time-record questions ("was this
 * person on the project when the time was logged?", §36).
 */
export interface ProjectMember {
  id: string;
  tenantId: string;
  projectId: string;
  userId: string;
  role?: ProjectMemberRole;
  allocationPercent?: number;
  startDate?: string;
  endDate?: string;
  /** Module 5 §37 — soft removal; membership history is never deleted. */
  active: boolean;
  createdAt: Date | string;
  updatedAt?: Date | string;
}

// ---------- WorkItem (spec §61–§63) ----------

export type WorkItemStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE' | 'ARCHIVED';

export const WORK_ITEM_STATUSES: readonly WorkItemStatus[] = [
  'NOT_STARTED', 'IN_PROGRESS', 'DONE', 'ARCHIVED',
] as const;

/**
 * Module 4 (§11) — the work-item state machine. Forward one step at a time,
 * DONE reopens to IN_PROGRESS (client changes reopen completed work), any
 * non-archived state may archive, ARCHIVED is terminal. No arbitrary
 * user-defined statuses (§10).
 */
export const ALLOWED_WORK_ITEM_TRANSITIONS: Readonly<Record<WorkItemStatus, readonly WorkItemStatus[]>> = {
  NOT_STARTED: ['IN_PROGRESS', 'ARCHIVED'],
  IN_PROGRESS: ['DONE', 'ARCHIVED'],
  DONE: ['IN_PROGRESS', 'ARCHIVED'],
  ARCHIVED: [],
};

export function canTransitionWorkItemStatus(from: WorkItemStatus, to: WorkItemStatus): boolean {
  return ALLOWED_WORK_ITEM_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Lightweight work item (§61 / Module 4 §7–§8): the "on what?" that future
 * time entries need. Financial context — NOT task management. No
 * dependencies, subtasks, Kanban, Gantt, workflow states, automations or
 * comments (§63 / Module 4 §6).
 */
export interface WorkItem {
  id: string;
  tenantId: string;
  projectId: string;

  name: string;
  description?: string;

  status: WorkItemStatus;
  /**
   * Planning estimate in MINUTES (Module 4 §9) — deterministic internal
   * storage; the UI renders "1h 30m". Never decimal hours.
   */
  estimatedMinutes?: number;
  /** User id of the assignee (§81 / Module 4 §12: at most ONE in Phase 1). */
  assignedTo?: string;
  /** Manual ordering within the project (Module 4 §25) — default list sort. */
  sortOrder: number;
  /** Creating user (Module 4 §8) — audit attribution. */
  createdBy: string;

  createdAt: Date | string;
  updatedAt?: Date | string;
}

// ---------- ProjectMilestone (spec §45–§47) ----------

export type MilestoneStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export const MILESTONE_STATUSES: readonly MilestoneStatus[] = [
  'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED',
] as const;

/**
 * Legal milestone delivery-lifecycle transitions (§46).
 *
 *   PLANNED      → IN_PROGRESS, CANCELLED
 *   IN_PROGRESS  → COMPLETED, PLANNED (rollback), CANCELLED
 *   COMPLETED    → IN_PROGRESS (explicit re-open only)
 *   CANCELLED    → (terminal)
 *
 * COMPLETED is intentionally re-openable to IN_PROGRESS to handle scope
 * changes. It is NOT directly re-openable to PLANNED because it already
 * had work done. CANCELLED is terminal in Phase 1.
 */
const ALLOWED_MILESTONE_TRANSITIONS: Readonly<Record<MilestoneStatus, readonly MilestoneStatus[]>> = {
  PLANNED:     ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'PLANNED', 'CANCELLED'],
  COMPLETED:   ['IN_PROGRESS'],
  CANCELLED:   [],
};

/** Pure transition check — mirrors canTransitionProjectStatus. */
export function canTransitionMilestoneStatus(from: MilestoneStatus, to: MilestoneStatus): boolean {
  return ALLOWED_MILESTONE_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Human-readable labels for delivery status badges and dropdowns. */
export const MILESTONE_STATUS_LABEL: Record<MilestoneStatus, string> = {
  PLANNED:     'Planned',
  IN_PROGRESS: 'In Progress',
  COMPLETED:   'Completed',
  CANCELLED:   'Cancelled',
};

export type MilestoneBillingStatus = 'UNBILLED' | 'RESERVED' | 'INVOICED';




/**
 * One milestone of a milestone-billed project (§46). Milestone billing later
 * needs this stable commercial structure — without it, Project → Invoice is
 * ambiguous (§47).
 */
export interface ProjectMilestone {
  id: string;
  /** Not in the §46 sketch, but required for tenant-scoped queries (§80). */
  tenantId: string;
  projectId: string;

  name: string;
  description?: string;

  sequence: number;

  /**
   * Commercial definition (§46): amount OR percentage — never both. Enforced
   * by milestoneHasSingleCommercialDefinition below and the validator layer.
   */
  amount?: number;
  percentage?: number;

  /** Business date, YYYY-MM-DD. */
  dueDate?: string;

  status: MilestoneStatus;

  /** Module 9 (§62/§64) — billing lifecycle; legacy rows read UNBILLED (§106). */
  billingStatus?: MilestoneBillingStatus;
  /** Module 9 — filled at invoice finalization (§73); null while the
   *  INVOICED mark is reverted (§83). */
  invoiceId?: string | null;
  /** §63/§66 — the reservation trail while a draft invoice holds this
   *  milestone. Null = cleared (no draft holds it). */
  reservedBy?: string | null;
  reservedAt?: Date | string | null;
  reservedInvoiceId?: string | null;

  createdAt: Date | string;
  updatedAt?: Date | string;
}

/**
 * §46 invariant: exactly one commercial definition (amount XOR percentage).
 * Neither is also invalid — a milestone must carry commercial meaning before
 * the project activates.
 */
export function milestoneHasSingleCommercialDefinition(
  milestone: { amount?: unknown; percentage?: unknown }
): boolean {
  const hasAmount = milestone.amount !== undefined && milestone.amount !== null;
  const hasPercentage = milestone.percentage !== undefined && milestone.percentage !== null;
  return hasAmount !== hasPercentage; // exactly one
}
