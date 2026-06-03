const ASSET_VERSION = '4';
const CACHE_VERSION = 'v6';
const STATIC_CACHE = `fintrack-static-${CACHE_VERSION}`;
const EXTERNAL_CACHE = 'fintrack-external-v1';

const STATIC_ASSETS = [
  './',
  './index.html',
  './styles.css?v=' + ASSET_VERSION,
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-192-maskable.png',
  './icon-512-maskable.png'
];

const EXTERNAL_HOSTS = ['dolarapi.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

function getBasePath() {
  const scope = self.registration.scope;
  const pathname = new URL(scope).pathname;
  return pathname.endsWith('/') ? pathname : `${pathname}/`;
}

function clearOldCaches() {
  return caches.keys().then(keys =>
    Promise.all(
      keys
        .filter(key => {
          if (key === STATIC_CACHE || key === EXTERNAL_CACHE) return false;
          if (key.startsWith('fintrack-static-')) return true;
          if (key.startsWith('fintrack-external-')) return true;
          return false;
        })
        .map(key => caches.delete(key))
    )
  );
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        cache.addAll(STATIC_ASSETS).catch(err => {
          console.warn('[SW] Some assets failed to cache:', err);
        });
        return cache;
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', event => {
  event.waitUntil(
    clearOldCaches()
      .then(() => {
        self.clients.claim();
        return self.registration.navigationPreload?.enable();
      })
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  if (request.headers.get('Sec-Fetch-Dest') === 'service-worker') return;

  const isExternal = EXTERNAL_HOSTS.some(host => url.hostname.includes(host));

  if (isExternal) {
    event.respondWith(networkFirst(request, EXTERNAL_CACHE));
    return;
  }

  if (request.destination === 'document') {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }

  if (
    request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'image' ||
    request.destination === 'font'
  ) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }

  event.respondWith(cacheFirst(request, STATIC_CACHE));
});

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then(response => {
      if (response.ok && response.status === 200) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) return cached;

  const networkResponse = await networkPromise;
  if (networkResponse) return networkResponse;

  if (request.destination === 'document') {
    const base = getBasePath();
    return (
      (await caches.match(`${base}index.html`)) ||
      (await caches.match(base)) ||
      new Response('Offline', { status: 503 })
    );
  }

  return new Response('Recurso no disponible offline', { status: 503 });
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok && response.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Recurso no disponible', { status: 503 });
  }
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(
      JSON.stringify({ error: 'Sin conexión' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}