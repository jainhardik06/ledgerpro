"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { InvoiceDocument, type InvoiceClientInfo } from './InvoiceDocument';
import type { Invoice, InvoiceLine } from '@/lib/agency/types/invoice';
import type { Payment } from '@/lib/agency/types/payment';
import type { PublicPaymentLink } from '@/lib/agency/types/payment-link';
import type { PublicAgencySettings } from '@/lib/agency/types/agency-settings';
import { downloadInvoiceAsPdf } from '@/lib/agency/utils/pdfDownload';
import { X, Download, ExternalLink, Loader2, Check } from 'lucide-react';

export interface InvoicePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice;
  lines: InvoiceLine[];
  clientName: string | null;
  projectName: string | null;
  client?: InvoiceClientInfo | null;
  settings?: PublicAgencySettings | null;
  paymentLinks?: PublicPaymentLink[];
  payments?: Payment[];
  tenantName?: string;
}

export function InvoicePreviewModal({
  isOpen,
  onClose,
  invoice,
  lines,
  clientName,
  projectName,
  client,
  settings,
  paymentLinks,
  payments,
  tenantName,
}: InvoicePreviewModalProps) {
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const handleDownload = useCallback(async () => {
    const el = document.getElementById('invoice-document');
    if (!el || downloading) return;
    setDownloading(true);
    setDownloaded(false);

    try {
      const invNum = invoice.invoiceNumber || 'Invoice';
      const cName = (clientName || 'Client').replace(/[^a-zA-Z0-9_-]/g, '_');
      await downloadInvoiceAsPdf(el, `${invNum}_${cName}.pdf`);
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 3000);
    } catch (err) {
      console.error('PDF download error:', err);
    } finally {
      setDownloading(false);
    }
  }, [invoice.invoiceNumber, clientName, downloading]);

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Invoice Document Preview"
      className="fixed inset-0 z-[100] flex flex-col bg-black/85 backdrop-blur-md overflow-hidden animate-in fade-in duration-200"
    >
      {/* Modal Top Control Bar */}
      <div className="h-16 px-4 sm:px-6 bg-[#0c0c0c] border-b border-white/[0.1] flex items-center justify-between gap-4 shrink-0 no-print">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-mono text-xs font-bold">
            PDF
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white tracking-tight">
              {invoice.invoiceNumber || 'Draft Invoice'} · Document Preview
            </h2>
            <p className="text-[11px] text-neutral-400">
              Traditional enterprise structure · Direct A4 PDF export
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          <a
            href={`/dashboard/agency/invoices/${invoice.id}/print`}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.12] text-[12px] text-neutral-300 hover:text-white hover:bg-white/[0.05] transition-colors"
            title="Open in standalone tab"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Standalone View
          </a>

          <button
            onClick={handleDownload}
            disabled={downloading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-black text-[13px] font-semibold hover:bg-neutral-200 disabled:opacity-60 transition-colors shadow-sm"
            title="Download PDF File directly to your computer"
          >
            {downloading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-neutral-700" />
                <span>Generating PDF...</span>
              </>
            ) : downloaded ? (
              <>
                <Check className="w-4 h-4 text-emerald-600" />
                <span>Downloaded!</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4 text-emerald-600" />
                <span>Download PDF</span>
              </>
            )}
          </button>

          <button
            onClick={onClose}
            aria-label="Close Preview"
            className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Scrollable Canvas for A4 Document */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-8 flex justify-center bg-[#141414] print:bg-white print:p-0 print:overflow-visible">
        <div className="w-full max-w-[800px] print:w-full print:max-w-none">
          <InvoiceDocument
            invoice={invoice}
            lines={lines}
            clientName={clientName}
            projectName={projectName}
            client={client}
            settings={settings}
            paymentLinks={paymentLinks}
            payments={payments}
            tenantName={tenantName}
          />
        </div>
      </div>
    </div>
  );
}
