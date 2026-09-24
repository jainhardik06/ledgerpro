/**
 * Agency Vertical — Domain: invoices service (Module 9, spec §56–§86)
 *
 * The ONLY writer path for invoices. React components never touch MongoDB —
 * they go API route → this service → db.ts.
 *
 * Responsibilities:
 *   - §56/§57 convert approved billable work into money owed: the INVOICE is
 *     the operational record; money moving is Module 10 (Payments).
 *   - §63/§65/§66 BILLING RESERVATION: adding a source-backed line to a
 *     draft RESERVES the source (billingStatus RESERVED + reservedBy/
 *     reservedAt/reservedInvoiceId §66) so two drafts can never select the
 *     same item. Removing the line (or voiding the draft — 9E) releases it
 *     back to UNBILLED. A stale-draft timeout pass may do the same later
 *     (RESERVATION_STALE_DAYS; Phase 1 stores the trail, no cron).
 *   - §59/§60/§61 line polymorphism: TIME/EXPENSE/MILESTONE lines carry
 *     sourceId; MANUAL/FIXED_FEE lines carry a free-form amount (§71 —
 *     fixed fee NEVER fabricates time revenue). One line per source makes
 *     the §84 duplicate-billing protection and §120 lineage exact; the §72
 *     "42 hours" rollup is presentation (the UI groups TIME lines).
 *   - §70 eligibility at line-add: TIME = APPROVED + billable + UNBILLED +
 *     READY; EXPENSE = §48 triple; MILESTONE = COMPLETED + UNBILLED +
 *     a commercial definition. A source already RESERVED (another draft) or
 *     INVOICED is a 409 — never silently skipped (§84).
 *   - §73 percentage milestones freeze percentage × project contractValue
 *     into the line amount at add-time.
 *   - §74 numbering: allocateInvoiceNumber is the central authority — the
 *     counter is atomically incremented per tenant; drafts carry NO number.
 *     Finalization (9E) calls it; nothing else ever does.
 *   - §77/§78 money: every stored total comes from the calculation engine
 *     (invoice-calculation.ts) — this service never re-derives a formula.
 *   - §80 OVERDUE is derived for display (displayStatusFor); the stored
 *     status only moves through controlled transitions (§79) — finalize/
 *     send/void land in 9E, payments (Module 10) drive PARTIALLY_PAID/PAID.
 *   - Integrity (§113): client/project/source references must belong to the
 *     tenant — cross-tenant is indistinguishable from missing (identical
 *     404s). Sources must belong to the invoice's project (project-scoped
 *     draft) or its client (client-scoped draft).
 *   - Audit: INVOICE_CREATED / UPDATED / LINE_ADDED / LINE_REMOVED /
 *     TAXATION_SET / ITEM_RESERVED / RESERVATION_RELEASED (finalization,
 *     send and void events arrive with 9E).
 */
import {
  getClientById, getProjectById, getTenantById,
  getTimeEntryById, updateTimeEntry as updateTimeEntryRepo,
  getExpenseById, updateExpense as updateExpenseRepo,
  getProjectMilestoneById, updateProjectMilestone as updateProjectMilestoneRepo,
  getInvoices, getInvoiceById, createInvoice as createInvoiceRepo,
  updateInvoice as updateInvoiceRepo,
  getInvoiceLines, createInvoiceLine, deleteInvoiceLine,
  allocateInvoiceNumberForFiscalYear, seedInvoiceSequenceFromLegacy,
  type InvoiceFilters,
} from '@/lib/db';
import type {
  Invoice, InvoiceLine, InvoiceLineType, InvoiceTaxLine, InvoiceTaxLineInput,
  InvoiceComplianceSnapshot, EInvoiceMetadata,
} from '../types/invoice';
import {
  formatInvoiceNumber, isSourceBackedLineType, canTransitionInvoiceStatus,
  INVOICE_NUMBER_PREFIX,
} from '../types/invoice';
import type { AgencyBillingProfile } from '../types/tax';
import { fiscalYear } from '../types/dates';
import type { Expense } from '../types/expense';
import { isExpenseInvoiceEligible } from '../types/expense';
import type { TimeEntry } from '../types/time';
import { isInvoiceEligible } from '../types/time';
import type { ProjectMilestone } from '../types/project';
import { milestoneHasSingleCommercialDefinition } from '../types/project';
import { makeMoney, zeroMoney, multiplyMoney } from '../types/money';
import { todayInTimezone, dueDateFromTerms } from '../types/dates';
import { agencyFiscalYearStartMonth, agencyTimezone } from './agency.settings';
import {
  validateInvoiceDraftCreate, validateInvoiceLineAdd, validateInvoiceUpdate,
} from '../validators/invoice';
import {
  validateTaxLineInputs, validatePlaceOfSupply, validateReverseCharge, validateExemption,
} from '../validators/tax';
import {
  recalculateInvoice, calculateLineAmount, calculateTaxableAmount,
} from './invoice-calculation';
import { type AuditContext, type DomainResult } from './agency.clients';

const notFound = (what: string): DomainResult<never> =>
  ({ ok: false, status: 404, error: `${what} not found` });

const badRequest = (error: string, code?: string): DomainResult<never> =>
  ({ ok: false, status: 400, error, ...(code && { code }) });

const conflict = (error: string, code?: string): DomainResult<never> =>
  ({ ok: false, status: 409, error, ...(code && { code }) });

/** The three source-backed line types (§60) — the billed-source union. */
type SourceLineType = 'TIME' | 'EXPENSE' | 'MILESTONE';

/**
 * Narrow a line type to the source-backed union. Every call site is guarded
 * by isSourceBackedLineType (or constructs the literal directly); the cast
 * only convinces the compiler of what the guard already proved.
 */
function asSourceLineType(type: InvoiceLineType): SourceLineType {
  return type as SourceLineType;
}

// ---------- §74/§23 numbering ----------

/**
 * §74/§23 — the central numbering authority, FY-scoped (CBIC: numbers are
 * unique within the financial year). Seeds once from the legacy tenant-wide
 * counter so no number is ever re-issued, then atomically increments the
 * {tenantId, fiscalYear} sequence → INV-000001…. Called ONLY by finalization
 * (9E); a draft never carries a number and nothing client-side ever
 * generates one. §7/§23 — the prefix is the tenant's configured
 * billing-profile invoicePrefix (validated ^[A-Za-z0-9-]+$), default INV-.
 */
export async function allocateInvoiceNumber(
  tenantId: string,
  fy: string,
  prefix: string = INVOICE_NUMBER_PREFIX
): Promise<string> {
  await seedInvoiceSequenceFromLegacy(tenantId, fy, prefix);
  return formatInvoiceNumber(await allocateInvoiceNumberForFiscalYear(tenantId, fy, prefix), prefix);
}

/**
 * §11 — stored tax lines → engine inputs, preserving the component type and
 * the rules-layer provenance (metadata) through every recalculation.
 */
