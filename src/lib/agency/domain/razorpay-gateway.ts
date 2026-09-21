/**
 * Agency Vertical — Domain: Razorpay adapter (Module 10, spec §111/§112)
 *
 * The ONE PaymentGateway implementation in Phase 1. Server-only (node
 * crypto + outbound fetch) — imported by the webhook service and route,
 * never by React code.
 *
 * Adapter discipline (§112): this file knows Razorpay and NOTHING else. It
 * never writes a Payment, never mutates an invoice, never touches an
 * account, never audits. It translates Razorpay shapes ⇄ gateway-port
 * shapes and verifies signatures. Domain decisions live in
 * gateway-webhook.ts / agency.payments.ts.
 *
 * Secrets (gitignored .env, §98/§126):
 *   RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET — the API pair (payment links,
 *   payment fetch). Absent ⇒ createPaymentLink/getPayment fail CLOSED with
 *   a 503; the webhook signature path does not need them.
 *   RAZORPAY_WEBHOOK_SECRET — the webhook signing secret. Absent ⇒ EVERY
 *   webhook is rejected (§97 fail closed — an unverified webhook is
 *   indistinguishable from an attacker).
 */
import { createHmac, timingSafeEqual } from 'crypto';
import type { DomainResult } from './agency.clients';
import { makeMoney, type Money } from '../types/money';
import { trackNamedOperation } from '../analytics/observability';
import type {
  PaymentGateway, GatewayLinkRequest, GatewayLinkResult,
  GatewayWebhookEvent, GatewayEventType, GatewayPaymentSnapshot,
  GatewayCredentials,
} from './payment-gateway';

const GATEWAY = 'RAZORPAY' as const;
const API_BASE = 'https://api.razorpay.com/v1';

// ---------- secrets (read at CALL time so tests can set/unset them) ----------
//
// Module 17 §15: every read is tenant-credentials-first, env-fallback. The
// per-tenant credentials arrive already DECRYPTED from the settings domain
// (security/credentials.ts); the adapter never touches the database.

function apiKeys(tenant?: { keyId: string; keySecret: string }): { keyId: string; keySecret: string } | null {
  if (tenant && tenant.keyId && tenant.keySecret) return tenant;
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret };
}

function webhookSecret(tenantSecret?: string): string | null {
  if (tenantSecret) return tenantSecret;
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
  return secret ? secret : null;
}

// ---------- §116: outbound-edge timing ----------

/**
 * agency_razorpay_api_duration — every outbound Razorpay network edge
 * (create link / fetch payment / cancel link) is timed on success AND
 * failure. The adapter is tenant-agnostic BY DESIGN (§112 — it knows
 * Razorpay and nothing else), so the context carries the edge + provider
 * and 'unknown' as the tenant label; the caller-side operations
 * (finalize, reconciliation) carry the real tenant. Fire-and-forget:
 * telemetry never changes the fail-closed contract above.
 */
function timedFetch(edge: string, input: string, init?: RequestInit): Promise<Response> {
  return trackNamedOperation(
    'agency_razorpay_api_duration', 'unknown', { edge, provider: 'RAZORPAY' },
    () => fetch(input, init)
  );
}

// ---------- §97/§98 signature verification ----------

/**
 * Timing-safe hex comparison. Length is public (hex of a SHA-256 digest is
 * always 64), so an early length bail leaks nothing; the dummy compare on
 * the unequal-length path keeps the timing profile flat anyway.
 */
function hexEqual(expected: string, provided: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  if (a.length !== b.length) {
    timingSafeEqual(a, a); // burn the same operation — no early-exact oracle
    return false;
  }
  return timingSafeEqual(a, b);
}

