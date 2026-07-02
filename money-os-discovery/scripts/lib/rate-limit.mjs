/**
 * Rate-limit-aware call wrapper for the Groq free tier.
 *
 * The free tier for our default model (openai/gpt-oss-120b) is: 30 requests/
 * min, 8,000 tokens/min, 1,000 requests/day, 200,000 tokens/day. A single
 * long-form "write the whole article" call can burn most of the per-minute
 * token budget in one shot, which is fragile under retries. Instead the
 * content engine makes several SMALL calls (plan, intro, one per section,
 * FAQ) with a fixed pacing floor between every call, plus exponential
 * backoff that honors the `retry-after` header on 429s.
 *
 * Trade-off, deliberately accepted: a single post takes a few minutes to
 * generate instead of a few seconds. That is fine — the publishing cadence
 * is one post every ~3 days, so there is no time pressure at all.
 */
import { complete } from './llm.mjs';

// Floor between any two Groq calls, regardless of success/failure. At 30 RPM
// the theoretical minimum is 2s/request; 15s keeps us far under that AND
// gives the rolling 60s token-budget window room to refill between calls.
const MIN_PACING_MS = 15_000;

const MAX_RETRIES = 6;
const BASE_BACKOFF_MS = 10_000;
const MAX_BACKOFF_MS = 120_000;

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let lastCallAt = 0;

async function pace() {
  const elapsed = Date.now() - lastCallAt;
  if (lastCallAt > 0 && elapsed < MIN_PACING_MS) {
    await sleep(MIN_PACING_MS - elapsed);
  }
}

/**
 * Run `fn` (a single Groq API call) with pacing before it and retry/backoff
 * around it. `label` is just for log output so a run's console tells a clear
 * story of what stage it's on.
 */
export async function withRateLimit(label, fn) {
  await pace();

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      lastCallAt = Date.now();
      return await fn();
    } catch (err) {
      lastCallAt = Date.now();
      const status = err?.status;
      const isRateLimit = status === 429;
      const isTransient = (typeof status === 'number' && status >= 500) || ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN'].includes(err?.code);

      if (!isRateLimit && !isTransient) throw err;
      if (attempt >= MAX_RETRIES) throw err;

      const retryAfterHeader = err?.headers?.get?.('retry-after');
      const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : null;
      const backoffMs = Number.isFinite(retryAfterMs)
        ? retryAfterMs
        : Math.min(BASE_BACKOFF_MS * 2 ** (attempt - 1), MAX_BACKOFF_MS);

      console.warn(
        `  ! [${label}] ${isRateLimit ? 'rate limited (429)' : `transient error (${status ?? err?.code})`} — ` +
        `attempt ${attempt}/${MAX_RETRIES}, waiting ${Math.round(backoffMs / 1000)}s before retry`
      );
      await sleep(backoffMs);
    }
  }
}

/**
 * Trim a possibly-truncated string back to its last complete sentence, so a
 * cut-off generation never publishes a hanging fragment like "...plan a 15"
 * or "...conservative growth factor (". Falls back to the original text if
 * no sentence boundary is found (better a slightly long paragraph than an
 * empty one).
 */
export function trimToLastSentence(text) {
  const t = text.trimEnd();
  const lastBoundary = Math.max(t.lastIndexOf('. '), t.lastIndexOf('.\n'), t.lastIndexOf('!'), t.lastIndexOf('?'));
  // Only trim if we'd keep a reasonable majority of the text — otherwise a
  // short reply with no punctuation yet would get chopped to almost nothing.
  if (lastBoundary > t.length * 0.5) {
    return t.slice(0, lastBoundary + 1).trim();
  }
  return t;
}

/**
 * Generate one stage of an article: rate-limit-safe (via withRateLimit) AND
 * truncation-safe. `openai/gpt-oss-120b` sometimes still runs long even with
 * reasoning_effort: 'low', so if the first attempt is cut off
 * (finish_reason === 'length') we retry once with a 60% larger budget before
 * falling back to trimming to the last complete sentence — the article never
 * ships a mid-word fragment.
 */
export async function generateStage(label, { system, prompt, maxTokens, temperature, json = false }) {
  let { text, finishReason } = await withRateLimit(label, () =>
    complete({ system, prompt, maxTokens, temperature, json })
  );

  if (finishReason === 'length') {
    const biggerBudget = Math.round(maxTokens * 1.6);
    console.warn(`  ! [${label}] response was truncated at ${maxTokens} tokens — retrying with ${biggerBudget}`);
    ({ text, finishReason } = await withRateLimit(`${label}-retry`, () =>
      complete({ system, prompt, maxTokens: biggerBudget, temperature, json })
    ));
  }

  if (finishReason === 'length' && !json) {
    // Still truncated after the bigger retry — don't ship a hanging sentence.
    console.warn(`  ! [${label}] still truncated after retry — trimming to last complete sentence`);
    text = trimToLastSentence(text);
  }

  return text;
}
