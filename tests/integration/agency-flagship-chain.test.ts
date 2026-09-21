/**
 * Modules 11–14 (§111) — Integration: THE flagship cross-module chain.
 *
 * One tenant, one project, one developer, one client — the ENTIRE money
 * story through the REAL domain services over one in-memory echo store:
 *
 *   rate cards (Module 6, REAL resolution — frozen snapshots §6)
 *   → time entry create/submit/approve (Module 7 — §23 economics)
 *   → expense create/submit/approve (Module 8 — §41 Debit transaction)
 *   → invoice draft → TIME + EXPENSE lines (reservations §63)
 *   → IGST 18% taxation (Module 11 §15 — engine computes every amount)
 *   → finalize: INV-000001, SENT, sources INVOICED (§74/§83)
 *   → payment link (Module 12 §35/§36 — server-resolved amount)
 *   → signed payment_link.paid webhook (§38–§50 — reconciliation, the ONE
 *     writer path, invoice recompute §104, one Credit transaction)
 *   → profitability (Module 13 §63–§82 — one engine, billed/collected/profit)
 *   → receivables (Module 14 §85–§92 — the A/R operating view)
 *
 * Only the Razorpay NETWORK edges are mocked (Bruno cannot reach real
 * Razorpay); every domain service, the rate-resolution engine, the invoice
 * calculation engine, the profitability engine and the receivables engine
 * run for real — and the READER engines (profitability/receivables) read
 * the SAME store the WRITER services wrote, through the mocked connectDb
 * → {db: null} → initLocalDb local-fallback path. If the writers and the
 * readers disagreed about a shape, this test would fail — that is §111.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...actual,
    // ── readers the chain resolves through (tenant-scoped, store-backed) ──
    getTenantById: vi.fn(),
    getUserById: vi.fn(),
    getClientById: vi.fn(),
    getProjectById: vi.fn(),
    getProjects: vi.fn(),
    getProjectMembers: vi.fn(),
    getWorkItemById: vi.fn(),
    getAccountById: vi.fn(),
    // ── Module 6: rate economics (REAL resolution runs over these) ──
    getRateCards: vi.fn(),
    getRateCardById: vi.fn(),
    getRateCardEntryById: vi.fn(),
    listRateCardEntries: vi.fn(),
    listRateEntryVersions: vi.fn(),
    getUserCostAssignments: vi.fn(),
    // ── Module 7: time ──
    getTimeEntries: vi.fn(),
    getTimeEntryById: vi.fn(),
    createTimeEntry: vi.fn(),
    updateTimeEntry: vi.fn(),
    getActiveTimerSession: vi.fn(),
    createTimerSession: vi.fn(),
    updateTimerSession: vi.fn(),
    // ── Module 8: expenses ──
    getExpenses: vi.fn(),
    getExpenseById: vi.fn(),
    createExpense: vi.fn(),
    updateExpense: vi.fn(),
    // ── Module 9/11: invoices ──
    getInvoices: vi.fn(),
    getInvoiceById: vi.fn(),
    createInvoice: vi.fn(),
    updateInvoice: vi.fn(),
    getInvoiceLines: vi.fn(),
    createInvoiceLine: vi.fn(),
    deleteInvoiceLine: vi.fn(),
    getProjectMilestoneById: vi.fn(),
    updateProjectMilestone: vi.fn(),
    allocateInvoiceNumberForFiscalYear: vi.fn(),
    seedInvoiceSequenceFromLegacy: vi.fn(),
    // ── Module 10/12: payments, links, webhook events ──
    getPayments: vi.fn(),
    getPaymentById: vi.fn(),
    createPayment: vi.fn(),
    updatePayment: vi.fn(),
    findPaymentByGatewayId: vi.fn(),
    getPaymentLinks: vi.fn(),
    getPaymentLinkById: vi.fn(),
    createPaymentLink: vi.fn(),
    updatePaymentLink: vi.fn(),
    findPaymentLinkByProviderLinkId: vi.fn(),
    findWebhookEventByProviderEventId: vi.fn(),
    createWebhookEvent: vi.fn(),
    updateWebhookEvent: vi.fn(),
    listRecentWebhookEvents: vi.fn(),
    // ── core ledger + audit ──
    createTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
    createLog: vi.fn(async () => undefined),
    // ── the reader path: the profitability/receivables engines call
    // connectDb directly — mocked to {db: null} below, forcing their
    // initLocalDb fallback onto the SAME live arrays the writer mocks use
    // (§111: one truth, writers and readers). ──
    connectDb: vi.fn(),
    initLocalDb: vi.fn(),
    // ── transitively imported by agency.clients (AuditContext home) ──
    getLogs: vi.fn(), createClient: vi.fn(), getClients: vi.fn(),
    updateClient: vi.fn(), searchClients: vi.fn(), findClientByName: vi.fn(),
  };
});

import {
  getTenantById, getUserById, getClientById,
  getProjectById, getProjects, getProjectMembers, getWorkItemById, getAccountById,
  getRateCards, getRateCardById, getRateCardEntryById,
  listRateCardEntries, listRateEntryVersions, getUserCostAssignments,
  getTimeEntries, getTimeEntryById,
  createTimeEntry as createTimeEntryRepo, updateTimeEntry as updateTimeEntryRepo,
  getExpenses, getExpenseById,
  createExpense as createExpenseRepo, updateExpense as updateExpenseRepo,
  getInvoices, getInvoiceById, createInvoice as createInvoiceRepo,
  updateInvoice as updateInvoiceRepo,
  getInvoiceLines, createInvoiceLine as createInvoiceLineRepo,
  deleteInvoiceLine as deleteInvoiceLineRepo,
  getProjectMilestoneById, updateProjectMilestone as updateProjectMilestoneRepo,
  allocateInvoiceNumberForFiscalYear, seedInvoiceSequenceFromLegacy,
  getPayments, getPaymentById,
  createPayment as createPaymentRepo, updatePayment as updatePaymentRepo,
  findPaymentByGatewayId,
  getPaymentLinks, getPaymentLinkById,
  createPaymentLink as createPaymentLinkRepo,
  updatePaymentLink as updatePaymentLinkRepo,
  findPaymentLinkByProviderLinkId,
  findWebhookEventByProviderEventId, createWebhookEvent, updateWebhookEvent,
  listRecentWebhookEvents,
  createTransaction, deleteTransaction, createLog,
  connectDb, initLocalDb,
  type Tenant, type User, type Client, type Account,
} from '@/lib/db';

import {
  createTimeEntry, submitTimeEntry, approveTimeEntry,
} from '@/lib/agency/domain/agency.time';
import {
  createExpense, submitExpense, approveExpense,
} from '@/lib/agency/domain/agency.expenses';
import {
  createInvoiceDraft, addInvoiceLine, setInvoiceTaxation, finalizeInvoice,
} from '@/lib/agency/domain/agency.invoices';
import { createInvoicePaymentLink } from '@/lib/agency/domain/agency.payment-links';
import { processRazorpayWebhook } from '@/lib/agency/domain/gateway-webhook';
import { razorpayGateway } from '@/lib/agency/domain/razorpay-gateway';
import {
  getProjectProfitabilityReport, getPortfolioProfitability,
} from '@/lib/agency/profitability';
import { getReceivablesMetrics } from '@/lib/agency/queries/receivables-summary';
import type { TimeEntry } from '@/lib/agency/types/time';
import type { Expense } from '@/lib/agency/types/expense';
import type { Invoice, InvoiceLine } from '@/lib/agency/types/invoice';
import type { Payment } from '@/lib/agency/types/payment';
import type { PaymentLink } from '@/lib/agency/types/payment-link';
import type { WebhookEvent } from '@/lib/agency/types/webhook-event';
import type { Project, ProjectMember } from '@/lib/agency/types/project';
import type {
  RateCard, RateCardEntry, RateEntryVersion, UserCostAssignment,
} from '@/lib/agency/types/rate';
import { makeMoney } from '@/lib/agency/types/money';

const T = 'tenant-a';
const SECRET = 'whsec_flagship_chain_test';
const CLIENT_ID = 'client-1';
const PROJECT_ID = 'proj-1';
const ADMIN_ID = 'admin-1';
const DEV_ID = 'dev-1';

const ADMIN_ACTOR = { userId: ADMIN_ID, role: 'TENANT_ADMIN' as const };
const DEV_ACTOR = { userId: DEV_ID, role: 'USER' as const };
const adminAudit = { username: 'a_admin', tenantId: T, log: vi.fn() };
const devAudit = { username: 'a_dev', tenantId: T, log: vi.fn() };

// The ONE echo store: writers write here, the reader engines read here.
const h = vi.hoisted(() => ({
  seq: 0,
  users: [] as Array<Record<string, unknown>>,
  projects: [] as Array<Record<string, unknown>>,
  projectMembers: [] as Array<Record<string, unknown>>,
  workItems: [] as Array<Record<string, unknown>>,
  projectMilestones: [] as Array<Record<string, unknown>>,
  rateCards: [] as Array<Record<string, unknown>>,
  rateCardEntries: [] as Array<Record<string, unknown>>,
  rateEntryVersions: [] as Array<Record<string, unknown>>,
  userCostAssignments: [] as Array<Record<string, unknown>>,
  timeEntries: [] as Array<Record<string, unknown>>,
  timerSessions: [] as Array<Record<string, unknown>>,
  expenses: [] as Array<Record<string, unknown>>,
  invoices: [] as Array<Record<string, unknown>>,
  invoiceLines: [] as Array<Record<string, unknown>>,
  payments: [] as Array<Record<string, unknown>>,
  paymentLinks: [] as Array<Record<string, unknown>>,
  webhookEvents: [] as Array<Record<string, unknown>>,
  transactions: [] as Array<Record<string, unknown>>,
  deletedTx: [] as string[],
  invoiceNumberSeq: new Map<string, number>(),
  gatewayPayments: new Map<string, { status: string; amount: number; currency: string; capturedAt: string }>(),
}));

/** Merge a patch into a stored row (undefined skipped, null kept). */
function applyPatch(row: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) row[k] = v;
  }
  row.updatedAt = new Date();
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const arr of [
    h.users, h.projects, h.projectMembers, h.workItems, h.projectMilestones,
    h.rateCards, h.rateCardEntries, h.rateEntryVersions, h.userCostAssignments,
    h.timeEntries, h.timerSessions, h.expenses, h.invoices, h.invoiceLines,
    h.payments, h.paymentLinks, h.webhookEvents, h.transactions,
  ]) arr.length = 0;
  h.deletedTx.length = 0;
  h.invoiceNumberSeq.clear();
  h.gatewayPayments.clear();
  h.seq = 0;

  // ── the seeded world (Module 1–6 configuration) ─────────────────────────
  h.users.push(
    { id: ADMIN_ID, username: 'a_admin', passwordHash: 'x', role: 'TENANT_ADMIN', tenantId: T, createdAt: new Date('2026-01-01') },
    { id: DEV_ID, username: 'a_dev', passwordHash: 'x', role: 'USER', tenantId: T, createdAt: new Date('2026-01-01') },
  );
  h.projects.push({
    id: PROJECT_ID, tenantId: T, clientId: CLIENT_ID, name: 'Flagship Project',
    status: 'ACTIVE', billingModel: 'TIME_AND_MATERIALS', currency: 'INR',
    projectManagerId: ADMIN_ID, startDate: '2026-08-01',
    createdAt: new Date('2026-08-01'), updatedAt: new Date('2026-08-01'),
  });
  h.projectMembers.push({
    id: 'pm-1', tenantId: T, projectId: PROJECT_ID, userId: DEV_ID,
    role: 'Developer', active: true, createdAt: new Date('2026-08-01'),
  });
  // Module 6 — the rate economics: cost ₹900/hr (user assignment), billing
  // ₹2,500/hr (the client's card), both effective-dated and open-ended.
  h.rateCards.push(
    { id: 'card-cost', tenantId: T, name: 'Org Cost Card', type: 'COST', currency: 'INR', scope: 'ORGANIZATION', status: 'ACTIVE', createdAt: new Date('2026-01-01') },
    { id: 'card-bill', tenantId: T, name: 'Acme Billing Card', type: 'BILLING', currency: 'INR', scope: 'CLIENT', clientId: CLIENT_ID, status: 'ACTIVE', createdAt: new Date('2026-01-01') },
  );
  h.rateCardEntries.push(
    { id: 'entry-cost-dev', tenantId: T, rateCardId: 'card-cost', name: 'Developer', role: 'Developer', unit: 'HOUR', amount: 900, currency: 'INR', billable: false, billingType: 'NON_BILLABLE', createdAt: new Date('2026-01-01') },
    { id: 'entry-bill-dev', tenantId: T, rateCardId: 'card-bill', name: 'Developer', role: 'Developer', unit: 'HOUR', amount: 2500, currency: 'INR', billable: true, billingType: 'HOURLY', createdAt: new Date('2026-01-01') },
  );
  h.rateEntryVersions.push(
    { id: 'ver-cost-1', tenantId: T, rateCardId: 'card-cost', rateCardEntryId: 'entry-cost-dev', amount: 900, currency: 'INR', effectiveFrom: '2026-01-01', effectiveTo: null, createdAt: new Date('2026-01-01') },
    { id: 'ver-bill-1', tenantId: T, rateCardId: 'card-bill', rateCardEntryId: 'entry-bill-dev', amount: 2500, currency: 'INR', effectiveFrom: '2026-01-01', effectiveTo: null, createdAt: new Date('2026-01-01') },
  );
  h.userCostAssignments.push({
    id: 'assign-dev', tenantId: T, userId: DEV_ID, rateCardId: 'card-cost',
    rateCardEntryId: 'entry-cost-dev', effectiveFrom: '2026-01-01',
    effectiveTo: null, createdAt: new Date('2026-01-01'),
  });

  // ── the store view the READER engines see (§111: one truth) ─────────────
  vi.mocked(initLocalDb).mockImplementation(() => ({
    tenants: [], users: h.users, accounts: [], transactions: h.transactions,
    categories: [], budgets: [], recurring: [], clients: [], logs: [],
    flags: [], tickets: [], broadcasts: [], subscribers: [], incidents: [], maintenances: [],
    projects: h.projects, projectMembers: h.projectMembers, workItems: h.workItems,
    projectMilestones: h.projectMilestones,
    rateCards: h.rateCards, rateCardEntries: h.rateCardEntries,
    rateEntryVersions: h.rateEntryVersions, userCostAssignments: h.userCostAssignments,
    timeEntries: h.timeEntries, timerSessions: h.timerSessions,
    expenses: h.expenses,
    invoices: h.invoices, invoiceLines: h.invoiceLines, invoiceCounters: [],
    payments: h.payments,
    taxProfiles: [], withholdingRules: [], invoiceSequences: [],
    paymentLinks: h.paymentLinks, webhookEvents: h.webhookEvents,
  } as unknown as ReturnType<typeof initLocalDb>));
  vi.mocked(connectDb).mockImplementation(async () => ({ db: null }) as Awaited<ReturnType<typeof connectDb>>);

  // ── reference readers (tenant-scoped, like the real repositories) ───────
  vi.mocked(getTenantById).mockImplementation(async (id: string) =>
    (id === T ? {
      id: T, name: 'Agency A', status: 'ACTIVE', plan: 'FREE', appMode: 'Agency',
      settings: {}, limits: { maxUsers: 10 },
      billingProfile: {
        invoicePrefix: 'INV', state: 'Maharashtra', country: 'India',
        taxIdentifiers: [{ type: 'GSTIN', value: '27AAAPL1234C1ZV', country: 'India' }],
      },
      createdAt: new Date('2026-01-01'),
    } : null) as unknown as Tenant | null);
  vi.mocked(getUserById).mockImplementation(async (id: string) =>
    (h.users.find(u => u.id === id) ?? null) as unknown as User | null);
  vi.mocked(getClientById).mockImplementation(async (id: string, t: string) =>
    (id === CLIENT_ID && t === T ? {
      id: CLIENT_ID, tenantId: T, name: 'Acme Corp', legalName: 'Acme Corporation Pvt Ltd',
      status: 'ACTIVE',
      billingProfile: { currency: 'INR', country: 'India', state: 'Karnataka' },
      taxProfile: {
        country: 'India', state: 'Karnataka', taxTreatment: 'B2B',
        taxIdentifiers: [{ type: 'GSTIN', value: '29AAACR5055K1Z6', country: 'India' }],
      },
      createdAt: new Date('2026-01-01'),
    } : null) as unknown as Client | null);
  vi.mocked(getProjectById).mockImplementation(async (id: string, t?: string) =>
    (h.projects.find(p => p.id === id && (t === undefined || p.tenantId === t)) ?? null) as unknown as Awaited<ReturnType<typeof getProjectById>>);
  vi.mocked(getProjects).mockImplementation(async (t: string, _options: unknown, filters?: { clientId?: string; status?: string }) =>
    h.projects.filter(p => p.tenantId === t
      && (!filters?.clientId || p.clientId === filters.clientId)
      && (!filters?.status || p.status === filters.status)) as unknown as Awaited<ReturnType<typeof getProjects>>);
  vi.mocked(getProjectMembers).mockImplementation(async (projectId: string, t: string) =>
    h.projectMembers.filter(m => m.projectId === projectId && m.tenantId === t) as unknown as Awaited<ReturnType<typeof getProjectMembers>>);
  vi.mocked(getWorkItemById).mockResolvedValue(null);
  vi.mocked(getAccountById).mockImplementation(async (id: string) =>
    (id === 'acct-1' ? { id: 'acct-1', tenantId: T, name: 'HDFC Current', type: 'Bank' } : null) as unknown as Account | null);

  // ── Module 6 rate readers (REAL resolution runs over these) ─────────────
  vi.mocked(getRateCards).mockImplementation(async (t: string, filters?: { type?: string; scope?: string; clientId?: string }) =>
    h.rateCards.filter(c => c.tenantId === t
      && (!filters?.type || c.type === filters.type)
      && (!filters?.scope || c.scope === filters.scope)
      && (!filters?.clientId || c.clientId === filters.clientId)) as unknown as Awaited<ReturnType<typeof getRateCards>>);
  vi.mocked(getRateCardById).mockImplementation(async (id: string, t: string) =>
    (h.rateCards.find(c => c.id === id && c.tenantId === t) ?? null) as unknown as RateCard | null);
  vi.mocked(getRateCardEntryById).mockImplementation(async (entryId: string, cardId: string, t: string) =>
    (h.rateCardEntries.find(e => e.id === entryId && e.rateCardId === cardId && e.tenantId === t) ?? null) as unknown as RateCardEntry | null);
  vi.mocked(listRateCardEntries).mockImplementation(async (cardId: string, t: string) =>
    h.rateCardEntries.filter(e => e.rateCardId === cardId && e.tenantId === t) as unknown as Awaited<ReturnType<typeof listRateCardEntries>>);
  vi.mocked(listRateEntryVersions).mockImplementation(async (t: string, cardId: string, entryIdArg?: string) => {
    const entryId = entryIdArg ?? null;
    return h.rateEntryVersions.filter(v => v.tenantId === t && v.rateCardId === cardId
      && (entryId === null || v.rateCardEntryId === entryId)) as unknown as Awaited<ReturnType<typeof listRateEntryVersions>>;
  });
  vi.mocked(getUserCostAssignments).mockImplementation(async (userId: string, t: string) =>
    h.userCostAssignments.filter(a => a.userId === userId && a.tenantId === t) as unknown as Awaited<ReturnType<typeof getUserCostAssignments>>);

  // ── Module 7 time writers ───────────────────────────────────────────────
  vi.mocked(getTimeEntries).mockImplementation(async (t: string, filtersArg?: unknown) => {
    const filters = (filtersArg ?? {}) as Record<string, unknown>;
    return h.timeEntries.filter(e => e.tenantId === t
      && (!filters.projectId || e.projectId === filters.projectId)
      && (!filters.userId || e.userId === filters.userId)
      && (!filters.approvalStatus || e.approvalStatus === filters.approvalStatus)
      && (!filters.billingStatus || e.billingStatus === filters.billingStatus)) as unknown as Awaited<ReturnType<typeof getTimeEntries>>;
  });
  vi.mocked(getTimeEntryById).mockImplementation(async (id: string, t: string) =>
    (h.timeEntries.find(e => e.id === id && e.tenantId === t) ?? null) as unknown as TimeEntry | null);
  vi.mocked(createTimeEntryRepo).mockImplementation(async (t: string, inputArg: unknown) => {
    const input = inputArg as Record<string, unknown>;
    h.seq += 1;
    const entry = {
      ...input, id: `entry-${h.seq}`, tenantId: t,
      approvalStatus: 'DRAFT', billingStatus: 'UNBILLED',
      createdAt: new Date(), updatedAt: new Date(),
    };
    h.timeEntries.push(entry);
    return entry as unknown as TimeEntry;
  });
  vi.mocked(updateTimeEntryRepo).mockImplementation(async (id: string, _t: string, updates: Record<string, unknown>) => {
    const e = h.timeEntries.find(x => x.id === id);
    if (!e) return false;
    applyPatch(e, updates);
    return true;
  });

  // ── Module 8 expense writers ────────────────────────────────────────────
  vi.mocked(getExpenses).mockImplementation(async (t: string, filtersArg?: unknown) => {
    const filters = (filtersArg ?? {}) as Record<string, unknown>;
    return h.expenses.filter(e => e.tenantId === t
      && (!filters.projectId || e.projectId === filters.projectId)
      && (!filters.status || e.status === filters.status)
      && (!filters.billingStatus || e.billingStatus === filters.billingStatus)) as unknown as Awaited<ReturnType<typeof getExpenses>>;
  });
  vi.mocked(getExpenseById).mockImplementation(async (id: string, t: string) =>
    (h.expenses.find(e => e.id === id && e.tenantId === t) ?? null) as unknown as Expense | null);
  vi.mocked(createExpenseRepo).mockImplementation(async (t: string, inputArg: unknown) => {
    const input = inputArg as Record<string, unknown>;
    h.seq += 1;
    const expense = {
      ...input, id: `exp-${h.seq}`, tenantId: t,
      status: 'DRAFT', billingStatus: 'UNBILLED',
      createdAt: new Date(), updatedAt: new Date(),
    };
    h.expenses.push(expense);
    return expense as unknown as Expense;
  });
  vi.mocked(updateExpenseRepo).mockImplementation(async (id: string, _t: string, updates: Record<string, unknown>) => {
    const e = h.expenses.find(x => x.id === id);
    if (!e) return false;
    applyPatch(e, updates);
    return true;
  });

  // ── Module 9/11 invoice writers ─────────────────────────────────────────
  vi.mocked(getInvoices).mockImplementation(async (t: string, filtersArg?: unknown) => {
    const filters = (filtersArg ?? {}) as Record<string, unknown>;
    return h.invoices.filter(i => i.tenantId === t
      && (!filters.clientId || i.clientId === filters.clientId)
      && (!filters.projectId || i.projectId === filters.projectId)
      && (!filters.status || i.status === filters.status)) as unknown as Awaited<ReturnType<typeof getInvoices>>;
  });
  vi.mocked(getInvoiceById).mockImplementation(async (id: string, t: string) =>
    (h.invoices.find(i => i.id === id && i.tenantId === t) ?? null) as unknown as Invoice | null);
  vi.mocked(createInvoiceRepo).mockImplementation(async (t: string, inputArg: unknown) => {
    const input = inputArg as Record<string, unknown>;
    h.seq += 1;
    const invoice = {
      status: 'DRAFT', invoiceNumber: null,
      ...input,
      amountPaid: input.amountPaid ?? makeMoney(0, String(input.currency ?? 'INR')),
      id: `inv-${h.seq}`, tenantId: t,
      createdAt: new Date(), updatedAt: new Date(),
    };
    h.invoices.push(invoice);
    return invoice as unknown as Invoice;
  });
  vi.mocked(updateInvoiceRepo).mockImplementation(async (id: string, _t: string, patch: Record<string, unknown>) => {
    const i = h.invoices.find(x => x.id === id);
    if (!i) return false;
    applyPatch(i, patch);
    return true;
  });
  vi.mocked(getInvoiceLines).mockImplementation(async (invoiceId: string, t: string) =>
    h.invoiceLines.filter(l => l.invoiceId === invoiceId && l.tenantId === t) as unknown as InvoiceLine[]);
  vi.mocked(createInvoiceLineRepo).mockImplementation(async (t: string, inputArg: unknown) => {
    const input = inputArg as Record<string, unknown>;
    h.seq += 1;
    const line = { ...input, id: `line-${h.seq}`, tenantId: t, createdAt: new Date() };
    h.invoiceLines.push(line);
    return line as unknown as InvoiceLine;
  });
  vi.mocked(deleteInvoiceLineRepo).mockImplementation(async (lineId: string, _t: string) => {
    const idx = h.invoiceLines.findIndex(l => l.id === lineId);
    if (idx === -1) return false;
    h.invoiceLines.splice(idx, 1);
    return true;
  });
  vi.mocked(getProjectMilestoneById).mockResolvedValue(null);
  vi.mocked(updateProjectMilestoneRepo).mockImplementation(async () => true);
  // §74 — the FY-scoped sequence: an atomic increment, like the real $inc.
  vi.mocked(allocateInvoiceNumberForFiscalYear).mockImplementation(async (t: string, fy: string, prefixArg?: string) => {
    const prefix = prefixArg ?? 'INV';
    const key = `${t}|${fy}|${prefix}`;
    const next = (h.invoiceNumberSeq.get(key) ?? 0) + 1;
    h.invoiceNumberSeq.set(key, next);
    return next;
  });
  vi.mocked(seedInvoiceSequenceFromLegacy).mockImplementation(async () => undefined as never);

  // ── Module 10/12 payment, link and webhook-event writers ────────────────
  vi.mocked(getPayments).mockImplementation(async (_t: string, filters?: { invoiceId?: string }) =>
    h.payments.filter(p => !filters?.invoiceId || p.invoiceId === filters.invoiceId) as unknown as Awaited<ReturnType<typeof getPayments>>);
  vi.mocked(getPaymentById).mockImplementation(async (id: string) =>
    (h.payments.find(p => p.id === id) ?? null) as unknown as Payment | null);
  vi.mocked(createPaymentRepo).mockImplementation(async (t: string, inputArg: unknown) => {
    const input = inputArg as Record<string, unknown>;
    h.seq += 1;
    const payment = {
      ...input, id: `pay-${h.seq}`, tenantId: t, status: 'PENDING',
      createdAt: new Date(), updatedAt: new Date(),
    };
    h.payments.push(payment);
    return payment as unknown as Payment;
  });
  vi.mocked(updatePaymentRepo).mockImplementation(async (id: string, _t: string, patch: Record<string, unknown>) => {
    const p = h.payments.find(x => x.id === id);
    if (!p) return false;
    applyPatch(p, patch);
    return true;
  });
  vi.mocked(findPaymentByGatewayId).mockImplementation(async (gateway: string, gatewayPaymentId: string) =>
    (h.payments.find(p => p.gateway === gateway && p.gatewayPaymentId === gatewayPaymentId) ?? null) as unknown as Payment | null);
  vi.mocked(getPaymentLinks).mockImplementation(async (t: string, filtersArg?: unknown) => {
    const filters = (filtersArg ?? {}) as Record<string, unknown>;
    return h.paymentLinks.filter(l => l.tenantId === t
      && (!filters.invoiceId || l.invoiceId === filters.invoiceId)) as unknown as Awaited<ReturnType<typeof getPaymentLinks>>;
  });
  vi.mocked(getPaymentLinkById).mockImplementation(async (id: string, t: string) =>
    (h.paymentLinks.find(l => l.id === id && l.tenantId === t) ?? null) as unknown as PaymentLink | null);
  vi.mocked(createPaymentLinkRepo).mockImplementation(async (t: string, inputArg: unknown) => {
    const input = inputArg as Record<string, unknown>;
    h.seq += 1;
    const link = {
      ...input, id: `link-${h.seq}`, tenantId: t, status: 'CREATED',
      createdAt: new Date(), updatedAt: new Date(),
    };
    h.paymentLinks.push(link);
    return link as unknown as PaymentLink;
  });
  vi.mocked(updatePaymentLinkRepo).mockImplementation(async (id: string, _t: string, patch: Record<string, unknown>) => {
    const l = h.paymentLinks.find(x => x.id === id);
    if (!l) return false;
    applyPatch(l, patch);
    return true;
  });
  vi.mocked(findPaymentLinkByProviderLinkId).mockImplementation(async (providerLinkId: string) =>
    (h.paymentLinks.find(l => l.providerLinkId === providerLinkId) ?? null) as unknown as PaymentLink | null);
  // §42 — the WebhookEvent store, with real replay semantics.
  vi.mocked(findWebhookEventByProviderEventId).mockImplementation(
    async (_provider: string, providerEventId: string) =>
      (h.webhookEvents.find(e => e.providerEventId === providerEventId) ?? null) as unknown as WebhookEvent | null);
  vi.mocked(createWebhookEvent).mockImplementation(async (inputArg: unknown) => {
    const input = inputArg as Record<string, unknown>;
    if (h.webhookEvents.some(e => e.providerEventId === input.providerEventId)) return null;
    const row = {
      id: `we-${h.webhookEvents.length + 1}`,
      ...input, receivedAt: new Date(), processingStatus: 'RECEIVED',
    };
    h.webhookEvents.push(row);
    return row as unknown as WebhookEvent;
  });
  vi.mocked(updateWebhookEvent).mockImplementation(async (id: string, patchArg: unknown) => {
    const row = h.webhookEvents.find(e => e.id === id);
    if (!row) return false;
    applyPatch(row, patchArg as Record<string, unknown>);
    return true;
  });
  vi.mocked(listRecentWebhookEvents).mockImplementation(
    async (filters: { tenantId?: string } = {}, limit = 50) =>
      h.webhookEvents.filter(e => filters.tenantId === undefined || e.tenantId === filters.tenantId).slice(0, limit) as unknown as Awaited<ReturnType<typeof listRecentWebhookEvents>>
  );

  // ── the core ledger ─────────────────────────────────────────────────────
  vi.mocked(createTransaction).mockImplementation(async (data: Record<string, unknown>) => {
    h.seq += 1;
    const tx = { ...data, id: `tx-${h.seq}` };
    h.transactions.push(tx);
    return tx as Awaited<ReturnType<typeof createTransaction>>;
  });
  vi.mocked(deleteTransaction).mockImplementation(async (id: string) => {
    h.deletedTx.push(id);
    return true;
  });

  // ── the Razorpay NETWORK edges — everything else is the real code ───────
  process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;
  vi.spyOn(razorpayGateway, 'createPaymentLink').mockImplementation(async (request: { amount: { amount: number }; invoiceId: string }) => {
    h.seq += 1;
    const gatewayLinkId = `plink_${h.seq}`;
    h.gatewayPayments.set(`pay_for_${gatewayLinkId}`, {
      status: 'captured', amount: request.amount.amount, currency: 'INR',
      capturedAt: '2026-09-13T04:00:00.000Z',
    });
    return { ok: true, status: 200, data: { gatewayLinkId, url: `https://rzp.io/i/${gatewayLinkId}` } };
  });
  vi.spyOn(razorpayGateway, 'getPayment').mockImplementation(async (gatewayPaymentId: string) => {
    const found = h.gatewayPayments.get(gatewayPaymentId);
    if (!found) return { ok: false, status: 404, error: 'not found' };
    return {
      ok: true, status: 200,
      data: {
        gatewayPaymentId, status: found.status,
        amount: { amount: found.amount, currency: found.currency },
        capturedAt: found.capturedAt,
      },
    };
  });
});

