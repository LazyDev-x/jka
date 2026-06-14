const CACHE_VERSION = 'v3';
const CACHE_NAME = `pwa-${CACHE_VERSION}`;
const urlsToCache = [
    '/',
    '/index.html',
    '/manifest.json'
];

// Instalación: cachear recursos estáticos
self.addEventListener('install', event => {
    console.log('[SW] Instalando nueva versión:', CACHE_VERSION);
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Cacheando archivos esenciales');
                return cache.addAll(urlsToCache);
            })
            .then(() => self.skipWaiting()) // Activar SW inmediatamente
    );
});

// Activar: limpiar cachés antiguas
self.addEventListener('activate', event => {
    console.log('[SW] Activando nueva versión:', CACHE_VERSION);
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME && cache.startsWith('pwa-')) {
                        console.log('[SW] Eliminando caché antigua:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim()) // Tomar control inmediato
    );
});

// Estrategia: Cache First con fallback a red y actualización en segundo plano
self.addEventListener('fetch', event => {
    // Ignorar peticiones que no sean GET
    if (event.request.method !== 'GET') return;

    // Evitar cachear analytics o extensiones
    const url = new URL(event.request.url);
    if (url.origin !== location.origin) return;

    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                if (cachedResponse) {
                    // Devolver caché y actualizar en segundo plano (stale-while-revalidate)
                    fetch(event.request)
                        .then(networkResponse => {
                            if (networkResponse && networkResponse.status === 200) {
                                caches.open(CACHE_NAME).then(cache => {
                                    cache.put(event.request, networkResponse.clone());
                                });
                            }
                        })
                        .catch(() => {});
                    return cachedResponse;
                }
                
                // Si no está en caché, ir a la red
                return fetch(event.request).then(networkResponse => {
                    if (!networkResponse || networkResponse.status !== 200) {
                        return networkResponse;
                    }
                    // Clonar respuesta y guardar en caché
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseToCache);
                    });
                    return networkResponse;
                }).catch(error => {
                    console.error('[SW] Falló fetch:', error);
                    // Fallback para páginas HTML (página offline)
                    if (event.request.headers.get('accept').includes('text/html')) {
                        return caches.match('/index.html');
                    }
                    return new Response('Contenido no disponible offline', {
                        status: 503,
                        statusText: 'Offline',
                        headers: new Headers({ 'Content-Type': 'text/plain' })
                    });
                });
            })
    );
});