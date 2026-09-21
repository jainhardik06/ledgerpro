const STATIC_CACHE = 'moneyos-static-v3';
const DYNAMIC_CACHE = 'moneyos-dynamic-v3';
const OFFLINE_URL = '/offline';

const CACHE_ASSETS = [
  '/',
  '/offline',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-192-maskable.png',
  '/icons/icon-512-maskable.png',
  '/icons/apple-touch-icon.png'
];

// Authenticated surfaces are NEVER cached: a stored dashboard or API response
// could be replayed offline after logout, or on a shared device, leaking one
// user's tenant data to the next. They are network-only with an offline
// fallback for page navigations.
const AUTHENTICATED_PREFIXES = ['/api/', '/dashboard', '/super-admin'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      try {
        await cache.addAll(CACHE_ASSETS);
      } catch (error) {
        console.error('Failed to cache during install:', error);
      }
      self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Clean up old caches that don't match the current versions
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((name) => {
          if (name !== STATIC_CACHE && name !== DYNAMIC_CACHE) {
            return caches.delete(name);
          }
        })
      );
      self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  const url = new URL(event.request.url);

  // SAME-ORIGIN ONLY — cross-origin requests (analytics beacons, gtag,
  // third-party scripts) are none of this worker's business. Intercepting
  // them made the worker fetch URLs the page CSP never allowed, which
  // surfaced as CSP violations and "Failed to convert value to 'Response'"
  // crashes in staleWhileRevalidate.
  if (url.origin !== self.location.origin) return;

  // 1. AUTHENTICATED — network only, never cached (see AUTHENTICATED_PREFIXES)
  if (AUTHENTICATED_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
    event.respondWith(networkOnly(event.request));
    return;
  }

  // 2. CACHE FIRST
  // Good for: Images, fonts, static assets, Next.js chunks
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.match(/\.(png|jpg|jpeg|svg|gif|webp|ico|woff2|woff|ttf|css)$/i)
  ) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // 3. NETWORK FIRST
  // Good for: Public page navigations and other frequently changing content
  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // 4. STALE WHILE REVALIDATE
  // Good for: Other same-origin fetches
  event.respondWith(staleWhileRevalidate(event.request));
});

// --- Caching Strategy Implementations ---

async function networkOnly(request) {
  try {
    return await fetch(request);
  } catch (error) {
    // Page navigations still get the offline page; API callers get a clean 503.
    if (request.mode === 'navigate') {
      const staticCache = await caches.open(STATIC_CACHE);
      const offlinePage = await staticCache.match(OFFLINE_URL);
      if (offlinePage) {
        return offlinePage;
      }
    }
    if (request.url.includes('/api/')) {
      return new Response(JSON.stringify({ error: 'You are offline.' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('Network error. You are offline.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cachedResponse = await cache.match(request);

  // If we have it in cache, return immediately
  if (cachedResponse) {
    return cachedResponse;
  }

  // Otherwise, fetch from network
  try {
    const networkResponse = await fetch(request);
    // Only cache successful network responses
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    return new Response('Network error', { status: 503 });
  }
}

async function networkFirst(request) {
  const dynamicCache = await caches.open(DYNAMIC_CACHE);
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      dynamicCache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    // Network failed, look in cache
    const cachedResponse = await dynamicCache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    // If request is a page navigation and cache is empty, serve offline page
    if (request.mode === 'navigate') {
      const staticCache = await caches.open(STATIC_CACHE);
      const offlinePage = await staticCache.match(OFFLINE_URL);
      if (offlinePage) {
        return offlinePage;
      }
    }
    return new Response('Network error. You are offline.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(DYNAMIC_CACHE);
  const cachedResponse = await cache.match(request);

  // Always fetch in the background to update the cache. The catch must
  // resolve to a real Response (never undefined): respondWith() with a
  // promise that resolves to undefined throws "Failed to convert value to
  // 'Response'".
  const networkPromise = fetch(request).then((networkResponse) => {
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  }).catch(() => {
    // Network failed and nothing is cached — answer with a clean 503.
    return new Response('Network error', { status: 503 });
  });

  // Return cached response immediately if available, otherwise wait for network
  return cachedResponse || networkPromise;
}
