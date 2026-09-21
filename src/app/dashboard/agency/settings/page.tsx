"use client";

import React, { useCallback, useEffect, useState } from 'react';
import {
  RefreshCw, Building2, Receipt, TrendingUp, Landmark, CreditCard, Save, Plus, Trash2,
  Tag, CheckCircle2, AlertCircle, Info, ShieldCheck, Sparkles, ExternalLink,
  Search, Key, Check,
} from 'lucide-react';
import { useDashboardContext } from '@/components/dashboard/DashboardProvider';
import { tenantHasCapability } from '@/lib/agency/types/vertical';
import {
  DEFAULT_PROJECT_TYPES,
  MAX_PROJECT_TYPES,
  MAX_PROJECT_TYPE_LENGTH,
  type PublicAgencySettings,
} from '@/lib/agency/types/agency-settings';
import { Select } from '@/components/ui/Select';
import { confirmModal } from '@/components/ui/Dialog';

/**
 * Agency Settings (Module 17 §53/17.16) — Redesigned with modular tabbed navigation,
 * full responsiveness, and transaction categories management.
 */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const TIMEZONES: readonly string[] = [
  'Asia/Kolkata', 'Asia/Karachi', 'Asia/Dhaka', 'Asia/Colombo', 'Asia/Kathmandu',
  'Asia/Singapore', 'Asia/Hong_Kong', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul',
  'Asia/Dubai', 'Asia/Riyadh', 'Asia/Tehran',
  'Europe/London', 'Europe/Dublin', 'Europe/Paris', 'Europe/Berlin',
  'Europe/Amsterdam', 'Europe/Madrid', 'Europe/Rome', 'Europe/Zurich',
  'Europe/Stockholm', 'Europe/Warsaw', 'Europe/Istanbul', 'Europe/Moscow',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Toronto', 'America/Vancouver', 'America/Mexico_City',
  'America/Sao_Paulo', 'America/Argentina/Buenos_Aires', 'America/Lima',
  'Australia/Sydney', 'Australia/Melbourne', 'Australia/Perth', 'Australia/Brisbane',
  'Pacific/Auckland', 'Africa/Cairo', 'Africa/Lagos', 'Africa/Nairobi',
  'Africa/Johannesburg', 'UTC',
];

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD', 'JPY'];

const INPUT = 'h-9 w-full bg-white/[0.02] border border-white/[0.08] rounded-lg px-3 text-[13px] text-white focus:border-white/[0.25] outline-none disabled:opacity-50 transition-colors';

type SettingsTab = 'general' | 'categories' | 'billing' | 'tax' | 'profitability' | 'payment';

