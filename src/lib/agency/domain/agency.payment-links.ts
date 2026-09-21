/**
 * Agency Vertical — Domain: payment links (Module 12, spec §31–§37, §53, §55)
 *
 * The collection mechanism: a finalized Money OS invoice gets a hosted
 * Razorpay checkout link; the client pays; the webhook (gateway-webhook.ts)
 * turns that into a Payment through the NORMAL confirmPayment path. This
 * service owns only the LINK side — create, list, cancel.
 *
 * The rules enforced here:
 *   §34  the link is an EXTERNAL collection mechanism, stored separately
 *        from the invoice. Creating/cancelling links never touches invoice
 *        money — only a confirmed Payment (via the webhook) does.
 *   §36  THE SERVER RESOLVES THE AMOUNT. invoice.total − settled is computed
 *        here from the stored invoice and its payments, through the §104
 *        engine (payment-calculation.ts) — never from the request. A browser
 *        amount may only NARROW the collection (an explicit partial, §37);
 *        anything above the outstanding balance is a 400. A ₹1 link against
 *        a ₹100,000 invoice exists only as an explicit partial request, and
 *        the default is always the full amount due.
 *   §37  default amount = amountDue; partial = amount ≤ amountDue.
 *   §53  the API response carries shortUrl and public checkout info ONLY —
 *        no key id, no key secret, no webhook secret ever reaches a client
 *        (toPublicPaymentLink is the deliberate projection).
 *   §54  Credentials resolve tenant-first, env-fallback (Module 17 §15): a
 *        tenant with stored encrypted Razorpay credentials uses ITS pair;
 *        otherwise the deployment-level ENV configuration applies (the
 *        original Phase 1 posture); the gateway fails CLOSED (503) when
 *        neither exists.
 *   §113 the invoice is resolved against the CALLER's tenant — a missing
 *        invoice and another tenant's invoice are identical (404).
 *
 * Audit events (§115): PAYMENT_LINK_CREATED / PAYMENT_LINK_CANCELLED.
 */
import {
  getTenantById, getInvoiceById, getPayments, getClientById,
  getPaymentLinks, getPaymentLinkById, createPaymentLink as createPaymentLinkRepo,
  updatePaymentLink as updatePaymentLinkRepo,
} from '@/lib/db';
import type { Invoice } from '../types/invoice';
import type { PaymentLink } from '../types/payment-link';
import { canTransitionPaymentLinkStatus, toPublicPaymentLink } from '../types/payment-link';
import { makeMoney } from '../types/money';
import { invoiceAcceptsPayments } from '../types/payment';
import { calculatePaymentBalance } from './payment-calculation';
import { validatePaymentLinkCreate } from '../validators/payment-link';
import { razorpayGateway } from './razorpay-gateway';
import { tenantGatewayCredentials } from './agency.settings';
import { type AuditContext, type DomainResult } from './agency.clients';
import type { PaymentActor } from './agency.payments';

const notFound = (what: string): DomainResult<never> =>
  ({ ok: false, status: 404, error: `${what} not found` });

const badRequest = (error: string, code?: string): DomainResult<never> =>
  ({ ok: false, status: 400, error, ...(code && { code }) });

const conflict = (error: string, code?: string): DomainResult<never> =>
  ({ ok: false, status: 409, error, ...(code && { code }) });

// ---------- §35/§36/§37: create ----------

/**
 * Create a Razorpay payment link for one finalized invoice. The amount is
 * resolved HERE from the invoice's outstanding balance; the payload's
 * amount, when present, may only be a partial (≤ amountDue).
 */
