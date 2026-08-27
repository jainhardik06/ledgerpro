import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface OfflineRequest {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  timestamp: number;
}

interface LedgerProDB extends DBSchema {
  'offline-queue': {
    key: string;
    value: OfflineRequest;
    indexes: { 'by-timestamp': number };
  };
}

let dbPromise: Promise<IDBPDatabase<LedgerProDB>> | null = null;

export function getDB() {
  if (typeof window === 'undefined') return null;
  
  if (!dbPromise) {
    dbPromise = openDB<LedgerProDB>('ledgerpro-db', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('offline-queue')) {
          const store = db.createObjectStore('offline-queue', { keyPath: 'id' });
          store.createIndex('by-timestamp', 'timestamp');
        }
      },
    });
  }
  return dbPromise;
}

export async function addOfflineRequest(request: Omit<OfflineRequest, 'id' | 'timestamp'>) {
  const db = await getDB();
  if (!db) return;

  const offlineReq: OfflineRequest = {
    ...request,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
  };

  await db.add('offline-queue', offlineReq);
  return offlineReq;
}

export async function getOfflineRequests() {
  const db = await getDB();
  if (!db) return [];

  return db.getAllFromIndex('offline-queue', 'by-timestamp');
}

export async function removeOfflineRequest(id: string) {
  const db = await getDB();
  if (!db) return;

  await db.delete('offline-queue', id);
}
