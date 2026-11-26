import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync, readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {MockAdapter} from '../dist/store.js';

const root = new URL('../',import.meta.url);
const output = mode => new URL('../../artifacts/habitat-'+mode+'/',import.meta.url);
for (const mode of ['demo','live']) {
  execFileSync(process.execPath,[fileURLToPath(new URL('build.mjs',root)),mode],
    {env:{...process.env,HABITAT_GATEWAY_PATH:''}});
}
const {QuecCloudAdapter,normalizeSnapshot,canSubmit,fresh,serviceRequest,toServiceReferences}
  = await import(new URL('provider.js',output('live')));
const {MODEL} = await import(new URL('model.js',output('live')));
const now=Date.parse('2026-11-26T09:00:00Z');
const raw=(overrides={})=>({deviceId:'test-device',sequence:1,reportedAt:new Date(now).toISOString(),
  platformOnline:true,properties:{1:0,2:1,3:1,4:0,5:7,6:0,7:1,8:false,10:true,11:'boot-a',12:false},...overrides});
const session={accountId:'test-account', device:{id:'test-device',capacity:6},services:['calibrate_count','pause_control','cancel_shutdown','confirm_shutdown']};
const response=(body,status=200)=>new Response(JSON.stringify(body),{status});
const adapter=fetcher=>new QuecCloudAdapter('/api/habitat',{fetcher,now:()=>now,uuid:()=>'request-1'});

test('builds have distinct identities and Live excludes demo runtime',()=>{
  const manifests=['demo','live'].map(mode=>JSON.parse(readFileSync(new URL('manifest.webmanifest',output(mode)))));
  assert.notEqual(manifests[0].id,manifests[1].id);
  const live=readdirSync(output('live'));
  for(const file of ['app.js','store.js','phone.js','preferences.js'])assert.ok(!live.includes(file));
  assert.match(readFileSync(new URL('config.js',output('live')),'utf8'),/GATEWAY_PATH = ""/);
  assert.doesNotMatch(readFileSync(new URL('sw.js',output('live')),'utf8'),/BackgroundSync|\/api\//);
});

test('XLS model contains all 35 definitions and valid property references',()=>{
  assert.equal(MODEL.length,35);
  assert.equal(new Set(MODEL.map(x=>x.id)).size,35);
  assert.equal(MODEL.filter(x=>x.kind==='EVENT').length,4);
  for(const item of MODEL.filter(x=>x.kind==='SERVICE'||x.kind==='EVENT')) {
    const refs=toServiceReferences(item);
    assert.equal(refs.inputData.length,item.input?.length??0);
    assert.equal(refs.outputData.length,item.output.length);
  }
  assert.deepEqual(toServiceReferences(MODEL.find(x=>x.id===13)).inputData[0],{$ref:'#/properties/id/23'});
  assert.throws(()=>toServiceReferences({input:[13]}),/bad_model_reference/);
});

test('manual Demo waits 900 seconds and needs confirmation or veto',()=>{
  const demo=new MockAdapter({roomCapacity:4,mode:'manual'});
  demo.reset('manual');
  demo.advance(2.2);
  demo.act('confirm');
  assert.equal(demo.s.command,null);
  demo.advance(903);
  assert.equal(demo.s.phase,'awaiting');
  assert.equal(demo.s.ac,'running');
  demo.act('enter');
  demo.act('confirm');
  assert.equal(demo.s.command,null);
  demo.reset('manual');
  demo.advance(903);
  demo.act('cancel');
  demo.advance(100);
  assert.equal(demo.s.command,null);
  demo.reset('manual');
  demo.advance(903);
  demo.act('confirm');
  demo.advance(5);
  assert.equal(demo.s.phase,'success');
});

test('Live starts without network or occupancy when unconfigured',async()=>{
  let calls=0;
  const client=new QuecCloudAdapter('',{fetcher:()=>{calls++;}});
  await assert.rejects(client.refresh(),/unconfigured/);
  assert.equal(calls,0);
  assert.equal(client.snapshot,null);
});

test('normalization preserves zero and false only with valid provenance',()=>{
  assert.equal(normalizeSnapshot(raw()).count,0);
  assert.equal(normalizeSnapshot(raw()).simState,null);
  assert.equal(normalizeSnapshot(raw({simFeedbackVerified:true})).simState,false);
  const ambiguous=normalizeSnapshot(raw({properties:{1:0,2:2,6:901,7:1,8:'false'}}));
  assert.equal(ambiguous.count,null);
  assert.equal(ambiguous.countdown,null);
  assert.equal(ambiguous.simState,null);
  assert.equal(fresh(normalizeSnapshot(raw({platformOnline:false})),now),false);
  assert.equal(fresh(normalizeSnapshot(raw()),now+91_000),false);
});

test('services bind the latest session, state, request ID and task expiry',()=>{
  const snapshot=normalizeSnapshot(raw({currentTask:{id:'task',expiresAt:new Date(now+5_000).toISOString(),bootSession:'boot-a',stateVersion:7}}));
  const command=serviceRequest('cancel_shutdown',{},session,snapshot,now,'req');
  assert.equal(command.serviceId,15);
  assert.deepEqual(command.params,{shutdown_request_id:'task',request_id:'req',expected_boot_session:'boot-a',
    expected_state_version:7,expires_at:new Date(now+5_000).toISOString()});
  assert.equal(canSubmit('cancel_shutdown',session,snapshot,now+5_001),false);
  assert.equal(canSubmit('confirm_shutdown',session,snapshot,now),false);
  assert.equal(canSubmit('cancel_shutdown',session,normalizeSnapshot(raw()),now),false);
  assert.throws(()=>serviceRequest('calibrate_count',{target_count:7},session,snapshot,now,'req'),/invalid_count/);
});

test('no private read before session, ACL failures clear data, old sessions cannot replace new',async()=>{
  const seen=[];
  let status=200, sample=raw();
  const client=adapter(async (route,options)=>{
    seen.push(route);
    assert.equal(options.cache,'no-store');
    if(route.endsWith('/session'))return response(session,status);
    return response(sample);
  });
  status=401;
  await assert.rejects(client.refresh(),/authentication/);
  assert.deepEqual(seen,['/api/habitat/session']);
  status=200;
  await client.refresh();
  sample=raw({sequence:2,properties:{...raw().properties,5:1,11:'boot-b'}});
  await client.refresh();
  sample=raw({sequence:3});
  assert.equal((await client.refresh()).boot,'boot-b');
  status=403;
  await assert.rejects(client.refresh(),/forbidden/);
  assert.equal(client.snapshot,null);
  status=200;
  sample=raw({deviceId:'different-device'});
  await assert.rejects(client.refresh(),/forbidden/);
  assert.equal(client.session,null);
});

test('only one in-flight service, acknowledgement distinct from outcome, no retry on network failure',async()=>{
  let writes=0, rejectWrite;
  const client=adapter(async (route,options)=>{
    if(route.endsWith('/session')) return response(session);
    if(route.endsWith('/snapshot')) return response(raw());
    if(options.method==='POST'){
      writes++;
      assert.equal(JSON.parse(options.body).serviceId,16);
      return new Promise((_,reject)=>{rejectWrite=reject;});
    }
    return response({requestId:'request-1',status:'accepted'});
  });
  await client.refresh();
  const write=client.submit('pause_control');
  await assert.rejects(client.submit('pause_control'),/busy/);
  rejectWrite(new Error('network'));
  assert.equal((await write).status,'unknown');
  assert.equal(writes,1);
  assert.equal((await client.result('request-1')).status,'accepted');
  assert.equal(client.snapshot.paused,false);
});
