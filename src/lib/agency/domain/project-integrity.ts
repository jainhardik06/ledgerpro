/**
 * Agency Vertical — Domain: project integrity layer (Module 3, spec §80/§81/§113/§114)
 *
 * The tenant-integrity invariants for the project graph:
 *
 *   Project.tenantId === Client.tenantId          (§80 — a project can never
 *                                                  reference another tenant's client)
 *   projectManagerId → user in the SAME tenant    (§81)
 *   every ProjectMember.userId → SAME tenant      (§81)
 *
 * Spec §80 names the enforcement points explicitly: API, database
 * query/service, authorization layer, and the test suite — NOT only the UI.
 * This module is the reusable check both the domain service and the API
 * routes call before any write; the repositories are additionally
 * tenant-scoped BY CONSTRUCTION (every query filters on tenantId), so a
 * mismatched reference simply does not resolve.
 *
 * §113 (never reveal cross-tenant existence): a missing reference and a
 * reference owned by ANOTHER tenant produce the SAME "not found" result.
 * The distinction exists only in the caller's logs, never in the API body.
 */

/** Minimal structural shape the checks need — works for Client and User. */
interface TenantScopedEntity {
  tenantId?: string;
}

export type IntegrityResult = { ok: true } | { ok: false; error: string };

/**
 * §80 — the project's client must exist AND belong to the same tenant.
 * Both failure modes return the same error on purpose (§113).
 */
export function checkProjectClientIntegrity(
  client: TenantScopedEntity | null | undefined,
  tenantId: string
): IntegrityResult {
  if (!client || client.tenantId !== tenantId) {
    return { ok: false, error: 'Project client not found in this workspace' };
  }
  return { ok: true };
}

/**
 * §81 — a referenced user (project manager, member, Module 4 work-item
 * assignee, or Module 6 cost-rate recipient) must exist AND belong to the
 * same tenant. Same never-reveal rule as clients.
 */
export function checkProjectUserIntegrity(
  user: TenantScopedEntity | null | undefined,
  tenantId: string,
  context: 'project manager' | 'project member' | 'work item assignee' | 'cost rate assignment' | 'time entry author' = 'project member'
): IntegrityResult {
  if (!user || user.tenantId !== tenantId) {
    return { ok: false, error: `Referenced ${context} not found in this workspace` };
  }
  return { ok: true };
}

/**
 * The full pre-write integrity gate for a project mutation (§80/§81/§114):
 * resolve the client, the optional manager and the members, then call this.
 * Returns EVERY violation (not just the first) so the caller can report a
 * complete picture; an empty array means the write may proceed.
 */
export function verifyProjectIntegrity(input: {
  tenantId: string;
  client: TenantScopedEntity | null | undefined;
  manager?: TenantScopedEntity | null | undefined;
  members?: (TenantScopedEntity | null | undefined)[];
}): string[] {
  const errors: string[] = [];

  const clientCheck = checkProjectClientIntegrity(input.client, input.tenantId);
  if (!clientCheck.ok) errors.push(clientCheck.error);

  if (input.manager !== undefined) {
    const managerCheck = checkProjectUserIntegrity(input.manager, input.tenantId, 'project manager');
    if (!managerCheck.ok) errors.push(managerCheck.error);
  }

  for (const member of input.members ?? []) {
    const memberCheck = checkProjectUserIntegrity(member, input.tenantId, 'project member');
    if (!memberCheck.ok) errors.push(memberCheck.error);
  }

  return errors;
}
