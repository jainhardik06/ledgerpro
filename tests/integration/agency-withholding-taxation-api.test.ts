/**
 * Module 11 (Sprints 11.4–11.10 / §29) — Integration: invoice taxation +
 * withholding rules API.
 *
 * Runs the REAL route handlers with only the session/tenant/repository edges
 * mocked — the full pipeline executes between them:
 *   authenticate → resolve tenant → verify Agency capability → authorize →
 *   validate → operate (domain) → audit → respond.
 *
 * Matrix:
 *   Integration — taxation GET (engine view + advisory GST suggestion with
 *                 ?rate=) / PUT (compliance payload through the domain:
 *                 place of supply, exemption clearing tax lines),
 *                 withholding-rules GET (filters) / POST (validated create +
 *                 audit) / PATCH (partial, null-clear, §113 identical-404)
 *   Security    — USER reads taxation (dashboard.read) but 403s the PUT
 *                 (agency.invoices.write) and withholding writes
 *                 (agency.tax.manage); §113 identical-404 for a foreign
 *                 tenant's invoice and rule
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TokenPayload } from '@/lib/auth';
import type { Tenant } from '@/lib/db';
import type { Invoice, InvoiceLine } from '@/lib/agency/types/invoice';
import type { WithholdingRule } from '@/lib/agency/types/withholding';
import { TAX_RULES_VERSION } from '@/lib/agency/domain/tax-rules';
import { makeMoney, zeroMoney } from '@/lib/agency/types/money';
import { AGENCY_A, STANDARD_TENANT } from '../fixtures/agency-fixtures';

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, getSessionUser: vi.fn() };
});

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...actual,
    getTenantById: vi.fn(),
    getClientById: vi.fn(),
    getInvoiceById: vi.fn(),
    updateInvoice: vi.fn(),
    getInvoiceLines: vi.fn(),
    createLog: vi.fn(),
    getWithholdingRules: vi.fn(),
    getWithholdingRuleById: vi.fn(),
    createWithholdingRule: vi.fn(),
    updateWithholdingRule: vi.fn(),
    // imported by agency.clients (AuditContext/DomainResult home) — same module
    createClient: vi.fn(), getClients: vi.fn(), updateClient: vi.fn(),
    searchClients: vi.fn(), findClientByName: vi.fn(), getLogs: vi.fn(),
    getUserById: vi.fn(),
  };
});

import { getSessionUser } from '@/lib/auth';
import {
  getTenantById, getClientById, getInvoiceById, updateInvoice,
  getInvoiceLines, createLog,
  getWithholdingRules, getWithholdingRuleById, createWithholdingRule, updateWithholdingRule,
} from '@/lib/db';
import { GET as getTaxation, PUT as putTaxation } from '@/app/api/agency/invoices/[id]/taxation/route';
import { GET as listRules, POST as createRuleRoute } from '@/app/api/agency/withholding-rules/route';
import { PATCH as patchRule } from '@/app/api/agency/withholding-rules/[id]/route';
import { NextRequest } from 'next/server';

const mockSession = vi.mocked(getSessionUser);
const mockGetTenant = vi.mocked(getTenantById);
const mockGetClient = vi.mocked(getClientById);
const mockGetInvoice = vi.mocked(getInvoiceById);
const mockUpdateInvoice = vi.mocked(updateInvoice);
const mockGetInvoiceLines = vi.mocked(getInvoiceLines);
const mockCreateLog = vi.mocked(createLog);
const mockGetRules = vi.mocked(getWithholdingRules);
const mockGetRuleById = vi.mocked(getWithholdingRuleById);
const mockCreateRule = vi.mocked(createWithholdingRule);
const mockUpdateRule = vi.mocked(updateWithholdingRule);

// ---------- helpers ----------

function requestFor(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3100'), init as ConstructorParameters<typeof NextRequest>[1]);
}

function jsonRequest(url: string, method: string, body: unknown): NextRequest {
  return requestFor(url, { method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
}

function ctxFor(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function tenantFor(tenantId: string, overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: tenantId, name: `Tenant ${tenantId}`, status: 'ACTIVE', plan: 'FREE',
    settings: {}, limits: { maxUsers: 5 }, appMode: 'Agency',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function invoiceFor(tenantId: string, overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-1', tenantId, clientId: 'client-1',
    issueDate: '2026-09-13', dueDate: '2026-09-28', currency: 'INR',
    subtotal: makeMoney(100000), discount: zeroMoney('INR'),
    taxLines: [], taxTotal: zeroMoney('INR'), total: makeMoney(100000),
    amountPaid: zeroMoney('INR'), amountDue: makeMoney(100000),
    status: 'DRAFT', createdBy: 'admin-1',
    createdAt: new Date('2026-09-01'), updatedAt: new Date('2026-09-01'),
    ...overrides,
  };
}

function lineFor(tenantId: string, overrides: Partial<InvoiceLine> = {}): InvoiceLine {
  return {
    id: 'line-1', tenantId, invoiceId: 'inv-1', type: 'MANUAL',
    description: 'IT consulting services',
    classification: { type: 'SAC', code: '998314' },
    amount: makeMoney(100000),
    createdAt: new Date('2026-09-01'), updatedAt: new Date('2026-09-01'),
    ...overrides,
  };
}

function ruleFor(tenantId: string, overrides: Partial<WithholdingRule> = {}): WithholdingRule {
  return {
    id: 'rule-1', tenantId, jurisdiction: 'IN',
    effectiveFrom: '2026-04-01',
    ruleCode: 'IT Act 2025 — TDS on services', rate: 2, threshold: 30000,
    active: true,
    createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

/** Stand up the session + tenant chain for one tenant (admin by default). */
function arrange(
  tenantId: string,
  appMode: Tenant['appMode'] = 'Agency',
  role: TokenPayload['role'] = 'TENANT_ADMIN',
  userId?: string
) {
  const session: TokenPayload = {
    userId: userId ?? `u-${tenantId}`, username: 'tester', role, tenantId,
  };
  mockSession.mockResolvedValue(session);
  mockGetTenant.mockResolvedValue(tenantFor(tenantId, { appMode }));
  return session;
}

