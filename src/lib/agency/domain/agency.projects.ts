/**
 * Agency Vertical — Domain: project service (Module 3, Step 3.4)
 *
 * The ONLY writer path for agency project operations. React components never
 * touch MongoDB — they go API route → this service → db.ts.
 *
 * Responsibilities:
 *   - Lifecycle (§41): status changes only through the dedicated actions —
 *     activate/pause/complete/cancel/archive. PATCH can never smuggle one.
 *   - Activation gate (§75): a project goes ACTIVE only when its commercial
 *     and operational minimums hold (≥1 milestone for MILESTONE projects is
 *     a hard requirement; fixed-fee/T&M baselines are warnings).
 *   - Integrity (§80/§81/§114): client, manager and members must belong to
 *     the SAME tenant — checked here, in the repositories, and in tests.
 *   - Immutability rules: project code once set (§38); currency after
 *     activation (§89 — prevented, which is the practical option).
 *   - Audit (§86–§88): every mutation emits a createLog event via the
 *     caller-supplied hook; financial-field changes carry the field names.
 */
import {
  createProject as createProjectRepo,
  getProjectById, updateProject as updateProjectRepo, findProjectByCode,
  getProjects as getProjectsRepo, searchProjects,
  createProjectMember,
  getProjectWorkItems,
  getProjectMilestones, createProjectMilestone, updateProjectMilestone,
  getClientById, getUserById, getLogs, getTenantById,
  allocateProjectCode,
  type ProjectCreateInput, type ListOptions, type ProjectListFilters,
} from '@/lib/db';
import type {
  Project, ProjectMilestone, ProjectStatus,
} from '../types/project';
import {
  validateProjectCreate, validateProjectUpdate, validateProjectMember,
  validateProjectMilestone, validateMilestoneUpdate,
  type ProjectPayload, type MemberPayload, type MilestonePayload,
  type MilestoneUpdatePayload,
} from '../validators/project';
import { canTransitionProjectStatus, canTransitionMilestoneStatus, formatProjectCode } from '../types/project';
import {
  checkProjectClientIntegrity, checkProjectUserIntegrity,
} from './project-integrity';
import { ensureProjectManagerMembership, setProjectManager } from './agency.project-members';
import { type AuditContext, type DomainResult } from './agency.clients';

/** Domain results for projects may carry advisory warnings (§73/§74). */
export type ProjectDomainResult<T> = DomainResult<T> & { warnings?: string[] };

const notFound = (what: string): DomainResult<never> =>
  ({ ok: false, status: 404, error: `${what} not found` });

const badRequest = (error: string): DomainResult<never> =>
  ({ ok: false, status: 400, error });

/** Fields whose changes influence future profitability — always audited (§87). */
const FINANCIAL_FIELDS = [
  'contractValue', 'revenueBudget', 'budgetCost', 'plannedHours', 'targetMargin',
  'billingModel', 'currency', 'projectManagerId',
] as const;

// ---------- read ----------

export async function listAgencyProjects(
  tenantId: string,
  options: ListOptions & { search?: string } = {},
  filters: ProjectListFilters = {}
): Promise<Project[]> {
  if (options.search) return searchProjects(tenantId, options.search, options, filters);
  return getProjectsRepo(tenantId, options, filters);
}

export async function getAgencyProject(id: string, tenantId: string): Promise<DomainResult<Project>> {
  const project = await getProjectById(id, tenantId);
  if (!project) return notFound('Project');
  return { ok: true, status: 200, data: project };
}

/**
 * Activity timeline for the project workspace (§102 Activity tab): recent
 * audit entries whose detail references the project id. Every domain
 * mutation above embeds the id in its log detail, so this filter catches
 * lifecycle, team, work-item and milestone events alike.
 */
export async function getRecentProjectLogs(
  tenantId: string,
  projectId: string,
  limit = 20
): Promise<Array<{ action: string; details: string; username: string; timestamp: Date | string }>> {
  const logs = await getLogs(tenantId, { limit: 100 });
  return logs
    .filter(l => typeof l.details === 'string' && l.details.includes(projectId))
    .slice(0, limit)
    .map(l => ({ action: l.action, details: l.details, username: l.username, timestamp: l.timestamp }));
}

