const STATIC_CACHE = 'ledgerpro-static-v1';
const DYNAMIC_CACHE = 'ledgerpro-dynamic-v1';
const OFFLINE_URL = '/offline';

const CACHE_ASSETS = [
  '/',
  '/offline',
  '/icons/icon-192.jpg',
  '/icons/icon-512.jpg'
];

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

  // 1. CACHE FIRST
  // Good for: Images, fonts, static assets, Next.js chunks
  if (
    url.pathname.startsWith('/_next/static/') || 
    url.pathname.match(/\.(png|jpg|jpeg|svg|gif|webp|woff2|woff|ttf|css)$/i)
  ) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // 2. NETWORK FIRST
  // Good for: Frequently changing data, APIs, page navigations
  if (
    event.request.mode === 'navigate' || 
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/dashboard') ||
    url.pathname.startsWith('/super-admin')
  ) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // 3. STALE WHILE REVALIDATE
  // Good for: External scripts, less critical data
  event.respondWith(staleWhileRevalidate(event.request));
});

// --- Caching Strategy Implementations ---

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
    return new Response('Network error', { status: 408 });
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
      status: 408,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(DYNAMIC_CACHE);
  const cachedResponse = await cache.match(request);
  
  // Always fetch in the background to update the cache
  const networkPromise = fetch(request).then((networkResponse) => {
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  }).catch(() => {
    // Ignore network errors for stale-while-revalidate
  });

  // Return cached response immediately if available, otherwise wait for network
  return cachedResponse || networkPromise || new Response('Network error', { status: 408 });
}
