import { getTransactions, createTransaction, deleteTransaction, Transaction } from '@/lib/db';

export class TransactionService {
  constructor(private tenantId: string) {
    if (!tenantId) {
      throw new Error('TransactionService requires a valid tenantId to enforce data isolation.');
    }
  }

  async getTransactions(options: { page?: number; limit?: number; clientId?: string; paymentId?: string } = {}) {
    return getTransactions(this.tenantId, options);
  }

  async createTransaction(data: Omit<Transaction, 'tenantId' | 'id' | '_id' | 'createdAt'>) {
    return createTransaction({
      tenantId: this.tenantId,
      ...data,
    });
  }

  async deleteTransaction(id: string) {
    return deleteTransaction(id, this.tenantId);
  }
}