// ---------- create ----------

/**
 * Create a project (draft by default, §74). `members` may ride along so the
 * creation wizard's Team step (§71 step 6) lands in one call — each member is
 * integrity-checked and audited individually.
 */
export async function createAgencyProject(
  tenantId: string,
  payload: ProjectPayload & { members?: MemberPayload[] },
  audit: AuditContext
): Promise<ProjectDomainResult<Project>> {
  const validated = validateProjectCreate(payload);
  if (!validated.ok) {
    return badRequest(validated.errors.map(e => `${e.field}: ${e.message}`).join('; '));
  }
  let input = validated.value;

  // §80 — the client must exist AND belong to this tenant (§113: identical
  // not-found for both failure modes, never a cross-tenant existence leak).
  const client = await getClientById(input.clientId!, tenantId);
  const clientCheck = checkProjectClientIntegrity(client, tenantId);
  if (!clientCheck.ok) return badRequest(clientCheck.error);

  // §81 — the manager must belong to this tenant
  if (input.projectManagerId) {
    const manager = await getUserById(input.projectManagerId);
    const managerCheck = checkProjectUserIntegrity(manager, tenantId, 'project manager');
    if (!managerCheck.ok) return badRequest(managerCheck.error);
  }

  // §111 — project codes are unique per tenant (case-insensitive via the
  // normalized form). Different casing of a used code is the same code.
  if (input.code) {
    const clash = await findProjectByCode(tenantId, input.code);
    if (clash) {
      return { ok: false, status: 409, error: `Project code "${input.code}" is already used by ${clash.name}` };
    }
  }

  // §81 — every member must belong to this tenant (validated before any write)
  const memberInputs = [];
  const seenUserIds = new Set<string>();
  for (const member of payload.members ?? []) {
    const validatedMember = validateProjectMember(member);
    if (!validatedMember.ok) {
      return badRequest(validatedMember.errors.map(e => `members: ${e.message}`).join('; '));
    }
    const user = await getUserById(validatedMember.value.userId!);
    const userCheck = checkProjectUserIntegrity(user, tenantId, 'project member');
    if (!userCheck.ok) return badRequest(userCheck.error);
    // Module 5 §40 — one membership per user per project, including the
    // wizard's own payload.
    if (seenUserIds.has(validatedMember.value.userId!)) {
      return badRequest(`members: ${validatedMember.value.userId} appears more than once`);
    }
    seenUserIds.add(validatedMember.value.userId!);
    memberInputs.push(validatedMember.value);
  }

  // §46/§14 (Module 17) — the agency's default target margin applies when the
  // payload omits one. Creation-time default ONLY: an existing project's
  // margin is never rewritten by a later settings change.
  if (input.targetMargin === undefined) {
    const settingsTenant = await getTenantById(tenantId);
    const defaultMargin = settingsTenant?.agencySettings?.profitability?.targetProjectMargin;
    if (defaultMargin !== undefined) {
      input = { ...input, targetMargin: defaultMargin };
    }
  }

  // Module 3 — codes are assigned by the system. The UI no longer asks for one;
  // a caller that DOES send one keeps the explicit path above (uniqueness check
  // + 409), so Bruno suites and any integration that pins a code are unaffected.
  // Generated codes come from the atomic per-tenant sequence, so they are unique
  // by construction and need no clash check.
  if (!input.code) {
    input = { ...input, code: formatProjectCode(await allocateProjectCode(tenantId)) };
  }

  const project = await createProjectRepo(tenantId, input as ProjectCreateInput);

  for (const member of memberInputs) {
    await createProjectMember(tenantId, project.id, member);
    await audit.log('PROJECT_MEMBER_ADDED', `Member ${member.userId} added to project ${project.name} (${project.id})`);
  }

  await audit.log('PROJECT_CREATED', `Created project: ${project.name} (${project.id}) for client ${input.clientId}`);
  return { ok: true, status: 201, data: project, warnings: validated.warnings };
}

// ---------- update ----------

