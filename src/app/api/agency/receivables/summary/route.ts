import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { getClientById } from '@/lib/db';
import { logError } from '@/lib/logger';
import {
  getReceivablesMetrics, DUE_SOON_WINDOW_DAYS,
} from '@/lib/agency/queries/receivables-summary';
import { parseReceivablesQuery } from '@/lib/agency/validators/receivables';
import { trackNamedOperation } from '@/lib/agency/analytics/observability';
import { todayInTimezone } from '@/lib/agency/types/dates';
import { agencyTimezone } from '@/lib/agency/domain/agency.settings';

export const dynamic = 'force-dynamic';

/**
 * GET /api/agency/receivables/summary (Module 14 §87/§98)
 *
 * The §87 dashboard position on its own: Outstanding / Due Soon / Overdue
 * (+ overdue count), the aging ladder, and the by-client/by-project
 * breakdowns — everything EXCEPT the §96 list rows, for consumers that want
 * the position without the row payload. Same engine, same §98 filters, same
 * §127 mixed-currency honesty as the main report — never a second math.
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
    // §116 — receivables_query_duration: same engine pass, timed (the §87
    // position view shares the main report's telemetry, never a second math).
    const metrics = await trackNamedOperation(
      'agency_receivables_query_duration', tenantId, { query: 'getReceivablesMetrics:summary' },
      () => getReceivablesMetrics(tenantId, today, dueSoonDays, filters)
    );

    const clientNames: Record<string, string> = {};
    for (const row of metrics.byClient) {
      const client = await getClientById(row.clientId, tenantId);
      if (client) clientNames[row.clientId] = client.name;
    }

    return NextResponse.json({
      success: true,
      summary: {
        asOf: today,
        dueSoonDays,
        outstanding: metrics.outstanding,
        dueSoon: metrics.dueSoon,
        overdueAmount: metrics.overdueAmount,
        overdueCount: metrics.overdueCount,
        openInvoiceCount: metrics.openInvoiceCount,
        currency: metrics.currency,
        mixedCurrencies: metrics.mixedCurrencies,
        byAgingBucket: metrics.byAgingBucket,
        byClient: metrics.byClient.map(row => ({
          ...row,
          clientName: clientNames[row.clientId] ?? null,
        })),
      },
    });
  } catch (error) {
    logError('agency:receivables summary error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to load receivables summary' }, { status: 500 });
  }
}
