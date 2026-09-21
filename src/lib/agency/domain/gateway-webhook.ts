/**
 * Agency Vertical — Domain: gateway webhook intake (Module 10 §96–§99,
 * §113–§115; Module 12 §38–§50)
 *
 * THE bridge between a Razorpay webhook and the payment domain. Security-
 * isolated from session auth BY DESIGN (§97/§98/§110/§126): the webhook
 * route never requires a session — the HMAC signature IS the auth. This
 * service enforces the order that makes that safe:
 *
 *   1. §97/§39 verify the signature FIRST, over the RAW body. Invalid ⇒ 401.
 *      Nothing else about the request is read before this passes.
 *   2. §42/§44 the WebhookEvent store: every parseable event is recorded
 *      (provider + providerEventId — Razorpay's equivalent is the raw-body
 *      SHA-256 — is the uniqueness boundary). A PROCESSED/IGNORED row means
 *      the delivery is a replay: 200 ack, ZERO writes. A FAILED row does
 *      NOT block a redelivery — the retry re-runs and updates the same row.
 *      This is the polite first-line idempotency; the HARD guards are the
 *      §96 payment uniqueness index and the §102 PENDING-only confirm edge.
 *   3. §113 NEVER trust the payload's amount/invoiceId/tenantId/accountId.
 *      The ONLY facts taken from the payload are the gateway payment id and
 *      the gateway link id; tenant, invoice, amount and account are resolved
 *      from STORED relationships (§96 payment, Module 12 §33 payment link).
 *   4. §96/§99 a webhook for a payment that is no longer PENDING is a
 *      REPLAY — acknowledged with a 200 and NO new writes.
 *   5. §101/§114 captured money is confirmed through the NORMAL
 *      confirmPayment path — one Credit transaction, §104 invoice recompute,
 *      compensating rollback. No gateway shortcut exists (§41/§48).
 *   6. Module 12 §48/§49 — a payment_link.paid/partially_paid event for a
 *      link with NO stored payment runs the reconciliation flow: find the
 *      link → resolve the invoice (stored) → FETCH the authoritative gateway
 *      payment (never the webhook amount) → validate amount/currency
 *      against the stored outstanding balance and the link's own amount →
 *      create the Payment → confirm. A mismatch (§49) records the money as
 *      PENDING + reconciliationStatus ERROR (§50 — never falsely PAID) and
 *      creates NO transaction.
 *   7. §115 a business rejection acks 200 (retrying cannot fix a domain
 *      refusal; the ERROR state is what the reconciliation view surfaces).
 *      A TRANSIENT failure (500 — compensation already ran) acks 500 so
 *      Razorpay retries: that is the recovery path (10F/§45).
 *
 * Every non-happy path emits a structured error log (logError) AND an audit
 * row (createLog as 'razorpay-webhook') — §98 accountability without a
 * session. Logs carry the gateway ids and outcome, never the raw payload.
 * §115 lifecycle events: WEBHOOK_RECEIVED at event-store intake,
 * WEBHOOK_PROCESSED / WEBHOOK_FAILED at the §44 terminal stamp (and
 * PAYMENT_RECONCILED in agency.payments.confirmPayment when gateway money
 * settles) — the webhook journey is auditable end to end.
 */
import { createHash, createHmac } from 'crypto';
import {
  createLog, findPaymentByGatewayId, getPaymentById, updatePayment,
  getInvoiceById, getPayments, createPayment as createPaymentRepo,
  findPaymentLinkByProviderLinkId, updatePaymentLink,
  findWebhookEventByProviderEventId, createWebhookEvent, updateWebhookEvent,
  listRecentWebhookEvents, getTenantById, getTenants,
} from '@/lib/db';
import { logError } from '@/lib/logger';
import {
  confirmPayment, failPayment, recordManualPayment, type PaymentActor,
} from './agency.payments';
import type { Payment } from '../types/payment';
import type { PaymentLink, PaymentLinkStatus } from '../types/payment-link';
import { canTransitionPaymentLinkStatus } from '../types/payment-link';
import type { WebhookEvent, WebhookProcessingStatus } from '../types/webhook-event';
import type { GatewayWebhookEvent } from './payment-gateway';
import { calculatePaymentBalance } from './payment-calculation';
import { trackNamedFailure } from '../analytics/observability';
import { todayInTimezone } from '../types/dates';
import { razorpayGateway } from './razorpay-gateway';
import { tenantGatewayCredentials, tenantWebhookSecretOf, agencyTimezone } from './agency.settings';

/** §97 — the synthetic actor webhooks act as (transactions carry the lineage). */
const WEBHOOK_ACTOR: PaymentActor = {
  userId: 'razorpay-webhook',
  role: 'GATEWAY',
  username: 'razorpay-webhook',
};

const WEBHOOK_USER = 'razorpay-webhook';