export async function updateAgencyProject(
  id: string,
  tenantId: string,
  payload: ProjectPayload,
  audit: AuditContext
): Promise<ProjectDomainResult<Project>> {
  const existing = await getProjectById(id, tenantId);
  if (!existing) return notFound('Project');

  const validated = validateProjectUpdate(payload);
  if (!validated.ok) {
    return badRequest(validated.errors.map(e => `${e.field}: ${e.message}`).join('; '));
  }
  const updates = validated.value;

  // A project is anchored to its client (§80 — re-parenting is not a Phase 1
  // operation; cancel + recreate instead).
  if (updates.clientId && updates.clientId !== existing.clientId) {
    return badRequest('A project cannot be moved to a different client');
  }

  // §38 — the code is immutable once set; an explicit admin change would be
  // a future controlled operation. Setting a code on a codeless project is
  // allowed but must respect tenant-wide uniqueness (§111).
  if (updates.code && existing.code && updates.code !== existing.code) {
    return badRequest('Project code is immutable once set');
  }
  if (updates.code && !existing.code) {
    const clash = await findProjectByCode(tenantId, updates.code, id);
    if (clash) {
      return { ok: false, status: 409, error: `Project code "${updates.code}" is already used by ${clash.name}` };
    }
  }

  // §89 — currency changes after activation are prevented (the practical
  // option). In DRAFT the commercial setup is still being explored.
  if (updates.currency && updates.currency !== existing.currency && existing.status !== 'DRAFT') {
    return badRequest('Project currency cannot change after activation');
  }

  // §48/§49 — a manager change goes through the dedicated service: tenant
  // validation BEFORE any write, audited as the financial field it is, and
  // the new manager is kept on the team (§39).
  let managerChanged = false;
  if (updates.projectManagerId && updates.projectManagerId !== existing.projectManagerId) {
    const managerResult = await setProjectManager(id, tenantId, updates.projectManagerId, audit);
    if (!managerResult.ok) return managerResult;
    managerChanged = true;
  }

  const writeable = { ...updates } as Partial<Project>;
  delete (writeable as { clientId?: string }).clientId; // never rewritten here
  delete (writeable as { projectManagerId?: string }).projectManagerId; // owned by setProjectManager
  if (Object.keys(writeable).length === 0 && !managerChanged) {
    return badRequest('No valid project fields provided');
  }

  if (Object.keys(writeable).length > 0) {
    const success = await updateProjectRepo(id, tenantId, writeable);
    if (!success) return notFound('Project');

    // §87–§88 — financial-field changes always leave an audit trail naming
    // exactly what moved.
    const changedFinancial = FINANCIAL_FIELDS.filter(
      f => writeable[f as keyof typeof writeable] !== undefined &&
        writeable[f as keyof typeof writeable] !== (existing as unknown as Record<string, unknown>)[f]
    );
    if (changedFinancial.length > 0) {
      await audit.log('PROJECT_UPDATED', `Project ${id} financial fields changed: ${changedFinancial.join(', ')}`);
    }
    await audit.log('PROJECT_UPDATED', `Updated project ${id} (${Object.keys(writeable).filter(k => k !== 'updatedAt').join(', ')})`);
  }

  const updated = await getProjectById(id, tenantId);
  return { ok: true, status: 200, data: updated!, warnings: validated.warnings };
}

// ---------- lifecycle (§41) ----------

async function transitionProjectStatus(
  id: string, tenantId: string, to: ProjectStatus,
  action: string, audit: AuditContext
): Promise<DomainResult<Project>> {
  const existing = await getProjectById(id, tenantId);
  if (!existing) return notFound('Project');

  if (!canTransitionProjectStatus(existing.status, to)) {
    return badRequest(`Cannot move a project from ${existing.status} to ${to}`);
  }

  const success = await updateProjectRepo(id, tenantId, { status: to });
  if (!success) return notFound('Project');
  await audit.log(action, `Project ${id} → ${to} (was ${existing.status})`);
  const updated = await getProjectById(id, tenantId);
  return { ok: true, status: 200, data: updated! };
}

/**
 * §75 — the activation gate. Hard requirements: the commercial core exists
 * and (for MILESTONE projects) at least one milestone is defined. Advisory:
 * fixed-fee revenue baseline, T&M billing configuration.
 */
