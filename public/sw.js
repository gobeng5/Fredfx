// VIX Signal Bot Service Worker
const CACHE_NAME = 'vix-signals-v1';
const STATIC_CACHE = 'vix-static-v1';
const DYNAMIC_CACHE = 'vix-dynamic-v1';

// Resources to cache immediately
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  // Add other critical assets here
];

// API endpoints that should be cached with network-first strategy
const API_ENDPOINTS = [
  '/api/status',
  '/api/consolidated/active',
  '/api/consolidated/status',
  '/api/automated/status'
];

// Install event - cache static assets
self.addEventListener('install', event => {
  console.log('Service Worker: Installing...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('Service Worker: Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('Service Worker: Static assets cached');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('Service Worker: Failed to cache static assets', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('Service Worker: Activating...');
  
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
              console.log('Service Worker: Deleting old cache', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('Service Worker: Activated');
        return self.clients.claim();
      })
  );
});

// Fetch event - handle network requests
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Handle API requests with network-first strategy
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      handleApiRequest(request)
    );
    return;
  }

  // Handle static assets with cache-first strategy
  if (request.destination === 'document' || 
      request.destination === 'script' || 
      request.destination === 'style' ||
      request.destination === 'image') {
    event.respondWith(
      handleStaticRequest(request)
    );
    return;
  }

  // Default: try network first, fallback to cache
  event.respondWith(
    fetch(request)
      .catch(() => caches.match(request))
  );
});

// Network-first strategy for API calls
async function handleApiRequest(request) {
  try {
    // Try network first
    const networkResponse = await fetch(request);
    
    // Cache successful responses for critical endpoints
    if (networkResponse.ok && shouldCacheApiEndpoint(request.url)) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('Network failed for API request, trying cache:', request.url);
    
    // Fallback to cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return offline response for critical endpoints
    if (shouldCacheApiEndpoint(request.url)) {
      return createOfflineApiResponse(request.url);
    }
    
    throw error;
  }
}

// Cache-first strategy for static assets
async function handleStaticRequest(request) {
  try {
    // Try cache first
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Fallback to network
    const networkResponse = await fetch(request);
    
    // Cache the response
    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // Return offline page for navigation requests
    if (request.destination === 'document') {
      return caches.match('/') || createOfflineResponse();
    }
    
    throw error;
  }
}

// Check if API endpoint should be cached
function shouldCacheApiEndpoint(url) {
  return API_ENDPOINTS.some(endpoint => url.includes(endpoint));
}

// Create offline API response
function createOfflineApiResponse(url) {
  const offlineData = {
    error: 'Offline',
    message: 'No network connection available',
    cached: true,
    timestamp: new Date().toISOString()
  };

  // Customize offline response based on endpoint
  if (url.includes('/status')) {
    offlineData.derivApi = false;
    offlineData.telegramBot = false;
    offlineData.connectedClients = 0;
  } else if (url.includes('/consolidated/active')) {
    offlineData = [];
  } else if (url.includes('/consolidated/status')) {
    offlineData.totalTracked = 0;
    offlineData.activeSignals = 0;
  }

  return new Response(JSON.stringify(offlineData), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-Offline-Response': 'true'
    }
  });
}

// Create basic offline response
function createOfflineResponse() {
  const offlineHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>VIX Signals - Offline</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          margin: 0;
          background: #0f172a;
          color: white;
          text-align: center;
        }
        .offline-container {
          max-width: 400px;
          padding: 2rem;
        }
        .icon {
          font-size: 4rem;
          margin-bottom: 1rem;
        }
        h1 { color: #3b82f6; }
        button {
          background: #3b82f6;
          color: white;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 0.5rem;
          cursor: pointer;
          font-size: 1rem;
          margin-top: 1rem;
        }
        button:hover {
          background: #2563eb;
        }
      </style>
    </head>
    <body>
      <div class="offline-container">
        <div class="icon">📶</div>
        <h1>You're Offline</h1>
        <p>VIX Signal Bot requires an internet connection for live trading data.</p>
        <p>Please check your connection and try again.</p>
        <button onclick="window.location.reload()">Try Again</button>
      </div>
    </body>
    </html>
  `;

  return new Response(offlineHtml, {
    status: 200,
    headers: {
      'Content-Type': 'text/html'
    }
  });
}

// Handle push notifications (future feature)
self.addEventListener('push', event => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body || 'New trading signal available',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    vibrate: [200, 100, 200],
    data: data.data || {},
    actions: [
      {
        action: 'view',
        title: 'View Signal',
        icon: '/icons/icon-96x96.png'
      },
      {
        action: 'dismiss',
        title: 'Dismiss'
      }
    ],
    requireInteraction: true,
    tag: 'vix-signal'
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'VIX Signal Alert', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'view') {
    event.waitUntil(
      clients.openWindow('/?notification=true')
    );
  }
});

console.log('Service Worker: Loaded successfully');