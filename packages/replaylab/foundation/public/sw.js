const SHELL_VERSION = 'v3';
const CACHE_PREFIX = 'replaylab-shell-';
const CACHE_NAME = CACHE_PREFIX + SHELL_VERSION;
const INDEX_KEY = '/index.html';

async function primeShellCache() {
  const cache = await caches.open(CACHE_NAME);
  const response = await fetch(INDEX_KEY, { cache: 'reload' });
  if (!response.ok) throw new Error('ReplayLab shell index could not be cached');
  await cache.put(INDEX_KEY, response.clone());
  await cache.put('/', response.clone());
  const html = await response.text();
  const assetPaths = [
    ...html.matchAll(new RegExp('(?:src|href)="(/assets/[^"]+)"', 'g')),
  ].map(match => match[1]);
  await Promise.all(
    [...new Set(assetPaths)].map(async path => {
      const asset = await fetch(path, { cache: 'reload' });
      if (!asset.ok) throw new Error('ReplayLab shell asset could not be cached');
      await cache.put(path, asset);
    })
  );
}

function offlineUnavailableResponse() {
  return new Response(
    '<!doctype html><html lang="ru"><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>ReplayLab недоступен офлайн</title>' +
      '<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#07131f;color:#e6d9b6;font:16px system-ui">' +
      '<main data-offline-unavailable="true" style="max-width:36rem;padding:2rem">' +
      '<p style="color:#ffb020;font-weight:800;letter-spacing:.12em;text-transform:uppercase">Офлайн-восстановление</p>' +
      '<h1>ReplayLab пока недоступен офлайн.</h1>' +
      '<p>Кэш приложения отсутствует, поэтому ReplayLab не может открыть локальные комбинации. Подключитесь к сети один раз и дождитесь статуса «Офлайн-оболочка готова», прежде чем закрывать браузер.</p>' +
      '</main></body></html>',
    {
      status: 503,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    }
  );
}

self.addEventListener('install', event => {
  event.waitUntil(primeShellCache());
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => {
        const replayCaches = keys.filter(key => key.startsWith(CACHE_PREFIX));
        const previous = replayCaches.filter(key => key !== CACHE_NAME).sort().at(-1);
        const retained = new Set([CACHE_NAME, previous].filter(Boolean));
        return Promise.all(replayCaches.filter(key => !retained.has(key)).map(key => caches.delete(key)));
      })
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data?.type === 'replaylab-activate-update') {
    event.waitUntil(self.skipWaiting());
  }
  if (event.data?.type === 'replaylab-shell-status') {
    event.source?.postMessage({ type: 'replaylab-shell-status', shellVersion: SHELL_VERSION, minimumClientVersion: 1 });
  }
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(async response => {
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(INDEX_KEY, response.clone());
          }
          return response;
        })
        .catch(async () => {
          const current = await caches.open(CACHE_NAME);
          const cached =
            (await current.match(INDEX_KEY)) ??
            (await current.match('/')) ??
            (await caches.match(INDEX_KEY)) ??
            (await caches.match('/'));
          return cached ?? offlineUnavailableResponse();
        })
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async current => {
      const cached = (await current.match(request)) ?? (await caches.match(request));
      if (cached) return cached;
      return fetch(request).then(async response => {
        if (response.ok && url.pathname.startsWith('/assets/')) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      });
    })
  );
});