function taxLinesToInputs(taxLines: InvoiceTaxLine[]): InvoiceTaxLineInput[] {
  return taxLines.map(({ type, name, code, rate, metadata }) => ({
    type,
    name,
    ...(code !== undefined && { code }),
    rate,
    ...(metadata !== undefined && { metadata }),
  }));
}

// ---------- §63/§66 reservation (the §65 duplicate-draft guard) ----------

/** Stamp a source RESERVED for this draft (§63) — the single reservation writer. */
async function reserveSource(
  type: SourceLineType,
  source: TimeEntry | Expense | ProjectMilestone,
  invoiceId: string,
  actorUserId: string
): Promise<boolean> {
  const stamp = {
    billingStatus: 'RESERVED' as const,
    reservedBy: actorUserId,
    reservedAt: new Date(),
    reservedInvoiceId: invoiceId,
  };
  if (type === 'TIME') {
    return updateTimeEntryRepo((source as TimeEntry).id!, (source as TimeEntry).tenantId, stamp);
  }
  if (type === 'EXPENSE') {
    return updateExpenseRepo((source as Expense).id!, (source as Expense).tenantId, stamp);
  }
  const milestone = source as ProjectMilestone;
  return updateProjectMilestoneRepo(milestone.id!, milestone.projectId, milestone.tenantId, stamp);
}

/**
 * Release a source back to UNBILLED (§66). Guarded: only the draft that
 * holds the reservation may release it — a second draft touching someone
 * else's reservation is a no-op false, never a theft.
 */
async function releaseSource(
  type: SourceLineType,
  source: TimeEntry | Expense | ProjectMilestone,
  invoiceId: string
): Promise<boolean> {
  const holder = (source as TimeEntry).reservedInvoiceId;
  if (holder !== invoiceId) return false;
  const clear = {
    billingStatus: 'UNBILLED' as const,
    reservedBy: null,
    reservedAt: null,
    reservedInvoiceId: null,
  };
  if (type === 'TIME') {
    return updateTimeEntryRepo((source as TimeEntry).id!, (source as TimeEntry).tenantId, clear);
  }
  if (type === 'EXPENSE') {
    return updateExpenseRepo((source as Expense).id!, (source as Expense).tenantId, clear);
  }
  const milestone = source as ProjectMilestone;
  return updateProjectMilestoneRepo(milestone.id!, milestone.projectId, milestone.tenantId, clear);
}

/**
 * §82 reserveBillableItems — batch reserve for a list of already-verified
 * sources (the draft-creation convenience path). All-or-nothing: every
 * source is re-verified eligible immediately before its write; a failure
 * rolls the already-written ones back (compensating release — the local
 * JSON store has no sessions; the sequence is documented §83).
 */
export async function reserveBillableItems(
  tenantId: string,
  invoiceId: string,
  actorUserId: string,
  refs: Array<{ type: SourceLineType; sourceId: string }>,
  audit: AuditContext
): Promise<DomainResult<{ reserved: number }>> {
  const reserved: Array<{ type: SourceLineType; sourceId: string }> = [];
  for (const ref of refs) {
    const source = await loadSource(ref.type, ref.sourceId, tenantId);
    if (!source.ok) {
      // Roll back what we took (§83 compensating pattern).
      for (const done of reserved) {
        const s = await loadSource(done.type, done.sourceId, tenantId);
        if (s.ok) await releaseSource(done.type, s.source, invoiceId);
      }
      return { ok: false, status: source.status, error: source.error };
    }
    const eligibility = checkSourceEligibility(ref.type, source.source);
    if (!eligibility.ok) {
      for (const done of reserved) {
        const s = await loadSource(done.type, done.sourceId, tenantId);
        if (s.ok) await releaseSource(done.type, s.source, invoiceId);
      }
      return { ok: false, status: eligibility.status, error: eligibility.error };
    }
    const ok = await reserveSource(ref.type, source.source, invoiceId, actorUserId);
    if (!ok) return notFound('Source');
    reserved.push(ref);
    await audit.log('ITEM_RESERVED', `${ref.type} ${ref.sourceId} reserved by draft ${invoiceId}`);
  }
  return { ok: true, status: 200, data: { reserved: reserved.length } };
}

/**
 * §82 releaseBillableItems — release every source-backed line of an invoice
 * (draft void/delete path, 9E). Idempotent per source; sources already
 * INVOICED are skipped (finalization superseded the reservation).
 */
export async function releaseBillableItems(
  tenantId: string,
  invoiceId: string,
  audit: AuditContext
): Promise<DomainResult<{ released: number }>> {
  const lines = await getInvoiceLines(invoiceId, tenantId);
  let released = 0;
  for (const line of lines) {
    if (!isSourceBackedLineType(line.type) || !line.sourceId) continue;
    const source = await loadSource(asSourceLineType(line.type), line.sourceId, tenantId);
    if (!source.ok) continue; // already gone — nothing to release
    const ok = await releaseSource(asSourceLineType(line.type), source.source, invoiceId);
    if (ok) {
      released += 1;
      await audit.log('RESERVATION_RELEASED', `${line.type} ${line.sourceId} released from draft ${invoiceId}`);
    }
  }
  return { ok: true, status: 200, data: { released } };
}

// ---------- §70 source loading + eligibility ----------

type SourceResult =
  | { ok: true; source: TimeEntry | Expense | ProjectMilestone }
  | { ok: false; status: number; error: string };

/** §113 — load a billed source; cross-tenant and missing are identical 404s. */
async function loadSource(
  type: SourceLineType,
  sourceId: string,
  tenantId: string
): Promise<SourceResult> {
  if (type === 'TIME') {
    const entry = await getTimeEntryById(sourceId, tenantId);
    return entry ? { ok: true, source: entry } : { ok: false, status: 404, error: 'Time entry not found' };
  }
  if (type === 'EXPENSE') {
    const expense = await getExpenseById(sourceId, tenantId);
    return expense ? { ok: true, source: expense } : { ok: false, status: 404, error: 'Expense not found' };
  }
  const milestone = await getProjectMilestoneById(sourceId, tenantId);
  return milestone ? { ok: true, source: milestone } : { ok: false, status: 404, error: 'Milestone not found' };
}

/**
 * §70 eligibility, per type. RESERVED/INVOICED sources are a 409 (§84 —
 * explicit conflict, never a silent skip).
 */
