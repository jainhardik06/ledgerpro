"use client";

import React, { useEffect, useState } from 'react';
import { Drawer } from '@/components/ui/Drawer';
import { todayInTimezone } from '@/lib/agency/types/dates';
import type { RateCard, RateCardEntry } from '@/lib/agency/types/rate';
import { Select } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';

/**
 * A team member's cost rate, managed from the person's side (Module 6, §88):
 *
 *   Team Member → Cost Rate → Select Rate Card → Effective Date
 *
 * This is the mirror of the rate-card-side "Assign to User" drawer — both
 * write the same UserCostAssignment through the same API. It shows the
 * member's full assignment history (ended ranges included) so the §64
 * "2025 keeps 2025's rate" guarantee is visible, and offers End for the
 * current open-ended range.
 *
 * Admin-only surface (§104 — cost rates are salary economics).
 */
interface UserCostRateDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  user: { id: string; username: string };
}

/** What GET /api/agency/users/:id/cost-rates returns per assignment. */
interface AssignmentRow {
  id: string;
  rateCardId: string;
  rateCardEntryId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  cardName: string;
  entryName: string;
  entryAmount: number;
  currency: string;
}

const inputCls = 'w-full px-3 py-2 rounded-lg bg-[#0a0a0a] border border-white/[0.06] text-[13px] text-white placeholder:text-neutral-600 focus:outline-none focus:border-white/20';
const labelCls = 'block text-[11px] font-medium uppercase tracking-wider text-neutral-500 mb-1.5';

function formatRange(from: string, to: string | null): string {
  return to ? `${from} → ${to}` : `${from} → open`;
}