beforeEach(() => {
  for (const m of [
    mockSession, mockGetTenant, mockGetClient, mockGetInvoice, mockUpdateInvoice,
    mockGetInvoiceLines, mockCreateLog, mockGetRules, mockGetRuleById,
    mockCreateRule, mockUpdateRule,
  ]) m.mockReset();
  mockCreateLog.mockResolvedValue({} as Awaited<ReturnType<typeof createLog>>);
  // Default: no withholding rules configured — the §28 advisory suggestion
  // path is exercised by its own tests below.
  mockGetRules.mockResolvedValue([]);
});

// ---------- §29 — invoice taxation ----------

describe('Module 11 — invoice taxation API (§29 GET/PUT /api/agency/invoices/:id/taxation)', () => {
  it('GET returns the engine view plus the stored compliance configuration', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetInvoice.mockResolvedValue(invoiceFor(AGENCY_A.tenant.id, {
      placeOfSupply: { country: 'IN', stateOrRegion: 'Karnataka', code: '29' },
    }));
    mockGetInvoiceLines.mockResolvedValue([lineFor(AGENCY_A.tenant.id)]);
    const res = await getTaxation(requestFor('/api/agency/invoices/inv-1/taxation'), ctxFor('inv-1'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.taxation.subtotal.amount).toBe(100000);
    expect(body.taxation.taxableAmount.amount).toBe(100000);
    expect(body.taxation.placeOfSupply.stateOrRegion).toBe('Karnataka');
    expect(body.taxation.classifications).toEqual([
      { lineId: 'line-1', classification: { type: 'SAC', code: '998314' } },
    ]);
    expect(body.gstSuggestion).toBeUndefined(); // no ?rate= → no suggestion
  });

  it('GET with ?rate= adds the ADVISORY GST structure suggestion from stored states', async () => {
    arrange(AGENCY_A.tenant.id);
    // Maharashtra supplier, Karnataka place of supply → inter-state IGST.
    mockGetTenant.mockResolvedValue(tenantFor(AGENCY_A.tenant.id, {
      billingProfile: { legalName: 'Atlas Digital', state: 'Maharashtra' },
    }));
    mockGetClient.mockResolvedValue({
      id: 'client-1', tenantId: AGENCY_A.tenant.id, name: 'Bengaluru Systems',
      taxProfile: { state: 'Karnataka' },
    } as never);
    mockGetInvoice.mockResolvedValue(invoiceFor(AGENCY_A.tenant.id, {
      placeOfSupply: { country: 'IN', stateOrRegion: 'Karnataka' },
    }));
    mockGetInvoiceLines.mockResolvedValue([]);
    const res = await getTaxation(requestFor('/api/agency/invoices/inv-1/taxation?rate=18'), ctxFor('inv-1'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.gstSuggestion.structure).toBe('INTER_STATE');
    expect(body.gstSuggestion.taxes).toEqual([{ type: 'IGST', name: 'IGST', rate: 18 }]);
  });

  it('GET rejects an out-of-range rate parameter', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetInvoice.mockResolvedValue(invoiceFor(AGENCY_A.tenant.id));
    mockGetInvoiceLines.mockResolvedValue([]);
    const res = await getTaxation(requestFor('/api/agency/invoices/inv-1/taxation?rate=150'), ctxFor('inv-1'));
    expect(res.status).toBe(400);
  });

  it('GET carries the §28 ADVISORY withholding suggestions when effective rules match the recipient jurisdiction', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetClient.mockResolvedValue({
      id: 'client-1', tenantId: AGENCY_A.tenant.id, name: 'Bengaluru Systems',
      taxProfile: { country: 'IN', state: 'Karnataka' },
    } as never);
    mockGetInvoice.mockResolvedValue(invoiceFor(AGENCY_A.tenant.id, {
      issueDate: '2026-09-13',
    }));
    mockGetInvoiceLines.mockResolvedValue([lineFor(AGENCY_A.tenant.id)]);
    mockGetRules.mockResolvedValue([
      ruleFor(AGENCY_A.tenant.id), // IN, 2%, threshold 30000, from 2026-04-01, open-ended
      ruleFor(AGENCY_A.tenant.id, { id: 'rule-2', jurisdiction: 'US', rate: 30 }), // wrong jurisdiction — never suggested
    ]);
    const res = await getTaxation(requestFor('/api/agency/invoices/inv-1/taxation'), ctxFor('inv-1'));
    const body = await res.json();
    expect(res.status).toBe(200);
    // §22 — the suggestion is 2% of the TAXABLE value (100000 → 2000), and
    // only the matching-jurisdiction rule appears.
    expect(body.withholdingSuggestions).toHaveLength(1);
    const s = body.withholdingSuggestions[0];
    expect(s.amount.amount).toBe(2000);
    expect(s.amount.currency).toBe('INR');
    expect(s.adjustment.code).toBe('IT Act 2025 — TDS on services');
    expect(s.adjustment.rate).toBe(2);
    expect(s.adjustment.type).toBe('TDS');
    expect(s.rulesVersion).toBe(TAX_RULES_VERSION);
  });

  it('GET never suggests withholding without a stored jurisdiction — no assumed default', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetClient.mockResolvedValue({
      id: 'client-1', tenantId: AGENCY_A.tenant.id, name: 'Somewhere Corp',
      // no taxProfile country — and the invoice has no place of supply either
    } as never);
    mockGetInvoice.mockResolvedValue(invoiceFor(AGENCY_A.tenant.id));
    mockGetInvoiceLines.mockResolvedValue([lineFor(AGENCY_A.tenant.id)]);
    mockGetRules.mockResolvedValue([ruleFor(AGENCY_A.tenant.id)]);
    const res = await getTaxation(requestFor('/api/agency/invoices/inv-1/taxation'), ctxFor('inv-1'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.withholdingSuggestions).toBeUndefined();
    // The rules layer was never even consulted — no jurisdiction to match.
    expect(mockGetRules).not.toHaveBeenCalled();
  });

  it('GET skips rules whose threshold the taxable value does not meet (§19)', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetClient.mockResolvedValue({
      id: 'client-1', tenantId: AGENCY_A.tenant.id, name: 'Bengaluru Systems',
      taxProfile: { country: 'IN', state: 'Karnataka' },
    } as never);
    mockGetInvoice.mockResolvedValue(invoiceFor(AGENCY_A.tenant.id, {
      subtotal: makeMoney(20000), total: makeMoney(20000), amountDue: makeMoney(20000),
    }));
    mockGetInvoiceLines.mockResolvedValue([lineFor(AGENCY_A.tenant.id, {
      id: 'line-small', amount: makeMoney(20000), // below the 30000 threshold
    })]);
    mockGetRules.mockResolvedValue([ruleFor(AGENCY_A.tenant.id)]);
    const res = await getTaxation(requestFor('/api/agency/invoices/inv-1/taxation'), ctxFor('inv-1'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.taxation.taxableAmount.amount).toBe(20000);
    expect(body.withholdingSuggestions).toBeUndefined();
  });

  it('PUT passes the compliance payload through the domain and audits it', async () => {
    const session = arrange(AGENCY_A.tenant.id);
    mockGetInvoice.mockResolvedValue(invoiceFor(AGENCY_A.tenant.id));
    mockGetInvoiceLines.mockResolvedValue([lineFor(AGENCY_A.tenant.id)]);
    mockUpdateInvoice.mockResolvedValue(true);

    const res = await putTaxation(
      jsonRequest('/api/agency/invoices/inv-1/taxation', 'PUT', {
        placeOfSupply: { country: 'IN', stateOrRegion: 'Karnataka', code: '29' },
        taxes: [{ type: 'IGST', name: 'IGST', rate: 18 }],
      }),
      ctxFor('inv-1')
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    const [idArg, tenantArg, write] = mockUpdateInvoice.mock.calls[0]!;
    expect(idArg).toBe('inv-1');
    expect(tenantArg).toBe(AGENCY_A.tenant.id);
    expect(write.placeOfSupply).toEqual({ country: 'IN', stateOrRegion: 'Karnataka', code: '29' });
    expect(write.taxLines![0].type).toBe('IGST');
    expect(write.taxTotal!.amount).toBe(18000);
    expect(mockCreateLog).toHaveBeenCalledWith(
      session.username, 'INVOICE_TAXATION_SET', expect.any(String), AGENCY_A.tenant.id, expect.anything()
    );
  });

  it('PUT with an exemption clears the tax lines (§17 — tax ₹0, not a failed calc)', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetInvoice.mockResolvedValue(invoiceFor(AGENCY_A.tenant.id));
    mockGetInvoiceLines.mockResolvedValue([lineFor(AGENCY_A.tenant.id)]);
    mockUpdateInvoice.mockResolvedValue(true);

    const res = await putTaxation(
      jsonRequest('/api/agency/invoices/inv-1/taxation', 'PUT', {
        exemption: { reason: 'Export of service — zero-rated' },
        taxes: [{ type: 'IGST', name: 'IGST', rate: 18 }],
      }),
      ctxFor('inv-1')
    );
    expect(res.status).toBe(200);
    const write = mockUpdateInvoice.mock.calls[0]![2];
    expect(write.exemption).toEqual({ reason: 'Export of service — zero-rated' });
    expect(write.taxLines).toEqual([]);
    expect(write.taxTotal!.amount).toBe(0);
  });

  it('PUT rejects an invalid compliance payload with one joined 400', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetInvoice.mockResolvedValue(invoiceFor(AGENCY_A.tenant.id));
    const res = await putTaxation(
      jsonRequest('/api/agency/invoices/inv-1/taxation', 'PUT', {
        placeOfSupply: { stateOrRegion: 'Karnataka' }, // country missing
      }),
      ctxFor('inv-1')
    );
    expect(res.status).toBe(400);
    expect(mockUpdateInvoice).not.toHaveBeenCalled();
  });

  it('a foreign tenant\'s invoice is an IDENTICAL 404 (§113)', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetInvoice.mockResolvedValue(null); // B's invoice resolves null through A's scope
    const res = await putTaxation(
      jsonRequest('/api/agency/invoices/b-invoice', 'PUT', { taxes: [] }),
      ctxFor('b-invoice')
    );
    expect(res.status).toBe(404);
    expect(mockUpdateInvoice).not.toHaveBeenCalled();
  });

  it('USER reads taxation (dashboard.read) but cannot write it (invoices.write)', async () => {
    arrange(AGENCY_A.tenant.id, 'Agency', 'USER', AGENCY_A.member.userId);
    mockGetInvoice.mockResolvedValue(invoiceFor(AGENCY_A.tenant.id));
    mockGetInvoiceLines.mockResolvedValue([]);

    const read = await getTaxation(requestFor('/api/agency/invoices/inv-1/taxation'), ctxFor('inv-1'));
    expect(read.status).toBe(200);

    const write = await putTaxation(
      jsonRequest('/api/agency/invoices/inv-1/taxation', 'PUT', { taxes: [] }),
      ctxFor('inv-1')
    );
    expect(write.status).toBe(403);
    expect(mockUpdateInvoice).not.toHaveBeenCalled();
  });

  it('a Standard tenant is turned away with NOT_AGENCY_TENANT', async () => {
    arrange(STANDARD_TENANT.tenant.id, 'Standard');
    const res = await getTaxation(requestFor('/api/agency/invoices/inv-1/taxation'), ctxFor('inv-1'));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('NOT_AGENCY_TENANT');
  });
});

