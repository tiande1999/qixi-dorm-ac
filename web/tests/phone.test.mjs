import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {platformHint,embeddedBrowser,notificationGate,ReminderDelivery,reminderEpisode} from '../dist/phone-support.js';

const ready={secure:true,embedded:false,ios:false,standalone:false,supported:true,permission:'granted',worker:'ready'};
const empty={phase:'countdown',emptyId:'1-1',start:10,remaining:60,count:0,trusted:true,door:true,paused:false,eg:true,esp:true,paired:true,learning:null};
test('platform instructions cover iPhone, iPad desktop UA, Android and desktop',()=>{
  assert.equal(platformHint('iPhone OS 18_0',1),'ios');assert.equal(platformHint('Macintosh',5),'ios');
  assert.equal(platformHint('Android 14',5),'android');assert.equal(platformHint('Macintosh',0),'desktop');
  assert.equal(embeddedBrowser('MicroMessenger/8.0'),true);assert.equal(embeddedBrowser('Android Chrome/140 Safari'),false);
});
test('iOS tab cannot request even if Notification API exists',()=>{assert.equal(notificationGate({...ready,ios:true}).code,'install-first');assert.equal(notificationGate({...ready,ios:true,standalone:true}).code,'ready');});
for(const [patch,code] of [[{secure:false},'insecure'],[{embedded:true},'embedded'],[{supported:false},'unsupported'],[{permission:'denied'},'denied'],[{worker:'failed'},'worker-failed'],[{worker:'loading'},'loading'],[{permission:'default'},'ask']])test('notification gate: '+code,()=>assert.equal(notificationGate({...ready,...patch}).code,code));
test('one notification per empty episode, a new episode can notify',async()=>{
  const shown=[];const d=new ReminderDelivery({show:async(...args)=>shown.push(args),clear:async()=>{}});
  d.sync(empty,true);await d.pending;for(let i=0;i<10;i++)d.sync({...empty,remaining:50-i},true);await d.pending;assert.equal(shown.length,1);
  d.sync({...empty,emptyId:'1-2'},true);await d.pending;assert.equal(shown.length,2);
});
test('disabled and invalid occupancy never notify',async()=>{
  let shown=0;const d=new ReminderDelivery({show:async()=>shown++,clear:async()=>{}});
  d.sync(empty,false);assert.equal(shown,0);
  for(const patch of [{count:1},{trusted:false},{door:false},{paused:true},{eg:false},{esp:false},{paired:false},{learning:{}},{phase:'executing'},{remaining:0},{start:null}])assert.equal(reminderEpisode({...empty,...patch}),null);
  d.sync({...empty,count:1},true);await d.pending;assert.equal(shown,0);
});
test('cancel before queued delivery prevents a stale notification',async()=>{
  let shown=0;const d=new ReminderDelivery({show:async()=>shown++,clear:async()=>{}});
  d.sync(empty,true);d.sync({...empty,count:1},true);await d.pending;assert.equal(shown,0);
});
test('late notification completion is cleared after the episode ends',async()=>{
  let release;let clears=0,shown=0;const began=new Promise(resolve=>{
    const d=new ReminderDelivery({show:()=>{shown++;resolve(d);return new Promise(r=>release=r);},clear:async()=>clears++});d.sync(empty,true);
  });
  const d=await began;d.sync({...empty,phase:'executing'},true);release();await d.pending;assert.equal(shown,1);assert.ok(clears>=2);
});
test('notification failure is reported once, never retried every tick',async()=>{
  let errors=0,calls=0;const d=new ReminderDelivery({show:async()=>{calls++;throw Error('blocked');},clear:async()=>{},onError:()=>errors++});
  d.sync(empty,true);await d.pending;d.sync(empty,true);await d.pending;assert.equal(calls,1);assert.equal(errors,1);
});
test('manifest has standalone identity, correct start route and real icon sizes',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../dist/manifest.webmanifest',import.meta.url)));
  assert.equal(manifest.display,'standalone');assert.equal(manifest.scope,'./');assert.equal(manifest.start_url,'./?source=homescreen');
  for(const icon of manifest.icons){const png=await readFile(new URL('../dist/'+icon.src,import.meta.url));assert.equal(png.readUInt32BE(16),Number(icon.sizes.split('x')[0]));assert.equal(png.readUInt32BE(20),Number(icon.sizes.split('x')[1]));}
});
test('notification click focuses existing client and sends only navigation intent',async()=>{
  const handlers={},messages=[];let focused=0,opened=0,closed=0;
  const client={id:'current',url:'https://demo.test/',focus:async()=>focused++,postMessage:m=>messages.push(m)};
  const self={registration:{scope:'https://demo.test/'},addEventListener:(name,fn)=>handlers[name]=fn,clients:{matchAll:async()=>[client],openWindow:async()=>opened++}};
  vm.runInNewContext(await readFile(new URL('../dist/sw.js',import.meta.url),'utf8'),{self,URL});
  let task;handlers.notificationclick({notification:{data:{clientId:'current',kind:'demo'},close:()=>closed++},waitUntil:p=>task=p});await task;
  assert.equal(focused,1);assert.equal(opened,0);assert.equal(closed,1);assert.equal(messages[0].type,'QIXI_OPEN_REMINDER');assert.equal(messages[0].kind,'demo');
});
