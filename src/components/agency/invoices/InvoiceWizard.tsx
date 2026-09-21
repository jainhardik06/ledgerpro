"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { X, Plus, Trash2, ArrowRight, ArrowLeft, FileText, Check } from 'lucide-react';
import type { Invoice, InvoiceLine, InvoiceLineType, InvoiceStatus } from '@/lib/agency/types/invoice';
import { draftLabel } from '@/lib/agency/types/invoice';
import { Select } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';

/**
 * Invoice drawer/wizard (Module 9 §67/§68) — the ONE draft-composition
 * surface. Four honest steps mirroring the spec's flow:
 *
 *   1. Client & dates  — §68: currency and dueDate default from the client's
 *                        commercial profile (the domain decides; the wizard
 *                        only sends what the user chose).
 *   2. Items           — §69/§70 Source Selector: exactly the eligible
 *                        billable time/expenses/milestones (9C services), plus
 *                        MANUAL/FIXED_FEE free-form lines (§71 — a fixed fee
 *                        never fabricates time revenue). Adding a source line
 *                        RESERVES it (§63); a conflict is an explicit error,
 *                        never a silent skip (§84).
 *   3. Tax & discount  — §76 tax LINES (name + rate only — amounts are the
 *                        engine's, never typed by hand) and the invoice-level
 *                        discount.
 *   4. Preview         — the stored, engine-computed money. The wizard NEVER
 *                        computes money (§77/§78): every number shown came
 *                        back from the server.
 *
 * Finalization (§83) happens on the Preview step — or the draft is kept and
 * finished later from the detail page.
 */

export interface WizardPreset {
  clientId?: string;
  projectId?: string;
}

interface ClientOption { id: string; name: string }
interface ProjectOption { id: string; name: string; clientId: string }

interface BillableTimeRow {
  id: string; date: string; durationMinutes: number; notes: string | null;
  amount: { amount: number; currency: string }; projectId: string; projectName: string | null;
}
interface BillableExpenseRow {
  id: string; vendorName: string; description: string; expenseDate: string;
  amount: { amount: number; currency: string }; projectId: string | null;
}
interface BillableMilestoneRow {
  id: string; name: string; sequence: number;
  amount: { amount: number; currency: string }; projectId: string; projectName: string | null;
}
interface BillableSources {
  time: BillableTimeRow[];
  expenses: BillableExpenseRow[];
  milestones: BillableMilestoneRow[];
  unvaluableMilestones: number;
  unpricedTime?: {
    count: number;
    durationMinutes: number;
    roles: string[];
  };
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function inr(n: number): string {
  return `₹${n.toLocaleString('en-IN')}`;
}

function minutesLabel(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return h > 0 ? (min > 0 ? `${h}h ${min}m` : `${h}h`) : `${min}m`;
}

const inputCls = 'px-3 py-1.5 rounded-lg bg-[#0a0a0a] border border-white/[0.06] text-[12.5px] text-white placeholder:text-neutral-600 focus:outline-none focus:border-white/20';
const btnPrimary = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white text-black text-[12.5px] font-semibold hover:bg-neutral-200 disabled:opacity-50 transition-colors';
const btnGhost = 'inline-flex items-center gap-1 px-2 py-1 rounded border border-white/[0.08] text-[11.5px] text-neutral-300 hover:bg-white/[0.04] disabled:opacity-40 transition-colors';

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  DRAFT: 'Draft', SENT: 'Sent', PARTIALLY_PAID: 'Partially paid',
  PAID: 'Paid', OVERDUE: 'Overdue', VOID: 'Void',
};

