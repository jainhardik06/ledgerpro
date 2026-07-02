/**
 * Growth Database connection (Astro server runtime).
 *
 * Used only by on-demand routes (e.g. the affiliate redirect handler). All
 * content pages are static and never touch the database at build or request
 * time. The Growth DB is fully isolated from the production SaaS cluster.
 *
 * The client is cached across warm serverless invocations to avoid exhausting
 * the Atlas Free connection pool.
 */
import { MongoClient, type Db } from 'mongodb';

const URI =
  process.env.MONGODB_GROWTH_URI ??
  import.meta.env.MONGODB_GROWTH_URI ??
  '';

// Reuse the client across hot invocations of the same lambda.
let cached: { client: MongoClient; db: Db } | null =
  (globalThis as any).__growthDb ?? null;

export async function getGrowthDb(): Promise<Db> {
  if (!URI) {
    throw new Error(
      'MONGODB_GROWTH_URI is not set. Add it to .env.local (local) or the Vercel project env (production).'
    );
  }
  if (cached) return cached.db;

  const client = new MongoClient(URI, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 5000,
  });
  await client.connect();
  const db = client.db(); // database name is taken from the connection string

  cached = { client, db };
  (globalThis as any).__growthDb = cached;
  return db;
}
