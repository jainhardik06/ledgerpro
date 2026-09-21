"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, Building2, MoreHorizontal, Eye, UserSquare2, Copy, Check, ChevronRight,
  Loader2, ShieldAlert, ShieldCheck, CreditCard, AlertTriangle, X,
} from 'lucide-react';
import { Drawer } from '@/components/ui/Drawer';
import { SearchBar } from '@/components/ui/SearchBar';
import { TENANT_PLANS, formatPlanPrice, type TenantPlan } from '@/lib/plans';

type TenantStatus = 'ACTIVE' | 'SUSPENDED';

interface TenantRow {
  id: string;
  name: string;
  plan: string;
  status: TenantStatus;
  appMode?: string;
}

interface TenantDetail {
  id: string;
  name: string;
  status: TenantStatus;
  plan: string;
  appMode: string;
  settings: { appName?: string; themeColor?: string };
  limits: { maxUsers: number };
  attribution: Record<string, string> | null;
  createdAt: string | null;
}

interface TeamMember {
  id: string;
  username: string;
  role: 'TENANT_ADMIN' | 'USER';
  status: 'ACTIVE' | 'LOCKED';
  createdAt: string | null;
}

interface TeamSummary {
  total: number;
  admins: number;
  active: number;
  members: TeamMember[];
}

/** What a row action is currently doing — drives the per-item spinner. */
interface PendingAction {
  tenantId: string;
  label: string;
}

