const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.join(__dirname, '..');
const locales = ['en','zh_CN','es_419','ja','ko'];
const catalogs = Object.fromEntries(locales.map(l => [l, JSON.parse(fs.readFileSync(path.join(root,'_locales',l,'messages.json'),'utf8'))]));
const keys = Object.keys(catalogs.en).sort();
for (const locale of locales) {
 const catalog = catalogs[locale];
 assert.deepEqual(Object.keys(catalog).sort(), keys);
 assert.ok([...catalog.extName.message].length<=75);
 assert.ok([...catalog.extDesc.message].length<=132);
 for (const key of keys) {
  assert.ok(catalog[key].message.trim(), `${locale}:${key}`);
  assert.deepEqual(catalog[key].placeholders, catalogs.en[key].placeholders);
  assert.deepEqual(catalog[key].message.match(/\$[A-Z_]+\$/g)||[], catalogs.en[key].message.match(/\$[A-Z_]+\$/g)||[]);
 }
 const context={chrome:{runtime:{id:'test'},i18n:{getUILanguage:()=>locale.replace('_','-'),getMessage:(key,values)=>{
  let text=catalog[key]?.message||'';
  for(const [name,p] of Object.entries(catalog[key]?.placeholders||{}))text=text.replaceAll('$'+name.toUpperCase()+'$',values[Number(p.content.slice(1))-1]);return text;
 }}}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'i18n.js'),'utf8'),context);
 assert.equal(context.XCTI18n.t('settings'),catalog.settings.message);
 assert.equal(context.XCTI18n.readingLanguage,{en:'en',zh_CN:'zh-CN',es_419:'es',ja:'ja',ko:'ko'}[locale]);
 assert.ok(context.XCTI18n.t('serviceError','429').includes('429'));
 context.chrome.runtime.id=undefined;
 context.chrome.i18n.getMessage=()=>{throw Error('orphan call');};
 assert.equal(context.XCTI18n.t('settings'),catalog.settings.message);
 assert.ok(context.XCTI18n.t('expand'));
}
for(const file of ['content.js','posts.js','replies.js','popup.js','popup.html']) {
 const source=fs.readFileSync(path.join(root,file),'utf8');
 for(const match of source.matchAll(/\bt\('([^']+)'|data-i18n(?:-[\w-]+)?="([^"]+)"/g))assert.ok(catalogs.en[match[1]||match[2]],`${file}: ${match[0]}`);
}
console.log('PASS: five catalogs, key and placeholder parity, manifest limits, browser-language defaults, cached orphan safety, UI key references');
