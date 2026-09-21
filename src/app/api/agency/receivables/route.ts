import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { getClientById, getProjectById } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { createLog } from '@/lib/db';
import {
  getReceivablesMetrics, sortReceivableRows, DUE_SOON_WINDOW_DAYS,
} from '@/lib/agency/queries/receivables-summary';
import { parseReceivablesQuery } from '@/lib/agency/validators/receivables';
import { trackNamedOperation } from '@/lib/agency/analytics/observability';
import { todayInTimezone } from '@/lib/agency/types/dates';
import { agencyTimezone } from '@/lib/agency/domain/agency.settings';

export const dynamic = 'force-dynamic';

/**
 * GET /api/agency/receivables (Module 10 §105/§106/§110; Module 14 §96–§98)
 *
 * The A/R operating view — the answer to "who owes us money, how much, and
 * for how long?": the summary position (§87), the aging ladder over the
 * REMAINING balance (§88/§89/§92), the per-client (§94) and per-project (§95)
 * breakdowns, and the A/R LIST rows (§96) sorted most-overdue-first (§97)
 * with their §101 collection-risk bands. "Today" resolves in the TENANT's
 * configured timezone (Module 1.16) — aging is date math, and a wrong clock
 * is a wrong bucket.
 *
 * §98 filters (clientId/projectId/status/agingBucket/from/to/currency +
 * §90 dueSoonDays) narrow the SAME engine pass — summary, buckets,
 * breakdowns and rows all read one filtered fact set. Invalid values are a
 * 400, never a silently-empty report.
 *
 * Mixed-currency honesty (§127): when the (filtered) open invoices carry
 * more than one currency, the AMOUNTS are null and mixedCurrencies is true —
 * never a converted or zero total. Counts stay real (currency-free).
 */
export async function GET(req: NextRequest) {
  const gate = await requireAgencyPermission('agency.dashboard.read');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const tenantId = gate.context.tenant.id || (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });
  const session = gate.context.session;

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
    // §116 — receivables_query_duration: the one-engine A/R pass is timed on
    // success and failure alike (fire-and-forget telemetry).
    const metrics = await trackNamedOperation(
      'agency_receivables_query_duration', tenantId, { query: 'getReceivablesMetrics' },
      () => getReceivablesMetrics(tenantId, today, dueSoonDays, filters)
    );

    // §20 — labels, never raw ids. A missing client/project (archived
    // mid-flight, data drift) shows its id, never a fabricated name (§113).
    const clientNames: Record<string, string> = {};
    for (const row of metrics.byClient) {
      const client = await getClientById(row.clientId, tenantId);
      if (client) clientNames[row.clientId] = client.name;
    }
    const projectNames: Record<string, string> = {};
    for (const row of metrics.byProject) {
      if (!row.projectId) continue;
      const project = await getProjectById(row.projectId, tenantId);
      if (project) projectNames[row.projectId] = project.name;
    }

    // §97 — the client-name tiebreak needs the resolved names; the engine
    // already ordered by age/amount/date, and the sort is stable.
    const invoices = sortReceivableRows(metrics.invoices, clientNames).map(row => ({
      ...row,
      clientName: clientNames[row.clientId] ?? null,
      projectName: row.projectId === null ? null : projectNames[row.projectId] ?? null,
    }));

    await createLog(
      session.username, 'AGENCY_RECEIVABLES_READ',
      `Receivables report generated as of ${today}: outstanding ${metrics.outstanding ?? '(mixed)'} ${metrics.currency ?? ''}, overdue ${metrics.overdueCount} invoice(s)`,
      tenantId, firstClientIp(req)
    ).catch(() => undefined);

    return NextResponse.json({
      success: true,
      receivables: {
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
        byProject: metrics.byProject.map(row => ({
          ...row,
          projectName: row.projectId === null ? null : projectNames[row.projectId] ?? null,
        })),
        invoices,
      },
    });
  } catch (error) {
    logError('agency:receivables report error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to load receivables' }, { status: 500 });
  }
}
