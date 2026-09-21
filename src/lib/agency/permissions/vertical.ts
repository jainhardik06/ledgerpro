/**
 * Agency Vertical — Permissions: capability gating (Step 0.5)
 *
 * Server-side counterpart to types/vertical.ts. Every /api/agency/* route
 * resolves capabilities here instead of comparing appMode directly.
 *
 * Pipeline per PRD §68: authenticate → resolve tenant → validate capability →
 * validate body → execute → audit → respond.
 */
import { getSessionUser, type TokenPayload } from '@/lib/auth';
import { getTenantById, type Tenant } from '@/lib/db';
import { resolveVertical, verticalHasCapability, type AgencyCapability, type Vertical } from '../types/vertical';

export interface VerticalContext {
  session: TokenPayload;
  tenant: Tenant;
  vertical: Vertical;
}

/**
 * Resolve the session + tenant + vertical for an agency request.
 * Returns a discriminated result — routes respond without throwing.
 *
 * Module 1.18 rejection semantics:
 *   401 → not authenticated (no session / no tenantId in verified JWT)
 *   403 + code WORKSPACE_NOT_FOUND → tenant record missing
 *   403 + code WORKSPACE_SUSPENDED → tenant not ACTIVE
 *   403 + code NOT_AGENCY_TENANT    → valid session, valid tenant, wrong
 *        vertical — an APPLICATION response: the body carries `code` +
 *        `redirectTo` so clients route to their own surface gracefully
 *        instead of treating it as an auth failure.
 */
export type ResolveVerticalResult =
  | { ok: true; context: VerticalContext }
  | { ok: false; status: 401 | 403; error: string; code?: string; redirectTo?: string };

export async function resolveVerticalContext(): Promise<ResolveVerticalResult> {
  const session = await getSessionUser();
  if (!session?.tenantId) {
    return { ok: false, status: 401, error: 'Authentication required' };
  }

  // tenantId comes from the verified JWT — never from the request payload.
  const tenant = await getTenantById(session.tenantId);
  if (!tenant) {
    return { ok: false, status: 403, error: 'Workspace not found', code: 'WORKSPACE_NOT_FOUND' };
  }
  if (tenant.status !== 'ACTIVE') {
    return { ok: false, status: 403, error: 'Workspace is suspended', code: 'WORKSPACE_SUSPENDED' };
  }

  const vertical = resolveVertical(tenant.appMode);
  if (vertical !== 'Agency') {
    return {
      ok: false,
      status: 403,
      error: 'This feature requires the Agency workspace mode',
      code: 'NOT_AGENCY_TENANT',
      redirectTo: '/dashboard',
    };
  }

  return { ok: true, context: { session, tenant, vertical } };
}

/**
 * Full gate for agency API routes: session + tenant + capability.
 * Routes use this once at the top of each handler.
 */
export type ResolveCapabilityResult =
  | { ok: true; context: VerticalContext }
  | { ok: false; status: 401 | 403; error: string };

export async function requireAgencyCapability(
  capability: AgencyCapability
): Promise<ResolveCapabilityResult> {
  const resolved = await resolveVerticalContext();
  if (!resolved.ok) return resolved;

  if (!verticalHasCapability(resolved.context.vertical, capability)) {
    return { ok: false, status: 403, error: 'Capability not enabled for this workspace' };
  }

  return resolved;
}

/**
 * Guard for handlers that only need tenant/vertical context (reads gated on
 * the Agency vertical itself, e.g. the dashboard aggregate in Module 1).
 */
export async function requireAgencyVertical(): Promise<ResolveVerticalResult> {
  return resolveVerticalContext();
}