function checkSourceEligibility(
  type: SourceLineType,
  source: TimeEntry | Expense | ProjectMilestone
): DomainResult<true> {
  const id = (source as TimeEntry).id;
  const billingStatus = (source as TimeEntry).billingStatus ?? 'UNBILLED';
  if (billingStatus === 'INVOICED') {
    return conflict(`${type} ${id} is already invoiced and cannot be included`, 'SOURCE_ALREADY_INVOICED');
  }
  if (billingStatus === 'RESERVED') {
    return conflict(`${type} ${id} is already selected by another draft invoice`, 'SOURCE_ALREADY_RESERVED');
  }
  if (type === 'TIME') {
    const entry = source as TimeEntry;
    if (!isInvoiceEligible(entry)) {
      return conflict(`Time entry ${id} is not billable (needs APPROVED + billable + rate-ready + UNBILLED)`);
    }
    return { ok: true, status: 200, data: true };
  }
  if (type === 'EXPENSE') {
    const expense = source as Expense;
    if (!isExpenseInvoiceEligible(expense)) {
      return conflict(`Expense ${id} is not invoice-eligible (needs APPROVED + billable + UNBILLED)`);
    }
    return { ok: true, status: 200, data: true };
  }
  const milestone = source as ProjectMilestone;
  if (milestone.status !== 'COMPLETED') {
    return conflict(`Milestone ${id} is not COMPLETED and cannot be billed`);
  }
  if (!milestoneHasSingleCommercialDefinition(milestone)) {
    return conflict(`Milestone ${id} has no commercial definition (amount or percentage)`);
  }
  return { ok: true, status: 200, data: true };
}

// ---------- draft money (§77/§78 — engine only) ----------

/**
 * Recompute and persist the draft's money from its lines + discount + tax
 * lines through the calculation engine. DRAFT-only by construction (the
 * callers gate it); amountPaid stays 0 until Module 10.
 */
async function recalculateDraftMoney(tenantId: string, invoiceId: string): Promise<Invoice | null> {
  const [invoice, lines] = await Promise.all([
    getInvoiceById(invoiceId, tenantId),
    getInvoiceLines(invoiceId, tenantId),
  ]);
  if (!invoice) return null;
  const calc = recalculateInvoice({
    lines,
    discountAmount: invoice.discount.amount,
    taxes: taxLinesToInputs(invoice.taxLines),
    amountPaid: invoice.amountPaid,
  });
  await updateInvoiceRepo(invoiceId, tenantId, {
    subtotal: calc.subtotal,
    discount: calc.discount,
    taxLines: calc.taxLines,
    taxTotal: calc.taxTotal,
    total: calc.total,
    amountDue: calc.amountDue,
  });
  return getInvoiceById(invoiceId, tenantId);
}

// ---------- §67/§82 services ----------

/**
 * §67/§68 — the ONE draft-creation service every path (project billing tab,
 * invoice center, command palette) calls. Currency defaults from the
 * client's billing profile; dueDate defaults from the client's payment
 * terms (§68 step 5) when not supplied.
 */
export async function createInvoiceDraft(
  tenantId: string,
  actor: { userId: string; role: string },
  payload: unknown,
  audit: AuditContext
): Promise<DomainResult<Invoice>> {
  // Module 17 §44 — "today" for the invoice engine anchors to the AGENCY's
  // timezone (settings general.timezone), not the server clock's locale.
  // agencyTimezone(undefined) falls back to the default, so unconfigured
  // tenants keep the pre-Module-17 behavior.
  const tenant = await getTenantById(tenantId);
  const today = todayInTimezone(agencyTimezone(tenant));
  const validated = validateInvoiceDraftCreate(payload as Record<string, unknown>, today);
  if (!validated.ok) {
    return badRequest(validated.errors.map(e => `${e.field}: ${e.message}`).join('; '));
  }
  const v = validated.value;

  // §113 integrity — client, then project (must belong to the same client).
  const client = await getClientById(v.clientId, tenantId);
  if (!client) return notFound('Client');
  if (v.projectId !== undefined) {
    const project = await getProjectById(v.projectId, tenantId);
    if (!project) return notFound('Project');
    if (project.clientId !== v.clientId) {
      return badRequest('The project does not belong to this client');
    }
  }

  // Module 17 §44 — the currency fallback ladder is
  //   explicit payload > client billingProfile.currency > AGENCY default
  //   (settings general.defaultCurrency) > INR.
  // The validator's 'INR' sentinel stands for "omitted"; the agency default
  // IS INR for unconfigured tenants, so behavior is unchanged by default.
  const currency = v.currency !== 'INR'
    ? v.currency
    : client.billingProfile?.currency
      ?? tenant?.agencySettings?.general?.defaultCurrency
      ?? v.currency;
  // §68 step 5 (Module 17 §14): the due-date fallback ladder is
  //   explicit payload > client commercial terms > AGENCY default terms
  //   (settings billing.paymentTermsDays) > the issue date itself.
  const defaultTermsDays = tenant?.agencySettings?.billing?.paymentTermsDays ?? 30;
  const clientTerms = client.commercialDefaults?.paymentTerms;
  const clientCustomDays = (client.commercialDefaults as unknown as { customPaymentTermsDays?: number })?.customPaymentTermsDays;
  const dueDate = v.dueDate
    ?? (clientTerms
      ? dueDateFromTerms(v.issueDate, clientTerms, clientCustomDays ?? defaultTermsDays)
      : defaultTermsDays !== undefined
        ? dueDateFromTerms(v.issueDate, 'CUSTOM', defaultTermsDays)
        : v.issueDate);
  if (dueDate < v.issueDate) {
    return badRequest('Due date cannot be before the issue date');
  }

  const zero = zeroMoney(currency as 'INR');
  const created = await createInvoiceRepo(tenantId, {
    clientId: v.clientId,
    ...(v.projectId !== undefined && { projectId: v.projectId }),
    issueDate: v.issueDate,
    dueDate,
    currency,
    subtotal: zero,
    discount: zero,
    taxLines: [],
    taxTotal: zero,
    total: zero,
    amountDue: zero,
    ...(v.notes !== undefined && { notes: v.notes }),
    ...(v.terms !== undefined && { terms: v.terms }),
    createdBy: actor.userId,
  });

  await audit.log('INVOICE_CREATED', `Draft invoice ${created.id} created for client ${client.name}${v.projectId ? ` (project ${v.projectId})` : ''} — no number until finalization (§74)`);
  return { ok: true, status: 201, data: created };
}

/**
 * §59/§60/§82 — add one line to a DRAFT. Source-backed types are loaded,
 * eligibility-checked (§70), currency-verified, valued from the source's
 * frozen money, then RESERVED (§63). MANUAL/FIXED_FEE lines carry the
 * payload amount (§71). Money is recomputed through the engine.
 */
