import { MongoClient, ObjectId } from 'mongodb';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

export interface Tenant {
  id?: string;
  _id?: any;
  name: string;
  createdAt: Date;
}

export interface User {
  id?: string;
  _id?: any;
  username: string;
  passwordHash: string;
  role: 'TENANT_ADMIN' | 'USER';
  tenantId: string;
  createdAt: Date;
}

export interface Transaction {
  id?: string;
  _id?: any;
  tenantId: string;
  userId: string;
  type: 'Credit' | 'Debit';
  description: string;
  amount: number;
  date: string; // YYYY-MM-DD
  category?: string;
  createdAt: Date;
}

export interface Category {
  id?: string;
  _id?: any;
  tenantId: string;
  userId: string;
  name: string;
  createdAt: Date;
}

export interface SystemLog {
  id?: string;
  _id?: any;
  tenantId?: string; // Optional for super admin system logs
  username: string;
  action: string;
  details: string;
  timestamp: Date;
}

const MONGODB_URI = process.env.MONGODB_URI;

let mongoClient: MongoClient | null = null;
let useLocalDb = false;

const DATA_DIR = path.join(process.cwd(), 'src', 'data');
const DB_FILE = path.join(DATA_DIR, 'local_db.json');

interface LocalDbSchema {
  tenants: Tenant[];
  users: User[];
  transactions: Transaction[];
  categories: Category[];
  logs: SystemLog[];
}

function initLocalDb(): LocalDbSchema {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const defaultData: LocalDbSchema = { tenants: [], users: [], transactions: [], categories: [], logs: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2), 'utf-8');
    return defaultData;
  }
  try {
    const content = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(content);
    if (!parsed.tenants) parsed.tenants = [];
    if (!parsed.users) parsed.users = [];
    if (!parsed.transactions) parsed.transactions = [];
    if (!parsed.categories) parsed.categories = [];
    if (!parsed.logs) parsed.logs = [];
    return parsed;
  } catch (e) {
    const defaultData: LocalDbSchema = { tenants: [], users: [], transactions: [], categories: [], logs: [] };
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
    console.warn('[Database] MONGODB_URI not set. Using local file-based database at src/data/local_db.json');
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
    console.log('[Database] Connected successfully to MongoDB.');
    return { client: mongoClient, db: mongoClient.db() };
  } catch (error) {
    console.error('[Database] Failed to connect to MongoDB. Falling back to local file database.', error);
    mongoClient = null;
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
        createdAt: t.createdAt,
      }));
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.tenants;
}

export async function createTenant(name: string): Promise<Tenant> {
  const { db } = await connectDb();
  const newTenant = { name, createdAt: new Date() };
  if (db) {
    try {
      const result = await db.collection('tenants').insertOne(newTenant);
      return { id: result.insertedId.toString(), ...newTenant };
    } catch (e) {}
  }
  const data = initLocalDb();
  const id = Math.random().toString(36).substring(2, 11);
  const localTenant: Tenant = { id, ...newTenant };
  data.tenants.push(localTenant);
  writeLocalDb(data);
  return localTenant;
}

// ---- USERS ----

export async function getUserByUsername(username: string): Promise<User | null> {
  const { db } = await connectDb();
  if (db) {
    try {
      const user = await db.collection('users').findOne({ username });
      if (user) {
        return {
          id: user._id.toString(),
          username: user.username,
          passwordHash: user.passwordHash,
          role: user.role,
          tenantId: user.tenantId,
          createdAt: user.createdAt,
        };
      }
      return null;
    } catch (e) {}
  }
  const data = initLocalDb();
  const user = data.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  return user || null;
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
        createdAt: u.createdAt,
      }));
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.users.filter(u => u.tenantId === tenantId);
}