// ---------- §19/§29 — withholding rules ----------

describe('Module 11 — withholding rules API (§29 /api/agency/withholding-rules)', () => {
  it('GET lists the tenant\'s rule configurations with parsed filters', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetRules.mockResolvedValue([ruleFor(AGENCY_A.tenant.id)]);
    const res = await listRules(requestFor('/api/agency/withholding-rules?active=true&jurisdiction=in'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.rules).toHaveLength(1);
    expect(mockGetRules).toHaveBeenCalledWith(AGENCY_A.tenant.id, { active: true, jurisdiction: 'IN' });
  });

  it('POST creates a validated rule and audits WITHHOLDING_RULE_CREATED', async () => {
    const session = arrange(AGENCY_A.tenant.id);
    mockCreateRule.mockResolvedValue(ruleFor(AGENCY_A.tenant.id));
    const res = await createRuleRoute(jsonRequest('/api/agency/withholding-rules', 'POST', {
      jurisdiction: 'in', effectiveFrom: '2026-04-01',
      ruleCode: 'IT Act 2025 — TDS on services', rate: 2, threshold: 30000,
    }));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(mockCreateRule).toHaveBeenCalledWith(AGENCY_A.tenant.id, expect.objectContaining({
      jurisdiction: 'IN', effectiveFrom: '2026-04-01', rate: 2, threshold: 30000,
    }));
    expect(mockCreateLog).toHaveBeenCalledWith(
      session.username, 'WITHHOLDING_RULE_CREATED', expect.any(String), AGENCY_A.tenant.id, expect.anything()
    );
  });

  it('POST requires the effective-dating core (jurisdiction/effectiveFrom/ruleCode/rate)', async () => {
    arrange(AGENCY_A.tenant.id);
    const res = await createRuleRoute(jsonRequest('/api/agency/withholding-rules', 'POST', {
      jurisdiction: 'IN', ruleCode: 'x', // effectiveFrom + rate missing
    }));
    expect(res.status).toBe(400);
    expect(mockCreateRule).not.toHaveBeenCalled();
  });

  it('POST is admin-only (agency.tax.manage)', async () => {
    arrange(AGENCY_A.tenant.id, 'Agency', 'USER', AGENCY_A.member.userId);
    const res = await createRuleRoute(jsonRequest('/api/agency/withholding-rules', 'POST', {
      jurisdiction: 'IN', effectiveFrom: '2026-04-01', ruleCode: 'x', rate: 2,
    }));
    expect(res.status).toBe(403);
    expect(mockCreateRule).not.toHaveBeenCalled();
  });

  it('PATCH partially updates a rule (§19)', async () => {
    const session = arrange(AGENCY_A.tenant.id);
    mockGetRuleById.mockResolvedValue(ruleFor(AGENCY_A.tenant.id));
    mockUpdateRule.mockResolvedValue(true);
    mockGetRuleById.mockResolvedValue(ruleFor(AGENCY_A.tenant.id, { rate: 5 }));

    const res = await patchRule(
      jsonRequest('/api/agency/withholding-rules/rule-1', 'PATCH', { rate: 5 }),
      ctxFor('rule-1')
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.rule.rate).toBe(5);
    expect(mockUpdateRule).toHaveBeenCalledWith('rule-1', AGENCY_A.tenant.id, { rate: 5 });
    expect(mockCreateLog).toHaveBeenCalledWith(
      session.username, 'WITHHOLDING_RULE_UPDATED', expect.any(String), AGENCY_A.tenant.id, expect.anything()
    );
  });

  it('PATCH null clears the window end / threshold (§19 configuration semantics)', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetRuleById.mockResolvedValue(ruleFor(AGENCY_A.tenant.id, { effectiveTo: '2026-09-30' }));
    mockUpdateRule.mockResolvedValue(true);
    mockGetRuleById.mockResolvedValue(ruleFor(AGENCY_A.tenant.id));

    const res = await patchRule(
      jsonRequest('/api/agency/withholding-rules/rule-1', 'PATCH', { effectiveTo: null }),
      ctxFor('rule-1')
    );
    expect(res.status).toBe(200);
    expect(mockUpdateRule).toHaveBeenCalledWith('rule-1', AGENCY_A.tenant.id, { effectiveTo: null });
  });

  it('a foreign tenant\'s rule and a missing rule are IDENTICAL 404s (§113)', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetRuleById.mockResolvedValue(null);
    const res = await patchRule(
      jsonRequest('/api/agency/withholding-rules/b-rule', 'PATCH', { rate: 5 }),
      ctxFor('b-rule')
    );
    expect(res.status).toBe(404);
    expect(mockUpdateRule).not.toHaveBeenCalled();
  });

  it('an empty PATCH is an honest 400, never a phantom no-op', async () => {
    arrange(AGENCY_A.tenant.id);
    mockGetRuleById.mockResolvedValue(ruleFor(AGENCY_A.tenant.id));
    const res = await patchRule(
      jsonRequest('/api/agency/withholding-rules/rule-1', 'PATCH', {}),
      ctxFor('rule-1')
    );
    expect(res.status).toBe(400);
    expect(mockUpdateRule).not.toHaveBeenCalled();
  });
});