// The kebab menu is the one control on a row. It is rendered once, outside the
// table (see `openMenu` below) rather than inside the row's cell: the cell is
// hover-revealed and lives in a scroll container, so anything anchored inside
// it inherits that opacity and gets clipped by the scroll box. Positioning it
// against the viewport from the trigger's rect avoids both — and a single
// instance means there is no way for two rows' menus to be open at once.
export default function TenantsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [detailsTenantId, setDetailsTenantId] = useState<string | null>(null);
  const [planPickerOpen, setPlanPickerOpen] = useState(false);
  const [menu, setMenu] = useState<{ tenant: TenantRow; anchor: DOMRect } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const fetchTenants = async () => {
      try {
        const res = await fetch('/api/super-admin/tenants');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setTenants(data.tenants || []);
      } catch (e) {
        console.error('Failed to fetch tenants', e);
        setError('Failed to load organizations.');
      } finally {
        setLoading(false);
      }
    };
    fetchTenants();
  }, []);

  const closeMenu = () => {
    setMenu(null);
    setPlanPickerOpen(false);
  };

  // The menu is anchored to a viewport rect, so a scroll or resize invalidates
  // it. Closing is the honest response — re-anchoring mid-scroll is how a menu
  // ends up floating next to the wrong row.
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeMenu();
        triggerRef.current?.focus();
      }
    };
    const onMove = () => closeMenu();
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [menu]);

  const toggleMenu = (tenant: TenantRow, button: HTMLButtonElement) => {
    if (menu?.tenant.id === tenant.id) {
      closeMenu();
      return;
    }
    triggerRef.current = button;
    setError(null);
    setPlanPickerOpen(false);
    setMenu({ tenant, anchor: button.getBoundingClientRect() });
  };

  const filteredTenants = tenants.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.id.toLowerCase().includes(search.toLowerCase())
  );

  /**
   * Persist a tenant change. The row updates optimistically and is put back the
   * way it was if the write is rejected — a failed platform change must never
   * leave the console showing a state that was not saved.
   */
  const patchTenant = async (
    tenantId: string,
    updates: { status?: TenantStatus; plan?: TenantPlan },
    label: string
  ) => {
    closeMenu();
    setError(null);
    setPending({ tenantId, label });
    const previous = tenants.find(t => t.id === tenantId);

    setTenants(prev => prev.map(t => (t.id === tenantId ? { ...t, ...updates } : t)));

    try {
      const res = await fetch(`/api/super-admin/tenants/${tenantId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `The change was rejected (HTTP ${res.status}).`);
      }
    } catch (e) {
      if (previous) {
        setTenants(prev => prev.map(t => (t.id === tenantId ? previous : t)));
      }
      setError(e instanceof Error ? e.message : 'Failed to update the organization.');
    } finally {
      setPending(null);
    }
  };

  const handleImpersonate = async (tenant: TenantRow) => {
    closeMenu();
    setError(null);
    setPending({ tenantId: tenant.id, label: 'impersonate' });
    try {
      const res = await fetch('/api/super-admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: tenant.id }),
      });
      if (!res.ok) {
        // A workspace with no TENANT_ADMIN is the common case here — say so
        // instead of leaving the click looking like it did nothing.
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Impersonation failed (HTTP ${res.status}).`);
      }
      router.push('/dashboard');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to impersonate this organization.');
    } finally {
      setPending(null);
    }
  };

  const handleCopyId = async (tenantId: string) => {
    closeMenu();
    try {
      await navigator.clipboard.writeText(tenantId);
      setCopiedId(tenantId);
      window.setTimeout(() => setCopiedId(current => (current === tenantId ? null : current)), 2000);
    } catch {
      setError('Could not copy the tenant ID — the browser blocked clipboard access.');
    }
  };

  const menuPending = menu && pending?.tenantId === menu.tenant.id ? pending.label : null;

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] animate-in fade-in duration-500">

      {/* Header Actions */}
      <div className="p-4 sm:p-6 shrink-0 border-b border-white/[0.05] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white mb-1">Organization Directory</h1>
          <p className="text-[12px] sm:text-[13px] text-neutral-400">Manage all tenant workspaces, plans, and statuses.</p>
        </div>
        <SearchBar
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search organizations…"
          aria-label="Search organizations"
          wrapperClassName="w-full sm:w-64 shrink-0"
        />
      </div>

      {/* Action outcome — a rejected change is stated, not swallowed */}
      {error && (
        <div role="alert" className="shrink-0 mx-6 mt-4 flex items-start gap-2.5 rounded-md border border-rose-500/20 bg-rose-500/10 px-3 py-2.5">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-px" />
          <p className="flex-1 text-[12.5px] text-rose-200">{error}</p>
          <button
            onClick={() => setError(null)}
            aria-label="Dismiss error"
            className="p-0.5 rounded text-rose-300 hover:text-white hover:bg-white/[0.1] transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Edge-to-edge Data Table */}
      <div className="flex-1 overflow-auto bg-[#000000]">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-[#000000] z-10 shadow-[0_1px_0_rgba(255,255,255,0.05)]">
            <tr>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest w-1/3">Organization Name</th>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest">Plan</th>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest">Status</th>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {loading ? (
              <tr>
                 <td colSpan={4} className="px-6 py-8 text-center text-[13px] text-neutral-500">Loading organizations...</td>
              </tr>
            ) : filteredTenants.length === 0 ? (
              <tr>
                 <td colSpan={4} className="px-6 py-8 text-center text-[13px] text-neutral-500">No organizations found.</td>
              </tr>
            ) : (
              filteredTenants.map(tenant => {
                const isBusy = pending?.tenantId === tenant.id;
                const isOpen = menu?.tenant.id === tenant.id;
                return (
                  <tr key={tenant.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-md border border-white/[0.05] bg-[#0a0a0a] flex items-center justify-center shrink-0">
                          <Building2 className="w-4 h-4 text-neutral-400" />
                        </div>
                        <div>
                          <div className="text-[14px] font-medium text-white mb-0.5">{tenant.name}</div>
                          <div className="text-[11px] text-neutral-500">{tenant.appMode === 'Student_Club' ? 'Student Club' : tenant.appMode === 'Agency' ? 'Agency Vertical' : 'Standard Workspace'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[12px] font-medium text-neutral-300 tracking-wide">{tenant.plan}</span>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={tenant.status} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      {/* Revealed on hover, but always visible on touch (no hover
                          exists there) and while this row's menu is open. */}
                      <div
                        className={`flex items-center justify-end gap-2 transition-opacity ${
                          isOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100 max-md:opacity-100'
                        }`}
                      >
                        {isBusy && <Loader2 className="w-3.5 h-3.5 animate-spin text-neutral-500" aria-hidden />}
                        <button
                          onClick={e => toggleMenu(tenant, e.currentTarget)}
                          aria-label={`Actions for ${tenant.name}`}
                          aria-haspopup="menu"
                          aria-expanded={isOpen}
                          className={`p-1.5 rounded transition-colors ${
                            isOpen ? 'bg-white/[0.1] text-white' : 'text-neutral-400 hover:text-white hover:bg-white/[0.1]'
                          }`}
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {menu && (
        <AnchoredMenu anchor={menu.anchor} onClose={closeMenu}>
          <div className="px-3 py-2 border-b border-white/[0.05]">
            <div className="text-[12.5px] font-medium text-white truncate">{menu.tenant.name}</div>
            <div className="text-[10px] text-neutral-500 truncate">{menu.tenant.plan} · {menu.tenant.appMode || 'Standard'}</div>
          </div>

          <div className="py-1">
            <MenuItem
              icon={Eye}
              label="View details"
              disabled={!!menuPending}
              onClick={() => { const id = menu.tenant.id; closeMenu(); setDetailsTenantId(id); }}
            />
            <MenuItem
              icon={UserSquare2}
              label="Impersonate admin"
              busy={menuPending === 'impersonate'}
              disabled={!!menuPending && menuPending !== 'impersonate'}
              onClick={() => handleImpersonate(menu.tenant)}
            />
          </div>

          <div className="border-t border-white/[0.05] py-1">
            <MenuItem
              icon={CreditCard}
              label="Change plan"
              disabled={!!menuPending}
              onClick={() => setPlanPickerOpen(open => !open)}
              trailing={
                <ChevronRight className={`w-3.5 h-3.5 text-neutral-500 transition-transform ${planPickerOpen ? 'rotate-90' : ''}`} />
              }
            />
            {planPickerOpen && (
              <div className="pb-1">
                {TENANT_PLANS.map(plan => {
                  const current = menu.tenant.plan === plan;
                  return (
                    <button
                      key={plan}
                      role="menuitem"
                      disabled={current || !!menuPending}
                      onClick={() => patchTenant(menu.tenant.id, { plan }, 'plan')}
                      className="w-full flex items-center gap-2.5 pl-8 pr-3 py-1.5 text-left text-[12px] text-neutral-300 hover:bg-white/[0.06] hover:text-white transition-colors disabled:opacity-60 disabled:cursor-default"
                    >
                      <Check className={`w-3.5 h-3.5 shrink-0 ${current ? 'text-emerald-400' : 'text-transparent'}`} />
                      <span className="flex-1">{plan[0] + plan.slice(1).toLowerCase()}</span>
                      <span className="text-[10px] font-mono text-neutral-500">{formatPlanPrice(plan)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-t border-white/[0.05] py-1">
            {menu.tenant.status === 'ACTIVE' ? (
              <MenuItem
                icon={ShieldAlert}
                tone="danger"
                label="Suspend organization"
                busy={menuPending === 'status'}
                disabled={!!menuPending && menuPending !== 'status'}
                onClick={() => patchTenant(menu.tenant.id, { status: 'SUSPENDED' }, 'status')}
              />
            ) : (
              <MenuItem
                icon={ShieldCheck}
                tone="success"
                label="Reactivate organization"
                busy={menuPending === 'status'}
                disabled={!!menuPending && menuPending !== 'status'}
                onClick={() => patchTenant(menu.tenant.id, { status: 'ACTIVE' }, 'status')}
              />
            )}
            <MenuItem
              icon={copiedId === menu.tenant.id ? Check : Copy}
              label={copiedId === menu.tenant.id ? 'Copied' : 'Copy tenant ID'}
              disabled={!!menuPending}
              onClick={() => handleCopyId(menu.tenant.id)}
            />
          </div>
        </AnchoredMenu>
      )}

      <TenantDetailsDrawer tenantId={detailsTenantId} onClose={() => setDetailsTenantId(null)} />
    </div>
  );
}

function StatusBadge({ status }: { status: TenantStatus }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold font-mono tracking-widest uppercase ${
      status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
    }`}>
      {status}
    </span>
  );
}

/**
 * A viewport-anchored dropdown. Fixed positioning keeps it clear of the table's
 * scroll containers, and the measured clamp flips it above the trigger when
 * there is not enough room below (the last rows of a long table).
 */
function AnchoredMenu({
  anchor, onClose, children,
}: {
  anchor: DOMRect;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const place = () => {
      const { width, height } = el.getBoundingClientRect();
      const margin = 8;
      let top = anchor.bottom + 4;
      if (top + height > window.innerHeight - margin) {
        top = Math.max(margin, anchor.top - height - 4);
      }
      const left = Math.min(Math.max(margin, anchor.right - width), window.innerWidth - width - margin);
      setPosition({ top, left });
    };

    place();
    // The plan picker expands inside this menu, so the height changes after the
    // first placement — re-clamp on every size change (setPosition only moves
    // the box, which cannot feed a resize back into the observer).
    const observer = new ResizeObserver(place);
    observer.observe(el);
    return () => observer.disconnect();
  }, [anchor]);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="menu"
        tabIndex={-1}
        aria-label="Organization actions"
        style={{
          top: position?.top ?? anchor.bottom + 4,
          left: position?.left ?? anchor.left,
          visibility: position ? 'visible' : 'hidden',
        }}
        className="fixed z-50 w-60 rounded-md border border-white/[0.1] bg-[#0a0a0a] shadow-2xl outline-none"
      >
        {children}
      </div>
    </>
  );
}

function MenuItem({
  icon: Icon, label, onClick, disabled, busy, tone = 'default', trailing,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  tone?: 'default' | 'danger' | 'success';
  trailing?: React.ReactNode;
}) {
  const toneClass =
    tone === 'danger' ? 'text-rose-400 hover:bg-rose-500/10' :
    tone === 'success' ? 'text-emerald-400 hover:bg-emerald-500/10' :
    'text-neutral-300 hover:bg-white/[0.06] hover:text-white';

  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled || busy}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-[12.5px] text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${toneClass}`}
    >
      {busy
        ? <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
        : <Icon className="w-3.5 h-3.5 shrink-0" />}
      <span className="flex-1">{label}</span>
      {trailing}
    </button>
  );
}

/**
 * The tenant record, read on open from /api/super-admin/tenants/[id].
 *
 * Everything shown comes from the stored document or the workspace's own users
 * — there are no estimated figures here. The agency-specific metrics live on
 * /super-admin/agency, resolved by the tenant-side engines.
 */
function TenantDetailsDrawer({ tenantId, onClose }: { tenantId: string | null; onClose: () => void }) {
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [team, setTeam] = useState<TeamSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) {
      setTenant(null);
      setTeam(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setTenant(null);
    setTeam(null);

    fetch(`/api/super-admin/tenants/${tenantId}`)
      .then(async res => {
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error || `Failed to load the organization (HTTP ${res.status}).`);
        return body;
      })
      .then(body => {
        if (cancelled) return;
        setTenant(body.tenant);
        setTeam(body.team);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load the organization.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [tenantId]);

  const formatDate = (value: string | null) => (value ? new Date(value).toLocaleDateString() : '—');

  return (
    <Drawer isOpen={!!tenantId} onClose={onClose} title="Organization Details">
      {loading && (
        <div className="flex items-center gap-2 text-[13px] text-neutral-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading organization...
        </div>
      )}

      {!loading && error && (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-rose-500/20 bg-rose-500/10 px-3 py-2.5">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-px" />
          <p className="text-[12.5px] text-rose-200">{error}</p>
        </div>
      )}

      {!loading && tenant && (
        <div className="space-y-7">
          <section>
            <h3 className="text-[11px] font-semibold text-neutral-500 uppercase tracking-widest mb-3">Identity</h3>
            <dl className="space-y-2.5">
              <DetailRow label="Name" value={tenant.name} />
              <DetailRow label="Tenant ID" value={tenant.id} mono />
              <DetailRow label="Created" value={formatDate(tenant.createdAt)} />
              <DetailRow label="Workspace name" value={tenant.settings?.appName || '—'} />
            </dl>
          </section>

          <section>
            <h3 className="text-[11px] font-semibold text-neutral-500 uppercase tracking-widest mb-3">Plan &amp; status</h3>
            <dl className="space-y-2.5">
              <DetailRow label="Status" value={<StatusBadge status={tenant.status} />} />
              <DetailRow label="Plan" value={<span className="text-[13px] text-white">{tenant.plan}</span>} />
              <DetailRow label="App mode" value={tenant.appMode} />
              <DetailRow label="Seat limit" value={String(tenant.limits?.maxUsers ?? '—')} />
            </dl>
          </section>

          {tenant.attribution && Object.keys(tenant.attribution).length > 0 && (
            <section>
              <h3 className="text-[11px] font-semibold text-neutral-500 uppercase tracking-widest mb-3">Acquisition</h3>
              <dl className="space-y-2.5">
                {Object.entries(tenant.attribution).map(([key, value]) => (
                  <DetailRow key={key} label={key.replace(/_/g, ' ')} value={String(value)} />
                ))}
              </dl>
            </section>
          )}

          <section>
            <h3 className="text-[11px] font-semibold text-neutral-500 uppercase tracking-widest mb-3">
              Team {team ? `(${team.active} active of ${team.total})` : ''}
            </h3>
            {team && team.members.length > 0 ? (
              <ul className="space-y-2">
                {team.members.map(member => (
                  <li key={member.id} className="flex items-center justify-between gap-3 rounded-md border border-white/[0.05] bg-white/[0.02] px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-[13px] text-white truncate">{member.username}</div>
                      <div className="text-[10.5px] text-neutral-500">
                        {member.role === 'TENANT_ADMIN' ? 'Tenant admin' : 'User'} · joined {formatDate(member.createdAt)}
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold font-mono tracking-widest uppercase ${
                      member.status === 'ACTIVE' ? 'text-emerald-400' : 'text-amber-400'
                    }`}>
                      {member.status}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12.5px] text-neutral-500">No users in this workspace yet.</p>
            )}
          </section>
        </div>
      )}
    </Drawer>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-[12px] text-neutral-500 capitalize shrink-0">{label}</dt>
      <dd className={`text-[13px] text-neutral-200 text-right break-all ${mono ? 'font-mono text-[12px]' : ''}`}>{value}</dd>
    </div>
  );
}
