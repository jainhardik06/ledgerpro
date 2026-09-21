import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { getClientById, getUserById, createLog, PROJECT_SORT_FIELDS, type ProjectSort, type ProjectSortField } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import {
  listAgencyProjects, createAgencyProject,
} from '@/lib/agency/domain/agency.projects';
import { PROJECT_STATUSES, type ProjectStatus } from '@/lib/agency/types/project';
import { BILLING_MODELS, type BillingModel } from '@/lib/agency/types/client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/agency/projects?search=&status=&billingModel=&clientId=&page=&limit=
 *
 * Module 3 project list (spec §69/§82): tenant-scoped, searched by name, code
 * or client name, filterable by status/billing model/client/PM, paginated,
 * ARCHIVED hidden from default operational views (§40). Reads ride on
 * agency.dashboard.read (the §28 read/write split).
 */
export async function GET(req: NextRequest) {
  const gate = await requireAgencyPermission('agency.dashboard.read');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const { tenant } = gate.context;
  const tenantId = tenant.id || (tenant._id ? tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });

  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search')?.trim() || undefined;
    const statusParam = searchParams.get('status') || undefined;
    const status = PROJECT_STATUSES.includes(statusParam as ProjectStatus)
      ? (statusParam as ProjectStatus)
      : undefined;
    const modelParam = searchParams.get('billingModel') || undefined;
    const billingModel = BILLING_MODELS.includes(modelParam as BillingModel)
      ? (modelParam as BillingModel)
      : undefined;
    const clientId = searchParams.get('clientId')?.trim() || undefined;
    const projectManagerId = searchParams.get('projectManagerId')?.trim() || undefined;
    const page = Math.max(1, Number(searchParams.get('page') || 1));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || 25)));

    // §69 — sort whitelist: createdAt (default), startDate, endDate,
    // contractValue, status. Unknown fields silently fall back to the default
    // rather than 400ing — a stale link should still show a list.
    const sortParam = searchParams.get('sort') as ProjectSortField | null;
    const sort: ProjectSort | undefined =
      sortParam && (PROJECT_SORT_FIELDS as readonly string[]).includes(sortParam)
        ? { field: sortParam, direction: searchParams.get('sortDir') === 'asc' ? 1 : searchParams.get('sortDir') === 'desc' ? -1 : sortParam === 'createdAt' ? -1 : 1 }
        : undefined;

    const projects = await listAgencyProjects(
      tenantId,
      { search, page, limit, sort },
      {
        ...(status && { status }),
        ...(billingModel && { billingModel }),
        ...(clientId && { clientId }),
        ...(projectManagerId && { projectManagerId }),
      }
    );

    // §69 list columns need Client and Owner NAMES, never raw ids. Resolve
    // only the ids on this page; §113 — a cross-tenant client/user simply
    // doesn't get a label (it can't legitimately be on a project anyway).
    const clientLabels: Record<string, string> = {};
    for (const id of [...new Set(projects.map(p => p.clientId))]) {
      const client = await getClientById(id, tenantId);
      if (client) clientLabels[id] = client.name;
    }
    const managerLabels: Record<string, string> = {};
    for (const id of [...new Set(projects.map(p => p.projectManagerId).filter((x): x is string => !!x))]) {
      const user = await getUserById(id);
      // Safe fields only — never the full user doc.
      if (user && user.username) managerLabels[id] = user.username;
    }

    return NextResponse.json({ success: true, projects, clientLabels, managerLabels });
  } catch (error) {
    logError('agency:fetch projects error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
}

/**
 * POST /api/agency/projects
 *
 * Create a project (spec §71 wizard → §37 model). Created as DRAFT (§74) —
 * activation is the dedicated later action with its own gate (§75). The
 * wizard's Team step may ride `members` along; each is integrity-checked.
 * Advisory warnings (§73/§75) return with the 201 so the UI can surface them.
 */
export async function POST(req: NextRequest) {
  const gate = await requireAgencyPermission('agency.projects.manage');
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
    const result = await createAgencyProject(
      tenantId,
      body,
      {
        username: session.username,
        tenantId: tenantId,
        log: (action, detail) => createLog(session.username, action, detail, tenantId, ipAddress),
      }
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(
      { success: true, project: result.data, ...(result.warnings?.length && { warnings: result.warnings }) },
      { status: 201 }
    );
  } catch (error) {
    logError('agency:create project error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
  }
}
