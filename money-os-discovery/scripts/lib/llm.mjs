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
  return new Groq({ apiKey: process.env.GROQ_API_KEY });
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
    ...(json ? { response_format: { type: 'json_object' } } : {}),
  });
  return (res.choices?.[0]?.message?.content ?? '').trim();
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