export async function createInvoicePaymentLink(
  tenantId: string,
  actor: PaymentActor,
  invoiceId: string,
  payload: unknown,
  audit: AuditContext
): Promise<DomainResult<PaymentLink>> {
  const validated = validatePaymentLinkCreate((payload ?? {}) as Record<string, unknown>);
  if (!validated.ok) {
    return badRequest(validated.errors.map(e => `${e.field}: ${e.message}`).join('; '));
  }
  const v = validated.value;

  // §113 — the invoice must exist in THIS tenant.
  const invoice = await getInvoiceById(invoiceId, tenantId);
  if (!invoice) return notFound('Invoice');
  if (!invoiceAcceptsPayments(invoice.status)) {
    if (invoice.status === 'DRAFT') {
      return conflict('Finalize the invoice before collecting — a draft carries no number (§74)');
    }
    if (invoice.status === 'PAID') {
      return conflict('The invoice is already fully paid — there is nothing left to collect');
    }
    return conflict(`An invoice in state ${invoice.status} cannot be collected against`);
  }

  // §36 — THE SERVER resolves invoice.total − settled itself, through the
  // §104 engine. The browser's number is never the source of truth.
  const payments = await getPayments(tenantId, { invoiceId });
  const balance = calculatePaymentBalance(invoice.total, payments);
  const amountDue = balance.amountDue;
  if (amountDue.amount <= 0) {
    return conflict('The invoice has no outstanding balance to collect');
  }

  // §37 — default: the full amount due. A payload amount may only NARROW it.
  const amount = v.amount ?? amountDue.amount;
  if (amount > amountDue.amount) {
    return badRequest(
      `The payment link amount (${amount}) exceeds the invoice's outstanding balance (${amountDue.amount} ${amountDue.currency}) — the server resolves the amount itself; a request may only ask for a partial collection (§36/§37)`,
      'PAYMENT_LINK_AMOUNT_EXCEEDS_BALANCE'
    );
  }
  const money = makeMoney(amount, invoice.currency as 'INR');

  // Customer reference for the hosted checkout (§35) — from the STORED
  // client, never from the payload.
  const client = await getClientById(invoice.clientId, tenantId);
  const customerEmail = client?.billingProfile?.email ?? client?.email;

  // §111 — the gateway speaks only gateway. Failure is fail-closed (503 when
  // unconfigured) and touches no domain state. §15 (17.15) — this tenant's
  // decrypted credentials (when stored) ride along; the adapter falls back to
  // the env pair when they are absent.
  const credentials = tenantGatewayCredentials(await getTenantById(tenantId));
  const gatewayResult = await razorpayGateway.createPaymentLink({
    invoiceId: invoice.id!,
    ...(invoice.invoiceNumber != null && { invoiceNumber: invoice.invoiceNumber }),
    clientId: invoice.clientId,
    ...(client?.name !== undefined && { customerName: client.name }),
    ...(customerEmail !== undefined && { customerEmail }),
    amount: money,
    ...(v.description !== undefined && { description: v.description }),
    ...(v.expiresAt !== undefined && { expiresAt: v.expiresAt }),
  }, credentials);
  if (!gatewayResult.ok || !gatewayResult.data) {
    return {
      ok: false, status: gatewayResult.status, error: gatewayResult.error,
      ...(gatewayResult.code && { code: gatewayResult.code }),
    };
  }

  // §33/§34 — store the link SEPARATELY from the invoice; the invoice stays
  // the financial document.
  const link = await createPaymentLinkRepo(tenantId, {
    invoiceId: invoice.id!,
    provider: 'RAZORPAY',
    providerLinkId: gatewayResult.data.gatewayLinkId,
    shortUrl: gatewayResult.data.url,
    amount: money,
    ...(v.expiresAt !== undefined && { expiresAt: new Date(v.expiresAt) }),
  });

  await audit.log(
    'PAYMENT_LINK_CREATED',
    `Razorpay payment link ${link.providerLinkId} created for ${invoice.invoiceNumber ?? `invoice ${invoice.id}`} — collecting ${money.amount} ${money.currency} of ${amountDue.amount} outstanding (§37${amount < amountDue.amount ? ' — explicit partial' : ''}) by ${actor.userId}`
  );
  return { ok: true, status: 201, data: link };
}

// ---------- §55: list ----------

/** The invoice's link history (§34 — many links per invoice is normal). */
export async function listInvoicePaymentLinks(
  tenantId: string,
  invoiceId: string
): Promise<DomainResult<PaymentLink[]>> {
  const invoice = await getInvoiceById(invoiceId, tenantId);
  if (!invoice) return notFound('Invoice');
  const links = await getPaymentLinks(tenantId, invoiceId);
  return { ok: true, status: 200, data: links };
}

// ---------- §55: cancel ----------

/**
 * Cancel a payment link. Only a CREATED link can be cancelled (a link that
 * already moved money — PARTIALLY_PAID/PAID — or already ended cannot).
 * The gateway is cancelled FIRST (§46 repeat-safe); the stored status moves
 * only after the gateway accepted.
 */
export async function cancelPaymentLink(
  tenantId: string,
  actor: PaymentActor,
  linkId: string,
  audit: AuditContext
): Promise<DomainResult<PaymentLink>> {
  // §113 — a missing link and another tenant's link are identical.
  const link = await getPaymentLinkById(linkId, tenantId);
  if (!link) return notFound('Payment link');
  if (!canTransitionPaymentLinkStatus(link.status, 'CANCELLED')) {
    return conflict(`Only a CREATED link can be cancelled (current state: ${link.status} — money already moved or the link already ended)`);
  }

  // §15 (17.15) — tenant credentials first, env fallback inside the adapter.
  const credentials = tenantGatewayCredentials(await getTenantById(tenantId));
  const gatewayResult = await razorpayGateway.cancelPaymentLink(link.providerLinkId, credentials);
  if (!gatewayResult.ok) {
    return {
      ok: false, status: gatewayResult.status, error: gatewayResult.error,
      ...(gatewayResult.code && { code: gatewayResult.code }),
    };
  }

  const ok = await updatePaymentLinkRepo(link.id!, tenantId, { status: 'CANCELLED' });
  if (!ok) return notFound('Payment link');
  const updated = await getPaymentLinkById(link.id!, tenantId);

  await audit.log(
    'PAYMENT_LINK_CANCELLED',
    `Razorpay payment link ${link.providerLinkId} (${link.amount.amount} ${link.amount.currency}) for invoice ${link.invoiceId} cancelled by ${actor.userId}`
  );
  return { ok: true, status: 200, data: updated! };
}

// ---------- §53: the public projection ----------

export { toPublicPaymentLink };
export type { Invoice };