function verifyRazorpaySignature(rawBody: string, signature: string | null, tenantSecret?: string): boolean {
  const secret = webhookSecret(tenantSecret);
  // §97 — fail CLOSED: no secret configured ⇒ no webhook is ever trusted.
  if (!secret || !signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  return hexEqual(expected, signature.trim().toLowerCase());
}

// ---------- §113 webhook parsing (post-verification) ----------

/**
 * Razorpay webhook envelope (Module 12 §40 — the payment-link lifecycle
 * events carry the LINK entity, and only paid/partially_paid also carry a
 * payment entity):
 *   { event: 'payment.captured',       payload: { payment: { entity: { id: 'pay_…', … } } } }
 *   { event: 'payment.failed',         payload: { payment: { entity: { id: 'pay_…', … } } } }
 *   { event: 'payment_link.paid',      payload: { payment_link: { entity: { id: 'plink_…', … } }, payment: { entity: { id: 'pay_…', … } } } }
 *   { event: 'payment_link.partially_paid', payload: { payment_link: { entity: { id: 'plink_…' } }, payment: { entity: { id: 'pay_…' } } } }
 *   { event: 'payment_link.cancelled', payload: { payment_link: { entity: { id: 'plink_…', … } } } }   // NO payment entity
 *   { event: 'payment_link.expired',   payload: { payment_link: { entity: { id: 'plink_…', … } } } }   // NO payment entity
 *
 * ONLY the event name and the entity ids are extracted. Amounts, notes,
 * invoice/order references and any tenant hints are deliberately dropped
 * here (§113 — the payload is untrusted; the domain resolves everything
 * from the stored {gateway, gatewayPaymentId} / {provider, providerLinkId}
 * relationships).
 */
function parseRazorpayEvent(payload: unknown): GatewayWebhookEvent {
  const base: GatewayWebhookEvent = { gateway: GATEWAY, eventType: 'UNHANDLED' };
  if (typeof payload !== 'object' || payload === null) return base;
  const eventName = (payload as Record<string, unknown>).event;
  if (typeof eventName !== 'string') return base;

  const paymentEntity = readPaymentEntity(payload);
  const linkId = readPaymentLinkId(payload);

  switch (eventName) {
    case 'payment.captured':
    case 'payment_link.paid':
      // Both carry the money-movement entity; the link id rides along so the
      // stored PaymentLink's status can be advanced too (§40/§41).
      if (!paymentEntityId(paymentEntity)) return base;
      return {
        gateway: GATEWAY, eventType: 'PAYMENT_CAPTURED',
        gatewayPaymentId: paymentEntityId(paymentEntity)!,
        ...(linkId !== undefined && { gatewayLinkId: linkId }),
      };
    case 'payment_link.partially_paid':
      if (!paymentEntityId(paymentEntity)) return base;
      return {
        gateway: GATEWAY, eventType: 'LINK_PARTIALLY_PAID',
        gatewayPaymentId: paymentEntityId(paymentEntity)!,
        ...(linkId !== undefined && { gatewayLinkId: linkId }),
      };
    case 'payment_link.cancelled':
      // Link-lifecycle events carry NO payment entity — the link id is the
      // one trusted fact (§113).
      if (linkId === undefined) return base;
      return { gateway: GATEWAY, eventType: 'LINK_CANCELLED', gatewayLinkId: linkId };
    case 'payment_link.expired':
      if (linkId === undefined) return base;
      return { gateway: GATEWAY, eventType: 'LINK_EXPIRED', gatewayLinkId: linkId };
    case 'payment.failed':
      if (!paymentEntityId(paymentEntity)) return base;
      return { gateway: GATEWAY, eventType: 'PAYMENT_FAILED', gatewayPaymentId: paymentEntityId(paymentEntity)! };
    default:
      // payment.authorized, refund.*, ping, … — acknowledged upstream, ignored here.
      return base;
  }
}

function paymentEntityId(entity: Record<string, unknown> | null): string | undefined {
  if (!entity || typeof entity.id !== 'string' || entity.id === '') return undefined;
  return entity.id;
}

/** Pulls payload.payment.entity out of the envelope, defensively. */
function readPaymentEntity(payload: unknown): Record<string, unknown> | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const inner = (payload as Record<string, unknown>).payload;
  if (typeof inner !== 'object' || inner === null) return null;
  const payment = (inner as Record<string, unknown>).payment;
  if (typeof payment !== 'object' || payment === null) return null;
  const entity = (payment as Record<string, unknown>).entity;
  if (typeof entity !== 'object' || entity === null) return null;
  return entity as Record<string, unknown>;
}

