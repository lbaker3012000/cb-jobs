// C&B Jobs — keeps the app's own files on the phone so it opens instantly
// and still opens with no signal. Job data itself is NOT handled here: it
// always comes live from Supabase (the app keeps its own last-loaded copy).
//
// When you update the app, bump VERSION (and the ?v= numbers in index.html).
const VERSION = '20261121g';
const CACHE = `cbjobs-${VERSION}`;

const SHELL = [
  './',
  'index.html',
  `css/styles.css?v=${VERSION}`,
  `js/app.js?v=${VERSION}`,
  `js/db.js?v=${VERSION}`,
  `js/config.js?v=${VERSION}`,
  'manifest.webmanifest',
  'favicon.png',
  'icon-180.png',
  'icon-192.png',
  'img/house-gold.png',
  'img/house-deep.png',
  'img/cb-banner.jpg',
  `css/inv-fonts.css?v=${VERSION}`,
  'fonts/poppins-latin-400-normal.woff2',
  'fonts/poppins-latin-500-normal.woff2',
  'fonts/poppins-latin-600-normal.woff2',
  'fonts/poppins-latin-700-normal.woff2',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('cbjobs-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Never touch Supabase (data, logins, photos) — always live
  if (url.hostname.endsWith('supabase.co') || url.hostname.endsWith('supabase.in')) return;

  // The page itself: try the network first (to pick up updates), fall back to the saved copy
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put('index.html', copy)); return res; })
        .catch(() => caches.match('index.html').then(r => r || caches.match('./'))),
    );
    return;
  }

  // App files (same site) and the Supabase library (from the CDN): saved copy first, else fetch and save
  const sameSite = url.origin === self.location.origin;
  const cdn = url.hostname === 'cdn.jsdelivr.net';
  if (!sameSite && !cdn) return;
  event.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    })),
  );
});

// ----- Phone notifications
self.addEventListener('push', event => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { body: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(d.title || 'C&B Jobs', {
    body: d.body || '',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: d.tag || undefined,
    data: { url: d.url || '#/jobs' },
  }));
});

// Tapping a notification opens the app on the right screen
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const hash = (event.notification.data && event.notification.data.url) || '#/jobs';
  const target = new URL(self.registration.scope).href.split('#')[0] + hash;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (w.url.startsWith(self.registration.scope)) {
        await w.focus();
        try { await w.navigate(target); } catch { w.postMessage({ goto: hash }); }
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});
