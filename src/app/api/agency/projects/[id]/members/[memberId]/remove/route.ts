import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { removeProjectMember } from '@/lib/agency/domain/agency.project-members';

export const dynamic = 'force-dynamic';

/**
 * /api/agency/projects/:id/members/:memberId/remove (Module 5 §47/§45)
 *
 *   POST — "Remove from Project" as a dedicated action: the membership flips
 *          to active=false and STAYS as history (§37) for audit and future
 *          time-record questions. Nothing is deleted.
 */
type RouteContext = { params: Promise<{ id: string; memberId: string }> };

export async function POST(req: NextRequest, ctx: RouteContext) {
  const gate = await requireAgencyPermission('agency.projects.manage');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const tenantId = gate.context.tenant.id || (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });
  const session = gate.context.session;
  const { id, memberId } = await ctx.params;

  try {
    const ipAddress = firstClientIp(req);
    const result = await removeProjectMember(memberId, id, tenantId, {
      username: session.username,
      tenantId,
      log: (action: string, detail: string) => createLog(session.username, action, detail, tenantId, ipAddress),
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    logError('agency:remove project member error', error, { tenantId, projectId: id, memberId });
    return NextResponse.json({ error: 'Failed to remove project member' }, { status: 500 });
  }
}