afterEach(() => {
  delete process.env.RAZORPAY_WEBHOOK_SECRET;
  vi.restoreAllMocks();
});

const sign = (body: string) => createHmac('sha256', SECRET).update(body, 'utf8').digest('hex');

/** The webhook Razorpay sends when the client completes a hosted checkout. */
const linkPaidBody = (gatewayPaymentId: string, plinkId: string) => JSON.stringify({
  event: 'payment_link.paid',
  payload: {
    payment_link: { entity: { id: plinkId, amount: 999999999 } }, // the §113 lie
    payment: { entity: { id: gatewayPaymentId, amount: 999999999 } },
  },
});

describe('§111 — the flagship chain: work → invoice → tax → collect → profit → receivables', () => {
  it('runs the ENTIRE money story through the real domain services, and every surface agrees', async () => {
    // ── Phase 1: delivery economics (Modules 6+7 — real rate resolution) ──
    const created = await createTimeEntry(T, {
      projectId: PROJECT_ID, date: '2026-09-01', durationMinutes: 240,
      billable: true, notes: 'Flagship sprint',
    }, devAudit, DEV_ACTOR);
    expect(created.ok).toBe(true);
    if (!created.ok || !created.data) return;
    const entry = created.data;
    // §6 — both rate sides FROZEN at creation, provenance attached (§95).
    expect(entry.approvalStatus).toBe('DRAFT');
    expect(entry.billingStatus).toBe('UNBILLED');
    expect(entry.costRateSnapshot).toMatchObject({ amount: 900, currency: 'INR', unit: 'HOUR', source: 'USER_COST_ASSIGNMENT' });
    expect(entry.billingRateSnapshot).toMatchObject({ amount: 2500, currency: 'INR', unit: 'HOUR', source: 'CLIENT_RATE_CARD' });
    expect(entry.financialStatus).toBe('READY');

    await submitTimeEntry(entry.id!, T, devAudit, DEV_ACTOR);
    const approved = await approveTimeEntry(entry.id!, T, adminAudit, ADMIN_ACTOR);
    expect(approved.ok).toBe(true);
    // §23 — economics from the frozen snapshots: 4h × ₹900 cost, 4h × ₹2,500 value.
    expect(approved.data).toMatchObject({
      approvalStatus: 'APPROVED',
      calculatedCost: makeMoney(3600),
      calculatedBillableAmount: makeMoney(10000),
    });

    // ── Phase 2: the expense (Module 8 — cost + marked-up client charge) ──
    const expenseResult = await createExpense(T, DEV_ACTOR, {
      projectId: PROJECT_ID, vendorName: 'AWS', description: 'Hosting for September',
      amount: 5000, currency: 'INR', expenseType: 'BILLABLE', billable: true,
      markupPercent: 20, expenseDate: '2026-09-02',
    }, devAudit);
    expect(expenseResult.ok).toBe(true);
    if (!expenseResult.ok || !expenseResult.data) return;
    const expense = expenseResult.data;
    // §43/§44 — 5,000 × 1.20 = 6,000, one final rounding.
    expect(expense.clientChargeAmount).toEqual(makeMoney(6000));

    await submitExpense(expense.id!, T, DEV_ACTOR, devAudit);
    const approvedExpense = await approveExpense(expense.id!, T, ADMIN_ACTOR, adminAudit);
    expect(approvedExpense.ok).toBe(true);
    expect(approvedExpense.data?.status).toBe('APPROVED');
    // §41/§42 — exactly ONE core Debit transaction at approval.
    expect(h.transactions).toHaveLength(1);
    expect(h.transactions[0]).toMatchObject({ type: 'Debit', amount: 5000 });

    // ── Phase 3: the invoice (Modules 9+11 — lines, IGST, the number) ────
    const draftResult = await createInvoiceDraft(T, ADMIN_ACTOR, {
      clientId: CLIENT_ID, projectId: PROJECT_ID,
      issueDate: '2026-09-10', dueDate: '2026-09-30', currency: 'INR',
    }, adminAudit);
    expect(draftResult.ok).toBe(true);
    if (!draftResult.ok || !draftResult.data) return;
    const draft = draftResult.data;
    expect(draft.status).toBe('DRAFT');
    expect(draft.invoiceNumber).toBeNull(); // §74 — no number until finalization

    const timeLine = await addInvoiceLine(draft.id!, T, ADMIN_ACTOR, {
      type: 'TIME', sourceId: entry.id!, description: 'Sprint 1 delivery',
    }, adminAudit);
    expect(timeLine.ok).toBe(true);
    expect(timeLine.data?.line.amount).toEqual(makeMoney(10000)); // frozen source money

    const expenseLine = await addInvoiceLine(draft.id!, T, ADMIN_ACTOR, {
      type: 'EXPENSE', sourceId: expense.id!, description: 'Hosting pass-through +20%',
    }, adminAudit);
    expect(expenseLine.ok).toBe(true);
    expect(expenseLine.data?.line.amount).toEqual(makeMoney(6000));

    // §63 — both sources now hold this draft's reservation.
    expect(h.timeEntries[0]).toMatchObject({ billingStatus: 'RESERVED', reservedInvoiceId: draft.id });
    expect(h.expenses[0]).toMatchObject({ billingStatus: 'RESERVED', reservedInvoiceId: draft.id });

    // §15/§78 — IGST 18% (inter-state): the ENGINE computes every amount.
    const taxation = await setInvoiceTaxation(draft.id!, T, {
      taxes: [{ type: 'IGST', name: 'IGST', rate: 18 }],
      placeOfSupply: { country: 'India', stateOrRegion: 'Karnataka' },
    }, adminAudit);
    expect(taxation.ok).toBe(true);
    const taxed = taxation.data!;
    expect(taxed.subtotal).toEqual(makeMoney(16000));
    expect(taxed.taxLines[0]).toMatchObject({ type: 'IGST', rate: 18 });
    expect(taxed.taxLines[0].amount).toEqual(makeMoney(2880));
    expect(taxed.taxTotal).toEqual(makeMoney(2880));
    expect(taxed.total).toEqual(makeMoney(18880));
    expect(taxed.amountDue).toEqual(makeMoney(18880));

    // §74/§79/§83 — finalization: the number, SENT, sources locked INVOICED.
    const finalized = await finalizeInvoice(draft.id!, T, ADMIN_ACTOR, adminAudit);
    expect(finalized.ok).toBe(true);
    const invoice = finalized.data!;
    expect(invoice.status).toBe('SENT');
    expect(invoice.invoiceNumber).toBe('INV000001'); // prefix 'INV' + 6-digit pad
    expect(invoice.total).toEqual(makeMoney(18880));
    // §26/§27 — GST lines + GSTINs on both sides ⇒ e-invoice readiness PENDING.
    expect(invoice.eInvoice).toMatchObject({ status: 'PENDING' });
    // §61 lineage — the sources point at their invoice.
    expect(h.timeEntries[0]).toMatchObject({ billingStatus: 'INVOICED', invoiceId: draft.id });
    expect(h.expenses[0]).toMatchObject({ billingStatus: 'INVOICED', invoiceId: draft.id });
    const invoiceId = invoice.id!;

    // ── Phase 4a: profitability BEFORE collection (Module 13) ─────────────
    const before = await getProjectProfitabilityReport(T, PROJECT_ID);
    expect(before).not.toBeNull();
    const p0 = before!.profitability;
    expect(p0.revenueModel).toBe('TIME_MATERIALS');
    expect(p0.applicableRevenue).toEqual(makeMoney(10000)); // §62 — earned time value
    expect(p0.laborCost).toEqual(makeMoney(3600));          // §63 — snapshot cost
    expect(p0.expenseCost).toEqual(makeMoney(5000));
    expect(p0.deliveryCost).toEqual(makeMoney(8600));
    expect(p0.grossProfit).toEqual(makeMoney(1400));        // §64
    expect(p0.marginPercent).toBeCloseTo(14, 10);          // §65
    expect(p0.billedAmount).toEqual(makeMoney(18880));      // §66 dim 4
    expect(p0.collectedAmount).toEqual(makeMoney(0));       // §66 dim 5 — no cash yet
    expect(p0.outstandingAmount).toEqual(makeMoney(18880));
    expect(p0.unbilledAmount).toEqual(makeMoney(0));        // §67 — everything invoiced
    expect(p0.actualHours).toBe(4);
    // §78 — the drill-down: labor by member (frozen rate), expenses by vendor.
    const laborLine = before!.drillDown.labor[0];
    expect(laborLine).toMatchObject({ minutes: 240, cost: makeMoney(3600) });
    const vendorLine = before!.drillDown.expenses[0];
    expect(vendorLine).toMatchObject({ vendorName: 'AWS', cost: makeMoney(5000) });

    // ── Phase 4b: receivables BEFORE collection (Module 14) ───────────────
    const ar0 = await getReceivablesMetrics(T, '2026-09-14');
    expect(ar0.outstanding).toBe(18880);
    expect(ar0.openInvoiceCount).toBe(1);
    expect(ar0.overdueCount).toBe(0);
    expect(ar0.byAgingBucket.CURRENT).toBe(18880); // due 2026-09-30
    expect(ar0.byClient[0]).toMatchObject({ clientId: CLIENT_ID, outstanding: 18880 });
    expect(ar0.invoices[0]).toMatchObject({ invoiceId, invoiceNumber: 'INV000001' });

    // ── Phase 5: collection (Module 12 — link + signed webhook) ───────────
    const linkResult = await createInvoicePaymentLink(T, ADMIN_ACTOR, invoiceId, {}, adminAudit);
    expect(linkResult.ok).toBe(true);
    if (!linkResult.ok || !linkResult.data) return;
    const link = linkResult.data;
    expect(link.amount).toEqual(makeMoney(18880)); // §36 — server-resolved amountDue
    expect(link.status).toBe('CREATED');

    const raw = linkPaidBody(`pay_for_${link.providerLinkId}`, link.providerLinkId);
    const webhook = await processRazorpayWebhook(raw, sign(raw));
    expect(webhook).toMatchObject({ outcome: 'CONFIRMED', status: 200, paymentId: expect.any(String) });

    // §52/§96/§104 — ONE payment, CONFIRMED + RECONCILED, invoice recomputed.
    expect(h.payments).toHaveLength(1);
    expect(h.payments[0]).toMatchObject({
      status: 'CONFIRMED', reconciliationStatus: 'RECONCILED', source: 'RAZORPAY',
      method: 'RAZORPAY', gateway: 'RAZORPAY', invoiceId,
    });
    expect(h.payments[0].amount).toEqual(makeMoney(18880));
    // §47 — the link lineage rides on the payment.
    expect(h.payments[0].gatewayLinkId).toBe(link.providerLinkId);
    // The invoice landed PAID with the centralized balance (§104).
    expect(h.invoices[0]).toMatchObject({
      status: 'PAID', invoiceNumber: 'INV000001',
      amountPaid: makeMoney(18880), amountDue: makeMoney(0),
    });
    // §41 — the link reflects the collection.
    expect(h.paymentLinks[0].status).toBe('PAID');
    // The core ledger: the expense Debit + the collection Credit, nothing else.
    expect(h.transactions).toHaveLength(2);
    expect(h.transactions.filter(t => t.type === 'Debit')).toHaveLength(1);
    const credit = h.transactions.find(t => t.type === 'Credit');
    expect(credit).toMatchObject({ amount: 18880 });

    // ── Phase 6: every money surface now AGREES (§111's whole point) ──────
    const after = await getProjectProfitabilityReport(T, PROJECT_ID);
    const p1 = after!.profitability;
    // §66 — collected cash NEVER enters the profit formulas: unchanged.
    expect(p1.applicableRevenue).toEqual(makeMoney(10000));
    expect(p1.deliveryCost).toEqual(makeMoney(8600));
    expect(p1.grossProfit).toEqual(makeMoney(1400));
    expect(p1.marginPercent).toBeCloseTo(14, 10);
    // …but the cash dimensions moved.
    expect(p1.collectedAmount).toEqual(makeMoney(18880));
    expect(p1.outstandingAmount).toEqual(makeMoney(0));

    const ar1 = await getReceivablesMetrics(T, '2026-09-14');
    expect(ar1.outstanding).toBe(0);              // PAID is not open (§79)
    expect(ar1.openInvoiceCount).toBe(0);
    expect(ar1.overdueCount).toBe(0);
    expect(ar1.invoices).toHaveLength(0);

    // The portfolio view — the SAME rows, rolled up (§80/§81 — one engine).
    const portfolio = await getPortfolioProfitability(T);
    expect(portfolio.projects).toHaveLength(1);
    expect(portfolio.projects[0]).toMatchObject({
      projectId: PROJECT_ID, grossProfit: makeMoney(1400), collectedAmount: makeMoney(18880),
    });
    expect(portfolio.summary.projectCount).toBe(1);
    expect(portfolio.summary.collectedAmount).toEqual(makeMoney(18880));
    expect(portfolio.summary.grossProfit).toEqual(makeMoney(1400));
    expect(portfolio.byClient[0]).toMatchObject({
      clientId: CLIENT_ID, clientName: 'Acme Corp', grossProfit: makeMoney(1400),
    });

    // §115 — the journey is auditable END TO END: delivery, approval,
    // invoicing, taxation, the number, the webhook lifecycle, the money.
    // (The domain services audit through their AuditContext.log; the webhook
    // pipeline builds its own context around createLog — both are evidence.)
    const audited = [
      ...devAudit.log.mock.calls.map(call => call[0] as string),
      ...adminAudit.log.mock.calls.map(call => call[0] as string),
      ...vi.mocked(createLog).mock.calls.map(call => call[1]),
    ];
    for (const action of [
      'TIME_ENTRY_CREATED', 'TIME_ENTRY_SUBMITTED', 'TIME_ENTRY_APPROVED',
      'EXPENSE_CREATED', 'EXPENSE_SUBMITTED', 'EXPENSE_APPROVED',
      'INVOICE_CREATED', 'INVOICE_LINE_ADDED', 'ITEM_RESERVED', 'INVOICE_TAXATION_SET',
      'INVOICE_FINALIZED', 'ITEM_INVOICED',
      'WEBHOOK_RECEIVED', 'PAYMENT_RECONCILED', 'WEBHOOK_PROCESSED',
    ]) {
      expect(audited, `missing audit action ${action}`).toContain(action);
    }
    // Each lifecycle event fired exactly once — no duplicate financial records.
    expect(audited.filter(a => a === 'INVOICE_FINALIZED')).toHaveLength(1);
    expect(audited.filter(a => a === 'PAYMENT_RECONCILED')).toHaveLength(1);
    expect(audited.filter(a => a === 'WEBHOOK_PROCESSED')).toHaveLength(1);
  }, 30000);

  it('§112 — a CORRUPTED stored tax line makes finalization fail BEFORE the number is consumed', async () => {
    // Fresh world (beforeEach reseeded): entry → approval → draft → line.
    const created = await createTimeEntry(T, {
      projectId: PROJECT_ID, date: '2026-09-01', durationMinutes: 240, billable: true,
    }, devAudit, DEV_ACTOR);
    expect(created.ok).toBe(true);
    const entry = created.data!;
    await submitTimeEntry(entry.id!, T, devAudit, DEV_ACTOR);
    await approveTimeEntry(entry.id!, T, adminAudit, ADMIN_ACTOR);

    const draftResult = await createInvoiceDraft(T, ADMIN_ACTOR, {
      clientId: CLIENT_ID, projectId: PROJECT_ID,
      issueDate: '2026-09-10', dueDate: '2026-09-30', currency: 'INR',
    }, adminAudit);
    expect(draftResult.ok).toBe(true);
    const draft = draftResult.data!;
    const line = await addInvoiceLine(draft.id!, T, ADMIN_ACTOR, {
      type: 'TIME', sourceId: entry.id!, description: 'Sprint 1 delivery',
    }, adminAudit);
    expect(line.ok).toBe(true);

    // Simulate STORAGE CORRUPTION: the stored tax line's rate is garbage. No
    // validator can see this — it is already persisted; only the engine's
    // re-validation at finalization stands between it and a legal tax invoice.
    h.invoices[0].taxLines = [{ type: 'IGST', name: 'IGST', rate: 999 }];

    // §112 — finalization recomputes through the engine (Step 3), which
    // throws on the invalid rate — BEFORE Step 4 allocates the number.
    await expect(finalizeInvoice(draft.id!, T, ADMIN_ACTOR, adminAudit))
      .rejects.toThrow('Invalid tax rate');

    // The number was NEVER consumed: the sequence saw no allocation at all.
    expect(allocateInvoiceNumberForFiscalYear).not.toHaveBeenCalled();
    expect(h.invoiceNumberSeq.size).toBe(0);
    // The invoice is untouched — still a draft, still numberless.
    expect(h.invoices[0]).toMatchObject({ status: 'DRAFT', invoiceNumber: null });
    // The reservation is intact — nothing was stamped INVOICED.
    expect(h.timeEntries[0]).toMatchObject({
      billingStatus: 'RESERVED', reservedInvoiceId: draft.id,
    });
    // No finalization audit trail was written for a finalize that did not happen.
    const audited = adminAudit.log.mock.calls.map(call => call[0] as string);
    expect(audited).not.toContain('INVOICE_FINALIZED');
    expect(audited).not.toContain('ITEM_INVOICED');

    // §74 recovery — once the corruption is repaired, the SAME draft
    // finalizes cleanly and takes number 1 (no gap was ever burned).
    h.invoices[0].taxLines = [{ type: 'IGST', name: 'IGST', rate: 18 }];
    const repaired = await finalizeInvoice(draft.id!, T, ADMIN_ACTOR, adminAudit);
    expect(repaired.ok).toBe(true);
    expect(repaired.data?.invoiceNumber).toBe('INV000001');
    expect(h.timeEntries[0]).toMatchObject({ billingStatus: 'INVOICED', invoiceId: draft.id });
  });
});
