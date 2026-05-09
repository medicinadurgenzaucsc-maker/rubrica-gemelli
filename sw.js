// Service Worker — Rubrica Gemelli v5
const CACHE = 'rubrica-v5';
const SUPA_HOST = 'nbbekxuvuarxkuvvvgbi.supabase.co';
const STATIC = [
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-1024.png',
  './app.css',
  './app.js',
];

// ── Install: precache assets statici ─────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)));
  // NB: non chiamiamo skipWaiting qui — lo facciamo solo quando l'utente
  // accetta l'aggiornamento via postMessage (vedi handler 'message')
});

// ── Activate: pulizia vecchie cache ──────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Messaggio da client: l'utente ha cliccato "Ricarica" ─────────────────────
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

// ── Fetch handler ────────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // ── Supabase ───────────────────────────────────────────────────────────────
  if (url.host === SUPA_HOST) {
    // update_cache: SEMPRE rete, mai cache (è il timestamp)
    if (url.pathname.includes('update_cache')) return;

    // Mutazioni (POST/PATCH/DELETE) e RPC: sempre rete, mai cache
    if (e.request.method !== 'GET') return;

    // GET contatti/categorie: stale-while-revalidate
    if (url.pathname.endsWith('/contatti') || url.pathname.endsWith('/categorie')) {
      e.respondWith(
        caches.open(CACHE).then(async cache => {
          const cached = await cache.match(e.request);
          const network = fetch(e.request).then(res => {
            if (res.ok) cache.put(e.request, res.clone());
            return res;
          }).catch(() => cached);
          return cached || network;
        })
      );
      return;
    }
    return; // tutto il resto su Supabase: rete diretta
  }

  // ── HTML / navigazione: rete prima, cache fallback ───────────────────────
  if (e.request.mode === 'navigate' ||
      url.pathname.endsWith('.html') ||
      url.pathname.endsWith('/')) {
    e.respondWith(
      fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // ── Asset statici (CSS/JS/icon/manifest): cache first, fallback rete ─────
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      });
    })
  );
});
