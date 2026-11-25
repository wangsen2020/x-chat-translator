const {chromium}=require('playwright');const fs=require('fs'),path=require('path'),assert=require('assert/strict');
(async()=>{const b=await chromium.connectOverCDP(process.env.CDP_URL||'http://127.0.0.1:9222'),ctx=await b.newContext(),p=await ctx.newPage();try{
await p.route('https://relay-recovery.test/**',r=>r.fulfill({contentType:'text/html',body:'<meta charset=utf-8>'}));await p.goto('https://relay-recovery.test/');
await p.evaluate(()=>{
 window.replies=[];window.posts=[];window.queries=[];window.mode='offline';window.handlers=[];
 window.chrome={runtime:{id:'test',getURL:()=>location.href,onMessage:{addListener:f=>handlers.push(f)},onStartup:{addListener(){}}},storage:{local:{get:async()=>({}),set:async()=>{}}},alarms:{create:async()=>{},clear:async()=>{},onAlarm:{addListener(){}}}};
 window.fetch=async(url,init)=>{
  const pathname=new URL(url).pathname;
  if(mode==='offline')throw Error('offline');
  if(pathname==='/health')return {ok:true,json:async()=>({service:'agent-relay'})};
  if(init.method==='POST'){posts.push(JSON.parse(init.body));if(mode==='lost')throw Error('ack lost');return {ok:true,json:async()=>({status:'queued'})};}
  queries.push(pathname);
  let result={status:'running'};
  if(mode==='failed')result={status:'unknown',error:'codex_error',turnId:'native-failed',message:'Codex turn failed'};
  if(mode==='uncertain')result={status:'unknown',error:'codex_error',turnId:'native-unknown',message:'Codex turn timed out; result unknown'};
  if(mode==='done')result={status:'completed',result:{text:JSON.stringify({items:posts.at(-1).text.split('\n').at(-1) ? JSON.parse(posts.at(-1).text.split('\n').at(-1)).map(i=>({id:i.id,translation:'translated '+i.id})):[]})}};
  return {ok:true,json:async()=>result};
 };
 window.request=m=>new Promise(resolve=>handlers[0](m,{id:'test',url:location.href},resolve));
});
for(const name of ['post-cache.js','relay-client.js','relay-worker.js'])await p.addScriptTag({path:path.join(__dirname,'..',name)});
const result=await p.evaluate(async()=>{
 const draft={address:'http://127.0.0.1:8787',token:'fixture',provider:'codex',sessionId:'fixture-session'};
 const payload=id=>({type:'XCT_BATCH_START',jobId:id,items:[{id:'one',text:'original'}],language:'en',draft});
 const first=crypto.randomUUID(),second=crypto.randomUUID();
 const offline=await request(payload(first));
 mode='running';const accepted=await request(payload(first));
 mode='failed';const recovery=payload(second);recovery.items[0].text='second source';const recovered=await request(recovery);
 mode='uncertain';const next=payload(crypto.randomUUID());next.items[0].text='different';const blocked=await request(next);
 const stillUnknown=await request({type:'XCT_BATCH_QUERY',jobId:second});
 mode='done';const done=await request({type:'XCT_BATCH_QUERY',jobId:second});
 // A dispatched request whose response was lost must retain its receipt.
 mode='lost';const third=crypto.randomUUID();await request(payload(third));
 mode='running';await request(payload(third));
 const counts={first:posts.filter(p=>p.jobId===first).length,second:posts.filter(p=>p.jobId===second).length,third:posts.filter(p=>p.jobId===third).length};
 return {offline,accepted,recovered,blocked,stillUnknown,done,counts};
});
assert.equal(result.offline.error,'relayOffline');assert(result.accepted.ok);assert(result.recovered.ok);
assert.equal(result.blocked.error,'relayPriorPending');assert.equal(result.stillUnknown.value.status,'unknown');
assert.equal(result.done.value.status,'completed');assert.deepEqual(result.counts,{first:1,second:1,third:1});
console.log('PASS: offline startup retry, native failure unlock, genuine unknown retained, lost response does not resubmit',JSON.stringify(result.counts));
}finally{await ctx.close();await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});


