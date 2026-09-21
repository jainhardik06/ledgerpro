"use client";

import React, { useEffect, useState } from 'react';
import { Drawer } from '@/components/ui/Drawer';
import { todayInTimezone } from '@/lib/agency/types/dates';
import type { RateCardEntry } from '@/lib/agency/types/rate';
import { Select } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';

/**
 * Assign a user to a cost card entry (Module 6, spec §88/§93).
 *
 * The assignment pins USER + ENTRY + FROM-DATE. §77: a user can never have
 * two cost rates on the same day — the server rejects overlaps, and an
 * open-ended assignment is auto-closed the day before the new one (§79).
 */
interface AssignCostRateDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onAssigned: () => void;
  rateCardId: string;
  entries: Pick<RateCardEntry, 'id' | 'name' | 'amount' | 'currency'>[];
}

interface SafeUser { id: string; username: string; role: string }

const inputCls = 'w-full px-3 py-2 rounded-lg bg-[#0a0a0a] border border-white/[0.06] text-[13px] text-white placeholder:text-neutral-600 focus:outline-none focus:border-white/20';
const labelCls = 'block text-[11px] font-medium uppercase tracking-wider text-neutral-500 mb-1.5';

export function AssignCostRateDrawer({ isOpen, onClose, onAssigned, rateCardId, entries }: AssignCostRateDrawerProps) {
  const [users, setUsers] = useState<SafeUser[]>([]);
  const [userId, setUserId] = useState('');
  const [entryId, setEntryId] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(todayInTimezone());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Same-team users only — /api/tenant/users is TENANT_ADMIN-gated, and this
  // drawer is only reachable behind agency.rates.manage anyway (§98).
  useEffect(() => {
    if (!isOpen || users.length > 0) return;
    fetch('/api/tenant/users')
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then(body => setUsers(body.users || []))
      .catch(() => setUsers([]));
  }, [isOpen, users.length]);

  async function handleSubmit() {
    if (!userId) {
      setError('Pick a team member.');
      return;
    }
    if (!entryId) {
      setError('Pick a rate from this card.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
      setError('Effective from must be a date (YYYY-MM-DD).');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/agency/users/${userId}/cost-rates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rateCardId, rateCardEntryId: entryId, effectiveFrom }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || 'We couldn\'t assign this cost rate. Try again.');
        return;
      }
      onAssigned();
    } catch {
      setError('We couldn\'t assign this cost rate. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title="Assign Cost Rate">
      <form onSubmit={e => { e.preventDefault(); void handleSubmit(); }} className="space-y-4">
        <div>
          <label htmlFor="assign-user" className={labelCls}>Team Member *</label>
          <Select id="assign-user" value={userId} onChange={e => setUserId(e.target.value)} className={inputCls}>
            <option value="">Select a team member</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
          </Select>
        </div>
        <div>
          <label htmlFor="assign-entry" className={labelCls}>Rate on this card *</label>
          <Select id="assign-entry" value={entryId} onChange={e => setEntryId(e.target.value)} className={inputCls}>
            <option value="">Select a rate</option>
            {entries.map(e => (
              <option key={e.id} value={e.id}>{e.name} — {e.currency} {e.amount.toLocaleString('en-IN')}/hr</option>
            ))}
          </Select>
          <p className="mt-1.5 text-[11px] text-neutral-600">The assignment pins the exact rate line, so logged time stays financially stable when rates change (§131).</p>
        </div>
        <div>
          <label htmlFor="assign-from" className={labelCls}>Effective From *</label>
          <DatePicker id="assign-from" value={effectiveFrom} onChange={e => setEffectiveFrom(e.target.value)} required />
          <p className="mt-1.5 text-[11px] text-neutral-600">
            A user can&apos;t hold two cost rates on the same day — an existing open-ended assignment is closed the day before this one starts (§77/§79).
          </p>
        </div>

        {error && <p role="alert" className="text-[12.5px] text-red-400">{error}</p>}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.05]">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded border border-white/[0.08] text-[12.5px] text-neutral-300 hover:bg-white/[0.04] transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="px-3.5 py-1.5 rounded bg-white text-black text-[12.5px] font-semibold hover:bg-neutral-200 disabled:opacity-50 transition-colors">
            {saving ? 'Assigning…' : 'Assign Rate'}
          </button>
        </div>
      </form>
    </Drawer>
  );
}
