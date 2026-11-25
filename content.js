(() => {
  const { t, languages: LANGUAGES, readingLanguage } = globalThis.XCTI18n;
  const requestEvent = 'xct:send-request';
  const responseEvent = 'xct:send-response';
  let mounted = null;
  let sequence = 0;
  let selectedLanguage = 'en';
  let settingsOpen = true;
  let enabled = true;
  let incomingEnabled = true;
  let incomingLanguage = readingLanguage;
  let showOriginal = true;
  let incomingSequence = 0;
  let chatIncomingEngine = { kind: 'google' };
  let chatOutgoingEngine = { kind: 'google' };
  const translationCache = new Map();
  const translationRequests = new Map();
  const queuedIncoming = new Map();
  let draft = '';
  let preview = '';
  let status = 'idle';
  let statusText = '';
  let translationTimer;
  let sendPending = false;
  let incomingActive = 0;
  const incomingQueue = [];
  let disposed = false;
  let scanTimer;

  function runtimeAvailable() {
    return !!globalThis.chrome?.runtime?.id && !!globalThis.chrome?.storage?.local;
  }

  async function readStorage(keys) {
    if (!runtimeAvailable()) return null;
    try { return await chrome.storage.local.get(keys); }
    catch (error) {
      if (!runtimeAvailable()) dispose();
      return null;
    }
  }

  async function persist(values) {
    if (!runtimeAvailable()) return;
    try { await chrome.storage.local.set(values); }
    catch (error) { if (!runtimeAvailable()) dispose(); }
  }

  function conversationKey() { return location.pathname; }
  function signature() { return `${conversationKey()}\n${selectedLanguage}\n${draft}`; }
  function isReady() { return status === 'ready' && !!preview; }
  function translationKey(source, language) { return `${language}\n${source}`; }
  function cachedTranslation(key) {
    if (!translationCache.has(key)) return null;
    const text = translationCache.get(key);
    translationCache.delete(key);
    translationCache.set(key, text);
    return text;
  }
  function rememberTranslation(key, text) {
    translationCache.delete(key);
    translationCache.set(key, text);
    if (translationCache.size > 500) translationCache.delete(translationCache.keys().next().value);
  }
  function requestTranslation(source, language, post = false, scene = 'chatOutgoing') {
    const activeEngine = post ? { kind: 'google' } : (scene === 'chatIncoming' ? chatIncomingEngine : chatOutgoingEngine);
    const engineTag = `${activeEngine.kind || 'google'}:${activeEngine.revision || ''}:`;
    const key = (post ? 'post:' : engineTag) + translationKey(source, language);
    const cached = cachedTranslation(key);
    if (cached !== null) return Promise.resolve(cached);
    if (translationRequests.has(key)) return translationRequests.get(key);
    if (!runtimeAvailable()) return Promise.reject(new Error(t('refreshRequired')));
    const request = Promise.resolve()
      .then(async () => {
        if (activeEngine.kind === 'gemini') {
          const response = await chrome.runtime.sendMessage({
            type: 'XCT_GEMINI_TRANSLATE',
            text: source,
            language,
            scene,
            revision: activeEngine.revision,
          });
          if (!response?.ok) throw new Error(t(response?.error || 'translationFailed'));
          return response.value;
        }
        if (activeEngine.kind === 'relay' && globalThis.XCTRelay) {
          const items = await XCTRelay.run(
            crypto.randomUUID(),
            { items: [{ id: 'chat_0', text: source }], language, revision: activeEngine.revision, scene },
            () => !disposed
          );
          const translated = items?.[0]?.translation?.trim();
          if (!translated) throw new Error(t('emptyTranslation'));
          return translated;
        }
        const response = await chrome.runtime.sendMessage({ type: post ? 'XCT_POST_GOOGLE' : 'XCT_TRANSLATE', text: source, language });
        if (!response?.ok) throw new Error(t(response?.errorCode || 'translationFailed', response?.status ? String(response.status) : []));
        return response.text;
      })
      .then((text) => {
        rememberTranslation(key, text);
        return text;
      });
    translationRequests.set(key, request);
    request.then(() => translationRequests.delete(key), () => translationRequests.delete(key));
    return request;
  }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  }

  function render() {
    if (disposed || !mounted) return;
    if (!runtimeAvailable()) { dispose(); return; }
    if (!mounted.host.isConnected || !mounted.settingsHost.isConnected ||
        !mounted.ui.querySelector('.xct-card') || !mounted.settingsUi.querySelector('.xct-collapse')) {
      unmount();
      return;
    }
    const { ui, settingsUi } = mounted;
    const languageName = LANGUAGES.find(([code]) => code === selectedLanguage)?.[1] || selectedLanguage;
    const message = !enabled ? t('paused') :
      status === 'ready' ? preview :
      status === 'translating' ? t('translating') :
      status === 'sending' ? t('sending') :
      status === 'error' ? statusText :
      '';
    ui.querySelector('.xct-preview').textContent = message;
    ui.querySelector('.xct-state').textContent = status === 'ready' ? t('enterToSend') :
      status === 'error' ? t('sendPaused') :
      '';
    ui.querySelector('.xct-language').textContent = languageName;
    ui.querySelector('.xct-card').dataset.state = status;
    ui.querySelector('.xct-card').hidden = !draft.trim();
    settingsUi.querySelector('.xct-toggle').textContent = enabled ? t('on') : t('off');
    settingsUi.querySelector('.xct-incoming-toggle').textContent = incomingEnabled ? t('on') : t('off');
    settingsUi.querySelector('.xct-original-toggle').textContent = showOriginal ? t('show') : t('hide');
    settingsUi.querySelector('.xct-target').value = selectedLanguage;
    settingsUi.querySelector('.xct-incoming-target').value = incomingLanguage;
    settingsUi.querySelector('.xct-collapse').setAttribute('aria-label', settingsOpen ? t('collapse') : t('expand'));
    settingsUi.querySelector('.xct-collapse').dataset.tip = t(settingsOpen ? 'collapse' : 'expand');
    settingsUi.querySelector('.xct-collapse').setAttribute('aria-expanded', String(settingsOpen));
    for (const [selector, active] of [['.xct-toggle', enabled], ['.xct-incoming-toggle', incomingEnabled], ['.xct-original-toggle', showOriginal]]) settingsUi.querySelector(selector).setAttribute('aria-pressed', String(active));
    settingsUi.querySelector('.xct-settings-body').hidden = !settingsOpen;
    ui.querySelector('.xct-retry').hidden = status !== 'error';
    positionSettings();
  }

  function positionSettings() {
    if (disposed || !mounted?.route?.isConnected || !mounted.settingsHost.isConnected) return;
    const { route, primaryColumn, settingsHost, host } = mounted;
    const xTheme = document.documentElement.getAttribute('data-theme');
    const knownTheme = xTheme === 'light' || xTheme === 'dim' || xTheme === 'dark';
    let theme = knownTheme ? xTheme : 'dark';
    if (!knownTheme) {
      const colors = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g)?.map(Number);
      if (colors?.length >= 3 && (colors[0] * .299 + colors[1] * .587 + colors[2] * .114) > 128) theme = 'light';
    }
    if (host.dataset.xctTheme !== theme) host.dataset.xctTheme = theme;
    if (settingsHost.dataset.xctTheme !== theme) settingsHost.dataset.xctTheme = theme;
    if (settingsOpen) {
      primaryColumn.style.width = mounted.originalPrimaryWidth;
      route.style.maxWidth = `calc(100vw - ${route.getBoundingClientRect().left + 300}px)`;
      mounted.dockRight = Math.min(window.innerWidth, route.getBoundingClientRect().right + 300);
    } else {
      route.style.maxWidth = mounted.originalMaxWidth;
      const routeLeft = route.getBoundingClientRect().left;
      const dockRight = Math.min(window.innerWidth, mounted.dockRight || route.getBoundingClientRect().right + 300);
      const stripLeft = Math.max(routeLeft, dockRight - 36);
      const columnInset = primaryColumn.getBoundingClientRect().right - route.getBoundingClientRect().right;
      primaryColumn.style.width = `${stripLeft - primaryColumn.getBoundingClientRect().left + columnInset}px`;
    }
    settingsHost.style.left = `${route.getBoundingClientRect().right}px`;
    settingsHost.style.top = '0';
    settingsHost.style.width = settingsOpen ? '300px' : '36px';
    settingsHost.style.height = '100vh';
    settingsHost.dataset.open = String(settingsOpen);
    settingsHost.style.display = 'block';
  }

  function invalidate() {
    sequence++;
    clearTimeout(translationTimer);
    preview = '';
    statusText = '';
    status = draft.trim() && enabled ? 'translating' : 'idle';
    render();
  }

  async function translate(version, source, language, conversation) {
    try {
      const response = await Promise.race([
        requestTranslation(source, language, false, 'chatOutgoing'),
        new Promise((_, reject) => setTimeout(() => reject(new Error(t('translationTimeout'))), 15000)),
      ]);
      if (version !== sequence || source !== draft || language !== selectedLanguage || conversation !== conversationKey()) return;
      preview = response;
      status = 'ready';
    } catch (error) {
      if (!runtimeAvailable()) { dispose(); return; }
      if (version !== sequence) return;
      status = 'error';
      statusText = error.message || t('translationFailed');
    }
    render();
  }

  function scheduleTranslation() {
    invalidate();
    if (!draft.trim() || !enabled) return;
    const version = sequence;
    const source = draft;
    const language = selectedLanguage;
    const conversation = conversationKey();
    translationTimer = setTimeout(() => translate(version, source, language, conversation), 350);
  }

  async function saveLanguage() {
    const key = `target:${conversationKey()}`;
    await persist({ [key]: selectedLanguage });
  }

  async function loadLanguage() {
    const conversation = conversationKey();
    const key = `target:${conversation}`;
    const data = await readStorage(key);
    if (!data || !mounted || mounted.conversation !== conversation) return;
    if (LANGUAGES.some(([code]) => code === data[key])) selectedLanguage = data[key];
    else selectedLanguage = 'en';
    scheduleTranslation();
  }

  async function loadPreferences() {
    const data = await readStorage(['settingsOpen', 'incomingLanguage', 'incomingEnabled', 'showOriginal', 'sendEnabled', 'chatIncomingEngine', 'chatOutgoingEngine']);
    if (!data || disposed || !mounted) return;
    if (typeof data.settingsOpen === 'boolean') settingsOpen = data.settingsOpen;
    if (LANGUAGES.some(([code]) => code === data.incomingLanguage)) incomingLanguage = data.incomingLanguage;
    if (typeof data.incomingEnabled === 'boolean') incomingEnabled = data.incomingEnabled;
    if (typeof data.showOriginal === 'boolean') showOriginal = data.showOriginal;
    if (typeof data.sendEnabled === 'boolean') enabled = data.sendEnabled;
    if (data.chatIncomingEngine) chatIncomingEngine = data.chatIncomingEngine;
    if (data.chatOutgoingEngine) chatOutgoingEngine = data.chatOutgoingEngine;
    render();
    refreshIncoming();
  }

  function runIncomingQueue() {
    while (incomingActive < 4 && incomingQueue.length) {
      const job = incomingQueue.shift();
      incomingActive++;
      requestTranslation(job.source, job.language, job.post, job.post ? 'post' : 'chatIncoming')
        .then(job.resolve)
        .catch((error) => {
          if (!runtimeAvailable()) dispose();
          job.reject(error);
        })
        .finally(() => { incomingActive--; runIncomingQueue(); });
    }
  }

  function incomingTranslation(source, language, post = false) {
    const key = (post ? 'post:' : '') + translationKey(source, language);
    const cached = cachedTranslation(key);
    if (cached !== null) return Promise.resolve(cached);
    if (queuedIncoming.has(key)) return queuedIncoming.get(key);
    const pending = new Promise((resolve, reject) => {
      incomingQueue.push({ key, source, language, post, resolve, reject });
      runIncomingQueue();
    });
    queuedIncoming.set(key, pending);
    pending.then(() => queuedIncoming.delete(key), () => queuedIncoming.delete(key));
    return pending;
  }

  function refreshIncoming() {
    if (!mounted) return;
    const rows = [...mounted.root.querySelectorAll('[data-testid^="message-"]')]
      .filter((row) => /^message-[0-9a-f-]+$/.test(row.dataset.testid || ''));
    for (const row of rows) {
      const bubble = row.querySelector('[data-testid^="message-text-"]');
      if (!bubble) continue;
      const sourceNode = bubble.querySelector('span[dir="auto"] > span');
      const source = sourceNode?.textContent?.trim();
      const incoming = row.classList.contains('justify-start');
      const existing = bubble.querySelector(':scope > .xct-incoming-note');
      sourceNode?.toggleAttribute('hidden', incoming && incomingEnabled && !showOriginal && !!existing?.dataset.ready);
      if (!incoming || !source || !incomingEnabled) {
        existing?.remove();
        sourceNode?.removeAttribute('hidden');
        continue;
      }
      const key = `${incomingLanguage}\n${source}`;
      if (existing?.dataset.key === key) continue;
      existing?.remove();
      const note = document.createElement('div');
      note.className = 'xct-incoming-note';
      note.dataset.key = key;
      note.textContent = t('translating');
      bubble.appendChild(note);
      const version = incomingSequence;
      incomingTranslation(source, incomingLanguage).then((translated) => {
        if (version !== incomingSequence || !note.isConnected || note.dataset.key !== key) return;
        note.textContent = translated;
        note.dataset.ready = 'true';
        sourceNode.toggleAttribute('hidden', !showOriginal);
      }).catch(() => {
        if (version !== incomingSequence || !note.isConnected) return;
        sourceNode?.removeAttribute('hidden');
        note.textContent = t('translationFailed') + ' ';
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.textContent = t('retry');
        retry.style.cssText = 'color:inherit;background:transparent;border:1px solid currentColor;border-radius:8px;cursor:pointer;';
        retry.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          note.remove();
          refreshIncoming();
        });
        note.appendChild(retry);
      });
    }
  }

  function stopNative(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  async function sendTranslation() {
    if (!mounted || !isReady() || sendPending) return;
    const source = draft;
    const translated = preview;
    const language = selectedLanguage;
    const conversation = conversationKey();
    const currentSignature = signature();
    sendPending = true;
    status = 'sending';
    render();
    const id = crypto.randomUUID();
    const result = new Promise((resolve) => {
      const listener = (event) => {
        if (event.detail?.id !== id) return;
        document.removeEventListener(responseEvent, listener);
        clearTimeout(timer);
        resolve(event.detail);
      };
      const timer = setTimeout(() => {
        document.removeEventListener(responseEvent, listener);
        resolve({ ok: false, errorCode: 'sendUnconfirmed' });
      }, 15000);
      document.addEventListener(responseEvent, listener);
    });
    document.dispatchEvent(new CustomEvent(requestEvent, {
      detail: { id, source, translated, language, conversation },
    }));
    const outcome = await result;
    sendPending = false;
    if (disposed || !mounted) return;
    if (currentSignature !== signature() || source !== draft) return;
    if (outcome.ok) {
      // The page bridge clears X's controlled textarea only after send succeeds.
      draft = mounted?.input.value || '';
      scheduleTranslation();
      return;
    } else {
      status = 'error';
      statusText = t(outcome.errorCode || 'sendFailed');
    }
    render();
  }

  function mount(container, input, root) {
    const route = document.querySelector('[data-testid="xchatEmbedRoute"]');
    const primaryColumn = route.closest('[data-testid="primaryColumn"]');
    if (!primaryColumn) return;
    const originalMaxWidth = route.style.maxWidth;
    const originalPrimaryWidth = primaryColumn.style.width;
    const host = document.createElement('div');
    host.dataset.xctHost = '';
    host.style.cssText = 'position:absolute;bottom:calc(100% - 12px);right:0;z-index:100;width:100%;pointer-events:none;';
    container.appendChild(host);
    const ui = host.attachShadow({ mode: 'open' });
    ui.innerHTML = `
      <style>
        :host{--xct-text:#e7e9ea;--xct-heading:#f7f9f9;--xct-muted:#aab4bd;--xct-card:rgba(10,12,15,.86);--xct-card-border:#434a50b8;--xct-shadow:#0008;--xct-error:#ff8d87;--xct-state:#8bc8ff;--xct-accent:#65baff;--xct-disabled:#72808a;font:14px/1.45 system-ui,-apple-system,sans-serif;color:var(--xct-text)}
        :host([data-xct-theme="light"]){--xct-text:#0f1419;--xct-heading:#0f1419;--xct-muted:#536471;--xct-card:rgba(255,255,255,.88);--xct-card-border:#cfd9de;--xct-shadow:#0f141926;--xct-error:#c01c28;--xct-state:#006db3;--xct-accent:#006db3;--xct-disabled:#8b98a5}
        :host([data-xct-theme="dim"]){--xct-card:rgba(21,32,43,.88);--xct-card-border:#3d5466;--xct-shadow:#0006}
        *{box-sizing:border-box}.xct-wrap{display:flex;align-items:flex-end;justify-content:flex-end;pointer-events:none}
        .xct-card{pointer-events:auto;background:var(--xct-card);backdrop-filter:blur(12px);border:1px solid var(--xct-card-border);box-shadow:0 10px 30px var(--xct-shadow);border-radius:14px;width:100%;padding:10px 13px}
        .xct-card[hidden]{display:none}
        .xct-top{display:flex;flex-wrap:wrap;row-gap:4px;column-gap:12px;align-items:center;justify-content:space-between;margin-bottom:5px;color:var(--xct-muted);font-size:12px}
        .xct-top strong{color:var(--xct-heading);font-weight:650}.xct-preview{white-space:pre-wrap;word-break:break-word;color:var(--xct-text)}
        .xct-card[data-state="error"] .xct-preview{color:var(--xct-error)}.xct-state{font-size:11px;color:var(--xct-state);white-space:normal}
        button,select{font:inherit}button{cursor:pointer;border:0;background:transparent;color:var(--xct-accent);padding:1px 4px}
        button:hover{text-decoration:underline}button:disabled{color:var(--xct-disabled);cursor:not-allowed}button[hidden]{display:none}
      </style>
      <div class="xct-wrap">
        <div class="xct-card" data-state="idle">
          <div class="xct-top"><strong>${t('previewLabel')} · <span class="xct-language"></span></strong><span><span class="xct-state"></span><button class="xct-retry" hidden>${t('retry')}</button></span></div>
          <div class="xct-preview"></div>
        </div>
      </div>`;
    const settingsHost = document.createElement('div');
    settingsHost.dataset.xctSettingsHost = '';
    settingsHost.style.cssText = 'position:fixed;z-index:0;pointer-events:none;display:none;';
    primaryColumn.appendChild(settingsHost);
    const incomingStyle = document.createElement('style');
    incomingStyle.textContent = '.xct-incoming-note{margin-top:7px;padding-top:6px;border-top:1px solid #1d9bf080;color:inherit;opacity:.84;font-size:13px;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere}.xct-incoming-note[hidden]{display:none}[data-testid^="message-text-"]:has(>.xct-incoming-note){flex-direction:column;align-items:flex-start}';
    root.appendChild(incomingStyle);
    const settingsUi = settingsHost.attachShadow({ mode: 'open' });
    settingsUi.innerHTML = `
      <style>
        :host{--xct-bg:#0b0d10;--xct-text:#e7e9ea;--xct-muted:#aab4bd;--xct-subtle:#8b98a5;--xct-border:#2f3336;--xct-control-border:#434a50;--xct-control-bg:#17191d;--xct-accent:#65baff;--xct-icon-bg:#0b0d10;font:14px/1.45 system-ui,-apple-system,sans-serif;color:var(--xct-text)}
        :host([data-xct-theme="light"]){--xct-bg:#fff;--xct-text:#0f1419;--xct-muted:#536471;--xct-subtle:#536471;--xct-border:#cfd9de;--xct-control-border:#cfd9de;--xct-control-bg:#f7f9f9;--xct-accent:#006db3;--xct-icon-bg:#fff}
        :host([data-xct-theme="dim"]){--xct-bg:#15202b;--xct-border:#38444d;--xct-control-border:#536471;--xct-control-bg:#192734;--xct-icon-bg:#15202b}
        *{box-sizing:border-box}.xct-settings{pointer-events:auto;background:var(--xct-bg);border-left:1px solid var(--xct-border);border-right:1px solid var(--xct-border);height:100%;width:100%;padding:0 14px;overflow:auto}
        :host([data-open="false"]) .xct-settings{padding:0}
        .xct-head{display:flex;align-items:center;justify-content:space-between;font-weight:650;min-height:48px}
        :host([data-open="false"]) .xct-head{justify-content:center}
        :host([data-open="false"]) .xct-title{display:none}
        .xct-collapse{position:relative;display:flex;align-items:center;justify-content:center;min-width:30px;min-height:34px;font-size:25px;line-height:1}
        .xct-collapse:hover::after,.xct-collapse:focus-visible::after{content:attr(data-tip);position:fixed;right:4px;top:44px;max-width:280px;padding:6px 9px;border:1px solid var(--xct-control-border);border-radius:6px;background:var(--xct-bg);color:var(--xct-text);font:12px/1.5 system-ui;z-index:1}
        .xct-translate-icon{display:none;position:relative;width:24px;height:24px;font-size:15px;font-weight:700;line-height:1}
        .xct-translate-icon span:first-child{position:absolute;left:0;top:0;color:var(--xct-text)}
        .xct-translate-icon span:last-child{position:absolute;right:0;bottom:0;color:var(--xct-accent);background:var(--xct-icon-bg);border-radius:3px;padding:1px;font-size:13px}
        :host([data-open="false"]) .xct-collapse-arrow{display:none}
        :host([data-open="false"]) .xct-translate-icon{display:block}
        label{display:block;font-size:12px;color:var(--xct-muted);margin:14px 0 5px}
        select{appearance:none;box-sizing:border-box;font:12px system-ui;width:100%;height:30px;border:1px solid var(--xct-control-border);border-radius:6px;background-color:var(--xct-control-bg);color:var(--xct-text);padding-inline:10px 28px;background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath fill='%238b98a5' d='M0 0h10L5 6z'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-origin: border-box; background-position: right 10px center; background-size: 10px 6px;}
        select:dir(rtl){background-position:left 10px center}
        @media(forced-colors:active){select{appearance:auto;background-image:none;padding-inline-end:10px}}
        p{font-size:11px;color:var(--xct-subtle);margin:9px 0 12px}.xct-section{border-top:1px solid var(--xct-border);padding:12px 0}
        .xct-row{display:flex;align-items:center;justify-content:space-between;margin:10px 0;font-size:12px}
        button{font:inherit;cursor:pointer;border:0;background:transparent;color:var(--xct-accent);padding:2px 4px}
        .xct-toggle{border:1px solid var(--xct-control-border);border-radius:8px;padding:5px 10px}
        button:focus-visible,select:focus-visible{outline:2px solid #1d9bf0;outline-offset:2px}
        [hidden]{display:none!important}
      </style>
      <div class="xct-settings">
        <div class="xct-head"><span class="xct-title">${t('settings')}</span><button class="xct-collapse" aria-label="${t('collapse')}"><span class="xct-collapse-arrow">‹</span><span class="xct-translate-icon" aria-hidden="true"><span>文</span><span>A</span></span></button></div>
        <div class="xct-settings-body">
          <div class="xct-section"><strong>${t('outgoing')}</strong>
            <label for="xct-target">${t('translateTo')}</label>
            <select id="xct-target" class="xct-target">${LANGUAGES.map(([code, label]) => `<option value="${escapeHtml(code)}">${escapeHtml(label)}</option>`).join('')}</select>
            <p>${t('previewHint')}</p>
            <div class="xct-row"><span>${t('sendTranslation')}</span><button class="xct-toggle">${t('on')}</button></div>
          </div>
          <div class="xct-section"><strong>${t('incoming')}</strong>
            <label for="xct-incoming-target">${t('myLanguage')}</label>
            <select id="xct-incoming-target" class="xct-incoming-target">${LANGUAGES.map(([code, label]) => `<option value="${escapeHtml(code)}">${escapeHtml(label)}</option>`).join('')}</select>
            <div class="xct-row"><span>${t('autoTranslate')}</span><button class="xct-incoming-toggle">${t('on')}</button></div>
            <div class="xct-row"><span>${t('showOriginal')}</span><button class="xct-original-toggle">${t('show')}</button></div>
          </div>
          <p>${t('settingsHint')}</p>
        </div>
      </div>`;
    settingsUi.querySelector('.xct-collapse').addEventListener('click', () => {
      settingsOpen = !settingsOpen;
      persist({ settingsOpen });
      render();
    });
    settingsUi.querySelector('.xct-target').addEventListener('change', (event) => {
      selectedLanguage = event.target.value;
      saveLanguage();
      scheduleTranslation();
    });
    settingsUi.querySelector('.xct-toggle').addEventListener('click', () => {
      enabled = !enabled;
      persist({ sendEnabled: enabled });
      scheduleTranslation();
    });
    settingsUi.querySelector('.xct-incoming-target').addEventListener('change', (event) => {
      incomingLanguage = event.target.value;
      incomingSequence++;
      persist({ incomingLanguage });
      render();
      refreshIncoming();
    });
    settingsUi.querySelector('.xct-incoming-toggle').addEventListener('click', () => {
      incomingEnabled = !incomingEnabled;
      incomingSequence++;
      persist({ incomingEnabled });
      render();
      refreshIncoming();
    });
    settingsUi.querySelector('.xct-original-toggle').addEventListener('click', () => {
      showOriginal = !showOriginal;
      persist({ showOriginal });
      render();
      refreshIncoming();
    });
    ui.querySelector('.xct-retry').addEventListener('click', scheduleTranslation);
    const onInput = () => {
      if (draft === input.value) return;
      draft = input.value;
      scheduleTranslation();
    };
    const onKeyDown = (event) => {
      if (!enabled) return;
      if (event.target !== input || event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229) return;
      if (!input.value.trim()) return;
      stopNative(event);
      sendTranslation();
    };
    const onClick = (event) => {
      if (!enabled) return;
      if (!input.value.trim()) return;
      const button = event.target.closest?.('button');
      if (!button || !container.contains(button)) return;
      const label = button.getAttribute('aria-label') || '';
      const testId = button.getAttribute('data-testid') || '';
      if (!/send|发送/i.test(`${label} ${testId}`)) return;
      stopNative(event);
      sendTranslation();
    };
    root.addEventListener('keydown', onKeyDown, true);
    root.addEventListener('click', onClick, true);
    input.addEventListener('input', onInput);
    mounted = { host, ui, settingsHost, settingsUi, incomingStyle, route, primaryColumn, originalMaxWidth, originalPrimaryWidth, container, input, root, onKeyDown, onClick, onInput, conversation: conversationKey() };
    draft = input.value;
    loadLanguage();
    loadPreferences();
    render();
  }

  function unmount() {
    if (!mounted) return;
    const current = mounted;
    mounted = null;
    current.root?.removeEventListener('keydown', current.onKeyDown, true);
    current.root?.removeEventListener('click', current.onClick, true);
    current.input?.removeEventListener('input', current.onInput);
    current.host?.remove();
    current.settingsHost?.remove();
    current.incomingStyle?.remove();
    if (current.route) current.route.style.maxWidth = current.originalMaxWidth || '';
    if (current.primaryColumn) current.primaryColumn.style.width = current.originalPrimaryWidth || '';
    incomingSequence++;
    invalidate();
  }

  function scan() {
    if (disposed) return;
    if (!runtimeAvailable()) { dispose(); return; }
    const root = document.querySelector('[data-testid="xchatEmbedRoute"]')?.shadowRoot;
    const container = root?.querySelector('[data-testid="dm-composer-container"]');
    const input = root?.querySelector('[data-testid="dm-composer-textarea"]');
    if (mounted && (!root || !container || !input || mounted.container !== container || mounted.input !== input ||
        mounted.conversation !== conversationKey() || !mounted.host.isConnected || !mounted.settingsHost.isConnected)) unmount();
    if (!mounted && container && input) mount(container, input, root);
    if (mounted && draft !== input.value) {
      draft = input.value;
      scheduleTranslation();
    }
    if (mounted) {
      positionSettings();
      refreshIncoming();
    }
  }

  // X can replace its composer during navigation. Keep the native send blocked
  // during the short interval before the new input has been mounted.
  const onDocumentKeyDown = (event) => {
    if (!enabled) return;
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229) return;
    const input = event.composedPath().find((node) => node?.dataset?.testid === 'dm-composer-textarea');
    if (!input || !input.value.trim()) return;
    if (mounted?.input === input && mounted.conversation === conversationKey()) return;
    stopNative(event);
    scan();
  };
  const onDocumentClick = (event) => {
    if (!enabled) return;
    const button = event.composedPath().find((node) => node?.dataset?.testid === 'dm-composer-send-button');
    if (!button) return;
    const input = button.getRootNode().querySelector('[data-testid="dm-composer-textarea"]');
    if (!input?.value.trim()) return;
    if (mounted?.input === input && mounted.conversation === conversationKey()) return;
    stopNative(event);
    scan();
  };
  function dispose() {
    if (disposed) return;
    disposed = true;
    globalThis.xctPostTranslations?.stop();
    clearInterval(scanTimer);
    clearTimeout(translationTimer);
    document.removeEventListener('keydown', onDocumentKeyDown, true);
    document.removeEventListener('click', onDocumentClick, true);
    try { chrome.storage.onChanged.removeListener(onPreferencesChanged); } catch {}
    unmount();
  }
  function onPreferencesChanged(changes, area) {
    if (area !== 'local' || !mounted) return;
    const translationChanged = (changes.incomingLanguage && changes.incomingLanguage.newValue !== incomingLanguage) ||
      (changes.incomingEnabled && changes.incomingEnabled.newValue !== incomingEnabled) ||
      Boolean(changes.chatIncomingEngine);
    if (changes.chatIncomingEngine) chatIncomingEngine = changes.chatIncomingEngine.newValue || { kind: 'google' };
    if (changes.chatOutgoingEngine) {
      chatOutgoingEngine = changes.chatOutgoingEngine.newValue || { kind: 'google' };
      scheduleTranslation();
    }
    if (translationChanged) {
      incomingSequence++;
      mounted.root.querySelectorAll('.xct-incoming-note:not([data-ready])').forEach(note => note.remove());
    }
    if (translationChanged || (changes.showOriginal && changes.showOriginal.newValue !== showOriginal)) {
      loadPreferences();
    }
  }
  chrome.storage.onChanged.addListener(onPreferencesChanged);
  document.addEventListener('keydown', onDocumentKeyDown, true);
  // Shared only inside the extension's isolated world, including the bounded queue and LRU.
  globalThis.xctTranslationService = { translate: (source, language) => incomingTranslation(source, language, true), available: runtimeAvailable, languages: LANGUAGES };
  document.addEventListener('click', onDocumentClick, true);
  scanTimer = setInterval(scan, 500);
  scan();
})();