export async function addInvoiceLine(
  invoiceId: string,
  tenantId: string,
  actor: { userId: string; role: string },
  payload: unknown,
  audit: AuditContext
): Promise<DomainResult<{ line: InvoiceLine; invoice: Invoice }>> {
  const invoice = await getInvoiceById(invoiceId, tenantId);
  if (!invoice) return notFound('Invoice');
  if (invoice.status !== 'DRAFT') {
    return conflict(`Only a draft invoice can be edited (current state: ${invoice.status})`);
  }

  const validated = validateInvoiceLineAdd(payload as Record<string, unknown>);
  if (!validated.ok) {
    return badRequest(validated.errors.map(e => `${e.field}: ${e.message}`).join('; '));
  }
  const v = validated.value;

  let amount: InvoiceLine['amount'];
  let sourceId: string | undefined;
  let metadata: Record<string, unknown> | undefined;

  if (isSourceBackedLineType(v.type)) {
    if (!v.sourceId) return badRequest('sourceId is required for source-backed lines');
    const sourceRef = v.sourceId;
    sourceId = sourceRef;

    const loaded = await loadSource(asSourceLineType(v.type), sourceRef, tenantId);
    if (!loaded.ok) return notFound(loaded.error.replace(' not found', ''));
    const eligibility = checkSourceEligibility(asSourceLineType(v.type), loaded.source);
    if (!eligibility.ok) {
      return { ok: false, status: eligibility.status, error: eligibility.error, ...(eligibility.code && { code: eligibility.code }) };
    }

    // Source must belong to this invoice's project (project-scoped) or
    // client (client-scoped) — a line from another engagement is a 400.
    const belongs = await sourceBelongsToInvoice(asSourceLineType(v.type), loaded.source, invoice);
    if (!belongs.ok) {
      return badRequest(belongs.error!);
    }

    if (v.type === 'TIME') {
      const entry = loaded.source as TimeEntry;
      if (!entry.calculatedBillableAmount) {
        return conflict(`Time entry ${entry.id} has no billable amount (rate configuration required §24)`);
      }
      amount = entry.calculatedBillableAmount;
      metadata = { date: entry.date, durationMinutes: entry.durationMinutes, userId: entry.userId };
    } else if (v.type === 'EXPENSE') {
      const expense = loaded.source as Expense;
      if (!expense.clientChargeAmount) {
        return conflict(`Expense ${expense.id} has no client charge`);
      }
      amount = expense.clientChargeAmount;
      metadata = { vendorName: expense.vendorName, expenseDate: expense.expenseDate };
    } else {
      const milestone = loaded.source as ProjectMilestone;
      const project = await getProjectById(milestone.projectId, tenantId);
      if (!project) return notFound('Project');
      if (milestone.amount !== undefined) {
        amount = makeMoney(milestone.amount, invoice.currency as 'INR');
      } else {
        // §73 — percentage milestone: freeze percentage × contractValue.
        const percentage = milestone.percentage!;
        if (project.contractValue === undefined) {
          return badRequest(`Milestone ${milestone.id} is percentage-based but the project has no contract value to bill against`);
        }
        amount = multiplyMoney(makeMoney(project.contractValue, invoice.currency as 'INR'), percentage / 100);
      }
      metadata = { projectId: milestone.projectId, sequence: milestone.sequence };
    }

    if (amount.currency !== invoice.currency) {
      return badRequest(`The ${v.type.toLowerCase()} is denominated in ${amount.currency} but the invoice is ${invoice.currency} — money is never converted (§127)`);
    }
  } else {
    // §71 — MANUAL / FIXED_FEE: free-form value, no source. When quantity +
    // unitPrice price the line (§59/§72), the payload amount is a placeholder
    // the engine replaces.
    const priced = v.quantity !== undefined && v.unitPrice !== undefined;
    if (v.amount === undefined && !priced) {
      return badRequest(`A ${v.type} line requires an amount`);
    }
    const currency = (v.currency ?? invoice.currency).toUpperCase();
    if (currency !== invoice.currency) {
      return badRequest(`The line is denominated in ${currency} but the invoice is ${invoice.currency}`);
    }
    if (v.quantity !== undefined && v.unitPrice !== undefined) {
      amount = calculateLineAmount({
        quantity: v.quantity,
        unitPrice: makeMoney(v.unitPrice, currency as 'INR'),
        amount: makeMoney(v.amount ?? 0, currency as 'INR'),
      });
    } else {
      amount = makeMoney(v.amount!, currency as 'INR');
    }
  }

  // §14 (Module 17) — the tenant's default SAC classification (settings
  // tax.defaultSacCode) applies when the line carries none. §47 — settings
  // establish defaults; the tax engine still computes every amount.
  let classification = v.classification;
  if (classification === undefined) {
    const settingsTenant = await getTenantById(tenantId);
    const defaultSac = settingsTenant?.agencySettings?.tax?.defaultSacCode;
    if (defaultSac !== undefined) {
      classification = { type: 'SAC' as const, code: defaultSac };
    }
  }

  const line = await createInvoiceLine(tenantId, {
    invoiceId,
    type: v.type,
    description: v.description,
    ...(v.quantity !== undefined && { quantity: v.quantity }),
    ...(v.unitPrice !== undefined && v.unitPrice !== undefined && {
      unitPrice: makeMoney(v.unitPrice, invoice.currency as 'INR'),
    }),
    amount,
    ...(sourceId !== undefined && { sourceId }),
    ...(classification !== undefined && { classification }),
    ...(v.taxCategory !== undefined && { taxCategory: v.taxCategory }),
    ...(metadata !== undefined && { metadata }),
  });

  // §63 — the reservation, AFTER the line exists (the draft holds something).
  if (sourceId !== undefined && (v.type === 'TIME' || v.type === 'EXPENSE' || v.type === 'MILESTONE')) {
    const loaded = await loadSource(asSourceLineType(v.type), sourceId, tenantId);
    if (loaded.ok) {
      const ok = await reserveSource(asSourceLineType(v.type), loaded.source, invoiceId, actor.userId);
      if (!ok) {
        // Compensate: drop the orphan line rather than leave an unreserved one.
        await deleteInvoiceLine(line.id!, tenantId);
        return conflict(`Failed to reserve ${v.type} ${sourceId} — it may have been claimed by another draft`);
      }
      await audit.log('ITEM_RESERVED', `${v.type} ${sourceId} reserved by draft ${invoiceId}`);
    }
  }

  const updated = await recalculateDraftMoney(tenantId, invoiceId);
  await audit.log('INVOICE_LINE_ADDED', `Line ${line.id} (${v.type}, ${amount.amount} ${amount.currency}) added to draft ${invoiceId}`);
  return { ok: true, status: 201, data: { line, invoice: updated! } };
}

/**
 * §82 — remove a line from a DRAFT: release the reservation (§66) and drop
 * the line, then recompute money.
 */
export async function removeInvoiceLine(
  invoiceId: string,
  lineId: string,
  tenantId: string,
  audit: AuditContext
): Promise<DomainResult<Invoice>> {
  const invoice = await getInvoiceById(invoiceId, tenantId);
  if (!invoice) return notFound('Invoice');
  if (invoice.status !== 'DRAFT') {
    return conflict(`Only a draft invoice can be edited (current state: ${invoice.status})`);
  }

  const lines = await getInvoiceLines(invoiceId, tenantId);
  const line = lines.find(l => l.id === lineId);
  if (!line) return notFound('Line');

  if (isSourceBackedLineType(line.type) && line.sourceId) {
    const loaded = await loadSource(asSourceLineType(line.type), line.sourceId, tenantId);
    if (loaded.ok) {
      const ok = await releaseSource(asSourceLineType(line.type), loaded.source, invoiceId);
      if (ok) {
        await audit.log('RESERVATION_RELEASED', `${line.type} ${line.sourceId} released from draft ${invoiceId}`);
      }
    }
  }

  const removed = await deleteInvoiceLine(lineId, tenantId);
  if (!removed) return notFound('Line');

  const updated = await recalculateDraftMoney(tenantId, invoiceId);
  await audit.log('INVOICE_LINE_REMOVED', `Line ${lineId} (${line.type}) removed from draft ${invoiceId}`);
  return { ok: true, status: 200, data: updated! };
}

