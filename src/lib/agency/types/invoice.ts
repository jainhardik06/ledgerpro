/**
 * Agency Vertical — Types: invoices (Module 9, spec §56–§76)
 *
 * CLIENT-SAFE: types and pure functions only. No server imports.
 *
 * The module's job (§56): convert approved billable work into money owed by
 * the client. Work + Expenses + Milestones + Fixed Fees → Invoice → Money
 * Owed. The invoice is an OPERATIONAL record; money actually moving is
 * Module 10 (Payments) writing core Transactions.
 *
 * The rules encoded here:
 *   §57  Invoice shape — every money field is a Money struct; currency is
 *        invoice-wide (lines are pre-validated to match).
 *   §58  Status is EXPLICIT, moved through controlled transitions — never
 *        silently derived from amountPaid.
 *   §59/§60 InvoiceLine is POLYMORPHIC: type + sourceId give financial
 *        traceability back to the TimeEntry / Expense / Milestone.
 *   §61  Many-to-one billing: 20 time entries → one invoice. The source's
 *        invoiceId and the line's sourceId support the relationship from
 *        opposite directions.
 *   §63–§66 Billing reservation: sources gain RESERVED (draft-add) before
 *        INVOICED (finalization) — two simultaneous drafts can never select
 *        the same item. Reservations carry owner + timestamp so a stale or
 *        abandoned draft can release them.
 *   §71  Fixed-fee invoices use FIXED_FEE / MANUAL lines — never fabricated
 *        time revenue. Time contributes cost/profitability, not invoice
 *        revenue, on a fixed-fee project.
 *   §74/§75 invoiceNumber is assigned centrally at FINALIZATION, never at
 *        draft, never client-side. Drafts show their internal id; no fake
 *        final numbers.
 *   §76  Tax is LINES (InvoiceTaxLine), not one opaque number — ready for
 *        CGST/SGST/IGST and future regimes.
 *   §79  DRAFT→SENT→PARTIALLY_PAID→PAID; VOID from DRAFT/SENT/OVERDUE, never
 *        from PAID (reversal/credit mechanisms come later).
 *   §80  OVERDUE is DERIVED for display (today > dueDate AND amountDue > 0
 *        AND status ∈ {SENT, PARTIALLY_PAID}); the stored state is never
 *        daily-mutated.
 *
 * Sprint 9A design decisions (resolved):
 *   - T&M line shape: ONE LINE PER TIME ENTRY (§59/§60 sourceId is 1:1; the
 *     §72 "Development — 42 hours ₹105,000" rollup is a PRESENTATION concern
 *     — the UI groups TIME lines). Per-item exactness makes §84 duplicate
 *     billing protection and §120 lineage exact.
 *   - Reservation fields live ON the source records (reservedBy,
 *     reservedAt, reservedInvoiceId) so §66's owner/timestamp is stored, not
 *     inferred from invoice_lines.
 *   - Percentage milestones freeze their invoiceable amount
 *     (percentage × project contractValue) into the line at add-time — the
 *     line's amount is history the moment it exists.
 */
import type { Money } from './money';

// ---------- status (§57/§58/§79) ----------

export type InvoiceStatus =
  | 'DRAFT'
  | 'SENT'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'OVERDUE'
  | 'VOID';

export const INVOICE_STATUSES: readonly InvoiceStatus[] = [
  'DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID',
] as const;

/**
 * §79 controlled transitions. PARTIALLY_PAID/PAID are entered by the payment
 * flow (Module 10 calls the invoice domain, never the reverse). OVERDUE is
 * ALSO derivable for display (§80) — a stored OVERDUE is a deliberate state
 * move, not a cron job. A PAID invoice never becomes VOID (reversal comes
 * later); a VOID invoice is terminal.
 *
 * Module 10 (§102/§103) — the REVERSAL edges: PAID→PARTIALLY_PAID,
 * PARTIALLY_PAID→SENT and PAID→SENT exist ONLY for payment reversal, which
 * recomputes the invoice's settled money (§104) and walks the status back.
 * voidInvoice is unaffected (it refuses any invoice with amountPaid > 0).
 */
export const INVOICE_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  DRAFT: ['SENT', 'VOID'],
  SENT: ['PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID'],
  PARTIALLY_PAID: ['PAID', 'OVERDUE', 'VOID', 'SENT'],
  PAID: ['PARTIALLY_PAID', 'SENT'],
  OVERDUE: ['PARTIALLY_PAID', 'PAID', 'VOID'],
  VOID: [],
};

