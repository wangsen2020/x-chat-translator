const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
let listener;
let response;
let failure;
let requests = 0;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8'), {
  chrome: { runtime: { onMessage: { addListener: fn => listener = fn } } },
  URL, AbortSignal,
  fetch: async url => {
    requests++;
    assert.equal(new URL(url).hostname, 'translate.googleapis.com');
    if (failure) throw Error(failure);
    return response;
  },
});
const translate = (text, language = 'zh-CN') => new Promise(resolve => listener({ type: 'XCT_TRANSLATE', text, language }, {}, resolve));
(async () => {
  assert.equal((await translate('')).ok, false);
  assert.equal((await translate('a'.repeat(5001))).ok, false);
  assert.equal((await translate('hello', '../../invalid')).ok, false);
  assert.equal(requests, 0);
  response = { ok: true, json: async () => [[['你'], ['好']]] };
  assert.equal((await translate('hello')).text, '你好');
  response = { ok: true, json: async () => ({ unexpected: true }) };
  assert.equal((await translate('hello')).ok, false);
  response = { ok: false, status: 429 };
  assert.match((await translate('hello')).error, /429/);
  failure = 'timeout';
  assert.equal((await translate('hello')).ok, false);
  console.log('PASS: invalid requests, response parsing, empty response, HTTP rate limit, network failure');
})().catch(error => { console.error(error); process.exitCode = 1; });