/** Pulls payload.payment_link.entity.id out of the envelope, defensively. */
function readPaymentLinkId(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;
  const inner = (payload as Record<string, unknown>).payload;
  if (typeof inner !== 'object' || inner === null) return undefined;
  const link = (inner as Record<string, unknown>).payment_link;
  if (typeof link !== 'object' || link === null) return undefined;
  const entity = (link as Record<string, unknown>).entity;
  if (typeof entity !== 'object' || entity === null) return undefined;
  const id = (entity as Record<string, unknown>).id;
  if (typeof id !== 'string' || id === '') return undefined;
  return id;
}

// ---------- §111 createPaymentLink ----------

async function createRazorpayLink(
  request: GatewayLinkRequest,
  credentials?: GatewayCredentials
): Promise<DomainResult<GatewayLinkResult>> {
  const keys = apiKeys(credentials);
  if (!keys) {
    return {
      ok: false, status: 503,
      error: 'Razorpay is not configured (no tenant credentials, no RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET) — payment links cannot be created',
    };
  }
  const auth = Buffer.from(`${keys.keyId}:${keys.keySecret}`).toString('base64');
  try {
    const res = await timedFetch('createPaymentLink', `${API_BASE}/payment_links`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        // Money.amount is already minor units (paise) — §127, never converted.
        amount: request.amount.amount,
        currency: request.amount.currency,
        // §113 — reference_id carries the INVOICE id so a captured payment can
        // be resolved to its invoice through the gateway's own record.
        reference_id: request.invoiceId,
        description: request.description
          ?? (request.invoiceNumber ? `Invoice ${request.invoiceNumber}` : 'Invoice payment'),
        // Module 12 §35 — the link's expiry (Razorpay: unix seconds).
        ...(request.expiresAt !== undefined && {
          expire_by: Math.floor(new Date(request.expiresAt).getTime() / 1000),
        }),
        ...(request.customerName !== undefined && {
          customer: {
            ...(request.customerName !== undefined && { name: request.customerName }),
            ...(request.customerEmail !== undefined && { email: request.customerEmail }),
          },
        }),
        notify: { sms: false, email: request.customerEmail !== undefined },
      }),
    });
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (!res.ok || typeof body.id !== 'string' || typeof body.short_url !== 'string') {
      return {
        ok: false, status: 502,
        error: `Razorpay rejected the payment link request (${res.status})`,
      };
    }
    return {
      ok: true, status: 201,
      data: { url: body.short_url as string, gatewayLinkId: body.id as string },
    };
  } catch {
    return { ok: false, status: 502, error: 'Could not reach Razorpay to create the payment link' };
  }
}

// ---------- §111 getPayment ----------

