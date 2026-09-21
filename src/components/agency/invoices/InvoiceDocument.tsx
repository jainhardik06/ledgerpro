"use client";

import React from 'react';
import type { Invoice, InvoiceLine } from '@/lib/agency/types/invoice';
import type { Payment } from '@/lib/agency/types/payment';
import type { PublicPaymentLink } from '@/lib/agency/types/payment-link';
import type { PublicAgencySettings } from '@/lib/agency/types/agency-settings';
import { displayStatusFor, draftLabel } from '@/lib/agency/types/invoice';
import { amountToWords } from '@/lib/agency/utils/formatWords';

export interface InvoiceClientInfo {
  id?: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  taxId?: string;
  legalName?: string;
  state?: string;
  gstin?: string;
}

export interface InvoiceDocumentProps {
  invoice: Invoice;
  lines: InvoiceLine[];
  clientName: string | null;
  projectName: string | null;
  client?: InvoiceClientInfo | null;
  settings?: PublicAgencySettings | null;
  paymentLinks?: PublicPaymentLink[];
  payments?: Payment[];
  className?: string;
  tenantName?: string;
}

function formatDate(d: string): string {
  try {
    return new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return d;
  }
}

function inr(n: number): string {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function InvoiceDocument({
  invoice,
  lines,
  clientName,
  projectName,
  client,
  settings,
  paymentLinks = [],
  className = '',
  tenantName,
}: InvoiceDocumentProps) {
  const today = new Date().toISOString().slice(0, 10);
  const displayStatus = displayStatusFor(invoice, today);
  const invoiceNumberLabel = invoice.invoiceNumber ?? draftLabel(invoice.id);

  // Agency Profile - completely dynamic and white-labeled
  const rawTaxSettings = settings?.tax as Record<string, unknown> | undefined;
  const agencyName = invoice.complianceSnapshot?.supplier?.legalName
    || settings?.general.agencyName
    || tenantName
    || 'Money OS';
  
  const agencyGstin = invoice.complianceSnapshot?.supplier?.taxIdentifiers?.find(t => t.type === 'GSTIN')?.value
    || (rawTaxSettings?.gstin as string | undefined);

  const agencyState = invoice.complianceSnapshot?.supplier?.state
    || (rawTaxSettings?.stateJurisdiction as string | undefined)
    || invoice.placeOfSupply?.stateOrRegion
    || '';

  const agencyAddress = invoice.complianceSnapshot?.supplier?.address || '';
  const agencyLogo = settings?.general.logoUrl;
  const defaultSac = settings?.tax.defaultSacCode || '998311';

  // Client Profile
  const clientDisplayName = client?.legalName || client?.name || clientName || 'Valued Client';
  const clientAddress = client?.address || invoice.complianceSnapshot?.recipient?.address;
  const clientEmail = client?.email;
  const clientPhone = client?.phone;
  const clientGstin = client?.gstin
    || client?.taxId
    || invoice.complianceSnapshot?.recipient?.taxIdentifiers?.find(t => t.type === 'GSTIN')?.value;
  const clientState = client?.state || invoice.complianceSnapshot?.recipient?.state || '';

  // Words
  const amountWords = amountToWords(invoice.total.amount, invoice.currency);

  // Active online collection link
  const activeLink = paymentLinks.find(l => l.status === 'CREATED' && l.shortUrl);

  const isTaxInvoice = Boolean(invoice.invoiceNumber && (agencyGstin || invoice.taxTotal.amount > 0));
  const taxableAmount = invoice.subtotal.amount - invoice.discount.amount;

  return (
    <div
      id="invoice-document"
      className={`bg-white text-neutral-900 font-sans p-6 sm:p-10 w-full max-w-[800px] mx-auto border border-neutral-300 shadow-sm print:shadow-none print:border print:p-6 print:m-0 print:max-w-none print:w-full select-text leading-tight ${className}`}
      style={{ minHeight: '1050px', backgroundColor: '#ffffff' }}
    >
      {/* ── TRADITIONAL DOCUMENT HEADER ── */}
      <div className="border border-neutral-800">
        {/* Title Bar */}
        <div className="bg-neutral-100 border-b border-neutral-800 px-4 py-2 flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-600">
            {isTaxInvoice ? 'TAX INVOICE' : 'COMMERCIAL INVOICE'}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium">
            (Original For Recipient)
          </span>
        </div>

        {/* 2-Column Master Header Grid */}
        <div className="grid grid-cols-12 divide-x divide-neutral-800 text-[12px]">
          {/* Supplier / Agency (Left Column - 7 cols) */}
          <div className="col-span-7 p-4 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-neutral-950 uppercase tracking-tight">
                  {agencyName}
                </h1>
                {agencyAddress && (
                  <div className="text-neutral-600 text-[11.5px] mt-0.5 leading-snug whitespace-pre-line">
                    {agencyAddress}
                  </div>
                )}
                {agencyState && (
                  <div className="text-neutral-700 text-[11.5px]">
                    State / Jurisdiction: <strong className="text-neutral-900">{agencyState}</strong>
                  </div>
                )}
                {agencyGstin && (
                  <div className="text-[12px] font-mono text-neutral-900 font-semibold mt-1">
                    GSTIN: <span className="font-bold">{agencyGstin}</span>
                  </div>
                )}
              </div>
              {agencyLogo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={agencyLogo} alt={agencyName} className="h-10 max-w-[120px] object-contain shrink-0" />
              )}
            </div>
          </div>

          {/* Invoice Meta Grid (Right Column - 5 cols) */}
          <div className="col-span-5 divide-y divide-neutral-300 text-[11.5px]">
            <div className="p-2.5 flex justify-between bg-neutral-50/50">
              <span className="text-neutral-500 font-medium">Invoice No.:</span>
              <strong className="font-mono text-neutral-950 text-[12.5px]">{invoiceNumberLabel}</strong>
            </div>
            <div className="p-2.5 flex justify-between">
              <span className="text-neutral-500 font-medium">Invoice Date:</span>
              <strong className="text-neutral-900">{formatDate(invoice.issueDate)}</strong>
            </div>
            <div className="p-2.5 flex justify-between">
              <span className="text-neutral-500 font-medium">Payment Due:</span>
              <strong className={displayStatus === 'OVERDUE' ? 'text-red-700 font-bold' : 'text-neutral-900'}>
                {formatDate(invoice.dueDate)}
              </strong>
            </div>
            <div className="p-2.5 flex justify-between">
              <span className="text-neutral-500 font-medium">Place of Supply:</span>
              <span className="text-neutral-900 font-semibold">{clientState || agencyState || 'Interstate'}</span>
            </div>
            <div className="p-2.5 flex justify-between">
              <span className="text-neutral-500 font-medium">Status:</span>
              <span className="font-bold uppercase tracking-wider text-[11px]"
                style={{
                  color: displayStatus === 'PAID' ? '#047857' : displayStatus === 'OVERDUE' ? '#b91c1c' : '#0369a1',
                }}
              >
                {displayStatus}
              </span>
            </div>
          </div>
        </div>

        {/* Billed To / Buyer Box (Full Width Row) */}
        <div className="border-t border-neutral-800 p-4 bg-neutral-50/30 text-[12px]">
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-7 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block">
                Buyer / Billed To:
              </span>
              <div className="text-[14px] font-bold text-neutral-950">
                {clientDisplayName}
              </div>
              {clientAddress && (
                <div className="text-neutral-600 text-[11.5px] leading-snug whitespace-pre-line">
                  {clientAddress}
                </div>
              )}
              {clientGstin && (
                <div className="font-mono text-neutral-900 font-semibold text-[11.5px]">
                  GSTIN / Unique ID: <span className="font-bold">{clientGstin}</span>
                </div>
              )}
              {clientEmail && (
                <div className="text-neutral-500 text-[11px]">Email: {clientEmail}</div>
              )}
              {clientPhone && (
                <div className="text-neutral-500 text-[11px]">Phone: {clientPhone}</div>
              )}
            </div>

            <div className="col-span-5 pl-4 border-l border-neutral-200 space-y-1 text-[11.5px]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block">
                Project &amp; Commercial Terms:
              </span>
              <div className="flex justify-between py-0.5">
                <span className="text-neutral-500">Project Reference:</span>
                <span className="font-semibold text-neutral-900">{projectName || 'General Services'}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="text-neutral-500">Payment Terms:</span>
                <span className="font-medium text-neutral-800">
                  {invoice.terms || (settings?.billing.paymentTermsDays ? `Net ${settings.billing.paymentTermsDays} Days` : 'Due Upon Receipt')}
                </span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="text-neutral-500">Currency:</span>
                <span className="font-semibold text-neutral-900">{invoice.currency} (₹)</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── TRADITIONAL BORDERED LINE ITEMS TABLE ── */}
        <div className="border-t border-neutral-800">
          <table className="w-full text-[12px] border-collapse" aria-label="Invoice Line Items">
            <thead>
              <tr className="border-b border-neutral-800 bg-neutral-100 text-[11px] font-bold uppercase tracking-wider text-neutral-800">
                <th scope="col" className="py-2.5 px-3 text-center border-r border-neutral-800 w-12">S.No.</th>
                <th scope="col" className="py-2.5 px-3 text-left border-r border-neutral-800">Description of Goods / Services</th>
                <th scope="col" className="py-2.5 px-3 text-center border-r border-neutral-800 w-24">HSN / SAC</th>
                <th scope="col" className="py-2.5 px-3 text-center border-r border-neutral-800 w-20">Qty</th>
                <th scope="col" className="py-2.5 px-3 text-right border-r border-neutral-800 w-28">Rate (₹)</th>
                <th scope="col" className="py-2.5 px-3 text-right w-32">Amount (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-neutral-400 italic">
                    No line items specified.
                  </td>
                </tr>
              ) : (
                lines.map((l, index) => {
                  const sac = l.classification?.code || defaultSac;
                  const isTime = l.type === 'TIME';
                  const isMilestone = l.type === 'MILESTONE';
                  const isExpense = l.type === 'EXPENSE';

                  return (
                    <tr key={l.id} className="align-top">
                      <td className="py-3 px-3 text-center font-mono text-[11px] text-neutral-500 border-r border-neutral-300">
                        {index + 1}
                      </td>
                      <td className="py-3 px-3 border-r border-neutral-300">
                        <div className="font-semibold text-neutral-950 text-[12.5px] leading-snug">
                          {l.description}
                        </div>
                        <div className="text-[10.5px] text-neutral-500 mt-0.5">
                          {isMilestone ? 'Deliverable / Milestone' : isTime ? 'Hourly Billable Service' : isExpense ? 'Billable Expense' : l.type}
                          {l.metadata?.durationMinutes !== undefined && ` · ${Math.round(Number(l.metadata.durationMinutes) / 60 * 10) / 10} hrs`}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center font-mono text-[11px] text-neutral-600 border-r border-neutral-300">
                        {sac}
                      </td>
                      <td className="py-3 px-3 text-center text-neutral-800 font-medium border-r border-neutral-300">
                        {l.quantity !== undefined ? l.quantity : '1'}
                      </td>
                      <td className="py-3 px-3 text-right text-neutral-800 tabular-nums border-r border-neutral-300">
                        {l.unitPrice ? inr(l.unitPrice.amount).replace('₹', '') : inr(l.amount.amount).replace('₹', '')}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-neutral-950 tabular-nums">
                        {inr(l.amount.amount).replace('₹', '')}
                      </td>
                    </tr>
                  );
                })
              )}

              {/* Blank Fill Rows for Traditional Aesthetic (if <= 3 items) */}
              {lines.length <= 2 && (
                <tr className="h-16">
                  <td className="border-r border-neutral-300" />
                  <td className="border-r border-neutral-300" />
                  <td className="border-r border-neutral-300" />
                  <td className="border-r border-neutral-300" />
                  <td className="border-r border-neutral-300" />
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── TOTALS & TAX BREAKDOWN ── */}
        <div className="border-t border-neutral-800 grid grid-cols-12 divide-x divide-neutral-800">
          {/* Left Summary: Words & Bank Advice (7 cols) */}
          <div className="col-span-7 p-4 space-y-4 text-[11.5px]">
            {/* Amount in words */}
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block mb-0.5">
                Amount Chargeable (in words):
              </span>
              <div className="font-semibold text-neutral-950 italic text-[12px] leading-snug">
                {amountWords}
              </div>
            </div>

            {/* Bank Particulars */}
            <div className="p-3 bg-neutral-50 border border-neutral-200 rounded space-y-1.5 text-[11px]">
              <span className="font-bold uppercase tracking-wider text-neutral-700 block text-[10px]">
                Remittance Particulars
              </span>
              <div className="text-neutral-700">
                Please remit payment in favor of <strong>{agencyName}</strong> referencing invoice <strong>{invoiceNumberLabel}</strong>.
              </div>
              {activeLink && (
                <div className="pt-1.5 border-t border-neutral-200 flex items-center justify-between gap-2">
                  <span className="text-neutral-600 font-medium">Online Payment Gateway:</span>
                  <a
                    href={activeLink.shortUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-blue-700 underline font-medium text-[11px]"
                  >
                    {activeLink.shortUrl}
                  </a>
                </div>
              )}
            </div>

            {/* Notes */}
            {invoice.notes && (
              <div className="text-[11px] text-neutral-600">
                <strong>Remarks / Notes: </strong>
                <span>{invoice.notes}</span>
              </div>
            )}
          </div>

          {/* Right Calculations Grid (5 cols) */}
          <div className="col-span-5 divide-y divide-neutral-200 text-[11.5px]">
            <div className="p-2.5 flex justify-between">
              <span className="text-neutral-600">Subtotal:</span>
              <span className="font-mono text-neutral-900 tabular-nums">{inr(invoice.subtotal.amount)}</span>
            </div>

            {invoice.discount.amount > 0 && (
              <div className="p-2.5 flex justify-between text-neutral-700">
                <span>Discount:</span>
                <span className="font-mono tabular-nums">−{inr(invoice.discount.amount)}</span>
              </div>
            )}

            <div className="p-2.5 flex justify-between bg-neutral-50/50">
              <span className="text-neutral-700 font-medium">Taxable Value:</span>
              <span className="font-mono font-medium text-neutral-950 tabular-nums">{inr(taxableAmount)}</span>
            </div>

            {/* Itemized Taxes */}
            {invoice.taxLines && invoice.taxLines.length > 0 ? (
              invoice.taxLines.map((tax, idx) => (
                <div key={idx} className="p-2.5 flex justify-between text-neutral-700">
                  <span>{tax.name} ({tax.rate}%):</span>
                  <span className="font-mono tabular-nums text-neutral-900">{inr(tax.amount.amount)}</span>
                </div>
              ))
            ) : (
              <div className="p-2.5 flex justify-between text-neutral-500">
                <span>Tax (GST 0% / Nil):</span>
                <span className="font-mono tabular-nums">{inr(0)}</span>
              </div>
            )}

            {/* Big Grand Total */}
            <div className="p-3 bg-neutral-100 flex items-baseline justify-between border-t-2 border-neutral-900">
              <span className="text-[12px] font-bold uppercase tracking-wider text-neutral-950">
                Invoice Total:
              </span>
              <strong className="font-mono text-base font-black text-neutral-950 tabular-nums">
                {inr(invoice.total.amount)}
              </strong>
            </div>

            {/* Paid / Due */}
            {invoice.amountPaid.amount > 0 && (
              <div className="p-2.5 flex justify-between text-neutral-700">
                <span>Amount Paid:</span>
                <span className="font-mono font-medium tabular-nums text-emerald-700">−{inr(invoice.amountPaid.amount)}</span>
              </div>
            )}

            <div className="p-2.5 flex justify-between bg-neutral-50 font-bold border-t border-neutral-300">
              <span className="text-neutral-900">Balance Due:</span>
              <span className={`font-mono text-[13px] tabular-nums ${invoice.amountDue.amount > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                {inr(invoice.amountDue.amount)}
              </span>
            </div>
          </div>
        </div>

        {/* ── DECLARATION & SIGNATORY (BOTTOM BOX) ── */}
        <div className="border-t border-neutral-800 grid grid-cols-12 divide-x divide-neutral-800 text-[11px]">
          {/* Statutory Declaration */}
          <div className="col-span-7 p-4 space-y-1 text-neutral-600 leading-relaxed">
            <span className="font-bold uppercase tracking-wider text-neutral-700 block text-[10px]">
              Declaration
            </span>
            <p>
              We declare that this invoice shows the actual price of the goods or services described and that all particulars are true and correct.
            </p>
          </div>

          {/* Authorised Signatory */}
          <div className="col-span-5 p-4 flex flex-col justify-between items-center text-center">
            <div className="text-[11px] font-bold text-neutral-900">
              For {agencyName}
            </div>
            <div className="w-36 border-b border-neutral-600 mt-12 mb-1" />
            <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-700">
              Authorised Signatory
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
