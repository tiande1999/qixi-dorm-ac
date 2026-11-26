// Offline demo shell only. No background timer, push subscription or OFF execution.
const CACHE='qixi-demo-shell-v4-1';
const ASSETS=['./','./index.html','./styles.css','./setup.css','./phone.css','./app.js','./store.js','./preferences.js','./setup-ui.js','./phone.js','./phone-support.js','./favicon.svg','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-512.png','./icons/apple-touch-icon.png'];
const assetURLs=new Set(ASSETS.map(p=>new URL(p,self.registration.scope).href));
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
  // Keep updates waiting until existing pages close; don't reset an active demo.
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    for(const key of await caches.keys())if(key.startsWith('qixi-demo-shell-')&&key!==CACHE)await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url),base=new URL(self.registration.scope);
  if(url.origin!==base.origin)return;
  const shellNavigation=event.request.mode==='navigate'&&(url.pathname===base.pathname||url.pathname===base.pathname+'index.html');
  const cleanURL=new URL(url);cleanURL.search='';cleanURL.hash='';
  if(!shellNavigation&&!assetURLs.has(cleanURL.href))return;
  // Network first keeps published edits current; only known demo assets fall back.
  event.respondWith((async()=>{
    try{return await fetch(event.request);}
    catch{
      const cache=await caches.open(CACHE);
      const saved=await cache.match(shellNavigation?new URL('./index.html',base).href:cleanURL.href);
      return saved||Response.error();
    }
  })());
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const scope=new URL(self.registration.scope);
    const client=windows.find(c=>c.id===event.notification.data?.clientId)||windows.find(c=>c.url.startsWith(scope.href));
    if(client){await client.focus();client.postMessage({type:'QIXI_OPEN_REMINDER',kind:event.notification.data?.kind||'demo'});}
    else await self.clients.openWindow(new URL('./?notice=demo#overview',scope).href);
  })());
});
self.addEventListener('message',event=>{
  if(event.data?.type==='QIXI_CLIENT_ID')event.ports[0]?.postMessage({clientId:event.source?.id});
});
