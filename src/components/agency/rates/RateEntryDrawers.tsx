"use client";

import React, { useState } from 'react';
import { Drawer } from '@/components/ui/Drawer';
import { todayInTimezone } from '@/lib/agency/types/dates';
import {
  RATE_UNITS, RATE_BILLING_TYPES,
  type RateCardType, type RateUnit, type RateBillingType,
} from '@/lib/agency/types/rate';
import { Select } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';

/**
 * Rate entry drawers (Module 6, spec §87/§122).
 *
 * RateEntryFormDrawer — add a rate line to a card with its FIRST version.
 *   COST cards are HOUR-only (§73) and never billable; BILLING cards pick
 *   unit + billing type (§72).
 *
 * ChangeRateDrawer — the §122 "rate changed from today" flow: a NEW amount
 *   effective from a date. The old version closes the day before; history is
 *   never rewritten. Backdating over existing versions rejects server-side.
 */
const inputCls = 'w-full px-3 py-2 rounded-lg bg-[#0a0a0a] border border-white/[0.06] text-[13px] text-white placeholder:text-neutral-600 focus:outline-none focus:border-white/20';
const labelCls = 'block text-[11px] font-medium uppercase tracking-wider text-neutral-500 mb-1.5';

// ---------- add entry (§87) ----------

interface RateEntryFormDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  rateCardId: string;
  cardType: RateCardType;
  currency: string;
}

export function RateEntryFormDrawer({ isOpen, onClose, onCreated, rateCardId, cardType, currency }: RateEntryFormDrawerProps) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [unit, setUnit] = useState<RateUnit>(cardType === 'COST' ? 'HOUR' : 'HOUR');
  const [amount, setAmount] = useState('');
  const [billingType, setBillingType] = useState<RateBillingType>('HOURLY');
  const [effectiveFrom, setEffectiveFrom] = useState(todayInTimezone());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // §73 — cost rates are HOUR-only in Phase 1; the field locks for COST cards.
  const isCost = cardType === 'COST';

  async function handleSubmit() {
    if (!name.trim()) {
      setError('Role / service name is required.');
      return;
    }
    const amt = Number(amount);
    if (amount === '' || Number.isNaN(amt) || amt < 0) {
      setError('Amount must be a number of 0 or more.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
      setError('Effective from must be a date (YYYY-MM-DD).');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/agency/rate-cards/${rateCardId}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          ...(role.trim() ? { role: role.trim() } : {}),
          unit: isCost ? 'HOUR' : unit,
          amount: amt,
          ...(isCost
            ? { billingType: 'HOURLY', billable: false }
            : { billingType, billable: billingType !== 'NON_BILLABLE' }),
          effectiveFrom,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || 'We couldn\'t add this rate. Try again.');
        return;
      }
      onCreated();
    } catch {
      setError('We couldn\'t add this rate. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title="Add Rate">
      <form onSubmit={e => { e.preventDefault(); void handleSubmit(); }} className="space-y-4">
        <div>
          <label htmlFor="rate-entry-name" className={labelCls}>Role / Service Name *</label>
          <input id="rate-entry-name" value={name} onChange={e => setName(e.target.value)} required maxLength={120} placeholder={isCost ? 'Senior Developer' : 'Design Sprint'} className={inputCls} />
          <p className="mt-1.5 text-[11px] text-neutral-600">The entry is a service, never a person (§87).</p>
        </div>
        <div>
          <label htmlFor="rate-entry-role" className={labelCls}>Finer-grained role (optional)</label>
          <input id="rate-entry-role" value={role} onChange={e => setRole(e.target.value)} maxLength={120} placeholder="Backend" className={inputCls} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="rate-entry-unit" className={labelCls}>Unit *</label>
            <Select id="rate-entry-unit" value={unit} onChange={e => setUnit(e.target.value as RateUnit)} disabled={isCost} className={`${inputCls} ${isCost ? 'opacity-60' : ''}`}>
              {RATE_UNITS.map(u => <option key={u} value={u} disabled={isCost && u !== 'HOUR'}>{u}</option>)}
            </Select>
            {isCost && <p className="mt-1.5 text-[11px] text-neutral-600">Cost rates are per hour (§73).</p>}
          </div>
          <div>
            <label htmlFor="rate-entry-amount" className={labelCls}>Amount ({currency}) *</label>
            <input id="rate-entry-amount" type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required placeholder={isCost ? '900' : '2500'} className={inputCls} />
          </div>
        </div>
        {!isCost && (
          <div>
            <label htmlFor="rate-entry-billing-type" className={labelCls}>Billing Type *</label>
            <Select id="rate-entry-billing-type" value={billingType} onChange={e => setBillingType(e.target.value as RateBillingType)} className={inputCls}>
              {RATE_BILLING_TYPES.map(b => <option key={b} value={b}>{b === 'HOURLY' ? 'Hourly' : b === 'FIXED' ? 'Fixed' : 'Non-billable'}</option>)}
            </Select>
          </div>
        )}
        <div>
          <label htmlFor="rate-entry-from" className={labelCls}>Effective From *</label>
          <DatePicker id="rate-entry-from" value={effectiveFrom} onChange={e => setEffectiveFrom(e.target.value)} required />
          <p className="mt-1.5 text-[11px] text-neutral-600">The first version of this rate starts here.</p>
        </div>

        {error && <p role="alert" className="text-[12.5px] text-red-400">{error}</p>}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.05]">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded border border-white/[0.08] text-[12.5px] text-neutral-300 hover:bg-white/[0.04] transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="px-3.5 py-1.5 rounded bg-white text-black text-[12.5px] font-semibold hover:bg-neutral-200 disabled:opacity-50 transition-colors">
            {saving ? 'Adding…' : 'Add Rate'}
          </button>
        </div>
      </form>
    </Drawer>
  );
}

