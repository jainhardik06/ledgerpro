import { MongoClient, ObjectId } from 'mongodb';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

export interface User {
  id?: string;
  _id?: any;
  username: string;
  passwordHash: string;
  createdAt: Date;
}

export interface Transaction {
  id?: string;
  _id?: any;
  userId: string;
  type: 'Credit' | 'Debit';
  description: string;
  amount: number;
  date: string; // YYYY-MM-DD
  createdAt: Date;
}

const MONGODB_URI = process.env.MONGODB_URI;

let mongoClient: MongoClient | null = null;
let useLocalDb = false;

const DATA_DIR = path.join(process.cwd(), 'src', 'data');
const DB_FILE = path.join(DATA_DIR, 'local_db.json');

interface LocalDbSchema {
  users: User[];
  transactions: Transaction[];
}

function initLocalDb(): LocalDbSchema {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const defaultData: LocalDbSchema = { users: [], transactions: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2), 'utf-8');
    return defaultData;
  }
  try {
    const content = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    const defaultData: LocalDbSchema = { users: [], transactions: [] };
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
          createdAt: user.createdAt,
        };
      }
      return null;
    } catch (e) {
      console.error('[Database Error] Falling back to local db for getUserByUsername', e);
    }
  }

  const data = initLocalDb();
  const user = data.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  return user || null;
}

export async function getUserById(id: string): Promise<User | null> {
  const { db } = await connectDb();
  if (db) {
    try {
      const user = await db.collection('users').findOne({ _id: new ObjectId(id) });
      if (user) {
        return {
          id: user._id.toString(),
          username: user.username,
          passwordHash: user.passwordHash,
          createdAt: user.createdAt,
        };
      }
      return null;
    } catch (e) {
      console.error('[Database Error] Falling back to local db for getUserById', e);
    }
  }

  const data = initLocalDb();
  const user = data.users.find(u => u.id === id);
  return user || null;
}

export async function createUser(username: string, passwordHash: string): Promise<User> {
  const { db } = await connectDb();
  const newUser = {
    username,
    passwordHash,
    createdAt: new Date(),
  };

  if (db) {
    try {
      const result = await db.collection('users').insertOne(newUser);
      return {
        id: result.insertedId.toString(),
        ...newUser,
      };
    } catch (e) {
      console.error('[Database Error] Falling back to local db for createUser', e);
    }
  }

  const data = initLocalDb();
  const id = Math.random().toString(36).substring(2, 11);
  const localUser: User = {
    id,
    ...newUser,
  };
  data.users.push(localUser);
  writeLocalDb(data);
  return localUser;
}

export async function getTransactions(userId: string): Promise<Transaction[]> {
  const { db } = await connectDb();
  if (db) {
    try {
      const txs = await db.collection('transactions').find({}).toArray();
      return txs.map(t => ({
        id: t._id.toString(),
        userId: t.userId,
        type: t.type as 'Credit' | 'Debit',
        description: t.description,
        amount: Number(t.amount),
        date: t.date,
        createdAt: t.createdAt,
      }));
    } catch (e) {
      // Silenced error
    }
  }

  const data = initLocalDb();
  return data.transactions;
}

export async function createTransaction(tx: Omit<Transaction, 'createdAt'>): Promise<Transaction> {
  const { db } = await connectDb();
  const newTx = {
    userId: tx.userId,
    type: tx.type,
    description: tx.description,
    amount: Number(tx.amount),
    date: tx.date,
    createdAt: new Date(),
  };

  if (db) {
    try {
      const result = await db.collection('transactions').insertOne(newTx);
      return {
        id: result.insertedId.toString(),
        ...newTx,
      };
    } catch (e) {
      // Silenced error
    }
  }

  const data = initLocalDb();
  const id = Math.random().toString(36).substring(2, 11);
  const localTx: Transaction = {
    id,
    ...newTx,
  };
  data.transactions.push(localTx);
  writeLocalDb(data);
  return localTx;
}

export async function updateTransaction(id: string, userId: string, tx: Partial<Omit<Transaction, 'id' | '_id' | 'userId' | 'createdAt'>>): Promise<boolean> {
  const { db } = await connectDb();
  const updateFields: any = {};
  if (tx.type) updateFields.type = tx.type;
  if (tx.description) updateFields.description = tx.description;
  if (tx.amount !== undefined) updateFields.amount = Number(tx.amount);
  if (tx.date) updateFields.date = tx.date;

  if (db) {
    try {
      const result = await db.collection('transactions').updateOne(
        { _id: new ObjectId(id) },
        { $set: updateFields }
      );
      return result.modifiedCount > 0;
    } catch (e) {
      // Silenced error
    }
  }

  const data = initLocalDb();
  const idx = data.transactions.findIndex(t => t.id === id);
  if (idx >= 0) {
    data.transactions[idx] = {
      ...data.transactions[idx],
      ...updateFields,
    };
    writeLocalDb(data);
    return true;
  }
  return false;
}

export async function deleteTransaction(id: string, userId: string): Promise<boolean> {
  const { db } = await connectDb();
  if (db) {
    try {
      const result = await db.collection('transactions').deleteOne({
        _id: new ObjectId(id),
      });
      return result.deletedCount > 0;
    } catch (e) {
      // Silenced error
    }
  }

  const data = initLocalDb();
  const len = data.transactions.length;
  data.transactions = data.transactions.filter(t => t.id !== id);
  if (data.transactions.length < len) {
    writeLocalDb(data);
    return true;
  }
  return false;
}

// Automatically seed default users on import/initial connection
export async function seedDefaultUser() {
  try {
    // 1. Seed default user 'hardik'
    const defaultUsername = 'hardik';
    const defaultPassword = 'password';
    const existing = await getUserByUsername(defaultUsername);
    if (!existing) {
      const hash = await bcrypt.hash(defaultPassword, 10);
      await createUser(defaultUsername, hash);
    }

    // 2. Seed administrative user 'admin' matching your database credentials
    const adminUsername = 'admin';
    const adminPassword = 'VmnaDox4dgFySezQ';
    const existingAdmin = await getUserByUsername(adminUsername);
    if (!existingAdmin) {
      const hash = await bcrypt.hash(adminPassword, 10);
      await createUser(adminUsername, hash);
    }
  } catch (error) {
    // Silenced error logger
  }
}

// Perform initial seeding
seedDefaultUser();
