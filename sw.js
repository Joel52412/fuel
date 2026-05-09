// FUEL APP — Service Worker
// Bump CACHE_VERSION after shell changes so clients refresh cached assets.
var CACHE_VERSION = 'fuel-v4.0';

function indexUrl() {
  return new URL('index.html', self.location).href;
}

var URLS_TO_CACHE = [indexUrl()];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then(function (cache) {
        return Promise.allSettled(
          URLS_TO_CACHE.map(function (url) {
            return cache.add(new Request(url, { cache: 'reload' }));
          })
        );
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (cacheNames) {
        return Promise.all(
          cacheNames.map(function (cacheName) {
            if (cacheName !== CACHE_VERSION) {
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') {
    return;
  }

  var url = req.url;
  if (
    url.includes('openfoodfacts.org') ||
    url.includes('jsdelivr.net') ||
    url.includes('cdnjs.')
  ) {
    return;
  }

  event.respondWith(
    caches.match(req).then(function (cachedResponse) {
      var networkPromise = fetch(req)
        .then(function (networkResponse) {
          if (networkResponse && networkResponse.status === 200) {
            var clone = networkResponse.clone();
            caches.open(CACHE_VERSION).then(function (cache) {
              cache.put(req, clone);
            });
          }
          return networkResponse;
        })
        .catch(function () {
          return cachedResponse;
        });

      return cachedResponse || networkPromise;
    })
  );
});

self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