export type WebhookOutcome =
  | 'SIGNATURE_INVALID'    // 401 — §97 fail closed
  | 'SIGNATURE_TENANT_MISMATCH' // 401 — §51: a tenant secret verified a delivery whose target belongs to ANOTHER tenant
  | 'MALFORMED_BODY'       // 400 — valid signature, unparseable JSON
  | 'UNHANDLED_EVENT'      // 200 — acknowledged, not ours to act on
  | 'UNRESOLVED_PAYMENT'   // 200 — no stored payment/link for this id; logged for reconciliation
  | 'REPLAY_ACKED'         // 200 — §42/§99: already processed, success ack, no writes
  | 'CONFIRMED'            // 200 — captured money confirmed through the normal path
  | 'MARKED_FAILED'        // 200 — payment.failed applied
  | 'LINK_ACKED'           // 200 — Module 12 §40: link cancelled/expired applied
  | 'RECONCILIATION_ERROR' // 200 — §49/§115: business rejection recorded, acked
  | 'RETRY_LATER';         // 500 — transient; the gateway should (and will) retry

export interface GatewayWebhookResult {
  outcome: WebhookOutcome;
  /** The HTTP status the route must ack with. */
  status: number;
  gatewayPaymentId?: string;
  gatewayLinkId?: string;
  paymentId?: string;
  transactionId?: string;
  /** Diagnostic detail for logs — never raw payload content. */
  error?: string;
}

const audit = (tenantId: string | undefined, action: string, detail: string, ipAddress?: string) =>
  createLog(WEBHOOK_USER, action, detail, tenantId, ipAddress).catch(() => undefined);

function outcome(
  kind: WebhookOutcome, status: number, extra: Partial<GatewayWebhookResult> = {}
): GatewayWebhookResult {
  return { outcome: kind, status, ...extra };
}

/** §42 — Razorpay's provider-specific event id: the raw-body SHA-256. */
function createHashHex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * §51 (17.15) — the tenant-stored half of multi-secret webhook
 * verification. Only Razorpay-ENABLED tenants with a stored (encrypted)
 * webhook secret are candidates; each secret is decrypted in server memory
 * and tried against the same timing-safe compare the env path uses. A
 * missing AGENCY_MASTER_KEY or a tampered ciphertext yields no candidate
 * (decryptSecret → null) — the env secret remains the only key.
 *
 * This is only the EXISTENCE gate (some tenant secret verified — parse may
 * proceed). The §51 BINDING is per-target, in dispatch: a delivery may act
 * on tenant T's entities iff T's OWN stored secret (or the env secret)
 * verifies it — see verifyTargetTenant below. First-match-wins here would
 * bind to an arbitrary tenant when two tenants share a secret value.
 */
async function verifyAgainstTenantWebhookSecrets(
  rawBody: string,
  signature: string | null
): Promise<boolean> {
  try {
    const tenants = await getTenants();
    for (const tenant of tenants) {
      const p = tenant.agencySettings?.payment;
      if (!p?.razorpayEnabled || !p.webhookSecretEncrypted) continue;
      const secret = tenantWebhookSecretOf(tenant);
      if (secret === undefined) continue;
      if (razorpayGateway.verifyWebhookSignature(rawBody, signature, secret)) {
        return true;
      }
    }
  } catch {
    // The tenant scan is best-effort breadth — a DB hiccup must not turn a
    // valid env-signed webhook into a rejection; the env check already ran.
  }
  return false;
}

/**
 * Process one Razorpay webhook end-to-end. `rawBody` must be the EXACT
 * bytes of the request (req.text()) — the signature is computed over them.
 */
