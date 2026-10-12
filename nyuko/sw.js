// QR入庫 Service Worker（オフラインで、アプリを起動できるようにする）
// nyuko.html と同じフォルダに置く → スコープは、このフォルダの中だけ（kanban本体・入荷（ukeire）には影響しない）
//
// ・一度でも、ネットに繋がった状態で開けば、画面(nyuko.html)と jsQR を、端末に保存する。
// ・次からは、ネットが無くても、アプリを起動できる（読取は、オフラインで動く。送信とログインだけ、ネットが要る）。
// ・ネットが繋がっている時は、必ず最新を取りに行く（更新の反映漏れを防ぐ）。ただし、電波が弱くて、4秒待っても
//   返事が無い時は、保存してある版で、先に開く（起動で、長く待たされないように）。
const CACHE = 'nyuko-v1';
const JSQR  = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
const ASSETS = ['nyuko.html', JSQR];
const NET_TIMEOUT_MS = 4000;

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 一定時間で諦める fetch
function fetchWithTimeout(req, ms) {
  const ctl = (typeof AbortController === 'function') ? new AbortController() : null;
  const timer = setTimeout(() => { if (ctl) ctl.abort(); }, ms);
  return fetch(req, ctl ? { signal: ctl.signal } : undefined).then(
    (res) => { clearTimeout(timer); return res; },
    (err) => { clearTimeout(timer); throw err; }
  );
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                 // 送信(POST)などは素通し
  const url = new URL(req.url);

  // GAS API は絶対にキャッシュしない（常にネット）
  if (url.hostname.indexOf('script.google.com') !== -1 ||
      url.hostname.indexOf('googleusercontent.com') !== -1) {
    return;
  }

  const isAppShell = (url.origin === self.location.origin);   // nyuko.html など、このサイト自身のファイル

  if (isAppShell) {
    // アプリ本体は「ネット優先」。ネットに繋がらない・4秒待っても返らない時は、保存してある版を使う。
    e.respondWith(
      fetchWithTimeout(req, NET_TIMEOUT_MS).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('nyuko.html')))
    );
    return;
  }

  // それ以外（jsQRのCDN等）は、保存してある版を優先（オフライン動作の要）。裏で更新する。
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
