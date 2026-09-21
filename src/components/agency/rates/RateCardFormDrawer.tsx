"use client";

import React, { useEffect, useState } from 'react';
import { Drawer } from '@/components/ui/Drawer';
import { RATE_CARD_TYPES, RATE_CARD_SCOPES, type RateCardType, type RateCardScope } from '@/lib/agency/types/rate';
import { Select } from '@/components/ui/Select';

/**
 * Rate card creation drawer (Module 6, spec §83/§86/§91).
 *
 * §83 progressive disclosure: the primary form is 4 fields — Name, Type,
 * Scope, Currency — plus the client picker that appears ONLY when the scope
 * is CLIENT (§91: a client card requires its client). Rate LINES are added
 * on the card detail page after creation, never here.
 *
 * Two economic truths, never merged (§56): the admin picks COST (internal
 * labor economics) or BILLING (client-facing pricing) up front.
 */
interface RateCardFormDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

interface SafeClient { id: string; name: string }

const inputCls = 'w-full px-3 py-2 rounded-lg bg-[#0a0a0a] border border-white/[0.06] text-[13px] text-white placeholder:text-neutral-600 focus:outline-none focus:border-white/20';
const labelCls = 'block text-[11px] font-medium uppercase tracking-wider text-neutral-500 mb-1.5';

export function RateCardFormDrawer({ isOpen, onClose, onCreated }: RateCardFormDrawerProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<RateCardType>('BILLING');
  const [scope, setScope] = useState<RateCardScope>('ORGANIZATION');
  const [clientId, setClientId] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [clients, setClients] = useState<SafeClient[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Client options appear only for CLIENT scope (§91) — fetched when needed.
  // The clients.length dep re-fires once after the fetch lands; the guard
  // above makes that a no-op instead of a second request.
  useEffect(() => {
    if (!isOpen || scope !== 'CLIENT' || clients.length > 0) return;
    fetch('/api/agency/clients?limit=100')
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then(body => setClients(body.clients || []))
      .catch(() => setClients([]));
  }, [isOpen, scope, clients.length]);

  function reset() {
    setName('');
    setType('BILLING');
    setScope('ORGANIZATION');
    setClientId('');
    setCurrency('INR');
    setError(null);
  }

  async function handleSubmit() {
    if (!name.trim()) {
      setError('Card name is required.');
      return;
    }
    if (!/^[A-Za-z]{3}$/.test(currency.trim())) {
      setError('Currency must be a 3-letter ISO code (e.g. INR).');
      return;
    }
    if (scope === 'CLIENT' && !clientId) {
      setError('A client-scoped card needs its client (§91).');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/agency/rate-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          type,
          scope,
          ...(scope === 'CLIENT' ? { clientId } : {}),
          currency: currency.trim().toUpperCase(),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || 'We couldn\'t create this rate card. Try again.');
        return;
      }
      reset();
      onCreated();
    } catch {
      setError('We couldn\'t create this rate card. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title="New Rate Card">
      <form onSubmit={e => { e.preventDefault(); void handleSubmit(); }} className="space-y-4">
        <div>
          <label htmlFor="rate-card-name" className={labelCls}>Card Name *</label>
          <input id="rate-card-name" value={name} onChange={e => setName(e.target.value)} required maxLength={120} placeholder={type === 'COST' ? 'Agency Cost Card 2026' : 'Standard Billing Rates'} className={inputCls} />
        </div>

        <div>
          <span className={labelCls}>Type *</span>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Card type">
            {RATE_CARD_TYPES.map(t => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={type === t}
                onClick={() => setType(t)}
                className={`px-3 py-2.5 rounded-lg border text-left transition-colors ${type === t ? 'border-white/25 bg-white/[0.06] text-white' : 'border-white/[0.06] bg-white/[0.01] text-neutral-400 hover:text-neutral-200'}`}
              >
                <span className="block text-[12.5px] font-medium">{t === 'COST' ? 'Cost' : 'Billing'}</span>
                <span className="block text-[11px] text-neutral-500 mt-0.5">{t === 'COST' ? 'What labor costs you (internal)' : 'What clients are charged'}</span>
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-neutral-600">Two economic truths, never merged — a card is one or the other (§56).</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="rate-card-scope" className={labelCls}>Scope *</label>
            <Select id="rate-card-scope" value={scope} onChange={e => setScope(e.target.value as RateCardScope)} className={inputCls}>
              {RATE_CARD_SCOPES.map(s => <option key={s} value={s}>{s === 'ORGANIZATION' ? 'Organization default' : 'Client-specific'}</option>)}
            </Select>
          </div>
          <div>
            <label htmlFor="rate-card-currency" className={labelCls}>Currency *</label>
            <input id="rate-card-currency" value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} maxLength={3} placeholder="INR" className={inputCls} />
          </div>
        </div>

        {scope === 'CLIENT' && (
          <div>
            <label htmlFor="rate-card-client" className={labelCls}>Client *</label>
            <Select id="rate-card-client" value={clientId} onChange={e => setClientId(e.target.value)} className={inputCls}>
              <option value="">Select a client</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <p className="mt-1.5 text-[11px] text-neutral-600">This card prices only the selected client (§91).</p>
          </div>
        )}

        {error && <p role="alert" className="text-[12.5px] text-red-400">{error}</p>}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.05]">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded border border-white/[0.08] text-[12.5px] text-neutral-300 hover:bg-white/[0.04] transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="px-3.5 py-1.5 rounded bg-white text-black text-[12.5px] font-semibold hover:bg-neutral-200 disabled:opacity-50 transition-colors">
            {saving ? 'Creating…' : 'Create Card'}
          </button>
        </div>
      </form>
    </Drawer>
  );
}
