/**
 * Google Gemini provider adapter — raw REST (no SDK dependency, matching the
 * pattern already used for IndexNow). Same shared interface as the Groq
 * adapter:
 *   complete({ apiKey, model, system, prompt, maxTokens, temperature, json })
 *   -> { text, finishReason }
 * Throws an error with `.status` set (429 on rate limit, matching the shape
 * groq-sdk's APIError uses) so llm.mjs's pool rotation logic works
 * identically regardless of which provider is active.
 */
export const DEFAULT_MODEL = 'gemini-2.0-flash';

// Gemini finish reasons -> the Groq/OpenAI-style vocabulary the rest of the
// content engine already checks for (specifically 'length' for truncation).
function normalizeFinishReason(reason) {
  if (reason === 'MAX_TOKENS') return 'length';
  if (reason === 'STOP') return 'stop';
  return reason ? reason.toLowerCase() : null;
}

export async function complete({ apiKey, model, system, prompt, maxTokens, temperature, json }) {
  const m = model || DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature,
      ...(json ? { responseMimeType: 'application/json' } : {}),
    },
  };
  if (system) {
    body.systemInstruction = { parts: [{ text: system }] };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    const err = new Error(`Gemini API error ${res.status}: ${errBody.slice(0, 300)}`);
    err.status = res.status;
    // Gemini exposes the same retry-after semantics via a Retry-After header
    // on 429s in some cases; expose it the same way groq-sdk's APIError does
    // so the shared rotation/backoff code in llm.mjs and rate-limit.mjs can
    // read it without provider-specific branching.
    err.headers = res.headers;
    throw err;
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];
  const text = (candidate?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim();

  return {
    text,
    finishReason: normalizeFinishReason(candidate?.finishReason),
  };
}
