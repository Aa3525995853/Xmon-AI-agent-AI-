/**
 * @file sw.js
 * @description Service Worker - 离线缓存与推送通知处理
 * @module frontend/public
 * @version 2.0.0
 * @date 2026-06-06
 *
 * 缓存策略说明：
 *   - STATIC_CACHE：静态资源（HTML、manifest、图标），使用 stale-while-revalidate 策略
 *   - DYNAMIC_CACHE：CDN 资源和 API 响应，使用 network-first 策略
 *   - MODEL_CACHE：Live2D 模型资源（体积大、变化少），使用 cache-first 策略
 *
 * 路径说明：
 *   - Live2D 资源路径已从 /Neuro_Live2D_Module/ 更新为 /live2d/
 *   - 模型文件：/live2d/Character/Neuro/hiyori_pro_zh/
 *   - SDK 文件：/live2d/assets/live2d_core/
 */

/** 缓存名称（更新时需递增版本号以触发旧缓存清理） */
const CACHE_NAME = 'xiaomeng-v1';
/** 静态资源缓存（HTML、manifest、图标） */
const STATIC_CACHE = 'xiaomeng-static-v1';
/** 动态资源缓存（CDN 资源、API 响应） */
const DYNAMIC_CACHE = 'xiaomeng-dynamic-v1';
/** Live2D 模型资源缓存（体积大，优先使用缓存） */
const MODEL_CACHE = 'xiaomeng-model-v1';

/** 需要预缓存的静态资源列表 */
const STATIC_ASSETS = [
    '/mobile.html',
    '/manifest.webmanifest',
    '/icons/icon-192.png',
    '/icons/icon-512.png'
];

/** CDN 外部资源列表（安装时预缓存） */
const CDN_ASSETS = [
    'https://cdn.jsdelivr.net/npm/pixi.js@7.3.2/dist/pixi.min.js',
    'https://cdn.jsdelivr.net/gh/RaSan147/pixi-live2d-display@v0.4.0-ls-4/dist/cubism4.min.js',
    'https://cdn.socket.io/4.7.2/socket.io.min.js'
];

/**
 * Live2D 模型资源 URL 匹配模式
 * 匹配 /live2d/Character/Neuro/hiyori_pro_zh/ 下的所有模型文件（moc3、纹理、动作等）
 * 使用 cache-first 策略，因为模型文件体积大且很少变化
 */
const MODEL_ASSETS_PATTERN = /\/live2d\/Character\/Neuro\/hiyori_pro_zh\//;

/**
 * Live2D SDK 核心 URL 匹配模式
 * 匹配 /live2d/assets/live2d_core/ 下的 SDK 文件（cubismcore、pixi 等）
 * 使用 cache-first 策略，SDK 版本稳定后不会频繁更新
 */
const MODEL_CORE_PATTERN = /\/live2d\/assets\/live2d_core\//;

/** 可缓存的 API 端点匹配模式（轻量级数据接口） */
const API_CACHE_PATTERN = /^\/api\/(ping|proactive|growth|memory|onboarding)/;
/** API 缓存有效期：5 分钟（单位：毫秒） */
const API_CACHE_DURATION = 5 * 60 * 1000;

self.addEventListener('install', (event) => {
    event.waitUntil(
        Promise.all([
            caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)),
            caches.open(DYNAMIC_CACHE).then((cache) => cache.addAll(CDN_ASSETS))
        ]).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => key !== STATIC_CACHE && key !== DYNAMIC_CACHE && key !== MODEL_CACHE)
                    .map((key) => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    if (request.method !== 'GET') return;

    if (url.protocol === 'ws:' || url.protocol === 'wss:') return;

    if (MODEL_ASSETS_PATTERN.test(url.pathname) || MODEL_CORE_PATTERN.test(url.pathname)) {
        event.respondWith(cacheFirst(request, MODEL_CACHE));
        return;
    }

    if (CDN_ASSETS.includes(request.url)) {
        event.respondWith(cacheFirst(request, DYNAMIC_CACHE));
        return;
    }

    if (STATIC_ASSETS.includes(url.pathname)) {
        event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
        return;
    }

    if (url.origin === self.location.origin && API_CACHE_PATTERN.test(url.pathname)) {
        event.respondWith(networkFirstWithCache(request, DYNAMIC_CACHE, API_CACHE_DURATION));
        return;
    }

    if (url.origin === self.location.origin) {
        event.respondWith(networkFirst(request, DYNAMIC_CACHE));
        return;
    }

    if (url.protocol === 'https:') {
        event.respondWith(networkFirst(request, DYNAMIC_CACHE));
        return;
    }
});

async function cacheFirst(request, cacheName) {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, response.clone());
        }
        return response;
    } catch (e) {
        return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
    }
}

async function networkFirst(request, cacheName) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, response.clone());
        }
        return response;
    } catch (e) {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.headers.get('Accept')?.includes('text/html')) {
            return caches.match('/mobile.html');
        }
        return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
    }
}

async function networkFirstWithCache(request, cacheName, maxAge) {
    const cached = await caches.match(request);
    if (cached) {
        const dateHeader = cached.headers.get('sw-cache-date');
        if (dateHeader && Date.now() - parseInt(dateHeader) < maxAge) {
            return cached;
        }
    }
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(cacheName);
            const headers = new Headers(response.headers);
            headers.set('sw-cache-date', Date.now().toString());
            const cachedResponse = new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers
            });
            cache.put(request, cachedResponse);
            return response;
        }
        return cached || response;
    } catch (e) {
        if (cached) return cached;
        return new Response(JSON.stringify({ error: 'Offline' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

async function staleWhileRevalidate(request, cacheName) {
    const cached = await caches.match(request);
    const fetchPromise = fetch(request).then(async (response) => {
        if (response.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, response.clone());
        }
        return response;
    }).catch(() => cached);

    return cached || fetchPromise;
}

self.addEventListener('push', (event) => {
    let data = { title: '小梦', body: '你有新的消息', icon: '/icons/icon-192.png' };

    if (event.data) {
        try {
            data = { ...data, ...event.data.json() };
        } catch (e) {
            data.body = event.data.text() || data.body;
        }
    }

    const options = {
        body: data.body,
        icon: data.icon || '/icons/icon-192.png',
        badge: '/icons/icon-72.png',
        vibrate: [100, 50, 100],
        data: {
            url: data.url || '/mobile.html',
            type: data.type || 'message'
        },
        actions: data.actions || [
            { action: 'open', title: '查看' },
            { action: 'dismiss', title: '忽略' }
        ],
        tag: data.tag || 'xiaomeng-notification',
        renotify: true
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    if (event.action === 'dismiss') return;

    const urlToOpen = event.notification.data?.url || '/mobile.html';

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url.includes('mobile.html') && 'focus' in client) {
                    client.navigate(urlToOpen);
                    return client.focus();
                }
            }
            return self.clients.openWindow(urlToOpen);
        })
    );
});

self.addEventListener('pushsubscriptionchange', (event) => {
    event.waitUntil(
        self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: self.vapidPublicKey
        }).then((subscription) => {
            return fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(subscription)
            });
        })
    );
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    if (event.data && event.data.type === 'VAPID_KEY') {
        self.vapidPublicKey = event.data.key;
    }
});