export function canTransitionInvoiceStatus(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return INVOICE_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * §80 — the DISPLAY status: OVERDUE when today > dueDate, money is still
 * owed, and the invoice is out (SENT or PARTIALLY_PAID). Pure derivation —
 * the stored state is never mutated by the calendar.
 */
export function displayStatusFor(
  invoice: Pick<Invoice, 'status' | 'dueDate' | 'amountDue'>,
  today: string // YYYY-MM-DD
): InvoiceStatus {
  if (invoice.status === 'SENT' || invoice.status === 'PARTIALLY_PAID') {
    if (today > invoice.dueDate && invoice.amountDue.amount > 0) {
      return 'OVERDUE';
    }
  }
  return invoice.status;
}

// ---------- line types (§59) ----------

/**
 * §59/§60 — what a line bills:
 *   TIME        approved billable time (sourceId = TimeEntry id)
 *   EXPENSE     approved billable expense (sourceId = Expense id)
 *   MILESTONE   a completed billable milestone (sourceId = Milestone id)
 *   FIXED_FEE   a fixed-fee project's fee (§71 — never fabricated time)
 *   MANUAL      a free-form charge (ad-hoc line, no source)
 */
export type InvoiceLineType = 'TIME' | 'EXPENSE' | 'MILESTONE' | 'FIXED_FEE' | 'MANUAL';

export const INVOICE_LINE_TYPES: readonly InvoiceLineType[] = [
  'TIME', 'EXPENSE', 'MILESTONE', 'FIXED_FEE', 'MANUAL',
] as const;

/** Line types whose sourceId is REQUIRED (§60 — traceable sources). */
export const SOURCE_BACKED_LINE_TYPES: readonly InvoiceLineType[] = [
  'TIME', 'EXPENSE', 'MILESTONE',
] as const;

export function isSourceBackedLineType(type: InvoiceLineType): boolean {
  return SOURCE_BACKED_LINE_TYPES.includes(type);
}

// ---------- tax (§76, Module 11 §10/§11) ----------

/**
 * Module 11 §11 — the tax component a line represents. The closed GST
 * vocabulary (CGST/SGST/IGST/CESS) plus OTHER for every non-Indian regime —
 * the same invoice engine serves both (§5: India-ready, not India-only).
 */
export type InvoiceTaxLineType = 'CGST' | 'SGST' | 'IGST' | 'CESS' | 'OTHER';

export const INVOICE_TAX_LINE_TYPES: readonly InvoiceTaxLineType[] = [
  'CGST', 'SGST', 'IGST', 'CESS', 'OTHER',
] as const;

export function isInvoiceTaxLineType(type: unknown): type is InvoiceTaxLineType {
  return typeof type === 'string' && (INVOICE_TAX_LINE_TYPES as readonly string[]).includes(type);
}

/**
 * §76 — one tax line per tax. `rate` is a percentage (18 = 18%). The AMOUNT
 * is computed by the calculation engine (9B) — callers never set it by hand.
 * Module 11: `type` is OPTIONAL on the input (a plain {name, rate} line stays
 * valid — stored as OTHER); the rules layer (§15/§28) stamps it and the
 * §25 provenance into `metadata`.
 */
export interface InvoiceTaxLineInput {
  type?: InvoiceTaxLineType;
  name: string;
  code?: string;
  rate: number;
  metadata?: Record<string, unknown>;
}

/** §76/§11 — a computed tax line: the input plus its component type (always
 *  resolved on the stored line), taxable base, amount and provenance. */
export interface InvoiceTaxLine extends Omit<InvoiceTaxLineInput, 'type'> {
  type: InvoiceTaxLineType;
  taxableAmount: Money;
  amount: Money;
}

// ---------- Module 11: compliance metadata (§13–§17, §25–§27) ----------

/** §13/§14 — the service/goods classification on a line. Never defaulted. */
export type ServiceClassificationType = 'HSN' | 'SAC';

export const SERVICE_CLASSIFICATION_TYPES: readonly ServiceClassificationType[] = [
  'HSN', 'SAC',
] as const;

export function isServiceClassificationType(v: unknown): v is ServiceClassificationType {
  return typeof v === 'string' && (SERVICE_CLASSIFICATION_TYPES as readonly string[]).includes(v);
}

export interface LineClassification {
  type: ServiceClassificationType;
  code: string;
}

/** §15 — the place of supply USED for this invoice: stored configuration,
 *  never a determination. The determination itself is a separate versioned
 *  rules layer (§15) — Money OS records the result, it does not guess it. */
export interface PlaceOfSupply {
  country: string;
  stateOrRegion: string;
  code?: string;
}

/** §16 — reverse-charge flag, no intelligence. */
export interface ReverseCharge {
  applicable: boolean;
}

/** §17 — why the invoice carries no tax. Present ⇒ the engine produces
 *  tax = ₹0 as a legitimate result, never as a failed calculation. */
export interface InvoiceExemption {
  reason: string;
  reference?: string;
}

/** §26/§27 — e-invoice READINESS metadata. Phase 1 stores status and the
 *  IRP result slots; it never talks to the IRP. */
export type EInvoiceStatus =
  | 'NOT_APPLICABLE'
  | 'PENDING'
  | 'GENERATED'
  | 'CANCELLED'
  | 'ERROR';

export const E_INVOICE_STATUSES: readonly EInvoiceStatus[] = [
  'NOT_APPLICABLE', 'PENDING', 'GENERATED', 'CANCELLED', 'ERROR',
] as const;

export interface EInvoiceMetadata {
  status: EInvoiceStatus;
  irn?: string;
  acknowledgementNumber?: string;
  acknowledgementDate?: Date;
  qrPayload?: string;
  provider?: string;
  providerReference?: string;
}

/**
 * §25 — the compliance snapshot, written ONCE at finalization. Historical
 * invoices must not change when the agency or client later edits its tax
 * information: everything a jurisdiction-correct invoice asserts about its
 * parties, taxes, classifications, rules and numbering is frozen here.
 */
export interface InvoiceComplianceSnapshot {
  capturedAt: Date;
  /** The agency's billing profile as it stood at finalization. */
  supplier?: import('./tax').AgencyBillingProfile;
  /** The client's tax posture as it stood at finalization. §25 freezes the
   *  recipient BILLING profile too — the CBIC invoice rules require the
   *  recipient's address on the tax invoice, and history must survive the
   *  client later editing its billing details. */
  recipient?: {
    name: string;
    country?: string;
    state?: string;
    address?: string;
    city?: string;
    postalCode?: string;
    taxTreatment?: import('./tax').TaxTreatment;
    taxIdentifiers?: import('./tax').TaxIdentifier[];
  };
  placeOfSupply?: PlaceOfSupply;
  reverseCharge?: ReverseCharge;
  exemption?: InvoiceExemption;
  taxLines: InvoiceTaxLine[];
  classifications: Array<{ lineId: string; classification?: LineClassification }>;
  /** The rules-layer versions the tax lines were produced under (§25). */
  taxRulesUsed: string[];
  numbering: { invoiceNumber: string; fiscalYear: string };
}

// ---------- entities (§57/§59) ----------

export interface Invoice {
  id: string;
  tenantId: string;
  clientId: string;
  projectId?: string;
  /** §74/§75 — assigned centrally at FINALIZATION (INV-000001…). Absent on
   *  drafts; null only mid-revert (§83 compensation — the DAL folds it back
   *  to undefined on read). */
  invoiceNumber?: string | null;
  issueDate: string; // YYYY-MM-DD
  dueDate: string;   // YYYY-MM-DD
  currency: string;  // ISO 4217, 3 letters — invoice-wide
  subtotal: Money;
  discount: Money;
  /** §76 — the computed tax LINES (displayed exactly as totaled). */
  taxLines: InvoiceTaxLine[];
  taxTotal: Money;
  total: Money;
  amountPaid: Money;
  amountDue: Money;
  status: InvoiceStatus;
  /** Module 11 §15 — the place of supply used for this invoice (stored
   *  configuration; the determination is a separate rules layer). */
  placeOfSupply?: PlaceOfSupply;
  /** Module 11 §16 — reverse-charge flag, no intelligence. */
  reverseCharge?: ReverseCharge;
  /** Module 11 §17 — present ⇒ tax ₹0 is a legitimate engine result. */
  exemption?: InvoiceExemption;
  /** Module 11 §23 — the FY the invoice was numbered in (stamped at
   *  finalization; the numbering uniqueness scope). */
  fiscalYear?: string;
  /** Module 11 §26/§27 — e-invoice readiness. NEVER an IRP call. */
  eInvoice?: EInvoiceMetadata;
  /** Module 11 §25 — written ONCE at finalization; never updated after. */
  complianceSnapshot?: InvoiceComplianceSnapshot;
  /** §81/§82 sendInvoice — stamped when the invoice was (last) recorded as
   * sent to the client. Absent until the first send; finalize issues the
   * invoice (SENT, §79) and send records the delivery act. */
  sentAt?: Date | null;
  notes?: string;
  terms?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface InvoiceLine {
  id: string;
  tenantId: string;
  invoiceId: string;
  type: InvoiceLineType;
  description: string;
  /** Present for TIME/T&M display ("42 hours × ₹2,500") and quantity-priced MANUAL lines. */
  quantity?: number;
  unitPrice?: Money;
  /** The line's money value — always the CLIENT-facing amount, never internal cost. */
  amount: Money;
  /** §60 — the billed source's id (TimeEntry/Expense/Milestone). Required for source-backed types. */
  sourceId?: string;
  /** Module 11 §13/§14 — the HSN/SAC classification. Optional and NEVER
   *  defaulted — the classification depends on the actual service supplied. */
  classification?: LineClassification;
  /** Module 11 §14 — free-form tax category label (e.g. a GST rate slab). */
  taxCategory?: string;
  taxRate?: number;
  taxAmount?: Money;
  /** §72 grouping, source snapshots and other trace metadata. Never load-bearing money. */
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// ---------- reservation (§63–§66) ----------

/**
 * §64 — the billing lifecycle of a billable source (time entry, expense,
 * milestone). RESERVED means "selected by a draft invoice": still not billed,
 * but locked against a second draft. Module 9 widens the Module 7/8 unions.
 */
export type BillingReservationStatus = 'UNBILLED' | 'RESERVED' | 'INVOICED';

export const BILLING_RESERVATION_STATUSES: readonly BillingReservationStatus[] = [
  'UNBILLED', 'RESERVED', 'INVOICED',
] as const;

/**
 * §66 — the reservation trail stamped on a RESERVED source. Cleared (null)
 * on release back to UNBILLED; superseded by invoiceId at INVOICED.
 */
export interface ReservationStamp {
  /** The user whose draft holds the item. */
  reservedBy: string;
  reservedAt: Date;
  /** The draft invoice holding the item — the §61 opposite direction while RESERVED. */
  reservedInvoiceId: string;
}

/** §66 — how long an untouched draft may hold items before a release pass may free them. Phase 1 constant. */
export const RESERVATION_STALE_DAYS = 7;

// ---------- numbering (§74) ----------

export const INVOICE_NUMBER_PREFIX = 'INV-';
export const INVOICE_NUMBER_PAD = 6;

/** §74/§23 — the official number format: INV-000001, INV-000002, … The
 *  prefix is the tenant's configured billing-profile invoicePrefix (§7),
 *  defaulting to INV- when unset. */
export function formatInvoiceNumber(sequence: number, prefix: string = INVOICE_NUMBER_PREFIX): string {
  return `${prefix}${String(sequence).padStart(INVOICE_NUMBER_PAD, '0')}`;
}

/** §75 — what a draft displays instead of a fake final number or raw database IDs. */
export function draftLabel(_invoiceId?: string): string {
  return 'Draft Invoice';
}

// ---------- update shape ----------

/**
 * The repo write shape. The domain owns status/invoiceNumber/money fields —
 * they are written by the calculation engine and the lifecycle actions,
 * never by a PATCH payload. amountPaid is Module 10's (payment flow only).
 */
export type InvoiceUpdate = Partial<Omit<
  Invoice,
  'id' | 'tenantId' | 'clientId' | 'createdBy' | 'createdAt' | 'updatedAt'
  | 'invoiceNumber' | 'status' | 'subtotal' | 'discount' | 'taxTotal'
  | 'total' | 'amountPaid' | 'amountDue'
  | 'notes' | 'terms'
  | 'placeOfSupply' | 'reverseCharge' | 'exemption'
  | 'fiscalYear' | 'eInvoice' | 'complianceSnapshot'
>> & {
  /** Null clears/reverts (§83 compensation — the DAL folds to undefined on read). */
  invoiceNumber?: string | null;
  status?: InvoiceStatus;
  subtotal?: Money;
  discount?: Money;
  taxLines?: InvoiceTaxLine[];
  taxTotal?: Money;
  total?: Money;
  amountPaid?: Money;
  amountDue?: Money;
  /** Null clears (Mongo $set null → mapper folds to undefined on read). */
  notes?: string | null;
  terms?: string | null;
  /** Module 11 §15–§17 — set at taxation time; null clears. */
  placeOfSupply?: PlaceOfSupply | null;
  reverseCharge?: ReverseCharge | null;
  exemption?: InvoiceExemption | null;
  /** Module 11 §23/§25/§26 — finalize-owned; null only mid-compensation
   *  (the DAL folds back to undefined on read). */
  fiscalYear?: string | null;
  eInvoice?: EInvoiceMetadata | null;
  complianceSnapshot?: InvoiceComplianceSnapshot | null;
  /** Send-only (§82) — a Date stamps the delivery; never cleared. */
  sentAt?: Date;
};

/** What a PATCH may legally carry while DRAFT (the only editable state, §63). */
export interface InvoiceUpdatePayload {
  dueDate?: string;
  notes?: string | null;
  terms?: string | null;
}
