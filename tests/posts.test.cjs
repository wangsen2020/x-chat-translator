// Run against the user's existing CDP browser; creates and closes only a blank fixture tab.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

(async () => {
  const browser = await chromium.connectOverCDP(process.env.CDP_URL || 'http://127.0.0.1:9222');
  const page = await browser.contexts()[0].newPage();
  try {
    await page.setContent('<article data-testid="tweet"><div data-testid="tweetText" lang="en">Hello world</div></article>');
    await page.evaluate(() => {
      window.calls = [];
      window.settingsListeners = [];
      window.chrome = { storage: {
        local: { get: async () => ({ incomingLanguage: 'zh-CN' }) },
        onChanged: { addListener: fn => settingsListeners.push(fn), removeListener: fn => settingsListeners.splice(settingsListeners.indexOf(fn), 1) },
      } };
      window.xctTranslationService = {
        available: () => true, languages: [['zh-CN', '简体中文'], ['ja', '日语']],
        translate: async (source, language) => {
          calls.push({ source, language });
          if (source === 'Fail once' && !window.failed) { window.failed = true; throw Error('network'); }
          if (source === 'Slow original') await new Promise(resolve => window.resolveSlow = resolve);
          return `${language}: ${source}`;
        },
      };
      window.changeSettings = changes => settingsListeners.forEach(fn => fn(changes, 'local'));
    });
    await page.addScriptTag({ path: path.join(__dirname, '..', 'posts.js') });
    const note = page.locator('.xct-post-translation');
    await page.waitForFunction(() => document.querySelector('.xct-post-translation')?.shadowRoot.querySelector('p').textContent.includes('Hello world'));
    assert.equal(await page.locator('[data-testid="tweetText"]').textContent(), 'Hello world');
    await page.evaluate(() => document.body.appendChild(document.createElement('div')));
    await page.waitForTimeout(300);
    assert.equal(await note.count(), 1);
    assert.equal(await page.evaluate(() => calls.length), 1);

    await page.evaluate(() => document.querySelector('[data-testid="tweetText"]').textContent = 'Slow original');
    await page.waitForFunction(() => !!window.resolveSlow);
    await page.evaluate(() => document.querySelector('[data-testid="tweetText"]').textContent = 'Updated post');
    await page.waitForFunction(() => document.querySelector('.xct-post-translation')?.shadowRoot.querySelector('p').textContent.includes('Updated post'));
    await page.evaluate(() => resolveSlow());
    await page.waitForTimeout(100);
    assert.match(await note.locator('p').textContent(), /Updated post/);

    await page.evaluate(() => changeSettings({ postsEnabled: { newValue: false } }));
    assert.equal(await note.count(), 0);
    await page.evaluate(() => changeSettings({ postsEnabled: { newValue: true }, incomingLanguage: { newValue: 'ja' } }));
    await page.waitForFunction(() => document.querySelector('.xct-post-translation')?.shadowRoot.querySelector('p').textContent.startsWith('ja:'));
    await page.evaluate(() => document.querySelector('[data-testid="tweetText"]').textContent = 'Fail once');
    await note.getByRole('button', { name: '重试' }).waitFor({ state: 'visible' });
    await note.getByRole('button', { name: '重试' }).click();
    await page.waitForFunction(() => document.querySelector('.xct-post-translation')?.shadowRoot.querySelector('p').textContent.includes('Fail once'));

    await page.evaluate(() => document.querySelector('[data-testid="tweetText"]').textContent = '😀'.repeat(3000) + 'long post');
    await page.waitForFunction(() => document.querySelector('.xct-post-translation')?.shadowRoot.querySelector('p').textContent.includes('long post'));
    assert.ok(await page.evaluate(() => calls.every(call => call.source.length <= 5000)));
    await page.evaluate(() => document.querySelector('[data-testid="tweetText"]').setAttribute('lang', 'ja'));
    // A recycled post switches both language and content.
    await page.evaluate(() => document.querySelector('[data-testid="tweetText"]').textContent = 'こんにちは');
    await page.waitForTimeout(300);
    assert.equal(await note.count(), 0);
    await page.evaluate(() => xctPostTranslations.stop());
    assert.equal(await page.evaluate(() => settingsListeners.length), 0);
    console.log('PASS: original retained, dedupe, recycled DOM/stale response, settings, retry, long text, same language, cleanup');
  } finally {
    await page.close();
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