export async function processRazorpayWebhook(
  rawBody: string,
  signature: string | null,
  ipAddress?: string
): Promise<GatewayWebhookResult> {
  // ── 1. §97/§39 — signature FIRST, fail closed ──────────────────────────
  // §51 (17.15) — the env secret is tried first: it is deployment-level
  // trust, valid platform-wide by design. When it does not match, the
  // tenant-stored webhook secrets of Razorpay-enabled tenants are tried —
  // but only as an EXISTENCE gate. The §51 BINDING is enforced per-target
  // in dispatch (verifyTargetTenant): a tenant secret only ever opens its
  // OWN tenant's payments and links, so one tenant's secret is never a key
  // for another tenant's money. A delivery matching NO configured secret is
  // rejected — fail closed, exactly as before Module 17.
  const envVerified = razorpayGateway.verifyWebhookSignature(rawBody, signature);
  if (!envVerified && !(await verifyAgainstTenantWebhookSecrets(rawBody, signature))) {
    await audit(undefined, 'WEBHOOK_SIGNATURE_REJECTED',
      'Razorpay webhook rejected: invalid or missing X-Razorpay-Signature (§97 — no secret ⇒ no trust)', ipAddress);
    logError('webhooks:razorpay signature rejected', new Error('signature_mismatch'), {
      headerPresent: Boolean(signature),
    });
    return outcome('SIGNATURE_INVALID', 401, { error: 'Invalid webhook signature' });
  }
  /** §51 binding — does the TARGET tenant's own stored secret verify this delivery? */
  const verifyTargetTenant = async (tenantId: string): Promise<boolean> => {
    try {
      const tenant = await getTenantById(tenantId);
      const p = tenant?.agencySettings?.payment;
      if (!tenant || !p?.razorpayEnabled || !p.webhookSecretEncrypted) return false;
      const secret = tenantWebhookSecretOf(tenant);
      if (secret === undefined) return false;
      return razorpayGateway.verifyWebhookSignature(rawBody, signature, secret);
    } catch {
      return false; // fail closed on any resolution failure
    }
  };

  // ── 2. parse (the signature already proved the sender) ─────────────────
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // §43 — record the failure (hash only, never the payload), then 400.
    const hash = createHashHex(rawBody);
    await createWebhookEvent({
      provider: 'RAZORPAY', providerEventId: hash, eventType: '(malformed)', payloadHash: hash,
    }).then(row => row && updateWebhookEvent(row.id, {
      processingStatus: 'FAILED', processedAt: new Date(), errorMessage: 'Body is not valid JSON',
    })).catch(() => undefined);
    await audit(undefined, 'WEBHOOK_MALFORMED',
      'Razorpay webhook body is not valid JSON despite a valid signature', ipAddress);
    logError('webhooks:razorpay malformed body', new Error('bad_json'), {});
    return outcome('MALFORMED_BODY', 400, { error: 'Malformed webhook body' });
  }

  // ── 3. §42/§44 — the WebhookEvent store: record + replay probe ─────────
  const payloadHash = createHashHex(rawBody);
  const rawEventName = typeof (payload as Record<string, unknown>)?.event === 'string'
    ? (payload as Record<string, unknown>).event as string
    : 'unknown';
  let eventRow = await findWebhookEventByProviderEventId('RAZORPAY', payloadHash);
  if (!eventRow) {
    const created = await createWebhookEvent({
      provider: 'RAZORPAY', providerEventId: payloadHash, eventType: rawEventName, payloadHash,
    });
    if (!created) {
      // Lost the insert race to a concurrent identical delivery — re-read.
      eventRow = await findWebhookEventByProviderEventId('RAZORPAY', payloadHash);
    } else {
      eventRow = created;
      // §115 — the intake lifecycle event: this delivery is NEW to the store
      // (replays below ack via WEBHOOK_REPLAY_ACKED instead). No tenant yet —
      // resolution happens during processing; the hash never reveals payload.
      await audit(undefined, 'WEBHOOK_RECEIVED',
        `Razorpay event ${rawEventName} (${created.providerEventId.slice(0, 12)}…) accepted into the event store (§42)`, ipAddress);
    }
  }
  // §113 — the event translation drops amount/invoice/tenant/account hints.
  // (Parsed before the replay probe: it is pure, and the replay ack carries
  // the gateway payment id this same delivery already returned.)
  const event = razorpayGateway.parseWebhookEvent(payload);

  if (eventRow && (eventRow.processingStatus === 'PROCESSED' || eventRow.processingStatus === 'IGNORED')) {
    // §42/§46 — this exact event already reached a terminal state: ack with
    // ZERO writes. (A FAILED row falls through — the redelivery re-runs.)
    await audit(eventRow.tenantId, 'WEBHOOK_REPLAY_ACKED',
      `Razorpay event ${rawEventName} (${eventRow.providerEventId.slice(0, 12)}…) already ${eventRow.processingStatus} — acknowledged with no writes (§42)`, ipAddress);
    // Diagnostic only (read-only): the payment id this same delivery already
    // returned. Nothing is re-derived or written.
    let replayedPaymentId: string | undefined;
    if (event.gatewayPaymentId !== undefined) {
      const existing = await findPaymentByGatewayId(razorpayGateway.gateway, event.gatewayPaymentId);
      replayedPaymentId = existing?.id;
    }
    return outcome('REPLAY_ACKED', 200, {
      ...(event.gatewayPaymentId !== undefined && { gatewayPaymentId: event.gatewayPaymentId }),
      ...(replayedPaymentId !== undefined && { paymentId: replayedPaymentId }),
    });
  }
  if (eventRow) {
    // §44 RECEIVED → PROCESSING; a retry clears the previous error.
    await updateWebhookEvent(eventRow.id, { processingStatus: 'PROCESSING', errorMessage: null }).catch(() => undefined);
  }

  // ── 4. dispatch + §44 terminal stamp ────────────────────────────────────
  const { result, tenantId } = await dispatchWebhookEvent(
    event, ipAddress, envVerified ? undefined : verifyTargetTenant
  );
  if (eventRow) {
    const terminal: 'PROCESSED' | 'IGNORED' | 'FAILED' =
      result.outcome === 'UNHANDLED_EVENT' ? 'IGNORED'
      : result.outcome === 'RETRY_LATER' || result.outcome === 'SIGNATURE_TENANT_MISMATCH' ? 'FAILED'
      : 'PROCESSED';
    await updateWebhookEvent(eventRow.id, {
      processingStatus: terminal,
      processedAt: new Date(),
      ...(tenantId !== undefined && { tenantId }),
      ...(terminal === 'FAILED' && result.error !== undefined && { errorMessage: result.error }),
    }).catch(() => undefined);
    // §115 — the terminal lifecycle events (IGNORED is not a failure and is
    // answerable from the §43 event store itself). FAILED carries the reason
    // and the tenant so the redelivery is traceable.
    if (terminal === 'PROCESSED') {
      await audit(tenantId, 'WEBHOOK_PROCESSED',
        `Razorpay event ${rawEventName} (${eventRow.providerEventId.slice(0, 12)}…) processed — outcome ${result.outcome}${result.paymentId !== undefined ? `, payment ${result.paymentId}` : ''}${result.transactionId !== undefined ? `, transaction ${result.transactionId}` : ''}`, ipAddress);
    } else if (terminal === 'FAILED') {
      await audit(tenantId, 'WEBHOOK_FAILED',
        `Razorpay event ${rawEventName} (${eventRow.providerEventId.slice(0, 12)}…) FAILED processing (${result.error ?? result.outcome}) — event store holds the row for the gateway's retry (§44/§45)`, ipAddress);
    }
    // §116 — the failure counters (fire-and-forget, never break the ack):
    // processing landed FAILED for the gateway's retry, and/or the domain
    // refused to reconcile the money (§49/§50 — acked 200 but surfaced).
    if (terminal === 'FAILED') {
      trackNamedFailure('agency_razorpay_webhook_failure', tenantId ?? 'unknown',
        result.error ?? result.outcome, { eventType: rawEventName });
    }
    if (result.outcome === 'RECONCILIATION_ERROR') {
      trackNamedFailure('agency_payment_reconciliation_failure', tenantId ?? 'unknown',
        result.error ?? 'reconciliation_error', { eventType: rawEventName });
    }
  }
  return result;
}

