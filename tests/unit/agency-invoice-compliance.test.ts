/**
 * Module 11 (Sprints 11.8–11.10 / §23–§27, §30) — Unit: invoice compliance.
 *
 * Domain tests (db mocked). Pins the §30 compliance entries:
 *   - §15/§16/§17 setInvoiceTaxation stores place of supply / reverse charge
 *     / exemption as CONFIGURATION; an exemption clears the tax lines (tax ₹0
 *     is a legitimate result, never a failed calculation).
 *   - §13/§14 a MANUAL line carries its HSN/SAC classification and tax
 *     category into storage — never defaulted.
 *   - §23/§24 finalization numbers the invoice in its FISCAL YEAR
 *     (FY2026-27 for a 2026-09-13 issue date) via the central authority.
 *   - §25 the compliance SNAPSHOT is written once at finalization: supplier,
 *     recipient, taxes, classifications, rules versions, numbering.
 *   - §26/§27 e-invoice status: PENDING iff GST lines AND both parties hold
 *     a GSTIN; NOT_APPLICABLE otherwise. Never an IRP call.
 *   - §25 historical immutability: a finalized invoice is never editable and
 *     never re-finalizable — the snapshot cannot change after the fact.
 *   - §83 compensation clears the frozen artifacts with the number.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('@/lib/db', () => ({
  getClientById: vi.fn(),
  getProjectById: vi.fn(),
  getProjects: vi.fn(),
  getTenantById: vi.fn(),
  getProjectMilestones: vi.fn(),
  getProjectMilestoneById: vi.fn(),
  updateProjectMilestone: vi.fn(),
  getTimeEntryById: vi.fn(),
  updateTimeEntry: vi.fn(),
  getTimeEntries: vi.fn(),
  getExpenseById: vi.fn(),
  updateExpense: vi.fn(),
  getExpenses: vi.fn(),
  getInvoices: vi.fn(),
  getInvoiceById: vi.fn(),
  createInvoice: vi.fn(),
  updateInvoice: vi.fn(),
  getInvoiceLines: vi.fn(),
  createInvoiceLine: vi.fn(),
  deleteInvoiceLine: vi.fn(),
  allocateInvoiceNumberForFiscalYear: vi.fn(),
  seedInvoiceSequenceFromLegacy: vi.fn(),
  // Transitively imported by agency.clients (AuditContext/DomainResult home).
  createClient: vi.fn(), getClients: vi.fn(),
  updateClient: vi.fn(), searchClients: vi.fn(), findClientByName: vi.fn(),
  getLogs: vi.fn(),
}));

import {
  getClientById, getTenantById,
  getInvoiceById, updateInvoice as updateInvoiceRepo,
  getInvoiceLines, createInvoiceLine,
  allocateInvoiceNumberForFiscalYear,
} from '@/lib/db';
import {
  setInvoiceTaxation, addInvoiceLine, finalizeInvoice, getInvoiceTaxation,
} from '@/lib/agency/domain/agency.invoices';
import type { Invoice, InvoiceLine } from '@/lib/agency/types/invoice';
import { TAX_RULES_VERSION } from '@/lib/agency/domain/tax-rules';
import { makeMoney, zeroMoney } from '@/lib/agency/types/money';
import { todayInTimezone } from '@/lib/agency/types/dates';

const TENANT = 'tenant-a';
const TODAY = todayInTimezone(); // 2026-09-13 → FY2026-27
const audit = { username: 'tester', tenantId: TENANT, log: vi.fn() };
const ACTOR_ADMIN = { userId: 'admin-1', role: 'TENANT_ADMIN' as const };

const AGENCY_GSTIN = { type: 'GSTIN', value: '27AAPFU0939F1ZV', country: 'IN' };
const CLIENT_GSTIN = { type: 'GSTIN', value: '29AAFCA5212M1Z8', country: 'IN' };

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-1', tenantId: TENANT, clientId: 'client-1', projectId: 'proj-1',
    issueDate: TODAY, dueDate: TODAY, currency: 'INR',
    subtotal: zeroMoney('INR'), discount: zeroMoney('INR'),
    taxLines: [], taxTotal: zeroMoney('INR'), total: zeroMoney('INR'),
    amountPaid: zeroMoney('INR'), amountDue: zeroMoney('INR'),
    status: 'DRAFT', createdBy: 'admin-1',
    createdAt: new Date('2026-09-01'), updatedAt: new Date('2026-09-01'),
    ...overrides,
  };
}

function manualLine(overrides: Partial<InvoiceLine> = {}): InvoiceLine {
  return {
    id: 'line-1', tenantId: TENANT, invoiceId: 'inv-1', type: 'MANUAL',
    description: 'IT consulting services',
    classification: { type: 'SAC', code: '998314' },
    taxCategory: 'GST 18%',
    amount: makeMoney(100000),
    createdAt: new Date('2026-09-01'), updatedAt: new Date('2026-09-01'),
    ...overrides,
  };
}

function echoCreateLine(tenantId: string, input: Record<string, unknown>): InvoiceLine {
  return {
    id: 'line-1', tenantId, ...input,
    createdAt: new Date(), updatedAt: new Date(),
  } as unknown as InvoiceLine;
}

/** The full compliance setup: Maharashtra agency billing a Karnataka client. */
function setupComplianceInvoice() {
  (getInvoiceById as Mock).mockResolvedValue(invoice({
    placeOfSupply: { country: 'IN', stateOrRegion: 'Karnataka', code: '29' },
    taxLines: [{
      type: 'IGST', name: 'IGST', rate: 18,
      metadata: { rulesVersion: TAX_RULES_VERSION },
      taxableAmount: makeMoney(100000), amount: makeMoney(18000),
    }],
    subtotal: makeMoney(100000), taxTotal: makeMoney(18000), total: makeMoney(118000),
  }));
  (getInvoiceLines as Mock).mockResolvedValue([manualLine()]);
  (getTenantById as Mock).mockResolvedValue({
    id: TENANT, name: 'Acme Studio',
    billingProfile: {
      legalName: 'Acme Studio Private Limited', country: 'IN', state: 'Maharashtra',
      taxIdentifiers: [AGENCY_GSTIN],
    },
  });
  (getClientById as Mock).mockResolvedValue({
    id: 'client-1', tenantId: TENANT, name: 'Bengaluru Systems', legalName: 'Bengaluru Systems LLP',
    // §25 — the recipient's BILLING profile (address) freezes alongside the
    // tax posture: the CBIC invoice rules require the recipient's address.
    billingProfile: {
      address: '12 MG Road', city: 'Bengaluru', state: 'Karnataka',
      postalCode: '560001', country: 'IN',
    },
    taxProfile: {
      country: 'IN', state: 'Karnataka', taxTreatment: 'REGISTERED',
      taxIdentifiers: [CLIENT_GSTIN],
    },
  });
  (allocateInvoiceNumberForFiscalYear as Mock).mockResolvedValue(1);
}

