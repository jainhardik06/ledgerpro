/**
 * IndexNow — pings Bing/Yandex (and other participating engines) the moment
 * new or updated content is published, instead of waiting for their crawler
 * to discover it on its own schedule. Free, no OAuth, no API key beyond a
 * self-generated one — the opposite of Google's Indexing API, which needs a
 * verified GSC service account we don't have configured.
 *
 * Setup is exactly two things, both already done:
 *   1. A random key (public/211f5cca454d4ac79217d58c0f9b6862.txt, containing
 *      just that key) — this is how IndexNow verifies you own the domain.
 *   2. Calling submitUrls() after publishing.
 *
 * Google does not participate in IndexNow, so this does not help Google
 * indexing directly — Search Console access (a manual credential the user
 * has to grant) is still the only path there.
 */
const INDEXNOW_KEY = '211f5cca454d4ac79217d58c0f9b6862';
const SITE_HOST = 'discovermoneyos.webasthetic.in';
const KEY_LOCATION = `https://${SITE_HOST}/${INDEXNOW_KEY}.txt`;

/**
 * Submit one or more absolute URLs to IndexNow. Never throws — indexing
 * notification is a nice-to-have, not something that should fail a publish.
 */
export async function submitUrls(urls) {
  if (!urls.length) return { ok: false, skipped: true };

  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: SITE_HOST,
        key: INDEXNOW_KEY,
        keyLocation: KEY_LOCATION,
        urlList: urls,
      }),
    });
    // IndexNow returns 200 or 202 on success; no body to parse.
    return { ok: res.ok || res.status === 202, status: res.status };
  } catch (err) {
    console.warn(`  ! IndexNow submission failed (non-fatal): ${err.message}`);
    return { ok: false, error: err.message };
  }
}
