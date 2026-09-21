import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import {
  activateAgencyProject, pauseAgencyProject, completeAgencyProject,
  cancelAgencyProject, archiveAgencyProject,
  type ProjectDomainResult,
} from '@/lib/agency/domain/agency.projects';
import type { AuditContext } from '@/lib/agency/domain/agency.clients';
import type { Project } from '@/lib/agency/types/project';

export const dynamic = 'force-dynamic';

/**
 * POST /api/agency/projects/:id/:action (spec §41/§75/§82)
 *
 * The ONLY path for project status changes. Whitelisted actions:
 *
 *   activate — the §75 gate: commercial core required; MILESTONE projects
 *              need ≥1 non-cancelled milestone (hard reject); fixed-fee /
 *              T&M baselines are advisory warnings returned with the 200.
 *              COMPLETED → ACTIVE is the explicit reopen (§41).
 *   pause    — ACTIVE → ON_HOLD
 *   complete — ACTIVE/ON_HOLD → COMPLETED
 *   cancel   — DRAFT/ACTIVE/ON_HOLD → CANCELLED (terminal in Phase 1)
 *   archive  — COMPLETED → ARCHIVED
 *
 * Any other action name is a 404 — the URL space stays closed. Status can
 * never be smuggled through the PATCH payload (validators reject it).
 */
type RouteContext = { params: Promise<{ id: string; action: string }> };

const LIFECYCLE_ACTIONS: Readonly<Record<string, (id: string, tenantId: string, audit: AuditContext) => Promise<ProjectDomainResult<Project>>>> = {
  activate: activateAgencyProject,
  pause: pauseAgencyProject,
  complete: completeAgencyProject,
  cancel: cancelAgencyProject,
  archive: archiveAgencyProject,
};

export async function POST(req: NextRequest, ctx: RouteContext) {
  const gate = await requireAgencyPermission('agency.projects.manage');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const tenantId = gate.context.tenant.id || (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });
  const session = gate.context.session;
  const { id, action } = await ctx.params;

  const handler = LIFECYCLE_ACTIONS[action];
  if (!handler) {
    return NextResponse.json({ error: 'Unknown project action' }, { status: 404 });
  }

  try {
    const ipAddress = firstClientIp(req);
    const audit: AuditContext = {
      username: session.username,
      tenantId,
      log: (logAction, detail) => createLog(session.username, logAction, detail, tenantId, ipAddress),
    };
    const result = await handler(id, tenantId, audit);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    // §75 advisory warnings (e.g. activating a fixed-fee project with no
    // contract value) ride along with the success.
    return NextResponse.json(
      { success: true, project: result.data, ...(result.warnings?.length && { warnings: result.warnings }) }
    );
  } catch (error) {
    logError('agency:project lifecycle error', error, { tenantId, projectId: id, action });
    return NextResponse.json({ error: 'Failed to update project status' }, { status: 500 });
  }
}