beforeEach(() => {
  vi.clearAllMocks();
  (updateInvoiceRepo as Mock).mockResolvedValue(true);
  (createInvoiceLine as Mock).mockImplementation(echoCreateLine);
  (getInvoiceLines as Mock).mockResolvedValue([]);
  (getTenantById as Mock).mockResolvedValue(null);
  (getClientById as Mock).mockResolvedValue(null);
});

// ---------- §15–§17 — taxation as configuration ----------

describe('setInvoiceTaxation (§15/§16/§17)', () => {
  it('stores the place of supply as configuration (§15)', () => {
    (getInvoiceById as Mock).mockResolvedValue(invoice());
    return setInvoiceTaxation('inv-1', TENANT, {
      placeOfSupply: { country: 'IN', stateOrRegion: 'Karnataka', code: '29' },
      taxes: [{ type: 'IGST', name: 'IGST', rate: 18 }],
    }, audit).then(result => {
      expect(result.ok).toBe(true);
      const write = (updateInvoiceRepo as Mock).mock.calls[0][2];
      expect(write.placeOfSupply).toEqual({ country: 'IN', stateOrRegion: 'Karnataka', code: '29' });
      expect(write.taxLines[0].type).toBe('IGST');
      expect(write.taxTotal.amount).toBe(0); // no lines → taxable 0
    });
  });

  it('null clears the stored place of supply; absent keeps it', () => {
    const stored = invoice({ placeOfSupply: { country: 'IN', stateOrRegion: 'Karnataka' } });
    (getInvoiceById as Mock).mockResolvedValue(stored);
    return setInvoiceTaxation('inv-1', TENANT, { placeOfSupply: null }, audit).then(result => {
      expect(result.ok).toBe(true);
      expect((updateInvoiceRepo as Mock).mock.calls[0][2].placeOfSupply).toBeNull();
      // absent: the stored value survives the merge
      return setInvoiceTaxation('inv-1', TENANT, {}, audit).then(() => {
        expect((updateInvoiceRepo as Mock).mock.calls[1][2].placeOfSupply)
          .toEqual({ country: 'IN', stateOrRegion: 'Karnataka' });
      });
    });
  });

  it('§17 — an exemption clears the tax lines: tax ₹0 is a legitimate result', () => {
    (getInvoiceById as Mock).mockResolvedValue(invoice({
      taxLines: [{ type: 'IGST', name: 'IGST', rate: 18, taxableAmount: makeMoney(100000), amount: makeMoney(18000) }],
    }));
    return setInvoiceTaxation('inv-1', TENANT, {
      exemption: { reason: 'Export of service — zero-rated', reference: 'LUT 2026' },
      // Taxes sent in the SAME payload are still cleared by the exemption.
      taxes: [{ type: 'IGST', name: 'IGST', rate: 18 }],
    }, audit).then(result => {
      expect(result.ok).toBe(true);
      const write = (updateInvoiceRepo as Mock).mock.calls[0][2];
      expect(write.exemption).toEqual({ reason: 'Export of service — zero-rated', reference: 'LUT 2026' });
      expect(write.taxLines).toEqual([]);
      expect(write.taxTotal.amount).toBe(0);
      expect(write.total.amount).toBe(0); // no lines in this fixture
    });
  });

  it('an invalid compliance payload is one joined 400', async () => {
    (getInvoiceById as Mock).mockResolvedValue(invoice());
    const result = await setInvoiceTaxation('inv-1', TENANT, {
      placeOfSupply: { stateOrRegion: 'Karnataka' }, // country missing
      reverseCharge: { applicable: 'yes' },          // not a boolean
      exemption: { reference: 'no reason' },          // reason missing
      taxes: [{ type: 'IGST+', name: 'IGST', rate: 18 }], // bad component
    }, audit);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(updateInvoiceRepo).not.toHaveBeenCalled();
  });
});

