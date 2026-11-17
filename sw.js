/* Service Worker: hält nur die Programmdateien bereit (damit die App vom Home-Bildschirm sofort startet).
   Immer zuerst aus dem Netz -> neue Versionen kommen ohne Zutun an. Daten aus der Cloud werden NIE zwischengespeichert. */
const CACHE = 'am-mobile-v9';
const SHELL = ['./', 'index.html', 'app.css', 'config.js', 'i18n.js', 'api.js', 'receipt.js', 'statement.js', 'app.js', 'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-192.png'];

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;       // Cloud-Anfragen gehen unverändert durch
  if (url.pathname.includes('/ocr/')) {                                               // Texterkennung: große, unveränderliche Dateien -> einmal laden, dann aus dem Speicher
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; })));
    return;
  }
  // immer beim Server nachfragen -> Updates kommen sofort an (Seitenaufruf: nur die Adresse; sonst die Anfrage unverändert)
  const req = e.request.mode === 'navigate' ? fetch(url.href, {cache: 'no-cache'}) : fetch(new Request(e.request, {cache: 'no-cache'}));
  e.respondWith(req.then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, {ignoreSearch: true}).then(r => r || caches.match('index.html'))));
});

/* Mitteilungen: anzeigen (das iPhone verlangt, dass JEDE ankommende Mitteilung gezeigt wird) und beim Antippen die App am passenden Reiter öffnen. */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = {}; }
  e.waitUntil(self.registration.showNotification(d.t || 'AirManager Pro', {body: d.b || '', tag: d.tag || undefined, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png',
                                                                           data: {tab: d.tab || 'today', ym: d.ym || ''}}));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const dd = e.notification.data || {}, tab = String(dd.tab || 'today').replace(/[^a-z]/g, ''), ym = /^\d{4}-\d{2}$/.test(dd.ym || '') ? dd.ym : '';
  e.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(list => {
    for (const c of list) { c.postMessage({go: tab, ym}); if ('focus' in c) return c.focus(); }
    return self.clients.openWindow('./?tab=' + tab + (ym ? '&ym=' + ym : ''));
  }));
});
