const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}const types={'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png'};res.setHeader('Content-Type',types[path.extname(file)]||'text/plain');res.setHeader('Cache-Control','no-store');res.end(fs.readFileSync(file));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.connectOverCDP(process.env.CDP_URL||'http://127.0.0.1:9222');let page=await browser.contexts()[0].newPage();const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR',e.message);});page.setDefaultTimeout(12000);
 try {
  for(const locale of ['en','zh_CN','es_419','ja','ko']){
   
   await page.setViewportSize({width:1280,height:800});
   for(const view of ['chat','posts']){
    await page.goto(`${base}/store/preview.html?lang=${locale}&view=${view}`);await page.waitForFunction(()=>window.previewReady);
    if(view==='chat')await page.locator('.xct-card[data-state=ready]').waitFor();else await page.waitForFunction(()=>[...document.querySelectorAll('.xct-post-translation')].every(e=>e.shadowRoot.querySelector('p').textContent));
    await page.screenshot({path:path.join(root,`store/screenshot-${view}-${locale}.jpg`),type:'jpeg',quality:94});
    if(view==='chat'){
     const expected=JSON.parse(fs.readFileSync(path.join(root,`_locales/${locale}/messages.json`),'utf8'));
     assert.equal(await page.locator('.xct-title').textContent(),expected.settings.message);
     await page.locator('.xct-collapse').click();await page.locator('.xct-collapse').focus();
     assert.equal(await page.locator('.xct-collapse').getAttribute('aria-expanded'),'false');
     await page.locator('.xct-collapse').press('Enter');
     assert.equal(await page.locator('.xct-collapse').getAttribute('aria-expanded'),'true');
     await page.setViewportSize({width:640,height:800});await page.waitForTimeout(600);
     await page.screenshot({path:path.join(root,`store/qa-narrow-${locale}.jpg`),type:'jpeg'});
     assert.ok(await page.locator('.xct-settings').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'sidebar overflow '+locale);
     await page.setViewportSize({width:1280,height:800});
    }
   }
   const catalog=JSON.parse(fs.readFileSync(path.join(root,`_locales/${locale}/messages.json`),'utf8'));
   await page.route('**/popup.html*', async route=>{const script=(({catalog,locale})=>{const getMessage=(key,values=[])=>{if(key==='@@bidi_dir')return'ltr';let text=catalog[key]?.message||'';for(const[name,p]of Object.entries(catalog[key]?.placeholders||{}))text=text.replaceAll('$'+name.toUpperCase()+'$',values[Number(p.content.slice(1))-1]||'');return text;};window.chrome={runtime:{id:'popup-test'},i18n:{getMessage,getUILanguage:()=>locale.replace('_','-')},storage:{local:{get:async()=>({incomingLanguage:'ja'}),set:async v=>{window.saved=v;}},onChanged:{addListener(){},removeListener(){}}}};}).toString();const body=fs.readFileSync(path.join(root,'popup.html'),'utf8').replace('<script src="i18n.js">', ()=>'<script>('+script+')('+JSON.stringify({catalog,locale})+')</script><script src="i18n.js">');await route.fulfill({contentType:'text/html',body});});
   await page.goto(`${base}/popup.html?locale=${locale}`);await page.waitForFunction(()=>!document.querySelector('#reading-language').disabled);
   assert.equal(await page.locator('#reading-language').inputValue(),'ja','existing preference preserved');
   assert.equal(await page.evaluate(()=>document.documentElement.lang),locale.replace('_','-'));
   await page.locator('#reading-language').selectOption('es');await page.waitForFunction(()=>window.saved?.incomingLanguage==='es');
   assert.equal(await page.locator('#save-status').textContent(),catalog.saved.message);
   await page.screenshot({path:path.join(root,`store/qa-popup-${locale}.jpg`),type:'jpeg',clip:{x:0,y:0,width:320,height:Math.ceil(await page.evaluate(()=>document.body.getBoundingClientRect().height))}});
   await page.unroute('**/popup.html*');
   console.log('PASS render and interact',locale);
  }
  assert.deepEqual(errors,[]);console.log('PASS all rendered locales, keyboard collapse/expand, 640px sidebar, popup persistence, no page errors');
 }finally{await page.close();await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

