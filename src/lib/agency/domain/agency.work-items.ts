/**
 * Agency Vertical — Domain: work item service (Module 4, §17)
 *
 * The ONLY writer path for work-item operations. React components never
 * touch MongoDB — they go API route → this service → db.ts.
 *
 * Responsibilities:
 *   - Integrity (§15): the project and the assignee must belong to the SAME
 *     tenant — checked here even though the UI selected them, because the UI
 *     is never trusted (§114 spirit).
 *   - State machine (§11): NOT_STARTED → IN_PROGRESS → DONE, DONE reopens to
 *     IN_PROGRESS, any non-archived state archives, ARCHIVED is terminal.
 *     Archive is a DEDICATED action — never smuggled through a PATCH.
 *   - Minutes (§9): estimatedMinutes is the only stored estimate; legacy
 *     decimal-hours input is converted at the validator boundary.
 *   - Audit (§26): CREATED / UPDATED / ASSIGNED / UNASSIGNED /
 *     STATUS_CHANGED / ARCHIVED.
 *
 * Scope boundary (§6): no subtasks, dependencies, Gantt, Kanban, automations,
 * recurring tasks, templates, custom workflows, comments, proofing, client
 * approvals, AI, or portfolio management. This is financial attribution, not
 * project management.
 */
import {
  getProjectById, getUserById,
  getWorkItemById,
  listWorkItems as listWorkItemsRepo,
  createWorkItem as createWorkItemRepo,
  updateWorkItem as updateWorkItemRepo,
  getNextWorkItemSortOrder,
  type WorkItemFilters, type WorkItemSort,
} from '@/lib/db';
import type { WorkItem, WorkItemStatus } from '../types/project';
import { canTransitionWorkItemStatus } from '../types/project';
import { validateWorkItem, type WorkItemPayload } from '../validators/project';
import { checkProjectUserIntegrity } from './project-integrity';
import { type AuditContext, type DomainResult } from './agency.clients';

const notFound = (what: string): DomainResult<never> =>
  ({ ok: false, status: 404, error: `${what} not found` });

const badRequest = (error: string): DomainResult<never> =>
  ({ ok: false, status: 400, error });

// ---------- read ----------

/**
 * §24/§25 — filtered, searched, sorted list. The project itself must exist
 * in this tenant (a missing/cross-tenant project is the same 404, §113).
 */
export async function listWorkItems(
  tenantId: string,
  projectId: string,
  options: { search?: string; sort?: WorkItemSort } = {},
  filters: WorkItemFilters = {}
): Promise<DomainResult<WorkItem[]>> {
  const project = await getProjectById(projectId, tenantId);
  if (!project) return notFound('Project');
  const items = await listWorkItemsRepo(tenantId, projectId, options, filters);
  return { ok: true, status: 200, data: items };
}

/** §16 — single work item, project- and tenant-scoped (§113 identical 404). */
export async function getWorkItem(
  itemId: string,
  projectId: string,
  tenantId: string
): Promise<DomainResult<WorkItem>> {
  const item = await getWorkItemById(itemId, projectId, tenantId);
  if (!item) return notFound('Work item');
  return { ok: true, status: 200, data: item };
}

// ---------- create ----------

/** §22 — creation. Defaults: status NOT_STARTED, sortOrder appended last. */
export async function createWorkItem(
  tenantId: string,
  projectId: string,
  payload: WorkItemPayload,
  audit: AuditContext,
  createdBy: string
): Promise<DomainResult<WorkItem>> {
  const project = await getProjectById(projectId, tenantId);
  if (!project) return notFound('Project');

  const validated = validateWorkItem(payload);
  if (!validated.ok) {
    return badRequest(validated.errors.map(e => `${e.field}: ${e.message}`).join('; '));
  }
  const input = validated.value;

  // §15 — the assignee must belong to the same tenant as the project
  if (input.assignedTo) {
    const user = await getUserById(input.assignedTo);
    const userCheck = checkProjectUserIntegrity(user, tenantId, 'work item assignee');
    if (!userCheck.ok) return badRequest(userCheck.error);
  }

  // §25 — new items append to the end of the manual order
  const sortOrder = input.sortOrder ?? (await getNextWorkItemSortOrder(tenantId, projectId));

  const item = await createWorkItemRepo(tenantId, projectId, {
    ...input,
    sortOrder,
    createdBy,
  });

  await audit.log('WORK_ITEM_CREATED', `Work item "${input.name}" created on project ${project.name} (${projectId})`);
  // §26 — an initial assignment is an assignment event too
  if (input.assignedTo) {
    await audit.log('WORK_ITEM_ASSIGNED', `Work item "${input.name}" (${item.id}) assigned to ${input.assignedTo} on project ${projectId}`);
  }
  return { ok: true, status: 201, data: item };
}

