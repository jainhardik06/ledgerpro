import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { archiveWorkItem } from '@/lib/agency/domain/agency.work-items';

export const dynamic = 'force-dynamic';

/**
 * POST /api/agency/projects/:id/work-items/:itemId/archive (Module 4 §11/§16)
 *
 * Archive a work item — soft removal from the operational list. ARCHIVED is
 * terminal, and it can never be reached through a PATCH payload (the §41
 * project-lifecycle pattern applied to line items). No physical DELETE
 * exists: future time entries must stay able to resolve their work item.
 */
type RouteContext = { params: Promise<{ id: string; itemId: string }> };

export async function POST(req: NextRequest, ctx: RouteContext) {
  const gate = await requireAgencyPermission('agency.projects.manage');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const tenantId = gate.context.tenant.id || (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });
  const session = gate.context.session;
  const { id, itemId } = await ctx.params;

  try {
    const ipAddress = firstClientIp(req);
    const result = await archiveWorkItem(itemId, id, tenantId, {
      username: session.username,
      tenantId,
      log: (action, detail) => createLog(session.username, action, detail, tenantId, ipAddress),
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true, workItem: result.data });
  } catch (error) {
    logError('agency:archive work item error', error, { tenantId, projectId: id, itemId });
    return NextResponse.json({ error: 'Failed to archive work item' }, { status: 500 });
  }
}
