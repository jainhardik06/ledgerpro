/**
 * Multi-provider LLM dispatcher for the content engine.
 *
 * Both Groq and Gemini have generous but real free-tier rate limits. Instead
 * of one API key hitting 429s the automation can't recover from quickly,
 * this maintains a POOL of keys (any mix of Groq and Gemini) and rotates to
 * the next available key the moment one gets rate-limited — usually far
 * faster than waiting out a single key's cooldown window.
 *
 * Env format (comma-separated; either or both may be set):
 *   GROQ_API_KEYS=gsk_aaa,gsk_bbb,gsk_ccc
 *   GEMINI_API_KEYS=AIzaaaa,AIzabbb
 * A single legacy GROQ_API_KEY is still honored for backward compatibility.
 *
 * scripts/lib/rate-limit.mjs's pacing/backoff (the outer retry loop for
 * transient/network errors) is unchanged — this module only changes what
 * happens *within* a single attempt when a 429 specifically occurs: rotate
 * key/provider immediately instead of just waiting.
 */
import * as groq from './providers/groq.mjs';
import * as gemini from './providers/gemini.mjs';

const PROVIDERS = { groq, gemini };

// How long a rate-limited key sits out before being eligible again, if the
// API didn't give us a more precise retry-after.
const DEFAULT_COOLDOWN_MS = 60_000;

function parseKeyList(envVar) {
  return (process.env[envVar] || '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
}

function buildPool() {
  const pool = [];
  const groqKeys = parseKeyList('GROQ_API_KEYS');
  if (groqKeys.length === 0 && process.env.GROQ_API_KEY) groqKeys.push(process.env.GROQ_API_KEY.trim());
  for (const apiKey of groqKeys) {
    pool.push({ provider: 'groq', apiKey, model: process.env.GROQ_MODEL || groq.DEFAULT_MODEL });
  }

  const geminiKeys = parseKeyList('GEMINI_API_KEYS');
  if (geminiKeys.length === 0 && process.env.GEMINI_API_KEY) geminiKeys.push(process.env.GEMINI_API_KEY.trim());
  for (const apiKey of geminiKeys) {
    pool.push({ provider: 'gemini', apiKey, model: process.env.GEMINI_MODEL || gemini.DEFAULT_MODEL });
  }

  return pool;
}

// Module-level state: which pool entry to try next, and per-key cooldowns.
// Persists across calls within one script run, so successive stages
// naturally continue rotating rather than always retrying key #1 first.
let poolIndex = 0;
const cooldownUntil = new Map(); // apiKey -> timestamp ms

export function hasApiKey() {
  return buildPool().length > 0;
}

export function getModel() {
  // Reported for logging purposes (the model of the *first configured*
  // provider) — the actual model used per-call may differ if rotation
  // occurs. getActiveProviderLabel() gives the real-time picture.
  const pool = buildPool();
  return pool[0]?.model ?? groq.DEFAULT_MODEL;
}

/** Human-readable "provider/model" label for logging, without leaking keys. */
function label(entry) {
  return `${entry.provider}/${entry.model}`;
}

function keyAvailable(entry) {
  const until = cooldownUntil.get(entry.apiKey);
  return !until || until <= Date.now();
}

/**
 * Try the pool starting at poolIndex, skipping any key still in cooldown.
 * Returns the entry to use plus its pool position, or null if every key is
 * currently cooling down.
 */
function nextAvailable(pool) {
  for (let i = 0; i < pool.length; i++) {
    const idx = (poolIndex + i) % pool.length;
    if (keyAvailable(pool[idx])) return idx;
  }
  return -1;
}

/**
 * Call the model and return { text, finishReason, provider }.
 * Rotates automatically through the key pool on 429s. If every key in the
 * pool is currently cooling down, throws a 429-shaped error so the outer
 * withRateLimit() backoff (scripts/lib/rate-limit.mjs) waits and retries —
 * by then some cooldowns will likely have expired.
 */
export async function complete({ system, prompt, maxTokens = 4096, temperature = 0.7, json = false }) {
  const pool = buildPool();
  if (pool.length === 0) {
    throw new Error('No LLM API keys configured. Set GROQ_API_KEYS and/or GEMINI_API_KEYS.');
  }

  let lastError = null;
  const attempted = new Set();

  while (attempted.size < pool.length) {
    const idx = nextAvailable(pool);
    if (idx === -1) break; // every key is cooling down right now

    const entry = pool[idx];
    attempted.add(idx);
    poolIndex = (idx + 1) % pool.length; // next call starts after this one

    try {
      const adapter = PROVIDERS[entry.provider];
      const result = await adapter.complete({
        apiKey: entry.apiKey,
        model: entry.model,
        system,
        prompt,
        maxTokens,
        temperature,
        json,
      });
      return { ...result, provider: entry.provider };
    } catch (err) {
      lastError = err;
      if (err?.status === 429) {
        const retryAfterHeader = err?.headers?.get?.('retry-after');
        const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : null;
        cooldownUntil.set(entry.apiKey, Date.now() + (Number.isFinite(retryAfterMs) ? retryAfterMs : DEFAULT_COOLDOWN_MS));
        console.warn(`  ! [${label(entry)}] rate limited — rotating to next key in pool`);
        continue; // try the next available key immediately, no sleep
      }
      // Non-429 error (network, 5xx, etc.) — let the caller's outer
      // withRateLimit() retry/backoff handle it; don't silently eat it by
      // trying other keys, since it's likely not a rate-limit problem.
      throw err;
    }
  }

  // Every key is on cooldown. Surface a 429 so withRateLimit() backs off
  // and retries the whole complete() call later, by which point some
  // cooldowns should have expired.
  const err = new Error(`All ${pool.length} LLM key(s) are rate-limited right now.`);
  err.status = 429;
  err.cause = lastError;
  throw err;
}

/**
 * Extract the first top-level JSON object from a model response, tolerating
 * markdown code fences or surrounding prose.
 */
export function parseJson(text) {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  if (!t.startsWith('{')) {
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start !== -1 && end !== -1) t = t.slice(start, end + 1);
  }
  return JSON.parse(t);
}
