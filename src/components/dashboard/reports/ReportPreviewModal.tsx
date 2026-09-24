"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ReportDocument, type ReportDocumentProps } from './ReportDocument';
import { downloadReportAsPdf } from '@/lib/agency/utils/pdfDownload';
import { 
  X, 
  Download, 
  Printer, 
  Loader2, 
  Check, 
  ZoomIn, 
  ZoomOut, 
  FileSpreadsheet, 
  ArrowLeft 
} from 'lucide-react';

export interface ReportPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentProps: ReportDocumentProps;
  filename?: string;
  onExportCsv?: () => void;
}

export function ReportPreviewModal({
  isOpen,
  onClose,
  documentProps,
  filename = `executive_financial_report_${new Date().toISOString().split('T')[0]}.pdf`,
  onExportCsv,
}: ReportPreviewModalProps) {
  const [mounted, setMounted] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(0.95);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleDownload = useCallback(async () => {
    const el = document.getElementById('report-document-root');
    if (!el || downloading) return;
    setDownloading(true);
    setDownloaded(false);

    try {
      await downloadReportAsPdf(el, filename);
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 3000);
    } catch (err) {
      console.error('Report PDF download error:', err);
    } finally {
      setDownloading(false);
    }
  }, [downloading, filename]);

  // Handle ESC key to dismiss
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) return null;

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Financial Report Document Preview"
      className="fixed inset-0 z-[99999] flex flex-col bg-black/95 backdrop-blur-md overflow-hidden animate-in fade-in duration-150"
    >
      {/* Modal Top Control Bar */}
      <div className="h-16 px-4 sm:px-6 bg-[#0c0c0c] border-b border-white/[0.1] flex items-center justify-between gap-4 shrink-0 no-print">
        {/* Left: Prominent Back Button & Report Title */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/[0.15] bg-white/[0.06] hover:bg-white/[0.12] text-white text-[12.5px] font-semibold transition-colors shrink-0 shadow-sm"
            title="Return to Reports dashboard (or press Esc)"
          >
            <ArrowLeft className="w-4 h-4 text-emerald-400" />
            <span>Back to Reports</span>
          </button>

          <div className="h-6 w-px bg-white/[0.1] hidden sm:block shrink-0" />

          <div className="min-w-0 hidden md:block">
            <h2 className="text-sm font-semibold text-white tracking-tight truncate">
              Financial Intelligence Report · Executive Preview
            </h2>
            <p className="text-[11px] text-neutral-400 truncate">
              Multi-page audit-grade document · Verified calculations &amp; compliance matrices
            </p>
          </div>
        </div>

        {/* Right: Action Controls */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          {/* Zoom controls */}
          <div className="hidden lg:flex items-center bg-white/[0.05] border border-white/[0.08] rounded-lg p-0.5">
            <button
              onClick={() => setZoomLevel(prev => Math.max(0.65, prev - 0.1))}
              className="p-1 text-neutral-400 hover:text-white transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-mono text-neutral-300 px-2 select-none">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              onClick={() => setZoomLevel(prev => Math.min(1.2, prev + 0.1))}
              className="p-1 text-neutral-400 hover:text-white transition-colors"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {onExportCsv && (
            <button
              onClick={onExportCsv}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.12] text-[12px] text-neutral-300 hover:text-white hover:bg-white/[0.05] transition-colors"
              title="Download raw rows in CSV"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> Export CSV
            </button>
          )}

          <button
            onClick={() => window.print()}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.12] text-[12px] text-neutral-300 hover:text-white hover:bg-white/[0.05] transition-colors"
            title="Open system print dialog"
          >
            <Printer className="w-3.5 h-3.5" /> Print
          </button>

          <button
            onClick={handleDownload}
            disabled={downloading}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-white text-black text-[12.5px] font-semibold hover:bg-neutral-200 disabled:opacity-60 transition-colors shadow-sm"
            title="Download crisp multi-page PDF"
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
                <Download className="w-4 h-4 text-neutral-900" />
                <span>Download PDF</span>
              </>
            )}
          </button>

          <button
            onClick={onClose}
            aria-label="Close preview modal"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-neutral-400 hover:text-white hover:bg-white/[0.08] rounded-lg transition-colors text-[12px]"
            title="Close Preview (Esc)"
          >
            <X className="w-4 h-4" />
            <span className="hidden sm:inline">Close</span>
          </button>
        </div>
      </div>

      {/* Floating Quick Exit Pill on Mobile / Scrolled View */}
      <div className="fixed bottom-6 left-6 z-20 no-print">
        <button
          onClick={onClose}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-neutral-900/95 border border-white/[0.2] text-white hover:bg-black shadow-2xl text-[12.5px] font-semibold transition-all hover:scale-105 backdrop-blur-md"
          title="Return to reports dashboard"
        >
          <ArrowLeft className="w-4 h-4 text-emerald-400" />
          <span>Back to Reports</span>
        </button>
      </div>

      {/* Scrollable Preview Canvas Body */}
      <div className="flex-1 overflow-y-auto overflow-x-auto p-4 sm:p-8 bg-[#141414] flex justify-center">
        <div
          style={{
            transform: `scale(${zoomLevel})`,
            transformOrigin: 'top center',
            transition: 'transform 0.15s ease-out',
          }}
          className="pb-24"
        >
          <ReportDocument {...documentProps} />
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