export function UserCostRateDrawer({ isOpen, onClose, user }: UserCostRateDrawerProps) {
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New-assignment form state (§88 flow).
  const [cards, setCards] = useState<RateCard[]>([]);
  const [cardId, setCardId] = useState('');
  const [entries, setEntries] = useState<RateCardEntry[]>([]);
  const [entryId, setEntryId] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(todayInTimezone());
  const [saving, setSaving] = useState(false);
  const [endingId, setEndingId] = useState<string | null>(null);

  async function loadAssignments() {
    try {
      const res = await fetch(`/api/agency/users/${user.id}/cost-rates?includeEnded=true`);
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || 'Failed to load cost rates.');
        return;
      }
      setAssignments(body.assignments || []);
      setError(null);
    } catch {
      setError('Failed to load cost rates.');
    }
  }

  // History + the ACTIVE COST cards available for a new assignment (§76 —
  // archived cards can't take new assignments).
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    Promise.all([
      loadAssignments(),
      fetch('/api/agency/rate-cards')
        .then(res => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
        .then(body => setCards((body.cards || []).filter((c: RateCard) => c.type === 'COST' && c.status === 'ACTIVE')))
        .catch(() => setCards([])),
    ]).finally(() => setLoading(false));
  }, [isOpen, user.id]);

  // Card chosen → load its entries for the rate-line picker (§131).
  useEffect(() => {
    if (!cardId) { setEntries([]); setEntryId(''); return; }
    fetch(`/api/agency/rate-cards/${cardId}`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then(body => { setEntries(body.entries || []); setEntryId(''); })
      .catch(() => { setEntries([]); setEntryId(''); });
  }, [cardId]);

  async function handleAssign() {
    if (!cardId) { setError('Pick a cost card.'); return; }
    if (!entryId) { setError('Pick a rate from the card.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) { setError('Effective from must be a date (YYYY-MM-DD).'); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/agency/users/${user.id}/cost-rates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rateCardId: cardId, rateCardEntryId: entryId, effectiveFrom }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || 'We couldn\'t assign this cost rate. Try again.');
        return;
      }
      setCardId(''); setEntryId(''); setEffectiveFrom(todayInTimezone());
      await loadAssignments();
    } catch {
      setError('We couldn\'t assign this cost rate. Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleEnd(assignmentId: string) {
    setEndingId(assignmentId);
    setError(null);
    try {
      const res = await fetch(`/api/agency/users/${user.id}/cost-rates/${assignmentId}/end`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || 'Failed to end this cost rate.');
        return;
      }
      await loadAssignments();
    } catch {
      setError('Failed to end this cost rate.');
    } finally {
      setEndingId(null);
    }
  }

  const current = assignments.find(a => !a.effectiveTo);

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title={`Cost Rate — ${user.username}`}>
      <div className="space-y-6">
        {error && <p role="alert" className="text-[12.5px] text-red-400">{error}</p>}

        {/* Current rate — the one future time entries will resolve to (§66). */}
        <div className="rounded-xl border border-white/[0.06] bg-[#050505] p-4">
          <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500 mb-2">Current rate</div>
          {loading ? (
            <div className="text-[13px] text-neutral-500">Loading…</div>
          ) : current ? (
            <div className="space-y-1">
              <div className="text-[14px] font-semibold text-white">
                {current.entryName} — {current.currency} {current.entryAmount.toLocaleString('en-IN')}/hr
              </div>
              <div className="text-[11.5px] text-neutral-500">
                {current.cardName} · effective {formatRange(current.effectiveFrom, current.effectiveTo)}
              </div>
              <button
                type="button"
                onClick={() => handleEnd(current.id)}
                disabled={endingId === current.id}
                className="mt-2 px-3 py-1.5 rounded border border-white/[0.08] text-[12px] text-neutral-300 hover:bg-white/[0.04] disabled:opacity-50 transition-colors"
              >
                {endingId === current.id ? 'Ending…' : 'End assignment'}
              </button>
            </div>
          ) : (
            <div className="text-[13px] text-amber-400">
              No cost rate configured — this member&apos;s future time would carry UNKNOWN cost (§96), never zero.
            </div>
          )}
        </div>

        {/* New assignment (§88): card → rate line → effective date. */}
        <form onSubmit={e => { e.preventDefault(); void handleAssign(); }} className="space-y-4">
          <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Assign new cost rate</div>
          <div>
            <label htmlFor="ucr-card" className={labelCls}>Cost card *</label>
            <Select id="ucr-card" value={cardId} onChange={e => setCardId(e.target.value)} className={inputCls}>
              <option value="">Select a cost card</option>
              {cards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            {cards.length === 0 && (
              <p className="mt-1.5 text-[11px] text-neutral-600">No active cost cards — create one under Rate Cards first.</p>
            )}
          </div>
          <div>
            <label htmlFor="ucr-entry" className={labelCls}>Rate on the card *</label>
            <Select id="ucr-entry" value={entryId} onChange={e => setEntryId(e.target.value)} className={inputCls} disabled={!cardId}>
              <option value="">{cardId ? 'Select a rate' : 'Pick a card first'}</option>
              {entries.map(e => (
                <option key={e.id} value={e.id}>{e.name} — {e.currency} {e.amount.toLocaleString('en-IN')}/hr</option>
              ))}
            </Select>
            <p className="mt-1.5 text-[11px] text-neutral-600">The assignment pins the exact rate line, so logged time stays financially stable when rates change (§131).</p>
          </div>
          <div>
            <label htmlFor="ucr-from" className={labelCls}>Effective From *</label>
            <DatePicker id="ucr-from" value={effectiveFrom} onChange={e => setEffectiveFrom(e.target.value)} required />
            <p className="mt-1.5 text-[11px] text-neutral-600">
              A member can&apos;t hold two cost rates on the same day — an existing open-ended assignment is closed the day before this one starts (§77/§79).
            </p>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="submit" disabled={saving || !cardId || !entryId} className="px-3.5 py-1.5 rounded bg-white text-black text-[12.5px] font-semibold hover:bg-neutral-200 disabled:opacity-50 transition-colors">
              {saving ? 'Assigning…' : 'Assign Rate'}
            </button>
          </div>
        </form>

        {/* History — §64: old ranges keep their amounts, forever. */}
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500 mb-2">History</div>
          {assignments.length === 0 ? (
            <p className="text-[12.5px] text-neutral-600">No cost rate assignments yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {assignments.map(a => (
                <li key={a.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.04] px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-[12.5px] text-white truncate">{a.entryName} — {a.currency} {a.entryAmount.toLocaleString('en-IN')}/hr</div>
                    <div className="text-[11px] text-neutral-500 truncate">{a.cardName} · {formatRange(a.effectiveFrom, a.effectiveTo)}</div>
                  </div>
                  {!a.effectiveTo && (
                    <span className="shrink-0 text-[10px] font-semibold text-emerald-400 border border-emerald-500/25 bg-emerald-500/[0.06] px-2 py-0.5 rounded-full">CURRENT</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Drawer>
  );
}
