import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { processRazorpayWebhook } from '@/lib/agency/domain/gateway-webhook';

export const dynamic = 'force-dynamic';

/**
 * POST /api/webhooks/razorpay (Module 10 §96–§99, §110/§113, §126)
 *
 * SECURITY-ISOLATED from session auth ON PURPOSE (§97/§98/§110/§126): there
 * is no requireSession / requireAgencyPermission gate here. Razorpay calls
 * this endpoint unauthenticated — the HMAC signature over the raw body IS
 * the authentication, verified FIRST inside processRazorpayWebhook before
 * anything else about the request is read. Adding a session gate here would
 * break the integration (no cookie exists on a webhook request) and add
 * nothing (a stolen session cannot forge a signature; a valid signature
 * proves possession of the shared webhook secret).
 *
 * The body is read as RAW TEXT and passed through verbatim — the signature
 * is computed over the exact bytes, never over a re-serialized parse (§97).
 *
 * Ack contract with Razorpay (at-least-once delivery, §99):
 *   2xx  — accepted; delivery stops. Replays return 200 with no writes.
 *   401  — signature invalid, or a tenant-stored secret verified a delivery
 *          whose target belongs to a DIFFERENT tenant (§51 binding — the
 *          secret is a key for its OWN tenant's entities only).
 *   5xx  — transient; Razorpay retries (the 10F recovery path).
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-razorpay-signature');
    const result = await processRazorpayWebhook(rawBody, signature, firstClientIp(req));

    if (result.status === 200) {
      return NextResponse.json({
        received: true,
        outcome: result.outcome,
        ...(result.paymentId !== undefined && { paymentId: result.paymentId }),
      });
    }
    return NextResponse.json(
      { received: false, outcome: result.outcome, ...(result.error !== undefined && { error: result.error }) },
      { status: result.status }
    );
  } catch (error) {
    // Never leak internals to an unauthenticated caller; log structured.
    logError('webhooks:razorpay processing error', error, {});
    return NextResponse.json({ received: false, error: 'Webhook processing failed' }, { status: 500 });
  }
}

/** Webhooks are write-only: a GET probe learns nothing beyond 405. */
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
