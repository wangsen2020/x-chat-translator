(() => {
  const service = globalThis.xctTranslationService;
  if (!service) return;
  globalThis.xctPostTranslations?.stop();
  const records = new Map();
  let enabled = true;
  let language = 'zh-CN';
  let stopped = false;
  let timer;
  let ready = false;
  const selector = 'article[data-testid="tweet"] [data-testid="tweetText"]';

  function sourceText(node) {
    const copy = node.cloneNode(true);
    copy.querySelectorAll('img[alt]').forEach(img => img.replaceWith(img.alt));
    return copy.textContent.trim();
  }

  function remove(node, record) {
    record.host.remove();
    records.delete(node);
  }

  function clear() {
    for (const [node, record] of records) remove(node, record);
  }

  function current(node, record) {
    return !stopped && enabled && node.isConnected && record.host.isConnected &&
      records.get(node) === record && record.language === language && sourceText(node) === record.source;
  }

  async function translate(node, record) {
    record.label.textContent = '正在翻译…';
    record.retry.hidden = true;
    try {
      // Long posts can exceed the provider's 5,000-character request limit.
      const chunks = Array.from(record.source.matchAll(/[\s\S]{1,2000}/gu), match => match[0]);
      const result = [];
      for (const chunk of chunks) {
        if (!current(node, record)) return;
        result.push(await service.translate(chunk, record.language));
      }
      if (!current(node, record)) return;
      const text = result.join('');
      record.label.textContent = `译文 · ${service.languages.find(([code]) => code === language)?.[1] || language}`;
      record.body.textContent = text;
      // Avoid repeating a post when automatic language detection yields the original.
      record.host.hidden = text.replace(/\s/g, '') === record.source.replace(/\s/g, '');
    } catch {
      if (!service.available()) { stop(); return; }
      if (!current(node, record)) return;
      record.label.textContent = '翻译失败，原文已保留';
      record.retry.hidden = false;
    }
  }

  function mount(node, source) {
    const host = document.createElement('div');
    host.className = 'xct-post-translation';
    host.style.cssText = 'display:block;margin-top:10px;margin-bottom:4px;color:inherit;';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>
      :host([hidden]){display:none!important}
      section{border-top:1px solid color-mix(in srgb,currentColor 25%,transparent);padding-top:8px;font:inherit;line-height:1.5}
      header{display:flex;align-items:center;font:12px/1.5 system-ui;opacity:.65;margin-bottom:5px}
      button{margin-left:10px;border:1px solid currentColor;border-radius:12px;background:transparent;color:inherit;cursor:pointer;padding:2px 9px;font:inherit}
      button[hidden]{display:none}p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}
    </style><section aria-label="帖子译文"><header><span role="status"></span><button type="button" hidden>重试</button></header><p dir="auto"></p></section>`;
    const record = { host, source, language, label: root.querySelector('span'), body: root.querySelector('p'), retry: root.querySelector('button') };
    // A quoted post can be wrapped in a link. Interacting with its translation must not navigate.
    host.addEventListener('click', event => { event.stopPropagation(); event.preventDefault(); });
    record.retry.addEventListener('click', () => translate(node, record));
    node.after(host);
    records.set(node, record);
    translate(node, record);
  }

  function scan() {
    if (stopped || !ready) return;
    if (!service.available()) { stop(); return; }
    for (const [node, record] of records) {
      const sameLanguage = (node.getAttribute('lang') || '').toLowerCase().split('-')[0] === language.toLowerCase().split('-')[0];
      if (!node.isConnected || !record.host.isConnected || sourceText(node) !== record.source || sameLanguage) remove(node, record);
    }
    if (!enabled) return;
    document.querySelectorAll(selector).forEach(node => {
      if (records.has(node) || node.closest('[contenteditable="true"]')) return;
      const bounds = node.getBoundingClientRect();
      if (!bounds.width || !bounds.height || bounds.bottom < 0 || bounds.top > innerHeight) return;
      const declared = (node.getAttribute('lang') || '').toLowerCase();
      if (declared && declared.split('-')[0] === language.toLowerCase().split('-')[0]) return;
      const source = sourceText(node);
      if (!source || !/\p{L}/u.test(source)) return;
      mount(node, source);
    });
  }

  function schedule() {
    if (stopped || timer) return;
    timer = setTimeout(() => { timer = null; scan(); }, 180);
  }

  function onSettings(changes, area) {
    if (area !== 'local') return;
    if (changes.postsEnabled) enabled = changes.postsEnabled.newValue !== false;
    if (changes.incomingLanguage) language = changes.incomingLanguage.newValue || 'zh-CN';
    if (changes.postsEnabled || changes.incomingLanguage) { clear(); schedule(); }
  }

  const observer = new MutationObserver(schedule);
  function stop() {
    stopped = true;
    clearTimeout(timer);
    observer.disconnect();
    removeEventListener('scroll', schedule, true);
    removeEventListener('resize', schedule);
    try { chrome.storage.onChanged.removeListener(onSettings); } catch {}
    clear();
  }
  globalThis.xctPostTranslations = { stop };
  chrome.storage.onChanged.addListener(onSettings);
  chrome.storage.local.get(['postsEnabled', 'incomingLanguage']).then(data => {
    if (stopped) return;
    enabled = data.postsEnabled !== false;
    language = data.incomingLanguage || 'zh-CN';
    ready = true;
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['lang'] });
    addEventListener('scroll', schedule, true);
    addEventListener('resize', schedule);
    scan();
  }).catch(stop);
})();
