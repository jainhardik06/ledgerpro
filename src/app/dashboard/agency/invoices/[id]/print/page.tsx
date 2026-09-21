"use client";

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useDashboardContext } from '@/components/dashboard/DashboardProvider';
import { InvoiceDocument, type InvoiceClientInfo } from '@/components/agency/invoices/InvoiceDocument';
import type { Invoice, InvoiceLine } from '@/lib/agency/types/invoice';
import type { Payment } from '@/lib/agency/types/payment';
import type { PublicPaymentLink } from '@/lib/agency/types/payment-link';
import type { PublicAgencySettings } from '@/lib/agency/types/agency-settings';
import { downloadInvoiceAsPdf } from '@/lib/agency/utils/pdfDownload';
import { ArrowLeft, Download, Loader2, Check, Printer } from 'lucide-react';

interface InvoiceDetailResponse {
  success: boolean;
  invoice: Invoice;
  lines: InvoiceLine[];
  clientName: string | null;
  projectName: string | null;
  client?: InvoiceClientInfo | null;
  settings?: PublicAgencySettings | null;
}

export default function InvoicePrintPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const invoiceId = params?.id;
  const { tenant } = useDashboardContext();

  const [data, setData] = useState<InvoiceDetailResponse | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentLinks, setPaymentLinks] = useState<PublicPaymentLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadedPdf, setDownloadedPdf] = useState(false);

  const documentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!invoiceId) return;
    setLoading(true);

    Promise.all([
      fetch(`/api/agency/invoices/${invoiceId}`).then(r => r.ok ? r.json() : Promise.reject(new Error('Failed'))),
      fetch(`/api/agency/payments?invoiceId=${invoiceId}`).then(r => r.ok ? r.json() : { payments: [] }).catch(() => ({ payments: [] })),
      fetch(`/api/agency/invoices/${invoiceId}/payment-links`).then(r => r.ok ? r.json() : { links: [] }).catch(() => ({ links: [] })),
    ])
      .then(([invData, payData, linkData]) => {
        setData(invData);
        setPayments(payData.payments || []);
        setPaymentLinks(linkData.links || []);
      })
      .catch(() => setError('Could not load invoice data.'))
      .finally(() => setLoading(false));
  }, [invoiceId]);

  const handleDownloadPDF = useCallback(async () => {
    if (!data) return;
    const element = documentRef.current || document.getElementById('print-invoice-document');
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
    } finally {
      setDownloadingPdf(false);
    }
  }, [data]);

  const handlePrint = useCallback(() => {
    if (!data) return;
    const originalTitle = document.title;
    const invNum = data.invoice.invoiceNumber || 'Invoice';
    const cName = (data.clientName || 'Client').replace(/[^a-zA-Z0-9_-]/g, '_');
    document.title = `${invNum}_${cName}`;

    window.print();

    setTimeout(() => {
      document.title = originalTitle;
    }, 1000);
  }, [data]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center text-neutral-400 gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-white" />
        <span className="text-sm font-medium">Loading document...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-xl font-bold text-white">Unable to generate invoice</h1>
        <p className="mt-2 text-sm text-neutral-400">{error || 'Invoice not found.'}</p>
        <button
          onClick={() => router.back()}
          className="mt-4 px-4 py-2 bg-white text-black rounded-xl text-sm font-medium hover:bg-neutral-200 transition-colors"
        >
          Go Back
        </button>
      </div>
    );
  }

  const { invoice, lines, clientName, projectName, client, settings } = data;

  return (
    <div className="min-h-screen bg-neutral-900 print:bg-white text-neutral-900">
      {/* Floating Toolbar (Hidden on print) */}
      <div className="sticky top-0 z-50 bg-[#0a0a0a]/95 backdrop-blur border-b border-white/[0.08] text-white px-4 sm:px-6 py-3 shadow-lg flex items-center justify-between no-print">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to invoice
        </button>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={handleDownloadPDF}
            disabled={downloadingPdf}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-semibold disabled:opacity-50 transition-colors shadow-sm"
          >
            {downloadingPdf ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Generating PDF...
              </>
            ) : downloadedPdf ? (
              <>
                <Check className="w-4 h-4" /> Downloaded!
              </>
            ) : (
              <>
                <Download className="w-4 h-4" /> Download PDF
              </>
            )}
          </button>
          <button
            onClick={handlePrint}
            title="Open browser print dialog"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/[0.1] bg-white/[0.04] text-xs text-neutral-300 hover:text-white hover:bg-white/[0.08] transition-colors"
          >
            <Printer className="w-4 h-4" /> Print
          </button>
        </div>
      </div>

      {/* Sheet Canvas */}
      <div className="py-6 sm:py-10 px-4 flex justify-center print:p-0">
        <div ref={documentRef} id="print-invoice-document" className="bg-white shadow-2xl rounded-sm">
          <InvoiceDocument
            invoice={invoice}
            lines={lines}
            clientName={clientName}
            projectName={projectName}
            client={client}
            settings={settings}
            paymentLinks={paymentLinks}
            payments={payments}
            tenantName={tenant?.name || 'Money OS'}
          />
        </div>
      </div>
    </div>
  );
}
