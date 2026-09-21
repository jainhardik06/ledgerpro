import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog, getClientById, getProjectById } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { getInvoice, updateInvoiceDraft } from '@/lib/agency/domain/agency.invoices';
import { getPublicAgencySettings } from '@/lib/agency/domain/agency.settings';

export const dynamic = 'force-dynamic';

/**
 * /api/agency/invoices/:id (Module 9 §85)
 *
 *   GET   — one invoice with its lines (dashboard.read). Drafts show their
 *           honest draft label — no fake number (§75).
 *   PATCH — the §63-only editable surface while DRAFT: notes / terms /
 *           dueDate (agency.invoices.write). Money, lines, status and the
 *           number are NEVER patchable — they belong to the engine and the
 *           lifecycle actions.
 */
type RouteContext = { params: Promise<{ id: string }> };

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
    const result = await getInvoice(id, tenantId);
    if (!result.ok || !result.data) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    const { invoice, lines } = result.data;
    // §20 — labels alongside the ids.
    const client = await getClientById(invoice.clientId, tenantId);
    const project = invoice.projectId ? await getProjectById(invoice.projectId, tenantId) : null;
    const settings = await getPublicAgencySettings(tenantId);
    const rawClient = client as unknown as Record<string, unknown> | null;
    const clientBilling = rawClient?.billingProfile as Record<string, unknown> | undefined;
    const clientTax = rawClient?.taxProfile as Record<string, unknown> | undefined;
    const clientAddress = (clientBilling?.address as string) || (rawClient?.address as string) || undefined;
    const clientGstin = (clientTax?.registrationNumber as string) || (rawClient?.gstin as string) || undefined;

    return NextResponse.json({
      success: true,
      invoice,
      lines,
      clientName: client?.name ?? null,
      projectName: project?.name ?? null,
      client: client ? {
        id: client.id,
        name: client.name,
        email: client.email || (clientBilling?.email as string) || undefined,
        phone: (rawClient?.phone as string) || undefined,
        address: clientAddress,
        legalName: (rawClient?.legalName as string) || undefined,
        state: (clientBilling?.state as string) || (clientTax?.state as string) || undefined,
        gstin: clientGstin,
      } : null,
      settings: settings ?? null,
    });
  } catch (error) {
    logError('agency:fetch invoice error', error, { tenantId, invoiceId: id });
    return NextResponse.json({ error: 'Failed to fetch invoice' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const gate = await requireAgencyPermission('agency.invoices.write');
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
    const result = await updateInvoiceDraft(id, tenantId, body, {
      username: session.username,
      tenantId,
      log: (action, detail) => createLog(session.username, action, detail, tenantId, ipAddress),
    });
    if (!result.ok || !result.data) {
      return NextResponse.json({ error: result.error, ...(result.code && { code: result.code }) }, { status: result.status });
    }
    return NextResponse.json({ success: true, invoice: result.data });
  } catch (error) {
    logError('agency:update invoice error', error, { tenantId, invoiceId: id });
    return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 });
  }
}
