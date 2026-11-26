// Focused reply-module acceptance. All translation and publishing traffic stays in this fixture.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const output = process.env.XCT_REPLY_OUTPUT;
(async () => {
  const browser = await chromium.connectOverCDP(process.env.CDP_URL || 'http://127.0.0.1:9222');
  const context = await browser.newContext({viewport:{width:1280,height:900}});
  const page = await context.newPage();
  try {
    await page.route('https://xct-reply-fixture.test/**', route => route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><style>
      *{box-sizing:border-box}html{color-scheme:dark}body{margin:0;background:#000;color:#e7e9ea;font:16px/1.5 system-ui}.composer{max-width:600px;margin:40px auto;padding:20px;border:1px solid #333}h1{font-size:20px;margin:0 0 20px}.post{padding-bottom:20px;border-bottom:1px solid #333}.DraftEditor-root{margin-top:20px;min-height:50px}[contenteditable]{min-height:50px;white-space:pre-wrap;outline:none}.actions{display:flex;justify-content:flex-end;padding-top:12px}.actions button{background:#eff3f4;color:#0f1419;border:0;border-radius:20px;padding:8px 20px;font-weight:700}
      </style></head><body><main class="composer"><h1>Reply</h1><article class="post">Thank you for sharing your experience with this translation tool.</article><div class="DraftEditor-root"><div contenteditable="true" role="textbox" aria-label="Reply text" data-testid="tweetTextarea_0"></div></div><div class="actions"><button data-testid="tweetButtonInline">Reply</button></div></main></body></html>`}));
    await page.goto('https://xct-reply-fixture.test/');
    await page.clock.install();
    await page.evaluate(() => {
      window.prefs = {}; window.listeners = new Set(); window.translationCalls = []; window.wire = []; window.nativeCalls = 0; window.geminiCalls = [];
      window.nativeKeyCount = 0; window.nativeText = ''; window.postId = '123456789'; window.relayAnswer = {status:'running'}; window.relayCalls = [];
      self.LanguageDetector = {
        availability: async () => window.mockDetectorAvailability || 'unavailable',
        create: async () => ({ detect: async () => window.mockDetectorResult || [{ detectedLanguage: 'vi', confidence: 0.95 }] }),
      };
      window.responseData = () => ({data:{create_tweet:{tweet_results:{result:{rest_id:'987654321',legacy:{in_reply_to_status_id_str:postId}}}}}});
      window.setPrefs = async values => {
        const changes = Object.fromEntries(Object.entries(values).map(([key,newValue]) => [key,{newValue,oldValue:prefs[key]}]));
        Object.assign(prefs,values); for (const listener of listeners) listener(changes,'local');
      };
      window.chrome = {runtime:{id:'fixture',sendMessage:async m => {
        relayCalls.push(m);
        if (m.type === 'XCT_GEMINI_BATCH') {
          window.geminiCalls.push(m.items.map(i => i.text).join(''));
          if (window.holdGemini) await new Promise(resolve => window.releaseGemini = resolve);
          return {ok:true,value:m.items.map(i => ({id:i.id, translation:'gemini:' + i.text}))};
        }
        if (m.type === 'XCT_SWITCH_SCENE_ENGINE') {
          const next = {kind:m.kind, revision:'sw1'};
          await setPrefs({replyEngine:next});
          return {ok:true, value:next};
        }
        if (m.type === 'XCT_BATCH_LOOKUP') return {ok:true,value:window.relayCached || []};
        if (m.type === 'XCT_BATCH_START') return {ok:true,value:{status:'query'}};
        return {ok:true,value:relayAnswer};
      }},i18n:{getUILanguage:()=>'en',getMessage:()=>'',detectLanguage:async()=>window.detected || {isReliable:true,languages:[{language:'en',percentage:100}]}},
        storage:{local:{get:async()=>({...prefs}),set:setPrefs},onChanged:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)}}};
      window.xctTranslationService = {available:()=>true,translate:async(source,language)=> {
        translationCalls.push({source,language});
        if (window.holdTranslation) await new Promise(resolve=>window.releaseTranslation=resolve);
        return language + ': ' + source;
      }};
      const input = document.querySelector('[contenteditable]');
      const fiber = {memoizedProps:{editorState:{getCurrentContent:()=>({getPlainText:()=>nativeText})}},return:{memoizedProps:{get inReplyToStatusId(){return postId},get inReplyToStatus(){return{id_str:postId,lang:'en',full_text:'Thank you for sharing your experience with this translation tool.'}}}}};
      input.__reactFiber$fixture = fiber;
      window.setDraft = text => {nativeText=text;input.textContent=text;input.dispatchEvent(new InputEvent('input',{bubbles:true}));};
      window.setCharDataDraft = text => {nativeText=text;input.firstChild.data=text;};
      input.addEventListener('input',()=>{nativeText=input.innerText;});
      input.addEventListener('keydown',e=>{if(e.key==='Enter')nativeKeyCount++;});
      window.fetch = async (url, init) => {
        const data = JSON.parse(init.body); wire.push({data,sourceAtWire:nativeText,inputAtWire:input.innerText});
        return new Response(JSON.stringify(responseData()),{status:200,headers:{'Content-Type':'application/json'}});
      };
      class XHR extends EventTarget {
        open() {}
        send(body) {wire.push({data:JSON.parse(body),sourceAtWire:nativeText,inputAtWire:input.innerText});this.status=200;this.responseText=JSON.stringify(responseData());queueMicrotask(()=>this.dispatchEvent(new Event('loadend')));}
      }
      window.XMLHttpRequest = XHR;
      document.querySelector('[data-testid="tweetButtonInline"]').onclick = () => {
        nativeCalls++;
        const body=JSON.stringify({variables:{tweet_text:window.overrideText || nativeText,reply:{in_reply_to_tweet_id:postId},media:{media_entities:[]}},features:{fixture:true}});
        if(window.useXHR){const xhr=new XMLHttpRequest();xhr.open('POST','/i/api/graphql/fixture/CreateTweet');try{xhr.send(body)}catch(e){window.nativeError=e.message};return;}
        window.nativePromise=fetch('/i/api/graphql/fixture/CreateTweet',{method:'POST',body}).catch(error=>{window.nativeError=error.message;});
      };
    });
    for (const name of ['i18n.js','relay-client.js','reply-bridge.js','replies.js']) await page.addScriptTag({path:path.join(root,name)});
    const card = page.locator('.xct-reply-preview');
    const draft = async text => {await page.evaluate(text=>setDraft(text),text);await page.clock.runFor(1000);};
    const ready = text => page.waitForFunction(text=>document.querySelector('.xct-reply-preview')?.shadowRoot.querySelector('p').textContent===text,text);
    const key = () => page.locator('[contenteditable]').press('Enter');
    const count = () => page.evaluate(()=>wire.length);
    await draft('谢谢分享\n这个方法很有帮助。'); await ready('en: 谢谢分享\n这个方法很有帮助。');
    assert.equal(await card.locator('input').isChecked(),true);
    assert.equal(await card.locator('.target-select').inputValue(),'auto');
    await key();await page.waitForFunction(()=>wire.length===1);await page.evaluate(()=>nativePromise);
    const first = await page.evaluate(()=>wire[0]);
    assert.equal(first.data.variables.tweet_text,'en: 谢谢分享\n这个方法很有帮助。');
    assert.equal(first.sourceAtWire,'谢谢分享\n这个方法很有帮助。');assert.equal(first.inputAtWire,first.sourceAtWire);
    assert.equal(first.data.variables.reply.in_reply_to_tweet_id,'123456789');assert.deepEqual(first.data.variables.media,{media_entities:[]});
    await key();assert.equal(await count(),1);
    await draft('Cache this draft');await ready('en: Cache this draft');
    const before = await page.evaluate(()=>translationCalls.length);
    await draft('Another draft');await ready('en: Another draft');await draft('Cache this draft');await ready('en: Cache this draft');
    assert.equal(await page.evaluate(()=>translationCalls.length),before+1);
    await card.locator('input').uncheck();
    assert.equal(await page.evaluate(()=>prefs.replyInterceptEnabled),false);
    const nativeKeys=await page.evaluate(()=>nativeKeyCount);await key();assert.ok(await page.evaluate(()=>nativeKeyCount)>nativeKeys);
    await page.locator('[data-testid="tweetButtonInline"]').click();await page.evaluate(()=>nativePromise);
    assert.equal((await page.evaluate(()=>wire.at(-1))).data.variables.tweet_text,await page.evaluate(()=>nativeText));
    await page.evaluate(()=>setPrefs({replyInterceptEnabled:true}));
    await draft('Keyboard composition');await ready('en: Keyboard composition');
    const keyBefore=await count();
    const composition = await page.locator('[contenteditable]').evaluate(n=>n.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true,isComposing:true})));
    assert.equal(composition,true);assert.equal(await count(),keyBefore);
    await page.locator('[contenteditable]').press('Shift+Enter');assert.equal(await count(),keyBefore);
    await page.evaluate(()=>{holdTranslation=true;setDraft('Old draft');});await page.clock.runFor(1000);
    await key();assert.match(await card.locator('.status').innerText(),/Will send/);
    await page.evaluate(()=>setDraft('Edited draft'));await page.clock.runFor(1000);
    await page.evaluate(()=>{holdTranslation=false;releaseTranslation();});await page.clock.runFor(1000);
    await ready('en: Edited draft');assert.equal(await count(),keyBefore);
    await page.evaluate(()=>setPrefs({replyTranslationEnabled:false}));assert.equal(await card.isVisible(),false);
    await page.evaluate(()=>setPrefs({replyTranslationEnabled:true}));await page.clock.runFor(1000);await ready('en: Edited draft');
    await page.evaluate(()=>{responseData=()=>({unexpected:true});});await key();await page.evaluate(()=>nativePromise);
    await page.waitForFunction(()=>document.querySelector('.xct-reply-preview').shadowRoot.querySelector('.status').textContent.includes('unconfirmed'));
    const unknownCount=await count();await key();await page.locator('[data-testid="tweetButtonInline"]').click();assert.equal(await count(),unknownCount);
    assert.equal(await page.evaluate(async()=>{try{await fetch('/i/api/graphql/fixture/CreateTweet',{method:'POST',body:JSON.stringify({variables:{tweet_text:nativeText,reply:{in_reply_to_tweet_id:postId}}})});return false}catch(e){return e.message==='replySendUnknown'}}),true);
    assert.equal(await count(),unknownCount);
    await page.evaluate(()=>{responseData=()=>({data:{create_tweet:{tweet_results:{result:{rest_id:'987654321'}}}}});useXHR=true;});
    await draft('XHR original');await ready('en: XHR original');await key();assert.equal((await page.evaluate(()=>wire.at(-1))).data.variables.tweet_text,'en: XHR original');
    assert.equal((await page.evaluate(()=>wire.at(-1))).inputAtWire,'XHR original');
    await page.evaluate(()=>{useXHR=false;overrideText='unexpected change';});await draft('Bound draft');await ready('en: Bound draft');
    const mismatchCount=await count();await key();await page.evaluate(()=>nativePromise);assert.equal(await count(),mismatchCount);
    assert.match(await card.locator('.status').innerText(),/draft or reply target changed/);
    await page.evaluate(()=>{overrideText='';setPrefs({postEngine:{kind:'relay',revision:'test-revision'}});setDraft('Slow AI draft');});
    await page.clock.runFor(1000);await page.waitForFunction(()=>relayCalls.some(m=>m.type==='XCT_BATCH_START'));
    await page.clock.runFor(7500);assert.match(await card.locator('p').innerText(),/still translating/);
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await card.locator('p').evaluate(n=>getComputedStyle(n,'::before').animationName),'none');
    if(output){fs.mkdirSync(output,{recursive:true});await page.screenshot({path:path.join(output,'fixture-ai-loading.png')});}
    await key();await page.evaluate(()=>{relayAnswer={status:'unknown'};});await page.clock.runFor(1700);
    await card.getByRole('button',{name:'Check result'}).waitFor({state:'visible'});
    assert.equal(await page.evaluate(()=>relayCalls.filter(m=>m.type==='XCT_BATCH_START').length),1);
    await page.evaluate(()=>{relayAnswer={status:'completed',items:[{id:'reply_0',translation:'AI translation'}]};});
    await card.getByRole('button',{name:'Check result'}).click();await page.clock.runFor(100);await ready('AI translation');
    assert.equal(await page.evaluate(()=>relayCalls.filter(m=>m.type==='XCT_BATCH_START').length),1);
    assert.equal(await count(),mismatchCount);
    await card.locator('.target-select').selectOption('ja');await page.clock.runFor(1000);
    await page.waitForFunction(()=>relayCalls.some(m=>m.type==='XCT_BATCH_START'&&m.language==='ja'));
    await page.clock.runFor(1600);await ready('AI translation');
    assert.equal(await page.evaluate(()=>prefs.replyTargetLanguage),'ja');
    const startsBeforeCache=await page.evaluate(()=>relayCalls.filter(m=>m.type==='XCT_BATCH_START').length);
    await page.evaluate(()=>{relayCached=[{id:'reply_0',translation:'Persisted translation'}];setDraft('Already cached in the extension');});
    await page.clock.runFor(1000);await ready('Persisted translation');
    assert.equal(await page.evaluate(()=>relayCalls.filter(m=>m.type==='XCT_BATCH_START').length),startsBeforeCache);
    if(output){await page.screenshot({path:path.join(output,'fixture-preview-wide.png')});await page.setViewportSize({width:360,height:800});await page.screenshot({path:path.join(output,'fixture-preview-narrow.png')});}
    assert.ok(await card.evaluate(n=>n.getBoundingClientRect().right<=innerWidth));
    assert.deepEqual(await card.locator('.target-select').evaluate(n=>{
      const style=getComputedStyle(n);
      return [style.appearance,style.backgroundOrigin,style.backgroundPositionX,style.height];
    }),['none','border-box','calc(100% - 10px)','30px']);
    await page.evaluate(()=>{
      window.sentryCalls = 0;
      const prevFetch = window.fetch;
      const sentryFetch = function(...args) { window.sentryCalls++; return prevFetch.apply(this, args); };
      sentryFetch.__sentry_original__ = prevFetch;
      window.fetch = sentryFetch;
      const origOpen = XMLHttpRequest.prototype.open;
      const origSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function(...args) { return origOpen.apply(this, args); };
      XMLHttpRequest.prototype.send = function(...args) { return origSend.apply(this, args); };
      useXHR = false;
      responseData = () => ({data:{create_tweet:{tweet_results:{result:{rest_id:'987654321'}}}}});
      setPrefs({postEngine:{kind:'google'}});
    });
    await card.locator('.target-select').selectOption('auto');
    await draft('Wrapped fetch and reset XHR');await ready('en: Wrapped fetch and reset XHR');
    const wrappedCount = await count();
    await key();await page.waitForFunction(n => wire.length === n, wrappedCount + 1);await page.evaluate(()=>nativePromise);
    assert.equal((await page.evaluate(()=>wire.at(-1))).data.variables.tweet_text,'en: Wrapped fetch and reset XHR');
    assert.ok(await page.evaluate(()=>window.sentryCalls >= 1));
    // @mention / #hashtag typeahead open: Enter must pass through to X.com without sending the reply.
    // Stale aria-activedescendant alone (which X.com leaves set when closed) must NOT block Enter.
    await page.evaluate(() => {
      const input = document.querySelector('[contenteditable]');
      input.setAttribute('aria-activedescendant', 'typeaheadFocus-0.123');
      input.setAttribute('aria-expanded', 'true');
      setDraft('@grok');
    });
    await page.clock.runFor(450);
    const beforeTypeaheadWire = await count();
    const beforeTypeaheadKeys = await page.evaluate(() => nativeKeyCount);
    await key();
    await page.waitForTimeout(50);
    assert.equal(await count(), beforeTypeaheadWire);
    assert.equal(await page.evaluate(() => nativeKeyCount), beforeTypeaheadKeys + 1);
    await page.evaluate(() => {
      document.querySelector('[contenteditable]').removeAttribute('aria-expanded');
      setDraft('@grok hello');
    });
    await page.clock.runFor(450);
    await ready('en: @grok hello');
    await key();
    await page.waitForFunction(n => wire.length === n, beforeTypeaheadWire + 1);
    assert.equal((await page.evaluate(() => wire.at(-1))).data.variables.tweet_text, 'en: @grok hello');
    await page.evaluate(() => document.querySelector('[contenteditable]').removeAttribute('aria-activedescendant'));

    await page.evaluate(()=>{
      Object.defineProperty(window, 'fetch', { value: async () => new Response('{}'), writable: false, configurable: true });
    });
    await draft('Frozen fetch');await ready('en: Frozen fetch');
    const frozenCount = await count();
    await key();
    await page.waitForFunction(()=>document.querySelector('.xct-reply-preview').shadowRoot.querySelector('.status').textContent.includes('publishing interface changed'));
    assert.equal(await count(), frozenCount);

    await page.evaluate(() => {
      window.geminiCalls = [];
      window.holdGemini = true;
      setPrefs({ replyEngine: { kind: 'gemini', revision: 'g1' } });
      setDraft('G1');
    });
    await page.clock.runFor(400);
    await page.evaluate(() => setDraft('G12'));
    await page.clock.runFor(400);
    await page.evaluate(() => setDraft('G123'));
    assert.equal(await page.evaluate(() => window.geminiCalls.length), 0);
    await page.clock.runFor(950);
    await page.waitForFunction(() => window.geminiCalls.length === 1);
    assert.deepEqual(await page.evaluate(() => window.geminiCalls), ['G123']);

    await page.evaluate(() => setDraft('G1234'));
    await page.clock.runFor(950);
    await page.evaluate(() => setDraft('G12345'));
    await page.clock.runFor(950);
    assert.equal(await page.evaluate(() => window.geminiCalls.length), 1);

    await page.evaluate(() => { window.holdGemini = false; window.releaseGemini(); });
    await page.waitForFunction(() => window.geminiCalls.length === 2);
    await ready('gemini:G12345');
    assert.deepEqual(await page.evaluate(() => window.geminiCalls), ['G123', 'G12345']);

    await page.evaluate(() => setDraft('G123'));
    await ready('gemini:G123');
    assert.equal(await page.evaluate(() => window.geminiCalls.length), 2);

    // CharacterData-only mutation (without childList/input) still triggers final translation.
    await page.evaluate(() => setCharDataDraft('G123456'));
    await page.clock.runFor(100);
    await page.clock.runFor(950);
    await page.waitForFunction(() => window.geminiCalls.length === 3);
    await ready('gemini:G123456');
    assert.deepEqual(await page.evaluate(() => window.geminiCalls), ['G123', 'G12345', 'G123456']);

    // Quick engine switcher in reply preview immediately re-translates with the newly selected engine.
    await card.locator('.engine-select').selectOption('google');
    await page.clock.runFor(400);
    await ready('en: G123456');
    assert.equal((await page.evaluate(() => prefs.replyEngine.kind)), 'google');

    // LanguageDetector takes priority over chrome.i18n.detectLanguage and supports non-top-10 languages like Vietnamese.
    assert.equal(await card.locator('.info-tip').isVisible(), true);
    await page.evaluate(() => {
      window.mockDetectorAvailability = 'available';
      window.postId = '222333444';
      setDraft('Hello vi');
    });
    await page.clock.runFor(200);
    await page.clock.runFor(500);
    await ready('vi: Hello vi');

    await page.evaluate(() => { delete window.chrome.storage; xctReplyTranslations.stop(); });
    assert.equal(await card.count(), 0);
    console.log('PASS: original and multiline retained; fetch/XHR payload only; reply binding; Enter, button, IME and Shift+Enter; preview-only and master switches; cache reuse; stale draft cancellation; no replay after unknown; slow AI/reduced motion; query-only recovery; target persistence; responsive preview.');
    // Popup uses the same persisted settings and leaves the incoming-language selection independent.
    const popup=await context.newPage();await popup.setContent(fs.readFileSync(path.join(root,'popup.html'),'utf8').replace(/<script[\s\S]*?<\/script>/g,''));
    await popup.evaluate(()=>{window.saved={};window.chrome={runtime:{id:'fixture',openOptionsPage(){}},i18n:{getUILanguage:()=>'en',getMessage:()=>''},storage:{local:{get:async()=>({}),set:async values=>Object.assign(saved,values)},onChanged:{addListener(){}}}};});
    await popup.addScriptTag({path:path.join(root,'i18n.js')});await popup.addScriptTag({path:path.join(root,'popup.js')});
    await popup.locator('#replies-enabled').waitFor();assert.equal(await popup.locator('#replies-enabled').isChecked(),true);assert.equal(await popup.locator('#reply-language').inputValue(),'auto');
    await popup.locator('#replies-enabled').uncheck();await popup.locator('#reply-language').selectOption('es');
    assert.deepEqual(await popup.evaluate(()=>saved),{replyTranslationEnabled:false,replyTargetLanguage:'es'});
    if(output){await popup.setViewportSize({width:320,height:820});await popup.screenshot({path:path.join(output,'popup-en.png')});}
    console.log('PASS: popup default-on, auto language, independent persisted reply controls.');
  } finally {await context.close();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