export async function activateAgencyProject(
  id: string, tenantId: string, audit: AuditContext
): Promise<ProjectDomainResult<Project>> {
  const existing = await getProjectById(id, tenantId);
  if (!existing) return notFound('Project');

  if (!canTransitionProjectStatus(existing.status, 'ACTIVE')) {
    return badRequest(`Cannot activate a project in ${existing.status}`);
  }

  const warnings: string[] = [];

  // §75 core — clientId/name/billingModel/currency are schema-required, but
  // the gate checks rather than assumes (defense in depth).
  if (!existing.clientId || !existing.name || !existing.billingModel || !existing.currency) {
    return badRequest('Project needs a client, name, billing model and currency before activation');
  }

  if (existing.billingModel === 'FIXED_FEE' && existing.contractValue === undefined && existing.revenueBudget === undefined) {
    warnings.push('Fixed-fee project activates without a contract value — set a revenue baseline (recommended)');
  }
  if (existing.billingModel === 'TIME_AND_MATERIALS' && existing.plannedHours === undefined) {
    warnings.push('T&M project activates without planned hours — revenue will derive from billable hours once Time Tracking lands');
  }
  if (existing.billingModel === 'MILESTONE') {
    const milestones = await getProjectMilestones(id, tenantId);
    const active = milestones.filter(m => m.status !== 'CANCELLED');
    if (active.length === 0) {
      return badRequest('At least one milestone is required before activating a milestone project');
    }
    // §115 — percentage-based milestones should fully allocate the contract.
    // Under-allocation is a WARNING, not a block: the project can deliver
    // while the milestone plan is still being negotiated.
    const percentageMilestones = active.filter(m => m.percentage !== undefined);
    if (percentageMilestones.length > 0) {
      const total = percentageMilestones.reduce((sum, m) => sum + (m.percentage ?? 0), 0);
      if (total !== 100) {
        warnings.push(`Milestone percentages total ${total}% — a full contractual allocation expects 100% before milestone invoicing`);
      }
    }
  }

  const success = await updateProjectRepo(id, tenantId, { status: 'ACTIVE' });
  if (!success) return notFound('Project');
  // COMPLETED → ACTIVE is the explicit reopen (§41) — the log says so.
  const reopen = existing.status === 'COMPLETED' ? ' (explicit reopen)' : '';
  await audit.log('PROJECT_ACTIVATED', `Project ${id} → ACTIVE (was ${existing.status})${reopen}`);

  // Module 5 §39 — at activation the manager must be on the team; the
  // system adds them (role "Project Manager") rather than leaving the
  // accountable person outside their own project.
  if (existing.projectManagerId) {
    await ensureProjectManagerMembership(id, tenantId, existing.projectManagerId, audit);
  }

  const updated = await getProjectById(id, tenantId);
  return { ok: true, status: 200, data: updated!, warnings };
}

/** ACTIVE → ON_HOLD (§41). */
export function pauseAgencyProject(id: string, tenantId: string, audit: AuditContext) {
  return transitionProjectStatus(id, tenantId, 'ON_HOLD', 'PROJECT_PAUSED', audit);
}

/** ACTIVE/ON_HOLD → COMPLETED (§41). */
export function completeAgencyProject(id: string, tenantId: string, audit: AuditContext) {
  return transitionProjectStatus(id, tenantId, 'COMPLETED', 'PROJECT_COMPLETED', audit);
}

/** DRAFT/ACTIVE/ON_HOLD → CANCELLED (§41). */
export function cancelAgencyProject(id: string, tenantId: string, audit: AuditContext) {
  return transitionProjectStatus(id, tenantId, 'CANCELLED', 'PROJECT_CANCELLED', audit);
}

/**
 * COMPLETED → ARCHIVED (§41/§76). Projects with financial history are never
 * deleted — future modules depend on historical project references.
 */
export function archiveAgencyProject(id: string, tenantId: string, audit: AuditContext) {
  return transitionProjectStatus(id, tenantId, 'ARCHIVED', 'PROJECT_ARCHIVED', audit);
}

// ---------- members ----------
// Project-team operations moved to the dedicated Module 5 service
// (agency.project-members.ts, §49). Kept out of this file deliberately:
// the project service owns the aggregate's lifecycle, not its team roster.