/**
 * §68 steps 3–4 (Pricing/Tax) — set the draft's discount, tax LINES (§76/§11)
 * and Module 11 compliance configuration: place of supply (§15 — stored, the
 * determination is the rules layer's), reverse charge (§16) and exemption
 * (§17). All money is recomputed through the engine; tax amounts are NEVER
 * written by hand. An EXEMPT invoice legitimately carries tax ₹0 — the tax
 * lines are cleared, the calculation has NOT failed (§17).
 */
export async function setInvoiceTaxation(
  invoiceId: string,
  tenantId: string,
  payload: { discountAmount?: number; taxes?: unknown; placeOfSupply?: unknown; reverseCharge?: unknown; exemption?: unknown },
  audit: AuditContext
): Promise<DomainResult<Invoice>> {
  const invoice = await getInvoiceById(invoiceId, tenantId);
  if (!invoice) return notFound('Invoice');
  if (invoice.status !== 'DRAFT') {
    return conflict(`Only a draft invoice can be edited (current state: ${invoice.status})`);
  }

  // Module 11 validators (§11/§15/§16/§17) — one error surface for the
  // whole compliance payload.
  const errors: string[] = [];
  const taxesV = validateTaxLineInputs(payload.taxes);
  if (!taxesV.ok && taxesV.errors) {
    errors.push(...taxesV.errors.map(e => `${e.field}: ${e.message}`));
  }
  const posV = validatePlaceOfSupply(payload.placeOfSupply);
  if (!posV.ok && posV.errors) errors.push(...posV.errors.map(e => `${e.field}: ${e.message}`));
  const rcV = validateReverseCharge(payload.reverseCharge);
  if (!rcV.ok && rcV.errors) errors.push(...rcV.errors.map(e => `${e.field}: ${e.message}`));
  const exV = validateExemption(payload.exemption);
  if (!exV.ok && exV.errors) errors.push(...exV.errors.map(e => `${e.field}: ${e.message}`));
  if (errors.length > 0) return badRequest(errors.join('; '));

  const discountAmount = payload.discountAmount !== undefined
    ? payload.discountAmount
    : invoice.discount.amount;
  if (discountAmount !== undefined && (typeof discountAmount !== 'number' || !Number.isFinite(discountAmount) || discountAmount < 0)) {
    return badRequest('Discount must be zero or more');
  }

  // Absent fields keep their stored values (merge, not replace).
  const taxes = taxesV.value !== undefined ? taxesV.value : taxLinesToInputs(invoice.taxLines);
  const placeOfSupply = posV.value !== undefined ? posV.value : invoice.placeOfSupply;
  const reverseCharge = rcV.value !== undefined ? rcV.value : invoice.reverseCharge;
  const exemption = exV.value !== undefined ? exV.value : invoice.exemption;

  // §17 — an exempt invoice carries NO tax lines: tax ₹0 is the legitimate
  // engine result, not a failed calculation. Configured tax lines are
  // cleared the moment the exemption is set.
  const effectiveTaxes = exemption !== undefined && exemption !== null ? [] : taxes;

  const lines = await getInvoiceLines(invoiceId, tenantId);
  try {
    const calc = recalculateInvoice({ lines, discountAmount, taxes: effectiveTaxes, amountPaid: invoice.amountPaid });
    await updateInvoiceRepo(invoiceId, tenantId, {
      discount: calc.discount,
      taxLines: calc.taxLines,
      taxTotal: calc.taxTotal,
      subtotal: calc.subtotal,
      total: calc.total,
      amountDue: calc.amountDue,
      placeOfSupply: placeOfSupply ?? null,
      reverseCharge: reverseCharge ?? null,
      exemption: exemption ?? null,
    });
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : 'Invalid taxation input');
  }

  const updated = await getInvoiceById(invoiceId, tenantId);
  await audit.log(
    'INVOICE_TAXATION_SET',
    `Draft ${invoiceId} taxation set — discount ${discountAmount}${exemption ? `, EXEMPT (${exemption.reason})` : `, ${effectiveTaxes.length} tax line(s)`}${placeOfSupply ? `, place of supply ${placeOfSupply.country}/${placeOfSupply.stateOrRegion}` : ''}${reverseCharge ? `, reverse charge ${reverseCharge.applicable ? 'applicable' : 'not applicable'}` : ''}`
  );
  return { ok: true, status: 200, data: updated! };
}

/** §63 — the only PATCHable surface of a draft (notes/terms/dueDate). */
export async function updateInvoiceDraft(
  invoiceId: string,
  tenantId: string,
  payload: unknown,
  audit: AuditContext
): Promise<DomainResult<Invoice>> {
  const invoice = await getInvoiceById(invoiceId, tenantId);
  if (!invoice) return notFound('Invoice');
  if (invoice.status !== 'DRAFT') {
    return conflict(`Only a draft invoice can be edited (current state: ${invoice.status})`);
  }

  const validated = validateInvoiceUpdate(payload as Record<string, unknown>);
  if (!validated.ok) {
    return badRequest(validated.errors.map(e => `${e.field}: ${e.message}`).join('; '));
  }
  const v = validated.value;
  if (v.dueDate !== undefined && v.dueDate < invoice.issueDate) {
    return badRequest('Due date cannot be before the issue date');
  }

  await updateInvoiceRepo(invoiceId, tenantId, v);
  const updated = await getInvoiceById(invoiceId, tenantId);
  await audit.log('INVOICE_UPDATED', `Draft ${invoiceId} updated`);
  return { ok: true, status: 200, data: updated! };
}

// ---------- 9E: finalization + void (§74/§79/§83) ----------

/**
 * §83 — stamp a source INVOICED at finalization: the reservation trail is
 * superseded by the §61 invoiceId (the opposite-direction link). Returns the
 * source's pre-write state so a failed batch can restore it exactly.
 */
async function markSourceInvoiced(
  type: SourceLineType,
  source: TimeEntry | Expense | ProjectMilestone,
  invoiceId: string
): Promise<TimeEntry | Expense | ProjectMilestone> {
  const before = source;
  const stamp = {
    billingStatus: 'INVOICED' as const,
    invoiceId,
    reservedBy: null,
    reservedAt: null,
    reservedInvoiceId: null,
  };
  let ok: boolean;
  if (type === 'TIME') {
    ok = await updateTimeEntryRepo((source as TimeEntry).id!, (source as TimeEntry).tenantId, stamp);
  } else if (type === 'EXPENSE') {
    ok = await updateExpenseRepo((source as Expense).id!, (source as Expense).tenantId, stamp);
  } else {
    const milestone = source as ProjectMilestone;
    ok = await updateProjectMilestoneRepo(milestone.id!, milestone.projectId, milestone.tenantId, stamp);
  }
  if (!ok) throw new Error(`Failed to stamp ${type} ${(source as TimeEntry).id} INVOICED`);
  return before;
}

