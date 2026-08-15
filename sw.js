const CACHE_VERSION='ralf-music-v5.0.1';
const SHELL_CACHE=CACHE_VERSION+'-shell';
const RUNTIME_CACHE=CACHE_VERSION+'-runtime';
const COVER_CACHE=CACHE_VERSION+'-covers';
const JSON_CACHE=CACHE_VERSION+'-json';

const SHELL=[
  '/',
  '/index.html',
  '/manifest.json',
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
    await Promise.all(
      keys
        .filter(k=>k.startsWith('ralf-music-')&&!keep.has(k))
        .map(k=>caches.delete(k))
    );
    await self.clients.claim();
  })());
});

async function networkFirst(request,cacheName){
  const cache=await caches.open(cacheName);
  try{
    const response=await fetch(request);
    if(response&&response.ok) await cache.put(request,response.clone());
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
  const network=fetch(request).then(async response=>{
    if(response&&(response.ok||response.type==='opaque')){
      try{ await cache.put(request,response.clone()); }catch{}
    }
    return response;
  }).catch(()=>null);
  return cached||network||Response.error();
}

async function cacheFirst(request,cacheName){
  const cache=await caches.open(cacheName);
  const cached=await cache.match(request);
  if(cached) return cached;
  const response=await fetch(request);
  if(response&&(response.ok||response.type==='opaque')){
    try{ await cache.put(request,response.clone()); }catch{}
  }
  return response;
}

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET') return;

  const url=new URL(request.url);
  const path=url.pathname.toLowerCase();

  // WICHTIG: MP3s vollständig dem Browser überlassen.
  // Kein respondWith(), kein Cache, kein Service-Worker-Proxying.
  if(path.endsWith('.mp3')) return;

  if(url.origin===self.location.origin &&
     (url.pathname==='/songs.json'||url.pathname==='/categories.json')){
    event.respondWith(networkFirst(request,JSON_CACHE));
    return;
  }

  if(url.hostname==='raw.githubusercontent.com' &&
     url.pathname.includes('/assets/covers/') &&
     path.endsWith('.png')){
    event.respondWith(cacheFirst(request,COVER_CACHE));
    return;
  }

  if(url.hostname==='cdn.tailwindcss.com'){
    event.respondWith(staleWhileRevalidate(request,RUNTIME_CACHE));
    return;
  }

  if(url.origin===self.location.origin &&
     (url.pathname==='/' ||
      url.pathname==='/index.html' ||
      url.pathname==='/manifest.json' ||
      url.pathname.startsWith('/assets/') ||
      url.pathname==='/editor.js')){
    event.respondWith(staleWhileRevalidate(request,SHELL_CACHE));
  }
});