// ---------- §13/§14 — classification on the line ----------

describe('addInvoiceLine classification (§13/§14)', () => {
  it('carries the HSN/SAC classification and tax category into storage — never defaulted', async () => {
    (getInvoiceById as Mock).mockResolvedValue(invoice());
    const result = await addInvoiceLine('inv-1', TENANT, ACTOR_ADMIN, {
      type: 'MANUAL', description: 'IT consulting services', amount: 100000,
      classification: { type: 'SAC', code: '998314' },
      taxCategory: 'GST 18%',
    }, audit);
    expect(result.ok).toBe(true);
    const written = (createInvoiceLine as Mock).mock.calls[0][1];
    expect(written.classification).toEqual({ type: 'SAC', code: '998314' });
    expect(written.taxCategory).toBe('GST 18%');
  });

  it('a line without a classification stays unclassified — nothing is invented', async () => {
    (getInvoiceById as Mock).mockResolvedValue(invoice());
    const result = await addInvoiceLine('inv-1', TENANT, ACTOR_ADMIN, {
      type: 'MANUAL', description: 'Ad-hoc charge', amount: 5000,
    }, audit);
    expect(result.ok).toBe(true);
    const written = (createInvoiceLine as Mock).mock.calls[0][1];
    expect(written.classification).toBeUndefined();
    expect(written.taxCategory).toBeUndefined();
  });
});

// ---------- §23–§27 — finalization freezes the compliance artifacts ----------

