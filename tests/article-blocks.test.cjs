// Article-only increment: real Chromium layout, no remote translation or writes.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
 const browser=await chromium.connectOverCDP(process.env.CDP_URL||'http://127.0.0.1:9222');
 const context=await browser.newContext({viewport:{width:1000,height:700}}),page=await context.newPage();
 const root=path.join(__dirname,'..');
 try{
  const block=(id,text,tag='div')=>`<${tag} data-block="true"><div class="public-DraftStyleDefault-block" id="${id}">${text}</div></${tag}>`;
  const html=`<!doctype html><style>body{margin:0;color:#e7e9ea;background:#101214;font:16px/1.5 system-ui}main{max-width:650px;margin:auto}.public-DraftStyleDefault-block{padding:20px;min-height:150px}#spacer{height:1600px}</style>
   <main data-testid="primaryColumn"><article data-testid="twitterArticleReadView"><h1>Article title outside the body</h1><div data-testid="twitterArticleRichTextView"><div data-testid="longformRichTextComponent" contenteditable="false"><div data-contents="true">
   ${block('first','First visible paragraph.')}<div id="spacer"></div>${block('second','Second paragraph after scrolling.')}
   <section data-block="true">Video controls ${block('caption','Embedded media caption must stay untouched.')}</section>
   ${block('third','Third paragraph.')}${Array.from({length:220},(_,i)=>block('far-'+i,'Unseen paragraph '+i)).join('')}
   </div></div></div></article></main>`;
  await page.route('https://article-fixture.test/**',r=>r.fulfill({contentType:'text/html',body:html}));
  await page.goto('https://article-fixture.test/author/status/123');
  await page.evaluate(()=>{
   window.calls=[];window.reads={};window.listeners=[];window.prefs={incomingLanguage:'zh-CN'};
   const clone=Element.prototype.cloneNode;
   Element.prototype.cloneNode=function(...args){if(this.id)reads[this.id]=(reads[this.id]||0)+1;return clone.apply(this,args)};
   window.chrome={runtime:{sendMessage:async()=>({})},storage:{local:{get:async()=>({...prefs})},onChanged:{addListener:f=>listeners.push(f),removeListener:f=>listeners.splice(listeners.indexOf(f),1)}}};
   window.change=values=>{Object.assign(prefs,values);listeners.forEach(fn=>fn(Object.fromEntries(Object.entries(values).map(([k,v])=>[k,{newValue:v}])),'local'))};
   window.xctTranslationService={available:()=>true,languages:[['zh-CN','Chinese']],translate:async(text,language,scene)=>{calls.push({text,language,scene});return '译文：'+text}};
  });
  for(const file of ['i18n.js','relay-client.js','posts.js'])await page.addScriptTag({path:path.join(root,file)});
  await page.addStyleTag({path:path.join(root,'posts.css')});
  await page.waitForFunction(()=>calls.length===1);
  await page.waitForTimeout(300);
  assert.deepEqual(await page.evaluate(()=>calls.map(c=>c.text)),['First visible paragraph.']);
  assert.equal(await page.evaluate(()=>calls.every(c=>c.scene==='article')),true);
  assert.equal(await page.evaluate(()=>reads.second||0),0);
  assert.equal(await page.evaluate(()=>Object.keys(reads).some(id=>id.startsWith('far-'))),false);
  assert.equal(await page.locator('.xct-post-translation').count(),1);
  await page.locator('#second').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>calls.some(c=>c.text==='Second paragraph after scrolling.'));
  assert.equal(await page.evaluate(()=>calls.some(c=>c.text.includes('Unseen')||c.text.includes('Video controls')||c.text.includes('media caption'))),false);
  const count=await page.evaluate(()=>calls.length);
  await page.locator('#first').scrollIntoViewIfNeeded();await page.waitForTimeout(300);
  assert.equal(await page.evaluate(()=>calls.length),count);
  await page.locator('#first').evaluate(n=>n.textContent='Edited visible paragraph.');
  await page.waitForFunction(()=>calls.some(c=>c.text==='Edited visible paragraph.'));
  await page.evaluate(()=>change({postDisplayMode:'replace'}));
  await page.waitForFunction(()=>document.querySelector('#first').hasAttribute('data-xct-original-hidden'));
  assert.equal(await page.locator('#first').isVisible(),false);
  await page.locator('.xct-post-translation').first().getByRole('button',{name:'Show original'}).click();
  assert.equal(await page.locator('#first').isVisible(),true);
  // Detail-only gate: feed previews and the article editor must never submit.
  for(const pathname of ['/home','/i/articles/new']){
   await page.evaluate(p=>{history.pushState({},'',p);dispatchEvent(new Event('scroll'))},pathname);
   await page.waitForTimeout(250);await page.evaluate(()=>change({postsEnabled:false}));await page.evaluate(()=>change({postsEnabled:true}));
   const before=await page.evaluate(()=>calls.length);await page.waitForTimeout(300);
   assert.equal(await page.evaluate(()=>calls.length),before);assert.equal(await page.locator('.xct-post-translation').count(),0);
  }
  await page.evaluate(()=>{history.pushState({},'','/author/article/123');dispatchEvent(new Event('scroll'))});
  await page.waitForFunction(()=>!!document.querySelector('.xct-post-translation'));
  await page.evaluate(()=>xctPostTranslations.stop());assert.equal(await page.locator('.xct-post-translation').count(),0);
  // Scrolling away during local detection must defer the outgoing request.
  await page.evaluate(()=>{
   window.holdDetection=true;
   chrome.i18n={detectLanguage:async()=>{if(holdDetection)await new Promise(resolve=>window.finishDetection=resolve);return {isReliable:false,languages:[]}}};
   scrollTo(0,0);
  });
  const beforeDeferred=await page.evaluate(()=>calls.length);
  await page.addScriptTag({path:path.join(root,'posts.js')});
  await page.waitForFunction(()=>typeof finishDetection==='function');
  await page.evaluate(()=>{scrollTo(0,1000);holdDetection=false;finishDetection()});
  await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>calls.length),beforeDeferred);
  await page.locator('#first').scrollIntoViewIfNeeded();
  await page.waitForFunction(n=>calls.length===n+1,beforeDeferred);
  await page.evaluate(()=>xctPostTranslations.stop());
  // Exercise the actual Google worker and bounded IndexedDB cache, then
  // reload the page to distinguish persistent cache hits from memory reuse.
  const setupWorker=()=>{
   window.googleFetches=0;window.scans=0;window.workers=[];
   for(const method of ['openCursor','getAll'])IDBObjectStore.prototype[method]=()=>{scans++;throw Error('Unexpected cache scan')};
   window.fetch=async url=>{googleFetches++;return {ok:true,json:async()=>[[['Cached translation: '+new URL(url).searchParams.get('q')]]]}};
   window.chrome={runtime:{id:'fixture',onMessage:{addListener:fn=>workers.push(fn)}}};
   window.google=(scene,text='Same text in post and article')=>new Promise(resolve=>workers[0]({type:'XCT_POST_GOOGLE',scene,text,language:'zh-CN'},{id:'fixture',url:'https://x.com/a/status/123',frameId:0},resolve));
  };
  await page.evaluate(setupWorker);
  for(const file of ['post-cache.js','background.js'])await page.addScriptTag({path:path.join(root,file)});
  assert.equal((await page.evaluate(()=>google('post'))).ok,true);
  assert.equal((await page.evaluate(()=>google('article'))).ok,true);
  assert.equal(await page.evaluate(()=>googleFetches),2);
  assert.equal((await page.evaluate(()=>google('article'))).ok,true);
  assert.equal(await page.evaluate(()=>googleFetches),2);
  await page.reload();await page.evaluate(setupWorker);
  for(const file of ['post-cache.js','background.js'])await page.addScriptTag({path:path.join(root,file)});
  assert.equal((await page.evaluate(()=>google('article'))).ok,true);
  assert.equal(await page.evaluate(()=>googleFetches),0);
  assert.equal(await page.evaluate(()=>scans),0);
  await page.evaluate(async()=>{
   const db=await new Promise(resolve=>{const r=indexedDB.open('xct-relay',1);r.onupgradeneeded=()=>r.result.createObjectStore('records');r.onsuccess=()=>resolve(r.result)});
   await new Promise(resolve=>{const tx=db.transaction('records','readwrite');tx.objectStore('records').put({apiKey:'fixture-key',model:'gemini-flash-lite-latest'},'gemini:config');tx.oncomplete=resolve});db.close();
   window.geminiNetwork=0;window.articleConfigured=true;
   chrome.runtime.getURL=p=>'chrome-extension://fixture/'+p;
   chrome.storage={local:{get:async()=>({postEngine:{kind:'gemini',revision:'post'},...(articleConfigured?{articleEngine:{kind:'gemini',revision:'article'}}:{})})}};
   window.fetch=async()=>{geminiNetwork++;return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({items:[{id:'block',translation:'Gemini block translation'}]})}]}}]})}};
   window.gemini=(scene,revision=scene)=>new Promise(resolve=>{for(const fn of workers)if(fn({type:'XCT_GEMINI_BATCH',scene,revision,language:'zh-CN',items:[{id:'block',text:'Gemini source block'}]},{id:'fixture',url:'https://x.com/a/status/123',tab:{id:1},frameId:0},resolve))break});
  });
  for(const file of ['relay-client.js','gemini-worker.js'])await page.addScriptTag({path:path.join(root,file)});
  assert.equal((await page.evaluate(()=>gemini('post'))).ok,true);
  assert.equal((await page.evaluate(()=>gemini('article'))).ok,true);
  assert.equal(await page.evaluate(()=>geminiNetwork),2);
  assert.equal((await page.evaluate(()=>gemini('article'))).ok,true);
  assert.equal(await page.evaluate(()=>geminiNetwork),2);
  assert.equal((await page.evaluate(()=>gemini('article','post'))).error,'relayStale');
  await page.evaluate(()=>articleConfigured=false);
  assert.equal((await page.evaluate(()=>gemini('article','post'))).ok,true);
  assert.equal(await page.evaluate(()=>geminiNetwork),2);
  console.log('PASS: article details only; viewport blocks collected on demand; 220 unseen blocks never read or sent; scrolling dedupes; media excluded; edits, replace/original, SPA routes and cleanup.');
  console.log('PASS: article request category, post/article cache separation, reuse after page reload, zero translation fetches on hit and zero IndexedDB scans.');
  console.log('PASS: Gemini article engine routing, separate category cache, cached reuse, stale-revision protection and legacy post-engine inheritance.');
 }finally{await context.close();await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