// ---------- the pipeline (signature-verified, event-store-checked) ----------

/**
 * §51 security binding — when a delivery authenticated with a TENANT's
 * stored webhook secret (verifyTargetTenant present, env secret absent),
 * it may only act on entities of a tenant whose OWN stored secret verifies
 * the delivery. The env secret stays platform-wide by design.
 */
async function requireTenantBinding(
  verifyTargetTenant: ((tenantId: string) => Promise<boolean>) | undefined,
  entityTenantId: string,
  ipAddress: string | undefined,
  what: string,
  gatewayId: string
): Promise<GatewayWebhookResult | null> {
  if (verifyTargetTenant === undefined) return null; // env secret — platform-wide
  if (await verifyTargetTenant(entityTenantId)) return null; // its own secret verifies
  const detail = `Razorpay webhook for ${what} ${gatewayId} belongs to tenant ${entityTenantId}, whose own stored webhook secret does NOT verify this delivery (§51/§113 — rejected, no writes)`;
  await audit(entityTenantId, 'WEBHOOK_TENANT_MISMATCH', detail, ipAddress);
  logError('webhooks:razorpay tenant secret mismatch', new Error('signature_tenant_mismatch'), {
    [what === 'gateway payment' ? 'gatewayPaymentId' : 'gatewayLinkId']: gatewayId,
    entityTenantId,
  });
  return outcome('SIGNATURE_TENANT_MISMATCH', 401, { error: 'Webhook signature tenant mismatch' });
}

async function dispatchWebhookEvent(
  event: GatewayWebhookEvent,
  ipAddress?: string,
  verifyTargetTenant?: (tenantId: string) => Promise<boolean>
): Promise<{ result: GatewayWebhookResult; tenantId?: string }> {
  if (event.eventType === 'UNHANDLED') {
    return { result: outcome('UNHANDLED_EVENT', 200) };
  }

  // ── §113/§96 — a stored payment resolves FIRST (money webhooks) ────────
  if (event.gatewayPaymentId !== undefined) {
    const payment = await findPaymentByGatewayId(razorpayGateway.gateway, event.gatewayPaymentId);
    if (payment) {
      const rejected = await requireTenantBinding(verifyTargetTenant, payment.tenantId, ipAddress,
        'gateway payment', event.gatewayPaymentId);
      if (rejected) return { result: rejected };
      const result = await storedPaymentPath(payment, event, ipAddress);
      return { result, tenantId: payment.tenantId };
    }
  }

  // ── Module 12 §40/§41 — link-carried events resolve through the LINK ───
  if (event.gatewayLinkId !== undefined) {
    return linkPath(event, ipAddress, verifyTargetTenant);
  }

  // Neither a known payment nor a link event — reconciliation gold (§115).
  await audit(undefined, 'WEBHOOK_UNRESOLVED_PAYMENT',
    `Razorpay ${event.eventType} for gateway payment ${event.gatewayPaymentId ?? '(none)'} matches no stored payment or link — no tenant, invoice or amount was taken from the payload (§113)`, ipAddress);
  logError('webhooks:razorpay unresolved payment', new Error('gateway_payment_unmatched'), {
    gatewayPaymentId: event.gatewayPaymentId, eventType: event.eventType,
  });
  return { result: outcome('UNRESOLVED_PAYMENT', 200, { gatewayPaymentId: event.gatewayPaymentId }) };
}

