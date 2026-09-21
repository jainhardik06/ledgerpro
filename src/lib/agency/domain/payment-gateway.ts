/**
 * Agency Vertical — Domain: PaymentGateway abstraction (Module 10, spec §111/§112)
 *
 * TYPES + CONTRACT ONLY. This file defines the port; razorpay-gateway.ts is
 * the one adapter (Phase 1). No I/O here, no server-only imports — a React
 * bundle may import the shapes safely.
 *
 * The rules (spec §111/§112):
 *   §111 the gateway speaks ONLY gateway: it creates payment links, verifies
 *        webhook signatures, and fetches its own payment records. Three
 *        operations, no more.
 *   §112 the gateway NEVER owns invoice/payment/ledger/account/audit domain:
 *        it receives already-validated domain values (a Money, an invoice
 *        number) and returns gateway-native results. It never writes a
 *        Payment, never mutates an invoice, never touches an account, never
 *        audits. The webhook service (gateway-webhook.ts) owns that side.
 *
 * Security posture (§97/§98/§113, enforced by the implementers):
 *   - verifyWebhookSignature takes the RAW request body — a re-serialized
 *     JSON parse is NOT the bytes that were signed. The route must read the
 *     raw text and hand it here verbatim.
 *   - parseWebhookEvent returns ONLY what the domain is allowed to learn
 *     from a webhook: the event type and the gateway payment id. Amount,
 *     invoice, tenant and account hints in the payload are NEVER surfaced —
 *     the domain resolves all of those from STORED relationships (§113).
 */
import type { Money } from '../types/money';
import type { DomainResult } from './agency.clients';

// ---------- §111 createPaymentLink ----------

/**
 * What the domain hands the gateway to collect one invoice's money.
 * (Module 12 §35 — the request carries invoice id, amount, description,
 * customer reference and expiry; Money OS generates its own internal
 * reference — reference_id = invoiceId at the adapter.)
 */
export interface GatewayLinkRequest {
  /** §113 — stored for lineage only; the gateway shows it to the payer. */
  invoiceId: string;
  /** Display: INV-000001 — the number the client recognizes. */
  invoiceNumber?: string;
  clientId: string;
  customerName?: string;
  customerEmail?: string;
  /** Minor units in the invoice currency (§127 — never converted). */
  amount: Money;
  description?: string;
  /**
   * Module 12 §35/§37 — when the hosted link stops accepting payments.
   * ISO 8601; the adapter translates to the gateway's native expiry field.
   */
  expiresAt?: string;
}

/** What the gateway hands back. */
export interface GatewayLinkResult {
  /** The hosted checkout URL the client follows. */
  url: string;
  /**
   * The gateway's own id for the LINK (e.g. plink_…). Module 12 §33: stored
   * as the PaymentLink's providerLinkId — the id link webhooks resolve
   * through (§113: the stored link, never a payload hint).
   */
  gatewayLinkId: string;
}

// ---------- §111/§113 webhook events ----------

/**
 * The webhook outcomes the domain distinguishes. Module 12 §40 adds the
 * payment-link lifecycle events (paid / partially_paid / cancelled /
 * expired) — the cancelled/expired ones carry a LINK id only, no payment.
 */
export type GatewayEventType =
  | 'PAYMENT_CAPTURED'
  | 'PAYMENT_FAILED'
  | 'LINK_PARTIALLY_PAID'
  | 'LINK_CANCELLED'
  | 'LINK_EXPIRED'
  | 'UNHANDLED';

export interface GatewayWebhookEvent {
  gateway: string;
  eventType: GatewayEventType;
  /**
   * §113 — the ONE trusted fact a money webhook provides: the gateway's id
   * for the money movement. Everything else (amount, invoice, tenant,
   * account) is resolved from stored relationships keyed by this id.
   */
  gatewayPaymentId?: string;
  /**
   * Module 12 §40/§113 — the gateway's id for the PAYMENT LINK (plink_…),
   * the trusted fact link-lifecycle webhooks provide. The stored PaymentLink
   * (found by providerLinkId) owns the tenant/invoice/amount; a payload hint
   * is never consulted.
   */
  gatewayLinkId?: string;
}

