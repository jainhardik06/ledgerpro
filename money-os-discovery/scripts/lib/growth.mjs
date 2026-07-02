/**
 * Growth DB client for Node automation scripts (seed, topic discovery, content
 * generation). Loads env from .env.local for local runs; in CI the variables
 * come from the environment / GitHub Secrets.
 */
import { MongoClient } from 'mongodb';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

// Local dev convenience; harmless if the file is absent (CI uses real env).
config({ path: path.join(ROOT, '.env.local') });

export const PROJECT_ROOT = ROOT;

export function getUri() {
  const uri = process.env.MONGODB_GROWTH_URI;
  if (!uri) {
    throw new Error('MONGODB_GROWTH_URI is not set (add it to .env.local or CI secrets).');
  }
  return uri;
}

/** Connect and return { client, db }. Caller is responsible for client.close(). */
export async function connect() {
  const client = new MongoClient(getUri(), { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  return { client, db: client.db() };
}
