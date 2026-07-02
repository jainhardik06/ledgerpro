/**
 * LLM wrapper for the content engine — powered by Groq (fast, generous free
 * tier, OpenAI-compatible). Centralizes the API key check, model selection, and
 * a JSON-extraction helper so the generation scripts stay focused on prompts.
 */
import Groq from 'groq-sdk';

export function hasApiKey() {
  return Boolean(process.env.GROQ_API_KEY);
}

export function getClient() {
  if (!hasApiKey()) {
    throw new Error('GROQ_API_KEY is not set. Add it to .env.local or CI secrets.');
  }
  // maxRetries: 0 — retry/backoff/pacing is handled explicitly by
  // scripts/lib/rate-limit.mjs so we have full visibility and control over
  // timing (the SDK's built-in retries would otherwise retry silently and
  // unpredictably, fighting with our own pacing).
  return new Groq({ apiKey: process.env.GROQ_API_KEY, maxRetries: 0 });
}

export function getModel() {
  // A strong, free Groq model good for long-form writing. Override with GROQ_MODEL.
  // Note: llama-3.3-70b-versatile was decommissioned by Groq (Aug 2026) — using
  // their recommended replacement.
  return process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
}

/**
 * Call the model and return the assistant text.
 * Set `json: true` to request strict JSON output (model must support it).
 *
 * `openai/gpt-oss-120b` (our default model) is a reasoning model: some of its
 * `max_tokens` budget is spent on hidden reasoning before the visible answer,
 * which — combined with an undersized budget — silently truncates output
 * mid-sentence instead of erroring. We fix this two ways: request
 * `reasoning_effort: 'low'` to minimize that overhead, and return
 * `finishReason` so callers can detect truncation (`finish_reason ===
 * 'length'`) and retry with a bigger budget rather than publish a cut-off
 * sentence.
 */
export async function complete({ system, prompt, maxTokens = 4096, temperature = 0.7, json = false }) {
  const client = getClient();
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });

  const res = await client.chat.completions.create({
    model: getModel(),
    messages,
    max_tokens: maxTokens,
    temperature,
    reasoning_effort: 'low',
    ...(json ? { response_format: { type: 'json_object' } } : {}),
  });
  const choice = res.choices?.[0];
  return {
    text: (choice?.message?.content ?? '').trim(),
    finishReason: choice?.finish_reason ?? null,
  };
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
