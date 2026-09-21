import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { getUserById, getProjectById, getClientById, type ExpenseFilters } from '@/lib/db';
import { logError } from '@/lib/logger';
import { getExpenseApprovalQueue } from '@/lib/agency/domain/agency.expenses';

export const dynamic = 'force-dynamic';

/**
 * GET /api/agency/expenses/approvals (Module 8 §53)
 *
 * The manager's queue: every SUBMITTED expense in the workspace, optionally
 * filtered by project or date window. Gated on agency.expenses.approve (§40
 * pattern). The queue shows the full economic picture (approvers are admins
 * or the project's manager — §99's cost privacy does not apply to them).
 */
export async function GET(req: NextRequest) {
  const gate = await requireAgencyPermission('agency.expenses.approve');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const tenantId = gate.context.tenant.id || (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });
  const session = gate.context.session;

  try {
    const { searchParams } = new URL(req.url);
    const filters: ExpenseFilters = {
      ...(searchParams.get('projectId') && { projectId: searchParams.get('projectId')! }),
      ...(searchParams.get('createdBy') && { createdBy: searchParams.get('createdBy')! }),
      ...(searchParams.get('dateFrom') && { dateFrom: searchParams.get('dateFrom')! }),
      ...(searchParams.get('dateTo') && { dateTo: searchParams.get('dateTo')! }),
    };
    const result = await getExpenseApprovalQueue(tenantId, { userId: session.userId, role: session.role }, filters);
    if (!result.ok || !result.data) {
      return NextResponse.json({ error: result.error ?? 'Failed to fetch approval queue' }, { status: result.status });
    }
    const expenses = result.data;

    // Labels for the queue columns (§20 spirit — names, never raw ids).
    const userLabels: Record<string, string> = {};
    for (const userId of [...new Set(expenses.map(e => e.createdBy))]) {
      const user = await getUserById(userId);
      if (user?.username) userLabels[userId] = user.username;
    }
    const projectNames: Record<string, string> = {};
    for (const projectId of [...new Set(expenses.map(e => e.projectId).filter((p): p is string => !!p))]) {
      const project = await getProjectById(projectId, tenantId);
      if (project) projectNames[projectId] = project.name;
    }
    const clientNames: Record<string, string> = {};
    for (const clientId of [...new Set(expenses.map(e => e.clientId).filter((c): c is string => !!c))]) {
      const client = await getClientById(clientId, tenantId);
      if (client) clientNames[clientId] = client.name;
    }

    return NextResponse.json({ success: true, expenses, userLabels, projectNames, clientNames });
  } catch (error) {
    logError('agency:fetch expense approval queue error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to fetch expense approval queue' }, { status: 500 });
  }
}
