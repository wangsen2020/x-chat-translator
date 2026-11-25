// Focused browser fixture for the post collector. No external service or account.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

(async () => {
  const browser = await chromium.connectOverCDP(process.env.CDP_URL || 'http://127.0.0.1:9222');
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    const texts = ['Red bicycle', 'Friday concert', 'Three lemon trees'];
    await page.route('https://xct-fixture.test/**', route=>route.fulfill({
      contentType:'text/html',body:texts.map(s=>'<article data-testid="tweet"><div data-testid="tweetText" lang="en">'+s+'</div></article>').join('')
    }));
    await page.goto('https://xct-fixture.test/');
    await page.clock.install();
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.evaluate(() => {
      const listeners = new Set();
      window.calls = [];
      window.answer = {status:'running'};
      window.chrome = {runtime:{sendMessage: async m => {
        calls.push(m);
        if (m.type==='XCT_BATCH_LOOKUP') return {ok:true,value:[]};
        return {ok:true,value:m.type==='XCT_BATCH_START' ? {status:'query'} : answer};
      }},storage:{local:{get:async()=>({incomingLanguage:'zh-CN',postDisplayMode:'replace',postEngine:{kind:'relay',revision:'test'}})},
        onChanged:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)}}};
      window.change = values => listeners.forEach(fn=>fn(values,'local'));
      window.xctTranslationService = {available:()=>true,languages:[['zh-CN','Chinese']]};
    });
    for(const file of ['i18n.js','relay-client.js','posts.js']) await page.addScriptTag({path:path.join(__dirname,'..',file)});
    await page.addStyleTag({path:path.join(__dirname,'..','posts.css')});
    await page.clock.runFor(7500);
    const source = page.locator('[data-testid=tweetText]');
    const notes = page.locator('.xct-post-translation');
    assert.equal(await source.filter({visible:true}).count(),3);
    assert.match(await notes.first().locator('header').innerText(),/Still translating/);
    assert.equal(await notes.first().locator('header').evaluate(h=>getComputedStyle(h,'::before').animationName),'none');
    await page.evaluate(()=>{answer={status:'unknown'};});
    await page.clock.runFor(1600);
    const originalJob = await page.evaluate(()=>calls.find(m=>m.type==='XCT_BATCH_START'));
    assert.equal(originalJob.items.length,3);
    await page.evaluate(({items})=>{
      answer={status:'completed',items:[{id:items[2].id,translation:'柠檬树'},{id:items[0].id,translation:'自行车'}]};
    },originalJob);
    for(let i=0;i<3;i++) await notes.nth(i).getByRole('button',{name:'Check result'}).evaluate(b=>b.click());
    await page.clock.runFor(500);
    assert.equal(await page.evaluate(()=>calls.filter(m=>m.type==='XCT_BATCH_START').length),1);
    assert.equal(await notes.first().locator('p').textContent(),'自行车');
    assert.equal(await notes.nth(2).locator('p').textContent(),'柠檬树');
    assert.equal(await source.nth(1).isVisible(),true);
    assert.equal(await notes.nth(1).getByRole('button',{name:'Retry'}).isVisible(),true);
    await page.evaluate(()=>{answer={status:'running'};});
    await notes.nth(1).getByRole('button',{name:'Retry'}).evaluate(b=>b.click());
    await page.clock.runFor(450);
    const second = await page.evaluate(()=>calls.filter(m=>m.type==='XCT_BATCH_START').at(-1));
    assert.equal(second.items.length,1);
    await page.evaluate(id=>{
      change({postsEnabled:{newValue:false}});
      answer={status:'completed',items:[{id,translation:'stale'}]};
    },second.items[0].id);
    await page.clock.runFor(1800);
    assert.equal(await notes.count(),0);
    assert.equal(await source.filter({visible:true}).count(),3);
    assert.equal(await page.getByText('stale').count(),0);
    console.log('PASS: one batch, slow loading, reduced motion, query-only recovery, reordered and partial results, original restored');
  } finally {await context.close();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
