import { connectDb } from './db';
import { Filter, Document, OptionalUnlessRequiredId } from 'mongodb';

/**
 * Data Access Layer (DAL) that enforces Row-Level Security (RLS) conceptually for MongoDB.
 * It ensures that all database operations are scoped to a specific tenant.
 */
export class TenantDAL {
  constructor(private tenantId: string) {
    if (!tenantId) {
      throw new Error('TenantDAL requires a valid tenantId to enforce data isolation.');
    }
  }

  /**
   * Enforces the tenantId on any given query filter.
   */
  private enforceTenant<T extends Document>(filter: Filter<T>): Filter<T> {
    return { ...filter, tenantId: this.tenantId } as Filter<T>;
  }

  async find<T extends Document>(collectionName: string, filter: Filter<T> = {}, options = {}) {
    const { db } = await connectDb();
    if (!db) throw new Error('Database connection failed');
    const safeFilter = this.enforceTenant(filter);
    return db.collection<T>(collectionName).find(safeFilter, options).toArray();
  }

  async findOne<T extends Document>(collectionName: string, filter: Filter<T> = {}, options = {}) {
    const { db } = await connectDb();
    if (!db) throw new Error('Database connection failed');
    const safeFilter = this.enforceTenant(filter);
    return db.collection<T>(collectionName).findOne(safeFilter, options);
  }

  async insertOne<T extends Document>(collectionName: string, doc: Omit<T, 'tenantId'>) {
    const { db } = await connectDb();
    if (!db) throw new Error('Database connection failed');
    // Force the tenantId on the document and cast to the correct MongoDB type
    const safeDoc = { ...doc, tenantId: this.tenantId } as unknown as OptionalUnlessRequiredId<T>;
    return db.collection<T>(collectionName).insertOne(safeDoc);
  }

  async updateOne<T extends Document>(collectionName: string, filter: Filter<T>, update: any, options = {}) {
    const { db } = await connectDb();
    if (!db) throw new Error('Database connection failed');
    const safeFilter = this.enforceTenant(filter);
    return db.collection<T>(collectionName).updateOne(safeFilter, update, options);
  }

  async deleteOne<T extends Document>(collectionName: string, filter: Filter<T>) {
    const { db } = await connectDb();
    if (!db) throw new Error('Database connection failed');
    const safeFilter = this.enforceTenant(filter);
    return db.collection<T>(collectionName).deleteOne(safeFilter);
  }

  async deleteMany<T extends Document>(collectionName: string, filter: Filter<T>) {
    const { db } = await connectDb();
    if (!db) throw new Error('Database connection failed');
    const safeFilter = this.enforceTenant(filter);
    return db.collection<T>(collectionName).deleteMany(safeFilter);
  }
}
