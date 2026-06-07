const fs = require('fs');
let code = fs.readFileSync('src/lib/db.ts', 'utf8');

const additions = `
export async function updateAccount(id: string, tenantId: string, updates: Partial<Account>): Promise<boolean> {
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

export async function updateClient(id: string, tenantId: string, updates: any): Promise<boolean> {
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
`;

if (!code.includes('export async function updateAccount')) {
  fs.writeFileSync('src/lib/db.ts', code + '\n' + additions);
  console.log('Appended to db.ts');
} else {
  console.log('Already appended');
}
