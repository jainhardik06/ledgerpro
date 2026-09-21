/**
 * Agency Vertical — Types: webhook events (Module 12, spec §42–§46)
 *
 * CLIENT-SAFE: types and pure functions only. No server imports.
 *
 * The module's job (§43): when a webhook arrives and processing fails, we
 * must be able to answer "processed? failed? retried?" — instead of losing
 * the request. This store is OPERATIONAL VISIBILITY plus the §42 idempotency
 * boundary; it is not a queue (§45 — retries ride Razorpay's own at-least-
 * once delivery on 5xx acks plus the 10F manual reconcile endpoint).
 *
 * The rules encoded here:
 *   §42  uniqueness is provider + providerEventId. Razorpay does NOT put a
 *        native event id in webhook payloads, so Phase 1 uses the
 *        provider-specific equivalent the spec allows: the SHA-256 of the
 *        raw request body (payloadHash). Two deliveries of the same event
 *        have identical bytes → identical id → the replay is detectable.
 *   §44  states: RECEIVED → PROCESSING → PROCESSED | FAILED | IGNORED.
 *        A FAILED row does NOT block a redelivery — the retry re-runs the
 *        pipeline and updates the same row (only PROCESSED/IGNORED short-
 *        circuit as replays).
 *   §46  processing is safe to repeat: the money guards are the §96 payment
 *        uniqueness index and the §102 PENDING-only confirm edge — this
 *        store is the polite first line, not the hard one.
 *   §113 the row never stores the payload itself — only its hash, the event
 *        name, and processing metadata.
 */
export type WebhookProcessingStatus =
  | 'RECEIVED'
  | 'PROCESSING'
  | 'PROCESSED'
  | 'FAILED'
  | 'IGNORED';

export const WEBHOOK_PROCESSING_STATUSES: readonly WebhookProcessingStatus[] = [
  'RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED',
] as const;

export interface WebhookEvent {
  id: string;
  /** Filled once the event resolved to a tenant; null until then. */
  tenantId?: string;
  provider: string;
  /**
   * §42 — Razorpay's provider-specific equivalent: the SHA-256 hex of the
   * raw body (Razorpay webhooks carry no native event id).
   */
  providerEventId: string;
  /** The RAW provider event name (e.g. 'payment_link.paid') — operational. */
  eventType: string;
  receivedAt: Date;
  processedAt?: Date;
  processingStatus: WebhookProcessingStatus;
  payloadHash: string;
  errorMessage?: string;
}
