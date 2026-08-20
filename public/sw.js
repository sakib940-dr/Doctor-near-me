/* docbd.info production service worker.
 * Policy: cache only same-origin static resources and the offline fallback.
 * Never cache API/auth/private medical responses.
 */
const SW_VERSION = '0.24.0-pwa-1';
const STATIC_CACHE = `docbd-static-${SW_VERSION}`;
const SHELL_CACHE = `docbd-shell-${SW_VERSION}`;
const OFFLINE_URL = '/offline.html';
const SHELL_ASSETS = [
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/favicon.ico',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-192.png',
  '/icons/maskable-512.png',
  '/icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => name.startsWith('docbd-') && ![STATIC_CACHE, SHELL_CACHE].includes(name))
        .map((name) => caches.delete(name))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Cross-origin traffic includes Supabase auth/database/storage and third-party APIs.
  // It is deliberately never stored in Cache Storage.
  if (url.origin !== self.location.origin) {
    event.respondWith(fetch(request));
    return;
  }

  // SPA documents are always network-first. We never cache personalized HTML.
  // If the network is unavailable, show a neutral offline page rather than private data.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  // Vite emits content-hashed production assets under /assets/. These are safe for cache-first.
  if (url.pathname.startsWith('/assets/') && ['script', 'style', 'font', 'image'].includes(request.destination)) {
    event.respondWith(cacheFirstStatic(request));
    return;
  }

  // Only explicit public PWA assets use stale-while-revalidate.
  if (
    url.pathname === '/manifest.webmanifest' ||
    url.pathname === '/favicon.ico' ||
    url.pathname.startsWith('/icons/')
  ) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

async function networkFirstNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    return (await cache.match(OFFLINE_URL)) || Response.error();
  }
}

async function cacheFirstStatic(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') {
    const cache = await caches.open(STATIC_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request).then((response) => {
    if (response.ok && response.type === 'basic') cache.put(request, response.clone());
    return response;
  }).catch(() => undefined);
  return cached || network || Response.error();
}
