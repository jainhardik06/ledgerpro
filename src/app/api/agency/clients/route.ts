import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import {
  listAgencyClients, createAgencyClient,
} from '@/lib/agency/domain/agency.clients';
import { CLIENT_STATUSES, type ClientStatus } from '@/lib/agency/types/client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/agency/clients?search=&status=&page=&limit=
 *
 * Module 2 client list (spec §19/§20/§29): tenant-scoped, searched by
 * name/email/legalName, paginated, ARCHIVED hidden by default (resolvable
 * via explicit status filter). Pipeline per §30: authenticate → tenant →
 * Agency capability → authorize → validate → operate → audit → respond.
 */
export async function GET(req: NextRequest) {
  const gate = await requireAgencyPermission('agency.dashboard.read');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const { tenant, session } = gate.context;
  const tenantId = tenant.id || (tenant._id ? tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });

  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search')?.trim() || undefined;
    const statusParam = searchParams.get('status') || undefined;
    const status = CLIENT_STATUSES.includes(statusParam as ClientStatus)
      ? (statusParam as ClientStatus)
      : undefined;
    const page = Math.max(1, Number(searchParams.get('page') || 1));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || 25)));

    const clients = await listAgencyClients(tenantId, { search, status, page, limit });

    // Module 3 (§93) — the list's Projects column goes live: per-client
    // project counts + planned value. A query failure leaves the counts
    // absent (the UI shows "—"), never a fabricated zero.
    let projectCounts: Record<string, { count: number; activeCount: number; plannedValue: number }> | undefined;
    try {
      const { getClientProjectSummaries } = await import('@/lib/agency/queries/project-metrics');
      const summaries = await getClientProjectSummaries(tenantId);
      projectCounts = Object.fromEntries(summaries);
    } catch {
      projectCounts = undefined;
    }

    return NextResponse.json({ success: true, clients, ...(projectCounts && { projectCounts }) });
  } catch (error) {
    logError('agency:fetch clients error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to fetch clients' }, { status: 500 });
  }
}

/**
 * POST /api/agency/clients
 *
 * Create an agency client (spec §23–§24). Duplicate names are a WARNING,
 * never a rejection (§18): a same-name match returns 409 DUPLICATE_WARNING
 * with the existing clients; the client re-submits with allowDuplicate.
 */
export async function POST(req: NextRequest) {
  const gate = await requireAgencyPermission('agency.clients.manage');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const { tenant, session } = gate.context;
  const tenantId = tenant.id || (tenant._id ? tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });

  try {
    const body = await req.json();
    const ipAddress = firstClientIp(req);
    const result = await createAgencyClient(
      tenantId,
      body,
      {
        username: session.username,
        tenantId: tenantId,
        log: (action, detail) => createLog(session.username, action, detail, tenantId, ipAddress),
      },
      { allowDuplicate: body?.allowDuplicate === true }
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
    return NextResponse.json({ success: true, client: result.data }, { status: 201 });
  } catch (error) {
    logError('agency:create client error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to create client' }, { status: 500 });
  }
}
