import { MongoClient, ObjectId } from 'mongodb';
import { randomUUID } from 'crypto';
// Module 2 — agency client contract (client-safe; spec §16)
import type {
  ClientPrimaryContact, ClientBillingProfile, ClientTaxProfile,
  ClientCommercialDefaults, ClientStatus,
} from './agency/types/client';
import { normalizeClientName } from './agency/types/client';
// Module 3 — agency project contract (client-safe; spec §36–§63)
import type {
  Project, ProjectMember, WorkItem, ProjectMilestone,
  ProjectStatus, WorkItemStatus, MilestoneStatus,
} from './agency/types/project';
import type { BillingModel } from './agency/types/client';
// Module 6 — rate economics contract (client-safe; spec §59–§79, §131)
import type {
  RateCard, RateCardEntry, RateEntryVersion, UserCostAssignment,
  RateCardType, RateCardScope, RateCardStatus, RateUnit, RateBillingType,
} from './agency/types/rate';
// Module 7 — time tracking contract (client-safe; spec §5–§14)
import type {
  TimeEntry, TimerSession, TimeApprovalStatus, TimeBillingStatus, TimerStatus,
  TimeEntryUpdate,
} from './agency/types/time';
// Module 8 — expenses contract (client-safe; spec §37–§50)
import type {
  Expense, ExpenseApprovalStatus, ExpenseBillingStatus, ExpenseType, ExpenseUpdate,
} from './agency/types/expense';
// Module 9 — invoicing contract (client-safe; spec §57–§76)
import type {
  Invoice, InvoiceLine, InvoiceStatus, InvoiceLineType, InvoiceUpdate,
  InvoiceTaxLineType,
} from './agency/types/invoice';
// Module 10 — payments contract (client-safe; spec §87–§108)
import type {
  Payment, PaymentMethod, PaymentStatus, PaymentUpdate,
} from './agency/types/payment';
// Module 11 — tax & compliance contracts (client-safe; spec §6–§9)
import type {
  AgencyBillingProfile, TaxProfile, TaxTreatment,
} from './agency/types/tax';
// Module 11 — withholding & invoice-sequence contracts (client-safe; §19–§23)
import type {
  WithholdingRule, WithholdingAdjustment,
} from './agency/types/withholding';
// Module 12 — payment-link & webhook-event contracts (client-safe; §33/§42)
import type {
  PaymentLink, PaymentLinkStatus, PaymentLinkUpdate,
} from './agency/types/payment-link';
import type {
  WebhookEvent, WebhookProcessingStatus,
} from './agency/types/webhook-event';
// Module 15 — alert rule & agency alert contracts (client-safe; §4/§5/§6)
import type {
  AlertRule, AlertRuleType, AlertSeverity, AlertStatus,
  AgencyAlertRecord, AgencyAlertRecordCreateInput, AgencyAlertRecordUpdate,
} from './agency/alerts/types';
// Module 17 — agency settings contract (client-safe; §43–§48)
import type { AgencySettings } from './agency/types/agency-settings';

export function safeObjectId(id: string): ObjectId {
  try {
    const trimmed = typeof id === 'string' ? id.trim() : String(id);
    return new ObjectId(trimmed);
  } catch {
    return new ObjectId('000000000000000000000000');
  }
}

export interface ListOptions {
  limit?: number;
  page?: number;
  /** Module 2 — optional client scoping for transaction lists. */
  clientId?: string;
  /** Module 10 (§120/§129) — optional payment lineage scoping (transactions
   *  a payment created: the confirm Credit + any reversal Debit). */
  paymentId?: string;
  /**
   * Module 3 (§69) — optional sort. The ROUTE whitelists the field against
   * PROJECT_SORT_FIELDS; the repository applies whatever it is given so the
   * Mongo and local-JSON branches stay behaviorally identical.
   */
  sort?: ProjectSort;
}

/** §69 — the whitelisted project sort fields (createdAt is the default). */
export const PROJECT_SORT_FIELDS = ['createdAt', 'startDate', 'endDate', 'contractValue', 'status'] as const;
export type ProjectSortField = (typeof PROJECT_SORT_FIELDS)[number];
export interface ProjectSort {
  field: ProjectSortField;
  /** 1 = ascending, -1 = descending. */
  direction: 1 | -1;
}

/** Apply a whitelisted sort to a project array (local-JSON branch). */
function sortProjectsLocally(projects: Project[], sort: ProjectSort | undefined): Project[] {
  if (!sort) {
    return [...projects].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  return [...projects].sort((a, b) => {
    const va = a[sort.field] as unknown;
    const vb = b[sort.field] as unknown;
    // Missing values always sort LAST, regardless of direction — an absent
    // contractValue is "not set", not "the smallest contract".
    if (va === vb) return 0;
    if (va === undefined || va === null) return 1;
    if (vb === undefined || vb === null) return -1;
    return (va > vb ? 1 : -1) * sort.direction;
  });
}

/** Mongo sort spec for a whitelisted project sort (createdAt default). */
function projectMongoSort(sort: ProjectSort | undefined): Record<string, 1 | -1> {
  if (!sort) return { createdAt: -1 };
  return { [sort.field]: sort.direction };
}

function normalizeListOptions(options: ListOptions = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 100);
  const page = Math.max(Number(options.page) || 1, 1);
  return { limit, page, skip: (page - 1) * limit };
}

import fs from 'fs';
import path from 'path';

export interface Tenant {
  id?: string;
  _id?: ObjectId;
  name: string;
  status: 'ACTIVE' | 'SUSPENDED';
  plan: 'FREE' | 'STARTER' | 'ENTERPRISE';
  settings: {
    appName?: string;
    themeColor?: string;
  };
  limits: {
    maxUsers: number;
  };
  appMode?: 'Standard' | 'Student_Club' | 'Agency';
  attribution?: Record<string, string>;
  /**
   * Module 11 (§7) — the AGENCY's own billing identity (supplier side of an
   * invoice). Nullable expansion (§17-style): absent for every tenant that
   * has not configured one, and only ever read by the Agency vertical. One
   * per tenant by construction — no separate collection, no second source
   * of truth for the issuer.
   */
  billingProfile?: AgencyBillingProfile;
  /**
   * Module 17 (§43) — the agency vertical's configurable behavior (identity,
   * billing defaults, alert thresholds, tax defaults, payment credentials).
   * Same nullable-expansion architecture as billingProfile: absent until an
   * admin saves settings, one per tenant by construction, only ever read by
   * the Agency vertical. Consumers fall back to defaultAgencySettings().
   */
  agencySettings?: AgencySettings;
  createdAt: Date;
}

export interface User {
  id?: string;
  _id?: ObjectId;
  username: string;
  passwordHash: string;
  role: 'TENANT_ADMIN' | 'USER';
  tenantId: string;
  status: 'ACTIVE' | 'LOCKED';
  attribution?: Record<string, string>;
  createdAt: Date;
}

export interface Transaction {
  id?: string;
  _id?: ObjectId;
  tenantId: string;
  userId: string;
  username?: string;
  accountId?: string;
  clientId?: string;
  /**
   * Module 3 (§90) — OPTIONAL project reference. A generic transaction keeps
   * client-only (or neither); an agency transaction may carry client+project.
   * Never mandatory — core Money OS functionality is preserved, and existing
   * transactions are NOT auto-assigned (§107).
   */
  projectId?: string;
  type: 'Credit' | 'Debit';
  description: string;
  amount: number;
  date: string; // YYYY-MM-DD
  category?: string;
  notes?: string;
  /**
   * Module 10 (§94/§95) — OPTIONAL invoice/payment lineage for money the
   * payments flow moved. A confirmed payment creates exactly one Credit
   * carrying both ids (§129); a reversal creates one Debit carrying the
   * paymentId. Core transactions keep working exactly as before — existing
   * rows are NOT auto-assigned (§107 nullable-expansion pattern).
   */
  invoiceId?: string;
  paymentId?: string;
  createdAt: Date;
}

export interface Client {
  id?: string;
  _id?: ObjectId;
  tenantId: string;
  name: string;
  email?: string;
  createdAt: Date;
  // ---- Module 2 nullable expansion (spec §16/§17) ----
  // Every field below is optional: existing clients stay valid without them,
  // and core Money OS continues using the entity exactly as before.
  legalName?: string;
  website?: string;
  phone?: string;
  industry?: string;
  notes?: string;
  primaryContact?: ClientPrimaryContact;
  billingProfile?: ClientBillingProfile;
  taxProfile?: ClientTaxProfile;
  commercialDefaults?: ClientCommercialDefaults;
  status?: ClientStatus;
  updatedAt?: Date;
}

export interface Category {
  id?: string;
  _id?: ObjectId;
  tenantId: string;
  userId: string;
  name: string;
  createdAt: Date;
}

export interface Account {
  id?: string;
  _id?: ObjectId;
  tenantId: string;
  name: string;
  type: string;
  initialBalance: number;
  createdAt: Date;
}

export interface Budget {
  id?: string;
  _id?: ObjectId;
  tenantId: string;
  category: string;
  limitAmount: number;
  month: string; // YYYY-MM
  createdAt: Date;
}

export interface RecurringTransaction {
  id?: string;
  _id?: ObjectId;
  tenantId: string;
  userId: string;
  username?: string;
  accountId: string;
  type: 'Credit' | 'Debit';
  description: string;
  amount: number;
  category?: string;
  interval: 'Daily' | 'Weekly' | 'Monthly';
  lastRunDate?: string; // YYYY-MM-DD
  nextRunDate: string; // YYYY-MM-DD
  createdAt: Date;
}

export interface SystemLog {
  id?: string;
  _id?: ObjectId;
  tenantId?: string; // Optional for super admin system logs
  username: string;
  action: string;
  details: string;
  ipAddress?: string;
  severity?: 'INFO' | 'WARN' | 'CRITICAL';
  timestamp: Date;
}

export interface FeatureFlag {
  id?: string;
  _id?: ObjectId;
  name: string;
  desc: string;
  status: boolean;
  rollout: string;
  target: string;
  createdAt: Date;
}

export interface SupportTicket {
  id?: string;
  _id?: ObjectId;
  subject: string;
  tenantId: string;
  status: 'OPEN' | 'RESOLVED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  createdAt: Date;
  name?: string;
  email?: string;
  message?: string;
  category?: string;
}

export interface Broadcast {
  id?: string;
  _id?: ObjectId;
  type: string;
  message: string;
  target: string;
  createdAt: Date;
}

export interface NewsletterSubscriber {
  id?: string;
  _id?: ObjectId;
  email: string;
  createdAt: Date;
}

export interface SystemIncident {
  id?: string;
  _id?: ObjectId;
  title: string;
  description: string;
  status: 'INVESTIGATING' | 'IDENTIFIED' | 'MONITORING' | 'RESOLVED';
  severity: 'INFO' | 'WARN' | 'CRITICAL';
  createdAt: Date;
  resolvedAt?: Date;
}

export interface SystemMaintenance {
  id?: string;
  _id?: ObjectId;
  title: string;
  description: string;
  scheduledFor: Date;
  durationMinutes: number;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED';
  createdAt: Date;
}

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_GROWTH_URI = process.env.MONGODB_GROWTH_URI;

let mongoClient: MongoClient | null = null;
let mongoGrowthClient: MongoClient | null = null;
let useLocalDb = false;
let useLocalGrowthDb = false;

const DATA_DIR = path.join(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'local_db.json');

interface LocalDbSchema {
  tenants: Tenant[];
  users: User[];
  accounts: Account[];
  transactions: Transaction[];
  categories: Category[];
  budgets: Budget[];
  recurring: RecurringTransaction[];
  clients: Client[];
  // Module 3 — agency project entities (spec §36/§59/§61/§46)
  projects: Project[];
  projectMembers: ProjectMember[];
  workItems: WorkItem[];
  projectMilestones: ProjectMilestone[];
  // Module 6 — rate economics entities (spec §59–§68, architecture §131)
  rateCards: RateCard[];
  rateCardEntries: RateCardEntry[];
  rateEntryVersions: RateEntryVersion[];
  userCostAssignments: UserCostAssignment[];
  // Module 7 — time tracking entities (spec §5, §9)
  timeEntries: TimeEntry[];
  timerSessions: TimerSession[];
  // Module 8 — expense entities (spec §37; the operational layer — §36)
  expenses: Expense[];
  // Module 9 — invoicing entities (spec §57/§59; §74 counter)
  invoices: Invoice[];
  invoiceLines: InvoiceLine[];
  invoiceCounters: InvoiceCounter[];
  // Module 10 — payment entities (spec §88; operational record, §87)
  payments: Payment[];
  // Module 11 — tax & compliance entities (spec §6: tenant-level tax profiles;
  // §19: effective-dated withholding rules; §23: per-FY invoice sequences)
  taxProfiles: TaxProfile[];
  withholdingRules: WithholdingRule[];
  invoiceSequences: InvoiceSequence[];
  /** Module 3 — flat per-tenant project-code counter (PRJ-0001…). */
  projectSequences: ProjectSequence[];
  // Module 12 — collection entities (spec §33: external payment links;
  // §42: the webhook-event idempotency/visibility store)
  paymentLinks: PaymentLink[];
  webhookEvents: WebhookEvent[];
  // Module 15 — alert entities (spec §4: tenant rule configuration;
  // §5: the detected-alert store, keyed by §6 fingerprint)
  alertRules: AlertRule[];
  agencyAlerts: AgencyAlertRecord[];
  logs: SystemLog[];
  flags: FeatureFlag[];
  tickets: SupportTicket[];
  broadcasts: Broadcast[];
  subscribers: NewsletterSubscriber[];
  incidents: SystemIncident[];
  maintenances: SystemMaintenance[];
}

function getNextSunday() {
  const date = new Date();
  const resultDate = new Date(date);
  resultDate.setDate(date.getDate() + ((7 - date.getDay()) % 7 || 7));
  resultDate.setHours(2, 0, 0, 0); // 02:00 UTC
  return resultDate;
}

export function initLocalDb(): LocalDbSchema {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const nextSunday = getNextSunday();
  const initialIncidents: SystemIncident[] = [
    {
      id: 'inc_1',
      title: 'Minor Database Latency Resolved',
      description: 'We identified database locks due to complex reporting queries. The indexing configuration was adjusted, returning query performance levels to standard parameters.',
      status: 'RESOLVED',
      severity: 'WARN',
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      resolvedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + 45 * 60 * 1000)
    },
    {
      id: 'inc_2',
      title: 'Email Relay Delay',
      description: 'An upstream relay server delay impacted verification codes. Failover routes were deployed to guarantee instantaneous email deliverables.',
      status: 'RESOLVED',
      severity: 'INFO',
      createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
      resolvedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000 + 20 * 60 * 1000)
    }
  ];
  const initialMaintenances: SystemMaintenance[] = [
    {
      id: 'maint_1',
      title: 'Upcoming Upgrade Window',
      description: 'A core database server upgrade is scheduled for Sunday. Expect short database connection interruptions during this interval.',
      scheduledFor: nextSunday,
      durationMinutes: 60,
      status: 'SCHEDULED',
      createdAt: new Date()
    }
  ];

  if (!fs.existsSync(DB_FILE)) {
    const defaultData: LocalDbSchema = {
      tenants: [], users: [], accounts: [], transactions: [], categories: [], budgets: [],
      recurring: [], clients: [], logs: [], flags: [], tickets: [], broadcasts: [],
      subscribers: [], incidents: initialIncidents, maintenances: initialMaintenances,
      projects: [], projectMembers: [], workItems: [], projectMilestones: [],
      rateCards: [], rateCardEntries: [], rateEntryVersions: [], userCostAssignments: [],
      timeEntries: [], timerSessions: [],
      expenses: [],
      invoices: [], invoiceLines: [], invoiceCounters: [],
      payments: [],
      taxProfiles: [],
      withholdingRules: [],
      invoiceSequences: [],
      projectSequences: [],
      paymentLinks: [],
      webhookEvents: [],
      alertRules: [],
      agencyAlerts: [],
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2), 'utf-8');
    return defaultData;
  }
  try {
    const content = fs.readFileSync(DB_FILE, 'utf-8');    const parsed = JSON.parse(content);
    if (!parsed.tenants) parsed.tenants = [];
    if (!parsed.users) parsed.users = [];
    if (!parsed.accounts) parsed.accounts = [];
    if (!parsed.transactions) parsed.transactions = [];
    if (!parsed.categories) parsed.categories = [];
    if (!parsed.budgets) parsed.budgets = [];
    if (!parsed.recurring) parsed.recurring = [];
    if (!parsed.clients) parsed.clients = [];
    // Module 3 — backfill project collections for pre-Module-3 local DBs
    if (!parsed.projects) parsed.projects = [];
    if (!parsed.projectMembers) parsed.projectMembers = [];
    if (!parsed.workItems) parsed.workItems = [];
    if (!parsed.projectMilestones) parsed.projectMilestones = [];
    // Module 6 — backfill rate collections for pre-Module-6 local DBs
    if (!parsed.rateCards) parsed.rateCards = [];
    if (!parsed.rateCardEntries) parsed.rateCardEntries = [];
    if (!parsed.rateEntryVersions) parsed.rateEntryVersions = [];
    if (!parsed.userCostAssignments) parsed.userCostAssignments = [];
    // Module 7 — backfill time collections for pre-Module-7 local DBs
    if (!parsed.timeEntries) parsed.timeEntries = [];
    if (!parsed.timerSessions) parsed.timerSessions = [];
    // Module 8 — backfill expense collection for pre-Module-8 local DBs
    if (!parsed.expenses) parsed.expenses = [];
    // Module 9 — backfill invoice collections for pre-Module-9 local DBs
    if (!parsed.invoices) parsed.invoices = [];
    if (!parsed.invoiceLines) parsed.invoiceLines = [];
    if (!parsed.invoiceCounters) parsed.invoiceCounters = [];
    // Module 10 — backfill payment collection for pre-Module-10 local DBs
    if (!parsed.payments) parsed.payments = [];
    // Module 11 — backfill tax collections for pre-Module-11 local DBs
    if (!parsed.taxProfiles) parsed.taxProfiles = [];
    if (!parsed.withholdingRules) parsed.withholdingRules = [];
    if (!parsed.invoiceSequences) parsed.invoiceSequences = [];
    // Module 3 — backfill the project-code counter for pre-existing local DBs
    if (!parsed.projectSequences) parsed.projectSequences = [];
    // Module 12 — backfill collection entities for pre-Module-12 local DBs
    if (!parsed.paymentLinks) parsed.paymentLinks = [];
    if (!parsed.webhookEvents) parsed.webhookEvents = [];
    // Module 15 — backfill alert collections for pre-Module-15 local DBs
    if (!parsed.alertRules) parsed.alertRules = [];
    if (!parsed.agencyAlerts) parsed.agencyAlerts = [];
    if (!parsed.logs) parsed.logs = [];
    if (!parsed.flags) parsed.flags = [];
    if (!parsed.tickets) parsed.tickets = [];
    if (!parsed.broadcasts) parsed.broadcasts = [];
    if (!parsed.subscribers) parsed.subscribers = [];
    if (!parsed.incidents || parsed.incidents.length === 0) parsed.incidents = initialIncidents;
    if (!parsed.maintenances || parsed.maintenances.length === 0) parsed.maintenances = initialMaintenances;
    return parsed;
  } catch (e) {
    const defaultData: LocalDbSchema = {
      tenants: [], users: [], accounts: [], transactions: [], categories: [], budgets: [],
      recurring: [], clients: [], logs: [], flags: [], tickets: [], broadcasts: [],
      subscribers: [], incidents: initialIncidents, maintenances: initialMaintenances,
      projects: [], projectMembers: [], workItems: [], projectMilestones: [],
      rateCards: [], rateCardEntries: [], rateEntryVersions: [], userCostAssignments: [],
      timeEntries: [], timerSessions: [],
      expenses: [],
      invoices: [], invoiceLines: [], invoiceCounters: [],
      payments: [],
      taxProfiles: [],
      withholdingRules: [],
      invoiceSequences: [],
      projectSequences: [],
      paymentLinks: [],
      webhookEvents: [],
      alertRules: [],
      agencyAlerts: [],
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2), 'utf-8');
    return defaultData;
  }
}

