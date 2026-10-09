// Offline support so Palate opens in a wine store with poor reception.
const APP_CACHE = 'palate-app-v1';
const IMG_CACHE = 'palate-img-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((c) => c.addAll(['./', './index.html'])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== APP_CACHE && k !== IMG_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Pages: network first, fall back to the cached shell.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(APP_CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  // Google Fonts: cache first, so the type looks right in a store with no signal.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(APP_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) await cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // Bottle photos linked from the web: cache first so they show offline.
  if (url.origin !== self.location.origin) {
    if (req.destination !== 'image') return;
    event.respondWith(
      caches.open(IMG_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') {
          await cache.put(req, res.clone());
          // Keep the cache bounded: search thumbnails pile up otherwise.
          const keys = await cache.keys();
          for (const k of keys.slice(0, Math.max(0, keys.length - 400))) cache.delete(k);
        }
        return res;
      }),
    );
    return;
  }

  // App assets (hashed filenames): stale-while-revalidate.
  event.respondWith(
    caches.open(APP_CACHE).then(async (cache) => {
      const hit = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => hit);
      return hit ?? network;
    }),
  );
});

// Price-drop alerts from Palate's server (see src/lib/push.ts).
self.addEventListener('push', (event) => {
  let note = { title: 'Palate', body: '' };
  try {
    note = { ...note, ...event.data.json() };
  } catch {
    if (event.data) note.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(note.title, {
      body: note.body,
      tag: note.tag,
      icon: './icon-192.png',
      badge: './icon-192.png',
      data: { url: note.url || '#/watch' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '#/watch', self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const win = wins[0];
      if (win) return win.navigate(url).then((w) => (w || win).focus());
      return self.clients.openWindow(url);
    }),
  );
});