async function fetchRazorpayPayment(
  gatewayPaymentId: string,
  credentials?: GatewayCredentials
): Promise<DomainResult<GatewayPaymentSnapshot>> {
  const keys = apiKeys(credentials);
  if (!keys) {
    return {
      ok: false, status: 503,
      error: 'Razorpay is not configured (no tenant credentials, no RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET) — gateway payments cannot be fetched',
    };
  }
  const auth = Buffer.from(`${keys.keyId}:${keys.keySecret}`).toString('base64');
  try {
    const res = await timedFetch('getPayment', `${API_BASE}/payments/${encodeURIComponent(gatewayPaymentId)}`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (!res.ok || typeof body.id !== 'string') {
      return { ok: false, status: res.status === 404 ? 404 : 502, error: 'Razorpay payment not found' };
    }
    const amount = typeof body.amount === 'number' ? body.amount : 0;
    const currency = typeof body.currency === 'string' ? body.currency : 'INR';
    const capturedAt = typeof body.created_at === 'number'
      ? new Date(body.created_at * 1000).toISOString()
      : undefined;
    const notes = typeof body.notes === 'object' && body.notes !== null
      ? (body.notes as Record<string, unknown>)
      : undefined;
    const referenceId = notes && typeof notes.reference_id === 'string' ? notes.reference_id : undefined;
    return {
      ok: true, status: 200,
      data: {
        gatewayPaymentId: body.id,
        status: typeof body.status === 'string' ? body.status : 'unknown',
        // Reported for comparison only — §127, never converted into ours.
        amount: makeMoney(amount, currency as Money['currency']),
        ...(capturedAt !== undefined && { capturedAt }),
        ...(referenceId !== undefined && { referenceId }),
      },
    };
  } catch {
    return { ok: false, status: 502, error: 'Could not reach Razorpay to fetch the payment' };
  }
}

// ---------- Module 12 §32: cancelPaymentLink ----------

/**
 * POST /payment_links/:id/cancel. Idempotent where Razorpay allows it: an
 * already-cancelled link is a SUCCESS here, not an error (§46 — gateway
 * operations must be safe to repeat). A genuinely missing link is a 404 so
 * the domain can answer with its own §113-identical not-found.
 */
async function cancelRazorpayLink(
  gatewayLinkId: string,
  credentials?: GatewayCredentials
): Promise<DomainResult<null>> {
  const keys = apiKeys(credentials);
  if (!keys) {
    return {
      ok: false, status: 503,
      error: 'Razorpay is not configured (no tenant credentials, no RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET) — payment links cannot be cancelled',
    };
  }
  const auth = Buffer.from(`${keys.keyId}:${keys.keySecret}`).toString('base64');
  try {
    const res = await timedFetch('cancelPaymentLink', `${API_BASE}/payment_links/${encodeURIComponent(gatewayLinkId)}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}` },
    });
    if (res.ok) return { ok: true, status: 200, data: null };
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (res.status === 404) {
      return { ok: false, status: 404, error: 'Razorpay payment link not found' };
    }
    // Already cancelled (or already paid-and-closed) — the requested end
    // state holds; repeat-safe per §46.
    const description = typeof body.error === 'object' && body.error !== null
      ? String((body.error as Record<string, unknown>).description ?? '')
      : '';
    if (description.toLowerCase().includes('cancel')) {
      return { ok: true, status: 200, data: null };
    }
    return { ok: false, status: 502, error: `Razorpay rejected the cancel request (${res.status})` };
  } catch {
    return { ok: false, status: 502, error: 'Could not reach Razorpay to cancel the payment link' };
  }
}

// ---------- Module 17 §52 — credential test edge ----------

/**
 * GET /payment_links?count=1 with the pair's Basic auth: the cheapest
 * authenticated read Razorpay offers. No money, no writes — it only answers
 * "does this pair authenticate?". 401/403 ⇒ invalid pair; anything else
 * non-2xx ⇒ gateway-side trouble; a network failure ⇒ unreachable.
 */
async function testRazorpayCredentials(
  credentials: GatewayCredentials
): Promise<DomainResult<null>> {
  const keys = apiKeys(credentials);
  if (!keys) {
    return {
      ok: false, status: 503,
      error: 'No credentials to test (nothing submitted, nothing stored, no RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET)',
    };
  }
  const auth = Buffer.from(`${keys.keyId}:${keys.keySecret}`).toString('base64');
  try {
    const res = await timedFetch('testCredentials', `${API_BASE}/payment_links?count=1`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (res.ok) return { ok: true, status: 200, data: null };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: 401, error: 'Razorpay rejected the credential pair (invalid key id or key secret)' };
    }
    return { ok: false, status: 502, error: `Razorpay answered ${res.status} for the credential test` };
  } catch {
    return { ok: false, status: 502, error: 'Could not reach Razorpay to test the credentials' };
  }
}

/** The port implementation. §112 — gateway translation only, no domain writes. */
export const razorpayGateway: PaymentGateway = {
  gateway: GATEWAY,
  createPaymentLink: createRazorpayLink,
  verifyWebhookSignature: verifyRazorpaySignature,
  parseWebhookEvent: parseRazorpayEvent,
  getPayment: fetchRazorpayPayment,
  cancelPaymentLink: cancelRazorpayLink,
  testCredentials: testRazorpayCredentials,
};

// Exposed for unit tests of the timing-safe path (no other consumer).
export const __testing = { hexEqual };
