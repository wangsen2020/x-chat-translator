// Only the post-cache store is exercised, in a fresh browser storage context.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
(async()=>{
  const browser = await chromium.connectOverCDP(process.env.CDP_URL || 'http://127.0.0.1:9222');
  const ctx = await browser.newContext();
  try {
    await ctx.route('https://xct-cache.test/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html>'}));
    const page = await ctx.newPage();
    const script = path.join(__dirname,'..','post-cache.js');
    await page.goto('https://xct-cache.test/');await page.addScriptTag({path:script});
    await page.evaluate(async()=>{
      const cache=XCTPostCache, scope=cache.scope({address:'http://127.0.0.1:8787',provider:'codex',sessionId:'a'});
      const entries=await Promise.all(Array.from({length:205},async(_,i)=>({
        key:await cache.key(scope,'en','source '+i),translation:'translation '+i
      })));
      await cache.save(entries);
    });
    await page.reload();await page.addScriptTag({path:script});
    const result = await page.evaluate(async()=>{
      const operations={get:0,cursor:0,all:0,put:0};
      for(const [method,counter] of [['get','get'],['openCursor','cursor'],['getAll','all'],['put','put']]){
        const original=IDBObjectStore.prototype[method];
        IDBObjectStore.prototype[method]=function(...args){operations[counter]++;return original.apply(this,args);};
      }
      const config={address:'http://127.0.0.1:8787',provider:'codex',sessionId:'a'};
      async function read(binding,lang='en',text='source 10'){
        const [row]=await XCTPostCache.lookup(XCTPostCache.scope(binding),lang,[{id:'fresh-id',text}]);
        return row.translation || null;
      }
      const outcomes=await Promise.all([
        read({...config,revision:'new',token:'changed'}),read({...config,sessionId:'b'}),
        read({...config,provider:'antigravity'}),read({...config,address:'http://127.0.0.1:8080'}),
        read(null),read(config,'ja'),read(config,'en','source 10!'),
      ]);
      return {operations,outcomes};
    });
    assert.deepEqual(result.outcomes,['translation 10',null,null,null,null,null,null]);
    assert.deepEqual(result.operations,{get:7,cursor:0,all:0,put:0});
    console.log('PASS: persisted after reload, independent service/engine/session/language/text, seven primary-key reads with zero scans or writes');
  } finally {await ctx.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
