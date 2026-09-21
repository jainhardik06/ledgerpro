import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog, getTransactions } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { getAgencyClient, updateAgencyClient } from '@/lib/agency/domain/agency.clients';

export const dynamic = 'force-dynamic';

/**
 * /api/agency/clients/:id (spec §29/§30)
 *
 *   GET    — client detail (§21 header data) + recent transactions referencing it
 *   PATCH  — partial update, any field; duplicate-name rename warns (§18)
 *
 * Lifecycle endpoints (spec §29) live at the dedicated subroutes:
 *   POST /api/agency/clients/:id/archive and /restore
 *
 * Cross-tenant ids resolve to 404 "Client not found" — never a leak (§113).
 */
type RouteContext = { params: Promise<{ id: string }> };

function auditHook(tenantId: string, username: string, ipAddress: string) {
  return {
    username, tenantId,
    log: (action: string, detail: string) =>
      createLog(username, action, detail, tenantId, ipAddress),
  };
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  const gate = await requireAgencyPermission('agency.dashboard.read');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const tenantId = gate.context.tenant.id || (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });
  const { id } = await ctx.params;

  try {
    const result = await getAgencyClient(id, tenantId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    const client = result.data!;

    // Client activity timeline (§26): recent audit log entries naming this
    // client. Filtered from the tenant's logs by the client id reference.
    const { getRecentLogsForTenant } = await import('@/lib/agency/domain/agency.clients');
    const activity = await getRecentLogsForTenant(tenantId, id);

    // Transactions referencing this client (existing core data — real, not
    // a future module). Limited; the client page paginates properly later.
    const transactions = await getTransactions(tenantId, { page: 1, limit: 10, clientId: id });

    // Module 3 (§94) — the client's projects: list + summary. Planned value
    // only (contractValue ?? revenueBudget); actuals arrive with Time.
    const { getProjects } = await import('@/lib/db');
    const projects = await getProjects(tenantId, { page: 1, limit: 100 }, { clientId: id });
    const projectSummary = {
      count: projects.length,
      activeCount: projects.filter(p => p.status === 'ACTIVE').length,
      plannedValue: projects.reduce((sum, p) => sum + (p.contractValue ?? p.revenueBudget ?? 0), 0),
    };

    return NextResponse.json({ success: true, client, activity, transactions, projects, projectSummary });
  } catch (error) {
    logError('agency:fetch client error', error, { tenantId, clientId: id });
    return NextResponse.json({ error: 'Failed to fetch client' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const gate = await requireAgencyPermission('agency.clients.manage');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const tenantId = gate.context.tenant.id || (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });
  const session = gate.context.session;
  const { id } = await ctx.params;

  try {
    const body = await req.json();
    const ipAddress = firstClientIp(req);
    const result = await updateAgencyClient(
      id, tenantId, body,
      auditHook(tenantId, session.username, ipAddress)
    );

    if (result.code === 'DUPLICATE_WARNING') {
      const existing = (result.data as { existing?: unknown[] } | undefined)?.existing;
      return NextResponse.json(
        { error: result.error, code: result.code, existing },
        { status: 409 }
      );
    }
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true, client: result.data });
  } catch (error) {
    logError('agency:update client error', error, { tenantId, clientId: id });
    return NextResponse.json({ error: 'Failed to update client' }, { status: 500 });
  }
}