// ---------- work items ----------
// Work-item operations moved to the dedicated Module 4 service
// (agency.work-items.ts, §17). Kept out of this file deliberately: the
// project service owns the aggregate's lifecycle, not its line items.

// ---------- milestones (§46/§85) ----------

export async function createAgencyMilestone(
  projectId: string, tenantId: string, payload: MilestonePayload, audit: AuditContext
): Promise<DomainResult<ProjectMilestone>> {
  const project = await getProjectById(projectId, tenantId);
  if (!project) return notFound('Project');

  const validated = validateProjectMilestone(payload);
  if (!validated.ok) {
    return badRequest(validated.errors.map(e => `${e.field}: ${e.message}`).join('; '));
  }

  // Percentage milestones must never allocate beyond the full contract —
  // checked BEFORE the write so no rollback is ever needed.
  if (validated.value.percentage !== undefined) {
    const existing = await getProjectMilestones(projectId, tenantId);
    const total = existing
      .filter(m => m.status !== 'CANCELLED')
      .reduce((sum, m) => sum + (m.percentage ?? 0), 0) + validated.value.percentage;
    if (total > 100) {
      return badRequest(`Milestone percentages would total ${total}% — the sum cannot exceed 100`);
    }
  }

  const milestone = await createProjectMilestone(tenantId, projectId, validated.value);
  await audit.log('MILESTONE_CREATED', `Milestone "${validated.value.name}" created on project ${projectId}`);
  return { ok: true, status: 201, data: milestone };
}

export async function updateAgencyMilestone(
  milestoneId: string, projectId: string, tenantId: string,
  payload: MilestoneUpdatePayload, audit: AuditContext
): Promise<DomainResult<ProjectMilestone>> {
  const project = await getProjectById(projectId, tenantId);
  if (!project) return notFound('Project');

  // §85 — use the lenient update validator so status-only PATCHes are accepted.
  const validated = validateMilestoneUpdate(payload);
  if (!validated.ok) {
    return badRequest(validated.errors.map(e => `${e.field}: ${e.message}`).join('; '));
  }

  const all = await getProjectMilestones(projectId, tenantId);
  const target = all.find(m => m.id === milestoneId);
  if (!target) return notFound('Milestone');

  // §46 / transition guard — if a status change is requested, enforce the
  // legal transition table. In addition to standard state-machine steps,
  // milestone sign-offs can directly complete a PLANNED milestone (§70 / Invoices E2E 13).
  if (validated.value.status !== undefined && validated.value.status !== target.status) {
    const isDirectCompletion = target.status === 'PLANNED' && validated.value.status === 'COMPLETED';
    if (!isDirectCompletion && !canTransitionMilestoneStatus(target.status, validated.value.status)) {
      return badRequest(
        `Cannot transition milestone from '${target.status}' to '${validated.value.status}'. ` +
        `Legal transitions from '${target.status}' are: PLANNED→IN_PROGRESS/COMPLETED/CANCELLED, ` +
        `IN_PROGRESS→COMPLETED/PLANNED/CANCELLED, COMPLETED→IN_PROGRESS.`
      );
    }
  }

  // Percentage sum guard — only applies when the caller is changing the
  // percentage field (not on a status-only PATCH).
  if (validated.value.percentage !== undefined) {
    const others = all.filter(m => m.id !== milestoneId && m.status !== 'CANCELLED');
    const total = others.reduce((sum, m) => sum + (m.percentage ?? 0), 0) + validated.value.percentage;
    if (total > 100) {
      return badRequest(`Milestone percentages would total ${total}% — the sum cannot exceed 100`);
    }
  }

  const success = await updateProjectMilestone(milestoneId, projectId, tenantId, validated.value);
  if (!success) return notFound('Milestone');

  await audit.log('MILESTONE_UPDATED', `Milestone ${milestoneId} updated on project ${projectId} (${Object.keys(validated.value).join(', ')})`);
  const updated = (await getProjectMilestones(projectId, tenantId)).find(m => m.id === milestoneId);
  return { ok: true, status: 200, data: updated };
}
