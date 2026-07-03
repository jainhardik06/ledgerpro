/**
 * Search Console integration — no `googleapis` SDK dependency, just Node's
 * built-in `crypto` for the service-account JWT + `fetch` for the REST
 * calls (same lightweight pattern as IndexNow and the Gemini provider).
 *
 * IMPORTANT, verified reality check (don't assume the old growth-doc plan
 * still applies): Google's public Indexing API
 * (indexing.googleapis.com/v3/urlNotifications:publish) is documented by
 * Google as intended ONLY for pages with JobPosting or BroadcastEvent
 * structured data. There is NO public API to request indexing for a
 * regular blog post — the "Request Indexing" button in the Search Console
 * UI has no API equivalent. Calling the Indexing API for a blog URL is
 * calling it outside its documented scope: it may be silently ignored,
 * rate-limited, or rejected. We still attempt it (some site owners report
 * it helping regardless), but log the outcome honestly rather than
 * pretending it's a guaranteed "request indexing" mechanism.
 *
 * What genuinely works via public API: the URL Inspection API
 * (searchconsole.googleapis.com), which reports whether a URL is actually
 * indexed, its last crawl time, and coverage state. That's the real,
 * reliable data source — used for Sitemap Intelligence (Phase 1.5).
 *
 * Both require the service account (GOOGLE_APPLICATION_CREDENTIALS_JSON)
 * to be granted access as a user on the Search Console property — a manual
 * step in Google's admin UI. Every function here fails gracefully
 * (returns `{ ok: false, reason: 'permission_denied' }` etc.) rather than
 * throwing, so a publish never breaks because indexing isn't authorized yet.
 */
import crypto from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SITE_URL = process.env.PUBLIC_SITE_URL || 'https://discovermoneyos.webasthetic.in';

let cachedToken = null; // { accessToken, expiresAt }

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function getCredentials() {
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function hasCredentials() {
  return getCredentials() !== null;
}

/** Mint (and cache) an OAuth2 access token for the given scope via a signed service-account JWT. */
async function getAccessToken(scope) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.scope === scope && cachedToken.expiresAt > now + 30) {
    return cachedToken.accessToken;
  }

  const creds = getCredentials();
  if (!creds) throw Object.assign(new Error('No Google service-account credentials configured'), { code: 'no_credentials' });

  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify({
    iss: creds.client_email,
    scope,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }));
  const signInput = `${header}.${claims}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(signInput), creds.private_key);
  const jwt = `${signInput}.${base64url(signature).replace(/=+$/, '')}`;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    const err = new Error(`Google OAuth token exchange failed: ${data.error_description || data.error || res.status}`);
    err.status = res.status;
    err.code = data.error;
    throw err;
  }

  cachedToken = { scope, accessToken: data.access_token, expiresAt: now + (data.expires_in ?? 3600) };
  return data.access_token;
}

/**
 * Real, reliable: check whether a URL is actually indexed by Google.
 * Returns { ok, indexed, coverageState, lastCrawlTime, reason }.
 */
export async function inspectUrl(url) {
  if (!hasCredentials()) return { ok: false, reason: 'no_credentials' };

  try {
    const token = await getAccessToken('https://www.googleapis.com/auth/webmasters.readonly');
    const res = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inspectionUrl: url, siteUrl: SITE_URL.endsWith('/') ? SITE_URL : `${SITE_URL}/` }),
    });
    const data = await res.json();

    if (res.status === 403) return { ok: false, reason: 'permission_denied' };
    if (!res.ok) return { ok: false, reason: data.error?.message || `http_${res.status}` };

    const result = data.inspectionResult?.indexStatusResult;
    return {
      ok: true,
      indexed: result?.verdict === 'PASS' || result?.coverageState === 'Submitted and indexed',
      coverageState: result?.coverageState ?? null,
      lastCrawlTime: result?.lastCrawlTime ?? null,
    };
  } catch (err) {
    return { ok: false, reason: err.code || err.message };
  }
}

/**
 * Best-effort: ping the Indexing API for a URL. Outside its documented
 * scope for blog content (see module docstring) — treat the result as
 * informational, not a guarantee.
 */
export async function requestIndexing(url) {
  if (!hasCredentials()) return { ok: false, reason: 'no_credentials' };

  try {
    const token = await getAccessToken('https://www.googleapis.com/auth/indexing');
    const res = await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, type: 'URL_UPDATED' }),
    });
    const data = await res.json();

    if (res.status === 403) return { ok: false, reason: 'permission_denied' };
    if (!res.ok) return { ok: false, reason: data.error?.message || `http_${res.status}` };
    return { ok: true, notifyTime: data.urlNotificationMetadata?.latestUpdate?.notifyTime ?? null };
  } catch (err) {
    return { ok: false, reason: err.code || err.message };
  }
}
