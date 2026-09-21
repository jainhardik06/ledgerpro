import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog, getTenantById, getClientById } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { setInvoiceTaxation, getInvoiceTaxation } from '@/lib/agency/domain/agency.invoices';
import { suggestGstStructure } from '@/lib/agency/domain/tax-rules';
import { getWithholdingSuggestions } from '@/lib/agency/domain/agency.tax';
import { trackNamedOperation } from '@/lib/agency/analytics/observability';
import type { WithholdingSuggestion } from '@/lib/agency/domain/tax-rules';

export const dynamic = 'force-dynamic';

/**
 * /api/agency/invoices/:id/taxation (Module 9 §68 steps 3–4 / §76; Module 11
 * §11/§15–§17, spec §29 "GET/POST /api/agency/invoices/:id/taxes")
 *
 *   GET  — the invoice's tax & compliance view (dashboard.read): tax lines,
 *          totals, place of supply, reverse charge, exemption. With
 *          ?rate=<gst rate> the response also carries the rules layer's
 *          ADVISORY GST structure suggestion (§15 — CGST+SGST vs IGST from
 *          the stored states; the caller confirms, nothing is written). When
 *          the tenant has effective withholding rules for the recipient's
 *          jurisdiction (§19), the response carries the equally ADVISORY
 *          withholding suggestions against the taxable value (§22) — the
 *          §28 consumption of the withholding rules engine; the payment
 *          flow records what it decides (§20).
 *   PUT  — set the DRAFT's discount, tax lines and compliance configuration
 *          (agency.invoices.write). Tax amounts are NEVER sent or trusted
 *          from the client — only {type?, name, code?, rate}; the engine
 *          computes every amount (§78). An exemption (§17) clears the tax
 *          lines: tax ₹0 without pretending the calculation failed.
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
    const result = await getInvoiceTaxation(id, tenantId);
    if (!result.ok || !result.data) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    // §15/§28 — the rules layer's ADVISORY suggestions, built from STORED
    // configuration (supplier/recipient/place-of-supply states, withholding
    // rule rows); the caller confirms — this never writes.
    const sp = new URL(req.url).searchParams;
    const rateParam = sp.get('rate');
    let suggestion: ReturnType<typeof suggestGstStructure> | undefined;
    let withholdingSuggestions: WithholdingSuggestion[] | undefined;
    const invoice = result.data.invoice;
    if (invoice) {
      const [tenant, client] = await Promise.all([
        getTenantById(tenantId),
        getClientById(invoice.clientId, tenantId),
      ]);
      if (rateParam !== null) {
        const rate = Number(rateParam);
        if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
          return NextResponse.json({ error: 'rate must be a number between 0 and 100' }, { status: 400 });
        }
        try {
          suggestion = suggestGstStructure({
            supplierState: tenant?.billingProfile?.state,
            recipientState: client?.taxProfile?.state,
            placeOfSupplyState: invoice.placeOfSupply?.stateOrRegion,
            rate,
          });
        } catch {
          // No state configuration — the suggestion is simply absent.
        }
      }
      // §19/§22/§28 — withholding candidates for the recipient's stored
      // jurisdiction (client tax profile → invoice place of supply), tested
      // against the taxable value on the issue date. No stored jurisdiction
      // or no effective rules ⇒ no suggestion — never an assumed default.
      const jurisdiction = client?.taxProfile?.country ?? invoice.placeOfSupply?.country;
      if (jurisdiction) {
        const suggestions = await getWithholdingSuggestions({
          tenantId,
          onDate: invoice.issueDate,
          jurisdiction,
          baseValue: result.data.taxation.taxableAmount.amount,
          currency: invoice.currency,
        });
        if (suggestions.length > 0) withholdingSuggestions = suggestions;
      }
    }

    return NextResponse.json({
      success: true,
      taxation: result.data.taxation,
      ...(suggestion !== undefined && { gstSuggestion: suggestion }),
      ...(withholdingSuggestions !== undefined && { withholdingSuggestions }),
    });
  } catch (error) {
    logError('agency:fetch invoice taxation error', error, { tenantId, invoiceId: id });
    return NextResponse.json({ error: 'Failed to fetch taxation' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
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
    const body = await req.json().catch(() => ({}));
    const ipAddress = firstClientIp(req);
    // §116 — tax_calculation_duration: the engine's compute (every amount
    // server-side, §78) is timed on success and failure alike. Fire-and-forget
    // telemetry; a DomainResult failure is a normal response, not a throw.
    const result = await trackNamedOperation(
      'agency_tax_calculation_duration', tenantId, { query: 'setInvoiceTaxation' },
      () => setInvoiceTaxation(id, tenantId, {
        discountAmount: typeof body.discountAmount === 'number' ? body.discountAmount : undefined,
        taxes: body.taxes,
        placeOfSupply: body.placeOfSupply,
        reverseCharge: body.reverseCharge,
        exemption: body.exemption,
      }, {
        username: session.username,
        tenantId,
        log: (action, detail) => createLog(session.username, action, detail, tenantId, ipAddress),
      })
    );
    if (!result.ok || !result.data) {
      return NextResponse.json({ error: result.error, ...(result.code && { code: result.code }) }, { status: result.status });
    }
    return NextResponse.json({ success: true, invoice: result.data });
  } catch (error) {
    logError('agency:set invoice taxation error', error, { tenantId, invoiceId: id });
    return NextResponse.json({ error: 'Failed to set taxation' }, { status: 500 });
  }
}