// ---------- change rate (§122) ----------

interface ChangeRateDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onChanged: () => void;
  rateCardId: string;
  entryId: string;
  entryName: string;
  currentAmount: number;
  currency: string;
}

export function ChangeRateDrawer({ isOpen, onClose, onChanged, rateCardId, entryId, entryName, currentAmount, currency }: ChangeRateDrawerProps) {
  const [amount, setAmount] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(todayInTimezone());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    const amt = Number(amount);
    if (amount === '' || Number.isNaN(amt) || amt < 0) {
      setError('Amount must be a number of 0 or more.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
      setError('Effective from must be a date (YYYY-MM-DD).');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/agency/rate-cards/${rateCardId}/entries/${entryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amt, effectiveFrom }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || 'We couldn\'t change this rate. Try again.');
        return;
      }
      onChanged();
    } catch {
      setError('We couldn\'t change this rate. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title={`Change Rate — ${entryName}`}>
      <form onSubmit={e => { e.preventDefault(); void handleSubmit(); }} className="space-y-4">
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.01] px-3.5 py-3">
          <p className="text-[12.5px] text-neutral-400">
            Current rate: <span className="text-white font-medium">{currency} {currentAmount.toLocaleString('en-IN')}</span>
          </p>
          <p className="mt-1.5 text-[11.5px] text-neutral-600">
            History is never rewritten: the current version closes the day before your new date, and a new version begins (§122). Work already logged keeps its original rate.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="change-rate-amount" className={labelCls}>New Amount ({currency}) *</label>
            <input id="change-rate-amount" type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required className={inputCls} />
          </div>
          <div>
            <label htmlFor="change-rate-from" className={labelCls}>Effective From *</label>
            <DatePicker id="change-rate-from" value={effectiveFrom} onChange={e => setEffectiveFrom(e.target.value)} required />
          </div>
        </div>

        {error && <p role="alert" className="text-[12.5px] text-red-400">{error}</p>}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.05]">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded border border-white/[0.08] text-[12.5px] text-neutral-300 hover:bg-white/[0.04] transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="px-3.5 py-1.5 rounded bg-white text-black text-[12.5px] font-semibold hover:bg-neutral-200 disabled:opacity-50 transition-colors">
            {saving ? 'Changing…' : 'Change Rate'}
          </button>
        </div>
      </form>
    </Drawer>
  );
}
