const CACHE_NAME = 'thier-decor-v41';
const ASSETS_TO_CACHE = [
    './', './index.html', './style.css', './custom.css', './app.js',
    './analytics-notifications.js', './supabase-config.js',
    './firebase-config.js', './manifest.json', './icon.png', './icon-192.png', './favicon.png'
];

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE_NAME).then(async cache => {
        await Promise.all(ASSETS_TO_CACHE.map(async asset => { try { await cache.add(asset); } catch (error) { console.warn('Optional cache asset failed:', asset, error); } }));
    }));
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(names.filter(name => name.startsWith('thier-decor-') && name !== CACHE_NAME).map(name => caches.delete(name)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin || /supabase\.co|firebaseio\.com|googleapis\.com|gstatic\.com/i.test(url.hostname)) return;
    if (request.method !== 'GET') return;

    const isPage = request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/');
    
    if (isPage) {
        event.respondWith(
            fetch(request).then(response => {
                if (response && response.ok) {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, responseToCache));
                }
                return response;
            }).catch(() => caches.match(request).then(cached => cached || caches.match('./index.html')))
        );
    } else {
        event.respondWith(
            caches.match(request).then(cached => {
                if (cached) return cached;
                return fetch(request).then(response => {
                    if (response && response.ok) {
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(request, responseToCache));
                    }
                    return response;
                });
            }).catch(() => new Response('Offline', { status: 503, statusText: 'Offline' }))
        );
    }
});