/** The Module 10 path: a stored payment moves through the NORMAL actions. */
async function storedPaymentPath(
  payment: Payment,
  event: GatewayWebhookEvent,
  ipAddress?: string
): Promise<GatewayWebhookResult> {
  const gatewayPaymentId = event.gatewayPaymentId!;
  const tenantId = payment.tenantId;

  // §96/§99 — the replay guard: only PENDING is actionable.
  if (payment.status !== 'PENDING') {
    await audit(tenantId, 'WEBHOOK_REPLAY_ACKED',
      `Razorpay ${event.eventType} for gateway payment ${gatewayPaymentId} replayed — payment ${payment.id} is already ${payment.status}; acknowledged with no writes (§99)`, ipAddress);
    return outcome('REPLAY_ACKED', 200, { gatewayPaymentId, paymentId: payment.id });
  }

  if (event.eventType === 'PAYMENT_FAILED') {
    const result = await failPayment(payment.id!, tenantId, WEBHOOK_ACTOR, {}, {
      username: WEBHOOK_USER, tenantId,
      log: (action, detail) => createLog(WEBHOOK_USER, action, detail, tenantId, ipAddress),
    });
    if (result.ok) {
      return outcome('MARKED_FAILED', 200, { gatewayPaymentId, paymentId: payment.id });
    }
    if (result.status === 409 && await isNoLongerPending(payment.id!, tenantId)) {
      return outcome('REPLAY_ACKED', 200, { gatewayPaymentId, paymentId: payment.id });
    }
    await audit(tenantId, 'WEBHOOK_RETRY_LATER',
      `Razorpay payment.failed for gateway payment ${gatewayPaymentId} could not be applied (${result.error}) — payment left PENDING for retry`, ipAddress);
    logError('webhooks:razorpay payment.failed apply error', new Error(result.error ?? 'unknown'), {
      gatewayPaymentId, paymentId: payment.id, tenantId,
    });
    return outcome('RETRY_LATER', 500, { gatewayPaymentId, paymentId: payment.id, error: result.error });
  }

  // PAYMENT_CAPTURED / LINK_PARTIALLY_PAID → confirm through the ONE writer path.
  const auditContext = {
    username: WEBHOOK_USER, tenantId,
    log: (action: string, detail: string) => createLog(WEBHOOK_USER, action, detail, tenantId, ipAddress),
  };
  const result = await confirmPayment(payment.id!, tenantId, WEBHOOK_ACTOR, undefined, auditContext);
  if (result.ok && result.data) {
    // §41 — the stored link (if the event carried one) reflects the money.
    await advanceLinkStatus(event, 'PAID');
    return outcome('CONFIRMED', 200, {
      gatewayPaymentId, paymentId: payment.id, transactionId: result.data.transactionId,
    });
  }

  // A concurrent webhook may have confirmed between our read and the write:
  // the 409 is then a replay, not an error.
  if (result.status === 409 && await isNoLongerPending(payment.id!, tenantId)) {
    await audit(tenantId, 'WEBHOOK_REPLAY_ACKED',
      `Concurrent Razorpay webhook for gateway payment ${gatewayPaymentId} — payment ${payment.id} already confirmed; acknowledged with no writes (§99)`, ipAddress);
    return outcome('REPLAY_ACKED', 200, { gatewayPaymentId, paymentId: payment.id });
  }

  if (result.status >= 500) {
    // Transient (§114 compensation already reverted everything) — ack 500 so
    // the gateway retries. This is the 10F recovery path.
    await audit(tenantId, 'WEBHOOK_RETRY_LATER',
      `Razorpay capture for gateway payment ${gatewayPaymentId} hit a transient failure (${result.error}) — payment left PENDING, gateway will retry`, ipAddress);
    logError('webhooks:razorpay confirm transient failure', new Error(result.error ?? 'unknown'), {
      gatewayPaymentId, paymentId: payment.id, tenantId,
    });
    return outcome('RETRY_LATER', 500, { gatewayPaymentId, paymentId: payment.id, error: result.error });
  }

  // §115 — business rejection (§91 overpay, retired invoice, …): permanent.
  // Record ERROR for the reconciliation view and ack 200 — a retry cannot
  // change a domain refusal.
  await requireReconciliationError(payment, tenantId, ipAddress,
    `Razorpay capture for gateway payment ${gatewayPaymentId} rejected by the domain: ${result.error}`);
  return outcome('RECONCILIATION_ERROR', 200, {
    gatewayPaymentId, paymentId: payment.id, error: result.error,
  });
}

// ---------- Module 12 §40: link-lifecycle events ----------

