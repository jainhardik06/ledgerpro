/**
 * Agency Vertical — Types: tax & compliance contracts (Module 11, §6–§9)
 *
 * CLIENT-SAFE: types and pure functions only — no imports of lib/db, mongodb,
 * or any server-only module. React components import from here.
 *
 * MODULE 11 CORE PRINCIPLE (spec §5): "India-ready, not India-only."
 * There is NO IndianInvoice type. The Invoice gains tax profiles, tax lines
 * and compliance metadata as OPTIONAL fields; INR + Indian GST, USD + foreign
 * client and EUR + foreign client all use the same invoice engine.
 *
 * The exact tax semantics are CONFIGURATION (TaxProfile.taxTreatment,
 * WithholdingRule — later sprint), never embedded in UI labels or hard-coded
 * section numbers (§19: no legacy 194C/194J/194H assumptions; the Income Tax
 * Act, 2025 framework applies to transactions on or after 2026-04-01).
 */

/**
 * §9 — the generic tax-identifier strategy. GSTIN is NEVER the only tax
 * identifier in the database: this shape permits GSTIN, VAT, EIN, TIN and
 * anything else without another migration for international expansion.
 */
export interface TaxIdentifier {
  /** Identifier kind — free string: 'GSTIN' | 'PAN' | 'VAT' | 'EIN' | 'TIN' | … */
  type: string;
  value: string;
  country?: string;
}

/**
 * §6 — the tax-treatment vocabulary. Configurable semantics, not UI labels:
 * the same invoice engine serves a registered domestic client (CGST+SGST /
 * IGST), an exempt client (tax ₹0), an export client (zero-rated) and any
 * other jurisdiction's arrangement.
 */
export type TaxTreatment = 'REGISTERED' | 'UNREGISTERED' | 'EXEMPT' | 'EXPORT' | 'OTHER';

export const TAX_TREATMENTS: readonly TaxTreatment[] = [
  'REGISTERED', 'UNREGISTERED', 'EXEMPT', 'EXPORT', 'OTHER',
] as const;

export function isTaxTreatment(value: unknown): value is TaxTreatment {
  return typeof value === 'string' && (TAX_TREATMENTS as readonly string[]).includes(value);
}

/**
 * §7 — the AGENCY's own billing identity: who is issuing the invoice. Lives
 * one-per-tenant (nullable expansion on Tenant — an agency without a billing
 * profile is valid; invoices simply carry no supplier tax details until it
 * is configured). Not every field is mandatory for every jurisdiction.
 */
export interface AgencyBillingProfile {
  /** The legal entity that appears on invoices as the supplier. */
  legalName: string;
  displayName?: string;
  address?: string;
  country?: string;
  state?: string;
  postalCode?: string;
  taxRegistrationType?: string;
  taxRegistrationNumber?: string;
  /**
   * §9 — the CANONICAL identifier store (GSTIN/PAN/VAT/EIN/TIN…). The spec's
   * §7 sketch lists GSTIN and PAN as illustrative fields; they live HERE as
   * { type: 'GSTIN', value } / { type: 'PAN', value } entries instead, so the
   * database is never GSTIN-shaped.
   */
  taxIdentifiers?: TaxIdentifier[];
  defaultCurrency?: string;
  /** §23 — the invoice-number prefix for this agency ('INV' by default). */
  invoicePrefix?: string;
  updatedAt?: Date | string;
}

/**
 * §6 — a tenant-level, NAMED tax configuration (e.g. "GST Registered —
 * Maharashtra", "GST Exempt", "Export — Zero Rated"). Invoices reference the
 * treatment that applied; the profile is the configurable source of truth.
 */
export interface TaxProfile {
  id: string;
  tenantId: string;
  name: string;
  country: string;
  registrationType?: string;
  registrationNumber?: string;
  taxTreatment: TaxTreatment;
  stateOrRegion?: string;
  active: boolean;
  createdAt: Date | string;
  updatedAt?: Date | string;
}

// ---------- §30 — GSTIN / PAN SHAPE validation ----------
//
// SHAPE ONLY: the format a well-formed identifier must have. This is NEVER a
// registry/government lookup and never a checksum-based authenticity claim —
// Money OS does not verify the identifier exists, only that it is not
// malformed before it is stored on a financial document.

/**
 * GSTIN shape: 15 characters — 2-digit state code + 10-char PAN + 1-char
 * entity code + literal 'Z' + 1-char checksum position.
 */
export const GSTIN_SHAPE_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;

/** PAN shape: 10 characters — 5 letters + 4 digits + 1 letter. */
export const PAN_SHAPE_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** §30 — GSTIN shape check (format only; tolerant of case/whitespace input). */
export function isValidGstinShape(value: string): boolean {
  return GSTIN_SHAPE_REGEX.test(value.trim().toUpperCase());
}

/** PAN shape check (format only; tolerant of case/whitespace input). */
export function isValidPanShape(value: string): boolean {
  return PAN_SHAPE_REGEX.test(value.trim().toUpperCase());
}
