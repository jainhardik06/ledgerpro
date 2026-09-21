import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { logError } from '@/lib/logger';
import { listWebhookEvents } from '@/lib/agency/domain/gateway-webhook';
import { WEBHOOK_PROCESSING_STATUSES, type WebhookProcessingStatus } from '@/lib/agency/types/webhook-event';

export const dynamic = 'force-dynamic';

/**
 * GET /api/agency/webhook-events (Module 12 §43 — operational visibility)
 *
 * "Suppose Razorpay sends an event → processing fails. We need to know:
 * processed / failed / retried rather than simply losing the request."
 * This is that read surface: the recent webhook event rows for THIS tenant,
 * newest first — provider, event name, received/processed timestamps,
 * processingStatus and errorMessage. Rows carry no payload by construction
 * (§42: hash only), and events that never resolved to this tenant are
 * invisible (tenant-scoped filter).
 *
 * Query: ?status=<RECEIVED|PROCESSING|PROCESSED|FAILED|IGNORED> and
 * ?limit=<1..200, default 50>. Read surface: agency.dashboard.read.
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
    const statusParam = searchParams.get('status');
    let processingStatus: WebhookProcessingStatus | undefined;
    if (statusParam !== null) {
      if (!WEBHOOK_PROCESSING_STATUSES.includes(statusParam as WebhookProcessingStatus)) {
        return NextResponse.json(
          { error: `Unknown webhook status '${statusParam}' — expected one of ${WEBHOOK_PROCESSING_STATUSES.join(', ')}` },
          { status: 400 }
        );
      }
      processingStatus = statusParam as WebhookProcessingStatus;
    }
    const limitParam = searchParams.get('limit');
    const limit = limitParam !== null ? Number(limitParam) : 50;

    const events = await listWebhookEvents(tenantId, { processingStatus }, limit);
    return NextResponse.json({ success: true, webhookEvents: events });
  } catch (error) {
    logError('agency:list webhook events error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to load webhook events' }, { status: 500 });
  }
}
