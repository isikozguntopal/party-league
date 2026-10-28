// Basit service worker: önce ağ, ağ yoksa önbellek (çevrimdışı bot modu çalışsın diye).
const CACHE = 'lazer-kafes-v60';
const ASSETS = ['/', '/index.html', '/style.css', '/ui.css', '/app.js', '/game-core.js', '/manifest.webmanifest',
  '/games/util.js', '/games/filtre.js', '/games/avatar.js', '/games/lazer.js', '/games/bomba.js', '/games/yaris.js',
  '/games/cizim.js', '/games/doodles.js', '/games/bilgi.js', '/games/sorular/dizi.js', '/games/sorular/bilim.js', '/games/sorular/tarih.js', '/games/sorular/insan.js', '/games/sorular/kelime.js', '/games/sorular/genel.js', '/games/sorular/spor.js', '/games/sorular/cografya.js',
  '/games/neciz.js', '/games/kelimeler.js', '/games/keski.js', '/games/bombaci.js', '/games/korkosu.js', '/games/halat.js', '/games/kayik.js',
  '/client/util.js', '/client/avatar2d.js', '/client/avatar3d.js', '/client/lazer.js', '/client/bomba.js',
  '/client/yaris.js', '/client/cizim.js', '/client/bilgi.js', '/client/neciz.js', '/client/paint.js', '/client/keski.js', '/client/bombaci.js', '/client/kor.js', '/client/halat.js', '/client/kayik.js', '/client/net.js', '/client/rt.js', '/client/controls.js',
  '/client/ui.js', '/client/custom.js', '/games/pati.js', '/games/sarki.js', '/client/sarki.js', '/client/tutorial.js', '/games/tanir.js', '/games/tanir-sorular.js', '/client/tanir.js', '/client/pati-view2d.js', '/client/pati-sprites.js', '/client/pati-rt.js', '/client/landscape.js', '/games/basket.js', '/client/basket.js', '/games/melodi.js', '/games/melodi-sarkilar.js', '/client/melodi.js', '/client/music.js', '/vendor/three.min.js',
  '/icons/icon-180.png', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api')) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('/index.html')))
  );
});
