import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog, getClientById, getInvoiceById, getInvoices } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { recordManualPayment, listPayments, getPaymentMethodSummary } from '@/lib/agency/domain/agency.payments';
import { validatePaymentFilters } from '@/lib/agency/validators/payment';

export const dynamic = 'force-dynamic';

/**
 * /api/agency/payments (Module 10 §110/§116)
 *
 *   GET  — the payment list / §116 report surface. Readable by the whole
 *          agency workspace (agency.dashboard.read, §28 pattern — the
 *          collections picture is shared; writes stay admin-only).
 *          Filters: invoiceId, clientId, status, method, dateFrom, dateTo,
 *          projectId (§116 collections-by-project — resolved against the
 *          invoices of that project; payments carry no projectId of their
 *          own). Labels resolve alongside (§20 — invoice numbers and client
 *          names, never raw ids), and the response carries methodSummary —
 *          the §116 per-method report over the FULL (unfiltered) history.
 *   POST — record a MANUAL payment (§88–§92, agency.payments.write). The
 *          payment lands PENDING (§101 — nothing moves until confirm);
 *          partial amounts are normal (§90) and overpayment is rejected at
 *          confirmation (§91).
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
    for (const key of ['invoiceId', 'clientId', 'status', 'method', 'dateFrom', 'dateTo', 'projectId']) {
      const v = searchParams.get(key);
      if (v) params[key] = v;
    }
    const filters = validatePaymentFilters(params);
    let payments = await listPayments(tenantId, filters);

    // §116 collections-by-project — a payment settles an invoice, an invoice
    // belongs to a project: resolve the project's invoice ids and keep only
    // those payments. §113 — getInvoices is tenant-scoped, so another
    // tenant's project id simply yields an empty list.
    if (filters.projectId) {
      const projectInvoices = await getInvoices(tenantId, { projectId: filters.projectId });
      const invoiceIds = new Set(projectInvoices.map(inv => inv.id!));
      payments = payments.filter(p => invoiceIds.has(p.invoiceId));
    }

    // §20 — labels, never raw ids; §113 — cross-tenant refs get none.
    const invoiceLabels: Record<string, string> = {};
    for (const invoiceId of [...new Set(payments.map(p => p.invoiceId))]) {
      const invoice = await getInvoiceById(invoiceId, tenantId);
      if (invoice) invoiceLabels[invoiceId] = invoice.invoiceNumber ?? 'Draft Invoice';
    }
    const clientNames: Record<string, string> = {};
    for (const clientId of [...new Set(payments.map(p => p.clientId))]) {
      const client = await getClientById(clientId, tenantId);
      if (client) clientNames[clientId] = client.name;
    }
    // §116 — the method summary is a REPORT over the full history, unaffected
    // by the list filters above.
    const methodSummary = await getPaymentMethodSummary(tenantId);
    return NextResponse.json({ success: true, payments, invoiceLabels, clientNames, methodSummary });
  } catch (error) {
    logError('agency:fetch payments error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to fetch payments' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAgencyPermission('agency.payments.write');
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
    const result = await recordManualPayment(
      tenantId,
      { userId: session.userId, role: session.role, username: session.username },
      body,
      {
        username: session.username,
        tenantId,
        log: (action, detail) => createLog(session.username, action, detail, tenantId, ipAddress),
      }
    );
    if (!result.ok || !result.data) {
      return NextResponse.json({ error: result.error, ...(result.code && { code: result.code }) }, { status: result.status });
    }
    return NextResponse.json({ success: true, payment: result.data }, { status: 201 });
  } catch (error) {
    logError('agency:record payment error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 });
  }
}
