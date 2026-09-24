"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { calculateExpenseMarkup, type Expense, type ExpenseType } from '@/lib/agency/types/expense';
import { makeMoney, formatMoney, type Money } from '@/lib/agency/types/money';
import { todayInTimezone } from '@/lib/agency/types/dates';
import { Select } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';
import { Req, Opt } from '@/components/ui/Req';
import { cn } from '@/lib/utils';

/**
 * Expense drawer (Module 8, §37–§47).
 *
 * Create mode: Project (optional — §47 standalone) → Vendor → Description →
 * Amount → Type (INTERNAL / BILLABLE / PASS_THROUGH) → Billable? (§39: both
 * the type AND the explicit flag; INTERNAL is never billable) → Markup %
 * (§43: live client-charge preview) → Date → Receipt link (§45) → Notes.
 *
 * Edit mode: the §22-pattern lifecycle is server-enforced (full pre-approval
 * / notes + receipt after approval / locked once invoiced or reimbursed);
 * this drawer renders the fields and lets the domain say no. USER payloads
 * arrive cost-redacted (§99) — absent amount fields stay untouched.
 */
type ExpenseRow = Omit<Expense, 'amount' | 'markupPercent'> & {
  amount?: Money;
  markupPercent?: number;
};

interface ProjectOption { id: string; name: string; }
interface ClientOption { id: string; name: string; }

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** Present → edit mode; absent → create mode. */
  editing?: ExpenseRow | null;
  /** Pre-select a project (the project workspace Expenses tab). */
  defaultProjectId?: string;
}

const inputCls = 'w-full px-3 py-2 rounded-lg bg-[#0a0a0a] border border-white/[0.08] text-[13px] text-white focus:outline-none focus:border-white/25';
const labelCls = 'block text-[11px] font-medium uppercase tracking-wider text-neutral-500 mb-1.5';

const TYPE_OPTIONS: Array<{ value: ExpenseType; hint: string }> = [
  { value: 'BILLABLE', hint: 'Recharged to the client with markup' },
  { value: 'PASS_THROUGH', hint: 'Recharged at cost (0% markup)' },
  { value: 'INTERNAL', hint: 'Agency cost — never billed' },
];

