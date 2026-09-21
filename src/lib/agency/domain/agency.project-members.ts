/**
 * Agency Vertical — Domain: project member service (Module 5, §49)
 *
 * The ONLY writer path for project-team operations. React components never
 * touch MongoDB — they go API route → this service → db.ts.
 *
 * Responsibilities:
 *   - The three DISTINCT concepts (§31): User ≠ Project Member ≠ Project
 *     Manager. This service owns the middle one; the PM relationship lives
 *     on the Project (projectManagerId) but is kept CONSISTENT with
 *     membership through setProjectManager/ensureProjectManagerMembership.
 *   - Eligibility (§38): only same-tenant organization users can join.
 *   - Uniqueness (§40): one ACTIVE membership per (tenant, project, user).
 *   - Soft removal (§37/§45): active=false — membership history is never
 *     deleted, so audit and future time records can answer "was this person
 *     on the project when the time was logged?" (§36).
 *   - Roles (§33): context labels only — they NEVER grant permissions.
 *   - Audit: PROJECT_MEMBER_ADDED / UPDATED / REMOVED, projectId embedded so
 *     the project Activity timeline (§102) surfaces them.
 */
import {
  getProjectById, getUserById, updateProject as updateProjectRepo,
  getProjectMembers, createProjectMember,
  updateProjectMember as updateProjectMemberRepo,
  removeProjectMember as removeProjectMemberRepo,
} from '@/lib/db';
import type { Project, ProjectMember } from '../types/project';
import { validateProjectMember, type MemberPayload } from '../validators/project';
import { checkProjectUserIntegrity } from './project-integrity';
import { type AuditContext, type DomainResult } from './agency.clients';

const notFound = (what: string): DomainResult<never> =>
  ({ ok: false, status: 404, error: `${what} not found` });

const badRequest = (error: string): DomainResult<never> =>
  ({ ok: false, status: 400, error });

/** The role the system stamps when it auto-adds the project manager (§39). */
export const PROJECT_MANAGER_ROLE = 'Project Manager';

// ---------- read ----------

/**
 * §47 — the project's memberships. Active by default (§42 team view);
 * `includeInactive` surfaces removed history (§37) for audit.
 */
export async function listProjectMembers(
  projectId: string,
  tenantId: string,
  options: { includeInactive?: boolean } = {}
): Promise<DomainResult<ProjectMember[]>> {
  const project = await getProjectById(projectId, tenantId);
  if (!project) return notFound('Project');
  const members = await getProjectMembers(projectId, tenantId, options);
  return { ok: true, status: 200, data: members };
}

// ---------- add ----------

/** §44 — add one member. Duplicate ACTIVE membership is a 409 (§40). */
export async function addProjectMember(
  projectId: string,
  tenantId: string,
  payload: MemberPayload,
  audit: AuditContext
): Promise<DomainResult<ProjectMember>> {
  const project = await getProjectById(projectId, tenantId);
  if (!project) return notFound('Project');

  const validated = validateProjectMember(payload);
  if (!validated.ok) {
    return badRequest(validated.errors.map(e => `${e.field}: ${e.message}`).join('; '));
  }

  // §38 — only organization users of the SAME tenant
  const user = await getUserById(validated.value.userId!);
  const userCheck = checkProjectUserIntegrity(user, tenantId, 'project member');
  if (!userCheck.ok) return badRequest(userCheck.error);

  // §40 — uniqueness applies to ACTIVE membership only: a removed member
  // may return as a fresh row (§37 history stays intact).
  const members = await getProjectMembers(projectId, tenantId);
  if (members.some(m => m.userId === validated.value.userId)) {
    return { ok: false, status: 409, error: 'That user is already a member of this project' };
  }

  const member = await createProjectMember(tenantId, projectId, validated.value);
  await audit.log('PROJECT_MEMBER_ADDED', `Member ${validated.value.userId} added to project ${project.name} (${projectId})`);
  return { ok: true, status: 201, data: member };
}

// ---------- update ----------

/**
 * §47 PATCH — role/allocation/dates only. Membership identity (userId) is
 * fixed: remove + re-add instead. Historical (inactive) rows are immutable —
 * re-add the member rather than editing history (§37).
 */
