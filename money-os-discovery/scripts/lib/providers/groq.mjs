/**
 * Groq provider adapter. Thin wrapper matching the shared provider interface
 * used by scripts/lib/llm.mjs's key-pool rotation:
 *   complete({ apiKey, model, system, prompt, maxTokens, temperature, json })
 *   -> { text, finishReason }
 * Throws an error with `.status` set (429 on rate limit) so the pool
 * rotation logic in llm.mjs can detect and react to it.
 */
import Groq from 'groq-sdk';

export const DEFAULT_MODEL = 'openai/gpt-oss-120b';

export async function complete({ apiKey, model, system, prompt, maxTokens, temperature, json }) {
  // maxRetries: 0 — retry/backoff/rotation is handled by our own layers
  // (rate-limit.mjs pacing + llm.mjs key rotation), not the SDK's own retry.
  const client = new Groq({ apiKey, maxRetries: 0 });
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });

  const res = await client.chat.completions.create({
    model: model || DEFAULT_MODEL,
    messages,
    max_tokens: maxTokens,
    temperature,
    // gpt-oss models spend part of max_tokens on hidden reasoning; 'low'
    // minimizes that so more budget reaches the visible answer.
    reasoning_effort: 'low',
    ...(json ? { response_format: { type: 'json_object' } } : {}),
  });
  const choice = res.choices?.[0];
  return {
    text: (choice?.message?.content ?? '').trim(),
    finishReason: choice?.finish_reason ?? null,
  };
}