export function ExpenseDrawer({ isOpen, onClose, onSaved, editing, defaultProjectId }: Props) {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [projectId, setProjectId] = useState('');
  const [clientId, setClientId] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [description, setDescription] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [expenseType, setExpenseType] = useState<ExpenseType>('BILLABLE');
  const [billable, setBillable] = useState(true);
  const [markupInput, setMarkupInput] = useState('');
  const [date, setDate] = useState(todayInTimezone());
  const [receiptReference, setReceiptReference] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!editing;
  // §22 pattern — SUBMITTED/REIMBURSED/INVOICED are locked; APPROVED allows
  // only notes + receipt reference (the Transaction exists, §41).
  const policy = !editing ? 'FULL'
    : editing.billingStatus === 'INVOICED' || editing.status === 'SUBMITTED' || editing.status === 'REIMBURSED' ? 'LOCKED'
    : editing.status === 'APPROVED' ? 'NOTES_ONLY' : 'FULL';
  const locked = policy === 'LOCKED';
  const notesOnly = policy === 'NOTES_ONLY';

  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/agency/projects?limit=100')
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then(body => setProjects((body.projects || []).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }))))
      .catch(() => setProjects([]));
    fetch('/api/agency/clients?limit=100')
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then(body => setClients((body.clients || []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }))))
      .catch(() => setClients([]));
    // Reset the form per open.
    if (editing) {
      setProjectId(editing.projectId ?? '');
      setClientId(editing.clientId ?? '');
      setVendorName(editing.vendorName);
      setDescription(editing.description);
      // §99 — a USER's payload arrives without the amount; leave blank so an
      // untouched PATCH never sends it.
      setAmountInput(editing.amount !== undefined ? String(editing.amount.amount) : '');
      setCurrency(editing.amount?.currency ?? 'INR');
      setExpenseType(editing.expenseType);
      setBillable(editing.billable);
      setMarkupInput(editing.markupPercent !== undefined ? String(editing.markupPercent) : '');
      setDate(editing.expenseDate);
      setReceiptReference(editing.receiptReference ?? '');
      setNotes(editing.notes ?? '');
    } else {
      setProjectId(defaultProjectId ?? '');
      setClientId('');
      setVendorName('');
      setDescription('');
      setAmountInput('');
      setCurrency('INR');
      setExpenseType('BILLABLE');
      setBillable(true);
      setMarkupInput('');
      setDate(todayInTimezone());
      setReceiptReference('');
      setNotes('');
    }
    setError(null);
  }, [isOpen, editing, defaultProjectId]);

  // §39 — INTERNAL is never billable; switching to it clears the flag.
  function chooseType(t: ExpenseType) {
    setExpenseType(t);
    if (t === 'INTERNAL') setBillable(false);
    else if (!billable) setBillable(true);
  }

  const amount = useMemo(() => {
    const v = Number(amountInput);
    return amountInput.trim() !== '' && Number.isFinite(v) && v > 0 ? v : null;
  }, [amountInput]);

  const markupPercent = useMemo(() => {
    const v = Number(markupInput);
    return markupInput.trim() !== '' && Number.isFinite(v) && v >= 0 ? v : null;
  }, [markupInput]);

  // §43 — live client-charge preview, same engine as the server.
  const chargePreview = useMemo(() => {
    if (!billable || amount === null) return null;
    try {
      return calculateExpenseMarkup(makeMoney(amount, currency), markupPercent ?? 0);
    } catch {
      return null;
    }
  }, [billable, amount, currency, markupPercent]);

  const save = useCallback(async () => {
    if (!isEdit && (vendorName.trim() === '' || description.trim() === '' || amount === null)) {
      setError('Vendor, description and a positive amount are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // §22 pattern — an APPROVED expense accepts only notes + receipt
      // reference; sending the frozen fields would (correctly) 400.
      const payload: Record<string, unknown> = notesOnly
        ? {
          ...(receiptReference.trim() !== '' && { receiptReference: receiptReference.trim() }),
          ...(notes.trim() !== '' && { notes: notes.trim() }),
        }
        : {
          vendorName: vendorName.trim(),
          description: description.trim(),
          expenseType,
          billable,
          expenseDate: date,
          ...(projectId !== '' && { projectId }),
          ...(projectId === '' && clientId !== '' && { clientId }),
          ...(amount !== null && { amount, currency: currency.toUpperCase() }),
          ...(billable && markupPercent !== null && { markupPercent }),
          ...(receiptReference.trim() !== '' && { receiptReference: receiptReference.trim() }),
          ...(notes.trim() !== '' && { notes: notes.trim() }),
        };
      const res = await fetch(isEdit ? `/api/agency/expenses/${editing!.id}` : '/api/agency/expenses', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'That didn\'t work. Try again.');
        return;
      }
      onSaved();
    } catch {
      setError('That didn\'t work. Try again.');
    } finally {
      setSaving(false);
    }
  }, [isEdit, editing, vendorName, description, amount, currency, expenseType, billable, markupPercent, date, projectId, clientId, receiptReference, notes, onSaved]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-label={isEdit ? 'Edit expense' : 'Record expense'}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md h-full bg-[#0a0a0a] border-l border-white/[0.08] flex flex-col">
        <div className="flex items-center justify-between px-5 h-14 border-b border-white/[0.06] shrink-0">
          <h2 className="text-[14px] font-semibold text-white">{isEdit ? 'Edit Expense' : 'Record Expense'}</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-white/[0.05] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {locked && (
            <p className="text-[12px] text-amber-400/90 rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2">
              {editing?.billingStatus === 'INVOICED'
                ? 'This expense is invoiced and financially locked.'
                : editing?.status === 'REIMBURSED'
                  ? 'This expense is reimbursed and locked.'
                  : 'This expense is awaiting review — ask the approver to reject it first.'}
            </p>
          )}
          {notesOnly && (
            <p className="text-[12px] text-amber-400/90 rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2">
              This expense is approved and linked to its ledger transaction — only notes and the receipt reference can be changed.
            </p>
          )}

          <div>
            <label htmlFor="ex-project" className={labelCls}>Project <Opt /></label>
            <Select
              id="ex-project"
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              disabled={locked || notesOnly}
              className={inputCls}
            >
              <option value="">No project (standalone)</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>

          {projectId === '' && (
            <div>
              <label htmlFor="ex-client" className={labelCls}>Client <Opt /></label>
              <Select
                id="ex-client"
                value={clientId}
                onChange={e => setClientId(e.target.value)}
                disabled={locked || notesOnly}
                className={inputCls}
              >
                <option value="">No client</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
          )}

          <div>
            <label htmlFor="ex-vendor" className={labelCls}>Vendor <Req satisfied={Boolean(vendorName.trim())} /></label>
            <input
              id="ex-vendor" type="text" value={vendorName} maxLength={200}
              onChange={e => { setVendorName(e.target.value); setError(null); }}
              disabled={locked || notesOnly}
              className={cn(inputCls, error && !vendorName.trim() && 'border-rose-500/50')} placeholder="Who was paid?"
            />
          </div>

          <div>
            <label htmlFor="ex-description" className={labelCls}>Description <Req satisfied={Boolean(description.trim())} /></label>
            <input
              id="ex-description" type="text" value={description} maxLength={2000}
              onChange={e => { setDescription(e.target.value); setError(null); }}
              disabled={locked || notesOnly}
              className={cn(inputCls, error && !description.trim() && 'border-rose-500/50')} placeholder="What was bought?"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ex-amount" className={labelCls}>Amount <Req satisfied={Boolean(amount !== null && amount > 0)} /></label>
              <input
                id="ex-amount" type="number" min={0} step="0.01" value={amountInput}
                onChange={e => { setAmountInput(e.target.value); setError(null); }}
                disabled={locked || notesOnly}
                className={cn(inputCls, 'tabular-nums', error && amount === null && 'border-rose-500/50')} placeholder="0.00"
                aria-describedby="ex-charge-preview"
              />
            </div>
            <div>
              <label htmlFor="ex-currency" className={labelCls}>Currency <Req satisfied={/^[A-Z]{3}$/.test(currency.trim())} /></label>
              <input
                id="ex-currency" type="text" value={currency} maxLength={3}
                onChange={e => setCurrency(e.target.value.toUpperCase())}
                disabled={locked || notesOnly}
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <span className={labelCls}>Type <Req satisfied={Boolean(expenseType)} /></span>
            <div className="space-y-1.5" role="radiogroup" aria-label="Expense type">
              {TYPE_OPTIONS.map(o => (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={expenseType === o.value}
                  onClick={() => chooseType(o.value)}
                  disabled={locked || notesOnly}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-[13px] transition-colors ${expenseType === o.value
                    ? 'border-white/25 bg-white/[0.06] text-white'
                    : 'border-white/[0.08] text-neutral-500 hover:text-neutral-300'}`}
                >
                  <span>{o.value}</span>
                  <span className="text-[11px] text-neutral-600">{o.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className={labelCls}>Billable? <Req satisfied={typeof billable === 'boolean'} /></span>
            <div className="flex gap-2" role="radiogroup" aria-label="Billable">
              {[true, false].map(v => (
                <button
                  key={String(v)}
                  type="button"
                  role="radio"
                  aria-checked={billable === v}
                  onClick={() => setBillable(v)}
                  disabled={locked || notesOnly || expenseType === 'INTERNAL'}
                  className={`flex-1 px-3 py-2 rounded-lg border text-[13px] transition-colors ${billable === v
                    ? v ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300' : 'border-white/20 bg-white/[0.06] text-white'
                    : 'border-white/[0.08] text-neutral-500 hover:text-neutral-300'} ${expenseType === 'INTERNAL' ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {v ? 'Billable' : 'Internal only'}
                </button>
              ))}
            </div>
            {expenseType === 'INTERNAL' && (
              <p className="mt-1 text-[11.5px] text-neutral-600">Internal expenses cannot be billed to clients.</p>
            )}
          </div>

          {billable && (
            <div>
              <label htmlFor="ex-markup" className={labelCls}>Markup % <Opt /></label>
              <input
                id="ex-markup" type="number" min={0} step="0.5" value={markupInput}
                onChange={e => setMarkupInput(e.target.value)}
                disabled={locked || notesOnly}
                className={`${inputCls} tabular-nums`} placeholder="0"
              />
              <p id="ex-charge-preview" className="mt-1 text-[11.5px] text-neutral-400">
                {chargePreview
                  ? <>Client charge: <strong className="text-white tabular-nums">{formatMoney(chargePreview)}</strong></>
                  : 'Enter an amount to see the client charge.'}
              </p>
            </div>
          )}

          <div>
            <label htmlFor="ex-date" className={labelCls}>Expense date <Req satisfied={Boolean(date)} /></label>
            <DatePicker
              id="ex-date"
              value={date}
              max={todayInTimezone()}
              onChange={e => setDate(e.target.value)}
              disabled={locked || notesOnly}
            />
          </div>

          <div>
            <label htmlFor="ex-receipt" className={labelCls}>Receipt link / reference <Opt /></label>
            <input
              id="ex-receipt" type="text" value={receiptReference} maxLength={500}
              onChange={e => setReceiptReference(e.target.value)}
              disabled={locked}
              className={inputCls} placeholder="Receipt link, document reference, or notes"
            />
          </div>

          <div>
            <label htmlFor="ex-notes" className={labelCls}>Notes <Opt /></label>
            <textarea
              id="ex-notes" value={notes} onChange={e => setNotes(e.target.value)}
              rows={3} maxLength={2000} disabled={locked}
              className={`${inputCls} resize-none`} placeholder="Anything the approver should know?"
            />
          </div>

          {error && <p role="alert" className="text-[12.5px] text-red-400">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-white/[0.06] shrink-0">
          <button
            onClick={() => void save()}
            disabled={saving || locked}
            className="w-full px-4 py-2.5 rounded-lg bg-white text-black text-[13px] font-semibold hover:bg-neutral-200 disabled:opacity-40 transition-colors"
          >
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Save expense'}
          </button>
        </div>
      </div>
    </div>
  );
}