async function linkPath(
  event: GatewayWebhookEvent,
  ipAddress?: string,
  verifyTargetTenant?: (tenantId: string) => Promise<boolean>
): Promise<{ result: GatewayWebhookResult; tenantId?: string }> {
  // §113 — the link id is the ONE trusted fact; the STORED link owns the
  // tenant/invoice/amount. Tenant-agnostic lookup by construction — the
  // §51 binding below is what scopes it when a tenant secret authenticated.
  const link = await findPaymentLinkByProviderLinkId(event.gatewayLinkId!);
  if (!link) {
    await audit(undefined, 'WEBHOOK_UNRESOLVED_PAYMENT',
      `Razorpay ${event.eventType} for payment link ${event.gatewayLinkId} matches no stored link — no tenant, invoice or amount was taken from the payload (§113)`, ipAddress);
    logError('webhooks:razorpay unresolved link', new Error('gateway_link_unmatched'), {
      gatewayLinkId: event.gatewayLinkId, eventType: event.eventType,
    });
    return { result: outcome('UNRESOLVED_PAYMENT', 200, { gatewayLinkId: event.gatewayLinkId }) };
  }
  const tenantId = link.tenantId;

  // §51 binding — the link's OWN tenant secret must verify the delivery.
  const rejected = await requireTenantBinding(verifyTargetTenant, tenantId, ipAddress,
    'payment link', event.gatewayLinkId!);
  if (rejected) return { result: rejected };

  if (event.eventType === 'LINK_CANCELLED' || event.eventType === 'LINK_EXPIRED') {
    const status: PaymentLinkStatus = event.eventType === 'LINK_CANCELLED' ? 'CANCELLED' : 'EXPIRED';
    // §46 — repeat-safe: an already-terminal link writes nothing.
    if (canTransitionPaymentLinkStatus(link.status, status)) {
      const ok = await updatePaymentLink(link.id!, tenantId, { status });
      if (ok) {
        await audit(tenantId, status === 'CANCELLED' ? 'PAYMENT_LINK_CANCELLED' : 'PAYMENT_LINK_EXPIRED',
          `Razorpay payment link ${link.providerLinkId} for invoice ${link.invoiceId} is now ${status} (webhook ${event.eventType})`);
      }
    }
    return { result: outcome('LINK_ACKED', 200, { gatewayLinkId: event.gatewayLinkId }), tenantId };
  }

  // PAYMENT_CAPTURED / LINK_PARTIALLY_PAID carried by a link with no stored
  // payment yet — the §48 reconciliation money path.
  const result = await reconcileLinkPayment(link, event, ipAddress);
  return { result, tenantId };
}

// ---------- Module 12 §48/§49/§50: the link money path ----------

/**
 * The §48 reconciliation flow, applied when a payment_link.paid /
 * payment_link.partially_paid webhook arrives for a link whose payment has
 * not been recorded yet:
 *
 *   identify link (done) → identify invoice → fetch the AUTHORITATIVE
 *   provider payment → validate amount/status → create/update Payment →
 *   core transaction (via confirmPayment) → invoice update (§104) → audit.
 *
 * §49 — the webhook amount is NEVER trusted; only the gateway's own fetched
 * record is, and even that is validated against the STORED invoice balance.
 * A mismatch records PENDING + reconciliationStatus ERROR (§50) and creates
 * NO transaction.
 */
