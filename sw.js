const CACHE_NAME = 'fintrack-v1';
const EXTERNAL_CACHE_NAME = 'fintrack-external-v1';

const urlsToCache = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-192-maskable.png',
  '/icon-512-maskable.png'
];

const EXTERNAL_HOSTS = ['dolarapi.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

// ── Install ──────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting()) // solo si el caché se completó OK
  );
});

// ── Activate ─────────────────────────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  const validCaches = [CACHE_NAME, EXTERNAL_CACHE_NAME];

  event.waitUntil(
    caches.keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => !validCaches.includes(name))
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim()) // después de limpiar, no antes
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorar requests que no sean GET
  if (request.method !== 'GET') return;

  const isExternal = EXTERNAL_HOSTS.some((host) => url.hostname.includes(host));

  if (isExternal) {
    // Estrategia Network-first para recursos externos
    event.respondWith(networkFirst(request, EXTERNAL_CACHE_NAME));
    return;
  }

  // Estrategia Cache-first para assets estáticos propios
  event.respondWith(cacheFirst(request));
});

// ── Estrategias ───────────────────────────────────────────────────────────────

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok && networkResponse.type === 'basic') {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch {
    // Fallback a index.html para navegación offline
    if (request.destination === 'document') {
      return caches.match('/index.html');
    }
    return new Response('Recurso no disponible', { status: 503 });
  }
}

async function networkFirst(request, cacheName) {
  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;

    // Error estructurado para que el cliente pueda manejarlo
    return new Response(
      JSON.stringify({ error: 'Sin conexión y sin caché disponible' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}