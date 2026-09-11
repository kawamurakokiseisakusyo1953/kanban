// 受入QRスキャン Service Worker（オフライン用）
// scan.html と同じフォルダに置く → スコープはそのフォルダ配下のみ（kanban本体には影響しない）
const CACHE = 'ukeire-scan-v1';
const JSQR  = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
const ASSETS = ['scan.html', JSQR];

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

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                 // 送信(POST)などは素通し
  const url = new URL(req.url);

  // GAS API は絶対にキャッシュしない（常にネット）
  if (url.hostname.indexOf('script.google.com') !== -1 ||
      url.hostname.indexOf('googleusercontent.com') !== -1) {
    return;
  }

  // それ以外（scan.html / jsQR）はキャッシュ優先＋裏で更新
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res && res.ok &&
            (url.origin === self.location.origin || url.hostname.indexOf('jsdelivr') !== -1)) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
