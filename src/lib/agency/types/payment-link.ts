/**
 * Agency Vertical — Types: payment links (Module 12, spec §33–§37, §53)
 *
 * CLIENT-SAFE: types and pure functions only. No server imports.
 *
 * The module's job (§34): an invoice may accumulate several links over its
 * life — one expired, one active, one cancelled — and that is NORMAL. The
 * invoice stays the financial document; a Payment Link is an EXTERNAL
 * collection mechanism. They are stored separately on purpose, and nothing
 * about a link ever mutates invoice money directly (the §41 loop runs
 * webhook → Payment → confirmPayment → §104 recompute).
 *
 * The rules encoded here:
 *   §33  the entity shape — provider-scoped ('RAZORPAY' in Phase 1), with
 *        the gateway's link id (providerLinkId) and the hosted checkout URL
 *        (shortUrl) the frontend is allowed to see.
 *   §36  the AMOUNT was resolved by the SERVER from the finalized invoice
 *        (total − settled) at creation time — a browser amount only ever
 *        NARROWS it (partial ≤ amountDue), never widens it.
 *   §37  default amount = the invoice's amount due; a partial link asks for
 *        less. The amount is frozen on the link (history is history).
 *   §53  the frontend receives shortUrl and public checkout information
 *        ONLY — never a key id, key secret or webhook secret. The entity
 *        carries none by construction; toPublicPaymentLink is the deliberate
 *        projection anyway.
 *   §46  link status moves only forward through the webhook lifecycle
 *        (CREATED → PARTIALLY_PAID → PAID, or CREATED → EXPIRED/CANCELLED);
 *        repeat events are idempotent status writes.
 */
import type { Money } from './money';

// ---------- status (§33) ----------

export type PaymentLinkStatus =
  | 'CREATED'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'EXPIRED'
  | 'CANCELLED';

export const PAYMENT_LINK_STATUSES: readonly PaymentLinkStatus[] = [
  'CREATED', 'PARTIALLY_PAID', 'PAID', 'EXPIRED', 'CANCELLED',
] as const;

/**
 * The link lifecycle. CREATED is the only entry point; PAID, EXPIRED and
 * CANCELLED are terminal. A partially-paid link may still be fully paid —
 * but once money moved, expiry/cancellation no longer applies (the gateway
 * itself refuses; we mirror that).
 */
export const PAYMENT_LINK_TRANSITIONS: Record<PaymentLinkStatus, PaymentLinkStatus[]> = {
  CREATED: ['PARTIALLY_PAID', 'PAID', 'EXPIRED', 'CANCELLED'],
  PARTIALLY_PAID: ['PAID'],
  PAID: [],
  EXPIRED: [],
  CANCELLED: [],
};

export function canTransitionPaymentLinkStatus(from: PaymentLinkStatus, to: PaymentLinkStatus): boolean {
  return PAYMENT_LINK_TRANSITIONS[from]?.includes(to) ?? false;
}

// ---------- entity (§33) ----------

export interface PaymentLink {
  id: string;
  tenantId: string;
  /** §34 — the link collects FOR this invoice; the invoice is untouched. */
  invoiceId: string;
  /** §32/§52 — the collection provider ('RAZORPAY' in Phase 1). */
  provider: 'RAZORPAY';
  /** The gateway's own link id (plink_…) — the webhook resolution key (§113). */
  providerLinkId: string;
  /** §53 — the hosted checkout URL. The ONLY gateway-facing value the UI sees. */
  shortUrl?: string;
  /** §36/§37 — the server-resolved collection amount, frozen at creation. */
  amount: Money;
  status: PaymentLinkStatus;
  /** §35 — when the link stops accepting payments (gateway-native expiry). */
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * §53 — the deliberate API projection. The entity holds no secrets by
 * construction, but the response shape is chosen explicitly so a future
 * field on the entity can never leak to the browser by accident.
 */
export interface PublicPaymentLink {
  id: string;
  invoiceId: string;
  provider: string;
  providerLinkId: string;
  shortUrl?: string;
  amount: Money;
  status: PaymentLinkStatus;
  expiresAt?: string;
  createdAt: string;
}

export function toPublicPaymentLink(link: PaymentLink): PublicPaymentLink {
  return {
    id: link.id,
    invoiceId: link.invoiceId,
    provider: link.provider,
    providerLinkId: link.providerLinkId,
    ...(link.shortUrl !== undefined && { shortUrl: link.shortUrl }),
    amount: link.amount,
    status: link.status,
    ...(link.expiresAt !== undefined && { expiresAt: link.expiresAt.toISOString() }),
    createdAt: link.createdAt.toISOString(),
  };
}

/** The repo write shape — the domain owns status; only it moves it. */
export type PaymentLinkUpdate = Partial<Omit<
  PaymentLink, 'id' | 'tenantId' | 'invoiceId' | 'provider' | 'providerLinkId'
  | 'amount' | 'createdAt' | 'updatedAt'
>>;
