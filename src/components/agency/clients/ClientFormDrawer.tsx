"use client";

import React, { useState } from 'react';
import { ChevronDown, AlertTriangle } from 'lucide-react';
import { Drawer } from '@/components/ui/Drawer';
import type { AgencyClient } from '@/lib/agency/types/client';
import { CLIENT_STATUSES, BILLING_MODELS, DEFAULT_CLIENT_STATUS, canTransitionClientStatus, type ClientStatus, type BillingModel } from '@/lib/agency/types/client';
import { Select } from '@/components/ui/Select';
import { Req, Opt } from '@/components/ui/Req';

/**
 * Client creation/edit drawer (Module 2, spec §23–§25).
 *
 * Progressive disclosure (§23): the primary form is 5 fields — Client Name,
 * Contact Email, Phone, Country, Currency. Everything else hides behind
 * collapsible sections (Billing Details, Tax Details, Commercial Defaults,
 * Notes) so the user is never facing 25 fields at once.
 *
 * Duplicate policy (§18): submitting a colliding name returns 409
 * DUPLICATE_WARNING with existing clients. The drawer surfaces
 * Create Anyway / View Existing / Cancel — never a silent rejection.
 *
 * §25: reuses the existing Money OS Drawer pattern — no new modal system.
 */

export interface ClientFormValues {
  name?: string;
  email?: string;
  phone?: string;
  website?: string;
  legalName?: string;
  industry?: string;
  notes?: string;
  status?: ClientStatus;
  primaryContact?: { name?: string; email?: string; phone?: string; role?: string };
  billingProfile?: { email?: string; address?: string; city?: string; state?: string; postalCode?: string; country?: string; currency?: string };
  taxProfile?: { country?: string; registrationType?: string; registrationNumber?: string; placeOfSupply?: string };
  commercialDefaults?: { billingModel?: string; paymentTerms?: string; currency?: string };
  [key: string]: unknown;
}

interface SectionProps {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function Section({ title, open, onToggle, children }: SectionProps) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.01]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-3.5 py-2.5 text-left"
      >
        <span className="text-[12.5px] font-medium text-neutral-200">{title}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-neutral-500 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && <div className="px-3.5 pb-3.5 pt-1 space-y-3">{children}</div>}
    </div>
  );
}

const inputCls = 'w-full px-3 py-2 rounded-lg bg-[#0a0a0a] border border-white/[0.06] text-[13px] text-white placeholder:text-neutral-600 focus:outline-none focus:border-white/20';
const labelCls = 'block text-[11px] font-medium uppercase tracking-wider text-neutral-500 mb-1.5';

interface ClientFormDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  editing: AgencyClient | null;
  onSave: (values: ClientFormValues, allowDuplicate: boolean, id?: string) => Promise<{ ok: boolean; duplicate?: { name: string; id: string }[] }>;
  onSaved: () => void;
}

