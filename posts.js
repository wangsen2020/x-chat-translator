(() => {
  const {t,readingLanguage} = XCTI18n;
  const service = globalThis.xctTranslationService;
  if (!service) return;
  globalThis.xctPostTranslations?.stop();
  const records = new Map();
  const pending = new Set();
  const cache = new Map();
  const selector = 'article[data-testid="tweet"] [data-testid="tweetText"]';
  let engine = {kind:'google'}, mode = 'both', enabled = true, language = readingLanguage;
  let ready = false, stopped = false, scanning, collecting, running = false, itemId = 0;
  function inChat() { return /^\/(?:i\/chat|messages)(?:\/|$)/.test(location.pathname); }
  function sourceText(node) {
    const copy = node.cloneNode(true);
    copy.querySelectorAll('img[alt]').forEach(img => img.replaceWith(img.alt));
    return copy.textContent.trim();
  }
  function current(r) {
    return !stopped && enabled && !inChat() && records.get(r.node) === r && r.node.isConnected &&
      r.host.previousElementSibling === r.node && r.language === language && sourceText(r.node) === r.source;
  }
  function remove(r) {
    clearTimeout(r.slow);
    r.node.removeAttribute('data-xct-original-hidden');
    r.host.remove(); records.delete(r.node);
    for (const part of r.parts || []) pending.delete(part);
  }
  function clear() { for (const r of records.values()) remove(r); }
  function render(r) {
    const replace = mode === 'replace' && r.text && !r.host.hidden;
    r.node.toggleAttribute('data-xct-original-hidden', Boolean(replace && !r.original));
    r.body.hidden = Boolean(replace && r.original);
    r.toggle.hidden = !replace;
    r.toggle.textContent = t(r.original ? 'showTranslation' : 'showOriginal');
  }
  function settle(r) {
    clearTimeout(r.slow);
    r.host.dataset.busy = 'false';
    r.body.setAttribute('aria-busy','false');
  }
  function success(r,text) {
    if (!current(r)) return;
    settle(r); r.text = text; r.body.textContent = text;
    r.label.textContent = t('translationLabel',service.languages.find(([code])=>code === language)?.[1] || language);
    r.host.hidden = text.replace(/\s/g,'') === r.source.replace(/\s/g,'');
    r.retry.hidden = true; render(r);
  }
  function fail(r, error) {
    if (!current(r)) return;
    settle(r);
    r.label.textContent = t(error?.startsWith('relay') || error?.startsWith('gemini') ? error : 'postFailed');
    r.retry.hidden = false;
    r.retry.textContent = t(r.parts?.some(part=>part.receipt) ? 'checkResult' : 'retry');
  }
  function loading(r) {
    clearTimeout(r.slow);
    r.host.dataset.busy = 'true';
    r.body.setAttribute('aria-busy','true');
    r.retry.hidden = true; r.label.textContent = t('translating');
    r.slow = setTimeout(() => { if (current(r)) r.label.textContent = t('slowTranslation'); },7000);
  }
  async function google(r) {
    loading(r);
    try {
      const result = [];
      for (const [chunk] of r.source.matchAll(/[\s\S]{1,2000}/gu)) {
        if (!current(r)) return;
        result.push(await service.translate(chunk,r.language));
      }
      success(r,result.join(''));
    } catch { if (!service.available()) stop(); else fail(r); }
  }
  function scheduleBatch(ms = 350) {
    if (!collecting && !running && pending.size) collecting = setTimeout(drain,ms);
  }
  function enqueue(r) {
    if (engine.kind === 'google') { google(r); return; }
    if (r.parts) for (const part of r.parts) delete part.error;
    loading(r);
    if (!r.parts) r.parts = XCTRelay.split(r.source).map(text=>({r,text,id:'p' + (++itemId),value:text.trim() ? undefined : text}));
    for (const part of r.parts) {
      if (part.value === undefined) pending.add(part);
    }
    if (pending.size >= 6 && !running) { clearTimeout(collecting); collecting = null; scheduleBatch(0); }
    else scheduleBatch();
  }
  function updateRecord(r) {
    if (!current(r)) return;
    if (r.parts.every(p=>p.value !== undefined)) success(r,r.parts.map(p=>p.value).join(''));
    else if (r.parts.some(p=>p.error)) fail(r,r.parts.find(p=>p.error === 'relayUnknown')?.error || r.parts.find(p=>p.error).error);
  }
  async function drain() {
    collecting = null; running = true;
    const groups = new Map(), items = [];
    let receipt;
    try {
      for (const part of pending) {
        if (!current(part.r)) { pending.delete(part); continue; }
        // Retry of an uncertain job queries that job only.
        if (receipt && part.receipt !== receipt || items.length && !receipt && part.receipt) continue;
        if (part.receipt) receipt = part.receipt;
        const key = JSON.stringify([engine.revision,language,part.text]);
        if (cache.has(key)) {
          part.value = cache.get(key); delete part.error; pending.delete(part); updateRecord(part.r); continue;
        }
        const id = part.receipt ? part.wireId : part.id;
        const item = {id,text:part.text};
        if (!groups.has(key) && !XCTRelay.fits([...items,item],language)) break;
        if (!groups.has(key)) { groups.set(key,{id,parts:[]}); items.push(item); }
        groups.get(key).parts.push(part); pending.delete(part);
      }
      if (!items.length) return;
      const jobId = receipt?.jobId || crypto.randomUUID();
      const active = () => [...groups.values()].some(group=>group.parts.some(part=>current(part.r)));
      let translations, error;
      try {
        const payload = {items,language,revision:engine.revision,scene:'post'};
        if (engine.kind === 'gemini') {
          const fresh = await XCTRelay.message('XCT_GEMINI_BATCH', payload);
          translations = new Map(fresh.map(item=>[item.id,item.translation]));
        } else {
          const hits = receipt ? [] : await XCTRelay.message('XCT_BATCH_LOOKUP',payload);
          translations = new Map(hits.map(item=>[item.id,item.translation]));
          for (const group of groups.values()) {
            if (!translations.has(group.id)) continue;
            for (const part of group.parts) {
              part.value = translations.get(group.id);part.error = undefined;updateRecord(part.r);
            }
          }
          const missing = items.filter(item=>!translations.has(item.id));
          if (missing.length && active()) {
            const fresh = await XCTRelay.run(jobId,{...payload,items:missing},active,receipt);
            for (const item of fresh) translations.set(item.id,item.translation);
            receipt = undefined;
          }
        }
      }
      catch (e) { error = e.message; receipt = e.receipt; }
      for (const [key,group] of groups) {
        const value = translations?.get(group.id);
        if (value && active()) {
          cache.set(key,value);
          if (cache.size > 500) cache.delete(cache.keys().next().value);
        }
        for (const part of group.parts) {
          part.value = value; part.error = value ? undefined : error || 'relayInvalid';
          part.receipt = value ? undefined : receipt;
          part.wireId = group.id; updateRecord(part.r);
        }
      }
    } finally { running = false; scheduleBatch(0); }
  }
  function mount(node,source) {
    const host = document.createElement('div');
    host.className = 'xct-post-translation';
    const root = host.attachShadow({mode:'open'});
    root.innerHTML = `<style>
      :host{display:block;margin:8px 0 4px;color:inherit}:host([hidden]),[hidden]{display:none!important}
      section{border-top:1px solid color-mix(in srgb,currentColor 22%,transparent);padding-top:6px}
      header{display:flex;align-items:center;gap:8px;min-height:20px;font:12px/1.5 system-ui;color:inherit}
      header span{opacity:.8}
      .ai-guide{position:relative;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:3px;border:0;border-radius:5px}
      .ai-guide:hover,.ai-guide:focus-visible{background:color-mix(in srgb,currentColor 12%,transparent)}
      .ai-guide:focus-visible{outline:2px solid currentColor;outline-offset:2px}
      .ai-guide svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
      .ai-guide .guide-tip{display:none;position:absolute;z-index:2;bottom:calc(100% + 4px);left:0;width:max-content;max-width:220px;background:Canvas;color:CanvasText;border:1px solid currentColor;border-radius:5px;padding:5px 8px;opacity:1}
      .ai-guide:is(:hover,:focus-visible) .guide-tip{display:block}:host([data-busy=true]) header::before{content:"";width:8px;height:8px;box-sizing:border-box;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:turn 1.2s linear infinite}
      @keyframes turn{to{transform:rotate(1turn)}}@media(prefers-reduced-motion:reduce){:host([data-busy=true]) header::before{animation:none}}
      button{background:transparent;color:inherit;border:1px solid currentColor;border-radius:12px;padding:2px 8px;font:inherit;cursor:pointer}
      p{margin:3px 0 0;white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}
      @media(prefers-reduced-motion:no-preference){:host([data-busy=false]) p:not(:empty){animation:appear .18s ease-out}@keyframes appear{from{opacity:.5}to{opacity:1}}}
    </style><section><header><span role="status"></span><button hidden></button><button hidden></button></header><p dir="auto"></p></section>`;
    root.querySelector('section').setAttribute('aria-label',t('postTranslation'));
    const [retry,toggle] = root.querySelectorAll('button');
    const guide = document.createElement('button');
    guide.type = 'button';guide.className = 'ai-guide';
    guide.setAttribute('aria-label',t('aiGuide'));
    guide.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="3"/><path d="M9 2v3m6-3v3M9 19v3m6-3v3M2 9h3m-3 6h3m14-6h3m-3 6h3M8 15l2-6 2 6m-3-2h2m4-4v6"/></svg><span class="guide-tip"></span>';
    guide.querySelector('span').textContent = t('aiGuide');
    guide.onclick = () => { chrome.runtime.sendMessage({type:'XCT_OPEN_GUIDE'}).catch(()=>{}); };
    root.querySelector('header').append(guide);
    const r = {node,source,host,language,retry,toggle,label:root.querySelector('span'),body:root.querySelector('p')};
    host.addEventListener('click',e=>{
      e.stopPropagation();e.preventDefault();
      if (e.composedPath().some(el => el instanceof Element && root.contains(el) && el.matches('button,a,input,select,textarea,[role="button"],[role="link"]'))) return;
      const shadowSel = typeof root.getSelection === 'function' ? root.getSelection() : null;
      if (shadowSel && !shadowSel.isCollapsed && shadowSel.toString()) return;
      const winSel = getSelection();
      if (winSel && !winSel.isCollapsed && winSel.toString()) return;
      if (!r.node.isConnected) return;
      r.node.dispatchEvent(new MouseEvent('click', {
        bubbles: true, cancelable: true, composed: true,
        view: e.view, detail: e.detail,
        screenX: e.screenX, screenY: e.screenY,
        clientX: e.clientX, clientY: e.clientY,
        ctrlKey: e.ctrlKey, altKey: e.altKey, shiftKey: e.shiftKey, metaKey: e.metaKey,
        button: e.button, buttons: e.buttons,
      }));
    });
    retry.onclick = () => enqueue(r);
    toggle.onclick = () => {r.original = !r.original;render(r);};
    node.after(host); records.set(node,r); enqueue(r);
  }
  function scan() {
    if (stopped || !ready) return;
    if (!service.available()) {stop();return;}
    for (const r of records.values()) {
      if (!current(r) || sameLanguage(r.node)) remove(r);
    }
    if (!enabled || inChat()) return;
    document.querySelectorAll(selector).forEach(node=>{
      if (records.has(node) || sameLanguage(node) || node.closest('[contenteditable="true"]')) return;
      const box = node.getBoundingClientRect();
      if (!box.width || !box.height || box.bottom < 0 || box.top > innerHeight) return;
      const source = sourceText(node);
      if (source && /\p{L}/u.test(source)) mount(node,source);
    });
  }
  function sameLanguage(node) { return node.lang.toLowerCase().split('-')[0] === language.toLowerCase().split('-')[0]; }
  function schedule() {
    if (!stopped && !scanning) scanning = setTimeout(()=>{scanning=null;scan();},180);
  }
  function onSettings(changes,area) {
    if (area !== 'local') return;
    if (changes.postDisplayMode) {mode=changes.postDisplayMode.newValue;for (const r of records.values()) render(r);}
    if (changes.postsEnabled) enabled = changes.postsEnabled.newValue !== false;
    if (changes.incomingLanguage) language = changes.incomingLanguage.newValue || readingLanguage;
    if (changes.postEngine) {engine=changes.postEngine.newValue || {kind:'google'};cache.clear();}
    if (changes.postsEnabled || changes.incomingLanguage || changes.postEngine) {clear();schedule();}
  }
  const observer = new MutationObserver(schedule);
  function stop() {
    stopped=true;clearTimeout(scanning);clearTimeout(collecting);observer.disconnect();
    removeEventListener('scroll',schedule,true);removeEventListener('resize',schedule);
    try {chrome.storage.onChanged.removeListener(onSettings);} catch {}
    clear();
  }
  globalThis.xctPostTranslations = {stop};
  chrome.storage.onChanged.addListener(onSettings);
  chrome.storage.local.get(['postsEnabled','incomingLanguage','postEngine','postDisplayMode']).then(data=>{
    if (stopped) return;
    enabled=data.postsEnabled !== false; language=data.incomingLanguage || readingLanguage;
    engine=data.postEngine || {kind:'google'};mode=data.postDisplayMode || 'both';ready=true;
    observer.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['lang']});
    addEventListener('scroll',schedule,true);addEventListener('resize',schedule); scan();
  }).catch(stop);
})();
