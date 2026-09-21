"use client";

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, FileText, Check, X, Pencil, Send, IndianRupee, CreditCard, Copy, Download, Eye, Printer, Loader2 } from 'lucide-react';
import { useDashboardContext } from '@/components/dashboard/DashboardProvider';
import { tenantHasCapability } from '@/lib/agency/types/vertical';
import type { Invoice, InvoiceLine } from '@/lib/agency/types/invoice';
import type { Payment } from '@/lib/agency/types/payment';
import type { PublicPaymentLink } from '@/lib/agency/types/payment-link';
import type { PublicAgencySettings } from '@/lib/agency/types/agency-settings';
import { displayStatusFor, draftLabel, canTransitionInvoiceStatus } from '@/lib/agency/types/invoice';
import { InvoiceWizard } from '@/components/agency/invoices/InvoiceWizard';
import { InvoiceDocument, type InvoiceClientInfo } from '@/components/agency/invoices/InvoiceDocument';
import { InvoicePreviewModal } from '@/components/agency/invoices/InvoicePreviewModal';
import { confirmModal } from '@/components/ui/Dialog';
import { downloadInvoiceAsPdf } from '@/lib/agency/utils/pdfDownload';

/**
 * Invoice detail (Module 9 §85) — the invoice as a document: header, lines,
 * §76 tax lines and the §77 money pipeline, all as STORED by the engine.
 * Actions: finalize (§83) and void (§79) for admins; a DRAFT can be reopened
 * in the wizard (edit lines / tax). §80 — OVERDUE is derived for display.
 *
 * Module 12 (§35/§53) — online collection: “Collect online” creates a
 * gateway payment link for the balance due (amount resolved server-side,
 * §36); the links table shows each link's public projection (hosted URL,
 * frozen amount, lifecycle) with copy-to-share and CREATED-only cancel (§55).
 */
const STATUS_STYLE: Record<string, string> = {
  DRAFT: 'text-neutral-400 bg-white/[0.05]',
  SENT: 'text-sky-300 bg-sky-400/10',
  PARTIALLY_PAID: 'text-amber-300 bg-amber-400/10',
  PAID: 'text-emerald-300 bg-emerald-400/10',
  OVERDUE: 'text-red-300 bg-red-400/10',
  VOID: 'text-neutral-500 bg-white/[0.03] line-through',
};

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(d: string): string {
  try {
    return new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return d;
  }
}

function inr(n: number): string {
  return `₹${n.toLocaleString('en-IN')}`;
}

function minutesLabel(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return h > 0 ? (min > 0 ? `${h}h ${min}m` : `${h}h`) : `${min}m`;
}

interface DetailResponse {
  success: boolean;
  invoice: Invoice;
  lines: InvoiceLine[];
  clientName: string | null;
  projectName: string | null;
  client?: InvoiceClientInfo | null;
  settings?: PublicAgencySettings | null;
}

