import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { logError } from '@/lib/logger';
import { getReceivablesMetrics, DUE_SOON_WINDOW_DAYS } from '@/lib/agency/queries/receivables-summary';
import { parseReceivablesQuery } from '@/lib/agency/validators/receivables';
import { trackNamedOperation } from '@/lib/agency/analytics/observability';
import { todayInTimezone } from '@/lib/agency/types/dates';
import { agencyTimezone } from '@/lib/agency/domain/agency.settings';

export const dynamic = 'force-dynamic';

/**
 * GET /api/agency/receivables/aging (Module 10 §106/§110; Module 14 §88/§98)
 *
 * The aging ladder on its own (§110 lists it as a dedicated endpoint): the
 * CURRENT / 1-30 / 31-60 / 61-90 / 90+ buckets over the REMAINING balance of
 * open invoices, bucketed by days past due. Same computation and same
 * mixed-currency honesty (§127) as the main receivables report — this is the
 * focused view for collection follow-up, not a second engine. Module 14: the
 * §98 filters apply here too (e.g. agingBucket=CURRENT over a client).
 */
export async function GET(req: NextRequest) {
  const gate = await requireAgencyPermission('agency.dashboard.read');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const tenantId = gate.context.tenant.id || (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const parsed = parseReceivablesQuery(searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { filters, dueSoonDays = DUE_SOON_WINDOW_DAYS } = parsed.value;

  // Module 17 §44 — the tenant's configured timezone (stored ⊕ defaults).
  const timezone = agencyTimezone(gate.context.tenant);
  const today = todayInTimezone(timezone);

  try {
    // §116 — receivables_query_duration: same engine pass, timed (§98 note:
    // the focused aging view shares the main report's telemetry, never a
    // second math).
    const metrics = await trackNamedOperation(
      'agency_receivables_query_duration', tenantId, { query: 'getReceivablesMetrics:aging' },
      () => getReceivablesMetrics(tenantId, today, dueSoonDays, filters)
    );
    return NextResponse.json({
      success: true,
      aging: {
        asOf: today,
        byAgingBucket: metrics.byAgingBucket,
        overdueCount: metrics.overdueCount,
        openInvoiceCount: metrics.openInvoiceCount,
        currency: metrics.currency,
        mixedCurrencies: metrics.mixedCurrencies,
      },
    });
  } catch (error) {
    logError('agency:receivables aging error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to load receivables aging' }, { status: 500 });
  }
}