/**
 * §83 compensating leg — restore a source to its captured pre-finalization
 * state (RESERVED, holding this draft's trail) after a later write failed.
 */
async function restoreSourceReservation(
  type: SourceLineType,
  source: TimeEntry | Expense | ProjectMilestone
): Promise<void> {
  const restore = {
    billingStatus: 'RESERVED' as const,
    invoiceId: null,
    reservedBy: (source as TimeEntry).reservedBy ?? null,
    reservedAt: (source as TimeEntry).reservedAt ?? null,
    reservedInvoiceId: (source as TimeEntry).reservedInvoiceId ?? null,
  };
  if (type === 'TIME') {
    await updateTimeEntryRepo((source as TimeEntry).id!, (source as TimeEntry).tenantId, restore);
  } else if (type === 'EXPENSE') {
    await updateExpenseRepo((source as Expense).id!, (source as Expense).tenantId, restore);
  } else {
    const milestone = source as ProjectMilestone;
    await updateProjectMilestoneRepo(milestone.id!, milestone.projectId, milestone.tenantId, restore);
  }
}

/**
 * Void-from-SENT leg — un-mark sources back to UNBILLED so the work becomes
 * re-billable. Guarded by the §61 invoiceId: a source invoiced by a
 * DIFFERENT invoice is never touched.
 */
async function unmarkSourceInvoiced(
  type: SourceLineType,
  source: TimeEntry | Expense | ProjectMilestone,
  invoiceId: string
): Promise<boolean> {
  if ((source as TimeEntry).invoiceId !== invoiceId) return false;
  const clear = {
    billingStatus: 'UNBILLED' as const,
    invoiceId: null,
    reservedBy: null,
    reservedAt: null,
    reservedInvoiceId: null,
  };
  if (type === 'TIME') {
    return updateTimeEntryRepo((source as TimeEntry).id!, (source as TimeEntry).tenantId, clear);
  }
  if (type === 'EXPENSE') {
    return updateExpenseRepo((source as Expense).id!, (source as Expense).tenantId, clear);
  }
  const milestone = source as ProjectMilestone;
  return updateProjectMilestoneRepo(milestone.id!, milestone.projectId, milestone.tenantId, clear);
}

/**
 * §83 — THE critical operation. Draft → Validate → (verify reservations) →
 * Number → Finalize → Mark sources INVOICED → Audit, as one logically atomic
 * sequence:
 *
 *   1. the invoice must be a DRAFT with at least one line;
 *   2. every source-backed line's reservation is verified — the source must
 *      still be RESERVED BY THIS DRAFT (§65: a lost/stolen reservation is a
 *      409, never a finalize-anyway);
 *   3. final money is recomputed through the engine (§77/§78);
 *   4. §74 — the central authority allocates INV-0000NN (atomic per-tenant
 *      increment; drafts never carried a number);
 *   5. the invoice becomes SENT (§79: finalization IS issuance — there is no
 *      intermediate "numbered draft" state, and a numbered invoice that is
 *      still editable would violate §63);
 *   6. every source is stamped INVOICED with the §61 invoiceId (the
 *      reservation trail is superseded). A failure mid-batch restores the
 *      already-stamped sources and reverts the invoice to DRAFT — the
 *      compensating pattern (no sessions on the local store). The consumed
 *      number is NOT reused: the counter is monotonic, a gap is honest;
 *   7. audit.
 */