function writeLocalDb(data: LocalDbSchema) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export async function connectDb() {
  if (useLocalDb) return { client: null, db: null };
  if (mongoClient) return { client: mongoClient, db: mongoClient.db() };

  if (!MONGODB_URI) {
    if (process.env.NODE_ENV === 'production' && !process.env.CI) {
      throw new Error('[FATAL] MONGODB_URI is not set. Refusing to start production with local JSON storage.');
    }
    console.warn('[Database] MONGODB_URI not set. Using local file-based database at .data/local_db.json');
    useLocalDb = true;
    initLocalDb();
    return { client: null, db: null };
  }

  try {
    mongoClient = new MongoClient(MONGODB_URI, {
      connectTimeoutMS: 10000,
      serverSelectionTimeoutMS: 10000,
    });
    await mongoClient.connect();
    const db = mongoClient.db();

    // Create indexes for performance
    try {
      await db.collection('transactions').createIndex({ tenantId: 1, date: -1, createdAt: -1 });
      await db.collection('logs').createIndex({ tenantId: 1, timestamp: -1 });
      await db.collection('logs').createIndex({ action: 1, timestamp: -1 });
      await db.collection('clients').createIndex({ tenantId: 1, createdAt: -1 });
      // Module 2 (spec §32) — status filter, name search, duplicate probe
      await db.collection('clients').createIndex({ tenantId: 1, status: 1 });
      await db.collection('clients').createIndex({ tenantId: 1, name: 1 });
      // Duplicate detection is case/whitespace-insensitive (§18), so the
      // probe column is the normalized name, not the display name.
      await db.collection('clients').createIndex({ tenantId: 1, normalizedName: 1 });
      // Module 3 — project list defaults (newest first), status filter,
      // client-scoped project rollups (§94)
      await db.collection('projects').createIndex({ tenantId: 1, createdAt: -1 });
      await db.collection('projects').createIndex({ tenantId: 1, status: 1 });
      await db.collection('projects').createIndex({ tenantId: 1, clientId: 1 });
      // Module 3 (spec §110) — timeline and ownership filters
      await db.collection('projects').createIndex({ tenantId: 1, startDate: 1 });
      await db.collection('projects').createIndex({ tenantId: 1, projectManagerId: 1 });
      // §111 — project-code uniqueness probe: tenantId + normalizedCode
      await db.collection('projects').createIndex({ tenantId: 1, normalizedCode: 1 });
      // Module 3 — sub-entity lookups are always project + tenant scoped
      await db.collection('project_members').createIndex({ tenantId: 1, projectId: 1 });
      await db.collection('project_members').createIndex({ tenantId: 1, userId: 1 });
      // Module 5 §40 — one ACTIVE membership per user per project. Partial on
      // active:true so a removed member can be re-added as a fresh row
      // (§37 history is never deleted). The Module 3-era plain unique index
      // on the same keys (auto-named projectId_1_userId_1) must be dropped
      // first: it would block re-adds AND collide with this index's
      // auto-generated name. Isolated try: index setup must never abort the
      // connection for the rest of the schema.
      try {
        await db.collection('project_members').dropIndex('projectId_1_userId_1').catch(() => undefined);
        await db.collection('project_members').createIndex(
          { projectId: 1, userId: 1 },
          { unique: true, partialFilterExpression: { active: true }, name: 'project_members_active_unique' }
        );
      } catch (e) {}
      // §52 potential — the active-team lookup (tenant + project, active
      // rows first) behind the §42 team view.
      await db.collection('project_members').createIndex({ tenantId: 1, projectId: 1, active: 1 });
      await db.collection('work_items').createIndex({ tenantId: 1, projectId: 1 });
      await db.collection('work_items').createIndex({ tenantId: 1, projectId: 1, status: 1 });
      // Module 4 (§27) — assignee filtering ("My Work"/"Unassigned") and the
      // default sortOrder list order.
      await db.collection('work_items').createIndex({ tenantId: 1, projectId: 1, assignedTo: 1 });
      await db.collection('work_items').createIndex({ tenantId: 1, projectId: 1, sortOrder: 1 });
      await db.collection('project_milestones').createIndex({ tenantId: 1, projectId: 1, sequence: 1 });
      // Module 6 (spec §102) — rate economics lookups. Card lists filter by
      // type + status; client-specific cards resolve by scope + clientId.
      await db.collection('rate_cards').createIndex({ tenantId: 1, type: 1, status: 1 });
      await db.collection('rate_cards').createIndex({ tenantId: 1, scope: 1, clientId: 1 });
      // Entries always load with their card; versions resolve by entry and by
      // card (the resolution engine loads a card's versions in one query).
      await db.collection('rate_card_entries').createIndex({ tenantId: 1, rateCardId: 1 });
      await db.collection('rate_entry_versions').createIndex({ tenantId: 1, rateCardEntryId: 1 });
      await db.collection('rate_entry_versions').createIndex({ tenantId: 1, rateCardId: 1 });
      // User cost assignments: the per-user history + the overlap probe.
      await db.collection('user_cost_assignments').createIndex({ tenantId: 1, userId: 1 });
      await db.collection('user_cost_assignments').createIndex({ tenantId: 1, userId: 1, effectiveFrom: 1 });
      // Module 7 — time tracking (spec §30/§25): user-scoped history,
      // project views, the approval queue, and future invoice linkage.
      await db.collection('time_entries').createIndex({ tenantId: 1, userId: 1, date: -1 });
      await db.collection('time_entries').createIndex({ tenantId: 1, projectId: 1, date: -1 });
      await db.collection('time_entries').createIndex({ tenantId: 1, approvalStatus: 1, date: -1 });
      await db.collection('time_entries').createIndex({ tenantId: 1, billingStatus: 1 });
      await db.collection('time_entries').createIndex({ tenantId: 1, invoiceId: 1 });
      // Module 7 §117 — dashboard windowed hours aggregation (queries/time-summary.ts).
      await db.collection('time_entries').createIndex({ tenantId: 1, date: -1 });
      // Timer sessions — §11: one RUNNING timer per user is enforced by the
      // domain (a checked 409, not a DB error); this index serves the lookup.
      await db.collection('timer_sessions').createIndex({ tenantId: 1, userId: 1, status: 1 });
      // Module 8 — expenses (spec §53): date-ordered history, project views,
      // the approval queue, billing classification and future invoice linkage.
      await db.collection('expenses').createIndex({ tenantId: 1, expenseDate: -1 });
      await db.collection('expenses').createIndex({ tenantId: 1, projectId: 1, expenseDate: -1 });
      await db.collection('expenses').createIndex({ tenantId: 1, status: 1, expenseDate: -1 });
      await db.collection('expenses').createIndex({ tenantId: 1, billingStatus: 1 });
      await db.collection('expenses').createIndex({ tenantId: 1, invoiceId: 1 });
      // Module 9 — invoices (spec §85): status/date history, by-client and
      // by-project reports, and the §74 numbering lookup.
      await db.collection('invoices').createIndex({ tenantId: 1, status: 1, issueDate: -1 });
      await db.collection('invoices').createIndex({ tenantId: 1, clientId: 1, issueDate: -1 });
      await db.collection('invoices').createIndex({ tenantId: 1, projectId: 1 });
      // Module 14 §99 — the receivables query path: open invoices by due
      // date (the aging ladder scans exactly this shape).
      await db.collection('invoices').createIndex({ tenantId: 1, status: 1, dueDate: 1 });
      // Partial (NOT sparse): a sparse COMPOUND unique index still indexes
      // numberless drafts as {tenantId, null} — the second draft would hit a
      // duplicate-null E11000. The partial filter excludes drafts entirely:
      // only finalized invoices carry a number (§74), and those are unique.
      // Module 11 §23 — the uniqueness scope is now the FISCAL YEAR (CBIC):
      // the tenant-wide index is replaced by {tenantId, fiscalYear,
      // invoiceNumber}. Legacy finalized invoices (no fiscalYear) index with
      // null and stay unique; the §23 legacy seeding guarantees no number is
      // re-issued across the boundary.
      await db.collection('invoices').dropIndex('agency_invoice_tenant_number_unique').catch(() => undefined);
      await db.collection('invoices').createIndex(
        { tenantId: 1, fiscalYear: 1, invoiceNumber: 1 },
        {
          unique: true,
          partialFilterExpression: { invoiceNumber: { $exists: true } },
          name: 'agency_invoice_tenant_fy_number_unique',
        }
      );
      // Module 9 — invoice lines: draft composition reads + the §84
      // duplicate-billing probe (which invoice holds a source).
      await db.collection('invoice_lines').createIndex({ tenantId: 1, invoiceId: 1 });
      await db.collection('invoice_lines').createIndex({ tenantId: 1, type: 1, sourceId: 1 });
      // Module 9 — §74 numbering: one counter per tenant, atomically $inc'd.
      await db.collection('invoice_counters').createIndex(
        { tenantId: 1 },
        { unique: true, name: 'agency_invoice_counter_tenant_unique' }
      );
      // Module 11 §23/§24 — per-FY invoice sequences: {tenantId, fiscalYear}
      // is the uniqueness scope (CBIC), and the unique index makes the
      // legacy-seeding insert race-safe (E11000 = already seeded).
      await db.collection('invoice_sequences').createIndex(
        { tenantId: 1, fiscalYear: 1 },
        { unique: true, name: 'agency_invoice_sequence_tenant_fy_unique' }
      );
      // Module 10 — payments (spec §96/§104/§116): the invoice's payment
      // list (§104 balance recomputation reads it), status/date history and
      // client receivables reporting.
      await db.collection('payments').createIndex({ tenantId: 1, invoiceId: 1 });
      await db.collection('payments').createIndex({ tenantId: 1, status: 1, receivedAt: -1 });
      await db.collection('payments').createIndex({ tenantId: 1, clientId: 1, receivedAt: -1 });
      // Module 10 — §96 gateway idempotency: {tenantId, gateway,
      // gatewayPaymentId} is UNIQUE, but only over GATEWAY payments (manual
      // ones carry no gateway). PARTIAL index with $exists — the Module 9
      // lesson: a sparse COMPOUND index still indexes the null keys of the
      // always-present fields and would reject a second manual payment.
      await db.collection('payments').createIndex(
        { tenantId: 1, gateway: 1, gatewayPaymentId: 1 },
        {
          unique: true,
          partialFilterExpression: { gateway: { $exists: true } },
          name: 'agency_payment_gateway_unique',
        }
      );
      // Module 10 — §120/§129 lineage: the transactions a payment created.
      // Partial: only payment-created transactions carry paymentId.
      await db.collection('transactions').createIndex(
        { tenantId: 1, paymentId: 1 },
        {
          partialFilterExpression: { paymentId: { $exists: true } },
          name: 'transaction_payment_lineage',
        }
      );
      // Module 11 — tax profiles (spec §6): the active-profile list lookup
      // and the per-country configuration view.
      await db.collection('tax_profiles').createIndex({ tenantId: 1, active: 1 });
      await db.collection('tax_profiles').createIndex({ tenantId: 1, country: 1 });
      // Module 11 §19 — withholding rules: the active-rule list lookup and
      // the per-jurisdiction configuration view.
      await db.collection('withholding_rules').createIndex({ tenantId: 1, active: 1 });
      await db.collection('withholding_rules').createIndex({ tenantId: 1, jurisdiction: 1 });
      // Module 12 §33/§34 — payment links: the invoice's link history (§34 —
      // many links per invoice is normal), newest first.
      await db.collection('payment_links').createIndex({ tenantId: 1, invoiceId: 1, createdAt: -1 });
      // Module 12 §113 — the webhook's link resolution lookup key.
      // providerLinkId is always present on link rows, so a plain partial
      // $exists unique index is safe (the Module 9 sparse-compound lesson).
      await db.collection('payment_links').createIndex(
        { tenantId: 1, providerLinkId: 1 },
        {
          unique: true,
          partialFilterExpression: { providerLinkId: { $exists: true } },
          name: 'agency_payment_link_provider_unique',
        }
      );
      // Module 12 §42 — webhook-event idempotency: provider + providerEventId
      // (Razorpay's equivalent: the raw-body hash) is globally unique — the
      // store is tenant-agnostic until an event resolves.
      await db.collection('webhook_events').createIndex(
        { provider: 1, providerEventId: 1 },
        { unique: true, name: 'webhook_event_provider_unique' }
      );
      // Module 12 §43/§44 — operational visibility: the failed-events view
      // and the tenant's recent-event timeline.
      await db.collection('webhook_events').createIndex({ processingStatus: 1, receivedAt: -1 });
      await db.collection('webhook_events').createIndex({ tenantId: 1, receivedAt: -1 });
      // Module 15 §4 — one rule row per (tenant, ruleType): UNIQUE, so lazy
      // default seeding is race-safe (E11000 = another request seeded it first).
      await db.collection('alert_rules').createIndex(
        { tenantId: 1, type: 1 },
        { unique: true, name: 'agency_alert_rule_tenant_type_unique' }
      );
      // Module 15 §6 — the dedupe fingerprint: unique per (tenant, rule,
      // entity), so a re-evaluation upserts the same logical alert instead of
      // stacking duplicates; two concurrent evaluations collide here and the
      // loser's create is rejected (11000) and skipped by the evaluator.
      await db.collection('agency_alerts').createIndex(
        { tenantId: 1, fingerprint: 1 },
        { unique: true, name: 'agency_alert_fingerprint_unique' }
      );
      // Module 15 §22/§23 — the Alert Center: severity-ranked open work
      // first (status → severity → newest) and the per-rule history view.
      await db.collection('agency_alerts').createIndex({ tenantId: 1, status: 1, severity: 1, triggeredAt: -1 });
      await db.collection('agency_alerts').createIndex({ tenantId: 1, ruleType: 1, triggeredAt: -1 });
      await db.collection('budgets').createIndex({ tenantId: 1, category: 1, month: 1 }, { unique: true });

      // Handle username unique index with duplicate cleanup
      try {
        await db.collection('users').createIndex(
          { username: 1 },
          { unique: true, collation: { locale: 'en', strength: 2 } }
        );
      } catch (indexError: any) {
        if (indexError.code === 11000) {
          // Drop the problematic index if it exists
          try {
            await db.collection('users').dropIndex('username_1');
          } catch (dropError) {
            // Index might not exist, ignore
          }

          // Remove duplicate usernames, keeping the first occurrence
          const users = await db.collection('users').find({}).toArray();
          const seenUsernames = new Set<string>();
          const duplicates: any[] = [];

          for (const user of users) {
            const lowerUsername = user.username?.toLowerCase();
            if (lowerUsername) {
              if (seenUsernames.has(lowerUsername)) {
                duplicates.push(user._id);
              } else {
                seenUsernames.add(lowerUsername);
              }
            }
          }

          // Delete duplicates
          if (duplicates.length > 0) {
            await db.collection('users').deleteMany({ _id: { $in: duplicates } });
            console.log(`[Database] Removed ${duplicates.length} duplicate username entries`);
          }

          // Retry index creation
          await db.collection('users').createIndex(
            { username: 1 },
            { unique: true, collation: { locale: 'en', strength: 2 } }
          );
        } else {
          throw indexError;
        }
      }
    } catch (e) {
      console.warn('[Database] Failed to create indexes', e);
    }

    return { client: mongoClient, db };
  } catch (error) {
    mongoClient = null;
    if (process.env.NODE_ENV === 'production') {
      throw error;
    }
    if (!MONGODB_URI) {
      useLocalDb = true;
      initLocalDb();
    } else {
      console.warn('[Database] Transient connection failure to MongoDB, will retry on next request:', (error as Error).message);
    }
    return { client: null, db: null };
  }
}

export async function connectGrowthDb() {
  if (useLocalGrowthDb) return { client: null, db: null };
  if (mongoGrowthClient) return { client: mongoGrowthClient, db: mongoGrowthClient.db() };

  if (!MONGODB_GROWTH_URI) {
    if (process.env.NODE_ENV === 'production' && !process.env.CI) {
      throw new Error('[FATAL] MONGODB_GROWTH_URI is not set. Refusing to start production with local JSON storage.');
    }
    console.warn('[Database] MONGODB_GROWTH_URI not set. Using local file-based database at .data/local_db.json for growth data');
    useLocalGrowthDb = true;
    initLocalDb(); // Reusing the local db logic for simplicity in dev when no uri is provided
    return { client: null, db: null };
  }

  try {
    mongoGrowthClient = new MongoClient(MONGODB_GROWTH_URI, {
      connectTimeoutMS: 10000,
      serverSelectionTimeoutMS: 10000,
    });
    await mongoGrowthClient.connect();
    const db = mongoGrowthClient.db();

    // Create indexes for growth collections
    try {
      await db.collection('directories').createIndex({ status: 1 });
      await db.collection('directory_submissions').createIndex({ directoryId: 1, submittedAt: -1 });
      await db.collection('social_profiles').createIndex({ platform: 1 }, { unique: true });
    } catch (e) {
      console.warn('[Database] Failed to create growth indexes', e);
    }

    return { client: mongoGrowthClient, db };
  } catch (error) {
    mongoGrowthClient = null;
    if (process.env.NODE_ENV === 'production') {
      throw error;
    }
    useLocalGrowthDb = true;
    initLocalDb();
    return { client: null, db: null };
  }
}

// ---- TENANTS ----

