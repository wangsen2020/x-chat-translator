const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = await browser.contexts()[0].newPage();
  const locales = ['en', 'zh_CN', 'es_419', 'ja', 'ko'];
  try {
    await page.setViewportSize({ width: 440, height: 280 });
    await page.bringToFront();
    for (const locale of locales) {
      const url = pathToFileURL(path.join(root, 'store/promo/tile.html'));
      url.searchParams.set('lang', locale);
      await page.goto(url.href);
      await page.waitForFunction(() => document.body.dataset.ready === '1');
      const overflow = await page.locator('h1, .sub, .translated').evaluateAll(nodes => nodes.some(node => node.getBoundingClientRect().right > 429));
      if (overflow) throw new Error('Text overflows ' + locale);
      await page.screenshot({ path: path.join(root, `store/promo/small-${locale}.jpg`), type: 'jpeg', quality: 98 });
      await sharp(path.join(root, `store/promo/small-${locale}.jpg`)).resize(275, 175).toFile(path.join(root, `store/promo/list-${locale}.jpg`));
      console.log('Rendered', locale);
    }
    const images = [];
    for (let index = 0; index < locales.length; index++) {
      images.push({ input: path.join(root, `store/promo/small-${locales[index]}.jpg`), left: index % 3 * 440, top: Math.floor(index / 3) * 280 });
    }
    await sharp({ create: { width: 1320, height: 560, channels: 3, background: '#303030' } }).composite(images).jpeg({ quality: 95 }).toFile(path.join(root, 'store/promo/contact.jpg'));
  } finally {
    await page.close();
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