// ---------- update ----------

/**
 * §16 PATCH — partial update. Status changes are transition-checked (§11);
 * ARCHIVED can never be PATCHed in (the dedicated archive action owns it).
 * Assignment changes emit their own audit events (§26).
 */
export async function updateWorkItem(
  itemId: string,
  projectId: string,
  tenantId: string,
  payload: WorkItemPayload,
  audit: AuditContext
): Promise<DomainResult<WorkItem>> {
  const existing = await getWorkItemById(itemId, projectId, tenantId);
  if (!existing) return notFound('Work item');

  // §16 PATCH is PARTIAL: the validator demands a name, so an omitted name
  // is validated against the ROW's current one and then stripped — only
  // fields the client actually sent reach the write.
  const payloadWithName = { ...payload, name: payload.name !== undefined ? payload.name : existing.name };
  const validated = validateWorkItem(payloadWithName);
  if (!validated.ok) {
    return badRequest(validated.errors.map(e => `${e.field}: ${e.message}`).join('; '));
  }
  const updates = validated.value;
  if (payload.name === undefined) delete (updates as { name?: string }).name;

  // §11 — a PATCHed status must be a legal transition from the current one
  if (updates.status !== undefined && updates.status !== existing.status) {
    if (updates.status === 'ARCHIVED') {
      return badRequest('Work item archival uses the archive action');
    }
    if (!canTransitionWorkItemStatus(existing.status, updates.status)) {
      return badRequest(`Cannot move a work item from ${existing.status} to ${updates.status}`);
    }
  }

  // §15 — a newly assigned user must belong to the same tenant
  if (updates.assignedTo && updates.assignedTo !== existing.assignedTo) {
    const user = await getUserById(updates.assignedTo);
    const userCheck = checkProjectUserIntegrity(user, tenantId, 'work item assignee');
    if (!userCheck.ok) return badRequest(userCheck.error);
  }

  const writeable = { ...updates } as Partial<WorkItem>;
  delete (writeable as { createdBy?: string }).createdBy; // never rewritten here
  if (Object.keys(writeable).length === 0) {
    return badRequest('No valid work item fields provided');
  }

  const success = await updateWorkItemRepo(itemId, projectId, tenantId, writeable);
  if (!success) return notFound('Work item');

  // §26 — assignment and status changes get their OWN events, in addition to
  // the generic UPDATED trail.
  if (updates.assignedTo !== undefined && updates.assignedTo !== existing.assignedTo) {
    if (updates.assignedTo === '') {
      await audit.log('WORK_ITEM_UNASSIGNED', `Work item "${existing.name}" (${itemId}) unassigned${existing.assignedTo ? ` (was ${existing.assignedTo})` : ''} on project ${projectId}`);
    } else {
      await audit.log('WORK_ITEM_ASSIGNED', `Work item "${existing.name}" (${itemId}) assigned to ${updates.assignedTo} on project ${projectId}`);
    }
  }
  if (updates.status !== undefined && updates.status !== existing.status) {
    await audit.log('WORK_ITEM_STATUS_CHANGED', `Work item "${existing.name}" (${itemId}) → ${updates.status} (was ${existing.status}) on project ${projectId}`);
  }
  await audit.log('WORK_ITEM_UPDATED', `Work item ${itemId} updated on project ${projectId} (${Object.keys(writeable).filter(k => k !== 'updatedAt').join(', ')})`);

  const updated = await getWorkItemById(itemId, projectId, tenantId);
  return { ok: true, status: 200, data: updated! };
}

// ---------- status / archive / assignment (§17) ----------

