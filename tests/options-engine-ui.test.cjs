const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// 1. 验证 options.html 中已移除死编码的 option
const html = fs.readFileSync(path.join(__dirname, '..', 'options.html'), 'utf8');
assert.match(html, /<select id="provider"><\/select>/, 'options.html provider select should not contain hardcoded options');
assert.ok(!html.includes('<option value="codex">Codex</option>'), 'options.html should not have static codex option');

// 2. 验证 relay-worker.js 中的动态 provider 支持
const workerCode = fs.readFileSync(path.join(__dirname, '..', 'relay-worker.js'), 'utf8');
assert.match(workerCode, /KNOWN_PROVIDERS/, 'relay-worker should define KNOWN_PROVIDERS');
assert.match(workerCode, /'XCT_RELAY_PROVIDERS'/, 'relay-worker should handle XCT_RELAY_PROVIDERS message');
assert.match(workerCode, /providers\(draft\)\s*\{\s*const config = binding\(draft, false, false\);/, 'providers() must allow empty provider during discovery');
assert.ok(!workerCode.includes("!['codex','antigravity'].includes(draft.provider)"), 'relay-worker should not restrict provider to only codex/antigravity');

const optionsCode = fs.readFileSync(path.join(__dirname, '..', 'options.js'), 'utf8');
assert.match(optionsCode, /el\('refresh'\)\.onclick\s*=\s*\(\)\s*=>\s*connectRelay\(false\);/, 'refresh click must run connectRelay(false)');
assert.match(workerCode, /'XCT_RELAY_PROBE'/, 'relay-worker should handle XCT_RELAY_PROBE');
assert.match(workerCode, /com\.goodexts\.agentrelay/, 'relay-worker should probe com.goodexts.agentrelay');

// 3. 验证 options.css 中的 UI 规范
const css = fs.readFileSync(path.join(__dirname, '..', 'options.css'), 'utf8');
// 倒三角距离右侧必须严格 10px
assert.match(css, /background-position:\s*right 10px center;/, 'select dropdown arrow must be positioned 10px from the right');
// 控件高度严格 30px
assert.match(css, /height:\s*30px;/, 'controls must specify height: 30px');
assert.match(css, /min-height:\s*30px;/, 'controls must specify min-height: 30px');
assert.match(css, /max-height:\s*30px;/, 'controls must specify max-height: 30px');
assert.match(css, /font-size:\s*12px;/, 'controls must specify font-size: 12px');
// 会话行间距与按钮间距必须严格 10px
assert.match(css, /\.session select\s*\{\s*flex:\s*1;\s*margin-right:\s*10px;\s*\}/, 'session select must have margin-right: 10px');
assert.match(css, /\.actions button:not\(:last-child\)\s*\{\s*margin-right:\s*10px;\s*\}/, 'action buttons must have margin-right: 10px');
assert.match(css, /\.icon-btn\s*\{[^}]*width:\s*30px;[^}]*height:\s*30px;/, 'icon button must be 30px by 30px');