// ---------- §111 the port ----------

export interface PaymentGateway {
  /** Gateway identity — the §96 idempotency key member ('RAZORPAY'). */
  readonly gateway: string;

  /**
   * §111 — create a hosted payment link for one invoice. Fails closed when
   * the gateway is not configured (neither tenant credentials nor env API
   * keys): {ok: false, status: 503}. Never touches domain state on failure.
   * Module 17 §15: tenant credentials (§48) take precedence; env is the
   * fallback.
   */
  createPaymentLink(
    request: GatewayLinkRequest, credentials?: GatewayCredentials
  ): Promise<DomainResult<GatewayLinkResult>>;

  /**
   * §97/§98 — HMAC verification of the RAW request body against the
   * signature header. Returns false when no secret applies (fail closed),
   * the header is missing, or the digests differ (timing-safe compare).
   * Module 17 §51: a tenant's stored webhook secret may be supplied —
   * the env secret is always tried first by the webhook domain.
   */
  verifyWebhookSignature(rawBody: string, signature: string | null, secret?: string): boolean;

  /**
   * §113 — translate a (already signature-verified) webhook payload into the
   * minimal event. Shape-defensive: an unexpected payload is UNHANDLED,
   * never a crash, and amount/invoice/tenant/account fields are dropped.
   */
  parseWebhookEvent(payload: unknown): GatewayWebhookEvent;

  /**
   * §111 — fetch the gateway's own record of a payment (amount actually
   * captured, status, link reference). Used by reconciliation to compare the
   * gateway's view against ours (§115). Fails closed when unconfigured.
   * Module 17 §15: tenant credentials take precedence; env is the fallback.
   */
  getPayment(
    gatewayPaymentId: string, credentials?: GatewayCredentials
  ): Promise<DomainResult<GatewayPaymentSnapshot>>;

  /**
   * Module 12 §32/§40 — cancel a hosted payment link. Idempotent where the
   * gateway allows it (cancelling an already-cancelled link succeeds); a
   * missing link is a 404. Fails closed when unconfigured (503). Like every
   * port operation: no domain state is touched on failure.
   * Module 17 §15: tenant credentials take precedence; env is the fallback.
   */
  cancelPaymentLink(
    gatewayLinkId: string, credentials?: GatewayCredentials
  ): Promise<DomainResult<null>>;

  /**
   * Module 17 §52 — POST /settings/payment/test. A cheap AUTHENTICATED edge
   * (a 1-item list call — no money, no writes, no side effects) that answers
   * whether a credential pair works. {ok:true} ⇒ the pair is valid;
   * {ok:false, status:401} ⇒ the gateway rejected the pair; 502 ⇒ the
   * gateway could not be reached. The secret is never echoed in any result.
   */
  testCredentials(credentials: GatewayCredentials): Promise<DomainResult<null>>;
}

// ---------- Module 17 §48/§51 — per-tenant credentials ----------

/**
 * §48/§51 — API credentials a tenant configured in Agency Settings
 * (decrypted server-side just before the gateway call; never persisted in
 * this form, never returned to any client). Every port method takes them
 * OPTIONALLY: absent credentials fall back to the deployment-level env
 * configuration (Module 12 §54), so existing deployments keep working.
 */
export interface GatewayCredentials {
  keyId: string;
  keySecret: string;
}

/** §115 — the gateway's side of the story, for reconciliation comparison. */
export interface GatewayPaymentSnapshot {
  gatewayPaymentId: string;
  status: string;
  /** Minor units in the gateway's currency — compared, never converted (§127). */
  amount: Money;
  capturedAt?: string;
  /** The link reference we set at creation (invoice lineage). */
  referenceId?: string;
}