/** §11 — dedicated status transition with the state machine enforced. */
export async function changeWorkItemStatus(
  itemId: string,
  projectId: string,
  tenantId: string,
  to: WorkItemStatus,
  audit: AuditContext
): Promise<DomainResult<WorkItem>> {
  const existing = await getWorkItemById(itemId, projectId, tenantId);
  if (!existing) return notFound('Work item');

  if (to === 'ARCHIVED') {
    return badRequest('Work item archival uses the archive action');
  }
  if (to === existing.status) {
    return badRequest(`Work item is already ${to}`);
  }
  if (!canTransitionWorkItemStatus(existing.status, to)) {
    return badRequest(`Cannot move a work item from ${existing.status} to ${to}`);
  }

  const success = await updateWorkItemRepo(itemId, projectId, tenantId, { status: to });
  if (!success) return notFound('Work item');
  await audit.log('WORK_ITEM_STATUS_CHANGED', `Work item "${existing.name}" (${itemId}) → ${to} (was ${existing.status}) on project ${projectId}`);
  const updated = await getWorkItemById(itemId, projectId, tenantId);
  return { ok: true, status: 200, data: updated! };
}

/**
 * §11/§16 — archive. Soft removal from the operational list (no physical
 * delete exists anywhere); ARCHIVED is terminal.
 */
export async function archiveWorkItem(
  itemId: string,
  projectId: string,
  tenantId: string,
  audit: AuditContext
): Promise<DomainResult<WorkItem>> {
  const existing = await getWorkItemById(itemId, projectId, tenantId);
  if (!existing) return notFound('Work item');

  if (!canTransitionWorkItemStatus(existing.status, 'ARCHIVED')) {
    return badRequest(`Cannot archive a work item in ${existing.status}`);
  }

  const success = await updateWorkItemRepo(itemId, projectId, tenantId, { status: 'ARCHIVED' });
  if (!success) return notFound('Work item');
  await audit.log('WORK_ITEM_ARCHIVED', `Work item "${existing.name}" (${itemId}) archived (was ${existing.status}) on project ${projectId}`);
  const updated = await getWorkItemById(itemId, projectId, tenantId);
  return { ok: true, status: 200, data: updated! };
}

/** §12 — assign ONE primary assignee (Phase 1 maximum). */
export async function assignWorkItem(
  itemId: string,
  projectId: string,
  tenantId: string,
  userId: string,
  audit: AuditContext
): Promise<DomainResult<WorkItem>> {
  const existing = await getWorkItemById(itemId, projectId, tenantId);
  if (!existing) return notFound('Work item');

  if (!userId) return badRequest('An assignee is required');

  // §15 — the assignee must belong to the same tenant
  const user = await getUserById(userId);
  const userCheck = checkProjectUserIntegrity(user, tenantId, 'work item assignee');
  if (!userCheck.ok) return badRequest(userCheck.error);

  if (existing.assignedTo === userId) {
    return { ok: false, status: 409, error: 'That user is already assigned to this work item' };
  }

  const success = await updateWorkItemRepo(itemId, projectId, tenantId, { assignedTo: userId });
  if (!success) return notFound('Work item');
  await audit.log('WORK_ITEM_ASSIGNED', `Work item "${existing.name}" (${itemId}) assigned to ${userId} on project ${projectId}`);
  const updated = await getWorkItemById(itemId, projectId, tenantId);
  return { ok: true, status: 200, data: updated! };
}

/** §26 — removing the assignment leaves the work item itself intact. */
export async function unassignWorkItem(
  itemId: string,
  projectId: string,
  tenantId: string,
  audit: AuditContext
): Promise<DomainResult<WorkItem>> {
  const existing = await getWorkItemById(itemId, projectId, tenantId);
  if (!existing) return notFound('Work item');

  if (!existing.assignedTo) {
    return badRequest('Work item has no assignee');
  }

  const success = await updateWorkItemRepo(itemId, projectId, tenantId, { assignedTo: '' });
  if (!success) return notFound('Work item');
  await audit.log('WORK_ITEM_UNASSIGNED', `Work item "${existing.name}" (${itemId}) unassigned (was ${existing.assignedTo}) on project ${projectId}`);
  const updated = await getWorkItemById(itemId, projectId, tenantId);
  return { ok: true, status: 200, data: updated! };
}
