"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { Drawer } from '@/components/ui/Drawer';
import { ClientFormDrawer, type ClientFormValues } from '@/components/agency/clients/ClientFormDrawer';
import { BILLING_MODELS, type BillingModel, type AgencyClient } from '@/lib/agency/types/client';
import { applyClientCommercialDefaults } from '@/lib/agency/defaults/project-defaults';
import { DEFAULT_PROJECT_TYPES } from '@/lib/agency/types/agency-settings';
import { Select } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';
import { Req, Opt } from '@/components/ui/Req';
import { cn } from '@/lib/utils';

/**
 * Project creation wizard (Module 3, spec §71 / Step 3.6).
 *
 * Seven steps in the spec's order (§71):
 *   Client → Basics → Commercial → Budget → Timeline → Team → Review
 *
 * Smart defaults (§49/§72): picking a client pre-fills currency and billing
 * model from its commercialDefaults — overridable, never silent-locked.
 *
 * §95 — "+ Create Client" nests the Module 2 drawer WITHOUT losing wizard
 * state; the new client is created, selected, and its defaults applied.
 *
 * §74 — the wizard creates a DRAFT. Activation is a dedicated later action
 * with its own gate (§75); the success panel says so honestly.
 *
 * Advisory warnings (§73/§54) come back with the 201 and are surfaced —
 * a draft with warnings is legal, never blocked.
 */

const STEPS = ['Client', 'Basics', 'Commercial', 'Budget', 'Timeline', 'Team', 'Review'] as const;

const inputCls = 'w-full px-3 py-2 rounded-lg bg-[#0a0a0a] border border-white/[0.06] text-[13px] text-white placeholder:text-neutral-600 focus:outline-none focus:border-white/20';
const labelCls = 'block text-[11px] font-medium uppercase tracking-wider text-neutral-500 mb-1.5';

/** Advisory warnings recomputed live from the same rules the server enforces. */
function computeWarnings(state: WizardState): string[] {
  const warnings: string[] = [];
  if (state.billingModel === 'FIXED_FEE' && !state.contractValue && !state.revenueBudget) {
    warnings.push('Fixed-fee project has no contract value yet — set one before activation (recommended)');
  }
  if (state.billingModel === 'TIME_AND_MATERIALS' && !state.plannedHours) {
    warnings.push('T&M project has no planned hours baseline — revenue will derive from billable hours once Time Tracking lands');
  }
  const revenue = num(state.revenueBudget);
  const cost = num(state.budgetCost);
  const margin = num(state.targetMargin);
  if (revenue !== undefined && revenue > 0 && cost !== undefined && margin !== undefined) {
    const expected = ((revenue - cost) / revenue) * 100;
    if (expected < margin) {
      warnings.push(`Your target margin (${margin}%) is higher than the planned budget allows (${expected.toFixed(1)}%)`);
    }
  }
  return warnings;
}

