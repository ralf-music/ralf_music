const CACHE_VERSION='ralf-alpha-v0.1.2';
const SHELL_CACHE=CACHE_VERSION+'-shell';
const RUNTIME_CACHE=CACHE_VERSION+'-runtime';
const COVER_CACHE=CACHE_VERSION+'-covers';
const JSON_CACHE=CACHE_VERSION+'-json';

const SHELL=[
  '/alpha/',
  '/alpha/index.html',
  '/alpha/manifest.json',
  '/assets/favicon.png',
  '/assets/logo-banner.png',
  '/assets/pwa/icon-180.png',
  '/assets/pwa/icon-192.png',
  '/assets/pwa/icon-512.png'
];

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(SHELL_CACHE);
    await Promise.allSettled(SHELL.map(url=>cache.add(url)));
    self.skipWaiting();
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keep=new Set([SHELL_CACHE,RUNTIME_CACHE,COVER_CACHE,JSON_CACHE]);
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k.startsWith('ralf-alpha-')&&!keep.has(k)).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

async function networkFirst(request,cacheName){
  const cache=await caches.open(cacheName);
  try{
    const response=await fetch(request);
    if(response&&response.ok) cache.put(request,response.clone());
    return response;
  }catch(err){
    const cached=await cache.match(request);
    if(cached) return cached;
    throw err;
  }
}

async function staleWhileRevalidate(request,cacheName){
  const cache=await caches.open(cacheName);
  const cached=await cache.match(request);
  const network=fetch(request).then(response=>{
    if(response&&(response.ok||response.type==='opaque')) cache.put(request,response.clone());
    return response;
  }).catch(()=>null);
  return cached||network||Response.error();
}

async function cacheFirst(request,cacheName){
  const cache=await caches.open(cacheName);
  const cached=await cache.match(request);
  if(cached) return cached;
  const response=await fetch(request);
  if(response&&(response.ok||response.type==='opaque')) cache.put(request,response.clone());
  return response;
}

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET') return;
  const url=new URL(request.url);

  // MP3s werden absichtlich niemals über den Service Worker gecacht.
  if(url.pathname.toLowerCase().endsWith('.mp3')){
    event.respondWith(fetch(request));
    return;
  }

  // Song- und Kategoriedaten: aktuelle Netzwerkversion, Cache nur als Fallback.
  if(url.origin===self.location.origin&&(url.pathname.endsWith('/songs.json')||url.pathname.endsWith('/categories.json'))){
    event.respondWith(networkFirst(request,JSON_CACHE));
    return;
  }

  // Cover on demand cachen. Keine Playlist-Vorladung.
  if(url.hostname==='raw.githubusercontent.com'&&url.pathname.includes('/assets/covers/')&&url.pathname.toLowerCase().endsWith('.png')){
    event.respondWith(cacheFirst(request,COVER_CACHE));
    return;
  }

  // Tailwind-CDN nach erfolgreichem Erstabruf für spätere Offline-Starts behalten.
  if(url.hostname==='cdn.tailwindcss.com'){
    event.respondWith(staleWhileRevalidate(request,RUNTIME_CACHE));
    return;
  }

  // Alpha-App-Shell und lokale statische Assets.
  if(url.origin===self.location.origin&&(url.pathname.startsWith('/alpha/')||url.pathname.startsWith('/assets/'))){
    event.respondWith(staleWhileRevalidate(request,SHELL_CACHE));
  }
});