interface TabDefinition {
  id: SettingsTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

const TABS: TabDefinition[] = [
  { id: 'general', label: 'General & Identity', icon: Building2, description: 'Agency branding, currency, timezone, and project types' },
  { id: 'categories', label: 'Categories', icon: Tag, description: 'Income and expense categories for ledger classification' },
  { id: 'billing', label: 'Billing & Invoicing', icon: Receipt, description: 'Invoice numbering prefix, default terms, and accepted payment methods' },
  { id: 'tax', label: 'Tax & Compliance', icon: Landmark, description: 'GSTIN, SAC codes, and statutory billing details' },
  { id: 'profitability', label: 'Profitability & Alerts', icon: TrendingUp, description: 'Margin targets, hour thresholds, and overdue warnings' },
  { id: 'payment', label: 'Payment Gateway', icon: CreditCard, description: 'Razorpay API credentials and webhook integration' },
];

interface FormState {
  agencyName: string;
  logoUrl: string;
  defaultCurrency: string;
  timezone: string;
  fiscalYearStartMonth: string;
  projectTypes: string[];
  paymentTermsDays: string;
  invoicePrefix: string;
  defaultTaxProfileId: string;
  defaultPaymentMethods: string;
  targetProjectMargin: string;
  hoursFirst: string;
  hoursWarning: string;
  hoursCritical: string;
  overdueWarningDays: string;
  defaultSacCode: string;
  registrationType: string;
  gstin: string;
  stateCode: string;
  razorpayEnabled: boolean;
  razorpayKeyId: string;
  razorpayKeySecret: string;
  webhookSecret: string;
}

const EMPTY_FORM: FormState = {
  agencyName: '', logoUrl: '', defaultCurrency: 'INR', timezone: 'Asia/Kolkata', fiscalYearStartMonth: '4',
  projectTypes: [...DEFAULT_PROJECT_TYPES],
  paymentTermsDays: '', invoicePrefix: '', defaultTaxProfileId: '', defaultPaymentMethods: '',
  targetProjectMargin: '', hoursFirst: '75', hoursWarning: '80', hoursCritical: '100', overdueWarningDays: '',
  defaultSacCode: '', registrationType: '', gstin: '', stateCode: '',
  razorpayEnabled: false, razorpayKeyId: '', razorpayKeySecret: '', webhookSecret: '',
};

function formFromSettings(settings: PublicAgencySettings, billing: {
  taxRegistrationType?: string; state?: string; gstin?: string; invoicePrefix?: string;
} | null, workspaceName?: string): FormState {
  const resolvedAgencyName = settings.general.agencyName || workspaceName || '';
  return {
    ...EMPTY_FORM,
    agencyName: resolvedAgencyName,
    ...(settings.general.logoUrl !== undefined && { logoUrl: settings.general.logoUrl }),
    defaultCurrency: settings.general.defaultCurrency,
    timezone: settings.general.timezone,
    fiscalYearStartMonth: String(settings.general.fiscalYearStartMonth),
    projectTypes: settings.general.projectTypes ?? [...DEFAULT_PROJECT_TYPES],
    ...(settings.billing.paymentTermsDays !== undefined && { paymentTermsDays: String(settings.billing.paymentTermsDays) }),
    ...(settings.billing.defaultTaxProfileId !== undefined && { defaultTaxProfileId: settings.billing.defaultTaxProfileId }),
    ...(settings.billing.defaultPaymentMethods.length > 0 && { defaultPaymentMethods: settings.billing.defaultPaymentMethods.join(', ') }),
    ...(settings.profitability.targetProjectMargin !== undefined && { targetProjectMargin: String(settings.profitability.targetProjectMargin) }),
    hoursFirst: String(settings.profitability.hourWarningThresholds.first),
    hoursWarning: String(settings.profitability.hourWarningThresholds.warning),
    hoursCritical: String(settings.profitability.hourWarningThresholds.critical),
    ...(settings.profitability.overdueWarningDays !== undefined && { overdueWarningDays: String(settings.profitability.overdueWarningDays) }),
    ...(settings.tax.defaultSacCode !== undefined && { defaultSacCode: settings.tax.defaultSacCode }),
    ...(billing?.taxRegistrationType && { registrationType: billing.taxRegistrationType }),
    ...(billing?.gstin && { gstin: billing.gstin }),
    ...(billing?.state && { stateCode: billing.state }),
    ...(billing?.invoicePrefix && { invoicePrefix: billing.invoicePrefix }),
    razorpayEnabled: settings.payment.razorpayEnabled,
    ...(settings.payment.razorpayKeyId !== undefined && { razorpayKeyId: settings.payment.razorpayKeyId }),
  };
}

function numField(s: string): number | undefined {
  const t = s.trim();
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

function SaveBtn({ busy, disabled, onClick, label = 'Save Changes' }: {
  busy: boolean; disabled: boolean; onClick: () => void; label?: string;
}) {
  return (
    <div className="flex items-center justify-end pt-4 border-t border-white/[0.06]">
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className="inline-flex items-center gap-2 h-9 px-5 bg-white text-black rounded-lg text-[13px] font-semibold hover:bg-neutral-200 transition-colors disabled:opacity-50 shadow-sm"
      >
        <Save className="w-3.5 h-3.5" />
        {busy ? 'Saving…' : label}
      </button>
    </div>
  );
}

export default function AgencySettingsPage() {
  const { tenant, user, loading: sessionLoading } = useDashboardContext();
  const allowed = tenantHasCapability(tenant, 'AGENCY_DASHBOARD');
  const canManage = user?.role === 'TENANT_ADMIN' || user?.role === 'SUPER_ADMIN';

  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [settings, setSettings] = useState<PublicAgencySettings | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [taxProfiles, setTaxProfiles] = useState<{ id: string; name: string; active: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  // Project Types
  const [newProjectType, setNewProjectType] = useState('');

  // Transaction Categories
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [newCat, setNewCat] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [catBusy, setCatBusy] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm(f => ({ ...f, [key]: value }));

  function addProjectType() {
    const value = newProjectType.trim();
    if (value === '') return;
    if (form.projectTypes.length >= MAX_PROJECT_TYPES) return;
    if (form.projectTypes.some(t => t.toLowerCase() === value.toLowerCase())) {
      setNewProjectType('');
      return;
    }
    set('projectTypes', [...form.projectTypes, value]);
    setNewProjectType('');
  }

  function removeProjectType(value: string) {
    set('projectTypes', form.projectTypes.filter(t => t !== value));
  }

  const loadCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/categories');
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories || []);
      }
    } catch {
      // quiet fallback
    }
  }, []);

  const load = useCallback(() => {
    return Promise.all([
      fetch('/api/agency/settings').then(r => r.ok ? r.json() : Promise.reject(new Error('settings'))),
      fetch('/api/agency/billing-profile').then(r => (r.ok ? r.json() : { billingProfile: null })),
      fetch('/api/categories').then(r => (r.ok ? r.json() : { categories: [] })),
    ])
      .then(([settingsBody, profileBody, categoriesBody]: [
        { settings?: PublicAgencySettings },
        { billingProfile?: { taxRegistrationType?: string; state?: string; invoicePrefix?: string; taxIdentifiers?: { type: string; value: string }[] } | null },
        { categories?: { id: string; name: string }[] },
      ]) => {
        if (!settingsBody.settings) throw new Error('settings');
        setSettings(settingsBody.settings);
        const profile = profileBody.billingProfile ?? null;
        setForm(formFromSettings(settingsBody.settings, profile ? {
          taxRegistrationType: profile.taxRegistrationType,
          state: profile.state,
          invoicePrefix: profile.invoicePrefix,
          gstin: profile.taxIdentifiers?.find(i => i.type.toUpperCase() === 'GSTIN')?.value,
        } : null, tenant?.name));
        setCategories(categoriesBody.categories || []);
        setNotice(null);
        return true;
      })
      .catch(() => {
        setNotice({ kind: 'error', text: 'We couldn\'t load the agency settings. Try again.' });
        return false;
      });
  }, [tenant?.name]);

  useEffect(() => {
    if (sessionLoading || !allowed) { setLoading(false); return; }
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [sessionLoading, allowed, load]);

  useEffect(() => {
    if (sessionLoading || !allowed || !canManage) return;
    fetch('/api/agency/tax/profiles')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((body: { profiles?: { id: string; name: string; active: boolean }[] }) => {
        setTaxProfiles((body.profiles ?? []).filter(p => p.active));
      })
      .catch(() => undefined);
  }, [sessionLoading, allowed, canManage]);

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCat.trim();
    if (!trimmed) return;
    setCatBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setNewCat('');
        setNotice({ kind: 'info', text: `Category "${trimmed}" created.` });
        await loadCategories();
      } else {
        setNotice({ kind: 'error', text: data.error || 'Failed to create category.' });
      }
    } catch {
      setNotice({ kind: 'error', text: 'Network error while creating category.' });
    } finally {
      setCatBusy(false);
    }
  };

  const handleDeleteCategory = async (id: string, name: string) => {
    const ok = await confirmModal({
      title: 'Delete Category',
      message: `Are you sure you want to delete category "${name}"? Existing transactions referencing this category will retain their history.`,
      confirmText: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    setNotice(null);
    try {
      const res = await fetch(`/api/categories/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setNotice({ kind: 'info', text: `Category "${name}" deleted.` });
        await loadCategories();
      } else {
        const data = await res.json().catch(() => ({}));
        setNotice({ kind: 'error', text: data.error || 'Failed to delete category.' });
      }
    } catch {
      setNotice({ kind: 'error', text: 'Network error while deleting category.' });
    }
  };

  const save = async (section: 'general' | 'billing' | 'profitability' | 'tax' | 'payment', body: Record<string, unknown>): Promise<boolean> => {
    setNotice(null);
    setBusy(section);
    try {
      const res = await fetch(`/api/agency/settings/${section}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.settings) {
        setSettings(data.settings);
        setNotice({ kind: 'info', text: 'Settings updated successfully.' });
        if (section === 'payment') {
          setForm(f => ({
            ...f,
            razorpayEnabled: data.settings.payment.razorpayEnabled,
            razorpayKeyId: data.settings.payment.razorpayKeyId ?? f.razorpayKeyId,
            razorpayKeySecret: '',
            webhookSecret: '',
          }));
        }
        return true;
      } else {
        setNotice({ kind: 'error', text: data.error ?? 'The save failed. Check the values and try again.' });
        return false;
      }
    } catch {
      setNotice({ kind: 'error', text: 'The save failed. Try again.' });
      return false;
    } finally {
      setBusy(null);
    }
  };

  const saveBilling = async () => {
    if (!(await save('billing', sectionBody('billing')))) return;
    const prefix = form.invoicePrefix.trim();
    if (prefix === '') return;
    setBusy('billing');
    try {
      const res = await fetch('/api/agency/billing-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoicePrefix: prefix }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({ kind: 'error', text: data.error ?? 'The invoice prefix could not be saved.' });
      }
    } catch {
      setNotice({ kind: 'error', text: 'The invoice prefix could not be saved. Try again.' });
    } finally {
      setBusy(null);
    }
  };

  const testCredentials = async () => {
    setTestResult(null);
    setBusy('test');
    try {
      const body = form.razorpayKeyId.trim() !== '' && form.razorpayKeySecret !== ''
        ? { razorpayKeyId: form.razorpayKeyId.trim(), razorpayKeySecret: form.razorpayKeySecret }
        : {};
      const res = await fetch('/api/agency/settings/payment/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setTestResult(`${data.result ?? 'error'} — ${data.detail ?? ''}`);
      else setTestResult(`error — ${data.error ?? 'the test failed'}`);
    } catch {
      setTestResult('error — could not reach the server');
    } finally {
      setBusy(null);
    }
  };

  if (loading || sessionLoading) {
    return <div className="flex h-full items-center justify-center"><RefreshCw className="w-5 h-5 animate-spin text-neutral-500" /></div>;
  }

  if (!allowed) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <h2 className="text-[18px] font-semibold text-white mb-2">Agency Settings</h2>
        <p className="text-[14px] text-neutral-400">This area is available in Agency mode.</p>
      </div>
    );
  }

  const sectionBody = (section: 'general' | 'billing' | 'profitability' | 'tax' | 'payment'): Record<string, unknown> => {
    switch (section) {
      case 'general':
        return {
          ...(form.agencyName.trim() !== '' && { agencyName: form.agencyName.trim() }),
          ...(form.logoUrl.trim() !== '' && { logoUrl: form.logoUrl.trim() }),
          ...(form.defaultCurrency.trim() !== '' && { defaultCurrency: form.defaultCurrency.trim() }),
          ...(form.timezone.trim() !== '' && { timezone: form.timezone.trim() }),
          ...(numField(form.fiscalYearStartMonth) !== undefined && { fiscalYearStartMonth: numField(form.fiscalYearStartMonth) }),
          projectTypes: form.projectTypes,
        };
      case 'billing':
        return {
          ...(numField(form.paymentTermsDays) !== undefined && { paymentTermsDays: numField(form.paymentTermsDays) }),
          ...(form.defaultTaxProfileId !== '' && { defaultTaxProfileId: form.defaultTaxProfileId }),
          ...(form.defaultPaymentMethods.trim() !== '' && {
            defaultPaymentMethods: form.defaultPaymentMethods.split(',').map(m => m.trim()).filter(m => m !== ''),
          }),
        };
      case 'profitability':
        return {
          ...(numField(form.targetProjectMargin) !== undefined && { targetProjectMargin: numField(form.targetProjectMargin) }),
          hourWarningThresholds: {
            first: numField(form.hoursFirst) ?? 75,
            warning: numField(form.hoursWarning) ?? 80,
            critical: numField(form.hoursCritical) ?? 100,
          },
          ...(numField(form.overdueWarningDays) !== undefined && { overdueWarningDays: numField(form.overdueWarningDays) }),
        };
      case 'tax':
        return {
          ...(form.defaultSacCode.trim() !== '' && { defaultSacCode: form.defaultSacCode.trim() }),
          ...(form.registrationType.trim() !== '' && { registrationType: form.registrationType.trim() }),
          ...(form.gstin.trim() !== '' && { gstin: form.gstin.trim() }),
          ...(form.stateCode.trim() !== '' && { stateCode: form.stateCode.trim() }),
        };
      case 'payment':
        return {
          razorpayEnabled: form.razorpayEnabled,
          ...(form.razorpayKeyId.trim() !== '' && { razorpayKeyId: form.razorpayKeyId.trim() }),
          ...(form.razorpayKeySecret !== '' && { razorpayKeySecret: form.razorpayKeySecret }),
          ...(form.webhookSecret !== '' && { webhookSecret: form.webhookSecret }),
        };
    }
  };

  const filteredCategories = categories.filter(c =>
    c.name.toLowerCase().includes(categorySearch.trim().toLowerCase())
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 w-full max-w-6xl space-y-6 animate-in fade-in duration-300">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.06] pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white mb-1">Agency Settings</h1>
          <p className="text-[13px] text-neutral-400">
            Configure agency identity, categories, billing specifications, tax compliance, and gateway integrations.
            {settings?.updatedAt && (
              <span className="block sm:inline sm:ml-2 text-neutral-500">
                · Last saved {new Date(settings.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                {settings.updatedBy ? ` by ${settings.updatedBy}` : ''}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/[0.1] bg-white/[0.04] text-[12px] font-medium text-white shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            Agency Mode
            <span className="text-[10.5px] text-neutral-500 font-mono">· Permanent</span>
          </div>
        </div>
      </div>

      {/* Global Notice Alert */}
      {notice && (
        <div
          role="status"
          className={`flex items-start justify-between gap-3 rounded-xl border p-4 animate-in fade-in duration-200 ${
            notice.kind === 'info'
              ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
              : 'border-rose-500/20 bg-rose-500/10 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {notice.kind === 'info' ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" /> : <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />}
            <p className="text-[13px] font-medium">{notice.text}</p>
          </div>
          <button
            onClick={() => setNotice(null)}
            aria-label="Dismiss alert"
            className="text-[12px] text-neutral-400 hover:text-white transition-colors shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Tab Navigation Strip */}
      <div className="border-b border-white/[0.06] -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-3" role="tablist" aria-label="Settings Sections">
          {TABS.map(tab => {
            const active = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={active}
                onClick={() => { setActiveTab(tab.id); setNotice(null); }}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-[13px] font-medium transition-all shrink-0 ${
                  active
                    ? 'bg-white text-black shadow-sm font-semibold'
                    : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-black' : 'text-neutral-400'}`} />
                <span>{tab.label}</span>
                {tab.id === 'categories' && categories.length > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[10.5px] tabular-nums font-mono ${
                    active ? 'bg-black/10 text-black font-bold' : 'bg-white/[0.08] text-neutral-300'
                  }`}>
                    {categories.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 1: GENERAL & IDENTITY                                    */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'general' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Identity Card */}
            <div className="rounded-2xl border border-white/[0.08] bg-[#050505] p-5 sm:p-6 space-y-4">
              <div className="flex items-center gap-2.5 pb-3 border-b border-white/[0.06]">
                <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-neutral-300">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-[14px] font-semibold text-white tracking-tight">Agency Identity</h2>
                  <p className="text-[12px] text-neutral-400">Public commercial name and visual brand mark</p>
                </div>
              </div>

              <div className="space-y-3.5">
                <label className="block space-y-1">
                  <span className="text-[12px] font-medium text-neutral-300">Agency Name</span>
                  <input
                    type="text"
                    value={form.agencyName}
                    disabled={!canManage}
                    onChange={e => set('agencyName', e.target.value)}
                    placeholder={tenant?.name ? `e.g. ${tenant.name}` : "e.g. Money OS"}
                    className={INPUT}
                  />
                  <span className="block text-[11px] text-neutral-500">Displayed on issued invoices, client statements, and rate cards.</span>
                </label>

                <label className="block space-y-1">
                  <span className="text-[12px] font-medium text-neutral-300">Logo Image URL</span>
                  <input
                    type="url"
                    value={form.logoUrl}
                    disabled={!canManage}
                    onChange={e => set('logoUrl', e.target.value)}
                    placeholder="https://cdn.example.com/logo.png"
                    className={INPUT}
                  />
                  <span className="block text-[11px] text-neutral-500">Secure https URL for invoice headers and PDF export rendering.</span>
                </label>
              </div>
            </div>

            {/* Localization Card */}
            <div className="rounded-2xl border border-white/[0.08] bg-[#050505] p-5 sm:p-6 space-y-4">
              <div className="flex items-center gap-2.5 pb-3 border-b border-white/[0.06]">
                <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-neutral-300">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-[14px] font-semibold text-white tracking-tight">Localization & Fiscal Period</h2>
                  <p className="text-[12px] text-neutral-400">Operating currency, timezone, and fiscal schedule</p>
                </div>
              </div>

              <div className="space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block space-y-1">
                    <span className="text-[12px] font-medium text-neutral-300">Base Currency</span>
                    <input
                      type="text"
                      list="currency-options"
                      value={form.defaultCurrency}
                      disabled={!canManage}
                      onChange={e => set('defaultCurrency', e.target.value.toUpperCase())}
                      className={INPUT}
                    />
                    <datalist id="currency-options">{CURRENCIES.map(c => <option key={c} value={c} />)}</datalist>
                    <span className="block text-[11px] text-neutral-500">ISO-4217, 3 letters.</span>
                  </label>

                  <label className="block space-y-1">
                    <span className="text-[12px] font-medium text-neutral-300">Fiscal Year Starts</span>
                    <Select
                      value={form.fiscalYearStartMonth}
                      disabled={!canManage}
                      onChange={e => set('fiscalYearStartMonth', e.target.value)}
                      className={INPUT}
                    >
                      {MONTHS.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
                    </Select>
                    <span className="block text-[11px] text-neutral-500">Anchors annual sequence cycles.</span>
                  </label>
                </div>

                <label className="block space-y-1">
                  <span className="text-[12px] font-medium text-neutral-300">Timezone</span>
                  <input
                    type="text"
                    list="timezone-options"
                    value={form.timezone}
                    disabled={!canManage}
                    onChange={e => set('timezone', e.target.value)}
                    className={INPUT}
                  />
                  <datalist id="timezone-options">{TIMEZONES.map(t => <option key={t} value={t} />)}</datalist>
                  <span className="block text-[11px] text-neutral-500">IANA timezone — evaluates &quot;today&quot; for overdue alerts and due dates.</span>
                </label>
              </div>
            </div>
          </div>

          {/* Project Types Vocabulary Card */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#050505] p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-4 pb-3 border-b border-white/[0.06] flex-wrap">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-neutral-300">
                  <Check className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-[14px] font-semibold text-white tracking-tight">Project Types Vocabulary</h2>
                  <p className="text-[12px] text-neutral-400">Options provided during project onboarding (Max {MAX_PROJECT_TYPES})</p>
                </div>
              </div>
              <span className="text-[12px] text-neutral-500 font-mono">
                {form.projectTypes.length} / {MAX_PROJECT_TYPES} defined
              </span>
            </div>

            {canManage && (
              <form
                onSubmit={e => { e.preventDefault(); addProjectType(); }}
                className="flex items-center gap-2 max-w-md"
              >
                <input
                  type="text"
                  value={newProjectType}
                  onChange={e => setNewProjectType(e.target.value)}
                  maxLength={MAX_PROJECT_TYPE_LENGTH}
                  placeholder="e.g. Brand Strategy, Mobile App Development"
                  aria-label="New project type"
                  disabled={form.projectTypes.length >= MAX_PROJECT_TYPES}
                  className={INPUT}
                />
                <button
                  type="submit"
                  disabled={newProjectType.trim() === '' || form.projectTypes.length >= MAX_PROJECT_TYPES}
                  className="h-9 px-4 shrink-0 bg-white text-black rounded-lg text-[13px] font-semibold hover:bg-neutral-200 disabled:opacity-40 transition-colors inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden /> Add Type
                </button>
              </form>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              {form.projectTypes.map(t => (
                <span
                  key={t}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] text-[12.5px] text-neutral-200"
                >
                  <span>{t}</span>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => removeProjectType(t)}
                      disabled={form.projectTypes.length <= 1}
                      title={form.projectTypes.length <= 1 ? 'At least one project type is required' : `Remove ${t}`}
                      aria-label={`Remove ${t}`}
                      className="text-neutral-500 hover:text-rose-400 disabled:opacity-30 disabled:hover:text-neutral-500 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden />
                    </button>
                  )}
                </span>
              ))}
            </div>
            <p className="text-[11px] text-neutral-500">
              Removing a type only removes it from future project creation options; existing projects retain their designated type.
            </p>

            {canManage && (
              <SaveBtn
                busy={busy === 'general'}
                disabled={busy !== null}
                onClick={() => save('general', sectionBody('general'))}
              />
            )}
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 2: TRANSACTION CATEGORIES                                */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'categories' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-white/[0.08] bg-[#050505] p-5 sm:p-6 space-y-5">
            <div className="flex items-center justify-between gap-4 pb-3 border-b border-white/[0.06] flex-wrap">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-neutral-300">
                  <Tag className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-[14px] font-semibold text-white tracking-tight">Transaction Categories</h2>
                  <p className="text-[12px] text-neutral-400">Define the core buckets for income and expenses across transactions, budgets, and reports</p>
                </div>
              </div>
              <span className="text-[12px] text-neutral-500 font-mono">
                {categories.length} {categories.length === 1 ? 'category' : 'categories'}
              </span>
            </div>

            {/* Add Category Form */}
            {canManage && (
              <form onSubmit={handleAddCategory} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 max-w-lg">
                <input
                  type="text"
                  value={newCat}
                  onChange={e => setNewCat(e.target.value)}
                  placeholder="e.g. Cloud Infrastructure, Retainer Retainers"
                  disabled={catBusy}
                  className={INPUT}
                  required
                />
                <button
                  type="submit"
                  disabled={catBusy || !newCat.trim()}
                  className="h-9 px-4 shrink-0 bg-white text-black rounded-lg text-[13px] font-semibold hover:bg-neutral-200 disabled:opacity-40 transition-colors inline-flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden /> Add Category
                </button>
              </form>
            )}

            {/* Filter Search */}
            {categories.length > 6 && (
              <div className="relative max-w-xs">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                <input
                  type="text"
                  value={categorySearch}
                  onChange={e => setCategorySearch(e.target.value)}
                  placeholder="Filter categories…"
                  className="h-8.5 w-full bg-white/[0.02] border border-white/[0.06] rounded-lg pl-8 pr-3 text-[12px] text-white focus:border-white/[0.2] outline-none"
                />
              </div>
            )}

            {/* Categories Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
              {filteredCategories.map(cat => (
                <div
                  key={cat.id}
                  className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] transition-colors group"
                >
                  <span className="text-[13px] font-medium text-neutral-200 truncate">{cat.name}</span>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(cat.id, cat.name)}
                      aria-label={`Delete category ${cat.name}`}
                      className="text-neutral-500 hover:text-rose-400 opacity-60 group-hover:opacity-100 transition-all p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {filteredCategories.length === 0 && (
                <div className="col-span-full py-8 text-center text-[13px] text-neutral-500">
                  {categorySearch ? 'No categories match your search.' : 'No categories defined yet.'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 3: BILLING & INVOICING                                   */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'billing' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Invoice Terms Card */}
            <div className="rounded-2xl border border-white/[0.08] bg-[#050505] p-5 sm:p-6 space-y-4">
              <div className="flex items-center gap-2.5 pb-3 border-b border-white/[0.06]">
                <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-neutral-300">
                  <Receipt className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-[14px] font-semibold text-white tracking-tight">Invoice Specifications</h2>
                  <p className="text-[12px] text-neutral-400">Numbering sequences and default payment schedules</p>
                </div>
              </div>

              <div className="space-y-3.5">
                <label className="block space-y-1">
                  <span className="text-[12px] font-medium text-neutral-300">Invoice Number Prefix</span>
                  <input
                    type="text"
                    value={form.invoicePrefix}
                    disabled={!canManage}
                    onChange={e => set('invoicePrefix', e.target.value.toUpperCase())}
                    placeholder="INV"
                    maxLength={20}
                    className={INPUT}
                  />
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-neutral-500">
                    <span>Preview format:</span>
                    <span className="font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                      {form.invoicePrefix || 'INV'}-2026-27-000001
                    </span>
                  </div>
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block space-y-1">
                    <span className="text-[12px] font-medium text-neutral-300">Payment Terms (days)</span>
                    <input
                      type="number"
                      min={0}
                      max={120}
                      value={form.paymentTermsDays}
                      disabled={!canManage}
                      onChange={e => set('paymentTermsDays', e.target.value)}
                      placeholder="e.g. 15"
                      className={INPUT}
                    />
                    <span className="block text-[11px] text-neutral-500">Default due terms (0–120).</span>
                  </label>

                  <label className="block space-y-1">
                    <span className="text-[12px] font-medium text-neutral-300">Default Tax Profile</span>
                    <Select
                      value={form.defaultTaxProfileId}
                      disabled={!canManage}
                      onChange={e => set('defaultTaxProfileId', e.target.value)}
                      className={INPUT}
                    >
                      <option value="">None (zero-rated default)</option>
                      {taxProfiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </Select>
                    <span className="block text-[11px] text-neutral-500">Applied automatically to new invoices.</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Payment Methods Card */}
            <div className="rounded-2xl border border-white/[0.08] bg-[#050505] p-5 sm:p-6 space-y-4">
              <div className="flex items-center gap-2.5 pb-3 border-b border-white/[0.06]">
                <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-neutral-300">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-[14px] font-semibold text-white tracking-tight">Accepted Payment Methods</h2>
                  <p className="text-[12px] text-neutral-400">Payment methods offered on client invoices</p>
                </div>
              </div>

              <div className="space-y-3.5">
                <label className="block space-y-1">
                  <span className="text-[12px] font-medium text-neutral-300">Payment Methods (comma separated)</span>
                  <input
                    type="text"
                    value={form.defaultPaymentMethods}
                    disabled={!canManage}
                    onChange={e => set('defaultPaymentMethods', e.target.value)}
                    placeholder="e.g. Bank Transfer, UPI, Razorpay Online"
                    className={INPUT}
                  />
                  <span className="block text-[11px] text-neutral-500">Up to 10 payment options printed on client invoices.</span>
                </label>

                {canManage && (
                  <div className="pt-2">
                    <span className="text-[11px] text-neutral-500 block mb-1.5">Quick suggestions:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {['Bank Transfer', 'UPI', 'Razorpay', 'NEFT / RTGS', 'Wire Transfer'].map(m => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => {
                            const current = form.defaultPaymentMethods.split(',').map(s => s.trim()).filter(Boolean);
                            if (!current.includes(m)) {
                              set('defaultPaymentMethods', [...current, m].join(', '));
                            }
                          }}
                          className="text-[11px] px-2 py-1 rounded bg-white/[0.04] border border-white/[0.08] text-neutral-300 hover:text-white hover:bg-white/[0.08] transition-colors"
                        >
                          + {m}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {canManage && (
            <div className="rounded-2xl border border-white/[0.08] bg-[#050505] p-5 sm:p-6">
              <SaveBtn
                busy={busy === 'billing'}
                disabled={busy !== null}
                onClick={saveBilling}
              />
            </div>
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 4: TAX & COMPLIANCE                                      */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'tax' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-white/[0.08] bg-[#050505] p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-white/[0.06]">
              <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-neutral-300">
                <Landmark className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-[14px] font-semibold text-white tracking-tight">Statutory Tax & Compliance</h2>
                <p className="text-[12px] text-neutral-400">Defaults consumed by the invoice tax calculation engine</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block space-y-1">
                <span className="text-[12px] font-medium text-neutral-300">Default SAC Code</span>
                <input
                  type="text"
                  value={form.defaultSacCode}
                  disabled={!canManage}
                  onChange={e => set('defaultSacCode', e.target.value)}
                  placeholder="e.g. 998313"
                  className={INPUT}
                />
                <span className="block text-[11px] text-neutral-500">Services Accounting Code applied to unclassified line items.</span>
              </label>

              <label className="block space-y-1">
                <span className="text-[12px] font-medium text-neutral-300">Registration Type</span>
                <input
                  type="text"
                  value={form.registrationType}
                  disabled={!canManage}
                  onChange={e => set('registrationType', e.target.value)}
                  placeholder="e.g. GSTIN"
                  className={INPUT}
                />
                <span className="block text-[11px] text-neutral-500">e.g. GSTIN, VAT, or Tax Exempt status.</span>
              </label>

              <label className="block space-y-1">
                <span className="text-[12px] font-medium text-neutral-300">GSTIN</span>
                <input
                  type="text"
                  value={form.gstin}
                  disabled={!canManage}
                  onChange={e => set('gstin', e.target.value.toUpperCase())}
                  placeholder="27AAPFU0939F1ZV"
                  maxLength={15}
                  className={INPUT}
                />
                <span className="block text-[11px] text-neutral-500">15 characters: 2-digit state code + PAN + entity + Z + check.</span>
              </label>

              <label className="block space-y-1">
                <span className="text-[12px] font-medium text-neutral-300">State / Province</span>
                <input
                  type="text"
                  value={form.stateCode}
                  disabled={!canManage}
                  onChange={e => set('stateCode', e.target.value)}
                  placeholder="e.g. Maharashtra"
                  className={INPUT}
                />
                <span className="block text-[11px] text-neutral-500">Determines intra-state (CGST+SGST) vs inter-state (IGST) applicability.</span>
              </label>
            </div>

            {canManage && (
              <SaveBtn
                busy={busy === 'tax'}
                disabled={busy !== null}
                onClick={() => save('tax', sectionBody('tax'))}
              />
            )}
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 5: PROFITABILITY & ALERTS                                */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'profitability' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Margins & Overdue Card */}
            <div className="rounded-2xl border border-white/[0.08] bg-[#050505] p-5 sm:p-6 space-y-4">
              <div className="flex items-center gap-2.5 pb-3 border-b border-white/[0.06]">
                <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-neutral-300">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-[14px] font-semibold text-white tracking-tight">Commercial Targets</h2>
                  <p className="text-[12px] text-neutral-400">Baseline margin goals and cash collection thresholds</p>
                </div>
              </div>

              <div className="space-y-3.5">
                <label className="block space-y-1">
                  <span className="text-[12px] font-medium text-neutral-300">Target Project Margin (%)</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={form.targetProjectMargin}
                    disabled={!canManage}
                    onChange={e => set('targetProjectMargin', e.target.value)}
                    placeholder="e.g. 35"
                    className={INPUT}
                  />
                  <span className="block text-[11px] text-neutral-500">Default for NEW projects only; existing project targets are never altered.</span>
                </label>

                <label className="block space-y-1">
                  <span className="text-[12px] font-medium text-neutral-300">Overdue Warning Lead Time (days)</span>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={form.overdueWarningDays}
                    disabled={!canManage}
                    onChange={e => set('overdueWarningDays', e.target.value)}
                    placeholder="7"
                    className={INPUT}
                  />
                  <span className="block text-[11px] text-neutral-500">Days before due date to flag open invoices under &quot;Due Soon&quot; alerts.</span>
                </label>
              </div>
            </div>

            {/* Hour Threshold Bands Card */}
            <div className="rounded-2xl border border-white/[0.08] bg-[#050505] p-5 sm:p-6 space-y-4">
              <div className="flex items-center gap-2.5 pb-3 border-b border-white/[0.06]">
                <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-neutral-300">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-[14px] font-semibold text-white tracking-tight">Planned Hours Alert Bands</h2>
                  <p className="text-[12px] text-neutral-400">Triggers for team burn and project over-delivery warnings</p>
                </div>
              </div>

              <div className="space-y-3.5">
                <div className="grid grid-cols-3 gap-3">
                  <label className="block space-y-1">
                    <span className="text-[12px] font-medium text-emerald-400">First Alert (%)</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={form.hoursFirst}
                      disabled={!canManage}
                      onChange={e => set('hoursFirst', e.target.value)}
                      className={INPUT}
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[12px] font-medium text-amber-400">Warning (%)</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={form.hoursWarning}
                      disabled={!canManage}
                      onChange={e => set('hoursWarning', e.target.value)}
                      className={INPUT}
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[12px] font-medium text-rose-400">Critical (%)</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={form.hoursCritical}
                      disabled={!canManage}
                      onChange={e => set('hoursCritical', e.target.value)}
                      className={INPUT}
                    />
                  </label>
                </div>

                <div className="pt-2">
                  <div className="h-2 rounded-full w-full bg-white/[0.06] overflow-hidden flex">
                    <div style={{ width: `${Math.min(Number(form.hoursFirst) || 75, 100)}%` }} className="bg-emerald-500/80 h-full" />
                    <div style={{ width: `${Math.max((Number(form.hoursWarning) || 80) - (Number(form.hoursFirst) || 75), 0)}%` }} className="bg-amber-500/80 h-full" />
                    <div style={{ width: `${Math.max((Number(form.hoursCritical) || 100) - (Number(form.hoursWarning) || 80), 0)}%` }} className="bg-rose-500/80 h-full" />
                  </div>
                  <span className="block text-[11px] text-neutral-500 mt-2">
                    Must stay ordered: First Alert &lt; Warning &lt; Critical threshold.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {canManage && (
            <div className="rounded-2xl border border-white/[0.08] bg-[#050505] p-5 sm:p-6">
              <SaveBtn
                busy={busy === 'profitability'}
                disabled={busy !== null}
                onClick={() => save('profitability', sectionBody('profitability'))}
              />
            </div>
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 6: PAYMENT GATEWAY                                       */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'payment' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-white/[0.08] bg-[#050505] p-5 sm:p-6 space-y-5">
            <div className="flex items-center justify-between gap-4 pb-3 border-b border-white/[0.06] flex-wrap">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-neutral-300">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-[14px] font-semibold text-white tracking-tight">Razorpay Gateway Integration</h2>
                  <p className="text-[12px] text-neutral-400">Collect online payments with automated invoice reconciliation</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!canManage}
                  onClick={() => set('razorpayEnabled', true)}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors border ${
                    form.razorpayEnabled
                      ? 'bg-emerald-400 text-black border-emerald-400 font-semibold'
                      : 'bg-transparent text-neutral-400 border-white/[0.1] hover:text-white'
                  }`}
                >
                  Enabled
                </button>
                <button
                  type="button"
                  disabled={!canManage}
                  onClick={() => set('razorpayEnabled', false)}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors border ${
                    !form.razorpayEnabled
                      ? 'bg-white text-black border-white font-semibold'
                      : 'bg-transparent text-neutral-400 border-white/[0.1] hover:text-white'
                  }`}
                >
                  Disabled
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block space-y-1 md:col-span-2">
                <span className="text-[12px] font-medium text-neutral-300">Key ID</span>
                <input
                  type="text"
                  value={form.razorpayKeyId}
                  disabled={!canManage}
                  onChange={e => set('razorpayKeyId', e.target.value)}
                  placeholder="rzp_live_…"
                  className={INPUT}
                />
                <span className="block text-[11px] text-neutral-500">Public Key identifier provided in your Razorpay API dashboard.</span>
              </label>

              <label className="block space-y-1">
                <span className="text-[12px] font-medium text-neutral-300">Key Secret</span>
                <input
                  type="password"
                  value={form.razorpayKeySecret}
                  disabled={!canManage}
                  onChange={e => set('razorpayKeySecret', e.target.value)}
                  autoComplete="new-password"
                  placeholder={settings?.payment.hasKeySecret ? '•••••••••••• (saved — leave blank to keep)' : 'Not set'}
                  className={INPUT}
                />
                <span className="block text-[11px] text-neutral-500">Encrypted at rest. Entering a new secret rotates the stored credential.</span>
              </label>

              <label className="block space-y-1">
                <span className="text-[12px] font-medium text-neutral-300">Webhook Secret</span>
                <input
                  type="password"
                  value={form.webhookSecret}
                  disabled={!canManage}
                  onChange={e => set('webhookSecret', e.target.value)}
                  autoComplete="new-password"
                  placeholder={settings?.payment.hasWebhookSecret ? '•••••••••••• (saved — leave blank to keep)' : 'Not set'}
                  className={INPUT}
                />
                <span className="block text-[11px] text-neutral-500">Validates digital signatures of incoming payment settlement webhooks.</span>
              </label>
            </div>

            {testResult && (
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3.5 text-[12.5px] text-neutral-200">
                <span className="text-neutral-500 mr-2 font-mono">Result:</span>
                {testResult}
              </div>
            )}

            {canManage && (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-white/[0.06]">
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={testCredentials}
                  className="inline-flex items-center gap-2 h-9 px-4 bg-white/[0.05] text-white rounded-lg text-[13px] font-medium border border-white/[0.1] hover:bg-white/[0.1] transition-colors disabled:opacity-50"
                >
                  <Key className="w-3.5 h-3.5" />
                  {busy === 'test' ? 'Testing credentials…' : 'Test Connection'}
                </button>
                <SaveBtn
                  busy={busy === 'payment'}
                  disabled={busy !== null}
                  onClick={() => save('payment', sectionBody('payment'))}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