async function reconcileLinkPayment(
  link: PaymentLink,
  event: GatewayWebhookEvent,
  ipAddress?: string
): Promise<GatewayWebhookResult> {
  const gatewayPaymentId = event.gatewayPaymentId!;
  const tenantId = link.tenantId;
  const auditContext = {
    username: WEBHOOK_USER, tenantId,
    log: (action: string, detail: string) => createLog(WEBHOOK_USER, action, detail, tenantId, ipAddress),
  };

  // §48 step 3 — the authoritative provider payment (§49: never the webhook
  // amount). A fetch failure is transient — nothing has been written; ack
  // 500 so Razorpay redelivers (§45). §15 (17.15) — the link's OWN tenant
  // credentials (when stored) make the fetch, env fallback inside the adapter.
  const tenant = await getTenantById(tenantId);
  const credentials = tenantGatewayCredentials(tenant);
  const snapshot = await razorpayGateway.getPayment(gatewayPaymentId, credentials);
  if (!snapshot.ok || !snapshot.data) {
    await audit(tenantId, 'WEBHOOK_RETRY_LATER',
      `Razorpay capture for link ${link.providerLinkId} (gateway payment ${gatewayPaymentId}) could not be fetched from the gateway (${snapshot.error}) — nothing written, gateway will retry`, ipAddress);
    logError('webhooks:razorpay gateway payment fetch failed', new Error(snapshot.error ?? 'unknown'), {
      gatewayPaymentId, gatewayLinkId: link.providerLinkId, tenantId,
    });
    return outcome('RETRY_LATER', 500, { gatewayPaymentId, gatewayLinkId: link.providerLinkId, error: snapshot.error });
  }
  const gatewayPayment = snapshot.data;

  // §48 step 2 — the invoice, from the STORED link (§113).
  const invoice = await getInvoiceById(link.invoiceId, tenantId);
  if (!invoice) {
    await audit(tenantId, 'WEBHOOK_RECONCILIATION_ERROR',
      `Razorpay capture for link ${link.providerLinkId} resolves to invoice ${link.invoiceId}, which no longer exists — no money was recorded (§113)`, ipAddress);
    logError('webhooks:razorpay link invoice missing', new Error('invoice_missing'), {
      gatewayPaymentId, gatewayLinkId: link.providerLinkId, tenantId,
    });
    return outcome('RECONCILIATION_ERROR', 200, {
      gatewayPaymentId, gatewayLinkId: link.providerLinkId, error: 'The link\'s invoice no longer exists',
    });
  }

  // §48 step 4 / §49 — validate against the STORED facts.
  const payments = await getPayments(tenantId, { invoiceId: invoice.id! });
  const balance = calculatePaymentBalance(invoice.total, payments);
  const mismatches: string[] = [];
  if (gatewayPayment.status !== 'captured') {
    mismatches.push(`gateway payment status is '${gatewayPayment.status}', not 'captured'`);
  }
  if (gatewayPayment.amount.currency !== invoice.currency) {
    mismatches.push(`gateway money is ${gatewayPayment.amount.currency} but the invoice is ${invoice.currency} (§127 — never converted)`);
  }
  if (gatewayPayment.amount.amount <= 0) {
    mismatches.push('gateway amount is not positive');
  }
  if (gatewayPayment.amount.amount > balance.amountDue.amount) {
    mismatches.push(`gateway amount ${gatewayPayment.amount.amount} exceeds the outstanding balance ${balance.amountDue.amount} ${invoice.currency}`);
  }
  if (gatewayPayment.amount.amount > link.amount.amount) {
    mismatches.push(`gateway amount ${gatewayPayment.amount.amount} exceeds the link's own amount ${link.amount.amount} ${link.amount.currency}`);
  }

  if (mismatches.length > 0) {
    // §49/§50 — record the money as PENDING + ERROR (in the GATEWAY's own
    // denomination — never converted), create NO transaction, never falsely
    // say PAID. The reconciliation view surfaces it (§115).
    let created: Payment | null = null;
    try {
      created = await createPaymentRepo(tenantId, {
        invoiceId: invoice.id!,
        clientId: invoice.clientId,
        amount: gatewayPayment.amount,
        receivedAt: gatewayPayment.capturedAt
          ? gatewayPayment.capturedAt.slice(0, 10)
          : todayInTimezone(agencyTimezone(tenant)), // §44 — agency tz anchor
        method: 'RAZORPAY',
        reference: `plink ${link.providerLinkId}`,
        gateway: 'RAZORPAY',
        gatewayPaymentId,
        // §47 — the link lineage rides along for the reconciliation view.
        gatewayLinkId: link.providerLinkId,
        source: 'RAZORPAY',
        reconciliationStatus: 'ERROR',
        notes: `§49 reconciliation mismatch: ${mismatches.join('; ')}`,
        createdBy: WEBHOOK_ACTOR.userId,
      });
    } catch (e) {
      // §96 — a concurrent delivery won the uniqueness race: this is a replay.
      if ((e as { code?: number }).code === 11000) {
        return outcome('REPLAY_ACKED', 200, { gatewayPaymentId, gatewayLinkId: link.providerLinkId });
      }
      throw e;
    }
    // §49/§50 — the link is deliberately NOT advanced: money was collected at
    // the gateway but our books refused it. The ERROR payment is the visible
    // state; the link moves only when money is actually recorded.
    await audit(tenantId, 'WEBHOOK_RECONCILIATION_ERROR',
      `Razorpay capture for link ${link.providerLinkId} (gateway payment ${gatewayPaymentId}) FAILED amount verification: ${mismatches.join('; ')} — payment ${created?.id} recorded PENDING with reconciliationStatus ERROR; NO transaction was created (§49/§50)`, ipAddress);
    logError('webhooks:razorpay link amount mismatch', new Error('reconciliation_mismatch'), {
      gatewayPaymentId, gatewayLinkId: link.providerLinkId, tenantId,
    });
    return outcome('RECONCILIATION_ERROR', 200, {
      gatewayPaymentId, gatewayLinkId: link.providerLinkId, paymentId: created?.id,
      error: mismatches.join('; '),
    });
  }

  // Valid — record the Payment through the NORMAL intake (§52 source
  // RAZORPAY, §96 duplicate probe, clientId derived §113), from STORED +
  // FETCHED facts only.
  const record = await recordManualPayment(tenantId, WEBHOOK_ACTOR, {
    invoiceId: invoice.id!,
    amount: gatewayPayment.amount.amount,
    method: 'RAZORPAY',
    gatewayPaymentId,
    // §47 — the link lineage (from the STORED link, never the payload §113).
    gatewayLinkId: link.providerLinkId,
    reference: `plink ${link.providerLinkId}`,
    ...(gatewayPayment.capturedAt !== undefined && { receivedAt: gatewayPayment.capturedAt.slice(0, 10) }),
    notes: `Collected via Razorpay payment link ${link.providerLinkId}`,
  }, auditContext);
  if (!record.ok || !record.data) {
    if (record.code === 'GATEWAY_PAYMENT_DUPLICATE') {
      return outcome('REPLAY_ACKED', 200, { gatewayPaymentId, gatewayLinkId: link.providerLinkId });
    }
    await audit(tenantId, 'WEBHOOK_RECONCILIATION_ERROR',
      `Razorpay capture for link ${link.providerLinkId} (gateway payment ${gatewayPaymentId}) could not be recorded: ${record.error} — no money was written (§113)`, ipAddress);
    return outcome('RECONCILIATION_ERROR', 200, {
      gatewayPaymentId, gatewayLinkId: link.providerLinkId, error: record.error,
    });
  }
  const paymentId = record.data.id!;

  // §41 — the link reflects the collection state.
  await advanceLinkStatus(event, event.eventType === 'LINK_PARTIALLY_PAID' ? 'PARTIALLY_PAID' : 'PAID');

  // §48 steps 5–8 / §114 — confirm through the ONE writer path (one Credit,
  // §104 recompute, compensating rollback). 12.10 needs no new writer.
  const confirmed = await confirmPayment(paymentId, tenantId, WEBHOOK_ACTOR, undefined, auditContext);
  if (confirmed.ok && confirmed.data) {
    return outcome('CONFIRMED', 200, {
      gatewayPaymentId, gatewayLinkId: link.providerLinkId,
      paymentId, transactionId: confirmed.data.transactionId,
    });
  }
  if (confirmed.status === 409 && await isNoLongerPending(paymentId, tenantId)) {
    return outcome('REPLAY_ACKED', 200, { gatewayPaymentId, gatewayLinkId: link.providerLinkId, paymentId });
  }
  if (confirmed.status >= 500) {
    // The payment exists and stays PENDING (§114 reverted the rest). The
    // redelivery resolves it through the STORED-payment path above.
    await audit(tenantId, 'WEBHOOK_RETRY_LATER',
      `Razorpay capture for link ${link.providerLinkId} (gateway payment ${gatewayPaymentId}) hit a transient failure (${confirmed.error}) — payment ${paymentId} left PENDING, gateway will retry`, ipAddress);
    return outcome('RETRY_LATER', 500, { gatewayPaymentId, gatewayLinkId: link.providerLinkId, paymentId, error: confirmed.error });
  }

  // §115 — business rejection (e.g. §91 overpay: the invoice settled by
  // other means first): ERROR stamp, 200 ack.
  await updatePayment(paymentId, tenantId, { reconciliationStatus: 'ERROR' }).catch(() => undefined);
  await audit(tenantId, 'WEBHOOK_RECONCILIATION_ERROR',
    `Razorpay capture for link ${link.providerLinkId} (gateway payment ${gatewayPaymentId}) rejected by the domain: ${confirmed.error} — payment ${paymentId} PENDING with reconciliationStatus ERROR (§115)`, ipAddress);
  return outcome('RECONCILIATION_ERROR', 200, {
    gatewayPaymentId, gatewayLinkId: link.providerLinkId, paymentId, error: confirmed.error,
  });
}