// 4. 运行时验证：provider 为空时 XCT_RELAY_PROVIDERS 不应报 relayConfigError
const vm = require('node:vm');
(async () => {
  const listeners = [];
  let fetchHandler = async () => ({ ok: false, status: 500, json: async () => ({}) });
  let nativeHandler = async () => ({ ok: true, status: 'running', installed: true, running: true, baseUrl: 'http://127.0.0.1:8787', token: 'native-tok' });
  const ctx = {
    URL, TextEncoder, AbortSignal, Map, Set, Promise, Error, Array, JSON, Object,
    crypto,
    navigator: { locks: { request: async (_, fn) => fn() } },
    indexedDB: {
      open: () => {
        const req = {};
        queueMicrotask(() => req.onsuccess?.());
        return req;
      },
    },
    chrome: {
      runtime: {
        id: 'ext-id',
        getURL: p => 'chrome-extension://ext-id/' + p,
        onStartup: { addListener: () => {} },
        onMessage: { addListener: fn => listeners.push(fn) },
        sendNativeMessage: (...args) => nativeHandler(...args),
      },
      alarms: { onAlarm: { addListener: () => {} }, get: async () => null, create: async () => {}, clear: async () => {} },
      storage: { local: { get: async () => ({}), set: async () => {} } },
      i18n: { getUILanguage: () => 'zh-CN' },
      tabs: { create: async () => {} },
    },
    fetch: (...args) => fetchHandler(...args),
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'relay-client.js'), 'utf8'), ctx);
  vm.runInContext(workerCode, ctx);
  const dispatch = msg => new Promise(resolve => {
    listeners[0](msg, { id: 'ext-id', url: 'chrome-extension://ext-id/options.html' }, resolve);
  });

  fetchHandler = async (url) => {
    if (url === 'http://127.0.0.1:8787/health') {
      return { ok: true, status: 200, json: async () => ({ service: 'agent-relay' }) };
    }
    if (url.endsWith('/codex/health')) return { ok: true, status: 200, json: async () => ({ ok: true }) };
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const okReply = await dispatch({ type: 'XCT_RELAY_PROVIDERS', draft: { address: 'http://127.0.0.1:8787', token: 'tok', provider: '' } });
  assert.deepEqual(JSON.parse(JSON.stringify(okReply)), { ok: true, value: [{ id: 'codex', name: 'Codex' }] });

  fetchHandler = async (url) => {
    if (url.endsWith('/health') && url === 'http://127.0.0.1:8787/health') {
      return { ok: true, status: 200, json: async () => ({ service: 'agent-relay' }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const unavailableReply = await dispatch({ type: 'XCT_RELAY_PROVIDERS', draft: { address: 'http://127.0.0.1:8787', token: 'tok', provider: '' } });
  assert.deepEqual(JSON.parse(JSON.stringify(unavailableReply)), { ok: false, error: 'relayUnavailable' });

  fetchHandler = async () => ({ ok: false, status: 401, json: async () => ({}) });
  const authReply = await dispatch({ type: 'XCT_RELAY_PROVIDERS', draft: { address: 'http://127.0.0.1:8787', token: 'bad', provider: '' } });
  assert.deepEqual(JSON.parse(JSON.stringify(authReply)), { ok: false, error: 'relayAuth' });

  const probeRunning = await dispatch({ type: 'XCT_RELAY_PROBE' });
  assert.deepEqual(JSON.parse(JSON.stringify(probeRunning)), {
    ok: true,
    value: { ok: true, status: 'running', installed: true, running: true, baseUrl: 'http://127.0.0.1:8787', token: 'native-tok' },
  });

  nativeHandler = async () => { throw Error('Specified native messaging host not found.'); };
  const probeNotInstalled = await dispatch({ type: 'XCT_RELAY_PROBE' });
  assert.equal(probeNotInstalled.ok, true);
  assert.equal(probeNotInstalled.value.status, 'not_installed');
  assert.equal(probeNotInstalled.value.installed, false);

  // 5. 验证 4 场景独立引擎保存与读取 + Gemini Worker
  assert.ok(html.includes('id="engine-reply"'), 'options.html should have #engine-reply');
  assert.ok(html.includes('id="engine-chat-incoming"'), 'options.html should have #engine-chat-incoming');
  assert.ok(html.includes('id="engine-chat-outgoing"'), 'options.html should have #engine-chat-outgoing');
  assert.ok(html.includes('id="gemini-key"'), 'options.html should have #gemini-key');

  const stored = {};
  const idbStore = new Map();
  const geminiListeners = [];
  const gCtx = {
    URL, TextEncoder, AbortSignal, Map, Set, Promise, Error, Array, JSON, Object, Date,
    crypto,
    navigator: { locks: { request: async (_, fn) => fn() } },
    indexedDB: {
      open: () => {
        const req = {
          result: {
            transaction: () => ({
              objectStore: () => ({
                get: k => {
                  const r = {};
                  queueMicrotask(() => { r.result = idbStore.get(k); r.onsuccess?.(); });
                  return r;
                },
                put: (v, k) => idbStore.set(k, v),
                delete: k => idbStore.delete(k),
              }),
              set oncomplete(fn) { queueMicrotask(fn); },
            }),
          },
        };
        queueMicrotask(() => req.onsuccess?.());
        return req;
      },
    },
    chrome: {
      runtime: {
        id: 'ext-id',
        getURL: p => 'chrome-extension://ext-id/' + p,
        onStartup: { addListener: () => {} },
        onMessage: { addListener: fn => geminiListeners.push(fn) },
        sendNativeMessage: nativeHandler,
      },
      alarms: { onAlarm: { addListener: () => {} }, get: async () => null, create: async () => {}, clear: async () => {} },
      storage: {
        local: {
          get: async keys => {
            const list = Array.isArray(keys) ? keys : [keys];
            const out = {};
            for (const k of list) if (k in stored) out[k] = stored[k];
            return out;
          },
          set: async obj => Object.assign(stored, obj),
        },
      },
      i18n: { getUILanguage: () => 'zh-CN' },
      tabs: { create: async () => {} },
    },
    XCTPostCache: {
      lookup: async (_s, _l, items) => items.map(i => ({ id: i.id, key: i.id })),
      save: async () => {},
      key: async (_s, l, t) => l + ':' + t,
    },
    fetch: async (url, init) => {
      if (String(url).includes('generativelanguage.googleapis.com')) {
        if (init?.headers?.['X-goog-api-key'] === 'bad-key') return { ok: false, status: 401, json: async () => ({}) };
        const bodyText = JSON.parse(init.body).contents[0].parts[0].text;
        const isBatch = bodyText.includes('"items"');
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{
              content: {
                parts: [{
                  text: isBatch
                    ? JSON.stringify({ items: [{ id: 'p1', translation: '译文1' }] })
                    : '你好',
                }],
              },
            }],
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    },
  };
  gCtx.globalThis = gCtx;
  vm.createContext(gCtx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'relay-client.js'), 'utf8'), gCtx);
  vm.runInContext(workerCode, gCtx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'gemini-worker.js'), 'utf8'), gCtx);

  const sendToAll = (msg, url = 'chrome-extension://ext-id/options.html') => new Promise(resolve => {
    for (const fn of geminiListeners) {
      let handled = false;
      const ret = fn(msg, { id: 'ext-id', url, tab: { id: 1 }, frameId: 0 }, res => { handled = true; resolve(res); });
      if (ret === true || handled) return;
    }
  });

  const saveRes = await sendToAll({
    type: 'XCT_RELAY_SAVE',
    scenes: { post: 'gemini', reply: 'google', chatIncoming: 'gemini', chatOutgoing: 'google' },
    gemini: { apiKey: 'test-gemini-key', model: 'gemini-flash-lite-latest' },
  });
  assert.equal(saveRes.ok, true);
  assert.equal(stored.postEngine.kind, 'gemini');
  assert.equal(stored.replyEngine.kind, 'google');
  assert.equal(stored.chatIncomingEngine.kind, 'gemini');
  assert.equal(stored.chatOutgoingEngine.kind, 'google');

  const testOk = await sendToAll({ type: 'XCT_GEMINI_TEST', draft: { apiKey: 'test-gemini-key', model: 'gemini-flash-lite-latest' } });
  assert.equal(testOk.ok, true);
  assert.equal(testOk.value.model, 'gemini-flash-lite-latest');

  const testBad = await sendToAll({ type: 'XCT_GEMINI_TEST', draft: { apiKey: 'bad-key', model: 'gemini-flash-lite-latest' } });
  assert.deepEqual(JSON.parse(JSON.stringify(testBad)), { ok: false, error: 'geminiAuth' });

  const batchRes = await sendToAll({
    type: 'XCT_GEMINI_BATCH',
    items: [{ id: 'p1', text: 'Hello' }],
    language: 'zh-CN',
    revision: stored.postEngine.revision,
    scene: 'post',
  }, 'https://x.com/home');
  assert.deepEqual(JSON.parse(JSON.stringify(batchRes)), { ok: true, value: [{ id: 'p1', translation: '译文1' }] });

  const singleRes = await sendToAll({
    type: 'XCT_GEMINI_TRANSLATE',
    text: 'Hello',
    language: 'zh-CN',
    revision: stored.chatIncomingEngine.revision,
    scene: 'chatIncoming',
  }, 'https://x.com/i/chat');
  assert.deepEqual(JSON.parse(JSON.stringify(singleRes)), { ok: true, value: '你好' });

  console.log('✔ All options engine & UI specification checks passed.');
})().catch(err => { console.error(err); process.exitCode = 1; });
