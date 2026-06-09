import { MongoClient, ObjectId } from 'mongodb';
import { randomUUID } from 'crypto';

export function safeObjectId(id: string): ObjectId {
  try {
    return new ObjectId(id);
  } catch {
    return new ObjectId('000000000000000000000000');
  }
}

export interface ListOptions {
  limit?: number;
  page?: number;
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
  type: 'Credit' | 'Debit';
  description: string;
  amount: number;
  date: string; // YYYY-MM-DD
  category?: string;
  notes?: string;
  createdAt: Date;
}

export interface Client {
  id?: string;
  _id?: ObjectId;
  tenantId: string;
  name: string;
  email?: string;
  createdAt: Date;
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

let mongoClient: MongoClient | null = null;
let useLocalDb = false;

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
      subscribers: [], incidents: initialIncidents, maintenances: initialMaintenances 
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2), 'utf-8');
    return defaultData;
  }
  try {
    const content = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(content);
    if (!parsed.tenants) parsed.tenants = [];
    if (!parsed.users) parsed.users = [];
    if (!parsed.accounts) parsed.accounts = [];
    if (!parsed.transactions) parsed.transactions = [];
    if (!parsed.categories) parsed.categories = [];
    if (!parsed.budgets) parsed.budgets = [];
    if (!parsed.recurring) parsed.recurring = [];
    if (!parsed.clients) parsed.clients = [];
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
      subscribers: [], incidents: initialIncidents, maintenances: initialMaintenances 
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
    if (process.env.NODE_ENV === 'production') {
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
    useLocalDb = true;
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

export async function createTenant(name: string, attribution?: Record<string, string>): Promise<Tenant> {
  const { db } = await connectDb();
  const newTenant = { 
    name, 
    status: 'ACTIVE' as const,
    plan: 'FREE' as const,
    settings: {},
    limits: { maxUsers: 5 },
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
      return result.modifiedCount > 0;
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
  if (db) {
    try {
      const txs = await db.collection('transactions').find({ tenantId }).sort({ date: -1, createdAt: -1 }).skip(skip).limit(limit).toArray();
      return txs.map(t => ({
        id: t._id.toString(),
        tenantId: t.tenantId,
        userId: t.userId,
        username: t.username,
        accountId: t.accountId,
        clientId: t.clientId,
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
    .filter(t => t.tenantId === tenantId)
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

export async function getClients(tenantId: string, options: ListOptions = {}): Promise<Client[]> {
  const { limit, skip } = normalizeListOptions(options);
  const { db } = await connectDb();
  if (db) {
    try {
      const clients = await db.collection('clients').find({ tenantId }).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray();
      return clients.map(c => ({
        id: c._id.toString(),
        tenantId: c.tenantId,
        name: c.name,
        email: c.email,
        createdAt: c.createdAt,
      }));
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.clients
    .filter(c => c.tenantId === tenantId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(skip, skip + limit);
}

export async function createClient(tenantId: string, name: string, email?: string): Promise<Client> {
  const { db } = await connectDb();
  const newClient = { tenantId, name, email, createdAt: new Date() };
  if (db) {
    try {
      const result = await db.collection('clients').insertOne(newClient);
      return { id: result.insertedId.toString(), ...newClient };
    } catch (e) {}
  }
  const data = initLocalDb();
  const id = randomUUID();
  const localClient: Client = { id, ...newClient };
  data.clients.push(localClient);
  writeLocalDb(data);
  return localClient;
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
  if (db) {
    try {
      const result = await db.collection('clients').updateOne({ _id: safeObjectId(id), tenantId }, { $set: updates });
      return result.modifiedCount > 0;
    } catch (e) {}
  }
  const data = initLocalDb();
  const idx = data.clients.findIndex(c => c.id === id && c.tenantId === tenantId);
  if (idx >= 0) {
    data.clients[idx] = { ...data.clients[idx], ...updates };
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