export function ClientFormDrawer({ isOpen, onClose, editing, onSave, onSaved }: ClientFormDrawerProps) {
  // Primary form (§24)
  const [name, setName] = useState(editing?.name ?? '');
  const [contactEmail, setContactEmail] = useState(editing?.email ?? '');
  const [phone, setPhone] = useState(editing?.phone ?? editing?.primaryContact?.phone ?? '');
  const [country, setCountry] = useState(editing?.taxProfile?.country ?? '');
  const [currency, setCurrency] = useState(editing?.commercialDefaults?.currency ?? editing?.billingProfile?.currency ?? '');

  // Expandable sections
  const [website, setWebsite] = useState(editing?.website ?? '');
  const [legalName, setLegalName] = useState(editing?.legalName ?? '');
  const [industry, setIndustry] = useState(editing?.industry ?? '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [contactName, setContactName] = useState(editing?.primaryContact?.name ?? '');
  const [contactRole, setContactRole] = useState(editing?.primaryContact?.role ?? '');
  const [billingEmail, setBillingEmail] = useState(editing?.billingProfile?.email ?? '');
  const [billingAddress, setBillingAddress] = useState(editing?.billingProfile?.address ?? '');
  const [billingCity, setBillingCity] = useState(editing?.billingProfile?.city ?? '');
  const [billingState, setBillingState] = useState(editing?.billingProfile?.state ?? '');
  const [billingPostal, setBillingPostal] = useState(editing?.billingProfile?.postalCode ?? '');
  const [billingCountry, setBillingCountry] = useState(editing?.billingProfile?.country ?? '');
  const [billingCurrency, setBillingCurrency] = useState(editing?.billingProfile?.currency ?? '');
  const [taxRegType, setTaxRegType] = useState(editing?.taxProfile?.registrationType ?? '');
  const [taxRegNumber, setTaxRegNumber] = useState(editing?.taxProfile?.registrationNumber ?? '');
  const [placeOfSupply, setPlaceOfSupply] = useState(editing?.taxProfile?.placeOfSupply ?? '');
  const [billingModel, setBillingModel] = useState(editing?.commercialDefaults?.billingModel ?? '');
  const [paymentTerms, setPaymentTerms] = useState(editing?.commercialDefaults?.paymentTerms ?? '');
  const [status, setStatus] = useState<ClientStatus>(editing?.status ?? DEFAULT_CLIENT_STATUS);

  /**
   * The §14 lifecycle moves offered by the Status control: the client's
   * persisted status, plus every legal single hop out of it.
   *
   * Derived from `editing.status` and never from the in-flight `status`
   * selection — the domain service validates one hop against the STORED
   * status, so deriving from the selection would let a two-click chain offer a
   * move the server then rejects.
   */
  const currentStatus: ClientStatus = editing?.status ?? DEFAULT_CLIENT_STATUS;
  const statusOptions: ClientStatus[] = [
    currentStatus,
    ...CLIENT_STATUSES.filter(s => s !== currentStatus && canTransitionClientStatus(currentStatus, s)),
  ];

  const [billingOpen, setBillingOpen] = useState(false);
  const [taxOpen, setTaxOpen] = useState(false);
  const [commercialOpen, setCommercialOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);

  // Submit state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ name: string; id: string }[] | null>(null);

  function reset() {
    setDuplicate(null);
    setError(null);
  }

  function buildValues(): ClientFormValues {
    const values: ClientFormValues = { name: name.trim() || undefined };
    if (contactEmail.trim()) values.email = contactEmail.trim();
    if (phone.trim()) values.phone = phone.trim();
    if (website.trim()) values.website = website.trim();
    if (legalName.trim()) values.legalName = legalName.trim();
    if (industry.trim()) values.industry = industry.trim();
    if (notes.trim()) values.notes = notes.trim();
    if (contactName.trim() || contactEmail.trim() || phone.trim() || contactRole.trim()) {
      values.primaryContact = {
        ...(contactName.trim() ? { name: contactName.trim() } : {}),
        ...(contactEmail.trim() ? { email: contactEmail.trim() } : {}),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        ...(contactRole.trim() ? { role: contactRole.trim() } : {}),
      };
    }
    if (billingEmail.trim() || billingAddress.trim() || billingCity.trim() || billingState.trim() || billingPostal.trim() || billingCountry.trim() || billingCurrency.trim()) {
      values.billingProfile = {
        ...(billingEmail.trim() ? { email: billingEmail.trim() } : {}),
        ...(billingAddress.trim() ? { address: billingAddress.trim() } : {}),
        ...(billingCity.trim() ? { city: billingCity.trim() } : {}),
        ...(billingState.trim() ? { state: billingState.trim() } : {}),
        ...(billingPostal.trim() ? { postalCode: billingPostal.trim() } : {}),
        ...(billingCountry.trim() ? { country: billingCountry.trim() } : {}),
        ...(billingCurrency.trim() ? { currency: billingCurrency.trim().toUpperCase() } : {}),
      };
    }
    if (country.trim() || taxRegType.trim() || taxRegNumber.trim() || placeOfSupply.trim()) {
      values.taxProfile = {
        ...(country.trim() ? { country: country.trim() } : {}),
        ...(taxRegType.trim() ? { registrationType: taxRegType.trim() } : {}),
        ...(taxRegNumber.trim() ? { registrationNumber: taxRegNumber.trim() } : {}),
        ...(placeOfSupply.trim() ? { placeOfSupply: placeOfSupply.trim() } : {}),
      };
    }
    if (billingModel || paymentTerms || currency.trim()) {
      values.commercialDefaults = {
        ...(billingModel ? { billingModel } : {}),
        ...(paymentTerms ? { paymentTerms } : {}),
        ...(currency.trim() ? { currency: currency.trim().toUpperCase() } : {}),
      };
    }
    // Status travels only on edit and only when it actually moved, so an
    // untouched dropdown never issues a no-op lifecycle write.
    if (editing && status !== (editing.status ?? DEFAULT_CLIENT_STATUS)) {
      values.status = status;
    }
    return values;
  }

  async function handleSubmit(allowDuplicate: boolean) {
    if (!name.trim()) {
      setError('Client name is required.');
      return;
    }
    if (contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())) {
      setError('Contact email doesn\'t look valid.');
      return;
    }
    setSaving(true);
    reset();
    const result = await onSave(buildValues(), allowDuplicate, editing?.id);
    setSaving(false);
    if (result.duplicate) {
      setDuplicate(result.duplicate);
      return;
    }
    if (!result.ok) {
      setError('We couldn\'t save this client. Check the fields and try again.');
      return;
    }
    onSaved();
  }

  const duplicateChoices = duplicate && duplicate.length > 0;

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title={editing ? 'Edit Client' : 'New Client'}>
      <form onSubmit={e => { e.preventDefault(); void handleSubmit(false); }} className="space-y-4">
        {/* Primary form (§24): 5 fields, always visible */}
        <div className="space-y-3">
          <div>
            <label htmlFor="client-name" className={labelCls}>Client Name <Req satisfied={Boolean(name.trim())} /></label>
            <input id="client-name" value={name} onChange={e => setName(e.target.value)} required maxLength={120} placeholder="Acme Studio Pvt Ltd" className={inputCls} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="client-email" className={labelCls}>Contact Email <Opt /></label>
              <input id="client-email" type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="name@company.com" className={inputCls} />
            </div>
            <div>
              <label htmlFor="client-phone" className={labelCls}>Phone <Opt /></label>
              <input id="client-phone" value={phone} onChange={e => setPhone(e.target.value)} maxLength={30} placeholder="+91 98765 43210" className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="client-country" className={labelCls}>Country <Opt /></label>
              <input id="client-country" value={country} onChange={e => setCountry(e.target.value)} placeholder="India" className={inputCls} />
            </div>
            <div>
              <label htmlFor="client-currency" className={labelCls}>Currency <Opt /></label>
              <input id="client-currency" value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} maxLength={3} placeholder="INR" className={inputCls} />
            </div>
          </div>
        </div>

        {/* Contact detail (§7) */}
        <div className="pt-1">
          <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500 mb-2">Primary Contact <Opt /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="contact-name" className={labelCls}>Name <Opt /></label>
              <input id="contact-name" value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Priya Sharma" className={inputCls} />
            </div>
            <div>
              <label htmlFor="contact-role" className={labelCls}>Role <Opt /></label>
              <input id="contact-role" value={contactRole} onChange={e => setContactRole(e.target.value)} placeholder="Finance Manager" className={inputCls} />
            </div>
          </div>
        </div>

        {/* Expandable sections (§23 progressive disclosure) */}
        <div className="space-y-2 pt-1">
          <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Optional details</div>

          <Section title="Billing Details" open={billingOpen} onToggle={() => setBillingOpen(v => !v)}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label htmlFor="billing-email" className={labelCls}>Billing Email</label>
                <input id="billing-email" type="email" value={billingEmail} onChange={e => setBillingEmail(e.target.value)} placeholder="accounts@company.com" className={inputCls} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="billing-address" className={labelCls}>Address</label>
                <input id="billing-address" value={billingAddress} onChange={e => setBillingAddress(e.target.value)} placeholder="123 Main Road" className={inputCls} />
              </div>
              <div>
                <label htmlFor="billing-city" className={labelCls}>City</label>
                <input id="billing-city" value={billingCity} onChange={e => setBillingCity(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label htmlFor="billing-state" className={labelCls}>State</label>
                <input id="billing-state" value={billingState} onChange={e => setBillingState(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label htmlFor="billing-postal" className={labelCls}>Postal Code</label>
                <input id="billing-postal" value={billingPostal} onChange={e => setBillingPostal(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label htmlFor="billing-country" className={labelCls}>Billing Country</label>
                <input id="billing-country" value={billingCountry} onChange={e => setBillingCountry(e.target.value)} className={inputCls} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="billing-currency" className={labelCls}>Billing Currency</label>
                <input id="billing-currency" value={billingCurrency} onChange={e => setBillingCurrency(e.target.value.toUpperCase())} maxLength={3} placeholder="INR" className={inputCls} />
              </div>
            </div>
          </Section>

          <Section title="Tax Details" open={taxOpen} onToggle={() => setTaxOpen(v => !v)}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="tax-reg-type" className={labelCls}>Registration Type</label>
                <input id="tax-reg-type" value={taxRegType} onChange={e => setTaxRegType(e.target.value)} placeholder="GSTIN / VAT / EIN" className={inputCls} />
              </div>
              <div>
                <label htmlFor="tax-reg-number" className={labelCls}>Registration Number</label>
                <input id="tax-reg-number" value={taxRegNumber} onChange={e => setTaxRegNumber(e.target.value)} className={inputCls} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="tax-place-of-supply" className={labelCls}>Place of Supply</label>
                <input id="tax-place-of-supply" value={placeOfSupply} onChange={e => setPlaceOfSupply(e.target.value)} className={inputCls} />
              </div>
            </div>
          </Section>

          <Section title="Commercial Defaults" open={commercialOpen} onToggle={() => setCommercialOpen(v => !v)}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="billing-model" className={labelCls}>Billing Model</label>
                <Select id="billing-model" value={billingModel} onChange={e => setBillingModel(e.target.value as BillingModel | '')} className={inputCls}>
                  <option value="">Not set</option>
                  {BILLING_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                </Select>
              </div>
              <div>
                <label htmlFor="payment-terms" className={labelCls}>Payment Terms</label>
                <Select id="payment-terms" value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} className={inputCls}>
                  <option value="">Not set</option>
                  <option value="DUE_ON_RECEIPT">Due on receipt</option>
                  <option value="NET_7">Net 7</option>
                  <option value="NET_15">Net 15</option>
                  <option value="NET_30">Net 30</option>
                  <option value="NET_45">Net 45</option>
                  <option value="NET_60">Net 60</option>
                  <option value="CUSTOM">Custom</option>
                </Select>
              </div>
            </div>
            <p className="text-[11px] text-neutral-600">Defaults applied to future projects and invoices for this client.</p>
          </Section>

          <Section title="Notes" open={notesOpen} onToggle={() => setNotesOpen(v => !v)}>
            <div>
              <label htmlFor="client-notes" className={labelCls}>Notes</label>
              <textarea id="client-notes" value={notes} onChange={e => setNotes(e.target.value)} rows={4} placeholder="Anything worth remembering about this client…" className={`${inputCls} resize-none`} />
            </div>
          </Section>
        </div>

        {/* Status control on edit only — creation always starts PROSPECT/ACTIVE via defaults, not here.
            Until now this was a disabled read-out: the lifecycle API accepted
            status moves but the UI offered no way to make one except the
            archive/restore buttons on the list. */}
        {editing && (
          <div className="pt-1">
            <label htmlFor="client-status" className={labelCls}>Status</label>
            <Select id="client-status" value={status} onChange={e => setStatus(e.target.value as ClientStatus)} className={inputCls}>
              {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </Select>
            <p className="mt-1.5 text-[11px] text-neutral-600">
              Only legal lifecycle moves for this client are listed. INACTIVE deactivates;
              ARCHIVED is the delete surrogate — financial history stays resolvable.
            </p>
          </div>
        )}

        {/* §18 — duplicate warning: Create Anyway / View Existing / Cancel */}
        {duplicateChoices && (
          <div role="alertdialog" aria-label="Duplicate client warning" className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-4 space-y-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" aria-hidden />
              <div>
                <p className="text-[13px] font-medium text-amber-200">A client with this name already exists</p>
                <ul className="mt-2 space-y-1">
                  {duplicate.map(d => (
                    <li key={d.id} className="text-[12px] text-neutral-300">
                      <a href={`/dashboard/agency/clients/${d.id}`} className="underline underline-offset-2 hover:text-white">{d.name}</a>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11.5px] text-neutral-500">Duplicates are allowed — this is just a check so you don&rsquo;t create the same client twice.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void handleSubmit(true)} disabled={saving} className="px-3 py-1.5 rounded bg-amber-400 text-black text-[12.5px] font-semibold hover:bg-amber-300 disabled:opacity-50 transition-colors">
                {saving ? 'Creating…' : 'Create Anyway'}
              </button>
              <button type="button" onClick={() => setDuplicate(null)} className="px-3 py-1.5 rounded border border-white/[0.08] text-[12.5px] text-neutral-300 hover:bg-white/[0.04] transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Validation / submit error */}
        {error && !duplicate && (
          <p role="alert" className="text-[12.5px] text-red-400">{error}</p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.05]">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded border border-white/[0.08] text-[12.5px] text-neutral-300 hover:bg-white/[0.04] transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={saving || !!duplicate} className="px-3.5 py-1.5 rounded bg-white text-black text-[12.5px] font-semibold hover:bg-neutral-200 disabled:opacity-50 transition-colors">
            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Client'}
          </button>
        </div>
      </form>
    </Drawer>
  );
}