/** §41 — best-effort link status advancement when an event carries a link id. */
async function advanceLinkStatus(event: GatewayWebhookEvent, status: PaymentLinkStatus): Promise<void> {
  if (event.gatewayLinkId === undefined) return;
  const link = await findPaymentLinkByProviderLinkId(event.gatewayLinkId);
  if (!link) return;
  if (!canTransitionPaymentLinkStatus(link.status, status)) return;
  await updatePaymentLink(link.id!, link.tenantId, { status }).catch(() => undefined);
}

/** Re-read the payment; used to distinguish a lost race (replay) from real 409s. */
async function isNoLongerPending(paymentId: string, tenantId: string): Promise<boolean> {
  const current = await getPaymentById(paymentId, tenantId);
  return current !== null && current.status !== 'PENDING';
}

/** §115 — stamp ERROR on a gateway payment that the domain refused. */
async function requireReconciliationError(
  payment: Payment,
  tenantId: string,
  ipAddress: string | undefined,
  detail: string
): Promise<void> {
  await updatePayment(payment.id!, tenantId, { reconciliationStatus: 'ERROR' }).catch(() => undefined);
  await audit(tenantId, 'WEBHOOK_RECONCILIATION_ERROR',
    `${detail} — reconciliationStatus ERROR (§115); the payment stays ${payment.status} and the rejection is visible in the reconciliation view`, ipAddress);
  logError('webhooks:razorpay reconciliation error', new Error('domain_rejection'), {
    gatewayPaymentId: payment.gatewayPaymentId, paymentId: payment.id, tenantId,
  });
}

// ---------- §43: the operational-visibility read surface ----------

/**
 * §43 — "processed? failed? retried?" must be answerable instead of losing
 * the request. Tenant-scoped, newest first, read-only. The rows carry no
 * payload by construction (§42 — hash, event name and processing metadata
 * only), so the projection is safe by shape; events that never resolved to
 * THIS tenant (tenantId unset or foreign) are invisible by the same filter.
 */
export async function listWebhookEvents(
  tenantId: string,
  filters: { processingStatus?: WebhookProcessingStatus } = {},
  limit = 50
): Promise<WebhookEvent[]> {
  const bounded = Math.min(Math.max(Math.trunc(limit) || 50, 1), 200);
  return listRecentWebhookEvents({ tenantId, ...filters }, bounded);
}