export async function updateProjectMember(
  memberId: string,
  projectId: string,
  tenantId: string,
  payload: MemberPayload,
  audit: AuditContext
): Promise<DomainResult<null>> {
  const project = await getProjectById(projectId, tenantId);
  if (!project) return notFound('Project');

  const members = await getProjectMembers(projectId, tenantId, { includeInactive: true });
  const member = members.find(m => m.id === memberId);
  if (!member) return notFound('Project member');
  if (member.active === false) {
    return badRequest('That membership has been removed — add the member again instead of editing history');
  }

  // Identity (§31) is fixed: validate against the ROW's userId, never the
  // payload's. This keeps the strict add-time contract (User required) while
  // letting PATCH send only the mutable fields (role/allocation/dates).
  const { userId: _ignored, ...mutable } = payload as MemberPayload;
  const validated = validateProjectMember({ userId: member.userId, ...mutable });
  if (!validated.ok) {
    return badRequest(validated.errors.map(e => `${e.field}: ${e.message}`).join('; '));
  }
  const { userId, ...updates } = validated.value; // identity is fixed
  if (Object.keys(updates).length === 0) return badRequest('No valid member fields provided');

  const success = await updateProjectMemberRepo(memberId, projectId, tenantId, updates);
  if (!success) return notFound('Project member');
  // §50 — granular membership events. Role and allocation are the two the
  // team timeline cares about, so each gets its own action; other fields
  // (membership dates) stay under the umbrella PROJECT_MEMBER_UPDATED.
  if (updates.role !== undefined) {
    await audit.log('PROJECT_MEMBER_ROLE_CHANGED', `Member ${member.userId} role → ${updates.role} on project ${projectId}`);
  }
  if (updates.allocationPercent !== undefined) {
    await audit.log('PROJECT_MEMBER_ALLOCATION_CHANGED', `Member ${member.userId} allocation → ${updates.allocationPercent}% on project ${projectId}`);
  }
  const otherFields = Object.keys(updates).filter(f => f !== 'role' && f !== 'allocationPercent');
  if (otherFields.length > 0) {
    await audit.log('PROJECT_MEMBER_UPDATED', `Member ${member.userId} updated on project ${projectId} (${otherFields.join(', ')})`);
  }
  return { ok: true, status: 200, data: null };
}

// ---------- remove ----------

/**
 * §45 — "Remove from Project" soft-deactivates the membership. The row and
 * its dates survive for audit and time-record questions; the user themself
 * is untouched.
 */
export async function removeProjectMember(
  memberId: string,
  projectId: string,
  tenantId: string,
  audit: AuditContext
): Promise<DomainResult<null>> {
  const project = await getProjectById(projectId, tenantId);
  if (!project) return notFound('Project');

  const members = await getProjectMembers(projectId, tenantId, { includeInactive: true });
  const member = members.find(m => m.id === memberId);
  if (!member) return notFound('Project member');
  if (member.active === false) {
    return badRequest('That member has already been removed from this project');
  }

  const success = await removeProjectMemberRepo(memberId, projectId, tenantId);
  if (!success) return notFound('Project member');
  await audit.log('PROJECT_MEMBER_REMOVED', `Member ${member.userId} removed from project ${projectId} (membership kept as history)`);
  return { ok: true, status: 200, data: null };
}

// ---------- project manager (§39/§48/§49) ----------

/**
 * §39 — keep the manager on the team: if the PM is not an ACTIVE member,
 * add them with role "Project Manager". Shared by activation and
 * setProjectManager so the two paths can never drift apart.
 */
export async function ensureProjectManagerMembership(
  projectId: string,
  tenantId: string,
  managerId: string,
  audit: AuditContext
): Promise<DomainResult<null>> {
  const members = await getProjectMembers(projectId, tenantId);
  if (members.some(m => m.userId === managerId)) return { ok: true, status: 200, data: null };

  await createProjectMember(tenantId, projectId, { userId: managerId, role: PROJECT_MANAGER_ROLE });
  await audit.log('PROJECT_MEMBER_ADDED', `Project manager ${managerId} auto-added to the team on project ${projectId} (§39)`);
  return { ok: true, status: 200, data: null };
}

/**
 * §48/§49 — change the project manager. The user must belong to the tenant
 * (validated BEFORE any write), the change is audited as the financial-field
 * it is (§87), and the new manager is kept on the team (§39 recommendation).
 */
export async function setProjectManager(
  projectId: string,
  tenantId: string,
  userId: string,
  audit: AuditContext
): Promise<DomainResult<Project>> {
  const existing = await getProjectById(projectId, tenantId);
  if (!existing) return notFound('Project');

  if (!userId) return badRequest('A project manager user is required');
  if (userId === existing.projectManagerId) {
    return badRequest('That user is already the project manager');
  }

  // §48 — tenant validation, never trusting the UI selection
  const manager = await getUserById(userId);
  const managerCheck = checkProjectUserIntegrity(manager, tenantId, 'project manager');
  if (!managerCheck.ok) return badRequest(managerCheck.error);

  const success = await updateProjectRepo(projectId, tenantId, { projectManagerId: userId });
  if (!success) return notFound('Project');
  // §50 — the manager change is its own event (it used to ride the generic
  // financial-fields PROJECT_UPDATED audit).
  await audit.log('PROJECT_MANAGER_CHANGED', `Project ${projectId} manager → ${userId}`);

  // §39 — the manager should be a member; auto-add keeps states consistent.
  await ensureProjectManagerMembership(projectId, tenantId, userId, audit);

  const updated = await getProjectById(projectId, tenantId);
  return { ok: true, status: 200, data: updated! };
}