export default function InvoiceDetailPage() {
  const { tenant, user, loading: sessionLoading } = useDashboardContext();
  const allowed = tenantHasCapability(tenant, 'AGENCY_DASHBOARD');
  const canManage = user?.role === 'TENANT_ADMIN' || user?.role === 'SUPER_ADMIN';
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const invoiceId = params?.id;

  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentLinks, setPaymentLinks] = useState<PublicPaymentLink[]>([]);
  const [linkBusy, setLinkBusy] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadedPdf, setDownloadedPdf] = useState(false);

  const handleDownloadPDF = useCallback(async () => {
    if (!data) return;
    const element = document.getElementById('page-invoice-document');
    if (!element) return;
    const invNum = data.invoice.invoiceNumber || 'Draft_Invoice';
    const cName = (data.clientName || 'Client').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `${invNum}_${cName}.pdf`;

    setDownloadingPdf(true);
    try {
      await downloadInvoiceAsPdf(element, filename);
      setDownloadedPdf(true);
      setTimeout(() => setDownloadedPdf(false), 2500);
    } catch (err) {
      console.error('Failed to download PDF:', err);
      setNotice({ kind: 'error', text: 'Failed to generate PDF download. Please try again.' });
    } finally {
      setDownloadingPdf(false);
    }
  }, [data]);

  const load = useCallback(() => {
    if (sessionLoading || !allowed || !invoiceId) return;
    setLoading(true);
    fetch(`/api/agency/invoices/${invoiceId}`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('not found'))))
      .then((body: DetailResponse) => {
        setData(body);
        setError(null);
      })
      .catch(() => setError('We couldn\'t load this invoice. It may not exist or you may not have access.'))
      .finally(() => setLoading(false));
    // Module 10 (§104/§116) — the payments against this invoice, so the
    // balance due is verifiable against its payment history.
    fetch(`/api/agency/payments?invoiceId=${invoiceId}`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then(body => setPayments(body.payments || []))
      .catch(() => setPayments([]));
    // Module 12 (§35/§53) — the online-collection links for this invoice
    // (public projection only: shortUrl, never any gateway secret).
    fetch(`/api/agency/invoices/${invoiceId}/payment-links`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then(body => setPaymentLinks(body.paymentLinks || []))
      .catch(() => setPaymentLinks([]));
  }, [sessionLoading, allowed, invoiceId]);

  useEffect(() => {
    if (!sessionLoading && allowed) load();
  }, [load, sessionLoading, allowed]);

  async function postAction(action: 'finalize' | 'send' | 'void'): Promise<void> {
    if (!invoiceId) return;
    if (action === 'void') {
      const ok = await confirmModal({
        title: 'Void Invoice',
        message: 'Void this invoice? The billed items are released back to unbilled so they can be re-invoiced.',
        confirmText: 'Void Invoice',
        variant: 'danger',
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/agency/invoices/${invoiceId}/${action}`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({ kind: 'error', text: body.error || 'That action was rejected.' });
        return;
      }
      setNotice({
        kind: 'info',
        text: action === 'finalize'
          ? `Issued as ${body.invoice.invoiceNumber} — the billed items are locked INVOICED.`
          : action === 'send'
            ? 'Send recorded — the audit trail now shows this delivery (§81).'
            : 'Invoice voided — the billed items are back to unbilled.',
      });
      load();
    } catch {
      setNotice({ kind: 'error', text: 'Network error — please try again.' });
    } finally {
      setBusy(false);
    }
  }

  /**
   * Module 12 (§35/§36) — create an online-collection link for the balance
   * due. The amount is resolved SERVER-side (total − settled); the browser
   * never sends one. §54 fail-closed: when the gateway isn't configured the
   * API answers 503 and we surface that honestly — the button is never
   * silently disabled, and never pretends a link exists.
   */
  async function createPaymentLink(): Promise<void> {
    if (!invoiceId) return;
    setLinkBusy(true);
    try {
      const res = await fetch(`/api/agency/invoices/${invoiceId}/payment-link`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({ kind: 'error', text: body.error || 'The payment gateway refused to create a link.' });
        return;
      }
      const link: PublicPaymentLink = body.paymentLink;
      setNotice({
        kind: 'info',
        text: link.shortUrl
          ? `Payment link created for ${inr(link.amount.amount)} — share the URL below with the client.`
          : `Payment link created for ${inr(link.amount.amount)} (no hosted URL was returned).`,
      });
      load();
    } catch {
      setNotice({ kind: 'error', text: 'Network error — please try again.' });
    } finally {
      setLinkBusy(false);
    }
  }

  /** §55 — cancel a CREATED link (the gateway is called first; money-moved links refuse). */
  async function cancelPaymentLinkAction(linkId: string): Promise<void> {
    const ok = await confirmModal({
      title: 'Cancel Payment Link',
      message: 'Cancel this payment link? The client will no longer be able to pay through it.',
      confirmText: 'Cancel Link',
      variant: 'danger',
    });
    if (!ok) return;
    setLinkBusy(true);
    try {
      const res = await fetch(`/api/agency/payment-links/${linkId}/cancel`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({ kind: 'error', text: body.error || 'That link could not be cancelled.' });
        return;
      }
      setNotice({ kind: 'info', text: 'Payment link cancelled (§55 — cancelled at the gateway first, then here).' });
      load();
    } catch {
      setNotice({ kind: 'error', text: 'Network error — please try again.' });
    } finally {
      setLinkBusy(false);
    }
  }

  /** §53 — copy the hosted checkout URL (the only gateway-facing value we ever hold). */
  async function copyShortUrl(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      setNotice({ kind: 'info', text: 'Payment link URL copied — ready to share with the client.' });
    } catch {
      setNotice({ kind: 'error', text: 'Couldn\'t access the clipboard — copy the URL manually.' });
    }
  }

  if (!sessionLoading && !allowed) {
    return (
      <div className="p-6 max-w-md mx-auto text-center">
        <FileText className="w-8 h-8 mx-auto text-neutral-700" aria-hidden />
        <h1 className="mt-4 text-[16px] font-semibold text-white">Agency workspace required</h1>
        <Link href="/dashboard" className="mt-4 inline-block text-[13px] text-neutral-300 underline underline-offset-4">Go to the standard dashboard</Link>
      </div>
    );
  }

  if (sessionLoading || loading) {
    return (
      <div className="p-4 sm:p-6 space-y-4 w-full" aria-busy="true" aria-label="Loading invoice">
        <div className="h-24 rounded-xl bg-white/[0.03] animate-pulse" />
        <div className="h-48 rounded-xl bg-white/[0.03] animate-pulse" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 sm:p-6">
        <div role="alert" className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-6 max-w-lg">
          <h1 className="text-[15px] font-semibold text-white">Invoice not found</h1>
          <p className="mt-2 text-[13px] text-neutral-400">{error || 'This invoice doesn\'t exist in your workspace.'}</p>
          <Link href="/dashboard/agency/invoices" className="mt-4 inline-flex items-center gap-1.5 text-[13px] text-neutral-300 underline underline-offset-4">
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden /> Back to invoices
          </Link>
        </div>
      </div>
    );
  }

  const { invoice, lines, clientName, projectName } = data;
  const display = displayStatusFor(invoice, todayLocal());
  const label = invoice.invoiceNumber ?? draftLabel(invoice.id);

  return (
    <div className="space-y-6 w-full">
      {/* Interactive Screen Dashboard View */}
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 w-full max-w-none print:hidden">
        {/* Breadcrumb / Back & Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/dashboard/agency/invoices" className="inline-flex items-center gap-1.5 text-[12.5px] text-neutral-400 hover:text-white transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden /> Invoices
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadPDF}
              disabled={downloadingPdf}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-300 text-[12px] font-medium hover:bg-emerald-500/[0.15] hover:border-emerald-500/50 disabled:opacity-50 transition-colors shadow-sm"
              title="Download Invoice as PDF"
            >
              {downloadingPdf ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" aria-hidden /> Downloading...
                </>
              ) : downloadedPdf ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" aria-hidden /> Downloaded!
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5 text-emerald-400" aria-hidden /> Download PDF
                </>
              )}
            </button>
            <button
              onClick={() => setPreviewOpen(true)}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.08] text-[12px] text-neutral-300 hover:text-white hover:bg-white/[0.04] transition-colors"
              title="Preview formal invoice document"
            >
              <Eye className="w-3.5 h-3.5" aria-hidden /> Preview
            </button>
            <span className={`text-[11px] font-semibold tracking-wide uppercase px-2.5 py-1 rounded-full ${STATUS_STYLE[display]}`}>{display}</span>
            {display !== invoice.status && <span className="text-[10.5px] text-neutral-500">({invoice.status})</span>}
          </div>
        </div>

      {notice && (
        <div
          role="status"
          className={`flex items-start justify-between gap-3 rounded-xl border p-4 ${
            notice.kind === 'error' ? 'border-red-500/25 bg-red-500/[0.06]' : 'border-white/[0.08] bg-white/[0.02]'
          }`}
        >
          <p className={`text-[13px] ${notice.kind === 'error' ? 'text-red-300' : 'text-neutral-300'}`}>{notice.text}</p>
          <button onClick={() => setNotice(null)} aria-label="Dismiss" className="shrink-0 text-[12px] text-neutral-500 hover:text-white transition-colors">Dismiss</button>
        </div>
      )}

      {/* Main Responsive Grid: 8 Cols Left (Doc + Items), 4 Cols Right (Actions + Financials) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start w-full">
        {/* Left Column: Document Header, Line Items, Collections, History */}
        <div className="lg:col-span-8 space-y-6 min-w-0">
          {/* Header Card */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#050505] p-6 space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/[0.06] pb-4">
              <div>
                <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Invoice Number</span>
                <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mt-0.5">{label}</h1>
              </div>
              <div className="text-right">
                <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Total Amount</span>
                <div className="text-xl sm:text-2xl font-bold text-white tabular-nums mt-0.5">{inr(invoice.total.amount)}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-[12.5px]">
              <div>
                <span className="text-neutral-500 block text-[11px] uppercase tracking-wider">Client</span>
                <span className="text-neutral-200 font-medium truncate block mt-0.5">{clientName || 'Client'}</span>
              </div>
              <div>
                <span className="text-neutral-500 block text-[11px] uppercase tracking-wider">Project</span>
                <span className="text-neutral-200 font-medium truncate block mt-0.5">{projectName || 'Non-project'}</span>
              </div>
              <div>
                <span className="text-neutral-500 block text-[11px] uppercase tracking-wider">Issue Date</span>
                <span className="text-neutral-200 font-medium block mt-0.5">{formatDate(invoice.issueDate)}</span>
              </div>
              <div>
                <span className="text-neutral-500 block text-[11px] uppercase tracking-wider">Due Date</span>
                <span className={`font-medium block mt-0.5 ${display === 'OVERDUE' ? 'text-red-300 font-semibold' : 'text-neutral-200'}`}>{formatDate(invoice.dueDate)}</span>
              </div>
            </div>

            {(invoice.notes || invoice.terms) && (
              <div className="pt-3 border-t border-white/[0.05] space-y-1.5 text-[12.5px]">
                {invoice.notes && <p className="text-neutral-400"><span className="text-neutral-500 font-medium">Notes: </span>{invoice.notes}</p>}
                {invoice.terms && <p className="text-neutral-400"><span className="text-neutral-500 font-medium">Terms: </span>{invoice.terms}</p>}
              </div>
            )}
          </div>

          {/* Line Items Table */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#050505] overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
              <span className="text-[12px] font-semibold uppercase tracking-wider text-neutral-400">
                Billed Items ({lines.length})
              </span>
              <span className="text-[12px] text-neutral-500">Currency: <strong className="text-neutral-300">{invoice.currency}</strong></span>
            </div>
            {lines.length === 0 ? (
              <p className="p-8 text-center text-[13px] text-neutral-500">This draft invoice has no line items yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]" aria-label="Invoice lines">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-neutral-500 bg-white/[0.01]">
                      <th scope="col" className="px-5 py-3 font-medium">Type</th>
                      <th scope="col" className="px-5 py-3 font-medium">Description</th>
                      <th scope="col" className="px-5 py-3 font-medium text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map(l => (
                      <tr key={l.id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.01] transition-colors">
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-white/[0.05] text-neutral-300">
                            {l.type === 'MILESTONE' ? 'Milestone' : l.type === 'TIME' ? 'Time Log' : l.type === 'EXPENSE' ? 'Expense' : l.type}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-neutral-200">
                          <div className="font-medium text-white">{l.description}</div>
                          {l.quantity !== undefined && l.unitPrice && (
                            <div className="text-[11.5px] text-neutral-500 mt-0.5">{l.quantity} × {inr(l.unitPrice.amount)}</div>
                          )}
                          {l.metadata?.durationMinutes !== undefined && (
                            <div className="text-[11.5px] text-neutral-500 mt-0.5">{minutesLabel(Number(l.metadata.durationMinutes))}</div>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right font-medium text-white tabular-nums whitespace-nowrap">
                          {inr(l.amount.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Payment Links (§34/§53) */}
          {(paymentLinks.length > 0 || (canManage && invoice.amountDue.amount > 0
            && (invoice.status === 'SENT' || invoice.status === 'PARTIALLY_PAID' || invoice.status === 'OVERDUE'))) && (
            <div className="rounded-2xl border border-white/[0.08] bg-[#050505] overflow-hidden">
              <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
                <span className="text-[12px] font-semibold uppercase tracking-wider text-neutral-400">
                  Online Payment Links ({paymentLinks.length})
                </span>
                {canManage && invoice.amountDue.amount > 0 && (
                  <button
                    onClick={() => void createPaymentLink()}
                    disabled={busy || linkBusy}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border border-white/[0.1] text-[12px] text-neutral-200 hover:bg-white/[0.05] transition-colors"
                  >
                    <CreditCard className="w-3.5 h-3.5" aria-hidden /> New link
                  </button>
                )}
              </div>
              {paymentLinks.length === 0 ? (
                <p className="p-6 text-center text-[13px] text-neutral-500">
                  No online-collection links yet. Click “Collect online” to generate an instant payment link for this invoice.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]" aria-label="Invoice payment links">
                    <thead>
                      <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-neutral-500">
                        <th scope="col" className="px-5 py-2.5 font-medium">Created</th>
                        <th scope="col" className="px-5 py-2.5 font-medium">Gateway Ref</th>
                        <th scope="col" className="px-5 py-2.5 font-medium text-right">Amount</th>
                        <th scope="col" className="px-5 py-2.5 font-medium">Status</th>
                        <th scope="col" className="px-5 py-2.5 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentLinks.map(l => (
                        <tr key={l.id} className="border-b border-white/[0.04] last:border-0">
                          <td className="px-5 py-3 text-neutral-400 whitespace-nowrap">{formatDate(l.createdAt)}</td>
                          <td className="px-5 py-3 font-mono text-[11.5px] text-neutral-400">
                            {l.providerLinkId || 'Payment Link'}
                            {l.expiresAt && (
                              <div className="text-[10.5px] text-neutral-500">expires {formatDate(l.expiresAt)}</div>
                            )}
                          </td>
                          <td className="px-5 py-3 text-right text-neutral-200 tabular-nums whitespace-nowrap font-medium">{inr(l.amount.amount)}</td>
                          <td className="px-5 py-3">
                            <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${
                              l.status === 'PAID' ? 'text-emerald-300 bg-emerald-400/10'
                                : l.status === 'CREATED' ? 'text-sky-300 bg-sky-400/10'
                                  : l.status === 'CANCELLED' ? 'text-neutral-500 bg-white/[0.03] line-through'
                                    : 'text-neutral-500 bg-white/[0.03]'
                            }`}>{l.status}</span>
                          </td>
                          <td className="px-5 py-3 text-right whitespace-nowrap">
                            {l.shortUrl && (
                              <button
                                onClick={() => void copyShortUrl(l.shortUrl!)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[12px] text-neutral-300 hover:bg-white/[0.05] transition-colors"
                                title="Copy checkout URL"
                              >
                                <Copy className="w-3.5 h-3.5" aria-hidden /> Copy link
                              </button>
                            )}
                            {canManage && l.status === 'CREATED' && (
                              <button
                                onClick={() => void cancelPaymentLinkAction(l.id)}
                                disabled={linkBusy}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[12px] text-neutral-400 hover:text-red-400 hover:bg-white/[0.05] disabled:opacity-50 transition-colors ml-1"
                                title="Cancel at gateway"
                              >
                                <X className="w-3.5 h-3.5" aria-hidden /> Cancel
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Payment History (§104/§116) */}
          {payments.length > 0 && (
            <div className="rounded-2xl border border-white/[0.08] bg-[#050505] overflow-hidden">
              <div className="px-5 py-4 border-b border-white/[0.06] text-[12px] font-semibold uppercase tracking-wider text-neutral-400">
                Payment History ({payments.length})
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]" aria-label="Invoice payments">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-neutral-500">
                      <th scope="col" className="px-5 py-2.5 font-medium">Received</th>
                      <th scope="col" className="px-5 py-2.5 font-medium">Method</th>
                      <th scope="col" className="px-5 py-2.5 font-medium text-right">Amount</th>
                      <th scope="col" className="px-5 py-2.5 font-medium text-right">Withheld</th>
                      <th scope="col" className="px-5 py-2.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map(p => (
                      <tr key={p.id} className="border-b border-white/[0.04] last:border-0">
                        <td className="px-5 py-3 text-neutral-400 whitespace-nowrap">{formatDate(p.receivedAt)}</td>
                        <td className="px-5 py-3 text-neutral-300 font-medium">{p.method}</td>
                        <td className="px-5 py-3 text-right text-emerald-400 tabular-nums whitespace-nowrap font-medium">{inr(p.amount.amount)}</td>
                        <td className="px-5 py-3 text-right text-neutral-500 tabular-nums whitespace-nowrap">
                          {p.withholdingAmount && p.withholdingAmount.amount > 0 ? inr(p.withholdingAmount.amount) : '—'}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${
                            p.status === 'CONFIRMED' ? 'text-emerald-300 bg-emerald-400/10'
                              : p.status === 'PENDING' ? 'text-amber-300 bg-amber-400/10'
                                : p.status === 'REVERSED' ? 'text-red-300 bg-red-400/10'
                                  : 'text-neutral-500 bg-white/[0.03]'
                          }`}>{p.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Actions Sidebar & Financial Totals */}
        <div className="lg:col-span-4 space-y-6">
          {/* Action Center Card */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#050505] p-5 space-y-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 block">Actions</span>
            
            {/* Quick Export / Download as PDF */}
            <div className="space-y-2 pb-3 border-b border-white/[0.06]">
              <button
                onClick={handleDownloadPDF}
                disabled={downloadingPdf}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-300 text-[13px] font-semibold hover:bg-emerald-500/[0.15] hover:border-emerald-500/50 disabled:opacity-50 transition-colors shadow-sm"
              >
                {downloadingPdf ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-400" aria-hidden /> Generating PDF...
                  </>
                ) : downloadedPdf ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" aria-hidden /> Downloaded!
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 text-emerald-400" aria-hidden /> Download PDF
                  </>
                )}
              </button>
              <button
                onClick={() => setPreviewOpen(true)}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-white/[0.08] text-[12.5px] text-neutral-300 hover:bg-white/[0.04] transition-colors"
              >
                <Eye className="w-3.5 h-3.5" aria-hidden /> Preview PDF Document
              </button>
            </div>
              
            {canManage && (
              <>
                {invoice.status === 'DRAFT' && (
                  <div className="space-y-2">
                    <button
                      onClick={() => void postAction('finalize')}
                      disabled={busy || lines.length === 0}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white text-black text-[13px] font-semibold hover:bg-neutral-200 disabled:opacity-50 transition-colors shadow-sm"
                    >
                      <Check className="w-4 h-4" aria-hidden /> Finalize & issue
                    </button>
                    <button
                      onClick={() => setWizardOpen(true)}
                      disabled={busy}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-white/[0.1] text-[13px] text-neutral-300 hover:bg-white/[0.04] disabled:opacity-50 transition-colors"
                    >
                      <Pencil className="w-4 h-4" aria-hidden /> Edit draft
                    </button>
                  </div>
                )}

                {invoice.amountDue.amount > 0
                  && (invoice.status === 'SENT' || invoice.status === 'PARTIALLY_PAID' || invoice.status === 'OVERDUE') && (
                  <div className="space-y-2">
                    <button
                      onClick={() => router.push(`/dashboard/agency/payments?new=1&invoice=${invoice.id}`)}
                      disabled={busy}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white text-black text-[13px] font-semibold hover:bg-neutral-200 disabled:opacity-50 transition-colors shadow-sm"
                    >
                      <IndianRupee className="w-4 h-4" aria-hidden /> Record payment
                    </button>
                    <button
                      onClick={() => void createPaymentLink()}
                      disabled={busy || linkBusy}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-white/[0.1] text-[13px] text-neutral-200 hover:bg-white/[0.05] disabled:opacity-50 transition-colors"
                    >
                      <CreditCard className="w-4 h-4" aria-hidden /> Collect online
                    </button>
                  </div>
                )}

                {invoice.status !== 'DRAFT' && invoice.status !== 'VOID' && (
                  <button
                    onClick={() => void postAction('send')}
                    disabled={busy}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-white/[0.08] text-[13px] text-neutral-300 hover:bg-white/[0.04] disabled:opacity-50 transition-colors"
                  >
                    <Send className="w-4 h-4" aria-hidden /> Record send
                  </button>
                )}

                {canTransitionInvoiceStatus(invoice.status, 'VOID') && invoice.amountPaid.amount === 0 && (
                  <button
                    onClick={() => void postAction('void')}
                    disabled={busy}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-red-500/20 text-[13px] text-red-400 hover:bg-red-500/[0.08] disabled:opacity-50 transition-colors"
                  >
                    <X className="w-4 h-4" aria-hidden /> Void invoice
                  </button>
                )}
              </>
            )}
          </div>

          {/* Financial Breakdown Card */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#050505] p-5 space-y-3.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 block">Financial Summary</span>
            <div className="space-y-2 text-[13px]">
              <div className="flex justify-between text-neutral-400">
                <span>Subtotal</span>
                <span className="tabular-nums font-medium text-neutral-200">{inr(invoice.subtotal.amount)}</span>
              </div>
              {invoice.discount.amount > 0 && (
                <div className="flex justify-between text-emerald-400">
                  <span>Discount</span>
                  <span className="tabular-nums">−{inr(invoice.discount.amount)}</span>
                </div>
              )}
              <div className="flex justify-between text-neutral-400">
                <span>Taxable amount</span>
                <span className="tabular-nums text-neutral-300">{inr(invoice.subtotal.amount - invoice.discount.amount)}</span>
              </div>
              {invoice.taxLines.map(t => (
                <div key={t.name + t.rate} className="flex justify-between text-neutral-400">
                  <span>{t.name} @ {t.rate}%</span>
                  <span className="tabular-nums text-neutral-300">{inr(t.amount.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between text-neutral-400">
                <span>Tax total</span>
                <span className="tabular-nums text-neutral-300">{inr(invoice.taxTotal.amount)}</span>
              </div>
              <div className="flex justify-between text-[15px] font-semibold text-white pt-2.5 border-t border-white/[0.08]">
                <span>Total</span>
                <span className="tabular-nums">{inr(invoice.total.amount)}</span>
              </div>
              {invoice.amountPaid.amount > 0 && (
                <div className="flex justify-between text-emerald-400 font-medium">
                  <span>Paid</span>
                  <span className="tabular-nums">−{inr(invoice.amountPaid.amount)}</span>
                </div>
              )}
              <div className="flex justify-between items-baseline pt-2 border-t border-white/[0.08]">
                <span className="text-[13px] font-medium text-neutral-300">Balance due</span>
                <span className={`text-[17px] font-bold tabular-nums ${invoice.amountDue.amount > 0 ? 'text-white' : 'text-emerald-400'}`}>
                  {inr(invoice.amountDue.amount)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {invoice.status === 'DRAFT' && (
        <InvoiceWizard
          isOpen={wizardOpen}
          onClose={() => setWizardOpen(false)}
          editingId={invoice.id}
          onChanged={load}
        />
      )}
      </div>

      {/* ── HIGH RESOLUTION INVOICE DOCUMENT (OFF-SCREEN FOR PDF CAPTURE / PRINT) ── */}
      <div
        id="page-invoice-document"
        className="fixed -left-[9999px] top-0 pointer-events-none print:static print:left-auto print:block print:m-0 print:p-0"
        aria-hidden="true"
      >
        <InvoiceDocument
          invoice={invoice}
          lines={lines}
          clientName={clientName}
          projectName={projectName}
          client={data?.client}
          settings={data?.settings}
          paymentLinks={paymentLinks}
          payments={payments}
          tenantName={tenant?.name || 'Money OS'}
        />
      </div>

      {/* ── INTERACTIVE ON-SCREEN PREVIEW MODAL ── */}
      <InvoicePreviewModal
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        invoice={invoice}
        lines={lines}
        clientName={clientName}
        projectName={projectName}
        client={data?.client}
        settings={data?.settings}
        paymentLinks={paymentLinks}
        payments={payments}
        tenantName={tenant?.name || 'Money OS'}
      />
    </div>
  );
}
