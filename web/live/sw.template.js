const PREFIX = 'habitat-live:' + self.registration.scope + ':';
const CACHE = PREFIX + 'ASSET_HASH';
const ASSETS = ASSET_LIST;
const urls = new Set(ASSETS.map(asset => new URL(asset,self.registration.scope).href));
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const name of await caches.keys()) if(name.startsWith(PREFIX)&&name!==CACHE) await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET') return;
  const url=new URL(request.url), scope=new URL(self.registration.scope);
  const shell=request.mode==='navigate' && url.origin===scope.origin &&
    (url.pathname===scope.pathname || url.pathname===scope.pathname+'index.html');
  if(!shell&&!urls.has(request.url)) return;
  // Only exact static shell URLs are eligible. Application API responses never enter this cache.
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    return (await cache.match(shell?new URL('./index.html',scope).href:request)) || fetch(request);
  })());
});