export function InvoiceWizard({
  isOpen,
  onClose,
  preset,
  editingId,
  onChanged,
}: {
  isOpen: boolean;
  onClose: () => void;
  /** Preselection from the project Billing tab / deep link. */
  preset?: WizardPreset;
  /** Editing an existing DRAFT — skips straight to the Items step. */
  editingId?: string | null;
  /** Any mutation landed (draft created / lines changed / finalized). */
  onChanged: () => void;
}) {
  const [step, setStep] = useState(1);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [form, setForm] = useState({ clientId: '', projectId: '', issueDate: todayStr(), dueDate: '', notes: '', terms: '' });
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [billable, setBillable] = useState<BillableSources | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [manual, setManual] = useState({ type: 'MANUAL' as InvoiceLineType, description: '', amount: '', quantity: '', unitPrice: '' });
  const [taxForm, setTaxForm] = useState({ discount: '', taxes: [] as Array<{ type?: string; name: string; code: string; rate: string }> });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset when the drawer opens.
  useEffect(() => {
    if (!isOpen) return;
    setStep(1);
    setInvoice(null);
    setLines([]);
    setBillable(null);
    setSelected({});
    setError(null);
    setTaxForm({ discount: '', taxes: [] });
    setManual({ type: 'MANUAL', description: '', amount: '', quantity: '', unitPrice: '' });
    setForm({
      clientId: preset?.clientId ?? '',
      projectId: preset?.projectId ?? '',
      issueDate: todayStr(),
      dueDate: '',
      notes: '',
      terms: '',
    });
  }, [isOpen, preset?.clientId, preset?.projectId]);

  // Step 1 needs the client directory (and the projects of the chosen client).
  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/agency/clients?limit=100')
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then(body => setClients((body.clients || []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }))))
      .catch(() => setClients([]));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !form.clientId) { setProjects([]); return; }
    fetch(`/api/agency/projects?clientId=${form.clientId}&limit=100`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then(body => setProjects((body.projects || []).map((p: { id: string; name: string; clientId: string }) => ({ id: p.id, name: p.name, clientId: p.clientId }))))
      .catch(() => setProjects([]));
  }, [isOpen, form.clientId]);

  /** Editing an existing draft: load it and jump to the Items step. */
  useEffect(() => {
    if (!isOpen || !editingId) return;
    setBusy(true);
    fetch(`/api/agency/invoices/${editingId}`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then(body => {
        setInvoice(body.invoice);
        setLines(body.lines || []);
        setTaxForm({
          discount: body.invoice.discount.amount > 0 ? String(body.invoice.discount.amount) : '',
          taxes: (body.invoice.taxLines || []).map((t: { type?: string; name: string; code?: string; rate: number }) => ({
            type: t.type, name: t.name, code: t.code ?? '', rate: String(t.rate),
          })),
        });
        setStep(2);
      })
      .catch(() => setError('We couldn\'t load that draft.'))
      .finally(() => setBusy(false));
  }, [isOpen, editingId]);

  // The §70 eligible set, scoped to the draft's engagement.
  const loadBillable = useCallback(() => {
    if (!invoice) return;
    const p = new URLSearchParams();
    if (invoice.projectId) p.set('projectId', invoice.projectId);
    else p.set('clientId', invoice.clientId);
    fetch(`/api/agency/invoices/billable-sources?${p.toString()}`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then(body => { setBillable(body); setSelected({}); })
      .catch(() => setBillable(null));
  }, [invoice]);

  useEffect(() => {
    if (step === 2 && invoice) loadBillable();
  }, [step, invoice, loadBillable]);

  async function createDraft() {
    if (!form.clientId) { setError('Choose a client first.'); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/agency/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: form.clientId,
          ...(form.projectId && { projectId: form.projectId }),
          issueDate: form.issueDate,
          ...(form.dueDate && { dueDate: form.dueDate }),
          ...(form.notes.trim() && { notes: form.notes.trim() }),
          ...(form.terms.trim() && { terms: form.terms.trim() }),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.error || 'The draft couldn\'t be created.'); return; }
      setInvoice(body.invoice);
      setLines([]);
      onChanged();
      setStep(2);
    } catch {
      setError('Network error — please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function addLine(payload: Record<string, unknown>) {
    if (!invoice) return false;
    const res = await fetch(`/api/agency/invoices/${invoice.id}/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setError(body.error || 'That line couldn\'t be added.'); return false; }
    setInvoice(body.invoice);
    setLines(prev => [...prev, body.line]);
    onChanged();
    return true;
  }

  /** Add every checked source item. §84 — a conflict stops the batch with an
   *  explicit error; the already-added lines stay (honest partial state). */
  async function addSelectedSources() {
    if (!invoice || !billable) return;
    setBusy(true);
    setError(null);
    try {
      const picks: Array<Record<string, unknown>> = [];
      for (const t of billable.time) if (selected[`time-${t.id}`]) picks.push({ type: 'TIME', sourceId: t.id, description: `${minutesLabel(t.durationMinutes)} — ${t.notes || 'Billable time'}` });
      for (const e of billable.expenses) if (selected[`exp-${e.id}`]) picks.push({ type: 'EXPENSE', sourceId: e.id, description: `${e.vendorName} — ${e.description || 'Recharge'}` });
      for (const m of billable.milestones) if (selected[`ms-${m.id}`]) picks.push({ type: 'MILESTONE', sourceId: m.id, description: `Milestone ${m.sequence}: ${m.name}` });
      if (picks.length === 0) { setError('Nothing is checked.'); return; }
      for (const pick of picks) {
        const ok = await addLine(pick);
        if (!ok) break;
      }
      loadBillable();
    } finally {
      setBusy(false);
    }
  }

  async function addManualLine() {
    if (!invoice) return;
    const priced = manual.quantity.trim() !== '' && manual.unitPrice.trim() !== '';
    if (!manual.description.trim() || (!priced && manual.amount.trim() === '')) {
      setError('A free-form line needs a description and an amount (or quantity × unit price).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const ok = await addLine({
        type: manual.type,
        description: manual.description.trim(),
        ...(priced
          ? { amount: 0, quantity: Number(manual.quantity), unitPrice: Number(manual.unitPrice) }
          : { amount: Number(manual.amount) }),
      });
      if (ok) setManual({ ...manual, description: '', amount: '', quantity: '', unitPrice: '' });
    } finally {
      setBusy(false);
    }
  }

  async function removeLine(lineId: string) {
    if (!invoice) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/agency/invoices/${invoice.id}/lines/${lineId}`, { method: 'DELETE' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.error || 'That line couldn\'t be removed.'); return; }
      setInvoice(body.invoice);
      setLines(prev => prev.filter(l => l.id !== lineId));
      onChanged();
      loadBillable();
    } finally {
      setBusy(false);
    }
  }

  async function saveTaxation() {
    if (!invoice) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/agency/invoices/${invoice.id}/taxation`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(taxForm.discount.trim() !== '' && { discountAmount: Number(taxForm.discount) }),
          taxes: taxForm.taxes
            .filter(t => t.name.trim() !== '')
            .map(t => ({ name: t.name.trim(), rate: Number(t.rate), ...(t.type && { type: t.type }), ...(t.code.trim() !== '' && { code: t.code.trim() }) })),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.error || 'The taxation couldn\'t be saved.'); return; }
      setInvoice(body.invoice);
      onChanged();
      setStep(4);
    } catch {
      setError('Network error — please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function finalize() {
    if (!invoice) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/agency/invoices/${invoice.id}/finalize`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.error || 'Finalization was rejected.'); return; }
      setInvoice(body.invoice);
      onChanged();
      setStep(4);
    } catch {
      setError('Network error — please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!isOpen) return null;

  const clientName = invoice
    ? (clients.find(c => c.id === invoice.clientId)?.name ?? null)
    : null;
  const stepTitles = ['Client & dates', 'Items', 'Tax & discount', 'Preview'];

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Invoice wizard">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl h-full bg-[#0a0a0a] border-l border-white/[0.08] flex flex-col animate-in slide-in-from-right duration-200">

        {/* Header */}
        <div className="h-14 shrink-0 flex items-center justify-between px-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileText className="w-4 h-4 text-neutral-500 shrink-0" aria-hidden />
            <span className="text-[14px] font-semibold text-white truncate">
              {invoice ? (invoice.invoiceNumber ? `${invoice.invoiceNumber} · ${STATUS_LABEL[invoice.status]}` : 'Draft Invoice') : 'New invoice'}
            </span>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-md text-neutral-500 hover:text-white hover:bg-white/[0.05] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Stepper */}
        <div className="px-5 py-3 border-b border-white/[0.06] flex items-center gap-1.5 flex-wrap text-[11.5px]">
          {stepTitles.map((title, i) => {
            const n = i + 1;
            const state = n === step ? 'current' : n < step ? 'done' : 'todo';
            return (
              <React.Fragment key={title}>
                {i > 0 && <ArrowRight className="w-3 h-3 text-neutral-700" aria-hidden />}
                <span className={`flex items-center gap-1.5 px-2 py-1 rounded ${state === 'current' ? 'bg-white/[0.08] text-white font-medium' : state === 'done' ? 'text-neutral-400' : 'text-neutral-600'}`}>
                  {state === 'done' ? <Check className="w-3 h-3" aria-hidden /> : <span className="tabular-nums">{n}</span>} {title}
                </span>
              </React.Fragment>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {error && (
            <div role="alert" className="rounded-lg border border-red-500/25 bg-red-500/[0.06] px-3 py-2 text-[12.5px] text-red-300">
              {error}
            </div>
          )}

          {/* ---------- Step 1: Client & dates ---------- */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-[12.5px] text-neutral-500">
                The client&apos;s billing profile supplies the currency and payment terms — the due date is only needed when you want to override them (§68).
              </p>
              <label className="block space-y-1.5">
                <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Client</span>
                <Select value={form.clientId} onChange={e => setForm(f => ({ ...f, clientId: e.target.value, projectId: '' }))} className={`${inputCls} w-full`} aria-label="Client">
                  <option value="">Choose a client…</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </label>
              <label className="block space-y-1.5">
                <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Project <span className="normal-case tracking-normal text-neutral-600">(optional — scopes the draft to one engagement)</span></span>
                <Select value={form.projectId} onChange={e => setForm(f => ({ ...f, projectId: e.target.value }))} className={`${inputCls} w-full`} aria-label="Project" disabled={!form.clientId}>
                  <option value="">All of the client&apos;s work</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Issue date</span>
                  <DatePicker value={form.issueDate} onChange={e => setForm(f => ({ ...f, issueDate: e.target.value }))} aria-label="Issue date" />
                </div>
                <div className="space-y-1.5">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Due date <span className="normal-case tracking-normal text-neutral-600">(default: client terms)</span></span>
                  <DatePicker value={form.dueDate} min={form.issueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} aria-label="Due date" />
                </div>
              </div>
              <label className="block space-y-1.5">
                <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Notes (shown to the client)</span>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} maxLength={500} className={`${inputCls} w-full`} aria-label="Notes" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Payment terms text</span>
                <textarea value={form.terms} onChange={e => setForm(f => ({ ...f, terms: e.target.value }))} rows={2} maxLength={1000} className={`${inputCls} w-full`} aria-label="Terms" />
              </label>
              <div className="flex justify-end">
                <button onClick={() => void createDraft()} disabled={busy} className={btnPrimary}>
                  Create draft <ArrowRight className="w-3.5 h-3.5" aria-hidden />
                </button>
              </div>
            </div>
          )}

          {/* ---------- Step 2: Items (§69/§70 Source Selector) ---------- */}
          {step === 2 && invoice && (
            <div className="space-y-4">
              {/* §72 — TIME lines are one-per-entry; this list IS the granular truth. */}
              {billable && billable.time.length > 0 && (
                <section className="rounded-xl border border-white/[0.06] bg-[#050505] p-3 space-y-2">
                  <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Billable time ({billable.time.length})</div>
                  {billable.time.map(t => (
                    <label key={t.id} className="flex items-center gap-2.5 text-[12.5px] py-1 cursor-pointer">
                      <input type="checkbox" checked={!!selected[`time-${t.id}`]} onChange={e => setSelected(s => ({ ...s, [`time-${t.id}`]: e.target.checked }))} className="accent-white" />
                      <span className="flex-1 min-w-0 truncate text-neutral-300">{t.date} · {minutesLabel(t.durationMinutes)} — {t.notes || 'Billable time'}</span>
                      <span className="tabular-nums text-neutral-200">{inr(t.amount.amount)}</span>
                    </label>
                  ))}
                </section>
              )}
              {billable && billable.expenses.length > 0 && (
                <section className="rounded-xl border border-white/[0.06] bg-[#050505] p-3 space-y-2">
                  <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Billable expenses ({billable.expenses.length})</div>
                  {billable.expenses.map(e => (
                    <label key={e.id} className="flex items-center gap-2.5 text-[12.5px] py-1 cursor-pointer">
                      <input type="checkbox" checked={!!selected[`exp-${e.id}`]} onChange={e2 => setSelected(s => ({ ...s, [`exp-${e.id}`]: e2.target.checked }))} className="accent-white" />
                      <span className="flex-1 min-w-0 truncate text-neutral-300">{e.expenseDate} · {e.vendorName} — {e.description || 'Recharge'}</span>
                      <span className="tabular-nums text-neutral-200">{inr(e.amount.amount)}</span>
                    </label>
                  ))}
                </section>
              )}
              {billable && billable.milestones.length > 0 && (
                <section className="rounded-xl border border-white/[0.06] bg-[#050505] p-3 space-y-2">
                  <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Completed milestones ({billable.milestones.length})</div>
                  {billable.milestones.map(m => (
                    <label key={m.id} className="flex items-center gap-2.5 text-[12.5px] py-1 cursor-pointer">
                      <input type="checkbox" checked={!!selected[`ms-${m.id}`]} onChange={e => setSelected(s => ({ ...s, [`ms-${m.id}`]: e.target.checked }))} className="accent-white" />
                      <span className="flex-1 min-w-0 truncate text-neutral-300">#{m.sequence} {m.name}</span>
                      <span className="tabular-nums text-neutral-200">{inr(m.amount.amount)}</span>
                    </label>
                  ))}
                </section>
              )}
              {/* §97 — never hide missing configuration. */}
              {billable && billable.unvaluableMilestones > 0 && (
                <p className="text-[12px] text-amber-400/90">
                  {billable.unvaluableMilestones} completed milestone{billable.unvaluableMilestones > 1 ? 's' : ''} cannot be valued — percentage-based with no contract value on the project.
                </p>
              )}
              {/* §96/§97 — never hide missing rate configuration for time. */}
              {billable && billable.unpricedTime && billable.unpricedTime.count > 0 && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-[12.5px] text-amber-300">
                  <div className="font-medium">
                    ⚠️ {billable.unpricedTime.count} approved time {billable.unpricedTime.count === 1 ? 'entry' : 'entries'} ({minutesLabel(billable.unpricedTime.durationMinutes)}) cannot be invoiced yet
                  </div>
                  <div className="text-amber-300/80 text-[12px] mt-1">
                    Billing rates are missing{billable.unpricedTime.roles.length > 0 ? ` for: ${billable.unpricedTime.roles.join(', ')}` : ''}.
                    {' '}Please configure rates in{' '}
                    <a href="/dashboard/agency/rate-cards" target="_blank" rel="noopener noreferrer" className="underline font-medium hover:text-white">
                      Rate Cards
                    </a>{' '}
                    or assign a rate to invoice this time.
                  </div>
                </div>
              )}
              {billable && billable.time.length + billable.expenses.length + billable.milestones.length === 0 && (
                <p className="text-[12.5px] text-neutral-500">
                  {billable.unpricedTime && billable.unpricedTime.count > 0
                    ? 'No other billable items waiting.'
                    : 'Nothing billable is waiting — approved time, billable expenses and completed milestones appear here (§70).'}
                </p>
              )}
              <div className="flex justify-end">
                <button onClick={() => void addSelectedSources()} disabled={busy || !billable} className={btnPrimary}>
                  <Plus className="w-3.5 h-3.5" aria-hidden /> Add selected
                </button>
              </div>

              {/* Free-form lines (§71) */}
              <section className="rounded-xl border border-white/[0.06] bg-[#050505] p-3 space-y-2">
                <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Free-form line (§71 — a fixed fee is never fabricated time)</div>
                <div className="flex flex-wrap gap-2">
                  <Select value={manual.type} onChange={e => setManual(m => ({ ...m, type: e.target.value as InvoiceLineType }))} className={inputCls} aria-label="Line type">
                    <option value="MANUAL">Manual</option>
                    <option value="FIXED_FEE">Fixed fee</option>
                  </Select>
                  <input value={manual.description} onChange={e => setManual(m => ({ ...m, description: e.target.value }))} placeholder="Description" maxLength={200} aria-label="Description" className={`${inputCls} flex-1 min-w-[12rem]`} />
                  <input type="number" min="0" step="any" value={manual.amount} onChange={e => setManual(m => ({ ...m, amount: e.target.value }))} placeholder="Amount" aria-label="Amount" className={`${inputCls} w-28`} />
                  <span className="self-center text-[11px] text-neutral-600">or</span>
                  <input type="number" min="0" step="any" value={manual.quantity} onChange={e => setManual(m => ({ ...m, quantity: e.target.value }))} placeholder="Qty" aria-label="Quantity" className={`${inputCls} w-20`} />
                  <input type="number" min="0" step="any" value={manual.unitPrice} onChange={e => setManual(m => ({ ...m, unitPrice: e.target.value }))} placeholder="Unit price" aria-label="Unit price" className={`${inputCls} w-24`} />
                  <button onClick={() => void addManualLine()} disabled={busy} className={btnGhost}><Plus className="w-3 h-3" aria-hidden /> Add</button>
                </div>
              </section>

              {/* The draft's lines so far */}
              <section className="rounded-xl border border-white/[0.06] overflow-hidden">
                <div className="px-3 py-2 border-b border-white/[0.06] text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                  Lines on this invoice ({lines.length}) · subtotal {invoice ? inr(invoice.subtotal.amount) : ''}
                </div>
                {lines.length === 0 ? (
                  <p className="p-3 text-[12.5px] text-neutral-500">No lines yet.</p>
                ) : (
                  <ul className="divide-y divide-white/[0.04]">
                    {lines.map(l => (
                      <li key={l.id} className="flex items-center gap-2.5 px-3 py-2 text-[12.5px]">
                        <span className="text-[10.5px] font-mono text-neutral-500 shrink-0">{l.type}</span>
                        <span className="flex-1 min-w-0 truncate text-neutral-300">
                          {l.description}
                          {l.quantity !== undefined && l.unitPrice && <span className="text-neutral-500"> · {l.quantity} × {inr(l.unitPrice.amount)}</span>}
                        </span>
                        <span className="tabular-nums text-neutral-200">{inr(l.amount.amount)}</span>
                        <button onClick={() => void removeLine(l.id)} disabled={busy} aria-label={`Remove ${l.description}`} className="p-1 rounded text-neutral-600 hover:text-red-400 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <div className="flex items-center justify-between">
                <button onClick={() => setStep(3)} disabled={busy} className={btnGhost}><ArrowLeft className="w-3 h-3" aria-hidden /> Back</button>
                <button onClick={() => setStep(3)} disabled={busy || lines.length === 0} className={btnPrimary}>
                  Tax & discount <ArrowRight className="w-3.5 h-3.5" aria-hidden />
                </button>
              </div>
            </div>
          )}

          {/* ---------- Step 3: Tax & discount (§76) ---------- */}
          {step === 3 && invoice && (
            <div className="space-y-4">
              <label className="block space-y-1.5">
                <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Discount amount</span>
                <input type="number" min="0" step="any" value={taxForm.discount} onChange={e => setTaxForm(f => ({ ...f, discount: e.target.value }))} placeholder="0" aria-label="Discount amount" className={`${inputCls} w-36`} />
                <span className="text-[11px] text-neutral-600">Subtotal is {inr(invoice.subtotal.amount)} — the discount can never exceed it.</span>
              </label>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Tax lines (§76)</span>
                  <div className="flex gap-1.5">
                    <button onClick={() => setTaxForm(f => ({ ...f, taxes: [...f.taxes, { type: 'CGST', name: 'CGST', code: '', rate: '9' }, { type: 'SGST', name: 'SGST', code: '', rate: '9' }] }))} className={btnGhost}>CGST + SGST</button>
                    <button onClick={() => setTaxForm(f => ({ ...f, taxes: [...f.taxes, { type: 'IGST', name: 'IGST', code: '', rate: '18' }] }))} className={btnGhost}>IGST 18%</button>
                    <button onClick={() => setTaxForm(f => ({ ...f, taxes: [...f.taxes, { name: '', code: '', rate: '' }] }))} className={btnGhost}><Plus className="w-3 h-3" aria-hidden /> Custom</button>
                  </div>
                </div>
                {taxForm.taxes.length === 0 && <p className="text-[12.5px] text-neutral-500">No tax lines — the total is the taxable amount.</p>}
                {taxForm.taxes.map((t, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={t.name} onChange={e => setTaxForm(f => ({ ...f, taxes: f.taxes.map((x, j) => j === i ? { ...x, name: e.target.value } : x) }))} placeholder="Tax name (e.g. IGST)" maxLength={60} aria-label="Tax name" className={`${inputCls} flex-1`} />
                    <input value={t.code} onChange={e => setTaxForm(f => ({ ...f, taxes: f.taxes.map((x, j) => j === i ? { ...x, code: e.target.value } : x) }))} placeholder="Code" maxLength={20} aria-label="Tax code" className={`${inputCls} w-24`} />
                    <input type="number" min="0" max="100" step="any" value={t.rate} onChange={e => setTaxForm(f => ({ ...f, taxes: f.taxes.map((x, j) => j === i ? { ...x, rate: e.target.value } : x) }))} placeholder="%" aria-label="Tax rate percent" className={`${inputCls} w-20`} />
                    <button onClick={() => setTaxForm(f => ({ ...f, taxes: f.taxes.filter((_, j) => j !== i) }))} aria-label="Remove tax line" className="p-1 rounded text-neutral-600 hover:text-red-400 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <p className="text-[11px] text-neutral-600">Only names and rates are sent — every amount is computed by the engine (§78), never typed.</p>
              </div>

              <div className="flex items-center justify-between">
                <button onClick={() => setStep(2)} disabled={busy} className={btnGhost}><ArrowLeft className="w-3 h-3" aria-hidden /> Back</button>
                <button onClick={() => void saveTaxation()} disabled={busy} className={btnPrimary}>
                  Save & preview <ArrowRight className="w-3.5 h-3.5" aria-hidden />
                </button>
              </div>
            </div>
          )}

          {/* ---------- Step 4: Preview (§77 — stored money only) ---------- */}
          {step === 4 && invoice && (
            <div className="space-y-4">
              <div className="rounded-xl border border-white/[0.06] bg-[#050505] p-4 space-y-1.5">
                <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500 pb-1">
                  {clientName ?? 'Client'} · issued {invoice.issueDate} · due {invoice.dueDate}
                </div>
                {lines.map(l => (
                  <div key={l.id} className="flex items-baseline justify-between gap-3 text-[12.5px]">
                    <span className="min-w-0 truncate text-neutral-400"><span className="font-mono text-[10.5px] text-neutral-600 mr-1.5">{l.type}</span>{l.description}</span>
                    <span className="tabular-nums text-neutral-200">{inr(l.amount.amount)}</span>
                  </div>
                ))}
                <div className="mt-2 pt-2 border-t border-white/[0.06] space-y-1 text-[12.5px]">
                  <div className="flex justify-between text-neutral-400"><span>Subtotal</span><span className="tabular-nums">{inr(invoice.subtotal.amount)}</span></div>
                  {invoice.discount.amount > 0 && <div className="flex justify-between text-neutral-400"><span>Discount</span><span className="tabular-nums">−{inr(invoice.discount.amount)}</span></div>}
                  {invoice.taxLines.map(t => (
                    <div key={t.name + t.rate} className="flex justify-between text-neutral-400"><span>{t.name} @ {t.rate}%</span><span className="tabular-nums">{inr(t.amount.amount)}</span></div>
                  ))}
                  <div className="flex justify-between text-[14px] font-semibold text-white pt-1"><span>Total</span><span className="tabular-nums">{inr(invoice.total.amount)}</span></div>
                </div>
              </div>

              {invoice.status === 'DRAFT' ? (
                <div className="flex items-center justify-between">
                  <button onClick={() => setStep(3)} disabled={busy} className={btnGhost}><ArrowLeft className="w-3 h-3" aria-hidden /> Back</button>
                  <div className="flex gap-2">
                    <button onClick={onClose} disabled={busy} className={btnGhost}>Keep as draft</button>
                    <button onClick={() => void finalize()} disabled={busy} className={btnPrimary}>
                      <Check className="w-3.5 h-3.5" aria-hidden /> Finalize & issue
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] text-emerald-300">
                    Issued as <strong className="font-semibold">{invoice.invoiceNumber}</strong> — the billed items are locked INVOICED (§83).
                  </span>
                  <button onClick={onClose} className={btnPrimary}>Done</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