export async function getTenants(): Promise<Tenant[]> {
  const { db } = await connectDb();
  if (db) {
    try {
      const tenants = await db.collection('tenants').find({}).toArray();
      return tenants.map(t => ({
        id: t._id.toString(),
        name: t.name,
        status: t.status || 'ACTIVE',
        plan: t.plan || 'FREE',
        settings: t.settings || {},
        limits: t.limits || { maxUsers: 5 },
        // Vertical mode: MUST pass through here too (the getTenantById
        // Module 1.26/1.27 lesson struck a FOURTH time on this listing —
        // every listed tenant read as Standard, so platform analytics and
        // any list-driven surface saw zero Agency tenants). Caught live by
        // the super-admin agency analytics verification.
        appMode: t.appMode,
        billingProfile: (t.billingProfile as AgencyBillingProfile | undefined) ?? undefined,
        // Module 17 (§43/§51) — agencySettings MUST pass through: the webhook
        // multi-secret scan reads every Razorpay-enabled tenant's stored
        // webhook secret through this listing.
        agencySettings: (t.agencySettings as AgencySettings | undefined) ?? undefined,
        createdAt: t.createdAt,
      }));
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.tenants.map(t => ({
    ...t,
    status: t.status || 'ACTIVE',
    plan: t.plan || 'FREE',
    settings: t.settings || {},
    limits: t.limits || { maxUsers: 5 },
  }));
}

export async function getTenantById(id: string): Promise<Tenant | null> {
  const { db } = await connectDb();
  if (db) {
    try {
      const t = await db.collection('tenants').findOne({ _id: safeObjectId(id) });
      if (t) {
        return {
          id: t._id.toString(),
          name: t.name,
          status: t.status || 'ACTIVE',
          plan: t.plan || 'FREE',
          settings: t.settings || {},
          limits: t.limits || { maxUsers: 5 },
          // Vertical mode (Module 1.27): MUST pass through — dropping it made
          // every Mongo-backed tenant resolve as Standard, so the Agency gate
          // 403'd legitimate Agency tenants. Caught by the Module 1.26 E2E.
          appMode: t.appMode,
          // Module 11 (§7) — the agency billing profile MUST pass through the
          // same way (the Module 1.26 lesson, applied pre-emptively).
          billingProfile: (t.billingProfile as AgencyBillingProfile | undefined) ?? undefined,
          // Module 17 (§43) — the agency settings MUST pass through too. The
          // Module 1.27 lesson struck a THIRD time: this whitelisting mapper
          // silently dropped agencySettings on read, so every section PATCH
          // returned the merged settings (the in-memory write result) while
          // every later GET saw only §17.2 defaults. Caught by suite 47.
          agencySettings: (t.agencySettings as AgencySettings | undefined) ?? undefined,
          // Acquisition attribution MUST pass through too — the same whitelist
          // lesson, struck a FIFTH time: the super-admin tenant detail read had
          // no way to say where a workspace came from while the raw document
          // (and getUTMAcquisitionStats, which reads the cursor directly) knew.
          attribution: (t.attribution as Record<string, string> | undefined) ?? undefined,
          createdAt: t.createdAt,
        };
      }
      return null;
    } catch (e) {}
  }
  const data = initLocalDb();
  const t = data.tenants.find(t => t.id === id);
  if (t) {
    return {
      ...t,
      status: t.status || 'ACTIVE',
      plan: t.plan || 'FREE',
      settings: t.settings || {},
      limits: t.limits || { maxUsers: 5 },
    };
  }
  return null;
}

export async function createTenant(
  name: string,
  attribution?: Record<string, string>,
  appMode: 'Standard' | 'Student_Club' | 'Agency' = 'Standard',
): Promise<Tenant> {
  const { db } = await connectDb();
  const newTenant = {
    name,
    status: 'ACTIVE' as const,
    plan: 'FREE' as const,
    settings: {},
    limits: { maxUsers: 5 },
    // Onboarding vertical (PRD §86) — persisted at creation so the workspace
    // the user picked is the workspace they land in. Previously this was never
    // written, so every tenant created through signup read back as Standard
    // (the picker's value never left the browser, then had nowhere to land).
    appMode,
    attribution,
    createdAt: new Date()
  };
  
  if (db) {
    try {
      const result = await db.collection('tenants').insertOne(newTenant);
      return { id: result.insertedId.toString(), ...newTenant };
    } catch (e) {}
  }
  const data = initLocalDb();
  const id = randomUUID();
  const localTenant: Tenant = { id, ...newTenant };
  data.tenants.push(localTenant);
  writeLocalDb(data);
  return localTenant;
}

export async function updateTenant(id: string, updates: Partial<Omit<Tenant, 'id' | '_id' | 'createdAt'>>): Promise<boolean> {
  const { db } = await connectDb();
  if (db) {
    try {
      const result = await db.collection('tenants').updateOne(
        { _id: safeObjectId(id) },
        { $set: updates }
      );
      // matchedCount (Module 5 lesson, applied to the fn Module 11's billing
      // profile now depends on): an idempotent PATCH that writes identical
      // values still MATCHED the tenant — a 200, never a phantom failure.
      return result.matchedCount > 0;
    } catch (e) {}
  }
  const data = initLocalDb();
  const idx = data.tenants.findIndex(t => t.id === id);
  if (idx >= 0) {
    data.tenants[idx] = { ...data.tenants[idx], ...updates };
    writeLocalDb(data);
    return true;
  }
  return false;
}

export async function updateTenantAppMode(id: string, mode: 'Standard' | 'Student_Club' | 'Agency') {
  const { db } = await connectDb();
  if (db) {
    try {
      await db.collection('tenants').updateOne(
        { _id: safeObjectId(id) },
        { $set: { appMode: mode } }
      );
      return true;
    } catch (e) {
      return false;
    }
  }
  const data = initLocalDb();
  const idx = data.tenants.findIndex(t => t.id === id);
  if (idx >= 0) {
    data.tenants[idx].appMode = mode;
    writeLocalDb(data);
    return true;
  }
  return false;
}

// ---- USERS ----

export async function getUserByUsername(username: string): Promise<User | null> {
  const { db } = await connectDb();
  if (db) {
    try {
      const user = await db.collection('users').findOne(
        { username },
        { collation: { locale: 'en', strength: 2 } }
      );
      if (user) {
        return {
          id: user._id.toString(),
          username: user.username,
          passwordHash: user.passwordHash,
          role: user.role,
          tenantId: user.tenantId,
          status: user.status || 'ACTIVE',
          createdAt: user.createdAt,
        };
      }
      return null;
    } catch (e) {}
  }
  const data = initLocalDb();
  const user = data.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (user) {
    return { ...user, status: user.status || 'ACTIVE' };
  }
  return null;
}

export async function getUserById(id: string): Promise<User | null> {
  const { db } = await connectDb();
  if (db) {
    try {
      const user = await db.collection('users').findOne({ _id: safeObjectId(id) });
      if (user) {
        return {
          id: user._id.toString(),
          username: user.username,
          passwordHash: user.passwordHash,
          role: user.role,
          tenantId: user.tenantId,
          status: user.status || 'ACTIVE',
          createdAt: user.createdAt,
        };
      }
      return null;
    } catch (e) {}
  }
  const data = initLocalDb();
  const user = data.users.find(u => u.id === id);
  if (user) {
    return { ...user, status: user.status || 'ACTIVE' };
  }
  return null;
}

export async function getUsersByTenant(tenantId: string): Promise<User[]> {
  const { db } = await connectDb();
  if (db) {
    try {
      const users = await db.collection('users').find({ tenantId }).toArray();
      return users.map(u => ({
        id: u._id.toString(),
        username: u.username,
        passwordHash: u.passwordHash,
        role: u.role,
        tenantId: u.tenantId,
        status: u.status || 'ACTIVE',
        createdAt: u.createdAt,
      }));
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.users.filter(u => u.tenantId === tenantId).map(u => ({ ...u, status: u.status || 'ACTIVE' }));
}

export async function getAllUsers(): Promise<User[]> {
  const { db } = await connectDb();
  if (db) {
    try {
      const users = await db.collection('users').find({}).toArray();
      return users.map(u => ({
        id: u._id.toString(),
        username: u.username,
        passwordHash: u.passwordHash,
        role: u.role,
        tenantId: u.tenantId,
        status: u.status || 'ACTIVE',
        createdAt: u.createdAt,
      }));
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.users.map(u => ({ ...u, status: u.status || 'ACTIVE' }));
}

export async function createUser(username: string, passwordHash: string, role: 'TENANT_ADMIN' | 'USER', tenantId: string, attribution?: Record<string, string>): Promise<User> {
  const { db } = await connectDb();
  const newUser = { username, passwordHash, role, tenantId, status: 'ACTIVE' as const, attribution, createdAt: new Date() };
  if (db) {
    try {
      const result = await db.collection('users').insertOne(newUser);
      return { id: result.insertedId.toString(), ...newUser };
    } catch (e) {}
  }
  const data = initLocalDb();
  const id = randomUUID();
  const localUser: User = { id, ...newUser };
  data.users.push(localUser);
  writeLocalDb(data);
  return localUser;
}

export async function updateUserStatus(id: string, status: 'ACTIVE' | 'LOCKED'): Promise<boolean> {
  const { db } = await connectDb();
  if (db) {
    try {
      const result = await db.collection('users').updateOne(
        { _id: safeObjectId(id) },
        { $set: { status } }
      );
      return result.modifiedCount > 0;
    } catch (e) {}
  }
  const data = initLocalDb();
  const idx = data.users.findIndex(u => u.id === id);
  if (idx >= 0) {
    data.users[idx].status = status;
    writeLocalDb(data);
    return true;
  }
  return false;
}

export async function updateUser(id: string, updates: Partial<Omit<User, 'id' | '_id' | 'createdAt'>>): Promise<boolean> {
  const { db } = await connectDb();
  if (db) {
    try {
      const result = await db.collection('users').updateOne(
        { _id: safeObjectId(id) },
        { $set: updates }
      );
      return result.modifiedCount > 0;
    } catch (e) {}
  }
  const data = initLocalDb();
  const idx = data.users.findIndex(u => u.id === id);
  if (idx >= 0) {
    data.users[idx] = { ...data.users[idx], ...updates };
    writeLocalDb(data);
    return true;
  }
  return false;
}

export async function deleteUser(id: string): Promise<boolean> {
  const { db } = await connectDb();
  if (db) {
    try {
      const result = await db.collection('users').deleteOne({ _id: safeObjectId(id) });
      return result.deletedCount > 0;
    } catch (e) {}
  }
  const data = initLocalDb();
  const len = data.users.length;
  data.users = data.users.filter(u => u.id !== id);
  if (data.users.length < len) {
    writeLocalDb(data);
    return true;
  }
  return false;
}

// ---- TRANSACTIONS ----

export async function getTransactions(tenantId: string, options: ListOptions = {}): Promise<Transaction[]> {
  const { limit, skip } = normalizeListOptions(options);
  const { db } = await connectDb();
  // Module 2: optional client scoping (spec §21 — client page transactions tab).
  const filter: Record<string, unknown> = { tenantId };
  if (options.clientId) filter.clientId = options.clientId;
  // Module 10 (§120/§129) — payment lineage probe: every transaction a
  // payment created (confirm Credit + reversal Debit).
  if (options.paymentId) filter.paymentId = options.paymentId;
  if (db) {
    try {
      const txs = await db.collection('transactions').find(filter).sort({ date: -1, createdAt: -1 }).skip(skip).limit(limit).toArray();
      return txs.map(t => ({
        id: t._id.toString(),
        tenantId: t.tenantId,
        userId: t.userId,
        username: t.username,
        accountId: t.accountId,
        clientId: t.clientId,
        // Module 3 §90 + Module 10 §94 — project and payment lineage (the
        // Mongo mapper previously DROPPED projectId; the local store kept it).
        projectId: t.projectId,
        invoiceId: t.invoiceId,
        paymentId: t.paymentId,
        type: t.type as 'Credit' | 'Debit',
        description: t.description,
        amount: Number(t.amount),
        date: t.date,
        category: t.category,
        notes: t.notes,
        createdAt: t.createdAt,
      }));
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.transactions
    .filter(t => t.tenantId === tenantId
      && (!options.clientId || t.clientId === options.clientId)
      && (!options.paymentId || t.paymentId === options.paymentId))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(skip, skip + limit);
}

export async function createTransaction(tx: Omit<Transaction, 'createdAt' | 'id' | '_id'>): Promise<Transaction> {
  const { db } = await connectDb();
  const newTx = { ...tx, amount: Number(tx.amount), createdAt: new Date() };
  if (db) {
    try {
      const result = await db.collection('transactions').insertOne(newTx);
      return { id: result.insertedId.toString(), ...newTx };
    } catch (e) {}
  }
  const data = initLocalDb();
  const id = randomUUID();
  const localTx: Transaction = { id, ...newTx };
  data.transactions.push(localTx);
  writeLocalDb(data);
  return localTx;
}

export async function updateTransaction(id: string, tenantId: string, tx: Partial<Omit<Transaction, 'id' | '_id' | 'tenantId' | 'userId' | 'createdAt'>>): Promise<boolean> {
  const { db } = await connectDb();
  const updateFields: Partial<Omit<Transaction, 'id' | '_id' | 'tenantId' | 'userId' | 'createdAt'>> = {};
  if (tx.type) updateFields.type = tx.type;
  if (tx.description) updateFields.description = tx.description;
  if (tx.amount !== undefined) updateFields.amount = Number(tx.amount);
  if (tx.date) updateFields.date = tx.date;
  if (tx.category !== undefined) updateFields.category = tx.category;
  if (tx.accountId !== undefined) updateFields.accountId = tx.accountId;
  if (tx.clientId !== undefined) updateFields.clientId = tx.clientId;
  if (tx.notes !== undefined) updateFields.notes = tx.notes;

  if (db) {
    try {
      const result = await db.collection('transactions').updateOne(
        { _id: safeObjectId(id), tenantId },
        { $set: updateFields }
      );
      return result.modifiedCount > 0;
    } catch (e) {}
  }
  const data = initLocalDb();
  const idx = data.transactions.findIndex(t => t.id === id && t.tenantId === tenantId);
  if (idx >= 0) {
    data.transactions[idx] = { ...data.transactions[idx], ...updateFields };
    writeLocalDb(data);
    return true;
  }
  return false;
}

export async function deleteTransaction(id: string, tenantId: string): Promise<boolean> {
  const { db } = await connectDb();
  if (db) {
    try {
      const result = await db.collection('transactions').deleteOne({ _id: safeObjectId(id), tenantId });
      return result.deletedCount > 0;
    } catch (e) {}
  }
  const data = initLocalDb();
  const len = data.transactions.length;
  data.transactions = data.transactions.filter(t => !(t.id === id && t.tenantId === tenantId));
  if (data.transactions.length < len) {
    writeLocalDb(data);
    return true;
  }
  return false;
}

// ---- ACCOUNTS ----

export async function getAccounts(tenantId: string): Promise<Account[]> {
  const { db } = await connectDb();
  if (db) {
    try {
      const accounts = await db.collection('accounts').find({ tenantId }).toArray();
      return accounts.map(a => ({
        id: a._id.toString(),
        tenantId: a.tenantId,
        name: a.name,
        type: a.type,
        initialBalance: Number(a.initialBalance),
        createdAt: a.createdAt,
      }));
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.accounts.filter(a => a.tenantId === tenantId);
}

/**
 * §113 (Module 10) — tenant-scoped single account: another tenant's account
 * and a missing one are IDENTICAL here (null). Used by payment confirmation
 * to verify the account the money enters.
 */
export async function getAccountById(id: string, tenantId: string): Promise<Account | null> {
  const { db } = await connectDb();
  if (db) {
    try {
      const account = await db.collection('accounts').findOne({ _id: safeObjectId(id), tenantId });
      return account ? {
        id: account._id.toString(),
        tenantId: account.tenantId,
        name: account.name,
        type: account.type,
        initialBalance: Number(account.initialBalance),
        createdAt: account.createdAt,
      } : null;
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.accounts.find(a => a.id === id && a.tenantId === tenantId) ?? null;
}

export async function createAccount(tenantId: string, name: string, type: string, initialBalance: number): Promise<Account> {
  const { db } = await connectDb();
  const newAccount = { tenantId, name, type, initialBalance: Number(initialBalance), createdAt: new Date() };
  if (db) {
    try {
      const result = await db.collection('accounts').insertOne(newAccount);
      return { id: result.insertedId.toString(), ...newAccount };
    } catch (e) {}
  }
  const data = initLocalDb();
  const id = randomUUID();
  const localAccount: Account = { id, ...newAccount };
  data.accounts.push(localAccount);
  writeLocalDb(data);
  return localAccount;
}

export async function deleteAccount(id: string, tenantId: string): Promise<boolean> {
  const { db } = await connectDb();
  if (db) {
    try {
      const result = await db.collection('accounts').deleteOne({ _id: safeObjectId(id), tenantId });
      return result.deletedCount > 0;
    } catch (e) {}
  }
  const data = initLocalDb();
  const len = data.accounts.length;
  data.accounts = data.accounts.filter(a => !(a.id === id && a.tenantId === tenantId));
  if (data.accounts.length < len) {
    writeLocalDb(data);
    return true;
  }
  return false;
}

// ---- CATEGORIES ----

export async function getCategories(tenantId: string): Promise<Category[]> {
  const { db } = await connectDb();
  if (db) {
    try {
      const cats = await db.collection('categories').find({ tenantId }).toArray();
      return cats.map(c => ({
        id: c._id.toString(),
        tenantId: c.tenantId,
        userId: c.userId,
        name: c.name,
        createdAt: c.createdAt,
      }));
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.categories.filter(c => c.tenantId === tenantId);
}

export async function createCategory(tenantId: string, userId: string, name: string): Promise<Category> {
  const { db } = await connectDb();
  const newCat = { tenantId, userId, name, createdAt: new Date() };
  if (db) {
    try {
      const result = await db.collection('categories').insertOne(newCat);
      return { id: result.insertedId.toString(), ...newCat };
    } catch (e) {}
  }
  const data = initLocalDb();
  const id = randomUUID();
  const localCat: Category = { id, ...newCat };
  data.categories.push(localCat);
  writeLocalDb(data);
  return localCat;
}

export async function deleteCategory(id: string, tenantId: string): Promise<boolean> {
  const { db } = await connectDb();
  if (db) {
    try {
      const result = await db.collection('categories').deleteOne({ _id: safeObjectId(id), tenantId });
      return result.deletedCount > 0;
    } catch (e) {}
  }
  const data = initLocalDb();
  const len = data.categories.length;
  data.categories = data.categories.filter(c => !(c.id === id && c.tenantId === tenantId));
  if (data.categories.length < len) {
    writeLocalDb(data);
    return true;
  }
  return false;
}

// ---- LOGS ----

export async function createLog(username: string, action: string, details: string, tenantId?: string, ipAddress?: string): Promise<SystemLog> {
  const { db } = await connectDb();
  const newLog = { username, action, details, tenantId, ipAddress, timestamp: new Date() };
  if (db) {
    try {
      const result = await db.collection('logs').insertOne(newLog);
      return { id: result.insertedId.toString(), ...newLog };
    } catch (e) {}
  }
  const data = initLocalDb();
  const id = randomUUID();
  const localLog: SystemLog = { id, ...newLog };
  data.logs.push(localLog);
  writeLocalDb(data);
  return localLog;
}

export async function getLogs(tenantId?: string, options: ListOptions = {}): Promise<SystemLog[]> {
  const { limit, skip } = normalizeListOptions(options);
  const { db } = await connectDb();
  if (db) {
    try {
      const query = tenantId ? { tenantId } : {};
      const logs = await db.collection('logs').find(query).sort({ timestamp: -1 }).skip(skip).limit(limit).toArray();
      return logs.map(l => ({
        id: l._id.toString(),
        tenantId: l.tenantId,
        username: l.username,
        action: l.action,
        details: l.details,
        ipAddress: l.ipAddress,
        timestamp: l.timestamp,
      }));
    } catch (e) {}
  }
  const data = initLocalDb();
  let logs = data.logs;
  if (tenantId) {
    logs = logs.filter(l => l.tenantId === tenantId);
  }
  return [...logs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(skip, skip + limit);
}

// ---- BUDGETS ----

export async function getBudgets(tenantId: string): Promise<Budget[]> {
  const { db } = await connectDb();
  if (db) {
    try {
      const budgets = await db.collection('budgets').find({ tenantId }).toArray();
      return budgets.map(b => ({
        id: b._id.toString(),
        tenantId: b.tenantId,
        category: b.category,
        limitAmount: Number(b.limitAmount),
        month: b.month,
        createdAt: b.createdAt,
      }));
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.budgets.filter(b => b.tenantId === tenantId);
}

export async function createBudget(tenantId: string, category: string, limitAmount: number, month: string): Promise<Budget> {
  const { db } = await connectDb();
  const newBudget = { tenantId, category, limitAmount: Number(limitAmount), month, createdAt: new Date() };
  if (db) {
    try {
      const result = await db.collection('budgets').findOneAndUpdate(
        { tenantId, category, month },
        { $set: newBudget },
        { upsert: true, returnDocument: 'after' }
      );
      const budget = result!;
      return { id: budget._id.toString(), tenantId: budget.tenantId, category: budget.category, limitAmount: Number(budget.limitAmount), month: budget.month, createdAt: budget.createdAt };
    } catch (e) {}
  }
  const data = initLocalDb();
  const id = randomUUID();
  const localBudget: Budget = { id, ...newBudget };
  
  // Replace existing budget for this category/month
  const existingIdx = data.budgets.findIndex(b => b.tenantId === tenantId && b.category === category && b.month === month);
  if (existingIdx >= 0) {
    data.budgets[existingIdx] = localBudget;
  } else {
    data.budgets.push(localBudget);
  }
  
  writeLocalDb(data);
  return localBudget;
}

// ---- RECURRING TRANSACTIONS ----

export async function getRecurringTransactions(tenantId: string): Promise<RecurringTransaction[]> {
  const { db } = await connectDb();
  if (db) {
    try {
      const rts = await db.collection('recurring').find({ tenantId }).toArray();
      return rts.map(r => ({
        id: r._id.toString(),
        tenantId: r.tenantId,
        userId: r.userId,
        username: r.username,
        accountId: r.accountId,
        type: r.type,
        description: r.description,
        amount: Number(r.amount),
        category: r.category,
        interval: r.interval,
        lastRunDate: r.lastRunDate,
        nextRunDate: r.nextRunDate,
        createdAt: r.createdAt,
      }));
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.recurring.filter(r => r.tenantId === tenantId);
}

export async function createRecurringTransaction(data: Omit<RecurringTransaction, 'id' | '_id' | 'createdAt'>): Promise<RecurringTransaction> {
  const { db } = await connectDb();
  const newRT = { ...data, amount: Number(data.amount), createdAt: new Date() };
  if (db) {
    try {
      const result = await db.collection('recurring').insertOne(newRT);
      return { id: result.insertedId.toString(), ...newRT };
    } catch (e) {}
  }
  const localData = initLocalDb();
  const id = randomUUID();
  const localRT: RecurringTransaction = { id, ...newRT };
  localData.recurring.push(localRT);
  writeLocalDb(localData);
  return localRT;
}

type RecurringTransactionUpdate = Partial<Omit<RecurringTransaction, 'id' | '_id' | 'tenantId' | 'userId' | 'username' | 'createdAt'>>;

export async function updateRecurringTransaction(id: string, tenantId: string, updateFields: RecurringTransactionUpdate): Promise<boolean> {
  const { db } = await connectDb();
  if (db) {
    try {
      const result = await db.collection('recurring').updateOne(
        { _id: safeObjectId(id), tenantId },
        { $set: updateFields }
      );
      return result.modifiedCount > 0;
    } catch (e) {}
  }
  const data = initLocalDb();
  const idx = data.recurring.findIndex(r => r.id === id && r.tenantId === tenantId);
  if (idx >= 0) {
    data.recurring[idx] = { ...data.recurring[idx], ...updateFields };
    writeLocalDb(data);
    return true;
  }
  return false;
}

export async function deleteRecurringTransaction(id: string, tenantId: string): Promise<boolean> {
  const { db } = await connectDb();
  if (db) {
    try {
      const result = await db.collection('recurring').deleteOne({ _id: safeObjectId(id), tenantId });
      return result.deletedCount > 0;
    } catch (e) {}
  }
  const data = initLocalDb();
  const len = data.recurring.length;
  data.recurring = data.recurring.filter(r => !(r.id === id && r.tenantId === tenantId));
  if (data.recurring.length < len) {
    writeLocalDb(data);
    return true;
  }
  return false;
}

// ---- CLIENTS ----

/**
 * Map a stored client document to the Client shape, resolving the Module 2
 * nullable expansion (§17/§106): clients created before Module 2 carry no
 * status — they resolve to the non-destructive default ACTIVE on read.
 * Historical documents are never rewritten.
 */
function mapClientDoc(c: Record<string, unknown>): Client {
  return {
    id: (c._id as ObjectId).toString(),
    tenantId: c.tenantId as string,
    name: c.name as string,
    email: c.email as string | undefined,
    createdAt: c.createdAt as Date,
    legalName: c.legalName as string | undefined,
    website: c.website as string | undefined,
    phone: c.phone as string | undefined,
    industry: c.industry as string | undefined,
    notes: c.notes as string | undefined,
    primaryContact: c.primaryContact as ClientPrimaryContact | undefined,
    billingProfile: c.billingProfile as ClientBillingProfile | undefined,
    taxProfile: c.taxProfile as ClientTaxProfile | undefined,
    commercialDefaults: c.commercialDefaults as ClientCommercialDefaults | undefined,
    status: (c.status as ClientStatus | undefined) ?? 'ACTIVE',
    updatedAt: c.updatedAt as Date | undefined,
  };
}

export async function getClients(tenantId: string, options: ListOptions = {}): Promise<Client[]> {
  const { limit, skip } = normalizeListOptions(options);
  const { db } = await connectDb();
  if (db) {
    try {
      const clients = await db.collection('clients').find({ tenantId }).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray();
      return clients.map(mapClientDoc);
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.clients
    .filter(c => c.tenantId === tenantId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(skip, skip + limit)
    .map(c => ({ ...c, status: c.status ?? 'ACTIVE' }));
}

/** Agency client creation input (Module 2, spec §23–§24) — all agency fields optional. */
export interface ClientCreateInput {
  name: string;
  email?: string;
  legalName?: string;
  website?: string;
  phone?: string;
  industry?: string;
  notes?: string;
  primaryContact?: ClientPrimaryContact;
  billingProfile?: ClientBillingProfile;
  taxProfile?: ClientTaxProfile;
  commercialDefaults?: ClientCommercialDefaults;
  status?: ClientStatus;
}

export async function createClient(tenantId: string, name: string, email?: string, agency?: ClientCreateInput): Promise<Client> {
  const { db } = await connectDb();
  const now = new Date();
  // Module 2: agency fields ride alongside the legacy (name, email) signature;
  // legacy callers pass no `agency` object and get the exact old behavior.
  // Status defaults to ACTIVE (§106) — creation may explicitly set PROSPECT.
  const newClient: Record<string, unknown> = {
    tenantId, name, email,
    // §18/§32 — duplicate detection column: case/whitespace-insensitive
    normalizedName: normalizeClientName(name),
    ...(agency?.legalName !== undefined && { legalName: agency.legalName }),
    ...(agency?.website !== undefined && { website: agency.website }),
    ...(agency?.phone !== undefined && { phone: agency.phone }),
    ...(agency?.industry !== undefined && { industry: agency.industry }),
    ...(agency?.notes !== undefined && { notes: agency.notes }),
    ...(agency?.primaryContact && { primaryContact: agency.primaryContact }),
    ...(agency?.billingProfile && { billingProfile: agency.billingProfile }),
    ...(agency?.taxProfile && { taxProfile: agency.taxProfile }),
    ...(agency?.commercialDefaults && { commercialDefaults: agency.commercialDefaults }),
    status: agency?.status ?? 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  };
  if (db) {
    try {
      const result = await db.collection('clients').insertOne(newClient);
      return mapClientDoc({ ...newClient, _id: result.insertedId });
    } catch (e) {}
  }
  const data = initLocalDb();
  const id = randomUUID();
  const localClient: Client = { id, ...newClient } as Client;
  data.clients.push(localClient);
  writeLocalDb(data);
  return { ...localClient, status: localClient.status ?? 'ACTIVE' };
}

export async function deleteClient(id: string, tenantId: string): Promise<boolean> {
  const { db } = await connectDb();
  if (db) {
    try {
      const result = await db.collection('clients').deleteOne({ _id: safeObjectId(id), tenantId });
      return result.deletedCount > 0;
    } catch (e) {}
  }
  const data = initLocalDb();
  const len = data.clients.length;
  data.clients = data.clients.filter(c => !(c.id === id && c.tenantId === tenantId));
  if (data.clients.length < len) {
    writeLocalDb(data);
    return true;
  }
  return false;
}

// ---- GLOBAL ANALYTICS ----

export async function getGlobalAnalytics() {
  const { db } = await connectDb();
  if (db) {
    try {
      const totalTenants = await db.collection('tenants').countDocuments();
      const totalUsers = await db.collection('users').countDocuments();
      const totalTransactions = await db.collection('transactions').countDocuments();
      const failedLogins = await db.collection('logs').countDocuments({ action: 'FAILED_LOGIN' });
      const recentLogs = await db.collection('logs').find().sort({ timestamp: -1 }).limit(10).toArray();
      
      return { totalTenants, totalUsers, totalTransactions, failedLogins, recentLogs: recentLogs.map(l => ({...l, _id: l._id.toString()})) };
    } catch (e) {}
  }
  const data = initLocalDb();
  return {
    totalTenants: data.tenants.length,
    totalUsers: data.users.length,
    totalTransactions: data.transactions.length,
    failedLogins: data.logs.filter(l => l.action === 'FAILED_LOGIN').length,
    recentLogs: data.logs.sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 10),
  };
}

// ---- GROWTH INTELLIGENCE AGGREGATIONS ----

export async function getGrowthMetrics() {
  const { db } = await connectDb();
  let signups = 0, newWorkspaces = 0, transactionsCreated = 0, budgetsCreated = 0, reportsGenerated = 0, teamInvitesSent = 0;
  
  if (db) {
    try {
      signups = await db.collection('users').countDocuments();
      newWorkspaces = await db.collection('tenants').countDocuments();
      transactionsCreated = await db.collection('transactions').countDocuments();
      budgetsCreated = await db.collection('budgets').countDocuments();
      reportsGenerated = await db.collection('logs').countDocuments({ action: 'Report Exported' });
      teamInvitesSent = await db.collection('logs').countDocuments({ action: 'Team Member Invited' });
    } catch (e) {}
  } else {
    const data = initLocalDb();
    signups = data.users.length;
    newWorkspaces = data.tenants.length;
    transactionsCreated = data.transactions.length;
    budgetsCreated = data.budgets.length;
    reportsGenerated = data.logs.filter(l => l.action === 'Report Exported').length;
    teamInvitesSent = data.logs.filter(l => l.action === 'Team Member Invited').length;
  }
  
  return { signups, newWorkspaces, transactionsCreated, budgetsCreated, reportsGenerated, teamInvitesSent };
}

export async function getFinancialAggregates() {
  const { db } = await connectDb();
  let totalTransactions = 0, totalVolume = 0, totalBudgets = 0, totalReports = 0, totalClients = 0, recurringTransactions = 0;

  if (db) {
    try {
      totalTransactions = await db.collection('transactions').countDocuments();
      const volAgg = await db.collection('transactions').aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]).toArray();
      totalVolume = volAgg.length > 0 ? volAgg[0].total : 0;
      totalBudgets = await db.collection('budgets').countDocuments();
      totalReports = await db.collection('logs').countDocuments({ action: 'Report Exported' });
      totalClients = await db.collection('clients').countDocuments();
      recurringTransactions = await db.collection('recurring').countDocuments();
    } catch (e) {}
  } else {
    const data = initLocalDb();
    totalTransactions = data.transactions.length;
    totalVolume = data.transactions.reduce((sum, t) => sum + t.amount, 0);
    totalBudgets = data.budgets.length;
    totalReports = data.logs.filter(l => l.action === 'Report Exported').length;
    totalClients = data.clients.length;
    recurringTransactions = data.recurring.length;
  }

  return { totalTransactions, totalVolume, totalBudgets, totalReports, totalClients, recurringTransactions };
}

export async function getWorkspaceHealth() {
  const { db } = await connectDb();
  let totalWorkspaces = 0, activeWorkspaces = 0, dormantWorkspaces = 0, avgUsersPerWorkspace = 0, avgAgeDays = 0;

  if (db) {
    try {
      totalWorkspaces = await db.collection('tenants').countDocuments();
      const active = await db.collection('logs').distinct('tenantId', { timestamp: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } });
      activeWorkspaces = active.length;
      dormantWorkspaces = Math.max(0, totalWorkspaces - activeWorkspaces);
      
      const usersCount = await db.collection('users').countDocuments();
      avgUsersPerWorkspace = totalWorkspaces > 0 ? usersCount / totalWorkspaces : 0;
      
      const tenants = await db.collection('tenants').find({}).toArray();
      const now = Date.now();
      const totalAgeMs = tenants.reduce((sum, t) => sum + (now - new Date(t.createdAt).getTime()), 0);
      avgAgeDays = tenants.length > 0 ? (totalAgeMs / tenants.length) / (1000 * 60 * 60 * 24) : 0;
    } catch (e) {}
  } else {
    const data = initLocalDb();
    totalWorkspaces = data.tenants.length;
    const activeThreshold = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const activeTenantIds = new Set(data.logs.filter(l => new Date(l.timestamp).getTime() >= activeThreshold).map(l => l.tenantId));
    activeWorkspaces = activeTenantIds.size;
    dormantWorkspaces = Math.max(0, totalWorkspaces - activeWorkspaces);
    avgUsersPerWorkspace = totalWorkspaces > 0 ? data.users.length / totalWorkspaces : 0;
    
    const now = Date.now();
    const totalAgeMs = data.tenants.reduce((sum, t) => sum + (now - new Date(t.createdAt).getTime()), 0);
    avgAgeDays = totalWorkspaces > 0 ? (totalAgeMs / totalWorkspaces) / (1000 * 60 * 60 * 24) : 0;
  }

  const healthScore = totalWorkspaces > 0 ? Math.round((activeWorkspaces / totalWorkspaces) * 100) : 0;

  return { totalWorkspaces, activeWorkspaces, dormantWorkspaces, workspacesCreated: totalWorkspaces, workspacesDeleted: 0, avgAgeDays, avgUsersPerWorkspace, healthScore };
}

export async function getUTMAcquisitionStats() {
  const { db } = await connectDb();
  const sources: Record<string, number> = {};
  const mediums: Record<string, number> = {};
  const campaigns: Record<string, number> = {};

  if (db) {
    try {
      const tenants = await db.collection('tenants').find({ attribution: { $exists: true } }).toArray();
      tenants.forEach(t => {
        const attr = t.attribution || {};
        if (attr.utm_source) sources[attr.utm_source] = (sources[attr.utm_source] || 0) + 1;
        if (attr.utm_medium) mediums[attr.utm_medium] = (mediums[attr.utm_medium] || 0) + 1;
        if (attr.utm_campaign) campaigns[attr.utm_campaign] = (campaigns[attr.utm_campaign] || 0) + 1;
      });
    } catch (e) {}
  } else {
    const data = initLocalDb();
    data.tenants.forEach(t => {
      if (t.attribution) {
        if (t.attribution.utm_source) sources[t.attribution.utm_source] = (sources[t.attribution.utm_source] || 0) + 1;
        if (t.attribution.utm_medium) mediums[t.attribution.utm_medium] = (mediums[t.attribution.utm_medium] || 0) + 1;
        if (t.attribution.utm_campaign) campaigns[t.attribution.utm_campaign] = (campaigns[t.attribution.utm_campaign] || 0) + 1;
      }
    });
  }
  
  return { sources, mediums, campaigns };
}



type AccountUpdate = Partial<Omit<Account, 'id' | '_id' | 'tenantId' | 'createdAt'>>;

export async function updateAccount(id: string, tenantId: string, updates: AccountUpdate): Promise<boolean> {
  const { db } = await connectDb();
  if (db) {
    try {
      const result = await db.collection('accounts').updateOne({ _id: safeObjectId(id), tenantId }, { $set: updates });
      return result.modifiedCount > 0;
    } catch (e) {}
  }
  const data = initLocalDb();
  const idx = data.accounts.findIndex(a => a.id === id && a.tenantId === tenantId);
  if (idx >= 0) {
    data.accounts[idx] = { ...data.accounts[idx], ...updates };
    writeLocalDb(data);
    return true;
  }
  return false;
}

export async function updateCategory(id: string, tenantId: string, name: string): Promise<boolean> {
  const { db } = await connectDb();
  if (db) {
    try {
      const result = await db.collection('categories').updateOne({ _id: safeObjectId(id), tenantId }, { $set: { name } });
      return result.modifiedCount > 0;
    } catch (e) {}
  }
  const data = initLocalDb();
  const idx = data.categories.findIndex(c => c.id === id && c.tenantId === tenantId);
  if (idx >= 0) {
    data.categories[idx].name = name;
    writeLocalDb(data);
    return true;
  }
  return false;
}

export async function updateBudget(id: string, tenantId: string, limitAmount: number): Promise<boolean> {
  const { db } = await connectDb();
  if (db) {
    try {
      const result = await db.collection('budgets').updateOne({ _id: safeObjectId(id), tenantId }, { $set: { limitAmount: Number(limitAmount) } });
      return result.modifiedCount > 0;
    } catch (e) {}
  }
  const data = initLocalDb();
  const idx = data.budgets.findIndex(b => b.id === id && b.tenantId === tenantId);
  if (idx >= 0) {
    data.budgets[idx].limitAmount = Number(limitAmount);
    writeLocalDb(data);
    return true;
  }
  return false;
}

export async function deleteBudget(id: string, tenantId: string): Promise<boolean> {
  const { db } = await connectDb();
  if (db) {
    try {
      const result = await db.collection('budgets').deleteOne({ _id: safeObjectId(id), tenantId });
      return result.deletedCount > 0;
    } catch (e) {}
  }
  const data = initLocalDb();
  const len = data.budgets.length;
  data.budgets = data.budgets.filter(b => !(b.id === id && b.tenantId === tenantId));
  if (data.budgets.length < len) {
    writeLocalDb(data);
    return true;
  }
  return false;
}

type ClientUpdate = Partial<Omit<Client, 'id' | '_id' | 'tenantId' | 'createdAt'>>;

export async function updateClient(id: string, tenantId: string, updates: ClientUpdate): Promise<boolean> {
  const { db } = await connectDb();
  // Module 2: every edit stamps updatedAt (§16 audit metadata). A rename
  // also restamps normalizedName so the duplicate probe stays in sync (§32).
  const stamped: Record<string, unknown> = { ...updates, updatedAt: new Date() };
  if (typeof updates.name === 'string') {
    stamped.normalizedName = normalizeClientName(updates.name);
  }
  if (db) {
    try {
      const result = await db.collection('clients').updateOne({ _id: safeObjectId(id), tenantId }, { $set: stamped });
      return result.modifiedCount > 0;
    } catch (e) {}
  }
  const data = initLocalDb();
  const idx = data.clients.findIndex(c => c.id === id && c.tenantId === tenantId);
  if (idx >= 0) {
    data.clients[idx] = { ...data.clients[idx], ...stamped };
    writeLocalDb(data);
    return true;
  }
  return false;
}

/**
 * Fetch ONE client by id, tenant-scoped. Returns null when missing OR owned
 * by another tenant — callers treat both as "not found" (spec §113: never
 * reveal that a resource exists in another tenant).
 */
export async function getClientById(id: string, tenantId: string): Promise<Client | null> {
  const { db } = await connectDb();
  if (db) {
    try {
      const c = await db.collection('clients').findOne({ _id: safeObjectId(id), tenantId });
      return c ? mapClientDoc(c as unknown as Record<string, unknown>) : null;
    } catch (e) {}
  }
  const data = initLocalDb();
  const c = data.clients.find(c => c.id === id && c.tenantId === tenantId);
  return c ? { ...c, status: c.status ?? 'ACTIVE' } : null;
}

/**
 * Client search (spec §19): by name, email, or legalName — tenant-scoped,
 * indexed, paginated. Case-insensitive prefix/substring on a regex anchored
 * to the tenantId + name indexes.
 */
export async function searchClients(
  tenantId: string,
  query: string,
  options: ListOptions = {}
): Promise<Client[]> {
  const { limit, skip } = normalizeListOptions(options);
  const q = query.trim();
  if (!q) return getClients(tenantId, options);

  // Escape regex metacharacters — the query is user input.
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const filter = {
    tenantId,
    $or: [
      { name: { $regex: escaped, $options: 'i' } },
      { email: { $regex: escaped, $options: 'i' } },
      { legalName: { $regex: escaped, $options: 'i' } },
    ],
  };

  const { db } = await connectDb();
  if (db) {
    try {
      const clients = await db.collection('clients').find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray();
      return clients.map(mapClientDoc);
    } catch (e) {}
  }
  const data = initLocalDb();
  const lower = q.toLowerCase();
  return data.clients
    .filter(c => c.tenantId === tenantId)
    .filter(c =>
      c.name?.toLowerCase().includes(lower) ||
      c.email?.toLowerCase().includes(lower) ||
      c.legalName?.toLowerCase().includes(lower)
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(skip, skip + limit)
    .map(c => ({ ...c, status: c.status ?? 'ACTIVE' }));
}

/**
 * Duplicate-name probe (spec §18): WARN, never auto-reject. Returns matching
 * clients for the same tenantId + normalized name so the caller can offer
 * Create Anyway / View Existing / Cancel. Subsidiaries and duplicate legal
 * entities are legitimate — this is advisory only.
 */
export async function findClientByName(tenantId: string, name: string): Promise<Client[]> {
  // §18/§32 — the probe is case/whitespace-insensitive. New writes carry a
  // normalizedName column (indexed); legacy docs without it fall back to the
  // regex on the display name.
  const normalized = normalizeClientName(name);
  const { db } = await connectDb();
  if (db) {
    try {
      const clients = await db.collection('clients')
        .find({
          tenantId,
          $or: [
            { normalizedName: normalized },
            { normalizedName: { $exists: false }, name: { $regex: `^${normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } },
          ],
        })
        .limit(5)
        .toArray();
      return clients.map(mapClientDoc);
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.clients
    .filter(c => c.tenantId === tenantId && normalizeClientName(c.name) === normalized)
    .slice(0, 5)
    .map(c => ({ ...c, status: c.status ?? 'ACTIVE' }));
}

// ---- PROJECTS (Module 3, spec §36–§96) ----

/**
 * Map a stored project document to the Project shape. Status defaults to
 * DRAFT on read (§74) — defensive only, since projects are new in Module 3
 * and every write stamps a status. `code`/`tags` and all commercial fields
 * stay optional: a draft may have no commercial value yet (§37).
 */
function mapProjectDoc(p: Record<string, unknown>): Project {
  return {
    id: (p._id as ObjectId).toString(),
    tenantId: p.tenantId as string,
    clientId: p.clientId as string,
    name: p.name as string,
    code: p.code as string | undefined,
    normalizedCode: p.normalizedCode as string | undefined,
    description: p.description as string | undefined,
    status: (p.status as ProjectStatus | undefined) ?? 'DRAFT',
    billingModel: p.billingModel as BillingModel,
    currency: p.currency as string,
    startDate: p.startDate as string | undefined,
    endDate: p.endDate as string | undefined,
    contractValue: p.contractValue as number | undefined,
    revenueBudget: p.revenueBudget as number | undefined,
    budgetCost: p.budgetCost as number | undefined,
    targetMargin: p.targetMargin as number | undefined,
    plannedHours: p.plannedHours as number | undefined,
    projectManagerId: p.projectManagerId as string | undefined,
    projectType: p.projectType as string | undefined,
    tags: p.tags as string[] | undefined,
    createdAt: p.createdAt as Date,
    updatedAt: p.updatedAt as Date | undefined,
  };
}

function mapProjectMemberDoc(m: Record<string, unknown>): ProjectMember {
  return {
    id: (m._id as ObjectId).toString(),
    tenantId: m.tenantId as string,
    projectId: m.projectId as string,
    userId: m.userId as string,
    role: m.role as string | undefined,
    allocationPercent: m.allocationPercent as number | undefined,
    startDate: m.startDate as string | undefined,
    endDate: m.endDate as string | undefined,
    // Module 5 §37 — legacy rows predate the flag; they are active members
    // (§106 spirit: read-time default, never rewrite history).
    active: (m.active as boolean) ?? true,
    createdAt: m.createdAt as Date,
    updatedAt: m.updatedAt as Date | undefined,
  };
}

function mapWorkItemDoc(w: Record<string, unknown>): WorkItem {
  return {
    id: (w._id as ObjectId).toString(),
    tenantId: w.tenantId as string,
    projectId: w.projectId as string,
    name: w.name as string,
    description: w.description as string | undefined,
    status: (w.status as WorkItemStatus | undefined) ?? 'NOT_STARTED',
    estimatedMinutes: w.estimatedMinutes as number | undefined,
    assignedTo: w.assignedTo as string | undefined,
    sortOrder: (w.sortOrder as number | undefined) ?? 0,
    createdBy: (w.createdBy as string | undefined) ?? '',
    createdAt: w.createdAt as Date,
    updatedAt: w.updatedAt as Date | undefined,
  };
}

function mapProjectMilestoneDoc(m: Record<string, unknown>): ProjectMilestone {
  return {
    id: (m._id as ObjectId).toString(),
    tenantId: m.tenantId as string,
    projectId: m.projectId as string,
    name: m.name as string,
    description: m.description as string | undefined,
    sequence: m.sequence as number,
    amount: m.amount as number | undefined,
    percentage: m.percentage as number | undefined,
    dueDate: m.dueDate as string | undefined,
    status: (m.status as MilestoneStatus | undefined) ?? 'PLANNED',
    // Module 9 (§62/§64) — billing lifecycle; legacy rows read UNBILLED (§106).
    billingStatus: (m.billingStatus as ProjectMilestone['billingStatus'] | undefined) ?? 'UNBILLED',
    invoiceId: (m.invoiceId as string | null | undefined) ?? undefined,
    reservedBy: (m.reservedBy as string | null | undefined) ?? undefined,
    reservedAt: (m.reservedAt as Date | string | null | undefined) ?? undefined,
    reservedInvoiceId: (m.reservedInvoiceId as string | null | undefined) ?? undefined,
    createdAt: m.createdAt as Date,
    updatedAt: m.updatedAt as Date | undefined,
  };
}

/** Filter surface for project lists (spec §69: status, billing model, PM, client). */
export interface ProjectListFilters {
  status?: ProjectStatus;
  billingModel?: BillingModel;
  clientId?: string;
  projectManagerId?: string;
  /** §40 — ARCHIVED is removed from default operational views unless asked for. */
  includeArchived?: boolean;
}

function projectFilter(tenantId: string, filters: ProjectListFilters = {}): Record<string, unknown> {
  const filter: Record<string, unknown> = { tenantId };
  if (filters.status) {
    filter.status = filters.status;
  } else if (!filters.includeArchived) {
    filter.status = { $ne: 'ARCHIVED' };
  }
  if (filters.billingModel) filter.billingModel = filters.billingModel;
  if (filters.clientId) filter.clientId = filters.clientId;
  if (filters.projectManagerId) filter.projectManagerId = filters.projectManagerId;
  return filter;
}

export async function getProjects(
  tenantId: string,
  options: ListOptions = {},
  filters: ProjectListFilters = {}
): Promise<Project[]> {
  const { limit, skip } = normalizeListOptions(options);
  const filter = projectFilter(tenantId, filters);
  const { db } = await connectDb();
  if (db) {
    try {
      const projects = await db.collection('projects').find(filter).sort(projectMongoSort(options.sort)).skip(skip).limit(limit).toArray();
      return projects.map(mapProjectDoc);
    } catch (e) {}
  }
  const data = initLocalDb();
  const matchesFilter = (p: Project) => Object.entries(filter).every(([key, value]) => {
    if (value && typeof value === 'object' && '$ne' in (value as Record<string, unknown>)) {
      return p[key as keyof Project] !== (value as { $ne: unknown }).$ne;
    }
    return p[key as keyof Project] === value;
  });
  return sortProjectsLocally(data.projects.filter(matchesFilter), options.sort)
    .slice(skip, skip + limit);
}

/** Project creation input (Module 3, §37) — everything beyond the required core is optional. */
export interface ProjectCreateInput {
  clientId: string;
  name: string;
  code?: string;
  description?: string;
  status?: ProjectStatus;
  billingModel: BillingModel;
  currency: string;
  startDate?: string;
  endDate?: string;
  contractValue?: number;
  revenueBudget?: number;
  budgetCost?: number;
  targetMargin?: number;
  plannedHours?: number;
  projectManagerId?: string;
  projectType?: string;
  tags?: string[];
}

export async function createProject(tenantId: string, input: ProjectCreateInput): Promise<Project> {
  const { db } = await connectDb();
  const now = new Date();
  // Status defaults to DRAFT (§74) — create now, configure later, activate when ready.
  const newProject: Record<string, unknown> = {
    tenantId,
    clientId: input.clientId,
    name: input.name,
    ...(input.code !== undefined && { code: input.code, normalizedCode: input.code.trim().toUpperCase() }),
    ...(input.description !== undefined && { description: input.description }),
    status: input.status ?? 'DRAFT',
    billingModel: input.billingModel,
    currency: input.currency,
    ...(input.startDate !== undefined && { startDate: input.startDate }),
    ...(input.endDate !== undefined && { endDate: input.endDate }),
    ...(input.contractValue !== undefined && { contractValue: input.contractValue }),
    ...(input.revenueBudget !== undefined && { revenueBudget: input.revenueBudget }),
    ...(input.budgetCost !== undefined && { budgetCost: input.budgetCost }),
    ...(input.targetMargin !== undefined && { targetMargin: input.targetMargin }),
    ...(input.plannedHours !== undefined && { plannedHours: input.plannedHours }),
    ...(input.projectManagerId !== undefined && { projectManagerId: input.projectManagerId }),
    ...(input.projectType !== undefined && { projectType: input.projectType }),
    ...(input.tags !== undefined && { tags: input.tags }),
    createdAt: now,
    updatedAt: now,
  };
  if (db) {
    try {
      const result = await db.collection('projects').insertOne(newProject);
      return mapProjectDoc({ ...newProject, _id: result.insertedId });
    } catch (e) {}
  }
  const data = initLocalDb();
  const id = randomUUID();
  const localProject: Project = { id, ...newProject } as unknown as Project;
  data.projects.push(localProject);
  writeLocalDb(data);
  return localProject;
}

/**
 * Fetch ONE project by id, tenant-scoped. Returns null when missing OR owned
 * by another tenant — callers treat both as "not found" (spec §113: never
 * reveal that a resource exists in another tenant).
 */
export async function getProjectById(id: string, tenantId: string): Promise<Project | null> {
  const { db } = await connectDb();
  if (db) {
    try {
      const p = await db.collection('projects').findOne({ _id: safeObjectId(id), tenantId });
      return p ? mapProjectDoc(p as unknown as Record<string, unknown>) : null;
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.projects.find(p => p.id === id && p.tenantId === tenantId) ?? null;
}

export type ProjectUpdate = Partial<Omit<Project, 'id' | 'tenantId' | 'createdAt' | 'clientId'>>;

/**
 * §111 — duplicate-project-code probe. Looks up by (tenantId, normalizedCode)
 * so "acme-web-001" and "ACME-WEB-001" collide, matching the unique index.
 * The caller excludes a project's own id (a re-setting of the same code is
 * not a duplicate). Local fallback matches `normalizedCode ?? code`.
 */
export async function findProjectByCode(
  tenantId: string,
  code: string,
  excludeProjectId?: string
): Promise<Project | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;
  const { db } = await connectDb();
  if (db) {
    try {
      const p = await db.collection('projects').findOne({ tenantId, normalizedCode: normalized });
      if (!p) return null;
      const mapped = mapProjectDoc(p as unknown as Record<string, unknown>);
      return mapped.id === excludeProjectId ? null : mapped;
    } catch (e) {}
  }
  const data = initLocalDb();
  const hit = data.projects.find(p =>
    p.tenantId === tenantId
    && p.id !== excludeProjectId
    && (p.normalizedCode ?? p.code)?.trim().toUpperCase() === normalized
  );
  return hit ?? null;
}

export async function updateProject(id: string, tenantId: string, updates: ProjectUpdate): Promise<boolean> {
  const { db } = await connectDb();
  // Every edit stamps updatedAt; financial-field changes are audited by the
  // domain service (§87–§88) — the repository is deliberately write-agnostic.
  const stamped: Record<string, unknown> = { ...updates, updatedAt: new Date() };
  // §111 — keep the uniqueness probe in sync whenever a code is (re)set.
  if (typeof updates.code === 'string') {
    stamped.normalizedCode = updates.code.trim().toUpperCase();
  }
  if (db) {
    try {
      const result = await db.collection('projects').updateOne({ _id: safeObjectId(id), tenantId }, { $set: stamped });
      return result.modifiedCount > 0;
    } catch (e) {}
  }
  const data = initLocalDb();
  const idx = data.projects.findIndex(p => p.id === id && p.tenantId === tenantId);
  if (idx >= 0) {
    data.projects[idx] = { ...data.projects[idx], ...stamped } as Project;
    writeLocalDb(data);
    return true;
  }
  return false;
}

/**
 * Project search (spec §69): by name, code, or CLIENT name — tenant-scoped,
 * paginated, filter-composable. The client-name leg resolves tenant client
 * ids first, then matches projects pointing at them.
 */
export async function searchProjects(
  tenantId: string,
  query: string,
  options: ListOptions = {},
  filters: ProjectListFilters = {}
): Promise<Project[]> {
  const { limit, skip } = normalizeListOptions(options);
  const q = query.trim();
  if (!q) return getProjects(tenantId, options, filters);

  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = { $regex: escaped, $options: 'i' };
  const { db } = await connectDb();
  if (db) {
    try {
      const clientIds = await db.collection('clients')
        .find({ tenantId, name: regex })
        .limit(50)
        .map(c => (c._id as ObjectId).toString())
        .toArray();
      const filter = {
        ...projectFilter(tenantId, filters),
        $or: [
          { name: regex },
          { code: regex },
          ...(clientIds.length > 0 ? [{ clientId: { $in: clientIds } }] : []),
        ],
      };
      const projects = await db.collection('projects').find(filter).sort(projectMongoSort(options.sort)).skip(skip).limit(limit).toArray();
      return projects.map(mapProjectDoc);
    } catch (e) {}
  }
  const data = initLocalDb();
  const lower = q.toLowerCase();
  const clientIds = new Set(
    data.clients
      .filter(c => c.tenantId === tenantId && c.name.toLowerCase().includes(lower))
      .map(c => c.id)
  );
  const base = data.projects.filter(p => Object.entries(projectFilter(tenantId, filters)).every(([key, value]) => {
    if (value && typeof value === 'object' && '$ne' in (value as Record<string, unknown>)) {
      return p[key as keyof Project] !== (value as { $ne: unknown }).$ne;
    }
    return p[key as keyof Project] === value;
  }));
  return sortProjectsLocally(base
    .filter(p => p.name.toLowerCase().includes(lower)
      || (p.code?.toLowerCase().includes(lower) ?? false)
      || clientIds.has(p.clientId)), options.sort)
    .slice(skip, skip + limit);
}

// ---- PROJECT MEMBERS (Module 3, spec §59–§60) ----

export async function getProjectMembers(
  projectId: string,
  tenantId: string,
  options: { includeInactive?: boolean } = {}
): Promise<ProjectMember[]> {
  const { db } = await connectDb();
  if (db) {
    try {
      // Module 5 §37 — active memberships by default; inactive history is
      // opt-in (audit / time-record questions). `active: {$ne: false}` keeps
      // legacy flag-less rows visible as active.
      const query: Record<string, unknown> = options.includeInactive
        ? { tenantId, projectId }
        : { tenantId, projectId, active: { $ne: false } };
      const members = await db.collection('project_members')
        .find(query)
        .sort({ createdAt: 1 })
        .toArray();
      return members.map(mapProjectMemberDoc);
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.projectMembers
    .filter(m => m.tenantId === tenantId && m.projectId === projectId
      && (options.includeInactive || m.active !== false))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export interface ProjectMemberCreateInput {
  userId: string;
  role?: string;
  allocationPercent?: number;
  startDate?: string;
  endDate?: string;
}

export async function createProjectMember(
  tenantId: string,
  projectId: string,
  input: ProjectMemberCreateInput
): Promise<ProjectMember> {
  const { db } = await connectDb();
  const now = new Date();
  const newMember: Record<string, unknown> = {
    tenantId,
    projectId,
    userId: input.userId,
    ...(input.role !== undefined && { role: input.role }),
    ...(input.allocationPercent !== undefined && { allocationPercent: input.allocationPercent }),
    ...(input.startDate !== undefined && { startDate: input.startDate }),
    ...(input.endDate !== undefined && { endDate: input.endDate }),
    // Module 5 §37 — every new membership starts active.
    active: true,
    createdAt: now,
    updatedAt: now,
  };
  if (db) {
    try {
      const result = await db.collection('project_members').insertOne(newMember);
      return mapProjectMemberDoc({ ...newMember, _id: result.insertedId });
    } catch (e) {
      // A duplicate key (§40 race on the partial unique index) is a REAL
      // failure. Falling back to the local file would report success for a
      // row Mongo rejected — a phantom write the live database never sees.
      if ((e as { code?: number }).code === 11000) throw e;
    }
  }
  const data = initLocalDb();
  const id = randomUUID();
  const localMember: ProjectMember = { id, ...newMember } as unknown as ProjectMember;
  data.projectMembers.push(localMember);
  writeLocalDb(data);
  return localMember;
}

export async function updateProjectMember(
  memberId: string,
  projectId: string,
  tenantId: string,
  updates: Partial<Omit<ProjectMember, 'id' | 'tenantId' | 'projectId' | 'userId' | 'createdAt'>>
): Promise<boolean> {
  const { db } = await connectDb();
  const stamped: Record<string, unknown> = { ...updates, updatedAt: new Date() };
  if (db) {
    try {
      const result = await db.collection('project_members')
        .updateOne({ _id: safeObjectId(memberId), tenantId, projectId }, { $set: stamped });
      // matchedCount (not modifiedCount): an idempotent PATCH — same values
      // already stored — still matched the row, so it is a 200, not a 404.
      return result.matchedCount > 0;
    } catch (e) {}
  }
  const data = initLocalDb();
  const idx = data.projectMembers.findIndex(m => m.id === memberId && m.tenantId === tenantId && m.projectId === projectId);
  if (idx >= 0) {
    data.projectMembers[idx] = { ...data.projectMembers[idx], ...stamped } as ProjectMember;
    writeLocalDb(data);
    return true;
  }
  return false;
}

/**
 * Membership REMOVAL (Module 5 §45) — SOFT: the row flips to active=false and
 * stays for audit and historical time-record questions (§36/§37). Never a
 * physical delete; the user themself is of course untouched. A removed user
 * may later be re-added as a fresh membership row.
 */
export async function removeProjectMember(memberId: string, projectId: string, tenantId: string): Promise<boolean> {
  const { db } = await connectDb();
  if (db) {
    try {
      const result = await db.collection('project_members')
        .updateOne(
          { _id: safeObjectId(memberId), tenantId, projectId },
          { $set: { active: false, updatedAt: new Date() } }
        );
      // matchedCount: an already-inactive row matched but modified nothing —
      // the domain's "already removed" 400 owns that case; existence is truth.
      return result.matchedCount > 0;
    } catch (e) {}
  }
  const data = initLocalDb();
  const idx = data.projectMembers.findIndex(
    m => m.id === memberId && m.tenantId === tenantId && m.projectId === projectId
  );
  if (idx >= 0) {
    data.projectMembers[idx] = { ...data.projectMembers[idx], active: false, updatedAt: new Date() } as ProjectMember;
    writeLocalDb(data);
    return true;
  }
  return false;
}

// ---- WORK ITEMS (Module 3 §61–§63, extended Module 4 §7–§27) ----

/** §25 — whitelisted work-item sort fields (sortOrder is the default). */
export const WORK_ITEM_SORT_FIELDS = ['sortOrder', 'updatedAt', 'createdAt', 'estimatedMinutes', 'status'] as const;
export type WorkItemSortField = (typeof WORK_ITEM_SORT_FIELDS)[number];

export interface WorkItemSort {
  field: WorkItemSortField;
  direction: 1 | -1;
}

/** §24 — list filters: status, assignee, unassigned. */
export interface WorkItemFilters {
  status?: WorkItemStatus;
  assignedTo?: string;
  /** true → only items with NO assignee (§24 "Unassigned"). */
  unassigned?: boolean;
}

/**
 * Fetch a project's work items in the workspace order (§25 default:
 * sortOrder, then createdAt as the stable tiebreaker).
 */
export async function getProjectWorkItems(projectId: string, tenantId: string): Promise<WorkItem[]> {
  const { db } = await connectDb();
  if (db) {
    try {
      const items = await db.collection('work_items')
        .find({ tenantId, projectId })
        .sort({ sortOrder: 1, createdAt: 1 })
        .toArray();
      return items.map(mapWorkItemDoc);
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.workItems
    .filter(w => w.tenantId === tenantId && w.projectId === projectId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
      || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

function workItemMongoSort(sort: WorkItemSort | undefined): Record<string, 1 | -1> {
  if (!sort) return { sortOrder: 1, createdAt: 1 };
  if (sort.field === 'sortOrder') return { sortOrder: sort.direction, createdAt: sort.direction };
  return { [sort.field]: sort.direction };
}

function sortWorkItemsLocally(items: WorkItem[], sort: WorkItemSort | undefined): WorkItem[] {
  const field = sort?.field ?? 'sortOrder';
  const direction = sort?.direction ?? 1;
  return [...items].sort((a, b) => {
    const va = (a as unknown as Record<string, unknown>)[field];
    const vb = (b as unknown as Record<string, unknown>)[field];
    // Missing values sort LAST regardless of direction (an absent estimate
    // is "not set", not "zero minutes").
    if (va === vb) {
      // Stable tiebreaker, matching the Mongo compound sort.
      return field === 'sortOrder' || field === 'createdAt'
        ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        : 0;
    }
    if (va === undefined || va === null) return 1;
    if (vb === undefined || vb === null) return -1;
    return (va > vb ? 1 : -1) * direction;
  });
}

/**
 * Module 4 (§24–§25) — filtered/searched/sorted work-item list. Search
 * matches name, description or ASSIGNEE username (§24): user ids whose
 * username matches are resolved first, exactly like project search resolves
 * client names.
 */
export async function listWorkItems(
  tenantId: string,
  projectId: string,
  options: { search?: string; sort?: WorkItemSort } = {},
  filters: WorkItemFilters = {}
): Promise<WorkItem[]> {
  const q = options.search?.trim() ?? '';
  const { db } = await connectDb();

  const baseFilter: Record<string, unknown> = { tenantId, projectId };
  if (filters.status) baseFilter.status = filters.status;
  if (filters.assignedTo) baseFilter.assignedTo = filters.assignedTo;
  // §24 "Unassigned" — the unassign action writes assignedTo: '' (and legacy
  // rows may simply lack the field). Mongo's {assignedTo: null} matches
  // null/missing but NOT the empty string, so both shapes must be included.
  if (filters.unassigned) baseFilter.assignedTo = { $in: [null, ''] };

  if (db) {
    try {
      let assigneeIds: string[] = [];
      if (q) {
        const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = { $regex: escaped, $options: 'i' };
        const users = await db.collection('users')
          .find({ tenantId, username: regex })
          .limit(50)
          .toArray();
        assigneeIds = users.map(u => (u._id as ObjectId).toString());
        baseFilter.$or = [
          { name: regex },
          { description: regex },
          ...(assigneeIds.length > 0 ? [{ assignedTo: { $in: assigneeIds } }] : []),
        ];
      }
      const items = await db.collection('work_items')
        .find(baseFilter)
        .sort(workItemMongoSort(options.sort))
        .toArray();
      return items.map(mapWorkItemDoc);
    } catch (e) {}
  }
  const data = initLocalDb();
  const lower = q.toLowerCase();
  const assigneeIds = new Set(
    q
      ? data.users
        .filter(u => u.tenantId === tenantId && u.username.toLowerCase().includes(lower))
        .map(u => (u._id as unknown as string).toString())
      : []
  );
  const matchesFilter = (w: WorkItem) => Object.entries(baseFilter).every(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if ('$or' in (value as Record<string, unknown>)) {
        const clauses = (value as { $or: unknown[] }).$or;
        return clauses.some(clause => {
          const [[k, v]] = Object.entries(clause as Record<string, unknown>);
          if (k === 'assignedTo' && v && typeof v === 'object' && '$in' in (v as Record<string, unknown>)) {
            return (v as { $in: string[] }).$in.includes(w.assignedTo ?? '');
          }
          const rx = (v as { $regex?: string }).$regex;
          if (rx) return String((w as unknown as Record<string, unknown>)[k] ?? '').toLowerCase().includes(rx.toLowerCase());
          return false;
        });
      }
      if ('$in' in (value as Record<string, unknown>)) {
        // Missing fields read as '' so the unassigned $in ([null, '']) matches
        // both an absent field and an explicit empty string.
        const v = (w as unknown as Record<string, unknown>)[key] ?? '';
        return (value as { $in: unknown[] }).$in.includes(v);
      }
    }
    return (w as unknown as Record<string, unknown>)[key] === value;
  });
  return sortWorkItemsLocally(data.workItems.filter(w =>
    w.tenantId === tenantId && w.projectId === projectId && matchesFilter(w)
  ), options.sort);
}

/**
 * Fetch ONE work item by id, project- and tenant-scoped. Returns null when
 * missing OR belonging to another tenant/project — callers treat both as
 * "not found" (§113).
 */
export async function getWorkItemById(
  itemId: string,
  projectId: string,
  tenantId: string
): Promise<WorkItem | null> {
  const { db } = await connectDb();
  if (db) {
    try {
      const w = await db.collection('work_items')
        .findOne({ _id: safeObjectId(itemId), tenantId, projectId });
      return w ? mapWorkItemDoc(w as unknown as Record<string, unknown>) : null;
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.workItems.find(w => w.id === itemId && w.tenantId === tenantId && w.projectId === projectId) ?? null;
}

export interface WorkItemCreateInput {
  name: string;
  description?: string;
  status?: WorkItemStatus;
  estimatedMinutes?: number;
  assignedTo?: string;
  sortOrder?: number;
  createdBy?: string;
}

export async function createWorkItem(
  tenantId: string,
  projectId: string,
  input: WorkItemCreateInput
): Promise<WorkItem> {
  const { db } = await connectDb();
  const now = new Date();
  // No delete exists for work items (§84) — DONE/ARCHIVED are terminal
  // delivery states, never removal.
  const newItem: Record<string, unknown> = {
    tenantId,
    projectId,
    name: input.name,
    ...(input.description !== undefined && { description: input.description }),
    status: input.status ?? 'NOT_STARTED',
    ...(input.estimatedMinutes !== undefined && { estimatedMinutes: input.estimatedMinutes }),
    ...(input.assignedTo !== undefined && { assignedTo: input.assignedTo }),
    sortOrder: input.sortOrder ?? 0,
    createdBy: input.createdBy ?? '',
    createdAt: now,
    updatedAt: now,
  };
  if (db) {
    try {
      const result = await db.collection('work_items').insertOne(newItem);
      return mapWorkItemDoc({ ...newItem, _id: result.insertedId });
    } catch (e) {}
  }
  const data = initLocalDb();
  const id = randomUUID();
  const localItem: WorkItem = { id, ...newItem } as unknown as WorkItem;
  data.workItems.push(localItem);
  writeLocalDb(data);
  return localItem;
}

/** Next manual ordering position within a project (§25) — max + 1. */
export async function getNextWorkItemSortOrder(tenantId: string, projectId: string): Promise<number> {
  const items = await getProjectWorkItems(projectId, tenantId);
  return items.reduce((max, w) => Math.max(max, w.sortOrder ?? 0), -1) + 1;
}

export async function updateWorkItem(
  itemId: string,
  projectId: string,
  tenantId: string,
  updates: Partial<Omit<WorkItem, 'id' | 'tenantId' | 'projectId' | 'createdAt'>>
): Promise<boolean> {
  const { db } = await connectDb();
  const stamped: Record<string, unknown> = { ...updates, updatedAt: new Date() };
  if (db) {
    try {
      const result = await db.collection('work_items')
        .updateOne({ _id: safeObjectId(itemId), tenantId, projectId }, { $set: stamped });
      return result.modifiedCount > 0;
    } catch (e) {}
  }
  const data = initLocalDb();
  const idx = data.workItems.findIndex(w => w.id === itemId && w.tenantId === tenantId && w.projectId === projectId);
  if (idx >= 0) {
    data.workItems[idx] = { ...data.workItems[idx], ...stamped } as WorkItem;
    writeLocalDb(data);
    return true;
  }
  return false;
}

// ---- PROJECT MILESTONES (Module 3, spec §45–§47) ----

export async function getProjectMilestones(projectId: string, tenantId: string): Promise<ProjectMilestone[]> {
  const { db } = await connectDb();
  if (db) {
    try {
      const milestones = await db.collection('project_milestones')
        .find({ tenantId, projectId })
        .sort({ sequence: 1 })
        .toArray();
      return milestones.map(mapProjectMilestoneDoc);
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.projectMilestones
    .filter(m => m.tenantId === tenantId && m.projectId === projectId)
    .sort((a, b) => a.sequence - b.sequence);
}

export interface ProjectMilestoneCreateInput {
  name: string;
  description?: string;
  sequence: number;
  amount?: number;
  percentage?: number;
  dueDate?: string;
  status?: MilestoneStatus;
}

export async function createProjectMilestone(
  tenantId: string,
  projectId: string,
  input: ProjectMilestoneCreateInput
): Promise<ProjectMilestone> {
  const { db } = await connectDb();
  const now = new Date();
  const newMilestone: Record<string, unknown> = {
    tenantId,
    projectId,
    name: input.name,
    ...(input.description !== undefined && { description: input.description }),
    sequence: input.sequence,
    // §46 — amount XOR percentage; the validator layer rejects both/neither.
    ...(input.amount !== undefined && { amount: input.amount }),
    ...(input.percentage !== undefined && { percentage: input.percentage }),
    ...(input.dueDate !== undefined && { dueDate: input.dueDate }),
    status: input.status ?? 'PLANNED',
    createdAt: now,
    updatedAt: now,
  };
  if (db) {
    try {
      const result = await db.collection('project_milestones').insertOne(newMilestone);
      return mapProjectMilestoneDoc({ ...newMilestone, _id: result.insertedId });
    } catch (e) {}
  }
  const data = initLocalDb();
  const id = randomUUID();
  const localMilestone: ProjectMilestone = { id, ...newMilestone } as unknown as ProjectMilestone;
  data.projectMilestones.push(localMilestone);
  writeLocalDb(data);
  return localMilestone;
}

/**
 * Milestone write shape. Module 9 adds the billing/reservation fields with
 * NULL-clearable semantics (release = null the trail + billingStatus
 * UNBILLED) — mirroring TimeEntryUpdate/ExpenseUpdate.
 */
export type ProjectMilestoneUpdate = Partial<Omit<
  ProjectMilestone,
  'id' | 'tenantId' | 'projectId' | 'createdAt'
  | 'billingStatus' | 'invoiceId' | 'reservedBy' | 'reservedAt' | 'reservedInvoiceId'
>> & {
  billingStatus?: ProjectMilestone['billingStatus'];
  invoiceId?: string | null;
  reservedBy?: string | null;
  reservedAt?: Date | string | null;
  reservedInvoiceId?: string | null;
};

export async function updateProjectMilestone(
  milestoneId: string,
  projectId: string,
  tenantId: string,
  updates: ProjectMilestoneUpdate
): Promise<boolean> {
  const { db } = await connectDb();
  // Mongo $set rejects undefined values — strip them (null clears).
  const defined = Object.fromEntries(
    Object.entries(updates).filter(([, v]) => v !== undefined)
  );
  const stamped: Record<string, unknown> = { ...defined, updatedAt: new Date() };
  if (db) {
    try {
      const result = await db.collection('project_milestones')
        .updateOne({ _id: safeObjectId(milestoneId), tenantId, projectId }, { $set: stamped });
      return result.modifiedCount > 0;
    } catch (e) {}
  }
  const data = initLocalDb();
  const idx = data.projectMilestones.findIndex(m => m.id === milestoneId && m.tenantId === tenantId && m.projectId === projectId);
  if (idx >= 0) {
    data.projectMilestones[idx] = { ...data.projectMilestones[idx], ...stamped } as ProjectMilestone;
    writeLocalDb(data);
    return true;
  }
  return false;
}

// ---- RATE CARDS / ENTRIES / VERSIONS / USER COST ASSIGNMENTS (Module 6 §59–§79, §131) ----

function mapRateCardDoc(c: Record<string, unknown>): RateCard {
  return {
    id: (c._id as ObjectId).toString(),
    tenantId: c.tenantId as string,
    name: c.name as string,
    type: (c.type as RateCardType | undefined) ?? 'COST',
    currency: c.currency as string,
    scope: (c.scope as RateCardScope | undefined) ?? 'ORGANIZATION',
    clientId: c.clientId as string | undefined,
    // §106 spirit — cards always stamp a status, but a legacy row without
    // one reads ACTIVE (an unarchived card by definition).
    status: (c.status as RateCardStatus | undefined) ?? 'ACTIVE',
    createdAt: c.createdAt as Date,
    updatedAt: c.updatedAt as Date | undefined,
  };
}

function mapRateCardEntryDoc(e: Record<string, unknown>): RateCardEntry {
  return {
    id: (e._id as ObjectId).toString(),
    tenantId: e.tenantId as string,
    rateCardId: e.rateCardId as string,
    name: e.name as string,
    role: e.role as string | undefined,
    serviceType: e.serviceType as string | undefined,
    unit: (e.unit as RateUnit | undefined) ?? 'HOUR',
    amount: (e.amount as number | undefined) ?? 0,
    currency: e.currency as string,
    billable: (e.billable as boolean | undefined) ?? true,
    billingType: (e.billingType as RateBillingType | undefined) ?? 'HOURLY',
    createdAt: e.createdAt as Date,
    updatedAt: e.updatedAt as Date | undefined,
  };
}

function mapRateEntryVersionDoc(v: Record<string, unknown>): RateEntryVersion {
  return {
    id: (v._id as ObjectId).toString(),
    tenantId: v.tenantId as string,
    rateCardId: v.rateCardId as string,
    rateCardEntryId: v.rateCardEntryId as string,
    amount: v.amount as number,
    currency: v.currency as string,
    effectiveFrom: v.effectiveFrom as string,
    // §79 — absent/null effectiveTo = open-ended.
    effectiveTo: (v.effectiveTo as string | null | undefined) ?? null,
    createdAt: v.createdAt as Date,
  };
}

function mapUserCostAssignmentDoc(a: Record<string, unknown>): UserCostAssignment {
  return {
    id: (a._id as ObjectId).toString(),
    tenantId: a.tenantId as string,
    userId: a.userId as string,
    rateCardId: a.rateCardId as string,
    rateCardEntryId: a.rateCardEntryId as string,
    effectiveFrom: a.effectiveFrom as string,
    effectiveTo: (a.effectiveTo as string | null | undefined) ?? null,
    createdAt: a.createdAt as Date,
  };
}

/** §84 — list filters: type, scope, client, status. */
export interface RateCardListFilters {
  type?: RateCardType;
  scope?: RateCardScope;
  clientId?: string;
  status?: RateCardStatus;
}

export async function getRateCards(
  tenantId: string,
  filters: RateCardListFilters = {}
): Promise<RateCard[]> {
  const { db } = await connectDb();
  if (db) {
    try {
      const query: Record<string, unknown> = { tenantId };
      if (filters.type !== undefined) query.type = filters.type;
      if (filters.scope !== undefined) query.scope = filters.scope;
      if (filters.clientId !== undefined) query.clientId = filters.clientId;
      if (filters.status !== undefined) query.status = filters.status;
      const cards = await db.collection('rate_cards')
        .find(query)
        .sort({ createdAt: 1 })
        .toArray();
      return cards.map(mapRateCardDoc);
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.rateCards
    .filter(c => c.tenantId === tenantId
      && (filters.type === undefined || c.type === filters.type)
      && (filters.scope === undefined || c.scope === filters.scope)
      && (filters.clientId === undefined || c.clientId === filters.clientId)
      && (filters.status === undefined || c.status === filters.status))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

/** §113 — a missing card and another tenant's card are IDENTICAL here (null). */
export async function getRateCardById(id: string, tenantId: string): Promise<RateCard | null> {
  const { db } = await connectDb();
  if (db) {
    try {
      const card = await db.collection('rate_cards').findOne({ _id: safeObjectId(id), tenantId });
      return card ? mapRateCardDoc(card) : null;
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.rateCards.find(c => c.id === id && c.tenantId === tenantId) ?? null;
}

export interface RateCardCreateInput {
  name: string;
  type: RateCardType;
  currency: string;
  scope: RateCardScope;
  clientId?: string;
}

export async function createRateCard(tenantId: string, input: RateCardCreateInput): Promise<RateCard> {
  const { db } = await connectDb();
  const now = new Date();
  const newCard: Record<string, unknown> = {
    tenantId,
    name: input.name,
    type: input.type,
    currency: input.currency,
    scope: input.scope,
    ...(input.clientId !== undefined && { clientId: input.clientId }),
    // §75 — cards are born ACTIVE and may only ever move to ARCHIVED.
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  };
  if (db) {
    try {
      const result = await db.collection('rate_cards').insertOne(newCard);
      return mapRateCardDoc({ ...newCard, _id: result.insertedId });
    } catch (e) {}
  }
  const data = initLocalDb();
  const id = randomUUID();
  const localCard: RateCard = { id, ...newCard } as unknown as RateCard;
  data.rateCards.push(localCard);
  writeLocalDb(data);
  return localCard;
}

export async function updateRateCard(
  id: string,
  tenantId: string,
  updates: Partial<Omit<RateCard, 'id' | 'tenantId' | 'createdAt'>>
): Promise<boolean> {
  const { db } = await connectDb();
  const stamped: Record<string, unknown> = { ...updates, updatedAt: new Date() };
  if (db) {
    try {
      const result = await db.collection('rate_cards')
        .updateOne({ _id: safeObjectId(id), tenantId }, { $set: stamped });
      // matchedCount (Module 5 lesson): an idempotent PATCH still matched the
      // row — a 200, never a phantom 404.
      return result.matchedCount > 0;
    } catch (e) {}
  }
  const data = initLocalDb();
  const idx = data.rateCards.findIndex(c => c.id === id && c.tenantId === tenantId);
  if (idx >= 0) {
    data.rateCards[idx] = { ...data.rateCards[idx], ...stamped } as RateCard;
    writeLocalDb(data);
    return true;
  }
  return false;
}

export async function listRateCardEntries(rateCardId: string, tenantId: string): Promise<RateCardEntry[]> {
  const { db } = await connectDb();
  if (db) {
    try {
      const entries = await db.collection('rate_card_entries')
        .find({ tenantId, rateCardId })
        .sort({ createdAt: 1 })
        .toArray();
      return entries.map(mapRateCardEntryDoc);
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.rateCardEntries
    .filter(e => e.tenantId === tenantId && e.rateCardId === rateCardId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

/** Tenant-wide entry scan — the card list's "Entries" count (§84), grouped in the domain. */
export async function listAllRateCardEntries(tenantId: string): Promise<RateCardEntry[]> {
  const { db } = await connectDb();
  if (db) {
    try {
      const entries = await db.collection('rate_card_entries')
        .find({ tenantId })
        .sort({ createdAt: 1 })
        .toArray();
      return entries.map(mapRateCardEntryDoc);
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.rateCardEntries
    .filter(e => e.tenantId === tenantId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

/** §113 — identical null for missing and cross-tenant entries. */
export async function getRateCardEntryById(
  entryId: string,
  rateCardId: string,
  tenantId: string
): Promise<RateCardEntry | null> {
  const { db } = await connectDb();
  if (db) {
    try {
      const entry = await db.collection('rate_card_entries')
        .findOne({ _id: safeObjectId(entryId), rateCardId, tenantId });
      return entry ? mapRateCardEntryDoc(entry) : null;
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.rateCardEntries.find(
    e => e.id === entryId && e.rateCardId === rateCardId && e.tenantId === tenantId
  ) ?? null;
}

export interface RateCardEntryCreateInput {
  name: string;
  role?: string;
  serviceType?: string;
  unit: RateUnit;
  amount: number;
  currency: string;
  billable: boolean;
  billingType: RateBillingType;
}

export async function createRateCardEntry(
  tenantId: string,
  rateCardId: string,
  input: RateCardEntryCreateInput
): Promise<RateCardEntry> {
  const { db } = await connectDb();
  const now = new Date();
  const newEntry: Record<string, unknown> = {
    tenantId,
    rateCardId,
    name: input.name,
    ...(input.role !== undefined && { role: input.role }),
    ...(input.serviceType !== undefined && { serviceType: input.serviceType }),
    unit: input.unit,
    amount: input.amount,
    currency: input.currency,
    billable: input.billable,
    billingType: input.billingType,
    createdAt: now,
    updatedAt: now,
  };
  if (db) {
    try {
      const result = await db.collection('rate_card_entries').insertOne(newEntry);
      return mapRateCardEntryDoc({ ...newEntry, _id: result.insertedId });
    } catch (e) {}
  }
  const data = initLocalDb();
  const id = randomUUID();
  const localEntry: RateCardEntry = { id, ...newEntry } as unknown as RateCardEntry;
  data.rateCardEntries.push(localEntry);
  writeLocalDb(data);
  return localEntry;
}

export async function updateRateCardEntry(
  entryId: string,
  rateCardId: string,
  tenantId: string,
  updates: Partial<Omit<RateCardEntry, 'id' | 'tenantId' | 'rateCardId' | 'createdAt'>>
): Promise<boolean> {
  const { db } = await connectDb();
  // An explicit '' on role/serviceType is a CLEAR (M4 lesson) — $set handles
  // it natively in Mongo; the local branch spreads it just the same.
  const stamped: Record<string, unknown> = { ...updates, updatedAt: new Date() };
  if (db) {
    try {
      const result = await db.collection('rate_card_entries')
        .updateOne({ _id: safeObjectId(entryId), rateCardId, tenantId }, { $set: stamped });
      return result.matchedCount > 0;
    } catch (e) {}
  }
  const data = initLocalDb();
  const idx = data.rateCardEntries.findIndex(
    e => e.id === entryId && e.rateCardId === rateCardId && e.tenantId === tenantId
  );
  if (idx >= 0) {
    data.rateCardEntries[idx] = { ...data.rateCardEntries[idx], ...stamped } as RateCardEntry;
    writeLocalDb(data);
    return true;
  }
  return false;
}

/**
 * §122 — versions are IMMUTABLE history. They are only ever CREATED and
 * CLOSED (effectiveTo stamped); no update path exists by design.
 */
export interface RateEntryVersionCreateInput {
  amount: number;
  currency: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
}

export async function createRateEntryVersion(
  tenantId: string,
  rateCardId: string,
  rateCardEntryId: string,
  input: RateEntryVersionCreateInput
): Promise<RateEntryVersion> {
  const { db } = await connectDb();
  const newVersion: Record<string, unknown> = {
    tenantId,
    rateCardId,
    rateCardEntryId,
    amount: input.amount,
    currency: input.currency,
    effectiveFrom: input.effectiveFrom,
    // §79 — absent means open-ended; store the close only when it exists.
    ...(input.effectiveTo != null && { effectiveTo: input.effectiveTo }),
    createdAt: new Date(),
  };
  if (db) {
    try {
      const result = await db.collection('rate_entry_versions').insertOne(newVersion);
      return mapRateEntryVersionDoc({ ...newVersion, _id: result.insertedId });
    } catch (e) {}
  }
  const data = initLocalDb();
  const id = randomUUID();
  const localVersion: RateEntryVersion = { id, ...newVersion } as unknown as RateEntryVersion;
  data.rateEntryVersions.push(localVersion);
  writeLocalDb(data);
  return localVersion;
}

/** Close a version at an inclusive end date (§79/§122) — the ONLY version mutation that exists. */
export async function closeRateEntryVersion(
  versionId: string,
  tenantId: string,
  effectiveTo: string
): Promise<boolean> {
  const { db } = await connectDb();
  if (db) {
    try {
      const result = await db.collection('rate_entry_versions')
        .updateOne({ _id: safeObjectId(versionId), tenantId }, { $set: { effectiveTo } });
      return result.matchedCount > 0;
    } catch (e) {}
  }
  const data = initLocalDb();
  const idx = data.rateEntryVersions.findIndex(v => v.id === versionId && v.tenantId === tenantId);
  if (idx >= 0) {
    data.rateEntryVersions[idx] = { ...data.rateEntryVersions[idx], effectiveTo } as RateEntryVersion;
    writeLocalDb(data);
    return true;
  }
  return false;
}

/** All versions of one entry (or every entry of a card when entryId is omitted). */
export async function listRateEntryVersions(
  tenantId: string,
  rateCardId: string,
  rateCardEntryId?: string
): Promise<RateEntryVersion[]> {
  const { db } = await connectDb();
  if (db) {
    try {
      const query: Record<string, unknown> = { tenantId, rateCardId };
      if (rateCardEntryId !== undefined) query.rateCardEntryId = rateCardEntryId;
      const versions = await db.collection('rate_entry_versions')
        .find(query)
        .sort({ effectiveFrom: 1 })
        .toArray();
      return versions.map(mapRateEntryVersionDoc);
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.rateEntryVersions
    .filter(v => v.tenantId === tenantId && v.rateCardId === rateCardId
      && (rateCardEntryId === undefined || v.rateCardEntryId === rateCardEntryId))
    .sort((a, b) => a.effectiveFrom < b.effectiveFrom ? -1 : 1);
}

/**
 * A user's cost assignments. Default view = CURRENT (open-ended or covering
 * today is NOT the rule — an assignment whose range is entirely past is
 * "ended", one that hasn't started yet is "scheduled"; both are excluded
 * unless includeEnded). The §77 overlap probe always loads everything and
 * filters in the domain so Mongo and local JSON behave identically.
 */
export async function getUserCostAssignments(
  userId: string,
  tenantId: string,
  options: { includeEnded?: boolean } = {}
): Promise<UserCostAssignment[]> {
  const { db } = await connectDb();
  if (db) {
    try {
      const assignments = await db.collection('user_cost_assignments')
        .find({ tenantId, userId })
        .sort({ effectiveFrom: 1 })
        .toArray();
      const mapped = assignments.map(mapUserCostAssignmentDoc);
      return options.includeEnded ? mapped : mapped.filter(a => a.effectiveTo == null);
    } catch (e) {}
  }
  const data = initLocalDb();
  const mapped = data.userCostAssignments
    .filter(a => a.tenantId === tenantId && a.userId === userId)
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1));
  return options.includeEnded ? mapped : mapped.filter(a => a.effectiveTo == null);
}

/** §113 — identical null for a missing and a cross-tenant assignment. */
export async function getUserCostAssignmentById(
  assignmentId: string,
  userId: string,
  tenantId: string
): Promise<UserCostAssignment | null> {
  const { db } = await connectDb();
  if (db) {
    try {
      const assignment = await db.collection('user_cost_assignments')
        .findOne({ _id: safeObjectId(assignmentId), tenantId, userId });
      return assignment ? mapUserCostAssignmentDoc(assignment) : null;
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.userCostAssignments.find(
    a => a.id === assignmentId && a.tenantId === tenantId && a.userId === userId
  ) ?? null;
}

/**
 * §88 — every assignment pointing at ONE cost card (all users, full history).
 * Powers the cost card detail page's "who is on this card" section; only
 * reachable behind agency.rates.cost.read.
 */
export async function getUserCostAssignmentsByCard(
  rateCardId: string,
  tenantId: string
): Promise<UserCostAssignment[]> {
  const { db } = await connectDb();
  if (db) {
    try {
      const assignments = await db.collection('user_cost_assignments')
        .find({ tenantId, rateCardId })
        .sort({ effectiveFrom: -1 })
        .toArray();
      return assignments.map(mapUserCostAssignmentDoc);
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.userCostAssignments
    .filter(a => a.tenantId === tenantId && a.rateCardId === rateCardId)
    .sort((a, b) => (a.effectiveFrom > b.effectiveFrom ? -1 : 1));
}

export interface UserCostAssignmentCreateInput {
  rateCardId: string;
  /** §131 — the specific cost entry within the card. */
  rateCardEntryId: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
}

export async function createUserCostAssignment(
  tenantId: string,
  userId: string,
  input: UserCostAssignmentCreateInput
): Promise<UserCostAssignment> {
  const { db } = await connectDb();
  const newAssignment: Record<string, unknown> = {
    tenantId,
    userId,
    rateCardId: input.rateCardId,
    rateCardEntryId: input.rateCardEntryId,
    effectiveFrom: input.effectiveFrom,
    ...(input.effectiveTo != null && { effectiveTo: input.effectiveTo }),
    createdAt: new Date(),
  };
  if (db) {
    try {
      const result = await db.collection('user_cost_assignments').insertOne(newAssignment);
      return mapUserCostAssignmentDoc({ ...newAssignment, _id: result.insertedId });
    } catch (e) {}
  }
  const data = initLocalDb();
  const id = randomUUID();
  const localAssignment: UserCostAssignment = { id, ...newAssignment } as unknown as UserCostAssignment;
  data.userCostAssignments.push(localAssignment);
  writeLocalDb(data);
  return localAssignment;
}

/**
 * Assignment mutation is deliberately narrow: only the range may change
 * (close it / adjust the end). Re-pointing a user to a different card is a
 * NEW assignment (§122 spirit — history is append-only).
 */
export async function updateUserCostAssignment(
  assignmentId: string,
  userId: string,
  tenantId: string,
  updates: Partial<Pick<UserCostAssignment, 'effectiveTo'>>
): Promise<boolean> {
  const { db } = await connectDb();
  const stamped: Record<string, unknown> = { ...updates };
  if (db) {
    try {
      const result = await db.collection('user_cost_assignments')
        .updateOne({ _id: safeObjectId(assignmentId), tenantId, userId }, { $set: stamped });
      return result.matchedCount > 0;
    } catch (e) {}
  }
  const data = initLocalDb();
  const idx = data.userCostAssignments.findIndex(
    a => a.id === assignmentId && a.tenantId === tenantId && a.userId === userId
  );
  if (idx >= 0) {
    data.userCostAssignments[idx] = { ...data.userCostAssignments[idx], ...stamped } as UserCostAssignment;
    writeLocalDb(data);
    return true;
  }
  return false;
}

// ---- MODULE 7: TIME TRACKING (spec §5/§9/§30) ----

export interface TimeEntryFilters {
  userId?: string;
  projectId?: string;
  workItemId?: string;
  dateFrom?: string;
  dateTo?: string;
  approvalStatus?: TimeApprovalStatus;
  billingStatus?: TimeBillingStatus;
  /** Module 9 §70 — the billing-source view filters on the explicit flag. */
  billable?: boolean;
}

function mapTimeEntryDoc(e: Record<string, unknown>): TimeEntry {
  return {
    id: (e._id as ObjectId).toString(),
    tenantId: e.tenantId as string,
    projectId: e.projectId as string,
    workItemId: (e.workItemId as string | null | undefined) ?? undefined,
    userId: e.userId as string,
    date: e.date as string,
    durationMinutes: e.durationMinutes as number,
    billable: (e.billable as boolean | undefined) ?? true,
    approvalStatus: (e.approvalStatus as TimeApprovalStatus | undefined) ?? 'DRAFT',
    billingStatus: (e.billingStatus as TimeBillingStatus | undefined) ?? 'UNBILLED',
    financialStatus: (e.financialStatus as TimeEntry['financialStatus'] | undefined) ?? 'RATE_CONFIGURATION_REQUIRED',
    costRateSnapshot: (e.costRateSnapshot as TimeEntry['costRateSnapshot'] | null | undefined) ?? undefined,
    billingRateSnapshot: (e.billingRateSnapshot as TimeEntry['billingRateSnapshot'] | null | undefined) ?? undefined,
    calculatedCost: (e.calculatedCost as TimeEntry['calculatedCost'] | null | undefined) ?? undefined,
    calculatedBillableAmount: (e.calculatedBillableAmount as TimeEntry['calculatedBillableAmount'] | null | undefined) ?? undefined,
    invoiceId: (e.invoiceId as string | null | undefined) ?? undefined,
    // §63/§66 — reservation trail (Module 9); null folds to undefined on read.
    reservedBy: (e.reservedBy as string | null | undefined) ?? undefined,
    reservedAt: (e.reservedAt as Date | string | null | undefined) ?? undefined,
    reservedInvoiceId: (e.reservedInvoiceId as string | null | undefined) ?? undefined,
    rejectionReason: (e.rejectionReason as string | null | undefined) ?? undefined,
    notes: (e.notes as string | null | undefined) ?? undefined,
    createdAt: e.createdAt as Date,
    updatedAt: e.updatedAt as Date,
  };
}

function mapTimerSessionDoc(s: Record<string, unknown>): TimerSession {
  return {
    id: (s._id as ObjectId).toString(),
    tenantId: s.tenantId as string,
    userId: s.userId as string,
    projectId: s.projectId as string,
    workItemId: s.workItemId as string | undefined,
    startedAt: s.startedAt as Date,
    status: (s.status as TimerStatus | undefined) ?? 'RUNNING',
    createdAt: s.createdAt as Date,
  };
}

/** §25/§26 — filtered list, newest business date first. Tenant-scoped by construction. */
export async function getTimeEntries(
  tenantId: string,
  filters: TimeEntryFilters = {},
  options: ListOptions = {}
): Promise<TimeEntry[]> {
  const normalized = normalizeListOptions(options);
  const { db } = await connectDb();
  if (db) {
    try {
      const query: Record<string, unknown> = { tenantId };
      if (filters.userId !== undefined) query.userId = filters.userId;
      if (filters.projectId !== undefined) query.projectId = filters.projectId;
      if (filters.workItemId !== undefined) query.workItemId = filters.workItemId;
      if (filters.approvalStatus !== undefined) query.approvalStatus = filters.approvalStatus;
      if (filters.billingStatus !== undefined) query.billingStatus = filters.billingStatus;
      if (filters.billable !== undefined) query.billable = filters.billable;
      if (filters.dateFrom !== undefined || filters.dateTo !== undefined) {
        query.date = {
          ...(filters.dateFrom !== undefined && { $gte: filters.dateFrom }),
          ...(filters.dateTo !== undefined && { $lte: filters.dateTo }),
        };
      }
      const entries = await db.collection('time_entries')
        .find(query)
        .sort({ date: -1, createdAt: -1 })
        .skip(normalized.skip)
        .limit(normalized.limit)
        .toArray();
      return entries.map(mapTimeEntryDoc);
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.timeEntries
    .filter(e => e.tenantId === tenantId
      && (filters.userId === undefined || e.userId === filters.userId)
      && (filters.projectId === undefined || e.projectId === filters.projectId)
      && (filters.workItemId === undefined || e.workItemId === filters.workItemId)
      && (filters.approvalStatus === undefined || e.approvalStatus === filters.approvalStatus)
      && (filters.billingStatus === undefined || e.billingStatus === filters.billingStatus)
      && (filters.billable === undefined || e.billable === filters.billable)
      && (filters.dateFrom === undefined || e.date >= filters.dateFrom)
      && (filters.dateTo === undefined || e.date <= filters.dateTo))
    .sort((a, b) => (a.date !== b.date ? (a.date > b.date ? -1 : 1)
      : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
    .slice(normalized.skip, normalized.skip + normalized.limit);
}

/** §113 — a missing entry and another tenant's entry are IDENTICAL here (null). */
export async function getTimeEntryById(id: string, tenantId: string): Promise<TimeEntry | null> {
  const { db } = await connectDb();
  if (db) {
    try {
      const entry = await db.collection('time_entries').findOne({ _id: safeObjectId(id), tenantId });
      return entry ? mapTimeEntryDoc(entry as unknown as Record<string, unknown>) : null;
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.timeEntries.find(e => e.id === id && e.tenantId === tenantId) ?? null;
}

export interface TimeEntryCreateInput {
  projectId: string;
  workItemId?: string;
  userId: string;
  date: string;
  durationMinutes: number;
  billable: boolean;
  financialStatus: TimeEntry['financialStatus'];
  costRateSnapshot?: TimeEntry['costRateSnapshot'];
  billingRateSnapshot?: TimeEntry['billingRateSnapshot'];
  calculatedCost?: TimeEntry['calculatedCost'];
  calculatedBillableAmount?: TimeEntry['calculatedBillableAmount'];
  notes?: string;
}

export async function createTimeEntry(tenantId: string, input: TimeEntryCreateInput): Promise<TimeEntry> {
  const { db } = await connectDb();
  const now = new Date();
  const newEntry: Record<string, unknown> = {
    tenantId,
    projectId: input.projectId,
    ...(input.workItemId !== undefined && { workItemId: input.workItemId }),
    userId: input.userId,
    date: input.date,
    durationMinutes: input.durationMinutes,
    billable: input.billable,
    // §19/§5 — a new entry starts its workflow life as an editable draft.
    approvalStatus: 'DRAFT',
    billingStatus: 'UNBILLED',
    financialStatus: input.financialStatus,
    ...(input.costRateSnapshot && { costRateSnapshot: input.costRateSnapshot }),
    ...(input.billingRateSnapshot && { billingRateSnapshot: input.billingRateSnapshot }),
    ...(input.calculatedCost && { calculatedCost: input.calculatedCost }),
    ...(input.calculatedBillableAmount && { calculatedBillableAmount: input.calculatedBillableAmount }),
    ...(input.notes && { notes: input.notes }),
    createdAt: now,
    updatedAt: now,
  };
  if (db) {
    try {
      const result = await db.collection('time_entries').insertOne(newEntry);
      return mapTimeEntryDoc({ ...newEntry, _id: result.insertedId });
    } catch (e) {}
  }
  const data = initLocalDb();
  const id = randomUUID();
  const localEntry: TimeEntry = { id, ...newEntry } as unknown as TimeEntry;
  data.timeEntries.push(localEntry);
  writeLocalDb(data);
  return localEntry;
}

/**
 * §22/§28 — partial update. The domain has already decided which fields the
 * entry's lifecycle state permits; this write trusts that decision (the
 * economic fields listed in INVOICED_LOCKED_FIELDS never reach it once
 * INVOICED because the domain rejects the request first).
 */
export async function updateTimeEntry(
  id: string,
  tenantId: string,
  updates: TimeEntryUpdate
): Promise<boolean> {
  const { db } = await connectDb();
  // Mongo $set rejects undefined values — strip them (an undefined key means
  // "leave unchanged"; an explicit null means "clear", which $set accepts).
  const defined = Object.fromEntries(
    Object.entries(updates).filter(([, v]) => v !== undefined)
  );
  const stamped: Record<string, unknown> = { ...defined, updatedAt: new Date() };
  if (db) {
    try {
      const result = await db.collection('time_entries')
        .updateOne({ _id: safeObjectId(id), tenantId }, { $set: stamped });
      // matchedCount (Module 5 lesson): an idempotent PATCH still matched.
      return result.matchedCount > 0;
    } catch (e) {}
  }
  const data = initLocalDb();
  const idx = data.timeEntries.findIndex(e => e.id === id && e.tenantId === tenantId);
  if (idx >= 0) {
    data.timeEntries[idx] = { ...data.timeEntries[idx], ...stamped } as TimeEntry;
    writeLocalDb(data);
    return true;
  }
  return false;
}

/** §11 — the ONE-RUNNING-timer lookup. Cross-tenant sessions never resolve. */
export async function getActiveTimerSession(userId: string, tenantId: string): Promise<TimerSession | null> {
  const { db } = await connectDb();
  if (db) {
    try {
      const session = await db.collection('timer_sessions')
        .findOne({ tenantId, userId, status: 'RUNNING' });
      return session ? mapTimerSessionDoc(session as unknown as Record<string, unknown>) : null;
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.timerSessions.find(s => s.tenantId === tenantId && s.userId === userId && s.status === 'RUNNING') ?? null;
}

export async function createTimerSession(
  tenantId: string,
  userId: string,
  projectId: string,
  workItemId?: string
): Promise<TimerSession> {
  const { db } = await connectDb();
  const now = new Date();
  const newSession: Record<string, unknown> = {
    tenantId,
    userId,
    projectId,
    ...(workItemId !== undefined && { workItemId }),
    startedAt: now,
    status: 'RUNNING',
    createdAt: now,
  };
  if (db) {
    try {
      const result = await db.collection('timer_sessions').insertOne(newSession);
      return mapTimerSessionDoc({ ...newSession, _id: result.insertedId });
    } catch (e) {}
  }
  const data = initLocalDb();
  const id = randomUUID();
  const localSession: TimerSession = { id, ...newSession } as unknown as TimerSession;
  data.timerSessions.push(localSession);
  writeLocalDb(data);
  return localSession;
}

export async function updateTimerSession(
  id: string,
  tenantId: string,
  updates: Partial<Pick<TimerSession, 'status'>>
): Promise<boolean> {
  const { db } = await connectDb();
  if (db) {
    try {
      const result = await db.collection('timer_sessions')
        .updateOne({ _id: safeObjectId(id), tenantId }, { $set: updates });
      return result.matchedCount > 0;
    } catch (e) {}
  }
  const data = initLocalDb();
  const idx = data.timerSessions.findIndex(s => s.id === id && s.tenantId === tenantId);
  if (idx >= 0) {
    data.timerSessions[idx] = { ...data.timerSessions[idx], ...updates } as TimerSession;
    writeLocalDb(data);
    return true;
  }
  return false;
}

export async function getTimerSessionById(id: string, tenantId: string): Promise<TimerSession | null> {
  const { db } = await connectDb();
  if (db) {
    try {
      const session = await db.collection('timer_sessions')
        .findOne({ _id: safeObjectId(id), tenantId });
      return session ? mapTimerSessionDoc(session as unknown as Record<string, unknown>) : null;
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.timerSessions.find(s => s.id === id && s.tenantId === tenantId) ?? null;
}

// ---- MODULE 8: EXPENSES (spec §37/§47/§53) ----

export interface ExpenseFilters {
  projectId?: string;
  clientId?: string;
  createdBy?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: ExpenseApprovalStatus;
  billingStatus?: ExpenseBillingStatus;
  expenseType?: ExpenseType;
  billable?: boolean;
  /** §53 "Expenses by Vendor" — case-insensitive substring on vendorName. */
  vendor?: string;
}

function mapExpenseDoc(e: Record<string, unknown>): Expense {
  return {
    id: (e._id as ObjectId).toString(),
    tenantId: e.tenantId as string,
    projectId: (e.projectId as string | null | undefined) ?? undefined,
    clientId: (e.clientId as string | null | undefined) ?? undefined,
    vendorName: (e.vendorName as string | undefined) ?? '',
    description: (e.description as string | undefined) ?? '',
    amount: (e.amount as Expense['amount'] | undefined) ?? { amount: 0, currency: 'INR' },
    expenseType: (e.expenseType as ExpenseType | undefined) ?? 'INTERNAL',
    billable: (e.billable as boolean | undefined) ?? false,
    markupPercent: (e.markupPercent as number | null | undefined) ?? undefined,
    clientChargeAmount: (e.clientChargeAmount as Expense['clientChargeAmount'] | null | undefined) ?? undefined,
    expenseDate: (e.expenseDate as string | undefined) ?? '',
    status: (e.status as ExpenseApprovalStatus | undefined) ?? 'DRAFT',
    billingStatus: (e.billingStatus as ExpenseBillingStatus | undefined) ?? 'UNBILLED',
    transactionId: (e.transactionId as string | null | undefined) ?? undefined,
    invoiceId: (e.invoiceId as string | null | undefined) ?? undefined,
    // §63/§66 — reservation trail (Module 9); null folds to undefined on read.
    reservedBy: (e.reservedBy as string | null | undefined) ?? undefined,
    reservedAt: (e.reservedAt as Date | string | null | undefined) ?? undefined,
    reservedInvoiceId: (e.reservedInvoiceId as string | null | undefined) ?? undefined,
    receiptReference: (e.receiptReference as string | null | undefined) ?? undefined,
    rejectionReason: (e.rejectionReason as string | null | undefined) ?? undefined,
    notes: (e.notes as string | null | undefined) ?? undefined,
    createdBy: (e.createdBy as string | undefined) ?? '',
    createdAt: (e.createdAt as Date) ?? new Date(0),
    updatedAt: (e.updatedAt as Date) ?? new Date(0),
  };
}

/** §53 — filtered list, newest expense date first. Tenant-scoped by construction. */
export async function getExpenses(
  tenantId: string,
  filters: ExpenseFilters = {},
  options: ListOptions = {}
): Promise<Expense[]> {
  const normalized = normalizeListOptions(options);
  const { db } = await connectDb();
  if (db) {
    try {
      const query: Record<string, unknown> = { tenantId };
      if (filters.projectId !== undefined) query.projectId = filters.projectId;
      if (filters.clientId !== undefined) query.clientId = filters.clientId;
      if (filters.createdBy !== undefined) query.createdBy = filters.createdBy;
      if (filters.status !== undefined) query.status = filters.status;
      if (filters.billingStatus !== undefined) query.billingStatus = filters.billingStatus;
      if (filters.expenseType !== undefined) query.expenseType = filters.expenseType;
      if (filters.billable !== undefined) query.billable = filters.billable;
      if (filters.vendor !== undefined) {
        // §53 — vendor search; escape regex metacharacters (user input).
        query.vendorName = { $regex: filters.vendor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
      }
      if (filters.dateFrom !== undefined || filters.dateTo !== undefined) {
        query.expenseDate = {
          ...(filters.dateFrom !== undefined && { $gte: filters.dateFrom }),
          ...(filters.dateTo !== undefined && { $lte: filters.dateTo }),
        };
      }
      const expenses = await db.collection('expenses')
        .find(query)
        .sort({ expenseDate: -1, createdAt: -1 })
        .skip(normalized.skip)
        .limit(normalized.limit)
        .toArray();
      return expenses.map(mapExpenseDoc);
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.expenses
    .filter(e => e.tenantId === tenantId
      && (filters.projectId === undefined || e.projectId === filters.projectId)
      && (filters.clientId === undefined || e.clientId === filters.clientId)
      && (filters.createdBy === undefined || e.createdBy === filters.createdBy)
      && (filters.status === undefined || e.status === filters.status)
      && (filters.billingStatus === undefined || e.billingStatus === filters.billingStatus)
      && (filters.expenseType === undefined || e.expenseType === filters.expenseType)
      && (filters.billable === undefined || e.billable === filters.billable)
      && (filters.vendor === undefined || e.vendorName.toLowerCase().includes(filters.vendor.toLowerCase()))
      && (filters.dateFrom === undefined || e.expenseDate >= filters.dateFrom)
      && (filters.dateTo === undefined || e.expenseDate <= filters.dateTo))
    .sort((a, b) => (a.expenseDate !== b.expenseDate ? (a.expenseDate > b.expenseDate ? -1 : 1)
      : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
    .slice(normalized.skip, normalized.skip + normalized.limit);
}

/** §113 — a missing expense and another tenant's expense are IDENTICAL here (null). */
export async function getExpenseById(id: string, tenantId: string): Promise<Expense | null> {
  const { db } = await connectDb();
  if (db) {
    try {
      const expense = await db.collection('expenses').findOne({ _id: safeObjectId(id), tenantId });
      return expense ? mapExpenseDoc(expense as unknown as Record<string, unknown>) : null;
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.expenses.find(e => e.id === id && e.tenantId === tenantId) ?? null;
}

export interface ExpenseCreateInput {
  projectId?: string;
  clientId?: string;
  vendorName: string;
  description: string;
  amount: Expense['amount'];
  expenseType: ExpenseType;
  billable: boolean;
  markupPercent?: number;
  clientChargeAmount?: Expense['clientChargeAmount'];
  expenseDate: string;
  receiptReference?: string;
  notes?: string;
  createdBy: string;
}

export async function createExpense(tenantId: string, input: ExpenseCreateInput): Promise<Expense> {
  const { db } = await connectDb();
  const now = new Date();
  const newExpense: Record<string, unknown> = {
    tenantId,
    ...(input.projectId !== undefined && { projectId: input.projectId }),
    ...(input.clientId !== undefined && { clientId: input.clientId }),
    vendorName: input.vendorName,
    description: input.description,
    amount: input.amount,
    expenseType: input.expenseType,
    billable: input.billable,
    ...(input.markupPercent !== undefined && { markupPercent: input.markupPercent }),
    ...(input.clientChargeAmount && { clientChargeAmount: input.clientChargeAmount }),
    expenseDate: input.expenseDate,
    // §40/§50 — a new expense starts as an editable, unbilled draft.
    status: 'DRAFT',
    billingStatus: 'UNBILLED',
    ...(input.receiptReference && { receiptReference: input.receiptReference }),
    ...(input.notes && { notes: input.notes }),
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  };
  if (db) {
    try {
      const result = await db.collection('expenses').insertOne(newExpense);
      return mapExpenseDoc({ ...newExpense, _id: result.insertedId });
    } catch (e) {}
  }
  const data = initLocalDb();
  const id = randomUUID();
  const localExpense: Expense = { id, ...newExpense } as unknown as Expense;
  data.expenses.push(localExpense);
  writeLocalDb(data);
  return localExpense;
}

/**
 * §22/§41 — partial update. The domain has already decided which fields the
 * expense's lifecycle state permits; this write trusts that decision (the
 * money and linkage fields never reach it once locked because the domain
 * rejects the request first).
 */
export async function updateExpense(
  id: string,
  tenantId: string,
  updates: ExpenseUpdate
): Promise<boolean> {
  const { db } = await connectDb();
  // Mongo $set rejects undefined values — strip them (an undefined key means
  // "leave unchanged"; an explicit null means "clear", which $set accepts).
  const defined = Object.fromEntries(
    Object.entries(updates).filter(([, v]) => v !== undefined)
  );
  const stamped: Record<string, unknown> = { ...defined, updatedAt: new Date() };
  if (db) {
    try {
      const result = await db.collection('expenses')
        .updateOne({ _id: safeObjectId(id), tenantId }, { $set: stamped });
      // matchedCount (Module 5 lesson): an idempotent PATCH still matched.
      return result.matchedCount > 0;
    } catch (e) {}
  }
  const data = initLocalDb();
  const idx = data.expenses.findIndex(e => e.id === id && e.tenantId === tenantId);
  if (idx >= 0) {
    data.expenses[idx] = { ...data.expenses[idx], ...stamped } as Expense;
    writeLocalDb(data);
    return true;
  }
  return false;
}

// ---- MODULE 9: INVOICES / LINES / NUMBERING (spec §57–§76, §81–§84) ----

/** §74 — the per-tenant counter behind INV-000001…; `seq` = last issued. */
export interface InvoiceCounter {
  tenantId: string;
  seq: number;
}

/**
 * Module 11 §23 — the per-FY invoice sequence. `seq` is the LAST number
 * issued (the spec's `nextNumber` ≡ seq + 1); {tenantId, fiscalYear} is
 * UNIQUE — the CBIC FY-uniqueness scope.
 */
export interface InvoiceSequence {
  tenantId: string;
  /** e.g. 'FY2026-27' (April–March, types/dates.ts fiscalYear). */
  fiscalYear: string;
  prefix: string;
  seq: number;
  updatedAt: Date;
}

/**
 * Module 3 — per-tenant project-code counter. Unlike InvoiceSequence this is
 * NOT fiscal-year scoped: project codes are a flat PRJ-0001, PRJ-0002, … run
 * per workspace, so a project created in March and one in April never collide.
 */
export interface ProjectSequence {
  tenantId: string;
  seq: number;
  updatedAt: Date;
}

function mapInvoiceDoc(i: Record<string, unknown>): Invoice {
  // Module 11 §11 — legacy tax lines predate the `type` field; they resolve
  // to OTHER on read (never a crash, never a fabricated GST component).
  const rawTaxLines = (i.taxLines as Array<Omit<Invoice['taxLines'][number], 'type'> & { type?: unknown }> | null | undefined) ?? [];
  const GST_COMPONENTS: readonly string[] = ['CGST', 'SGST', 'IGST', 'CESS'];
  const taxLines: Invoice['taxLines'] = rawTaxLines.map(t => ({
    ...t,
    type: GST_COMPONENTS.includes(t.type as string)
      ? (t.type as InvoiceTaxLineType)
      : 'OTHER' as const,
  }));
  return {
    id: (i._id as ObjectId).toString(),
    tenantId: i.tenantId as string,
    clientId: i.clientId as string,
    projectId: (i.projectId as string | null | undefined) ?? undefined,
    invoiceNumber: (i.invoiceNumber as string | null | undefined) ?? undefined,
    issueDate: i.issueDate as string,
    dueDate: i.dueDate as string,
    currency: (i.currency as string | undefined) ?? 'INR',
    subtotal: (i.subtotal as Invoice['subtotal'] | undefined) ?? { amount: 0, currency: 'INR' },
    discount: (i.discount as Invoice['discount'] | undefined) ?? { amount: 0, currency: 'INR' },
    taxLines,
    taxTotal: (i.taxTotal as Invoice['taxTotal'] | undefined) ?? { amount: 0, currency: 'INR' },
    total: (i.total as Invoice['total'] | undefined) ?? { amount: 0, currency: 'INR' },
    amountPaid: (i.amountPaid as Invoice['amountPaid'] | undefined) ?? { amount: 0, currency: 'INR' },
    amountDue: (i.amountDue as Invoice['amountDue'] | undefined) ?? { amount: 0, currency: 'INR' },
    status: (i.status as InvoiceStatus | undefined) ?? 'DRAFT',
    placeOfSupply: (i.placeOfSupply as Invoice['placeOfSupply'] | null | undefined) ?? undefined,
    reverseCharge: (i.reverseCharge as Invoice['reverseCharge'] | null | undefined) ?? undefined,
    exemption: (i.exemption as Invoice['exemption'] | null | undefined) ?? undefined,
    fiscalYear: (i.fiscalYear as string | null | undefined) ?? undefined,
    eInvoice: (i.eInvoice as Invoice['eInvoice'] | null | undefined) ?? undefined,
    complianceSnapshot: (i.complianceSnapshot as Invoice['complianceSnapshot'] | null | undefined) ?? undefined,
    sentAt: (i.sentAt as Date | null | undefined) ?? undefined,
    notes: (i.notes as string | null | undefined) ?? undefined,
    terms: (i.terms as string | null | undefined) ?? undefined,
    createdBy: i.createdBy as string,
    createdAt: i.createdAt as Date,
    updatedAt: i.updatedAt as Date,
  };
}

function mapInvoiceLineDoc(l: Record<string, unknown>): InvoiceLine {
  return {
    id: (l._id as ObjectId).toString(),
    tenantId: l.tenantId as string,
    invoiceId: l.invoiceId as string,
    type: (l.type as InvoiceLineType | undefined) ?? 'MANUAL',
    description: (l.description as string | undefined) ?? '',
    quantity: (l.quantity as number | null | undefined) ?? undefined,
    unitPrice: (l.unitPrice as InvoiceLine['unitPrice'] | null | undefined) ?? undefined,
    amount: (l.amount as InvoiceLine['amount'] | undefined) ?? { amount: 0, currency: 'INR' },
    sourceId: (l.sourceId as string | null | undefined) ?? undefined,
    classification: (l.classification as InvoiceLine['classification'] | null | undefined) ?? undefined,
    taxCategory: (l.taxCategory as string | null | undefined) ?? undefined,
    taxRate: (l.taxRate as number | null | undefined) ?? undefined,
    taxAmount: (l.taxAmount as InvoiceLine['taxAmount'] | null | undefined) ?? undefined,
    metadata: (l.metadata as Record<string, unknown> | null | undefined) ?? undefined,
    createdAt: l.createdAt as Date,
    updatedAt: l.updatedAt as Date,
  };
}

/** §85 report surface: status, client, project, date window, un-numbered drafts. */
export interface InvoiceFilters {
  clientId?: string;
  projectId?: string;
  status?: InvoiceStatus;
  dateFrom?: string;
  dateTo?: string;
}

/** §85 — filtered list, newest issue date first. Tenant-scoped by construction. */
export async function getInvoices(
  tenantId: string,
  filters: InvoiceFilters = {},
  options: ListOptions = {}
): Promise<Invoice[]> {
  const normalized = normalizeListOptions(options);
  const { db } = await connectDb();
  if (db) {
    try {
      const query: Record<string, unknown> = { tenantId };
      if (filters.clientId !== undefined) query.clientId = filters.clientId;
      if (filters.projectId !== undefined) query.projectId = filters.projectId;
      if (filters.status !== undefined) query.status = filters.status;
      if (filters.dateFrom !== undefined || filters.dateTo !== undefined) {
        query.issueDate = {
          ...(filters.dateFrom !== undefined && { $gte: filters.dateFrom }),
          ...(filters.dateTo !== undefined && { $lte: filters.dateTo }),
        };
      }
      const invoices = await db.collection('invoices')
        .find(query)
        .sort({ issueDate: -1, createdAt: -1 })
        .skip(normalized.skip)
        .limit(normalized.limit)
        .toArray();
      return invoices.map(mapInvoiceDoc);
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.invoices
    .filter(i => i.tenantId === tenantId
      && (filters.clientId === undefined || i.clientId === filters.clientId)
      && (filters.projectId === undefined || i.projectId === filters.projectId)
      && (filters.status === undefined || i.status === filters.status)
      && (filters.dateFrom === undefined || i.issueDate >= filters.dateFrom)
      && (filters.dateTo === undefined || i.issueDate <= filters.dateTo))
    .sort((a, b) => (a.issueDate !== b.issueDate ? (a.issueDate > b.issueDate ? -1 : 1)
      : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
    .slice(normalized.skip, normalized.skip + normalized.limit);
}

/** §113 — a missing invoice and another tenant's invoice are IDENTICAL here (null). */
export async function getInvoiceById(id: string, tenantId: string): Promise<Invoice | null> {
  const trimmed = typeof id === 'string' ? id.trim() : id;
  const { db } = await connectDb();
  if (db) {
    try {
      const invoice = await db.collection('invoices').findOne({
        $or: [
          { _id: safeObjectId(trimmed) },
          { _id: trimmed as any },
          { id: trimmed },
        ],
        tenantId,
      });
      return invoice ? mapInvoiceDoc(invoice as unknown as Record<string, unknown>) : null;
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.invoices.find(i => (i.id === trimmed || (i as any)._id === trimmed) && i.tenantId === tenantId) ?? null;
}

export interface InvoiceCreateInput {
  clientId: string;
  projectId?: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  subtotal: Invoice['subtotal'];
  discount: Invoice['discount'];
  taxLines: Invoice['taxLines'];
  taxTotal: Invoice['taxTotal'];
  total: Invoice['total'];
  amountDue: Invoice['amountDue'];
  notes?: string;
  terms?: string;
  createdBy: string;
}

export async function createInvoice(tenantId: string, input: InvoiceCreateInput): Promise<Invoice> {
  const { db } = await connectDb();
  const now = new Date();
  // §74 — a draft carries NO invoiceNumber; one is allocated at finalization.
  // §63 — money fields start at the engine's draft totals; amountPaid is 0
  // until Module 10 confirms a payment.
  const newInvoice: Record<string, unknown> = {
    tenantId,
    clientId: input.clientId,
    ...(input.projectId !== undefined && { projectId: input.projectId }),
    issueDate: input.issueDate,
    dueDate: input.dueDate,
    currency: input.currency,
    subtotal: input.subtotal,
    discount: input.discount,
    taxLines: input.taxLines,
    taxTotal: input.taxTotal,
    total: input.total,
    amountPaid: { amount: 0, currency: input.currency },
    amountDue: input.amountDue,
    status: 'DRAFT',
    ...(input.notes !== undefined && { notes: input.notes }),
    ...(input.terms !== undefined && { terms: input.terms }),
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  };
  if (db) {
    try {
      const result = await db.collection('invoices').insertOne(newInvoice);
      return mapInvoiceDoc({ ...newInvoice, _id: result.insertedId });
    } catch (e) {}
  }
  const data = initLocalDb();
  const id = randomUUID();
  const localInvoice: Invoice = { id, ...newInvoice } as unknown as Invoice;
  data.invoices.push(localInvoice);
  writeLocalDb(data);
  return localInvoice;
}

/**
 * Partial update. The DOMAIN owns lifecycle/money fields — they are written
 * by the calculation engine and the finalize/send/void actions (9E), never
 * by a PATCH payload. matchedCount (Module 5 lesson) = existence.
 */
export async function updateInvoice(
  id: string,
  tenantId: string,
  updates: InvoiceUpdate
): Promise<boolean> {
  const trimmed = typeof id === 'string' ? id.trim() : id;
  const { db } = await connectDb();
  // Mongo $set rejects undefined values — strip them.
  const defined = Object.fromEntries(
    Object.entries(updates).filter(([, v]) => v !== undefined)
  );
  const stamped: Record<string, unknown> = { ...defined, updatedAt: new Date() };
  if (db) {
    try {
      const result = await db.collection('invoices')
        .updateOne({
          $or: [
            { _id: safeObjectId(trimmed) },
            { _id: trimmed as any },
            { id: trimmed },
          ],
          tenantId,
        }, { $set: stamped });
      return result.matchedCount > 0;
    } catch (e) {}
  }
  const data = initLocalDb();
  const idx = data.invoices.findIndex(i => (i.id === trimmed || (i as any)._id === trimmed) && i.tenantId === tenantId);
  if (idx >= 0) {
    data.invoices[idx] = { ...data.invoices[idx], ...stamped } as Invoice;
    writeLocalDb(data);
    return true;
  }
  return false;
}

// ---- invoice lines (§59/§61/§82) ----

/** §61 — the draft's composition, in insertion order. */
export async function getInvoiceLines(invoiceId: string, tenantId: string): Promise<InvoiceLine[]> {
  const trimmed = typeof invoiceId === 'string' ? invoiceId.trim() : invoiceId;
  const { db } = await connectDb();
  if (db) {
    try {
      const lines = await db.collection('invoice_lines')
        .find({ tenantId, invoiceId: trimmed })
        .sort({ createdAt: 1 })
        .toArray();
      return lines.map(mapInvoiceLineDoc);
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.invoiceLines
    .filter(l => l.tenantId === tenantId && l.invoiceId === trimmed)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

/** §113 — a missing line and another tenant's line are IDENTICAL here (null). */
export async function getInvoiceLineById(lineId: string, tenantId: string): Promise<InvoiceLine | null> {
  const { db } = await connectDb();
  if (db) {
    try {
      const line = await db.collection('invoice_lines').findOne({ _id: safeObjectId(lineId), tenantId });
      return line ? mapInvoiceLineDoc(line as unknown as Record<string, unknown>) : null;
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.invoiceLines.find(l => l.id === lineId && l.tenantId === tenantId) ?? null;
}

export interface InvoiceLineCreateInput {
  invoiceId: string;
  type: InvoiceLineType;
  description: string;
  quantity?: number;
  unitPrice?: InvoiceLine['unitPrice'];
  amount: InvoiceLine['amount'];
  sourceId?: string;
  classification?: InvoiceLine['classification'];
  taxCategory?: string;
  metadata?: Record<string, unknown>;
}

export async function createInvoiceLine(
  tenantId: string,
  input: InvoiceLineCreateInput
): Promise<InvoiceLine> {
  const { db } = await connectDb();
  const now = new Date();
  const newLine: Record<string, unknown> = {
    tenantId,
    invoiceId: input.invoiceId,
    type: input.type,
    description: input.description,
    ...(input.quantity !== undefined && { quantity: input.quantity }),
    ...(input.unitPrice !== undefined && { unitPrice: input.unitPrice }),
    amount: input.amount,
    ...(input.sourceId !== undefined && { sourceId: input.sourceId }),
    ...(input.classification !== undefined && { classification: input.classification }),
    ...(input.taxCategory !== undefined && { taxCategory: input.taxCategory }),
    ...(input.metadata !== undefined && { metadata: input.metadata }),
    createdAt: now,
    updatedAt: now,
  };
  if (db) {
    try {
      const result = await db.collection('invoice_lines').insertOne(newLine);
      return mapInvoiceLineDoc({ ...newLine, _id: result.insertedId });
    } catch (e) {}
  }
  const data = initLocalDb();
  const id = randomUUID();
  const localLine: InvoiceLine = { id, ...newLine } as unknown as InvoiceLine;
  data.invoiceLines.push(localLine);
  writeLocalDb(data);
  return localLine;
}

export async function updateInvoiceLine(
  lineId: string,
  tenantId: string,
  updates: Partial<Omit<InvoiceLine, 'id' | 'tenantId' | 'invoiceId' | 'createdAt' | 'updatedAt'>>
): Promise<boolean> {
  const { db } = await connectDb();
  const defined = Object.fromEntries(
    Object.entries(updates).filter(([, v]) => v !== undefined)
  );
  const stamped: Record<string, unknown> = { ...defined, updatedAt: new Date() };
  if (db) {
    try {
      const result = await db.collection('invoice_lines')
        .updateOne({ _id: safeObjectId(lineId), tenantId }, { $set: stamped });
      return result.matchedCount > 0;
    } catch (e) {}
  }
  const data = initLocalDb();
  const idx = data.invoiceLines.findIndex(l => l.id === lineId && l.tenantId === tenantId);
  if (idx >= 0) {
    data.invoiceLines[idx] = { ...data.invoiceLines[idx], ...stamped } as InvoiceLine;
    writeLocalDb(data);
    return true;
  }
  return false;
}

/**
 * §82 removeInvoiceLine — deletion is a DRAFT-only operation (the domain
 * rejects anything else and releases the reservation first). Returns whether
 * a line was actually removed.
 */
export async function deleteInvoiceLine(lineId: string, tenantId: string): Promise<boolean> {
  const { db } = await connectDb();
  if (db) {
    try {
      const result = await db.collection('invoice_lines')
        .deleteOne({ _id: safeObjectId(lineId), tenantId });
      return result.deletedCount > 0;
    } catch (e) {}
  }
  const data = initLocalDb();
  const idx = data.invoiceLines.findIndex(l => l.id === lineId && l.tenantId === tenantId);
  if (idx >= 0) {
    data.invoiceLines.splice(idx, 1);
    writeLocalDb(data);
    return true;
  }
  return false;
}

// ---- invoice numbering (§74; Module 11 §23/§24 — per-FY sequences) ----

/**
 * §74/§23 — the central numbering authority, now FY-scoped: the CBIC rule is
 * uniqueness within the financial year, so the counter is keyed
 * {tenantId, fiscalYear}. Mongo findOneAndUpdate + $inc is atomic under
 * concurrency (§24 — two admins get 101 and 102, never 101 twice); the
 * local-JSON fallback is read-modify-write (single process — the documented
 * Phase 1 bound). `seq` = last issued; the return value is the number to
 * format (formatInvoiceNumber).
 */
export async function allocateInvoiceNumberForFiscalYear(
  tenantId: string,
  fiscalYear: string,
  prefix: string = 'INV-'
): Promise<number> {
  const { db } = await connectDb();
  if (db) {
    try {
      const result = await db.collection('invoice_sequences').findOneAndUpdate(
        { tenantId, fiscalYear },
        {
          $inc: { seq: 1 },
          $set: { updatedAt: new Date() },
          $setOnInsert: { tenantId, fiscalYear, prefix, createdAt: new Date() },
        },
        { upsert: true, returnDocument: 'after' }
      );
      const doc = result as unknown as { seq?: number } | null;
      if (doc && typeof doc.seq === 'number' && doc.seq >= 1) {
        return doc.seq;
      }
    } catch (e) {
      logError('db:allocateInvoiceNumberForFiscalYear mongo error', e, { tenantId, fiscalYear });
    }
  }
  const data = initLocalDb();
  const existing = data.invoiceSequences.find(s => s.tenantId === tenantId && s.fiscalYear === fiscalYear);
  if (existing) {
    existing.seq += 1;
    existing.updatedAt = new Date();
    writeLocalDb(data);
    return existing.seq;
  }
  data.invoiceSequences.push({
    tenantId, fiscalYear, prefix, seq: 1, updatedAt: new Date(),
  });
  writeLocalDb(data);
  return 1;
}

/**
 * Module 3 — allocate the next project-code sequence number for a tenant.
 *
 * Deliberately the SAME atomic shape as allocateInvoiceNumberForFiscalYear:
 * a single findOneAndUpdate with $inc + upsert, so two concurrent project
 * creations can never be handed the same number. Rendered for display by
 * formatProjectCode (lib/agency/types/project.ts) as PRJ-0001.
 */
export async function allocateProjectCode(tenantId: string): Promise<number> {
  const { db } = await connectDb();
  if (db) {
    try {
      const result = await db.collection('project_sequences').findOneAndUpdate(
        { tenantId },
        {
          $inc: { seq: 1 },
          $set: { updatedAt: new Date() },
          $setOnInsert: { tenantId, createdAt: new Date() },
        },
        { upsert: true, returnDocument: 'after' }
      );
      const doc = result as unknown as { seq?: number } | null;
      if (doc && typeof doc.seq === 'number' && doc.seq >= 1) {
        return doc.seq;
      }
    } catch (e) {
      logError('db:allocateProjectCode mongo error', e, { tenantId });
    }
  }
  const data = initLocalDb();
  const existing = data.projectSequences.find(s => s.tenantId === tenantId);
  if (existing) {
    existing.seq += 1;
    existing.updatedAt = new Date();
    writeLocalDb(data);
    return existing.seq;
  }
  data.projectSequences.push({ tenantId, seq: 1, updatedAt: new Date() });
  writeLocalDb(data);
  return 1;
}

/**
 * Module 11 §23 — one-time migration guard: before a tenant's FIRST
 * FY-scoped allocation, seed the sequence from the legacy tenant-wide
 * counter (Module 9 §74) so no number is ever re-issued. The insert is
 * unique-guarded (compound unique index / E11000 catch): a concurrent seed
 * simply loses, and only the atomic $inc allocator ever hands out numbers.
 */
export async function seedInvoiceSequenceFromLegacy(
  tenantId: string,
  fiscalYear: string,
  prefix: string = 'INV-'
): Promise<void> {
  const { db } = await connectDb();
  if (db) {
    try {
      const legacy = await db.collection('invoice_counters').findOne({ tenantId });
      const legacySeq = (legacy as unknown as { seq?: number } | null)?.seq;
      const seq = typeof legacySeq === 'number' && legacySeq >= 1 ? legacySeq : 0;
      await db.collection('invoice_sequences').insertOne({
        tenantId, fiscalYear, prefix, seq, updatedAt: new Date(),
      });
    } catch (e) {
      // E11000 duplicate — the sequence already exists (seeded or allocated).
    }
    return;
  }
  const data = initLocalDb();
  if (data.invoiceSequences.some(s => s.tenantId === tenantId && s.fiscalYear === fiscalYear)) return;
  const legacy = data.invoiceCounters.find(c => c.tenantId === tenantId);
  data.invoiceSequences.push({
    tenantId, fiscalYear, prefix, seq: legacy && legacy.seq >= 1 ? legacy.seq : 0, updatedAt: new Date(),
  });
  writeLocalDb(data);
}

// ---- milestone billing lookups (Module 9 §62/§73) ----

/** §113 — tenant-scoped single milestone (used by invoice line validation). */
export async function getProjectMilestoneById(
  milestoneId: string,
  tenantId: string
): Promise<ProjectMilestone | null> {
  const { db } = await connectDb();
  if (db) {
    try {
      const milestone = await db.collection('project_milestones')
        .findOne({ _id: safeObjectId(milestoneId), tenantId });
      return milestone ? mapProjectMilestoneDoc(milestone as unknown as Record<string, unknown>) : null;
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.projectMilestones.find(m => m.id === milestoneId && m.tenantId === tenantId) ?? null;
}

// ---- MODULE 10: PAYMENTS (spec §88–§96, §104, §116) ----

function mapPaymentDoc(p: Record<string, unknown>): Payment {
  return {
    id: (p._id as ObjectId).toString(),
    tenantId: p.tenantId as string,
    invoiceId: p.invoiceId as string,
    clientId: p.clientId as string,
    amount: (p.amount as Payment['amount'] | undefined) ?? { amount: 0, currency: 'INR' },
    withholdingAmount: (p.withholdingAmount as Payment['withholdingAmount'] | null | undefined) ?? undefined,
    // Module 11 §20 — the withholding WHY alongside the §92 amount.
    withholdingAdjustment: (p.withholdingAdjustment as Payment['withholdingAdjustment'] | null | undefined) ?? undefined,
    receivedAt: p.receivedAt as string,
    method: (p.method as PaymentMethod | undefined) ?? 'OTHER',
    reference: (p.reference as string | null | undefined) ?? undefined,
    accountId: (p.accountId as string | null | undefined) ?? undefined,
    gateway: (p.gateway as string | null | undefined) ?? undefined,
    gatewayPaymentId: (p.gatewayPaymentId as string | null | undefined) ?? undefined,
    // Module 12 §47 — the link lineage (plink_…), when the money came through
    // a payment link.
    gatewayLinkId: (p.gatewayLinkId as string | null | undefined) ?? undefined,
    // Module 12 §52 — the payment's origin, stamped at write time.
    source: (p.source as Payment['source'] | null | undefined) ?? undefined,
    status: (p.status as PaymentStatus | undefined) ?? 'PENDING',
    transactionId: (p.transactionId as string | null | undefined) ?? undefined,
    reconciliationStatus: (p.reconciliationStatus as Payment['reconciliationStatus'] | null | undefined) ?? undefined,
    notes: (p.notes as string | null | undefined) ?? undefined,
    createdBy: p.createdBy as string,
    createdAt: p.createdAt as Date,
    updatedAt: p.updatedAt as Date,
  };
}

/** §116 report surface: invoice, client, status, method, date window. */
export interface PaymentFilters {
  invoiceId?: string;
  clientId?: string;
  status?: PaymentStatus;
  method?: PaymentMethod;
  dateFrom?: string;
  dateTo?: string;
  /** §96 — the gateway replay probe (10D). */
  gatewayPaymentId?: string;
}

/** §116 — filtered list, newest received first. Tenant-scoped by construction. */
export async function getPayments(
  tenantId: string,
  filters: PaymentFilters = {},
  options: ListOptions = {}
): Promise<Payment[]> {
  const normalized = normalizeListOptions(options);
  const { db } = await connectDb();
  if (db) {
    try {
      const query: Record<string, unknown> = { tenantId };
      if (filters.invoiceId !== undefined) query.invoiceId = filters.invoiceId;
      if (filters.clientId !== undefined) query.clientId = filters.clientId;
      if (filters.status !== undefined) query.status = filters.status;
      if (filters.method !== undefined) query.method = filters.method;
      if (filters.gatewayPaymentId !== undefined) query.gatewayPaymentId = filters.gatewayPaymentId;
      if (filters.dateFrom !== undefined || filters.dateTo !== undefined) {
        query.receivedAt = {
          ...(filters.dateFrom !== undefined && { $gte: filters.dateFrom }),
          ...(filters.dateTo !== undefined && { $lte: filters.dateTo }),
        };
      }
      const payments = await db.collection('payments')
        .find(query)
        .sort({ receivedAt: -1, createdAt: -1 })
        .skip(normalized.skip)
        .limit(normalized.limit)
        .toArray();
      return payments.map(mapPaymentDoc);
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.payments
    .filter(p => p.tenantId === tenantId
      && (filters.invoiceId === undefined || p.invoiceId === filters.invoiceId)
      && (filters.clientId === undefined || p.clientId === filters.clientId)
      && (filters.status === undefined || p.status === filters.status)
      && (filters.method === undefined || p.method === filters.method)
      && (filters.gatewayPaymentId === undefined || p.gatewayPaymentId === filters.gatewayPaymentId)
      && (filters.dateFrom === undefined || p.receivedAt >= filters.dateFrom)
      && (filters.dateTo === undefined || p.receivedAt <= filters.dateTo))
    .sort((a, b) => (a.receivedAt !== b.receivedAt ? (a.receivedAt > b.receivedAt ? -1 : 1)
      : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
    .slice(normalized.skip, normalized.skip + normalized.limit);
}

/** §113 — a missing payment and another tenant's payment are IDENTICAL here (null). */
export async function getPaymentById(id: string, tenantId: string): Promise<Payment | null> {
  const { db } = await connectDb();
  if (db) {
    try {
      const payment = await db.collection('payments').findOne({ _id: safeObjectId(id), tenantId });
      return payment ? mapPaymentDoc(payment as unknown as Record<string, unknown>) : null;
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.payments.find(p => p.id === id && p.tenantId === tenantId) ?? null;
}

/**
 * Module 10 §113/§96 — the webhook's entity resolution lookup.
 * TENANT-AGNOSTIC by design: a webhook payload never states the tenant (it
 * is untrusted), so the STORED {gateway, gatewayPaymentId} relationship is
 * the only way in. The returned payment carries its own tenantId — every
 * write that follows stays tenant-scoped through the normal service calls.
 * Backed by the §96 partial unique index in Mongo, so at most one match.
 */
export async function findPaymentByGatewayId(
  gateway: string,
  gatewayPaymentId: string
): Promise<Payment | null> {
  const { db } = await connectDb();
  if (db) {
    try {
      const payment = await db.collection('payments')
        .findOne({ gateway, gatewayPaymentId });
      return payment ? mapPaymentDoc(payment as unknown as Record<string, unknown>) : null;
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.payments.find(
    p => p.gateway === gateway && p.gatewayPaymentId === gatewayPaymentId
  ) ?? null;
}

export interface PaymentCreateInput {
  invoiceId: string;
  clientId: string;
  amount: Payment['amount'];
  withholdingAmount?: Payment['withholdingAmount'];
  /** Module 11 §20 — the withholding adjustment record (type/code/rate/…). */
  withholdingAdjustment?: WithholdingAdjustment;
  receivedAt: string;
  method: PaymentMethod;
  reference?: string;
  accountId?: string;
  gateway?: string;
  gatewayPaymentId?: string;
  /** Module 12 §47 — the gateway's link id (plink_…) the money came through. */
  gatewayLinkId?: string;
  /** Module 12 §52 — MANUAL | RAZORPAY | OTHER_GATEWAY, stamped by the domain. */
  source?: Payment['source'];
  reconciliationStatus?: Payment['reconciliationStatus'];
  notes?: string;
  createdBy: string;
}

/** §88/§101 — created PENDING; money moves only at confirmation. */
export async function createPayment(tenantId: string, input: PaymentCreateInput): Promise<Payment> {
  const { db } = await connectDb();
  const now = new Date();
  const newPayment: Record<string, unknown> = {
    tenantId,
    invoiceId: input.invoiceId,
    clientId: input.clientId,
    amount: input.amount,
    ...(input.withholdingAmount !== undefined && { withholdingAmount: input.withholdingAmount }),
    ...(input.withholdingAdjustment !== undefined && { withholdingAdjustment: input.withholdingAdjustment }),
    receivedAt: input.receivedAt,
    method: input.method,
    ...(input.reference !== undefined && { reference: input.reference }),
    ...(input.accountId !== undefined && { accountId: input.accountId }),
    ...(input.gateway !== undefined && { gateway: input.gateway }),
    ...(input.gatewayPaymentId !== undefined && { gatewayPaymentId: input.gatewayPaymentId }),
    ...(input.gatewayLinkId !== undefined && { gatewayLinkId: input.gatewayLinkId }),
    ...(input.source !== undefined && { source: input.source }),
    ...(input.reconciliationStatus !== undefined && { reconciliationStatus: input.reconciliationStatus }),
    ...(input.notes !== undefined && { notes: input.notes }),
    status: 'PENDING',
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  };
  if (db) {
    try {
      const result = await db.collection('payments').insertOne(newPayment);
      return mapPaymentDoc({ ...newPayment, _id: result.insertedId });
    } catch (e) {}
  }
  const data = initLocalDb();
  const id = randomUUID();
  const localPayment: Payment = { id, ...newPayment } as unknown as Payment;
  data.payments.push(localPayment);
  writeLocalDb(data);
  return localPayment;
}

/**
 * Partial update. The DOMAIN owns status/transactionId/reconciliationStatus
 * — they move only through the lifecycle actions (§102), never a PATCH.
 * matchedCount (Module 5 lesson) = existence. Mongo $set rejects undefined —
 * strip before writing.
 */
export async function updatePayment(
  id: string,
  tenantId: string,
  updates: PaymentUpdate
): Promise<boolean> {
  const { db } = await connectDb();
  const defined = Object.fromEntries(
    Object.entries(updates).filter(([, v]) => v !== undefined)
  );
  const stamped: Record<string, unknown> = { ...defined, updatedAt: new Date() };
  if (db) {
    try {
      const result = await db.collection('payments')
        .updateOne({ _id: safeObjectId(id), tenantId }, { $set: stamped });
      return result.matchedCount > 0;
    } catch (e) {}
  }
  const data = initLocalDb();
  const idx = data.payments.findIndex(p => p.id === id && p.tenantId === tenantId);
  if (idx >= 0) {
    data.payments[idx] = { ...data.payments[idx], ...stamped } as Payment;
    writeLocalDb(data);
    return true;
  }
  return false;
}

// ---- MODULE 12: PAYMENT LINKS (spec §33–§37, §53) ----

function mapPaymentLinkDoc(l: Record<string, unknown>): PaymentLink {
  return {
    id: (l._id as ObjectId).toString(),
    tenantId: l.tenantId as string,
    invoiceId: l.invoiceId as string,
    provider: (l.provider as PaymentLink['provider']) ?? 'RAZORPAY',
    providerLinkId: l.providerLinkId as string,
    shortUrl: (l.shortUrl as string | null | undefined) ?? undefined,
    amount: (l.amount as PaymentLink['amount'] | undefined) ?? { amount: 0, currency: 'INR' },
    status: (l.status as PaymentLinkStatus | undefined) ?? 'CREATED',
    expiresAt: (l.expiresAt as Date | null | undefined) ?? undefined,
    createdAt: l.createdAt as Date,
    updatedAt: l.updatedAt as Date,
  };
}

/** §34/§35 — the invoice's link history, newest first. */
export async function getPaymentLinks(
  tenantId: string,
  invoiceId?: string
): Promise<PaymentLink[]> {
  const { db } = await connectDb();
  if (db) {
    try {
      const query: Record<string, unknown> = { tenantId, ...(invoiceId !== undefined && { invoiceId }) };
      const links = await db.collection('payment_links')
        .find(query)
        .sort({ createdAt: -1 })
        .toArray();
      return links.map(mapPaymentLinkDoc);
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.paymentLinks
    .filter(l => l.tenantId === tenantId && (invoiceId === undefined || l.invoiceId === invoiceId))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/** §113 — a missing link and another tenant's link are IDENTICAL here (null). */
export async function getPaymentLinkById(id: string, tenantId: string): Promise<PaymentLink | null> {
  const { db } = await connectDb();
  if (db) {
    try {
      const link = await db.collection('payment_links').findOne({ _id: safeObjectId(id), tenantId });
      return link ? mapPaymentLinkDoc(link as unknown as Record<string, unknown>) : null;
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.paymentLinks.find(l => l.id === id && l.tenantId === tenantId) ?? null;
}

/**
 * Module 12 §113/§41 — the link-webhook resolution lookup, mirroring
 * findPaymentByGatewayId: TENANT-AGNOSTIC by design (the payload never
 * states the tenant), keyed by the ONE trusted fact a link webhook carries.
 * Backed by the partial unique index, so at most one match.
 */
export async function findPaymentLinkByProviderLinkId(
  providerLinkId: string
): Promise<PaymentLink | null> {
  const { db } = await connectDb();
  if (db) {
    try {
      const link = await db.collection('payment_links').findOne({ providerLinkId });
      return link ? mapPaymentLinkDoc(link as unknown as Record<string, unknown>) : null;
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.paymentLinks.find(l => l.providerLinkId === providerLinkId) ?? null;
}

export interface PaymentLinkCreateInput {
  invoiceId: string;
  provider: PaymentLink['provider'];
  providerLinkId: string;
  shortUrl?: string;
  amount: PaymentLink['amount'];
  expiresAt?: Date;
}

/** §33 — created in the CREATED state; the webhook lifecycle moves it. */
export async function createPaymentLink(
  tenantId: string,
  input: PaymentLinkCreateInput
): Promise<PaymentLink> {
  const { db } = await connectDb();
  const now = new Date();
  const newLink: Record<string, unknown> = {
    tenantId,
    invoiceId: input.invoiceId,
    provider: input.provider,
    providerLinkId: input.providerLinkId,
    ...(input.shortUrl !== undefined && { shortUrl: input.shortUrl }),
    amount: input.amount,
    status: 'CREATED' as PaymentLinkStatus,
    ...(input.expiresAt !== undefined && { expiresAt: input.expiresAt }),
    createdAt: now,
    updatedAt: now,
  };
  if (db) {
    try {
      const result = await db.collection('payment_links').insertOne(newLink);
      return mapPaymentLinkDoc({ ...newLink, _id: result.insertedId });
    } catch (e) {
      // Module 5 lesson — a duplicate key is a REAL rejection (the same
      // provider link already recorded), never a silent local-fallback write.
      if ((e as { code?: number }).code === 11000) throw e;
    }
  }
  const data = initLocalDb();
  const id = randomUUID();
  const localLink: PaymentLink = { id, ...newLink } as unknown as PaymentLink;
  data.paymentLinks.push(localLink);
  writeLocalDb(data);
  return localLink;
}

/**
 * Partial update (status moves only through the domain). matchedCount =
 * existence (Module 5 lesson). Mongo $set rejects undefined — stripped.
 */
export async function updatePaymentLink(
  id: string,
  tenantId: string,
  updates: PaymentLinkUpdate
): Promise<boolean> {
  const { db } = await connectDb();
  const defined = Object.fromEntries(
    Object.entries(updates).filter(([, v]) => v !== undefined)
  );
  const stamped: Record<string, unknown> = { ...defined, updatedAt: new Date() };
  if (db) {
    try {
      const result = await db.collection('payment_links')
        .updateOne({ _id: safeObjectId(id), tenantId }, { $set: stamped });
      return result.matchedCount > 0;
    } catch (e) {}
  }
  const data = initLocalDb();
  const idx = data.paymentLinks.findIndex(l => l.id === id && l.tenantId === tenantId);
  if (idx >= 0) {
    data.paymentLinks[idx] = { ...data.paymentLinks[idx], ...stamped } as PaymentLink;
    writeLocalDb(data);
    return true;
  }
  return false;
}

// ---- MODULE 12: WEBHOOK EVENTS (spec §42–§46) ----

function mapWebhookEventDoc(e: Record<string, unknown>): WebhookEvent {
  return {
    id: (e._id as ObjectId).toString(),
    tenantId: (e.tenantId as string | null | undefined) ?? undefined,
    provider: e.provider as string,
    providerEventId: e.providerEventId as string,
    eventType: (e.eventType as string | undefined) ?? 'unknown',
    receivedAt: e.receivedAt as Date,
    processedAt: (e.processedAt as Date | null | undefined) ?? undefined,
    processingStatus: (e.processingStatus as WebhookProcessingStatus | undefined) ?? 'RECEIVED',
    payloadHash: e.payloadHash as string,
    errorMessage: (e.errorMessage as string | null | undefined) ?? undefined,
  };
}

/**
 * §42 — the idempotency probe: provider + providerEventId (Razorpay's
 * equivalent: the raw-body hash). Tenant-agnostic — the store resolves the
 * tenant only during processing.
 */
export async function findWebhookEventByProviderEventId(
  provider: string,
  providerEventId: string
): Promise<WebhookEvent | null> {
  const { db } = await connectDb();
  if (db) {
    try {
      const event = await db.collection('webhook_events').findOne({ provider, providerEventId });
      return event ? mapWebhookEventDoc(event as unknown as Record<string, unknown>) : null;
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.webhookEvents.find(
    e => e.provider === provider && e.providerEventId === providerEventId
  ) ?? null;
}

export interface WebhookEventCreateInput {
  tenantId?: string;
  provider: string;
  providerEventId: string;
  eventType: string;
  payloadHash: string;
}

/**
 * §44 — a new event lands RECEIVED. Returns null when the unique
 * {provider, providerEventId} row already exists (a concurrent delivery won
 * the insert race) — the caller re-reads and treats it as existing. Other
 * errors fall back to the local store per the repo pattern.
 */
export async function createWebhookEvent(
  input: WebhookEventCreateInput
): Promise<WebhookEvent | null> {
  const { db } = await connectDb();
  const now = new Date();
  const newEvent: Record<string, unknown> = {
    ...(input.tenantId !== undefined && { tenantId: input.tenantId }),
    provider: input.provider,
    providerEventId: input.providerEventId,
    eventType: input.eventType,
    receivedAt: now,
    processingStatus: 'RECEIVED' as WebhookProcessingStatus,
    payloadHash: input.payloadHash,
  };
  if (db) {
    try {
      const result = await db.collection('webhook_events').insertOne(newEvent);
      return mapWebhookEventDoc({ ...newEvent, _id: result.insertedId });
    } catch (e) {
      // The §42 uniqueness boundary says NO — a concurrent identical
      // delivery exists. Signal the caller; never write a phantom local row.
      if ((e as { code?: number }).code === 11000) return null;
    }
  }
  const data = initLocalDb();
  if (data.webhookEvents.some(e => e.provider === input.provider && e.providerEventId === input.providerEventId)) {
    return null;
  }
  const id = randomUUID();
  const localEvent: WebhookEvent = { id, ...newEvent } as unknown as WebhookEvent;
  data.webhookEvents.push(localEvent);
  writeLocalDb(data);
  return localEvent;
}

export interface WebhookEventUpdate {
  tenantId?: string;
  processingStatus?: WebhookProcessingStatus;
  processedAt?: Date | null;
  errorMessage?: string | null;
}

/** §44 — state transitions + the resolved tenant, stamped by the pipeline. */
export async function updateWebhookEvent(
  id: string,
  updates: WebhookEventUpdate
): Promise<boolean> {
  const { db } = await connectDb();
  const defined = Object.fromEntries(
    Object.entries(updates).filter(([, v]) => v !== undefined)
  );
  const stamped: Record<string, unknown> = { ...defined };
  if (db) {
    try {
      const result = await db.collection('webhook_events')
        .updateOne({ _id: safeObjectId(id) }, { $set: stamped });
      return result.matchedCount > 0;
    } catch (e) {}
  }
  const data = initLocalDb();
  const idx = data.webhookEvents.findIndex(e => e.id === id);
  if (idx >= 0) {
    data.webhookEvents[idx] = { ...data.webhookEvents[idx], ...stamped } as WebhookEvent;
    writeLocalDb(data);
    return true;
  }
  return false;
}

/** §43 — the operational-visibility list (the reconciliation view). */
export async function listRecentWebhookEvents(
  filters: { tenantId?: string; processingStatus?: WebhookProcessingStatus } = {},
  limit = 50
): Promise<WebhookEvent[]> {
  const { db } = await connectDb();
  if (db) {
    try {
      const query: Record<string, unknown> = {
        ...(filters.tenantId !== undefined && { tenantId: filters.tenantId }),
        ...(filters.processingStatus !== undefined && { processingStatus: filters.processingStatus }),
      };
      const events = await db.collection('webhook_events')
        .find(query)
        .sort({ receivedAt: -1 })
        .limit(limit)
        .toArray();
      return events.map(mapWebhookEventDoc);
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.webhookEvents
    .filter(e => (filters.tenantId === undefined || e.tenantId === filters.tenantId)
      && (filters.processingStatus === undefined || e.processingStatus === filters.processingStatus))
    .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
    .slice(0, limit);
}

// ---- MODULE 11 — TAX PROFILES (spec §6/§29) ----

function mapTaxProfileDoc(p: Record<string, unknown>): TaxProfile {
  return {
    id: (p._id as ObjectId).toString(),
    tenantId: p.tenantId as string,
    name: p.name as string,
    country: p.country as string,
    registrationType: p.registrationType as string | undefined,
    registrationNumber: p.registrationNumber as string | undefined,
    taxTreatment: (p.taxTreatment as TaxTreatment | undefined) ?? 'OTHER',
    stateOrRegion: p.stateOrRegion as string | undefined,
    // §106 spirit — a legacy row without the flag reads as active.
    active: (p.active as boolean | undefined) ?? true,
    createdAt: p.createdAt as Date,
    updatedAt: p.updatedAt as Date | undefined,
  };
}

export interface TaxProfileListFilters {
  active?: boolean;
  country?: string;
  taxTreatment?: TaxTreatment;
}

export async function getTaxProfiles(
  tenantId: string,
  filters: TaxProfileListFilters = {}
): Promise<TaxProfile[]> {
  const { db } = await connectDb();
  if (db) {
    try {
      const query: Record<string, unknown> = { tenantId };
      if (filters.active !== undefined) query.active = filters.active;
      if (filters.country !== undefined) query.country = filters.country;
      if (filters.taxTreatment !== undefined) query.taxTreatment = filters.taxTreatment;
      const profiles = await db.collection('tax_profiles')
        .find(query)
        .sort({ createdAt: 1 })
        .toArray();
      return profiles.map(mapTaxProfileDoc);
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.taxProfiles
    .filter(p => p.tenantId === tenantId
      && (filters.active === undefined || p.active === filters.active)
      && (filters.country === undefined || p.country === filters.country)
      && (filters.taxTreatment === undefined || p.taxTreatment === filters.taxTreatment))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

/** §113 — a missing profile and another tenant's profile are IDENTICAL (null). */
export async function getTaxProfileById(id: string, tenantId: string): Promise<TaxProfile | null> {
  const { db } = await connectDb();
  if (db) {
    try {
      const profile = await db.collection('tax_profiles').findOne({ _id: safeObjectId(id), tenantId });
      return profile ? mapTaxProfileDoc(profile) : null;
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.taxProfiles.find(p => p.id === id && p.tenantId === tenantId) ?? null;
}

export interface TaxProfileCreateInput {
  name: string;
  country: string;
  taxTreatment: TaxTreatment;
  registrationType?: string;
  registrationNumber?: string;
  stateOrRegion?: string;
  active?: boolean;
}

export async function createTaxProfile(tenantId: string, input: TaxProfileCreateInput): Promise<TaxProfile> {
  const { db } = await connectDb();
  const now = new Date();
  const newProfile: Record<string, unknown> = {
    tenantId,
    name: input.name,
    country: input.country,
    taxTreatment: input.taxTreatment,
    ...(input.registrationType !== undefined && { registrationType: input.registrationType }),
    ...(input.registrationNumber !== undefined && { registrationNumber: input.registrationNumber }),
    ...(input.stateOrRegion !== undefined && { stateOrRegion: input.stateOrRegion }),
    active: input.active ?? true,
    createdAt: now,
    updatedAt: now,
  };
  if (db) {
    try {
      const result = await db.collection('tax_profiles').insertOne(newProfile);
      return mapTaxProfileDoc({ ...newProfile, _id: result.insertedId });
    } catch (e) {}
  }
  const data = initLocalDb();
  const id = randomUUID();
  const localProfile: TaxProfile = { id, ...newProfile } as unknown as TaxProfile;
  data.taxProfiles.push(localProfile);
  writeLocalDb(data);
  return localProfile;
}

export async function updateTaxProfile(
  id: string,
  tenantId: string,
  updates: Partial<Omit<TaxProfile, 'id' | 'tenantId' | 'createdAt'>>
): Promise<boolean> {
  const { db } = await connectDb();
  const stamped: Record<string, unknown> = { ...updates, updatedAt: new Date() };
  if (db) {
    try {
      const result = await db.collection('tax_profiles')
        .updateOne({ _id: safeObjectId(id), tenantId }, { $set: stamped });
      // matchedCount (Module 5 lesson): idempotent PATCH → 200, never 404.
      return result.matchedCount > 0;
    } catch (e) {}
  }
  const data = initLocalDb();
  const idx = data.taxProfiles.findIndex(p => p.id === id && p.tenantId === tenantId);
  if (idx >= 0) {
    data.taxProfiles[idx] = { ...data.taxProfiles[idx], ...stamped } as TaxProfile;
    writeLocalDb(data);
    return true;
  }
  return false;
}

// ---- MODULE 11 — WITHHOLDING RULES (spec §19) ----

/**
 * §19 — effective-dated withholding rule rows. The rule CODE is opaque
 * configuration data (the tenant's 2025-Act references etc.); no legacy
 * section number is hard-coded anywhere in the product.
 */
function mapWithholdingRuleDoc(r: Record<string, unknown>): WithholdingRule {
  return {
    id: (r._id as ObjectId).toString(),
    tenantId: r.tenantId as string,
    jurisdiction: (r.jurisdiction as string | undefined) ?? 'IN',
    effectiveFrom: (r.effectiveFrom as string | undefined) ?? '1970-01-01',
    effectiveTo: (r.effectiveTo as string | null | undefined) ?? undefined,
    ruleCode: (r.ruleCode as string | undefined) ?? '',
    rate: (r.rate as number | undefined) ?? 0,
    threshold: (r.threshold as number | null | undefined) ?? undefined,
    conditions: (r.conditions as Record<string, unknown> | null | undefined) ?? undefined,
    // §106 spirit — a legacy row without the flag reads as active.
    active: (r.active as boolean | undefined) ?? true,
    createdAt: r.createdAt as Date,
    updatedAt: (r.updatedAt as Date | undefined) ?? new Date(),
  };
}

export interface WithholdingRuleListFilters {
  active?: boolean;
  jurisdiction?: string;
}

export async function getWithholdingRules(
  tenantId: string,
  filters: WithholdingRuleListFilters = {}
): Promise<WithholdingRule[]> {
  const { db } = await connectDb();
  if (db) {
    try {
      const query: Record<string, unknown> = { tenantId };
      if (filters.active !== undefined) query.active = filters.active;
      if (filters.jurisdiction !== undefined) query.jurisdiction = filters.jurisdiction;
      const rules = await db.collection('withholding_rules')
        .find(query)
        .sort({ createdAt: 1 })
        .toArray();
      return rules.map(mapWithholdingRuleDoc);
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.withholdingRules
    .filter(r => r.tenantId === tenantId
      && (filters.active === undefined || r.active === filters.active)
      && (filters.jurisdiction === undefined || r.jurisdiction === filters.jurisdiction))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

/** §113 — a missing rule and another tenant's rule are IDENTICAL (null). */
export async function getWithholdingRuleById(id: string, tenantId: string): Promise<WithholdingRule | null> {
  const { db } = await connectDb();
  if (db) {
    try {
      const rule = await db.collection('withholding_rules').findOne({ _id: safeObjectId(id), tenantId });
      return rule ? mapWithholdingRuleDoc(rule as unknown as Record<string, unknown>) : null;
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.withholdingRules.find(r => r.id === id && r.tenantId === tenantId) ?? null;
}

export interface WithholdingRuleCreateInput {
  jurisdiction: string;
  effectiveFrom: string;
  ruleCode: string;
  rate: number;
  effectiveTo?: string;
  threshold?: number;
  conditions?: Record<string, unknown>;
  active?: boolean;
}

export async function createWithholdingRule(tenantId: string, input: WithholdingRuleCreateInput): Promise<WithholdingRule> {
  const { db } = await connectDb();
  const now = new Date();
  const newRule: Record<string, unknown> = {
    tenantId,
    jurisdiction: input.jurisdiction,
    effectiveFrom: input.effectiveFrom,
    ...(input.effectiveTo !== undefined && { effectiveTo: input.effectiveTo }),
    ruleCode: input.ruleCode,
    rate: input.rate,
    ...(input.threshold !== undefined && { threshold: input.threshold }),
    ...(input.conditions !== undefined && { conditions: input.conditions }),
    active: input.active ?? true,
    createdAt: now,
    updatedAt: now,
  };
  if (db) {
    try {
      const result = await db.collection('withholding_rules').insertOne(newRule);
      return mapWithholdingRuleDoc({ ...newRule, _id: result.insertedId });
    } catch (e) {}
  }
  const data = initLocalDb();
  const id = randomUUID();
  const localRule: WithholdingRule = { id, ...newRule } as unknown as WithholdingRule;
  data.withholdingRules.push(localRule);
  writeLocalDb(data);
  return localRule;
}

export async function updateWithholdingRule(
  id: string,
  tenantId: string,
  updates: Partial<Omit<WithholdingRule, 'id' | 'tenantId' | 'createdAt' | 'effectiveTo' | 'threshold'>> & {
    /** Explicit null CLEARS the window end / threshold (§19). */
    effectiveTo?: string | null;
    threshold?: number | null;
  }
): Promise<boolean> {
  const { db } = await connectDb();
  // null → undefined before writing: Mongo $set undefined serializes as null
  // (stored null, mapper folds to undefined on read); the local store keeps
  // its typed shape. Either way a null payload clears the field.
  const stamped: Record<string, unknown> = {
    ...updates,
    ...(updates.effectiveTo === null && { effectiveTo: undefined }),
    ...(updates.threshold === null && { threshold: undefined }),
    updatedAt: new Date(),
  };
  if (db) {
    try {
      const result = await db.collection('withholding_rules')
        .updateOne({ _id: safeObjectId(id), tenantId }, { $set: stamped });
      // matchedCount (Module 5 lesson): idempotent PATCH → 200, never 404.
      return result.matchedCount > 0;
    } catch (e) {}
  }
  const data = initLocalDb();
  const idx = data.withholdingRules.findIndex(r => r.id === id && r.tenantId === tenantId);
  if (idx >= 0) {
    data.withholdingRules[idx] = { ...data.withholdingRules[idx], ...stamped } as WithholdingRule;
    writeLocalDb(data);
    return true;
  }
  return false;
}

// ---- FEATURE FLAGS ----
export async function getFeatureFlags(): Promise<FeatureFlag[]> {
  const { db } = await connectDb();
  if (db) {
    try {
      const flags = await db.collection('flags').find({}).toArray();
      return flags.map(f => ({
        id: f._id.toString(),
        name: f.name,
        desc: f.desc,
        status: f.status,
        rollout: f.rollout,
        target: f.target,
        createdAt: f.createdAt,
      }));
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.flags;
}

export async function toggleFeatureFlag(id: string): Promise<boolean> {
  const { db } = await connectDb();
  if (db) {
    try {
      const flag = await db.collection('flags').findOne({ _id: safeObjectId(id) });
      if (flag) {
        const result = await db.collection('flags').updateOne({ _id: safeObjectId(id) }, { $set: { status: !flag.status } });
        return result.modifiedCount > 0;
      }
      return false;
    } catch (e) { return false; }
  }
  const data = initLocalDb();
  const idx = data.flags.findIndex(f => f.id === id);
  if (idx >= 0) {
    data.flags[idx].status = !data.flags[idx].status;
    writeLocalDb(data);
    return true;
  }
  return false;
}

export async function createFeatureFlag(flag: Omit<FeatureFlag, 'id' | '_id' | 'createdAt'>): Promise<FeatureFlag> {
  const { db } = await connectDb();
  const newFlag = { ...flag, createdAt: new Date() };
  if (db) {
    try {
      const result = await db.collection('flags').insertOne(newFlag);
      return { id: result.insertedId.toString(), ...newFlag };
    } catch (e) {}
  }
  const data = initLocalDb();
  const id = 'ff_' + randomUUID().slice(0, 8);
  const localFlag: FeatureFlag = { id, ...newFlag };
  data.flags.push(localFlag);
  writeLocalDb(data);
  return localFlag;
}

// ---- SUPPORT TICKETS ----
export async function getSupportTickets(): Promise<SupportTicket[]> {
  const { db } = await connectDb();
  if (db) {
    try {
      const tickets = await db.collection('tickets').find({}).sort({ createdAt: -1 }).toArray();
      return tickets.map(t => ({
        id: t._id.toString(),
        subject: t.subject,
        tenantId: t.tenantId,
        status: t.status,
        priority: t.priority,
        createdAt: t.createdAt,
        name: t.name,
        email: t.email,
        message: t.message,
        category: t.category,
      }));
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.tickets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function createSupportTicket(ticket: Omit<SupportTicket, 'id' | '_id' | 'createdAt'>): Promise<SupportTicket> {
  const { db } = await connectDb();
  const newTicket = { ...ticket, createdAt: new Date() };
  if (db) {
    try {
      const result = await db.collection('tickets').insertOne(newTicket);
      return { id: result.insertedId.toString(), ...newTicket };
    } catch (e) {}
  }
  const data = initLocalDb();
  const id = 'T-' + randomUUID().slice(0, 8);
  const localTicket: SupportTicket = { id, ...newTicket };
  data.tickets.push(localTicket);
  writeLocalDb(data);
  return localTicket;
}

export async function resolveSupportTicket(id: string): Promise<boolean> {
  const { db } = await connectDb();
  if (db) {
    try {
      const result = await db.collection('tickets').updateOne(
        { _id: safeObjectId(id) },
        { $set: { status: 'RESOLVED' } }
      );
      return result.modifiedCount > 0;
    } catch (e) {}
  }
  const data = initLocalDb();
  const ticket = data.tickets.find(t => t.id === id);
  if (ticket) {
    ticket.status = 'RESOLVED';
    writeLocalDb(data);
    return true;
  }
  return false;
}

// ---- BROADCASTS ----
export async function getBroadcasts(): Promise<Broadcast[]> {
  const { db } = await connectDb();
  if (db) {
    try {
      const broadcasts = await db.collection('broadcasts').find({}).sort({ createdAt: -1 }).toArray();
      return broadcasts.map(b => ({
        id: b._id.toString(),
        type: b.type,
        message: b.message,
        target: b.target,
        createdAt: b.createdAt,
      }));
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.broadcasts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function createBroadcast(broadcast: Omit<Broadcast, 'id' | '_id' | 'createdAt'>): Promise<Broadcast> {
  const { db } = await connectDb();
  const newBroadcast = { ...broadcast, createdAt: new Date() };
  if (db) {
    try {
      const result = await db.collection('broadcasts').insertOne(newBroadcast);
      return { id: result.insertedId.toString(), ...newBroadcast };
    } catch (e) {}
  }
  const data = initLocalDb();
  const id = 'b_' + randomUUID().slice(0, 8);
  const localBroadcast: Broadcast = { id, ...newBroadcast };
  data.broadcasts.push(localBroadcast);
  writeLocalDb(data);
  return localBroadcast;
}

// ---- NEWSLETTER SUBSCRIBERS ----
export async function getNewsletterSubscribers(): Promise<NewsletterSubscriber[]> {
  const { db } = await connectDb();
  if (db) {
    try {
      const subs = await db.collection('subscribers').find({}).sort({ createdAt: -1 }).toArray();
      return subs.map(s => ({
        id: s._id.toString(),
        email: s.email,
        createdAt: s.createdAt,
      }));
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.subscribers.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function createNewsletterSubscriber(email: string): Promise<NewsletterSubscriber> {
  const { db } = await connectDb();
  const newSub = { email, createdAt: new Date() };
  if (db) {
    try {
      const existing = await db.collection('subscribers').findOne({ email });
      if (existing) {
        return { id: existing._id.toString(), email: existing.email, createdAt: existing.createdAt };
      }
      const result = await db.collection('subscribers').insertOne(newSub);
      return { id: result.insertedId.toString(), ...newSub };
    } catch (e) {}
  }
  const data = initLocalDb();
  const existingLocal = data.subscribers.find(s => s.email.toLowerCase() === email.toLowerCase());
  if (existingLocal) {
    return existingLocal;
  }
  const id = 'sub_' + randomUUID().slice(0, 8);
  const localSub: NewsletterSubscriber = { id, ...newSub };
  data.subscribers.push(localSub);
  writeLocalDb(data);
  return localSub;
}

// ---- SYSTEM INCIDENTS ----
export async function getSystemIncidents(): Promise<SystemIncident[]> {
  const { db } = await connectDb();
  if (db) {
    try {
      const incidents = await db.collection('incidents').find({}).sort({ createdAt: -1 }).toArray();
      return incidents.map(i => ({
        id: i._id.toString(),
        title: i.title,
        description: i.description,
        status: i.status,
        severity: i.severity,
        createdAt: i.createdAt,
        resolvedAt: i.resolvedAt
      }));
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.incidents.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function createSystemIncident(incident: Omit<SystemIncident, 'id' | '_id' | 'createdAt'>): Promise<SystemIncident> {
  const { db } = await connectDb();
  const newIncident = { ...incident, createdAt: new Date() };
  if (db) {
    try {
      const result = await db.collection('incidents').insertOne(newIncident);
      return { id: result.insertedId.toString(), ...newIncident };
    } catch (e) {}
  }
  const data = initLocalDb();
  const id = 'inc_' + randomUUID().slice(0, 8);
  const localIncident: SystemIncident = { id, ...newIncident };
  data.incidents.push(localIncident);
  writeLocalDb(data);
  return localIncident;
}

// ---- SYSTEM MAINTENANCES ----
export async function getSystemMaintenances(): Promise<SystemMaintenance[]> {
  const { db } = await connectDb();
  if (db) {
    try {
      const maintenances = await db.collection('maintenances').find({}).sort({ scheduledFor: -1 }).toArray();
      return listMaintenancesMapping(maintenances);
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.maintenances.sort((a, b) => new Date(b.scheduledFor).getTime() - new Date(a.scheduledFor).getTime());
}

function listMaintenancesMapping(maintenances: Record<string, unknown>[]): SystemMaintenance[] {
  return maintenances.map(m => ({
    id: m._id ? String(m._id) : String(m.id || ''),
    title: String(m.title || ''),
    description: String(m.description || ''),
    scheduledFor: m.scheduledFor as Date,
    durationMinutes: Number(m.durationMinutes),
    status: m.status as SystemMaintenance['status'],
    createdAt: m.createdAt as Date
  }));
}

export async function createSystemMaintenance(maint: Omit<SystemMaintenance, 'id' | '_id' | 'createdAt'>): Promise<SystemMaintenance> {
  const { db } = await connectDb();
  const newMaint = { ...maint, createdAt: new Date() };
  if (db) {
    try {
      const result = await db.collection('maintenances').insertOne(newMaint);
      return { id: result.insertedId.toString(), ...newMaint };
    } catch (e) {}
  }
  const data = initLocalDb();
  const id = 'maint_' + randomUUID().slice(0, 8);
  const localMaint: SystemMaintenance = { id, ...newMaint };
  data.maintenances.push(localMaint);
  writeLocalDb(data);
  return localMaint;
}

// ---- MODULE 15: ALERT RULES (spec §4) ----

function mapAlertRuleDoc(r: Record<string, unknown>): AlertRule {
  return {
    id: (r._id as ObjectId).toString(),
    tenantId: r.tenantId as string,
    type: r.type as AlertRuleType,
    enabled: (r.enabled as boolean | undefined) ?? true,
    configuration: (r.configuration as AlertRule['configuration'] | undefined) ?? {},
    createdAt: r.createdAt as Date,
    updatedAt: r.updatedAt as Date,
  };
}

/** All of the tenant's rules — the evaluator and the rules screen. */
export async function getAlertRules(tenantId: string): Promise<AlertRule[]> {
  const { db } = await connectDb();
  if (db) {
    try {
      const rules = await db.collection('alert_rules')
        .find({ tenantId })
        .sort({ type: 1 })
        .toArray();
      return rules.map(mapAlertRuleDoc);
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.alertRules
    .filter(r => r.tenantId === tenantId)
    .sort((a, b) => a.type.localeCompare(b.type));
}

/** A missing rule and another tenant's rule are IDENTICAL here (null). */
export async function getAlertRuleById(id: string, tenantId: string): Promise<AlertRule | null> {
  const { db } = await connectDb();
  if (db) {
    try {
      const rule = await db.collection('alert_rules').findOne({ _id: safeObjectId(id), tenantId });
      return rule ? mapAlertRuleDoc(rule as unknown as Record<string, unknown>) : null;
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.alertRules.find(r => r.id === id && r.tenantId === tenantId) ?? null;
}

export interface AlertRuleDbCreateInput {
  type: AlertRuleType;
  enabled: boolean;
  configuration: AlertRule['configuration'];
}

/**
 * §4 — one row per (tenant, ruleType), enforced by the unique index. A
 * duplicate key (11000) is a REAL rejection — two concurrent lazy seeds
 * raced and the other request won — so it is rethrown, never fallen back
 * to local JSON (the Module 5/12 lesson).
 */
export async function createAlertRule(
  tenantId: string,
  input: AlertRuleDbCreateInput
): Promise<AlertRule> {
  const { db } = await connectDb();
  const now = new Date();
  const newRule: Record<string, unknown> = {
    tenantId,
    type: input.type,
    enabled: input.enabled,
    configuration: input.configuration,
    createdAt: now,
    updatedAt: now,
  };
  if (db) {
    try {
      const result = await db.collection('alert_rules').insertOne(newRule);
      return mapAlertRuleDoc({ ...newRule, _id: result.insertedId });
    } catch (e) {
      if ((e as { code?: number }).code === 11000) throw e;
    }
  }
  const data = initLocalDb();
  if (data.alertRules.some(r => r.tenantId === tenantId && r.type === input.type)) {
    // Local mirror of the unique index: seeding raced, the other write won.
    throw new Error(`duplicate key: alert rule ${input.type} already exists`);
  }
  const id = randomUUID();
  const localRule: AlertRule = { id, tenantId, ...input, createdAt: now, updatedAt: now };
  data.alertRules.push(localRule);
  writeLocalDb(data);
  return localRule;
}

/**
 * Partial update (enable/disable + configuration; type is immutable — the
 * rule catalog is the definition). matchedCount = existence (Module 5
 * lesson). Mongo $set rejects undefined — stripped.
 */
export async function updateAlertRule(
  id: string,
  tenantId: string,
  updates: Partial<Pick<AlertRule, 'enabled' | 'configuration'>>
): Promise<boolean> {
  const { db } = await connectDb();
  const defined = Object.fromEntries(
    Object.entries(updates).filter(([, v]) => v !== undefined)
  );
  const stamped: Record<string, unknown> = { ...defined, updatedAt: new Date() };
  if (db) {
    try {
      const result = await db.collection('alert_rules')
        .updateOne({ _id: safeObjectId(id), tenantId }, { $set: stamped });
      return result.matchedCount > 0;
    } catch (e) {}
  }
  const data = initLocalDb();
  const idx = data.alertRules.findIndex(r => r.id === id && r.tenantId === tenantId);
  if (idx >= 0) {
    data.alertRules[idx] = { ...data.alertRules[idx], ...stamped } as AlertRule;
    writeLocalDb(data);
    return true;
  }
  return false;
}

// ---- MODULE 15: AGENCY ALERTS (spec §5/§6/§19/§22) ----

function mapAgencyAlertDoc(a: Record<string, unknown>): AgencyAlertRecord {
  return {
    id: (a._id as ObjectId).toString(),
    tenantId: a.tenantId as string,
    ruleType: a.ruleType as AlertRuleType,
    severity: (a.severity as AlertSeverity | undefined) ?? 'INFO',
    title: (a.title as string | undefined) ?? '',
    message: (a.message as string | undefined) ?? '',
    entityType: a.entityType as AgencyAlertRecord['entityType'],
    entityId: a.entityId as string,
    ...(a.entityLabel !== undefined && a.entityLabel !== null && { entityLabel: a.entityLabel as string }),
    ...(a.clientId !== undefined && a.clientId !== null && { clientId: a.clientId as string }),
    ...(a.projectId !== undefined && a.projectId !== null && { projectId: a.projectId as string }),
    ...(a.invoiceId !== undefined && a.invoiceId !== null && { invoiceId: a.invoiceId as string }),
    status: (a.status as AlertStatus | undefined) ?? 'OPEN',
    ...(a.value !== undefined && a.value !== null && { value: a.value as number }),
    ...(a.threshold !== undefined && a.threshold !== null && { threshold: a.threshold as number }),
    ...(a.metadata !== undefined && a.metadata !== null && { metadata: a.metadata as Record<string, unknown> }),
    fingerprint: a.fingerprint as string,
    triggeredAt: a.triggeredAt as Date,
    ...(a.acknowledgedAt !== undefined && a.acknowledgedAt !== null && { acknowledgedAt: a.acknowledgedAt as Date }),
    ...(a.acknowledgedBy !== undefined && a.acknowledgedBy !== null && { acknowledgedBy: a.acknowledgedBy as string }),
    ...(a.resolvedAt !== undefined && a.resolvedAt !== null && { resolvedAt: a.resolvedAt as Date }),
    ...(a.resolvedBy !== undefined && a.resolvedBy !== null && { resolvedBy: a.resolvedBy as string }),
  };
}

export interface AgencyAlertListFilters {
  status?: AlertStatus;
  severity?: AlertSeverity;
  ruleType?: AlertRuleType;
  /** Default 200 — the Alert Center page; the evaluator passes none (all rows). */
  limit?: number;
}

/**
 * §22 — the tenant's alerts, newest first. The evaluator calls this WITHOUT
 * filters to get every stored record (RESOLVED included — the REOPEN and
 * AUTO_RESOLVE decisions need them); the API layers status/severity/ruleType
 * filters for the Alert Center.
 */
export async function listAgencyAlerts(
  tenantId: string,
  filters: AgencyAlertListFilters = {}
): Promise<AgencyAlertRecord[]> {
  const { db } = await connectDb();
  const limit = filters.limit ?? 200;
  if (db) {
    try {
      const query: Record<string, unknown> = {
        tenantId,
        ...(filters.status !== undefined && { status: filters.status }),
        ...(filters.severity !== undefined && { severity: filters.severity }),
        ...(filters.ruleType !== undefined && { ruleType: filters.ruleType }),
      };
      const alerts = await db.collection('agency_alerts')
        .find(query)
        .sort({ triggeredAt: -1 })
        .limit(limit)
        .toArray();
      return alerts.map(mapAgencyAlertDoc);
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.agencyAlerts
    .filter(a =>
      a.tenantId === tenantId
      && (filters.status === undefined || a.status === filters.status)
      && (filters.severity === undefined || a.severity === filters.severity)
      && (filters.ruleType === undefined || a.ruleType === filters.ruleType)
    )
    .sort((a, b) => new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime())
    .slice(0, limit);
}

/** §22 — single-record reads for acknowledge/resolve. Missing + other
 *  tenant's alert are IDENTICAL here (null). */
export async function getAgencyAlertById(id: string, tenantId: string): Promise<AgencyAlertRecord | null> {
  const { db } = await connectDb();
  if (db) {
    try {
      const alert = await db.collection('agency_alerts').findOne({ _id: safeObjectId(id), tenantId });
      return alert ? mapAgencyAlertDoc(alert as unknown as Record<string, unknown>) : null;
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.agencyAlerts.find(a => a.id === id && a.tenantId === tenantId) ?? null;
}

/**
 * §6 — first detection. Backed by the unique {tenantId, fingerprint}
 * index: a duplicate key (11000) is a REAL rejection — two concurrent
 * evaluations raced and the other write won — so it is rethrown for the
 * evaluator to catch and skip (never a silent local-fallback duplicate).
 */
export async function createAgencyAlert(
  tenantId: string,
  input: AgencyAlertRecordCreateInput
): Promise<AgencyAlertRecord> {
  const { db } = await connectDb();
  const newAlert: Record<string, unknown> = { ...input, tenantId };
  if (db) {
    try {
      const result = await db.collection('agency_alerts').insertOne(newAlert);
      return mapAgencyAlertDoc({ ...newAlert, _id: result.insertedId });
    } catch (e) {
      if ((e as { code?: number }).code === 11000) throw e;
    }
  }
  const data = initLocalDb();
  if (data.agencyAlerts.some(a => a.tenantId === tenantId && a.fingerprint === input.fingerprint)) {
    // Local mirror of the unique fingerprint index.
    throw new Error(`duplicate key: alert fingerprint ${input.fingerprint} already exists`);
  }
  const id = randomUUID();
  const localAlert: AgencyAlertRecord = { id, ...input } as AgencyAlertRecord;
  data.agencyAlerts.push(localAlert);
  writeLocalDb(data);
  return localAlert;
}

/**
 * §19/§20 — the evaluator's UPDATE/AUTO_RESOLVE/REOPEN write and the
 * service's manual acknowledge/resolve transition. Semantics: a key whose
 * value is EXPLICITLY undefined is CLEARED ($unset in Mongo, delete in the
 * local JSON) — REOPEN uses this to clear acknowledgedAt/By and resolvedAt/
 * By. matchedCount = existence (Module 5 lesson).
 */
export type AgencyAlertRecordChanges = Partial<Pick<AgencyAlertRecord,
  | 'status' | 'severity' | 'title' | 'message' | 'entityLabel' | 'clientId' | 'projectId' | 'invoiceId'
  | 'value' | 'threshold' | 'metadata' | 'triggeredAt'
  | 'acknowledgedAt' | 'acknowledgedBy' | 'resolvedAt' | 'resolvedBy'
>>;

export async function updateAgencyAlert(
  id: string,
  tenantId: string,
  changes: AgencyAlertRecordChanges
): Promise<boolean> {
  const { db } = await connectDb();
  const setDoc: Record<string, unknown> = {};
  const unsetKeys: string[] = [];
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) unsetKeys.push(key);
    else setDoc[key] = value;
  }
  if (db) {
    try {
      const update: Record<string, unknown> = { $set: setDoc };
      if (unsetKeys.length > 0) {
        update.$unset = Object.fromEntries(unsetKeys.map(key => [key, '']));
      }
      const result = await db.collection('agency_alerts')
        .updateOne({ _id: safeObjectId(id), tenantId }, update);
      return result.matchedCount > 0;
    } catch (e) {}
  }
  const data = initLocalDb();
  const idx = data.agencyAlerts.findIndex(a => a.id === id && a.tenantId === tenantId);
  if (idx >= 0) {
    const merged = { ...data.agencyAlerts[idx], ...setDoc } as Record<string, unknown>;
    for (const key of unsetKeys) delete merged[key];
    data.agencyAlerts[idx] = merged as unknown as AgencyAlertRecord;
    writeLocalDb(data);
    return true;
  }
  return false;
}

/** The evaluator's payload-refresh write (§20) — thin wrapper for clarity. */
export async function applyAgencyAlertFieldUpdate(
  id: string,
  tenantId: string,
  changes: AgencyAlertRecordUpdate
): Promise<boolean> {
  return updateAgencyAlert(id, tenantId, changes);
}
