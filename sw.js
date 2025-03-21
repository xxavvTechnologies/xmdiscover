const CACHE_NAME = 'xmdiscover-v1';
const STATIC_CACHE = 'xmdiscover-static-v1';
const DYNAMIC_CACHE = 'xmdiscover-dynamic-v1';
const AUDIO_CACHE = 'xmdiscover-audio-v1';

// Cache CSS and images for 1 week
const WEEK_IN_SECONDS = 7 * 24 * 60 * 60;

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll([
                './',
                './index.html',
                './styles.css',
                './manifest.json',
                './discover.html',
                './library.html',
                './podcasts.html',
                './pages/search.html',
                './pages/artist.html',
                './pages/release.html',
                './pages/playlist.html',
                './pages/podcast.html',
                './pages/profile.html',
                './pages/create-playlist.html'
            ]);
        })
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // Handle different types of requests
    if (url.pathname.includes('/audio/')) {
        event.respondWith(handleAudioFetch(event.request));
    } else if (event.request.destination === 'image' || 
               event.request.destination === 'style') {
        event.respondWith(handleAssetFetch(event.request));
    } else {
        event.respondWith(handleDefaultFetch(event.request));
    }
});

async function handleAudioFetch(request) {
    // Only handle GET requests, pass through all others
    if (request.method !== 'GET') {
        return fetch(request.clone());
    }

    const cache = await caches.open(AUDIO_CACHE);
    const response = await cache.match(request);
    
    if (response) {
        // Check if it's a signed URL that's expired
        const url = new URL(request.url);
        if (url.searchParams.has('token')) {
            try {
                // Attempt to fetch fresh content
                const networkResponse = await fetch(request.clone());
                if (networkResponse.ok) {
                    await cache.put(request, networkResponse.clone());
                    return networkResponse;
                }
            } catch (error) {
                console.warn('Failed to refresh signed URL:', error);
            }
        }
        return response;
    }
    
    try {
        const networkResponse = await fetch(request.clone());
        
        if (networkResponse.ok) {
            // Only cache successful responses
            await cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.error('Audio fetch failed:', error);
        return new Response(null, {
            status: 404,
            statusText: 'Network request failed'
        });
    }
}

async function handleAssetFetch(request) {
    const cache = await caches.open(STATIC_CACHE);
    const response = await cache.match(request);
    
    if (response) {
        // Check if cache is older than 1 week
        const dateHeader = response.headers.get('date');
        if (dateHeader) {
            const cacheAge = (Date.now() - new Date(dateHeader).getTime()) / 1000;
            if (cacheAge < WEEK_IN_SECONDS) {
                return response;
            }
        }
    }
    
    try {
        const networkResponse = await fetch(request);
        cache.put(request, networkResponse.clone());
        return networkResponse;
    } catch (error) {
        return response || new Response(null, {status: 404});
    }
}

async function handleDefaultFetch(request) {
    const cache = await caches.open(DYNAMIC_CACHE);
    const response = await cache.match(request);
    
    if (response) return response;
    
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        return new Response(null, {status: 404});
    }
}

// Clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => {
                    return !key.includes(STATIC_CACHE) &&
                           !key.includes(DYNAMIC_CACHE) &&
                           !key.includes(AUDIO_CACHE);
                }).map(key => caches.delete(key))
            );
        })
    );
});