export async function finalizeInvoice(
  invoiceId: string,
  tenantId: string,
  actor: { userId: string; role: string },
  audit: AuditContext
): Promise<DomainResult<Invoice>> {
  const invoice = await getInvoiceById(invoiceId, tenantId);
  if (!invoice) return notFound('Invoice');
  if (invoice.status !== 'DRAFT') {
    return conflict(`Only a draft invoice can be finalized (current state: ${invoice.status})`);
  }

  const lines = await getInvoiceLines(invoiceId, tenantId);
  if (lines.length === 0) {
    return badRequest('An invoice with no lines cannot be finalized');
  }

  // Step 2 — verify every reservation BEFORE anything is written.
  const sources: Array<{ type: SourceLineType; line: InvoiceLine; source: TimeEntry | Expense | ProjectMilestone }> = [];
  for (const line of lines) {
    if (!isSourceBackedLineType(line.type) || !line.sourceId) continue;
    const loaded = await loadSource(asSourceLineType(line.type), line.sourceId, tenantId);
    if (!loaded.ok) {
      return conflict(`${line.type} ${line.sourceId} no longer exists — remove the line before finalizing`);
    }
    const billingStatus = (loaded.source as TimeEntry).billingStatus ?? 'UNBILLED';
    const holder = (loaded.source as TimeEntry).reservedInvoiceId;
    if (billingStatus !== 'RESERVED' || holder !== invoiceId) {
      return conflict(
        `${line.type} ${line.sourceId} is no longer reserved by this draft (state: ${billingStatus}) — the line must be resolved before finalizing`,
        'RESERVATION_LOST'
      );
    }
    sources.push({ type: asSourceLineType(line.type), line, source: loaded.source });
  }

  // Step 3 — final money from the engine, never re-derived here.
  const calc = recalculateInvoice({
    lines,
    discountAmount: invoice.discount.amount,
    taxes: taxLinesToInputs(invoice.taxLines),
    amountPaid: invoice.amountPaid,
  });

  // Step 4 — §74/§23 the number, FY-scoped (CBIC uniqueness). Allocated once,
  // at finalization, centrally; the FY is the invoice's issue-date FY. §7 —
  // the tenant's configured billing-profile prefix shapes the number.
  // Module 17 §44 — the FY window follows the tenant's configured fiscal-year
  // start month (stored ⊕ defaults: April).
  const [tenant, client] = await Promise.all([
    getTenantById(invoice.tenantId),
    getClientById(invoice.clientId, tenantId),
  ]);
  const fy = fiscalYear(invoice.issueDate, agencyFiscalYearStartMonth(tenant));

  // Step 4b — §25 the compliance snapshot inputs: the supplier (the agency's
  // billing profile) and the recipient (the client's tax + billing posture)
  // as they stand at finalization. Historical invoices must not change when
  // the agency or client later edits its tax information.
  const supplier: AgencyBillingProfile | undefined = tenant?.billingProfile ?? undefined;
  const numberPrefix = supplier?.invoicePrefix?.trim() || INVOICE_NUMBER_PREFIX;
  let invoiceNumber = await allocateInvoiceNumber(tenantId, fy, numberPrefix);

  const snapshot: InvoiceComplianceSnapshot = {
    capturedAt: new Date(),
    ...(supplier !== undefined && { supplier }),
    ...(client != null && {
      recipient: {
        name: client.legalName ?? client.name,
        // Tax profile first, billing profile as the fallback — both are
        // stored client configuration (§8), frozen as used (§25).
        ...((client.taxProfile?.country ?? client.billingProfile?.country) !== undefined && {
          country: client.taxProfile?.country ?? client.billingProfile?.country,
        }),
        ...((client.taxProfile?.state ?? client.billingProfile?.state) !== undefined && {
          state: client.taxProfile?.state ?? client.billingProfile?.state,
        }),
        // The CBIC invoice rules require the recipient's address on the tax
        // invoice — the billing profile is where it lives (§25).
        ...(client.billingProfile?.address !== undefined && { address: client.billingProfile.address }),
        ...(client.billingProfile?.city !== undefined && { city: client.billingProfile.city }),
        ...(client.billingProfile?.postalCode !== undefined && { postalCode: client.billingProfile.postalCode }),
        ...(client.taxProfile?.taxTreatment !== undefined && { taxTreatment: client.taxProfile.taxTreatment }),
        ...(client.taxProfile?.taxIdentifiers !== undefined && { taxIdentifiers: client.taxProfile.taxIdentifiers }),
      },
    }),
    ...(invoice.placeOfSupply !== undefined && { placeOfSupply: invoice.placeOfSupply }),
    ...(invoice.reverseCharge !== undefined && { reverseCharge: invoice.reverseCharge }),
    ...(invoice.exemption !== undefined && { exemption: invoice.exemption }),
    taxLines: calc.taxLines,
    classifications: lines.map(l => ({ lineId: l.id!, ...(l.classification !== undefined && { classification: l.classification }) })),
    // §25 — which rules-layer versions produced the tax lines (stamped by
    // the rules layer into each line's metadata; manual lines carry none).
    taxRulesUsed: [...new Set(calc.taxLines
      .map(t => (t.metadata && typeof t.metadata.rulesVersion === 'string' ? t.metadata.rulesVersion : undefined))
      .filter((v): v is string => v !== undefined))],
    numbering: { invoiceNumber, fiscalYear: fy },
  };

  // Step 4c — §26/§27 e-invoice READINESS: PENDING when the invoice carries
  // GST lines and BOTH parties hold a GSTIN (the IRP's minimum shape);
  // NOT_APPLICABLE otherwise. No IRP call, ever (§27).
  const hasGstLines = calc.taxLines.some(t => t.type !== 'OTHER' && t.amount.amount > 0);
  const hasGstin = (ids?: Array<{ type: string }>) => ids?.some(i => i.type.toUpperCase() === 'GSTIN') ?? false;
  const eInvoice: EInvoiceMetadata = {
    status: hasGstLines && hasGstin(supplier?.taxIdentifiers) && hasGstin(client?.taxProfile?.taxIdentifiers)
      ? 'PENDING'
      : 'NOT_APPLICABLE',
  };

  // Step 5 — finalize: SENT + number + FY + final money + the frozen
  // compliance snapshot, in one write. Try with allocated number; if duplicate key collision occurs, retry.
  let finalized = false;
  let finalInvoiceNumber = invoiceNumber;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      finalInvoiceNumber = await allocateInvoiceNumber(tenantId, fy, numberPrefix);
      snapshot.numbering = { invoiceNumber: finalInvoiceNumber, fiscalYear: fy };
    }
    try {
      finalized = await updateInvoiceRepo(invoiceId, tenantId, {
        status: 'SENT',
        invoiceNumber: finalInvoiceNumber,
        fiscalYear: fy,
        eInvoice,
        complianceSnapshot: snapshot,
        subtotal: calc.subtotal,
        discount: calc.discount,
        taxLines: calc.taxLines,
        taxTotal: calc.taxTotal,
        total: calc.total,
        amountDue: calc.amountDue,
      });
      if (finalized) break;
    } catch (err: unknown) {
      if ((err as { code?: number })?.code === 11000 && attempt < 2) {
        continue;
      }
      return { ok: false, status: 409, error: 'Invoice number conflict during finalization. Please try again.' };
    }
  }
  if (!finalized) {
    const checkExisting = await getInvoiceById(invoiceId, tenantId);
    if (!checkExisting) return notFound('Invoice');
    return { ok: false, status: 500, error: 'Failed to update invoice status during finalization.' };
  }
  invoiceNumber = finalInvoiceNumber;

  // Step 6 — mark every source INVOICED; compensate on failure.
  const stamped: Array<{ type: SourceLineType; source: TimeEntry | Expense | ProjectMilestone }> = [];
  for (const ref of sources) {
    try {
      const before = await markSourceInvoiced(ref.type, ref.source, invoiceId);
      stamped.push({ type: ref.type, source: before });
      await audit.log('ITEM_INVOICED', `${ref.type} ${ref.line.sourceId} invoiced by ${invoiceNumber} (${invoiceId})`);
    } catch {
      // §83 — roll everything back: sources to their captured RESERVED state,
      // the invoice to DRAFT without the number. The consumed number stays
      // consumed (monotonic counter; an honest gap, never a reuse).
      for (const done of stamped) {
        await restoreSourceReservation(done.type, done.source).catch(() => undefined);
      }
      await updateInvoiceRepo(invoiceId, tenantId, {
        status: 'DRAFT',
        invoiceNumber: null,
        // Module 11 — the frozen compliance artifacts leave with the number.
        fiscalYear: null,
        eInvoice: null,
        complianceSnapshot: null,
      }).catch(() => undefined);
      return { ok: false, status: 500, error: 'Finalization failed while locking the billed items — everything was rolled back. Try again.' };
    }
  }

  const updated = await getInvoiceById(invoiceId, tenantId);
  await audit.log(
    'INVOICE_FINALIZED',
    `Invoice ${invoiceNumber} finalized for ${calc.total.amount} ${calc.total.currency} — ${sources.length} source item(s) locked INVOICED`
  );
  return { ok: true, status: 200, data: updated! };
}

/**
 * §81/§82 — record the act of SENDING an invoice to the client.
 *
 * Finalization IS issuance (DRAFT → SENT with the §74 number); this action
 * records the delivery: it stamps sentAt and writes an INVOICE_SENT audit
 * event. Re-sending is allowed and idempotent in effect (a fresh sentAt +
 * a fresh audit line — the trail shows every send). A DRAFT has no invoice
 * number to send (§74) and a VOID invoice is retired — both are 409s.
 */
export async function sendInvoice(
  invoiceId: string,
  tenantId: string,
  actor: { userId: string; role: string },
  audit: AuditContext
): Promise<DomainResult<Invoice>> {
  const invoice = await getInvoiceById(invoiceId, tenantId);
  if (!invoice) return notFound('Invoice');
  if (invoice.status === 'DRAFT') {
    return conflict('Finalize the invoice before sending it — a draft carries no invoice number (§74)');
  }
  if (invoice.status === 'VOID') {
    return conflict('A voided invoice cannot be sent');
  }

  const sentAt = new Date();
  const ok = await updateInvoiceRepo(invoiceId, tenantId, { sentAt });
  if (!ok) return notFound('Invoice');

  const updated = await getInvoiceById(invoiceId, tenantId);
  await audit.log(
    'INVOICE_SENT',
    `Invoice ${invoice.invoiceNumber} recorded as sent to the client${invoice.sentAt ? ' (re-send)' : ''} by ${actor.userId}`
  );
  return { ok: true, status: 200, data: updated! };
}

