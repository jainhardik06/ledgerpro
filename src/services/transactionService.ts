import { TenantDAL } from '@/lib/dal';
import { Transaction } from '@/lib/db';
import { ObjectId } from 'mongodb';

export class TransactionService {
  private dal: TenantDAL;

  constructor(tenantId: string) {
    // Initializing the DAL automatically scopes all subsequent DB operations to this tenantId.
    this.dal = new TenantDAL(tenantId);
  }

  async getTransactions(options: { page?: number; limit?: number }) {
    const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 100);
    const page = Math.max(Number(options.page) || 1, 1);
    const skip = (page - 1) * limit;

    // We don't need to pass tenantId here, it's enforced by the DAL
    return await this.dal.find<Transaction>('transactions', {}, {
      sort: { date: -1, createdAt: -1 },
      limit,
      skip,
    });
  }

  async createTransaction(data: Omit<Transaction, 'tenantId' | 'id' | '_id' | 'createdAt'>) {
    const newTx = {
      ...data,
      createdAt: new Date(),
    };

    // The DAL will automatically inject the tenantId
    const result = await this.dal.insertOne<Transaction>('transactions', newTx);
    
    return {
      _id: result.insertedId,
      ...newTx,
      // Provide a string ID for frontend convenience
      id: result.insertedId.toString(),
    };
  }

  async getTransactionById(id: string) {
    return await this.dal.findOne<Transaction>('transactions', { _id: new ObjectId(id) });
  }

  async deleteTransaction(id: string) {
    return await this.dal.deleteOne<Transaction>('transactions', { _id: new ObjectId(id) });
  }
}
