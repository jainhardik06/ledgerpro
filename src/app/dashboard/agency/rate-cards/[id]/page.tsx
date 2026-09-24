"use client";

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft, Tags, Plus, ChevronDown, ChevronRight, Archive, ArchiveRestore, History,
} from 'lucide-react';
import { useDashboardContext } from '@/components/dashboard/DashboardProvider';
import { tenantHasCapability } from '@/lib/agency/types/vertical';
import type {
  RateCard, RateCardEntry, RateEntryVersion, UserCostAssignment,
} from '@/lib/agency/types/rate';
import { RateEntryFormDrawer, ChangeRateDrawer } from '@/components/agency/rates/RateEntryDrawers';
import { AssignCostRateDrawer } from '@/components/agency/rates/AssignCostRateDrawer';
import { confirmModal, alertModal } from '@/components/ui/Dialog';

/**
 * Rate card detail (Module 6, spec §85/§87/§88/§122).
 *
 * Card header: name + type/scope/currency/status + archive/restore (§75).
 * Entries table: one row per rate line with its CURRENT amount; a row
 * expands into the full version history (§131) — rates change by closing
 * the old version and opening a new one, never by rewriting history.
 *
 * COST cards also carry the §88 assignment surface: who is on this card,
 * from when, and the assign flow. This page is admin-only in practice —
 * the server demands agency.rates.cost.read for COST detail (§99).
 */
interface DetailResponse {
  success: boolean;
  card: RateCard;
  entries: Array<RateCardEntry & { versions: RateEntryVersion[] }>;
  assignments?: UserCostAssignment[];
}

interface SafeUser { id: string; username: string; role: string }

