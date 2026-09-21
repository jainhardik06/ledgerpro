import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog, getClientById, getProjectById } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { createInvoiceDraft, listInvoices } from '@/lib/agency/domain/agency.invoices';
import { validateInvoiceFilters } from '@/lib/agency/validators/invoice';

export const dynamic = 'force-dynamic';

/**
 * /api/agency/invoices (Module 9 §85)
 *
 *   GET  — the invoice list. Readable by the whole agency workspace
 *          (agency.dashboard.read, §28 pattern — the receivables picture is
 *          shared; writes stay admin-only). Filters: clientId, projectId,
 *          status, dateFrom, dateTo. Labels resolve alongside (§20 — names,
 *          never raw ids).
 *   POST — create a DRAFT (§67/§82, agency.invoices.write). Currency and
 *          dueDate default from the client's billing profile (§68); no
 *          number exists until finalization (§74).
 */
export async function GET(req: NextRequest) {
  const gate = await requireAgencyPermission('agency.dashboard.read');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const tenantId = gate.context.tenant.id || (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });

  try {
    const { searchParams } = new URL(req.url);
    const params: Record<string, string | undefined> = {};
    for (const key of ['clientId', 'projectId', 'status', 'dateFrom', 'dateTo']) {
      const v = searchParams.get(key);
      if (v) params[key] = v;
    }
    const invoices = await listInvoices(tenantId, validateInvoiceFilters(params));

    // §20 — labels, never raw ids; §113 — cross-tenant refs get none.
    const clientNames: Record<string, string> = {};
    for (const clientId of [...new Set(invoices.map(i => i.clientId))]) {
      const client = await getClientById(clientId, tenantId);
      if (client) clientNames[clientId] = client.name;
    }
    const projectNames: Record<string, string> = {};
    for (const projectId of [...new Set(invoices.map(i => i.projectId).filter((p): p is string => !!p))]) {
      const project = await getProjectById(projectId, tenantId);
      if (project) projectNames[projectId] = project.name;
    }
    return NextResponse.json({ success: true, invoices, clientNames, projectNames });
  } catch (error) {
    logError('agency:fetch invoices error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAgencyPermission('agency.invoices.write');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const tenantId = gate.context.tenant.id || (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });
  const session = gate.context.session;

  try {
    const body = await req.json();
    const ipAddress = firstClientIp(req);
    const result = await createInvoiceDraft(tenantId, { userId: session.userId, role: session.role }, body, {
      username: session.username,
      tenantId,
      log: (action, detail) => createLog(session.username, action, detail, tenantId, ipAddress),
    });
    if (!result.ok || !result.data) {
      return NextResponse.json({ error: result.error, ...(result.code && { code: result.code }) }, { status: result.status });
    }
    return NextResponse.json({ success: true, invoice: result.data }, { status: 201 });
  } catch (error) {
    logError('agency:create invoice error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to create invoice' }, { status: 500 });
  }
}