describe('finalizeInvoice compliance (§23–§27)', () => {
  it('numbers in the fiscal year, snapshots the parties, and marks e-invoice PENDING', async () => {
    setupComplianceInvoice();
    const result = await finalizeInvoice('inv-1', TENANT, ACTOR_ADMIN, audit);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // §23/§24 — FY2026-27 scope, central authority, exactly once, default prefix.
    expect(allocateInvoiceNumberForFiscalYear).toHaveBeenCalledTimes(1);
    expect(allocateInvoiceNumberForFiscalYear).toHaveBeenCalledWith(TENANT, 'FY2026-27', 'INV-');

    const write = (updateInvoiceRepo as Mock).mock.calls[0][2];
    expect(write.status).toBe('SENT');
    expect(write.invoiceNumber).toBe('INV-000001');
    expect(write.fiscalYear).toBe('FY2026-27');

    // §25 — the frozen snapshot.
    const snap = write.complianceSnapshot;
    expect(snap.capturedAt).toBeInstanceOf(Date);
    expect(snap.supplier.legalName).toBe('Acme Studio Private Limited');
    expect(snap.supplier.taxIdentifiers).toEqual([AGENCY_GSTIN]);
    expect(snap.recipient.name).toBe('Bengaluru Systems LLP');
    expect(snap.recipient.state).toBe('Karnataka');
    // §25 — the recipient's billing address is part of the frozen truth.
    expect(snap.recipient.address).toBe('12 MG Road');
    expect(snap.recipient.city).toBe('Bengaluru');
    expect(snap.recipient.postalCode).toBe('560001');
    expect(snap.recipient.taxIdentifiers).toEqual([CLIENT_GSTIN]);
    expect(snap.placeOfSupply).toEqual({ country: 'IN', stateOrRegion: 'Karnataka', code: '29' });
    expect(snap.taxLines[0].type).toBe('IGST');
    expect(snap.classifications).toEqual([
      { lineId: 'line-1', classification: { type: 'SAC', code: '998314' } },
    ]);
    expect(snap.taxRulesUsed).toEqual([TAX_RULES_VERSION]);
    expect(snap.numbering).toEqual({ invoiceNumber: 'INV-000001', fiscalYear: 'FY2026-27' });

    // §26/§27 — GST lines + both GSTINs → READY state, no IRP call.
    expect(write.eInvoice.status).toBe('PENDING');
  });

  it('e-invoice is NOT_APPLICABLE without both GSTINs (§26)', async () => {
    setupComplianceInvoice();
    (getTenantById as Mock).mockResolvedValue({
      id: TENANT, name: 'Acme Studio', billingProfile: { legalName: 'Acme Studio' }, // no GSTIN
    });
    const result = await finalizeInvoice('inv-1', TENANT, ACTOR_ADMIN, audit);
    expect(result.ok).toBe(true);
    expect((updateInvoiceRepo as Mock).mock.calls[0][2].eInvoice.status).toBe('NOT_APPLICABLE');
  });

  it('e-invoice is NOT_APPLICABLE without GST lines (§26) — e.g. an exempt export', async () => {
    setupComplianceInvoice();
    (getInvoiceById as Mock).mockResolvedValue(invoice({
      exemption: { reason: 'Export of service — zero-rated' },
      subtotal: makeMoney(100000), total: makeMoney(100000),
    }));
    const result = await finalizeInvoice('inv-1', TENANT, ACTOR_ADMIN, audit);
    expect(result.ok).toBe(true);
    const write = (updateInvoiceRepo as Mock).mock.calls[0][2];
    expect(write.taxLines).toEqual([]); // exemption held through finalization
    expect(write.eInvoice.status).toBe('NOT_APPLICABLE');
    expect(write.complianceSnapshot.exemption.reason).toBe('Export of service — zero-rated');
  });

  it('§25 — a finalized invoice is never re-finalizable: the snapshot is write-once', async () => {
    setupComplianceInvoice();
    (getInvoiceById as Mock).mockResolvedValue(invoice({
      status: 'SENT', invoiceNumber: 'INV-000001', fiscalYear: 'FY2026-27',
    }));
    const result = await finalizeInvoice('inv-1', TENANT, ACTOR_ADMIN, audit);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
    expect(allocateInvoiceNumberForFiscalYear).not.toHaveBeenCalled();
    expect(updateInvoiceRepo).not.toHaveBeenCalled();
  });

  it('§7/§23 — the tenant billing profile\'s invoicePrefix shapes the number', async () => {
    setupComplianceInvoice();
    (getTenantById as Mock).mockResolvedValue({
      id: TENANT, name: 'Acme Studio',
      billingProfile: {
        legalName: 'Acme Studio Private Limited', country: 'IN', state: 'Maharashtra',
        invoicePrefix: 'ACME-', taxIdentifiers: [AGENCY_GSTIN],
      },
    });
    const result = await finalizeInvoice('inv-1', TENANT, ACTOR_ADMIN, audit);
    expect(result.ok).toBe(true);
    expect(allocateInvoiceNumberForFiscalYear).toHaveBeenCalledWith(TENANT, 'FY2026-27', 'ACME-');
    const write = (updateInvoiceRepo as Mock).mock.calls[0][2];
    expect(write.invoiceNumber).toBe('ACME-000001');
    expect(write.complianceSnapshot.numbering).toEqual({ invoiceNumber: 'ACME-000001', fiscalYear: 'FY2026-27' });
  });

  it('§83 — a mid-finalize failure compensates: the frozen artifacts leave with the number', async () => {
    setupComplianceInvoice();
    const { updateTimeEntry } = await import('@/lib/db');
    // A source-backed line whose INVOICED stamp fails after the finalize write.
    (getInvoiceLines as Mock).mockResolvedValue([manualLine({
      type: 'TIME', sourceId: 'time-1', classification: undefined, taxCategory: undefined,
    })]);
    const { getTimeEntryById } = await import('@/lib/db');
    (getTimeEntryById as Mock).mockResolvedValue({
      id: 'time-1', tenantId: TENANT, projectId: 'proj-1', userId: 'dev-1',
      date: TODAY, durationMinutes: 120, billable: true,
      approvalStatus: 'APPROVED', billingStatus: 'RESERVED', financialStatus: 'READY',
      reservedBy: 'admin-1', reservedAt: new Date(), reservedInvoiceId: 'inv-1',
      calculatedCost: makeMoney(1800), calculatedBillableAmount: makeMoney(5000),
      createdAt: new Date(), updatedAt: new Date(),
    });
    (updateTimeEntry as Mock).mockRejectedValue(new Error('write failed'));

    const result = await finalizeInvoice('inv-1', TENANT, ACTOR_ADMIN, audit);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);

    const calls = (updateInvoiceRepo as Mock).mock.calls;
    const compensation = calls[calls.length - 1][2];
    expect(compensation).toEqual({
      status: 'DRAFT',
      invoiceNumber: null,
      fiscalYear: null,
      eInvoice: null,
      complianceSnapshot: null,
    });
  });
});

// ---------- §29 — the taxation read surface ----------

describe('getInvoiceTaxation (§29)', () => {
  it('returns the engine view plus the stored compliance configuration', async () => {
    setupComplianceInvoice();
    const result = await getInvoiceTaxation('inv-1', TENANT);
    expect(result.ok).toBe(true);
    if (!result.ok || !result.data) return;
    const t = result.data.taxation;
    expect(t.subtotal.amount).toBe(100000);
    expect(t.taxableAmount.amount).toBe(100000);
    expect(t.taxLines[0].type).toBe('IGST');
    expect(t.taxTotal.amount).toBe(18000);
    expect(t.total.amount).toBe(118000);
    expect(t.placeOfSupply).toEqual({ country: 'IN', stateOrRegion: 'Karnataka', code: '29' });
    expect(t.classifications).toEqual([
      { lineId: 'line-1', classification: { type: 'SAC', code: '998314' }, taxCategory: 'GST 18%' },
    ]);
  });

  it('§113 — another tenant\'s invoice is an identical 404', async () => {
    (getInvoiceById as Mock).mockResolvedValue(null);
    const result = await getInvoiceTaxation('inv-x', TENANT);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
  });
});