export async function createUser(username: string, passwordHash: string, role: 'TENANT_ADMIN' | 'USER', tenantId: string): Promise<User> {
  const { db } = await connectDb();
  const newUser = { username, passwordHash, role, tenantId, createdAt: new Date() };
  if (db) {
    try {
      const result = await db.collection('users').insertOne(newUser);
      return { id: result.insertedId.toString(), ...newUser };
    } catch (e) {}
  }
  const data = initLocalDb();
  const id = Math.random().toString(36).substring(2, 11);
  const localUser: User = { id, ...newUser };
  data.users.push(localUser);
  writeLocalDb(data);
  return localUser;
}

// ---- TRANSACTIONS ----

export async function getTransactions(tenantId: string): Promise<Transaction[]> {
  const { db } = await connectDb();
  if (db) {
    try {
      const txs = await db.collection('transactions').find({ tenantId }).sort({ date: -1, createdAt: -1 }).toArray();
      return txs.map(t => ({
        id: t._id.toString(),
        tenantId: t.tenantId,
        userId: t.userId,
        type: t.type as 'Credit' | 'Debit',
        description: t.description,
        amount: Number(t.amount),
        date: t.date,
        category: t.category,
        createdAt: t.createdAt,
      }));
    } catch (e) {}
  }
  const data = initLocalDb();
  return data.transactions.filter(t => t.tenantId === tenantId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
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
  const id = Math.random().toString(36).substring(2, 11);
  const localTx: Transaction = { id, ...newTx };
  data.transactions.push(localTx);
  writeLocalDb(data);
  return localTx;
}

export async function updateTransaction(id: string, tenantId: string, tx: Partial<Omit<Transaction, 'id' | '_id' | 'tenantId' | 'userId' | 'createdAt'>>): Promise<boolean> {
  const { db } = await connectDb();
  const updateFields: any = {};
  if (tx.type) updateFields.type = tx.type;
  if (tx.description) updateFields.description = tx.description;
  if (tx.amount !== undefined) updateFields.amount = Number(tx.amount);
  if (tx.date) updateFields.date = tx.date;
  if (tx.category !== undefined) updateFields.category = tx.category;

  if (db) {
    try {
      const result = await db.collection('transactions').updateOne(
        { _id: new ObjectId(id), tenantId },
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
      const result = await db.collection('transactions').deleteOne({ _id: new ObjectId(id), tenantId });
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
  const id = Math.random().toString(36).substring(2, 11);
  const localCat: Category = { id, ...newCat };
  data.categories.push(localCat);
  writeLocalDb(data);
  return localCat;
}

export async function deleteCategory(id: string, tenantId: string): Promise<boolean> {
  const { db } = await connectDb();
  if (db) {
    try {
      const result = await db.collection('categories').deleteOne({ _id: new ObjectId(id), tenantId });
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

export async function createLog(username: string, action: string, details: string, tenantId?: string): Promise<SystemLog> {
  const { db } = await connectDb();
  const newLog = { username, action, details, tenantId, timestamp: new Date() };
  if (db) {
    try {
      const result = await db.collection('logs').insertOne(newLog);
      return { id: result.insertedId.toString(), ...newLog };
    } catch (e) {}
  }
  const data = initLocalDb();
  const id = Math.random().toString(36).substring(2, 11);
  const localLog: SystemLog = { id, ...newLog };
  data.logs.push(localLog);
  writeLocalDb(data);
  return localLog;
}

export async function getLogs(tenantId?: string): Promise<SystemLog[]> {
  const { db } = await connectDb();
  if (db) {
    try {
      const query = tenantId ? { tenantId } : {};
      const logs = await db.collection('logs').find(query).sort({ timestamp: -1 }).toArray();
      return logs.map(l => ({
        id: l._id.toString(),
        tenantId: l.tenantId,
        username: l.username,
        action: l.action,
        details: l.details,
        timestamp: l.timestamp,
      }));
    } catch (e) {}
  }
  const data = initLocalDb();
  let logs = data.logs;
  if (tenantId) {
    logs = logs.filter(l => l.tenantId === tenantId);
  }
  return [...logs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}