function num(v: string | undefined): number | undefined {
  if (v === undefined || v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export interface WizardMember {
  userId: string;
  role: string;
  allocationPercent: string;
}

export interface WizardState {
  clientId: string;
  name: string;
  description: string;
  projectType: string;
  tags: string; // comma-separated input, split on submit
  billingModel: BillingModel | '';
  currency: string;
  contractValue: string;
  revenueBudget: string;
  budgetCost: string;
  targetMargin: string;
  plannedHours: string;
  startDate: string;
  endDate: string;
  projectManagerId: string;
}

export function validateWizardStep(current: number, state: WizardState): string | null {
  if (current === 0 && !state.clientId) return 'Pick a client first — every project belongs to one.';
  if (current === 1 && !state.name.trim()) return 'Project name is required.';
  if (current === 2 && !state.billingModel) return 'Billing model is required.';
  if (current === 2 && !/^[A-Z]{3}$/.test(state.currency.trim().toUpperCase())) return 'Currency must be a 3-letter code (e.g. INR, USD).';
  if (current === 3) {
    for (const [label, v] of [['Contract value', state.contractValue], ['Revenue budget', state.revenueBudget], ['Budget cost', state.budgetCost], ['Target margin', state.targetMargin], ['Planned hours', state.plannedHours]] as const) {
      const n = num(v);
      if (n !== undefined && n < 0) return `${label} cannot be negative.`;
    }
    const margin = num(state.targetMargin);
    if (margin !== undefined && (margin < 0 || margin > 100)) return 'Target margin must be between 0 and 100.';
  }
  if (current === 4) {
    if (state.startDate && state.endDate && state.endDate < state.startDate) return 'End date cannot be before the start date.';
  }
  return null;
}

export const EMPTY_WIZARD_STATE: WizardState = {
  clientId: '', name: '', description: '', projectType: '', tags: '',
  billingModel: '', currency: '', contractValue: '', revenueBudget: '', budgetCost: '',
  targetMargin: '', plannedHours: '', startDate: '', endDate: '', projectManagerId: '',
};

const EMPTY: WizardState = EMPTY_WIZARD_STATE;

interface SafeUser { id: string; username: string; role: string }

interface ProjectWizardDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function ProjectWizardDrawer({ isOpen, onClose, onCreated }: ProjectWizardDrawerProps) {
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>(EMPTY);
  const [members, setMembers] = useState<WizardMember[]>([]);

  const [clients, setClients] = useState<AgencyClient[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [users, setUsers] = useState<SafeUser[]>([]);
  // Module 3 — the workspace's project-type vocabulary. Starts on the shared
  // defaults so the picker is usable immediately, then takes the tenant's
  // configured list when it arrives.
  const [projectTypes, setProjectTypes] = useState<string[]>([...DEFAULT_PROJECT_TYPES]);

  const [clientDrawerOpen, setClientDrawerOpen] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; warnings?: string[] } | null>(null);

  const set = <K extends keyof WizardState>(key: K, value: WizardState[K]) => {
    setState(s => ({ ...s, [key]: value }));
    setStepError(null);
  };

  // Client options — archived clients can't take new projects (§40 spirit).
  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/agency/clients?limit=100')
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then(body => setClients((body.clients || []).filter((c: AgencyClient) => c.status !== 'ARCHIVED')))
      .catch(() => setClients([]))
      .finally(() => setClientsLoading(false));
    // Team step pickers — the wizard only opens for admins, matching
    // /api/tenant/users' TENANT_ADMIN gate.
    fetch('/api/tenant/users')
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then(body => setUsers(body.users || []))
      .catch(() => setUsers([]));
    // Module 3 — the configured project-type vocabulary. On failure the state
    // keeps DEFAULT_PROJECT_TYPES, so a workspace whose admin never opened
    // settings still gets a usable picker rather than an empty one.
    fetch('/api/agency/settings')
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then(body => {
        const configured = body.settings?.general?.projectTypes;
        if (Array.isArray(configured) && configured.length > 0) setProjectTypes(configured);
      })
      .catch(() => {});
  }, [isOpen]);

  /** §49/§72 — smart defaults from the client's commercialDefaults. */
  function selectClient(clientId: string) {
    setStepError(null);
    setState(s => {
      const client = clients.find(c => c.id === clientId);
      // The pure defaults module is the single implementation (tested in
      // unit tests): pre-fill only what the user hasn't chosen yet.
      const { currency, billingModel } = applyClientCommercialDefaults(
        { currency: s.currency, billingModel: s.billingModel },
        client
      );
      return { ...s, clientId, currency, billingModel: billingModel as BillingModel | '' };
    });
  }

  // Step gates mirror the server's required core (§37): clientId+name at
  // Basics, billingModel+currency at Commercial. Timeline ordering is checked
  // too so the user never advances with a broken range.
  function validateStep(current: number): string | null {
    return validateWizardStep(current, state);
  }

  function next() {
    const err = validateStep(step);
    if (err) { setStepError(err); return; }
    setStepError(null);
    setStep(s => Math.min(STEPS.length - 1, s + 1));
  }

  function buildPayload() {
    return {
      clientId: state.clientId,
      name: state.name.trim(),
      ...(state.description.trim() && { description: state.description.trim() }),
      billingModel: state.billingModel,
      currency: state.currency.trim().toUpperCase(),
      ...(state.projectType.trim() && { projectType: state.projectType.trim() }),
      ...(() => {
        const tags = state.tags.split(',').map(t => t.trim()).filter(Boolean);
        return tags.length > 0 ? { tags } : {};
      })(),
      ...(num(state.contractValue) !== undefined && { contractValue: num(state.contractValue) }),
      ...(num(state.revenueBudget) !== undefined && { revenueBudget: num(state.revenueBudget) }),
      ...(num(state.budgetCost) !== undefined && { budgetCost: num(state.budgetCost) }),
      ...(num(state.targetMargin) !== undefined && { targetMargin: num(state.targetMargin) }),
      ...(num(state.plannedHours) !== undefined && { plannedHours: num(state.plannedHours) }),
      ...(state.startDate && { startDate: state.startDate }),
      ...(state.endDate && { endDate: state.endDate }),
      ...(state.projectManagerId && { projectManagerId: state.projectManagerId }),
      members: members
        .filter(m => m.userId)
        .map(m => ({
          userId: m.userId,
          ...(m.role.trim() && { role: m.role.trim() }),
          ...(num(m.allocationPercent) !== undefined && { allocationPercent: num(m.allocationPercent) }),
        })),
    };
  }

  async function submit() {
    setSaving(true);
    setApiError(null);
    try {
      const res = await fetch('/api/agency/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setApiError(body.error || 'We couldn\'t create this project. Check the fields and try again.');
        return;
      }
      setCreated({ name: body.project?.name || state.name, warnings: body.warnings });
    } catch {
      setApiError('Network error — please try again.');
    } finally {
      setSaving(false);
    }
  }

  // §95 — create a client inline without losing wizard state; on save the new
  // client is selected and its commercial defaults applied (same as selectClient).
  async function handleInlineClientSave(values: ClientFormValues, allowDuplicate: boolean): Promise<{ ok: boolean; duplicate?: { name: string; id: string }[] }> {
    const res = await fetch('/api/agency/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...values, allowDuplicate }),
    });
    if (res.status === 409) {
      const body = await res.json();
      return { ok: false, duplicate: (body.existing || []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })) };
    }
    if (!res.ok) return { ok: false };
    const body = await res.json();
    const newClient = body.client as AgencyClient | undefined;
    if (newClient) {
      setClients(prev => [...prev.filter(c => c.id !== newClient.id), newClient]);
      selectClient(newClient.id);
    }
    return { ok: true };
  }

  const selectedClient = clients.find(c => c.id === state.clientId);
  const warnings = useMemo(() => computeWarnings(state), [state]);

  const money = (v: string | undefined) => {
    const n = num(v);
    return n === undefined ? null : `${state.currency.trim().toUpperCase() || ''} ${n.toLocaleString('en-IN')}`.trim();
  };

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title="New Project">
      {created ? (
        /* ---- Success (§74: draft, activation is a dedicated later action) ---- */
        <div className="space-y-4">
          <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] p-4 flex items-start gap-2.5">
            <Check className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" aria-hidden />
            <div>
              <p className="text-[13px] font-medium text-emerald-200">{created.name} is saved as a draft</p>
              <p className="mt-1 text-[12px] text-neutral-400">
                Activation is a separate step with its own gate (milestone projects need at least one milestone) — it arrives with the project detail view.
              </p>
            </div>
          </div>
          {created.warnings && created.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-4">
              <p className="text-[12.5px] font-medium text-amber-200 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" aria-hidden /> Advisory notes</p>
              <ul className="mt-2 space-y-1 list-disc list-inside text-[12px] text-neutral-300">
                {created.warnings.map(w => <li key={w}>{w}</li>)}
              </ul>
            </div>
          )}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.05]">
            <button type="button" onClick={onCreated} className="px-3.5 py-1.5 rounded bg-white text-black text-[12.5px] font-semibold hover:bg-neutral-200 transition-colors">
              Done
            </button>
          </div>
        </div>
      ) : (
        /* min-h-full, NOT calc(100vh - header): the Drawer's content box is
           already 100vh minus the 3.5rem header AND its own p-6 padding, so a
           viewport-sized child overflows by the padding and scrolls even when
           the step's content fits. 100% of the content box pins the footer to
           the bottom on short steps without ever overflowing. */
        <div className="flex flex-col min-h-full">
          {/* Step indicator */}
          <div className="flex items-center gap-1.5 flex-wrap mb-5" aria-label={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`}>
            {STEPS.map((s, i) => (
              <React.Fragment key={s}>
                {i > 0 && <ChevronRight className="w-3 h-3 text-neutral-700" aria-hidden />}
                <button
                  type="button"
                  onClick={() => { if (i < step) { setStep(i); setStepError(null); } }}
                  disabled={i >= step}
                  className={`text-[11px] font-medium px-2 py-0.5 rounded transition-colors ${i === step ? 'text-white bg-white/[0.08]' : i < step ? 'text-neutral-400 hover:text-neutral-200' : 'text-neutral-600'}`}
                >
                  {i < step ? '✓ ' : ''}{s}
                </button>
              </React.Fragment>
            ))}
          </div>

          <div className="flex-1 space-y-4">
            {/* ---------- Step 1: Client (§71) ---------- */}
            {step === 0 && (
              <div className="space-y-3">
                <div>
                  <label htmlFor="pw-client" className={labelCls}>Client <Req satisfied={Boolean(state.clientId)} /></label>
                  <div className="flex gap-2">
                    <Select id="pw-client" value={state.clientId} onChange={e => selectClient(e.target.value)} className={cn(inputCls, stepError && !state.clientId && 'border-rose-500/50')} disabled={clientsLoading}>
                      <option value="">{clientsLoading ? 'Loading clients…' : 'Select a client'}</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </Select>
                    <button
                      type="button"
                      onClick={() => setClientDrawerOpen(true)}
                      title="Create a new client without leaving the wizard"
                      className="shrink-0 inline-flex items-center gap-1 px-2.5 rounded border border-white/[0.08] text-[12px] text-neutral-300 hover:bg-white/[0.04] transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" aria-hidden /> New
                    </button>
                  </div>
                  <p className="mt-1.5 text-[11px] text-neutral-600">Currency and billing model default from the client&apos;s commercial settings — you can override them.</p>
                </div>
                {selectedClient && (
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.01] p-3 text-[12px] text-neutral-400">
                    <span className="text-neutral-500">Will inherit unless overridden: </span>
                    {selectedClient.commercialDefaults?.currency || selectedClient.billingProfile?.currency || 'currency not set'}
                    {' · '}
                    {selectedClient.commercialDefaults?.billingModel || 'billing model not set'}
                  </div>
                )}
              </div>
            )}

            {/* ---------- Step 2: Basics ---------- */}
            {step === 1 && (
              <div className="space-y-3">
                <div>
                  <label htmlFor="pw-name" className={labelCls}>Project Name <Req satisfied={Boolean(state.name.trim())} /></label>
                  <input id="pw-name" value={state.name} onChange={e => set('name', e.target.value)} maxLength={120} placeholder="Website Redesign" className={cn(inputCls, stepError && !state.name.trim() && 'border-rose-500/50')} />
                </div>
                {/* Module 3 — the project code is assigned by the system
                    (allocateProjectCode → PRJ-0001) and is no longer asked for.
                    The Project Type picker is fed by the workspace's configured
                    vocabulary (Agency Settings → General). */}
                <div>
                  <label htmlFor="pw-type" className={labelCls}>Project Type <Opt /></label>
                  <Select id="pw-type" value={state.projectType} onChange={e => set('projectType', e.target.value)}>
                    <option value="">Not set</option>
                    {projectTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </Select>
                  <p className="mt-1 text-[11px] text-neutral-600">Manage these options in Agency Settings → General.</p>
                </div>
                <div>
                  <label htmlFor="pw-desc" className={labelCls}>Description <Opt /></label>
                  <textarea id="pw-desc" value={state.description} onChange={e => set('description', e.target.value)} rows={3} maxLength={2000} placeholder="What this project delivers…" className={`${inputCls} resize-none`} />
                </div>
                <div>
                  <label htmlFor="pw-tags" className={labelCls}>Tags <Opt /></label>
                  <input id="pw-tags" value={state.tags} onChange={e => set('tags', e.target.value)} placeholder="retainer, priority" className={inputCls} />
                  <p className="mt-1 text-[11px] text-neutral-600">Comma-separated, optional (max 10).</p>
                </div>
              </div>
            )}

            {/* ---------- Step 3: Commercial ---------- */}
            {step === 2 && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="pw-model" className={labelCls}>Billing Model <Req satisfied={Boolean(state.billingModel)} /></label>
                    <Select id="pw-model" value={state.billingModel} onChange={e => set('billingModel', e.target.value as BillingModel | '')} className={cn(inputCls, stepError && !state.billingModel && 'border-rose-500/50')}>
                      <option value="">Select a model</option>
                      {BILLING_MODELS.map(m => <option key={m} value={m}>{m === 'TIME_AND_MATERIALS' ? 'Time & Materials' : m === 'FIXED_FEE' ? 'Fixed Fee' : 'Milestone'}</option>)}
                    </Select>
                  </div>
                  <div>
                    <label htmlFor="pw-currency" className={labelCls}>Currency <Req satisfied={/^[A-Z]{3}$/.test(state.currency.trim().toUpperCase())} /></label>
                    <input id="pw-currency" value={state.currency} onChange={e => set('currency', e.target.value.toUpperCase())} maxLength={3} placeholder="INR" className={cn(inputCls, stepError && !/^[A-Z]{3}$/.test(state.currency.trim().toUpperCase()) && 'border-rose-500/50')} />
                    <p className="mt-1 text-[11px] text-neutral-600">Locked after activation.</p>
                  </div>
                </div>
                <div>
                  <label htmlFor="pw-contract" className={labelCls}>Contract Value <Opt /></label>
                  <input id="pw-contract" type="number" min={0} step="any" value={state.contractValue} onChange={e => set('contractValue', e.target.value)} placeholder="500000" className={inputCls} />
                  <p className="mt-1 text-[11px] text-neutral-600">The negotiated fee. Separate from the revenue budget so change orders can diverge them later.</p>
                </div>
                {state.billingModel === 'MILESTONE' && (
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.01] p-3 text-[12px] text-neutral-400">
                    Milestones are defined on the project after creation — a milestone project needs at least one before it can activate.
                  </div>
                )}
              </div>
            )}

            {/* ---------- Step 4: Budget (§66 planned-economics preview) ---------- */}
            {step === 3 && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="pw-revenue" className={labelCls}>Revenue Budget <Opt /></label>
                    <input id="pw-revenue" type="number" min={0} step="any" value={state.revenueBudget} onChange={e => set('revenueBudget', e.target.value)} placeholder="500000" className={inputCls} />
                  </div>
                  <div>
                    <label htmlFor="pw-cost" className={labelCls}>Budget Cost <Opt /></label>
                    <input id="pw-cost" type="number" min={0} step="any" value={state.budgetCost} onChange={e => set('budgetCost', e.target.value)} placeholder="300000" className={inputCls} />
                  </div>
                  <div>
                    <label htmlFor="pw-margin" className={labelCls}>Target Margin (%) <Opt /></label>
                    <input id="pw-margin" type="number" min={0} max={100} step="any" value={state.targetMargin} onChange={e => set('targetMargin', e.target.value)} placeholder="40" className={inputCls} />
                  </div>
                  <div>
                    <label htmlFor="pw-hours" className={labelCls}>Planned Hours <Opt /></label>
                    <input id="pw-hours" type="number" min={0} step="any" value={state.plannedHours} onChange={e => set('plannedHours', e.target.value)} placeholder="800" className={inputCls} />
                  </div>
                </div>

                {/* §66 — planned-economics preview. PLANNED numbers only,
                    computed from what the user typed — never fabricated. */}
                {(() => {
                  const revenue = num(state.revenueBudget);
                  const cost = num(state.budgetCost);
                  const hours = num(state.plannedHours);
                  const rows: { label: string; value: string }[] = [];
                  if (revenue !== undefined && cost !== undefined) {
                    const margin = revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0;
                    rows.push({ label: 'Planned gross margin', value: `${margin.toFixed(1)}%` });
                    rows.push({ label: 'Planned profit', value: `${state.currency.trim().toUpperCase()} ${(revenue - cost).toLocaleString('en-IN')}`.trim() });
                  }
                  if (revenue !== undefined && hours !== undefined && hours > 0) {
                    rows.push({ label: 'Implied rate (budget ÷ hours)', value: `${(revenue / hours).toFixed(0)} ${state.currency || ''}`.trim() });
                  }
                  if (rows.length === 0) return null;
                  return (
                    <div className="rounded-lg border border-white/[0.06] bg-white/[0.01] p-3 space-y-1.5">
                      <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Planned Economics</div>
                      {rows.map(r => (
                        <div key={r.label} className="flex items-center justify-between text-[12.5px]">
                          <span className="text-neutral-400">{r.label}</span>
                          <span className="text-neutral-200 font-medium">{r.value}</span>
                        </div>
                      ))}
                      <p className="text-[11px] text-neutral-600">Planned values — actuals arrive with Time Tracking and Invoicing.</p>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ---------- Step 5: Timeline ---------- */}
            {step === 4 && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="pw-start" className={labelCls}>Start Date <Opt /></label>
                    <DatePicker id="pw-start" value={state.startDate} onChange={e => set('startDate', e.target.value)} />
                  </div>
                  <div>
                    <label htmlFor="pw-end" className={labelCls}>End Date <Opt /></label>
                    <DatePicker id="pw-end" value={state.endDate} min={state.startDate} onChange={e => set('endDate', e.target.value)} />
                  </div>
                </div>
                <p className="text-[11.5px] text-neutral-600">Timeline is optional at creation but strongly recommended — projects without one can&apos;t be reported on by period later.</p>
              </div>
            )}

            {/* ---------- Step 6: Team (§58–§60) ---------- */}
            {step === 5 && (
              <div className="space-y-3">
                <div>
                  <label htmlFor="pw-pm" className={labelCls}>Project Manager <Opt /></label>
                  <Select id="pw-pm" value={state.projectManagerId} onChange={e => set('projectManagerId', e.target.value)} className={inputCls}>
                    <option value="">Not assigned</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
                  </Select>
                  <p className="mt-1 text-[11px] text-neutral-600">The accountability owner — separate from team membership.</p>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Team Members <Opt /></span>
                    <button
                      type="button"
                      onClick={() => setMembers(m => [...m, { userId: '', role: '', allocationPercent: '' }])}
                      className="inline-flex items-center gap-1 text-[12px] text-neutral-300 hover:text-white transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" aria-hidden /> Add member
                    </button>
                  </div>
                  {members.length === 0 && (
                    <p className="text-[12px] text-neutral-600">No members yet — you can add them now or later on the project.</p>
                  )}
                  <div className="space-y-2">
                    {members.map((m, i) => (
                      <div key={i} className="grid grid-cols-[1fr_auto] gap-2 items-start">
                        <div className="space-y-2">
                          <Select
                            value={m.userId}
                            onChange={e => setMembers(prev => prev.map((x, j) => j === i ? { ...x, userId: e.target.value } : x))}
                            aria-label={`Member ${i + 1} user`}
                            className={inputCls}
                          >
                            <option value="">Select a user</option>
                            {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
                          </Select>
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              value={m.role}
                              onChange={e => setMembers(prev => prev.map((x, j) => j === i ? { ...x, role: e.target.value } : x))}
                              placeholder="Role (e.g. Designer)"
                              maxLength={100}
                              aria-label={`Member ${i + 1} role`}
                              className={inputCls}
                            />
                            <input
                              type="number" min={0} max={100}
                              value={m.allocationPercent}
                              onChange={e => setMembers(prev => prev.map((x, j) => j === i ? { ...x, allocationPercent: e.target.value } : x))}
                              placeholder="Allocation %"
                              aria-label={`Member ${i + 1} allocation percent`}
                              className={inputCls}
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setMembers(prev => prev.filter((_, j) => j !== i))}
                          aria-label={`Remove member ${i + 1}`}
                          className="p-1.5 rounded text-neutral-500 hover:text-red-400 hover:bg-white/[0.04] transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden />
                        </button>
                      </div>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[11px] text-neutral-600">Allocation represents planned team capacity for this project.</p>
                </div>
              </div>
            )}

            {/* ---------- Step 7: Review ---------- */}
            {step === 6 && (
              <div className="space-y-3">
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.01] divide-y divide-white/[0.05]">
                  {[
                    ['Client', selectedClient?.name || '—'],
                    ['Project', state.name.trim() || '—'],
                    ['Billing model', state.billingModel || '—'],
                    ['Currency', state.currency || '—'],
                    ['Contract value', money(state.contractValue) || '—'],
                    ['Revenue budget', money(state.revenueBudget) || '—'],
                    ['Budget cost', money(state.budgetCost) || '—'],
                    ['Target margin', num(state.targetMargin) !== undefined ? `${state.targetMargin}%` : '—'],
                    ['Planned hours', num(state.plannedHours) !== undefined ? String(state.plannedHours) : '—'],
                    ['Timeline', state.startDate || state.endDate ? `${state.startDate || '…'} → ${state.endDate || '…'}` : '—'],
                    ['Project manager', users.find(u => u.id === state.projectManagerId)?.username || '—'],
                    ['Team members', String(members.filter(m => m.userId).length)],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                      <span className="text-[12px] text-neutral-500">{label}</span>
                      <span className="text-[12.5px] text-neutral-200 font-medium text-right">{value}</span>
                    </div>
                  ))}
                </div>

                {/* Advisory warnings (§73/§54) — a draft with warnings is legal */}
                {warnings.length > 0 && (
                  <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-4">
                    <p className="text-[12.5px] font-medium text-amber-200 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" aria-hidden /> Worth knowing before you save</p>
                    <ul className="mt-2 space-y-1 list-disc list-inside text-[12px] text-neutral-300">
                      {warnings.map(w => <li key={w}>{w}</li>)}
                    </ul>
                    <p className="mt-2 text-[11.5px] text-neutral-500">These notices are advisory — draft projects can be saved and updated at any time.</p>
                  </div>
                )}

                <p className="text-[12px] text-neutral-500">Saving creates this project as a <span className="text-neutral-300 font-medium">DRAFT</span>. You can activate the project when ready for delivery.</p>

                {apiError && <p role="alert" className="text-[12.5px] text-red-400">{apiError}</p>}
              </div>
            )}
          </div>

          {/* Step error */}
          {stepError && step < 6 && <p role="alert" className="mt-3 text-[12.5px] text-red-400">{stepError}</p>}

          {/* Footer navigation */}
          <div className="flex items-center justify-between gap-2 pt-4 mt-5 border-t border-white/[0.05]">
            <button
              type="button"
              onClick={() => { setStep(s => Math.max(0, s - 1)); setStepError(null); }}
              disabled={step === 0}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-white/[0.08] text-[12.5px] text-neutral-300 hover:bg-white/[0.04] disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" aria-hidden /> Back
            </button>
            {step < STEPS.length - 1 ? (
              <button type="button" onClick={next} className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded bg-white text-black text-[12.5px] font-semibold hover:bg-neutral-200 transition-colors">
                Continue <ChevronRight className="w-3.5 h-3.5" aria-hidden />
              </button>
            ) : (
              <button type="button" onClick={() => void submit()} disabled={saving} className="px-3.5 py-1.5 rounded bg-white text-black text-[12.5px] font-semibold hover:bg-neutral-200 disabled:opacity-50 transition-colors">
                {saving ? 'Creating…' : 'Create Project'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* §95 — inline client creation, layered ON TOP of the wizard so
          nothing in the wizard's state is lost. */}
      {clientDrawerOpen && (
        <ClientFormDrawer
          key="inline-new-client"
          isOpen={clientDrawerOpen}
          onClose={() => setClientDrawerOpen(false)}
          editing={null}
          onSave={async (values, allowDuplicate) => handleInlineClientSave(values, allowDuplicate)}
          onSaved={() => setClientDrawerOpen(false)}
        />
      )}
    </Drawer>
  );
}
