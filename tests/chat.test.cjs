const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

(async () => {
  const browser = await chromium.connectOverCDP(process.env.CDP_URL || 'http://127.0.0.1:9222');
  const page = await browser.contexts()[0].newPage();
  try {
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => console.error('Page error:', error.message));
    await page.route('https://xct.test/**', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
    await page.goto('https://xct.test/');
    await page.setContent('<main data-testid="primaryColumn" style="width:950px"><div data-testid="xchatEmbedRoute" style="width:650px"></div></main>');
    await page.evaluate(() => {
      const root = document.querySelector('[data-testid="xchatEmbedRoute"]').attachShadow({ mode: 'open' });
      root.innerHTML = '<div data-testid="dm-composer-container" style="position:relative;margin-top:200px;height:80px"><textarea data-testid="dm-composer-textarea"></textarea><button data-testid="dm-composer-send-button" aria-label="发送">发送</button></div>';
      window.input = root.querySelector('textarea');
      window.sent = [];
      window.storage = {};
      const listeners = [];
      window.chrome = { runtime: { id: 'fixture', sendMessage: async ({ text }) => ({ ok: true, text: `English: ${text}` }) }, storage: {
        local: { get: async () => storage, set: async data => {
          const changes = Object.fromEntries(Object.entries(data).map(([key, newValue]) => [key, { newValue }]));
          Object.assign(storage, data); listeners.forEach(fn => fn(changes, 'local'));
        } }, onChanged: { addListener: fn => listeners.push(fn), removeListener: fn => listeners.splice(listeners.indexOf(fn), 1) },
      } };
      window.state = { currentText: '', attachments: { asJsReadonlyArrayView: () => [] } };
      input.addEventListener('input', () => state.currentText = input.value);
      window.sendMock = async (_stub, text) => {
        if (window.rejectSend) throw Error('offline');
        if (window.delaySend) await new Promise(resolve => window.finishSend = resolve);
        sent.push(text);
      };
      function Sender() { this.stub = {}; }
      Sender.prototype.send = function(e,t,n,r,i){return sendMock(this.stub,e,t,n,r,i)};
      input.__reactFiber$fixture = { memoizedProps: { component: { composer: { state: { state }, sender: new Sender() } } } };
      window.enter = options => {
        const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true, cancelable: true, ...options });
        input.dispatchEvent(event); return event.defaultPrevented;
      };
    });
    await page.addScriptTag({ path: path.join(__dirname, '..', 'page-bridge.js') });
    await page.addScriptTag({ path: path.join(__dirname, '..', 'content.js') });
    const input = page.locator('textarea');
    const ready = () => page.locator('.xct-card[data-state="ready"]').waitFor();
    await input.fill('你好');
    await ready();
    assert.equal(await input.inputValue(), '你好');
    assert.equal(await page.evaluate(() => enter({ shiftKey: true })), false);
    assert.equal(await page.evaluate(() => enter({ isComposing: true })), false);
    assert.equal(await page.evaluate(() => enter()), true);
    await page.waitForFunction(() => sent.length === 1 && input.value === '');
    assert.deepEqual(await page.evaluate(() => sent), ['English: 你好']);
    await page.locator('.xct-card').waitFor({ state: 'hidden' });

    await input.fill('保留草稿'); await ready();
    await page.evaluate(() => { rejectSend = true; enter(); });
    await page.locator('.xct-card[data-state="error"]').waitFor();
    assert.equal(await input.inputValue(), '保留草稿');
    assert.equal(await page.evaluate(() => sent.length), 1);
    await page.evaluate(() => rejectSend = false);
    await page.locator('.xct-retry').click(); await ready();
    await page.evaluate(() => { delaySend = true; enter(); enter(); });
    await page.waitForFunction(() => !!window.finishSend);
    const response = await page.evaluate(() => new Promise(resolve => {
      document.addEventListener('xct:send-response', function onReply(event) {
        if (event.detail.id !== 'duplicate') return;
        document.removeEventListener('xct:send-response', onReply); resolve(event.detail);
      });
      document.dispatchEvent(new CustomEvent('xct:send-request', { detail: { id: 'duplicate', source: input.value, translated: 'duplicate', conversation: location.pathname } }));
    }));
    assert.equal(response.ok, false);
    await page.evaluate(() => finishSend());
    await page.waitForFunction(() => sent.length === 2);

    await input.fill('关闭后正常发送'); await ready();
    await page.locator('.xct-toggle').click();
    assert.equal(await page.evaluate(() => enter()), false);
    assert.equal(await input.inputValue(), '关闭后正常发送');
    assert.equal(await page.evaluate(() => sent.length), 2);
    await page.evaluate(() => {
      const original = chrome.runtime.sendMessage;
      let failed = false;
      chrome.runtime.sendMessage = async message => {
        if (message.text === 'Incoming hello' && !failed) { failed = true; return { ok: false, error: 'offline' }; }
        return original(message);
      };
      const row = document.createElement('div');
      row.className = 'justify-start'; row.dataset.testid = 'message-111';
      row.innerHTML = '<div data-testid="message-text-111"><span dir="auto"><span>Incoming hello</span></span></div>';
      document.querySelector('[data-testid="xchatEmbedRoute"]').shadowRoot.appendChild(row);
    });
    await page.locator('.xct-incoming-note button').click();
    await page.locator('.xct-incoming-note[data-ready="true"]').waitFor();
    assert.equal(await page.locator('[data-testid="message-text-111"] > span').textContent(), 'Incoming hello');
    console.log('PASS: preview preserves draft, translated Enter, success cleanup, Shift/IME, failure preservation, concurrent send lock, disabled native send, incoming retry');
  } finally { await page.close(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