/**
 * §79 — VOID from DRAFT/SENT/OVERDUE, never from PAID (and never once money
 * has been received — reversal/credit mechanisms come later). Voiding
 * releases the billed work back to UNBILLED so it can be re-invoiced:
 *   - from DRAFT: the §66 reservation release (the items were never billed);
 *   - from SENT/OVERDUE: the §61 invoiceId link is cleared and the sources
 *     return to UNBILLED (guarded — another invoice's items are untouched).
 */
export async function voidInvoice(
  invoiceId: string,
  tenantId: string,
  actor: { userId: string; role: string },
  audit: AuditContext
): Promise<DomainResult<Invoice>> {
  const invoice = await getInvoiceById(invoiceId, tenantId);
  if (!invoice) return notFound('Invoice');
  if (!canTransitionInvoiceStatus(invoice.status, 'VOID')) {
    return conflict(`An invoice in state ${invoice.status} cannot be voided`);
  }
  if (invoice.amountPaid.amount > 0) {
    return conflict('An invoice with payments recorded cannot be voided — record a reversal instead (Module 10)');
  }

  const lines = await getInvoiceLines(invoiceId, tenantId);
  let released = 0;
  for (const line of lines) {
    if (!isSourceBackedLineType(line.type) || !line.sourceId) continue;
    const loaded = await loadSource(asSourceLineType(line.type), line.sourceId, tenantId);
    if (!loaded.ok) continue;
    if (invoice.status === 'DRAFT') {
      // §66 — the guarded reservation release.
      const ok = await releaseSource(asSourceLineType(line.type), loaded.source, invoiceId);
      if (ok) released += 1;
    } else {
      // SENT/OVERDUE — the items were INVOICED; un-mark them (§61 guard).
      const ok = await unmarkSourceInvoiced(asSourceLineType(line.type), loaded.source, invoiceId);
      if (ok) released += 1;
    }
  }

  const voided = await updateInvoiceRepo(invoiceId, tenantId, { status: 'VOID' });
  if (!voided) return notFound('Invoice');

  const updated = await getInvoiceById(invoiceId, tenantId);
  await audit.log(
    'INVOICE_VOIDED',
    `Invoice ${invoice.invoiceNumber ?? `draft ${invoiceId}`} voided — ${released} source item(s) released back to UNBILLED`
  );
  return { ok: true, status: 200, data: updated! };
}

// ---------- reads (§85) ----------

export async function listInvoices(
  tenantId: string,
  filters: InvoiceFilters = {}
): Promise<Invoice[]> {
  return getInvoices(tenantId, filters);
}

export async function getInvoice(
  id: string,
  tenantId: string
): Promise<DomainResult<{ invoice: Invoice; lines: InvoiceLine[] }>> {
  const invoice = await getInvoiceById(id, tenantId);
  if (!invoice) return notFound('Invoice');
  const lines = await getInvoiceLines(id, tenantId);
  return { ok: true, status: 200, data: { invoice, lines } };
}

/**
 * Module 11 §29 — the invoice's tax & compliance READ surface: the engine's
 * money view (subtotal → discount → taxable → tax lines → total) plus the
 * stored compliance configuration (§15 place of supply, §16 reverse charge,
 * §17 exemption) and each line's classification (§13/§14). Pure read — the
 * GST structure SUGGESTION is added by the route from the rules layer; this
 * domain function never invokes it (§28: configuration, not intelligence).
 */
export async function getInvoiceTaxation(
  id: string,
  tenantId: string
): Promise<DomainResult<{
  invoice: Invoice;
  lines: InvoiceLine[];
  taxation: {
    currency: string;
    subtotal: Invoice['subtotal'];
    discount: Invoice['discount'];
    taxableAmount: ReturnType<typeof calculateTaxableAmount>;
    taxLines: InvoiceTaxLine[];
    taxTotal: Invoice['taxTotal'];
    total: Invoice['total'];
    classifications: Array<{ lineId: string; classification?: InvoiceLine['classification']; taxCategory?: string }>;
    placeOfSupply?: Invoice['placeOfSupply'];
    reverseCharge?: Invoice['reverseCharge'];
    exemption?: Invoice['exemption'];
  };
}>> {
  const invoice = await getInvoiceById(id, tenantId);
  if (!invoice) return notFound('Invoice');
  const lines = await getInvoiceLines(id, tenantId);
  return {
    ok: true,
    status: 200,
    data: {
      invoice,
      lines,
      taxation: {
        currency: invoice.currency,
        subtotal: invoice.subtotal,
        discount: invoice.discount,
        taxableAmount: calculateTaxableAmount(invoice.subtotal, invoice.discount),
        taxLines: invoice.taxLines,
        taxTotal: invoice.taxTotal,
        total: invoice.total,
        classifications: lines.map(l => ({
          lineId: l.id,
          ...(l.classification !== undefined && { classification: l.classification }),
          ...(l.taxCategory !== undefined && { taxCategory: l.taxCategory }),
        })),
        ...(invoice.placeOfSupply !== undefined && { placeOfSupply: invoice.placeOfSupply }),
        ...(invoice.reverseCharge !== undefined && { reverseCharge: invoice.reverseCharge }),
        ...(invoice.exemption !== undefined && { exemption: invoice.exemption }),
      },
    },
  };
}

// ---------- source↔invoice ownership (§69 scoping) ----------

/**
 * A billed source must belong to the invoice's engagement:
 *   - project-scoped invoice → the source's project must BE that project;
 *   - client-scoped invoice → the source's project must belong to that
 *     client, or (standalone expense) its clientId must match.
 */
async function sourceBelongsToInvoice(
  type: SourceLineType,
  source: TimeEntry | Expense | ProjectMilestone,
  invoice: Invoice
): Promise<DomainResult<true>> {
  const sourceProjectId = type === 'TIME'
    ? (source as TimeEntry).projectId
    : type === 'MILESTONE'
      ? (source as ProjectMilestone).projectId
      : (source as Expense).projectId;

  if (invoice.projectId !== undefined) {
    if (sourceProjectId !== invoice.projectId) {
      return badRequest(`The ${type.toLowerCase()} does not belong to the invoice's project`);
    }
    return { ok: true, status: 200, data: true };
  }

  if (sourceProjectId !== undefined) {
    const project = await getProjectById(sourceProjectId, invoice.tenantId);
    if (!project || project.clientId !== invoice.clientId) {
      return badRequest(`The ${type.toLowerCase()} does not belong to the invoice's client`);
    }
    return { ok: true, status: 200, data: true };
  }

  if (type === 'EXPENSE') {
    const expense = source as Expense;
    if (expense.clientId !== undefined && expense.clientId !== invoice.clientId) {
      return badRequest('The expense does not belong to the invoice\'s client');
    }
  }
  return { ok: true, status: 200, data: true };
}
