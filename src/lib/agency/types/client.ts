/**
 * Agency Vertical — Types: Client contract (Module 2, spec §7–§16)
 *
 * CLIENT-SAFE: types and pure functions only — no imports of lib/db, mongodb,
 * or any server-only module. React components import from here.
 *
 * MODULE 2 CORE RULE (spec §5): the Agency client is the EXISTING Money OS
 * Client, evolved in place — there is no separate AgencyClient collection.
 * Core client references (Transaction.clientId) and agency client
 * capabilities share this one entity.
 *
 * NULLABLE EXPANSION (spec §17): every new property is optional. An existing
 * client ({ tenantId, name, email }) remains fully valid; missing `status`
 * resolves to ACTIVE on read (migration §106: default-on-read, never a
 * destructive rewrite; historical client IDs are never touched).
 *
 * Status lifecycle (spec §13–§14):
 *   PROSPECT → ACTIVE ⇄ PAUSED → INACTIVE → ARCHIVED
 *   plus PROSPECT → INACTIVE and ACTIVE → INACTIVE (not every prospect
 *   converts). ARCHIVED is the delete surrogate (§15): financial history
 *   keeps the client resolvable; hard DELETE does not exist for clients.
 */
import type { PaymentTerms } from './dates';
import type { TaxIdentifier, TaxTreatment } from './tax';

/** Commercial billing models (spec §12/§42). */
export type BillingModel = 'FIXED_FEE' | 'TIME_AND_MATERIALS' | 'MILESTONE';

export const BILLING_MODELS: readonly BillingModel[] = [
  'FIXED_FEE', 'TIME_AND_MATERIALS', 'MILESTONE',
] as const;

/** Client lifecycle status (spec §13). Not a CRM pipeline — delivery states only. */
export type ClientStatus = 'PROSPECT' | 'ACTIVE' | 'PAUSED' | 'INACTIVE' | 'ARCHIVED';

export const CLIENT_STATUSES: readonly ClientStatus[] = [
  'PROSPECT', 'ACTIVE', 'PAUSED', 'INACTIVE', 'ARCHIVED',
] as const;

/**
 * The non-destructive default for clients that predate Module 2 (§106).
 * Existing records carry no status field; they resolve to this on read.
 */
export const DEFAULT_CLIENT_STATUS: ClientStatus = 'ACTIVE';

/**
 * Legal status transitions (spec §14). Everything else is rejected by the
 * domain service — no arbitrary hops. Restoring from ARCHIVED returns the
 * client to INACTIVE (the state it was archived from), not ACTIVE.
 */
const ALLOWED_TRANSITIONS: Readonly<Record<ClientStatus, readonly ClientStatus[]>> = {
  PROSPECT: ['ACTIVE', 'INACTIVE'],
  ACTIVE: ['PAUSED', 'INACTIVE'],
  PAUSED: ['ACTIVE', 'INACTIVE'],
  INACTIVE: ['ARCHIVED', 'ACTIVE'],
  ARCHIVED: ['INACTIVE'], // restore only
};

/** Pure transition check — the domain service is the only caller that writes. */
export function canTransitionClientStatus(from: ClientStatus, to: ClientStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

// ---------- Module 2 client shape (spec §16) ----------

export interface ClientPrimaryContact {
  name?: string;
  email?: string;
  phone?: string;
  /** Free-form role: "Founder", "Finance Contact", "Project Contact", … */
  role?: string;
}

export interface ClientBillingProfile {
  /** Billing email — deliberately independent from the operational contact email (§9). */
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  currency?: string;
}

/**
 * Flexible tax profile (§11) — country-agnostic on purpose. India fills
 * { country: 'IN', registrationType: 'GSTIN', registrationNumber, placeOfSupply };
 * other countries use their own registration types. No Indian-only fields on
 * the client model itself.
 *
 * Module 11 (§8–§9) — the client's tax posture extends IN PLACE:
 *   taxTreatment     the §6 vocabulary (REGISTERED/UNREGISTERED/EXEMPT/
 *                    EXPORT/OTHER) — configuration, never UI labels
 *   taxIdentifiers[] the §9 generic identifier store (GSTIN/VAT/EIN/TIN… —
 *                    the database is never GSTIN-only)
 *   state            the client's state/region (a place-of-supply INPUT —
 *                    the determination itself is a separate rules layer, §15)
 */
export interface ClientTaxProfile {
  country?: string;
  registrationType?: string;
  registrationNumber?: string;
  placeOfSupply?: string;
  taxTreatment?: TaxTreatment;
  taxIdentifiers?: TaxIdentifier[];
  state?: string;
}

/**
 * Defaults INHERITED BY NEW PROJECTS (§12) — a default, never a constraint:
 * project currency/billing model may override the client default. These
 * values never retroactively modify existing projects.
 */
export interface ClientCommercialDefaults {
  billingModel?: BillingModel;
  paymentTerms?: PaymentTerms;
  customPaymentTermsDays?: number;
  currency?: string;
}

/**
 * The Module 2 agency client view (spec §16). `email` and `createdAt` remain
 * on the base contract for backward compatibility; everything else is
 * optional per §17.
 */
export interface AgencyClient {
  id: string;
  tenantId: string;

  name: string;
  /** Legal billing entity — "Acme Technologies Private Limited" vs name "Acme" (§7). */
  legalName?: string;
  website?: string;
  email?: string;
  phone?: string;
  industry?: string;
  notes?: string;

  primaryContact?: ClientPrimaryContact;
  billingProfile?: ClientBillingProfile;
  taxProfile?: ClientTaxProfile;
  commercialDefaults?: ClientCommercialDefaults;

  /** Resolves to ACTIVE on read when missing (§17/§106). */
  status: ClientStatus;

  createdAt: Date | string;
  updatedAt?: Date | string;
}

/** Name normalization for duplicate DETECTION (§18): warn, never auto-reject. */
export function normalizeClientName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}