function formatDate(d: string | Date | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function RateCardDetailPage() {
  const params = useParams<{ id: string }>();
  const cardId = params.id;
  const { tenant, user, loading: sessionLoading } = useDashboardContext();
  const allowed = tenantHasCapability(tenant, 'AGENCY_DASHBOARD');
  const canManage = user?.role === 'TENANT_ADMIN' || user?.role === 'SUPER_ADMIN';

  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [userLabels, setUserLabels] = useState<Record<string, string>>({});
  const [clientLabel, setClientLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [changeTarget, setChangeTarget] = useState<RateCardEntry | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const isCost = detail?.card.type === 'COST';

  const load = useCallback(() => {
    if (sessionLoading || !allowed || !cardId) return;
    setLoading(true);
    fetch(`/api/agency/rate-cards/${cardId}`)
      .then(async res => {
        if (res.status === 403) {
          setForbidden(true);
          throw new Error('forbidden');
        }
        return res.ok ? res.json() : Promise.reject(new Error('failed'));
      })
      .then(body => {
        setDetail(body);
        setError(null);
      })
      .catch(e => {
        if (e instanceof Error && e.message !== 'forbidden') {
          setError('We couldn\'t load this rate card. Try again.');
        }
      })
      .finally(() => setLoading(false));
  }, [sessionLoading, allowed, cardId]);

  useEffect(() => {
    if (!sessionLoading && allowed) load();
  }, [load, sessionLoading, allowed]);

  // User labels for the COST assignment table (§88) and the client label for
  // CLIENT-scoped cards (§60) — lightweight parallel fetches after the detail
  // lands (the detail tells us whether each is needed at all).
  useEffect(() => {
    if (!detail) return;
    if (detail.card.type === 'COST') {
      fetch('/api/tenant/users')
        .then(res => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
        .then(body => {
          const labels: Record<string, string> = {};
          for (const u of body.users || []) labels[u.id] = u.username;
          setUserLabels(labels);
        })
        .catch(() => setUserLabels({}));
    }
    if (detail.card.scope === 'CLIENT' && detail.card.clientId) {
      fetch(`/api/agency/clients/${detail.card.clientId}`)
        .then(res => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
        .then(body => setClientLabel(body.client?.name ?? null))
        .catch(() => setClientLabel(null));
    }
  }, [detail]);

  async function toggleArchive() {
    if (!detail) return;
    const action = detail.card.status === 'ACTIVE' ? 'archive' : 'restore';
    const ok = await confirmModal({
      title: action === 'archive' ? 'Archive Rate Card' : 'Restore Rate Card',
      message: action === 'archive'
        ? `Archive "${detail.card.name}"? It stops receiving new entries and assignments; history keeps reading it.`
        : `Restore "${detail.card.name}" to ACTIVE?`,
      confirmText: action === 'archive' ? 'Archive' : 'Restore',
      variant: action === 'archive' ? 'warning' : 'default',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/agency/rate-cards/${cardId}/${action}`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        await alertModal({
          title: 'Action Failed',
          message: body.error || 'That didn\'t work. Try again.',
          variant: 'error',
        });
      }
      load();
    } catch {
      await alertModal({
        title: 'Action Failed',
        message: 'That didn\'t work. Try again.',
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  }

  async function endAssignment(a: UserCostAssignment) {
    const ok = await confirmModal({
      title: 'End Cost Rate Assignment',
      message: 'End this cost rate as of today? History stays readable.',
      confirmText: 'End Rate',
      variant: 'warning',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/agency/users/${a.userId}/cost-rates/${a.id}/end`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        await alertModal({
          title: 'Action Failed',
          message: body.error || 'That didn\'t work. Try again.',
          variant: 'error',
        });
      }
      load();
    } catch {
      await alertModal({
        title: 'Action Failed',
        message: 'That didn\'t work. Try again.',
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  }

  if (!sessionLoading && !allowed) {
    return (
      <div className="p-6 max-w-md mx-auto text-center">
        <Tags className="w-8 h-8 mx-auto text-neutral-700" aria-hidden />
        <h1 className="mt-4 text-[16px] font-semibold text-white">Agency workspace required</h1>
        <Link href="/dashboard" className="mt-4 inline-block text-[13px] text-neutral-300 underline underline-offset-4">Go to the standard dashboard</Link>
      </div>
    );
  }

  if (!sessionLoading && forbidden) {
    return (
      <div className="p-6 max-w-md mx-auto text-center">
        <Tags className="w-8 h-8 mx-auto text-neutral-700" aria-hidden />
        <h1 className="mt-4 text-[16px] font-semibold text-white">Cost rates are restricted</h1>
        <p className="mt-2 text-[13px] text-neutral-500">Cost rates contain sensitive financial data — only workspace administrators can view them.</p>
        <Link href="/dashboard/agency/rate-cards" className="mt-4 inline-block text-[13px] text-neutral-300 underline underline-offset-4">Back to rate cards</Link>
      </div>
    );
  }

  const card = detail?.card;

  return (
    <div className="p-4 sm:p-6 space-y-5 w-full">
      <Link href="/dashboard/agency/rate-cards" className="inline-flex items-center gap-1.5 text-[12.5px] text-neutral-400 hover:text-white transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden /> Rate Cards
      </Link>

      {loading && (
        <div className="space-y-2" aria-busy="true" aria-label="Loading rate card">
          <div className="h-20 rounded-xl bg-white/[0.03] animate-pulse" />
          <div className="h-40 rounded-xl bg-white/[0.03] animate-pulse" />
        </div>
      )}

      {error && !loading && (
        <div role="alert" className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
          <p className="text-[13px] text-neutral-200">{error}</p>
          <button onClick={load} className="mt-2 text-[12.5px] text-neutral-400 underline underline-offset-4">Retry</button>
        </div>
      )}

      {card && detail && !loading && !error && (
        <>
          {/* Card header (§85) */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[16px] font-semibold text-white tracking-tight">{card.name}</h1>
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${card.type === 'COST' ? 'text-amber-400 border-amber-500/25 bg-amber-500/[0.06]' : 'text-sky-400 border-sky-500/25 bg-sky-500/[0.06]'}`}>
                  {card.type === 'COST' ? 'Cost' : 'Billing'}
                </span>
                <span className={`text-[11px] font-medium ${card.status === 'ACTIVE' ? 'text-emerald-400' : 'text-neutral-500'}`}>
                  {card.status === 'ACTIVE' ? 'Active' : 'Archived'}
                </span>
              </div>
              <p className="mt-1 text-[12.5px] text-neutral-500">
                {card.scope === 'ORGANIZATION' ? 'Organization default' : `Client — ${clientLabel ?? 'Client'}`}
                {' · '}{card.currency}
                {' · '}Updated {formatDate(card.updatedAt ?? card.createdAt)}
              </p>
              <p className="mt-1.5 text-[11.5px] text-neutral-600 max-w-xl">
                {card.type === 'COST'
                  ? 'Internal labor economics — what an hour of your team costs you. Assigned to team members; never client-facing.'
                  : 'Client-facing pricing — billable rates per service role.'}
              </p>
            </div>
            {canManage && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAddOpen(true)}
                  disabled={card.status === 'ARCHIVED'}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white text-black text-[12.5px] font-semibold hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden /> Add Rate
                </button>
                <button
                  onClick={() => void toggleArchive()}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-white/[0.08] text-[12.5px] text-neutral-300 hover:bg-white/[0.04] disabled:opacity-40 transition-colors"
                >
                  {card.status === 'ACTIVE'
                    ? <><Archive className="w-3.5 h-3.5" aria-hidden /> Archive</>
                    : <><ArchiveRestore className="w-3.5 h-3.5" aria-hidden /> Restore</>}
                </button>
              </div>
            )}
          </div>
          {card.status === 'ARCHIVED' && (
            <p className="text-[12px] text-neutral-500">This card is archived — existing historical records will continue referencing its rates.</p>
          )}

          {/* Entries + version history (§85/§87/§122) */}
          <div className="rounded-xl border border-white/[0.06] overflow-hidden overflow-x-auto">
            <table className="w-full text-[13px]" aria-label="Rate entries">
              <thead>
                <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-neutral-500">
                  <th scope="col" className="px-4 py-3 font-medium w-8"><span className="sr-only">Expand</span></th>
                  <th scope="col" className="px-4 py-3 font-medium">Role / Service</th>
                  <th scope="col" className="px-4 py-3 font-medium">Unit</th>
                  <th scope="col" className="px-4 py-3 font-medium">Current Amount</th>
                  <th scope="col" className="px-4 py-3 font-medium">Billable</th>
                  <th scope="col" className="px-4 py-3 font-medium">Versions</th>
                  {canManage && <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">Actions</span></th>}
                </tr>
              </thead>
              <tbody>
                {detail.entries.length === 0 && (
                  <tr>
                    <td colSpan={canManage ? 7 : 6} className="px-4 py-8 text-center text-neutral-500">
                      No rates on this card yet. Add the first rate line — e.g. &ldquo;Senior Developer&rdquo;.
                    </td>
                  </tr>
                )}
                {detail.entries.map(e => {
                  const open = expandedEntry === e.id;
                  return (
                    <React.Fragment key={e.id}>
                      <tr className={`border-b border-white/[0.04] ${open ? 'bg-white/[0.02]' : 'hover:bg-white/[0.02]'} transition-colors`}>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setExpandedEntry(open ? null : e.id)}
                            aria-expanded={open}
                            aria-label={open ? `Collapse ${e.name} versions` : `Expand ${e.name} versions`}
                            className="p-1 rounded text-neutral-500 hover:text-white hover:bg-white/[0.05] transition-colors"
                          >
                            {open ? <ChevronDown className="w-3.5 h-3.5" aria-hidden /> : <ChevronRight className="w-3.5 h-3.5" aria-hidden />}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-white">{e.name}</span>
                          {e.role && <div className="text-[11.5px] text-neutral-500">{e.role}</div>}
                        </td>
                        <td className="px-4 py-3 text-neutral-400">{e.unit === 'HOUR' ? '/hr' : e.unit === 'DAY' ? '/day' : 'fixed'}</td>
                        <td className="px-4 py-3 text-neutral-200">{e.currency} {e.amount.toLocaleString('en-IN')}</td>
                        <td className="px-4 py-3 text-neutral-400">{e.billable ? 'Yes' : 'No'}</td>
                        <td className="px-4 py-3 text-neutral-400">{e.versions.length}</td>
                        {canManage && (
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => setChangeTarget(e)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-white/[0.08] text-[11.5px] text-neutral-300 hover:bg-white/[0.04] transition-colors"
                            >
                              <History className="w-3.5 h-3.5" aria-hidden /> Change Rate
                            </button>
                          </td>
                        )}
                      </tr>
                      {open && (
                        <tr className="bg-white/[0.015]">
                          <td colSpan={canManage ? 7 : 6} className="px-4 py-3">
                            <div className="pl-8">
                              <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500 mb-2">Version history</div>
                              {e.versions.length === 0 ? (
                                <p className="text-[12px] text-neutral-500">No versions recorded.</p>
                              ) : (
                                <ul className="space-y-1.5">
                                  {[...e.versions].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1)).map(v => (
                                    <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px]">
                                      <span className="font-mono text-neutral-200">{e.currency} {v.amount.toLocaleString('en-IN')}</span>
                                      <span className="text-neutral-500">
                                        {v.effectiveFrom} → {v.effectiveTo ?? 'open'}
                                      </span>
                                      {v.effectiveTo == null && <span className="text-[10.5px] text-emerald-400/80">current</span>}
                                    </li>
                                  ))}
                                </ul>
                              )}
                              <p className="mt-2 text-[11px] text-neutral-600">Rate updates close the prior version when the new version takes effect, preserving past financial history.</p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* §88 — COST cards: who is on this card */}
          {isCost && (
            <div className="rounded-xl border border-white/[0.06] overflow-hidden overflow-x-auto">
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-white/[0.06]">
                <div>
                  <h2 className="text-[13.5px] font-semibold text-white">Team members on this card</h2>
                  <p className="text-[11.5px] text-neutral-500">Cost assignments define member cost rates across effective date ranges.</p>
                </div>
                {canManage && card.status === 'ACTIVE' && (
                  <button
                    onClick={() => setAssignOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white text-black text-[12.5px] font-semibold hover:bg-neutral-200 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden /> Assign to User
                  </button>
                )}
              </div>
              {(detail.assignments?.length ?? 0) === 0 ? (
                <p className="px-4 py-6 text-center text-[12.5px] text-neutral-500">
                  Nobody is assigned yet. A team member&apos;s cost rate resolves via an assignment. Without one, their cost is tracked as unassigned.
                </p>
              ) : (
                <table className="w-full text-[13px]" aria-label="Cost assignments">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-neutral-500">
                      <th scope="col" className="px-4 py-2.5 font-medium">Member</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Rate</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Effective</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                      {canManage && <th scope="col" className="px-4 py-2.5 font-medium"><span className="sr-only">Actions</span></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.assignments!.map(a => {
                      const entryName = detail.entries.find(e => e.id === a.rateCardEntryId)?.name ?? '—';
                      const ended = a.effectiveTo != null;
                      return (
                        <tr key={a.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-2.5 text-white">{userLabels[a.userId] || 'Team Member'}</td>
                          <td className="px-4 py-2.5 text-neutral-300">{entryName}</td>
                          <td className="px-4 py-2.5 text-neutral-400">{a.effectiveFrom} → {a.effectiveTo ?? 'open'}</td>
                          <td className={`px-4 py-2.5 font-medium ${ended ? 'text-neutral-500' : 'text-emerald-400'}`}>{ended ? 'Ended' : 'Active'}</td>
                          {canManage && (
                            <td className="px-4 py-2.5 text-right">
                              {!ended && (
                                <button
                                  onClick={() => void endAssignment(a)}
                                  disabled={busy}
                                  className="px-2.5 py-1 rounded border border-white/[0.08] text-[11.5px] text-neutral-300 hover:bg-white/[0.04] disabled:opacity-40 transition-colors"
                                >
                                  End
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}

      {/* Drawers (§87/§122/§88) */}
      {detail && card && (
        <>
          <RateEntryFormDrawer
            isOpen={addOpen}
            onClose={() => setAddOpen(false)}
            onCreated={() => { setAddOpen(false); load(); }}
            rateCardId={cardId}
            cardType={card.type}
            currency={card.currency}
          />
          {changeTarget && (
            <ChangeRateDrawer
              isOpen={!!changeTarget}
              onClose={() => setChangeTarget(null)}
              onChanged={() => { setChangeTarget(null); load(); }}
              rateCardId={cardId}
              entryId={changeTarget.id}
              entryName={changeTarget.name}
              currentAmount={changeTarget.amount}
              currency={changeTarget.currency}
            />
          )}
          {isCost && card.status === 'ACTIVE' && (
            <AssignCostRateDrawer
              isOpen={assignOpen}
              onClose={() => setAssignOpen(false)}
              onAssigned={() => { setAssignOpen(false); load(); }}
              rateCardId={cardId}
              entries={detail.entries.map(e => ({ id: e.id, name: e.name, amount: e.amount, currency: e.currency }))}
            />
          )}
        </>
      )}
    </div>
  );
}
