(() => {
  const LANGUAGES = [
    ['en', '英语'], ['es', '西班牙语'], ['ja', '日语'], ['ko', '韩语'],
    ['fr', '法语'], ['de', '德语'], ['pt', '葡萄牙语'], ['ar', '阿拉伯语'],
    ['ru', '俄语'], ['zh-CN', '简体中文'],
  ];
  const requestEvent = 'xct:send-request';
  const responseEvent = 'xct:send-response';
  let mounted = null;
  let sequence = 0;
  let selectedLanguage = 'en';
  let settingsOpen = true;
  let enabled = true;
  let incomingEnabled = true;
  let incomingLanguage = 'zh-CN';
  let showOriginal = true;
  let incomingSequence = 0;
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
  function requestTranslation(source, language) {
    const key = translationKey(source, language);
    const cached = cachedTranslation(key);
    if (cached !== null) return Promise.resolve(cached);
    if (translationRequests.has(key)) return translationRequests.get(key);
    if (!runtimeAvailable()) return Promise.reject(new Error('插件已更新，请刷新聊天页面'));
    const request = Promise.resolve()
      .then(() => chrome.runtime.sendMessage({ type: 'XCT_TRANSLATE', text: source, language }))
      .then((response) => {
        if (!response?.ok) throw new Error(response?.error || '翻译失败');
        rememberTranslation(key, response.text);
        return response.text;
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
    const message = !enabled ? '翻译已暂停' :
      status === 'ready' ? preview :
      status === 'translating' ? '正在翻译…' :
      status === 'sending' ? '正在发送译文…' :
      status === 'error' ? statusText :
      '';
    ui.querySelector('.xct-preview').textContent = message;
    ui.querySelector('.xct-state').textContent = status === 'ready' ? '按 Enter 发送译文' :
      status === 'error' ? '发送已暂停' :
      '';
    ui.querySelector('.xct-language').textContent = languageName;
    ui.querySelector('.xct-card').dataset.state = status;
    ui.querySelector('.xct-card').hidden = !draft.trim();
    settingsUi.querySelector('.xct-toggle').textContent = enabled ? '已开启' : '已暂停';
    settingsUi.querySelector('.xct-incoming-toggle').textContent = incomingEnabled ? '已开启' : '已暂停';
    settingsUi.querySelector('.xct-original-toggle').textContent = showOriginal ? '显示' : '隐藏';
    settingsUi.querySelector('.xct-target').value = selectedLanguage;
    settingsUi.querySelector('.xct-incoming-target').value = incomingLanguage;
    settingsUi.querySelector('.xct-collapse').setAttribute('aria-label', settingsOpen ? '收起翻译设置' : '展开翻译设置');
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
        requestTranslation(source, language),
        new Promise((_, reject) => setTimeout(() => reject(new Error('翻译超时，请重试')), 15000)),
      ]);
      if (version !== sequence || source !== draft || language !== selectedLanguage || conversation !== conversationKey()) return;
      preview = response;
      status = 'ready';
    } catch (error) {
      if (!runtimeAvailable()) { dispose(); return; }
      if (version !== sequence) return;
      status = 'error';
      statusText = error.message || '翻译失败';
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
    const data = await readStorage(['settingsOpen', 'incomingLanguage', 'incomingEnabled', 'showOriginal', 'sendEnabled']);
    if (!data || disposed || !mounted) return;
    if (typeof data.settingsOpen === 'boolean') settingsOpen = data.settingsOpen;
    if (LANGUAGES.some(([code]) => code === data.incomingLanguage)) incomingLanguage = data.incomingLanguage;
    if (typeof data.incomingEnabled === 'boolean') incomingEnabled = data.incomingEnabled;
    if (typeof data.showOriginal === 'boolean') showOriginal = data.showOriginal;
    if (typeof data.sendEnabled === 'boolean') enabled = data.sendEnabled;
    render();
    refreshIncoming();
  }

  function runIncomingQueue() {
    while (incomingActive < 4 && incomingQueue.length) {
      const job = incomingQueue.shift();
      incomingActive++;
      requestTranslation(job.source, job.language)
        .then(job.resolve)
        .catch((error) => {
          if (!runtimeAvailable()) dispose();
          job.reject(error);
        })
        .finally(() => { incomingActive--; runIncomingQueue(); });
    }
  }

  function incomingTranslation(source, language) {
    const key = translationKey(source, language);
    const cached = cachedTranslation(key);
    if (cached !== null) return Promise.resolve(cached);
    if (queuedIncoming.has(key)) return queuedIncoming.get(key);
    const pending = new Promise((resolve, reject) => {
      incomingQueue.push({ key, source, language, resolve, reject });
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
      note.textContent = '翻译中…';
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
        note.textContent = '翻译失败 ';
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.textContent = '重试';
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
        resolve({ ok: false, error: '发送结果尚未确认，请先检查会话，勿重复发送' });
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
      statusText = outcome.error || '发送失败';
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
        .xct-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;color:var(--xct-muted);font-size:12px}
        .xct-top strong{color:var(--xct-heading);font-weight:650}.xct-preview{white-space:pre-wrap;word-break:break-word;color:var(--xct-text)}
        .xct-card[data-state="error"] .xct-preview{color:var(--xct-error)}.xct-state{font-size:11px;color:var(--xct-state);white-space:nowrap}
        button,select{font:inherit}button{cursor:pointer;border:0;background:transparent;color:var(--xct-accent);padding:1px 4px}
        button:hover{text-decoration:underline}button:disabled{color:var(--xct-disabled);cursor:not-allowed}button[hidden]{display:none}
      </style>
      <div class="xct-wrap">
        <div class="xct-card" data-state="idle">
          <div class="xct-top"><strong>发送前翻译 · <span class="xct-language">英语</span></strong><span><span class="xct-state"></span><button class="xct-retry" hidden>重试</button></span></div>
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
        .xct-collapse{display:flex;align-items:center;justify-content:center;min-width:30px;min-height:34px;font-size:25px;line-height:1}
        .xct-translate-icon{display:none;position:relative;width:24px;height:24px;font-size:15px;font-weight:700;line-height:1}
        .xct-translate-icon span:first-child{position:absolute;left:0;top:0;color:var(--xct-text)}
        .xct-translate-icon span:last-child{position:absolute;right:0;bottom:0;color:var(--xct-accent);background:var(--xct-icon-bg);border-radius:3px;padding:1px;font-size:13px}
        :host([data-open="false"]) .xct-collapse-arrow{display:none}
        :host([data-open="false"]) .xct-translate-icon{display:block}
        label{display:block;font-size:12px;color:var(--xct-muted);margin:14px 0 5px}
        select{font:inherit;width:100%;height:36px;border:1px solid var(--xct-control-border);border-radius:8px;background:var(--xct-control-bg);color:var(--xct-text);padding:0 7px}
        p{font-size:11px;color:var(--xct-subtle);margin:9px 0 12px}.xct-section{border-top:1px solid var(--xct-border);padding:12px 0}
        .xct-row{display:flex;align-items:center;justify-content:space-between;margin:10px 0;font-size:12px}
        button{font:inherit;cursor:pointer;border:0;background:transparent;color:var(--xct-accent);padding:2px 4px}
        .xct-toggle{border:1px solid var(--xct-control-border);border-radius:8px;padding:5px 10px}
        button:focus-visible,select:focus-visible{outline:2px solid #1d9bf0;outline-offset:2px}
        [hidden]{display:none!important}
      </style>
      <div class="xct-settings">
        <div class="xct-head"><span class="xct-title">翻译设置</span><button class="xct-collapse" aria-label="收起翻译设置"><span class="xct-collapse-arrow">‹</span><span class="xct-translate-icon" aria-hidden="true"><span>文</span><span>A</span></span></button></div>
        <div class="xct-settings-body">
          <div class="xct-section"><strong>发送消息</strong>
            <label for="xct-target">译成</label>
            <select id="xct-target" class="xct-target">${LANGUAGES.map(([code, label]) => `<option value="${escapeHtml(code)}">${escapeHtml(label)}</option>`).join('')}</select>
            <p>发送前预览译文；仅在译文就绪时发送</p>
            <div class="xct-row"><span>发送翻译</span><button class="xct-toggle">已开启</button></div>
          </div>
          <div class="xct-section"><strong>收到的消息</strong>
            <label for="xct-incoming-target">译成我的语言</label>
            <select id="xct-incoming-target" class="xct-incoming-target">${LANGUAGES.map(([code, label]) => `<option value="${escapeHtml(code)}">${escapeHtml(label)}</option>`).join('')}</select>
            <div class="xct-row"><span>自动翻译</span><button class="xct-incoming-toggle">已开启</button></div>
            <div class="xct-row"><span>显示原文</span><button class="xct-original-toggle">显示</button></div>
          </div>
          <p>语言与开关会自动保存。收到的译文显示在原消息下方。</p>
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
      (changes.incomingEnabled && changes.incomingEnabled.newValue !== incomingEnabled);
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
  globalThis.xctTranslationService = { translate: incomingTranslation, available: runtimeAvailable, languages: LANGUAGES };
  document.addEventListener('click', onDocumentClick, true);
  scanTimer = setInterval(scan, 500);
  scan();
})();
