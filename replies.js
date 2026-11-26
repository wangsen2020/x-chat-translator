(() => {
  globalThis.xctReplyTranslations?.stop();
  const {t, languages} = XCTI18n;
  const service = globalThis.xctTranslationService;
  if (!service) return;
  const records = new Map(), translations = new Map(), callbacks = new Map();
  let enabled = true, intercept = true, target = 'auto', engine = {kind:'google'}, hasReplyEngine = false;
  let skipNativeLanguage = true;
  let ready = false, stopped = false, scanning, aiBusy = false;
  const requestEvent = 'xct:reply-request', responseEvent = 'xct:reply-response';
  const refreshIcon = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1"/></svg>';
  function bridge(detail, callback) {
    const id = crypto.randomUUID();
    callbacks.set(id, callback);
    document.dispatchEvent(new CustomEvent(requestEvent, {detail:{...detail, id}}));
    return id;
  }
  function onResponse(event) {
    const value = event.detail, callback = callbacks.get(value?.id);
    if (callback) {callbacks.delete(value.id); callback(value);}
  }
  function context(input) {
    let value;
    const id = bridge({action:'context', editorId:input.dataset.xctReplyId}, result => {value = result.context;});
    callbacks.delete(id);
    return value;
  }
  const displayNames = typeof Intl?.DisplayNames === 'function' ? new Intl.DisplayNames([XCTI18n.language || 'en'], {type:'language'}) : null;
  const languageName = code => languages.find(([id]) => id === code)?.[1] || (code && displayNames?.of(code)) || code;
  function languageCode(raw) {
    const code = String(raw || '').toLowerCase().split(/[-_]/)[0];
    if (!/^[a-z]{2}$/.test(code) || code === 'un') return '';
    return code === 'zh' ? 'zh-CN' : code;
  }
  function language(r) {return target === 'auto' ? r.autoLanguage : target;}
  function signature(r) {return JSON.stringify([r.context.kind, r.context.postId, r.context.source, language(r), engine.kind, engine.revision, skipNativeLanguage]);}
  function current(r, key) {
    return !stopped && enabled && records.get(r.input) === r && r.input.isConnected && r.key === key && signature(r) === key;
  }
  function render(r) {
    const busy = ['translating','waiting','sending'].includes(r.state);
    r.host.hidden = !enabled || !r.context.source.trim();
    r.section.setAttribute('aria-busy', String(busy));
    r.section.dataset.busy = String(busy);
    r.select.options[0].textContent = t('replyAuto') + (r.autoLanguage ? ' · ' + languageName(r.autoLanguage) : '');
    r.select.value = target;
    r.engineSelect.value = engine.kind;
    r.toggle.checked = intercept;
    r.select.disabled = r.state === 'sending';
    r.engineSelect.disabled = r.state === 'sending';
    r.toggle.disabled = r.state === 'sending';
    r.body.textContent = r.translation || (r.state === 'sending' ? t('sending') : busy ? t(r.slow ? 'replySlow' : 'translating') : '');
    r.status.textContent = r.error ? t(r.error) : !language(r) ? t('replyChooseLanguage') :
      r.state === 'sending' ? t('sending') : r.pendingSend ? t('replyWaitingToSend') :
      r.translation && intercept ? t('replyEnterHint') : r.translation ? t('replyPreviewOnly') : '';
    r.retry.hidden = r.state !== 'error' || r.error === 'replySendUnknown';
    const retryLabel = t(r.entry?.receipt ? 'checkResult' : 'retry');
    r.retry.setAttribute('aria-label', retryLabel);
    r.retry.querySelector('span').textContent = retryLabel;
  }
  let detectorPromise;
  async function detectWithBuiltIn(text) {
    if (typeof self.LanguageDetector?.availability !== 'function') return '';
    if (await self.LanguageDetector.availability() !== 'available') return '';
    detectorPromise ||= self.LanguageDetector.create().catch(err => { detectorPromise = undefined; throw err; });
    const detector = await detectorPromise;
    const results = await detector.detect(text);
    const top = results?.[0];
    return top && top.confidence >= 0.4 ? languageCode(top.detectedLanguage) : '';
  }
  async function detect(r) {
    const original = r.context, marked = languageCode(original.language);
    r.autoLanguage = marked;
    const text = original.postText.replace(/https?:\/\/\S+/g, '').trim();
    if (text) {
      try {
        const aiLang = await detectWithBuiltIn(text);
        if (r.context.postId !== original.postId || stopped || records.get(r.input) !== r) return;
        if (aiLang) { r.autoLanguage = aiLang; update(r); return; }
      } catch {}
    }
    try {
      const detected = await chrome.i18n.detectLanguage(text);
      if (r.context.postId !== original.postId || stopped || records.get(r.input) !== r) return;
      const best = languageCode(detected.languages?.[0]?.language);
      r.autoLanguage = detected.isReliable && best ? best : best && marked && best !== marked ? '' : marked || '';
    } catch {}
    if (records.get(r.input) === r) update(r);
  }
  function loading(r) {
    clearTimeout(r.slowTimer);
    r.state = 'translating'; r.slow = false; r.error = '';
    r.slowTimer = setTimeout(() => {r.slow = true; render(r);}, 7000);
    render(r);
  }
  function trimCache() {
    if (translations.size < 128) return;
    for (const [key, entry] of translations) {
      if (entry.text && !entry.promise) translations.delete(key);
      if (translations.size < 128) break;
    }
  }
  async function resolveTranslation(entry) {
    if (entry.text) return entry.text;
    if (entry.promise) return entry.promise;
    const serialized = entry.kind === 'relay' || entry.kind === 'gemini';
    if (serialized && aiBusy) return null;
    if (serialized) aiBusy = true;
    entry.promise = (async () => {
      if (entry.kind === 'google') return service.translate(entry.source, entry.language);
      const items = XCTRelay.split(entry.source).map((text, i) => ({id:'reply_' + i, text}));
      if (!XCTRelay.fits(items, entry.language)) throw Error('invalidTranslation');
      const payload = {items, language:entry.language, revision:entry.revision, scene:'reply'};
      if (entry.kind === 'gemini') {
        const result = await XCTRelay.message('XCT_GEMINI_BATCH', payload);
        const values = new Map(result.map(item => [item.id, item.translation]));
        if (items.some(item => !values.get(item.id))) throw Error('relayInvalid');
        return items.map(item => values.get(item.id)).join('');
      }
      const cached = entry.receipt ? [] : await XCTRelay.message('XCT_BATCH_LOOKUP', payload);
      if (cached.length === items.length) return items.map(item => cached.find(hit => hit.id === item.id).translation).join('');
      entry.jobId ||= crypto.randomUUID();
      const result = await XCTRelay.run(entry.jobId, payload, () => !stopped, entry.receipt);
      const values = new Map(result.map(item => [item.id, item.translation]));
      if (items.some(item => !values.get(item.id))) throw Error('relayInvalid');
      entry.receipt = null;
      return items.map(item => values.get(item.id)).join('');
    })().then(text => {
      if (!text?.trim()) throw Error('emptyTranslation');
      entry.text = text; return text;
    }).catch(error => {
      if (error.receipt) entry.receipt = error.receipt;
      // Only a confirmed terminal failure may start a new translation job.
      if (!entry.receipt) entry.jobId = undefined;
      throw error;
    }).finally(() => {
      entry.promise = undefined;
      if (serialized) {
        aiBusy = false;
        for (const record of records.values()) if (record.state === 'waiting') queueMicrotask(() => translate(record));
      }
    });
    return entry.promise;
  }
  async function translate(r) {
    const key = r.key, selected = language(r), source = r.context.source.trim();
    if (!current(r, key) || !source || !selected || r.state === 'sending') return;
    if (skipNativeLanguage && await XCTI18n.matchesLanguage(source, selected)) {
      if (!current(r, key)) return;
      r.translation = r.context.source; r.state = 'ready'; r.error = '';
      clearTimeout(r.slowTimer); render(r);
      if (r.pendingSend && intercept) send(r);
      return;
    }
    if (!current(r, key)) return;
    const cacheKey = JSON.stringify([engine.kind, engine.revision, selected, source]);
    let entry = translations.get(cacheKey);
    if (!entry) {
      trimCache();
      if (translations.size >= 128) {r.state = 'error'; r.error = 'replyTooManyPending'; render(r); return;}
      entry = {source, language:selected, kind:engine.kind, revision:engine.revision};
      translations.set(cacheKey, entry);
    } else {translations.delete(cacheKey); translations.set(cacheKey, entry);}
    r.entry = entry;
    if (entry.receipt && !r.queryRequested) {
      r.state = 'error'; r.error = 'relayUnknown'; r.pendingSend = false; render(r); return;
    }
    r.queryRequested = false;
    loading(r);
    try {
      const text = await resolveTranslation(entry);
      if (!current(r, key) || ['sending','sent'].includes(r.state)) return;
      if (text === null) {r.state = 'waiting'; render(r); return;}
      r.translation = text; r.state = 'ready'; r.error = '';
      clearTimeout(r.slowTimer); render(r);
      if (r.pendingSend && intercept) send(r);
    } catch (error) {
      if (!current(r, key)) return;
      r.pendingSend = false; r.state = 'error';
      r.error = error.message?.startsWith('relay') || error.message?.startsWith('gemini') || ['invalidTranslation','emptyTranslation'].includes(error.message) ? error.message : 'translationFailed';
      clearTimeout(r.slowTimer); render(r);
    }
  }
  function update(r, force = false) {
    const next = signature(r);
    if (r.key === next && !force) return;
    if (r.state === 'sending') return;
    clearTimeout(r.timer); clearTimeout(r.slowTimer);
    r.key = next; r.pendingSend = false; r.translation = ''; r.error = ''; r.entry = null;
    r.state = 'idle';
    const selected = language(r), source = r.context.source.trim();
    if (enabled && source && selected) {
      const cacheKey = JSON.stringify([engine.kind, engine.revision, selected, source]);
      const cached = translations.get(cacheKey);
      if (cached?.text && !skipNativeLanguage) {
        translations.delete(cacheKey); translations.set(cacheKey, cached);
        r.entry = cached; r.translation = cached.text; r.state = 'ready';
        render(r);
        if (r.pendingSend && intercept) send(r);
        return;
      }
      loading(r);
      r.timer = setTimeout(() => translate(r), engine.kind === 'google' ? 350 : 900);
    } else render(r);
  }
  function send(r) {
    if (!enabled || !intercept || ['sending','sent'].includes(r.state) || r.error === 'replySendUnknown') return;
    const latest = context(r.input);
    if (!latest || latest.postId !== r.context.postId || latest.kind !== r.context.kind || latest.source !== r.context.source) {
      if (latest) {r.context = latest; update(r);}
      return;
    }
    if (r.state !== 'ready' || !r.translation) {
      if (r.state !== 'error') {r.pendingSend = true; render(r);}
      return;
    }
    r.pendingSend = false; r.state = 'sending'; render(r);
    r.nativeDispatch = true;
    r.requestId = bridge({action:'send', editorId:r.input.dataset.xctReplyId, source:r.context.source,
      postId:r.context.postId, kind:r.context.kind, translation:r.translation}, outcome => {
      clearTimeout(r.sendTimer);
      r.state = outcome.ok ? 'sent' : 'error';
      r.error = outcome.ok ? '' : outcome.errorCode || 'replySendUnknown';
      render(r); schedule();
    });
    r.nativeDispatch = false;
    // A lost bridge receipt never permits a replay.
    if (r.state === 'sending') r.sendTimer = setTimeout(() => {
      callbacks.delete(r.requestId); r.state = 'error'; r.error = 'replySendUnknown'; render(r);
    }, 32000);
  }
  async function save(values) {
    try {await chrome.storage.local.set(values);} catch {for (const r of records.values()) {r.error = 'saveFailed'; render(r);}}
  }
  function mount(input, info) {
    const host = document.createElement('div'); host.className = 'xct-reply-preview';
    const root = host.attachShadow({mode:'open'});
    root.innerHTML = `<style>
      :host{display:block;width:100%;min-width:0;margin:6px 0 10px;flex:0 0 auto;color:inherit;font:13px/1.5 system-ui;white-space:normal;text-align:start}
      :host([hidden]),[hidden],p:empty,.status:empty{display:none!important}
      section{display:grid;gap:8px;border:1px solid color-mix(in srgb,currentColor 24%,transparent);border-radius:10px;padding:10px;background:color-mix(in srgb,currentColor 4%,transparent)}
      header,label,footer{display:flex;align-items:center;font-size:12px}
      header{flex-wrap:wrap;margin-bottom:-4px}
      header > *{margin-bottom:4px}
      header > :not(:last-child),label > :not(:last-child),footer > :not(:last-child){margin-inline-end:10px}
      .language-label{flex:1.4 1 170px;min-width:0}.engine-label{flex:1 1 140px;min-width:0}
      .language-label > .label-text,.engine-label > span{flex:none;white-space:nowrap}
      .info-tip{position:relative;display:inline-flex;align-items:center;justify-content:center;flex:none;width:14px;height:14px;border-radius:50%;background:#769287;color:#fff;font:700 10px/1 Arial,sans-serif;border:0;cursor:help;margin-inline-start:-4px;margin-inline-end:10px}
      .info-tip span{display:none;position:absolute;z-index:4;left:0;bottom:calc(100% + 6px);width:max-content;max-width:240px;padding:6px 8px;border-radius:6px;background:Canvas;color:CanvasText;border:1px solid currentColor;font:400 12px/1.4 system-ui;white-space:normal;text-align:start}
      .info-tip:is(:hover,:focus-visible) span{display:block}.info-tip:focus-visible{outline:2px solid #1d9bf0;outline-offset:2px}
      select{appearance:none;box-sizing:border-box;min-width:0;flex:1;height:30px;padding-inline:10px 28px;border:1px solid color-mix(in srgb,currentColor 35%,transparent);border-radius:6px;background-color:transparent;color:inherit;font:inherit;cursor:pointer}
      select{background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath fill='%238b98a5' d='M0 0h10L5 6z'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-origin: border-box; background-position: right 10px center; background-size: 10px 6px;}
      select:dir(rtl){background-position:left 10px center}
      @media(forced-colors:active){select{appearance:auto;background-image:none;padding-inline-end:10px}}
      select option{background:Canvas;color:CanvasText}
      p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;max-height:180px;overflow-y:auto;overscroll-behavior:contain}
      footer{flex-wrap:wrap;row-gap:4px}
      .status{flex:1 1 180px;min-width:0;overflow-wrap:anywhere}
      .intercept{min-height:24px;white-space:nowrap;cursor:pointer}
      input{accent-color:#1d9bf0;width:16px;height:16px;margin:0}
      button{position:relative;width:30px;height:30px;flex:none;padding:5px;border:0;border-radius:6px;color:inherit;background:transparent;cursor:pointer}button svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}button:hover{background:color-mix(in srgb,currentColor 12%,transparent)}button span{display:none;position:absolute;z-index:4;right:0;bottom:calc(100% + 5px);width:max-content;max-width:220px;padding:4px 8px;border-radius:5px;background:Canvas;color:CanvasText;border:1px solid currentColor}button:is(:hover,:focus-visible) span{display:block}:is(button,select,input):focus-visible{outline:2px solid #1d9bf0;outline-offset:3px}
      [data-busy=true] p::before{content:'';display:inline-block;width:10px;height:10px;margin-inline-end:10px;vertical-align:-2px;border:2px solid color-mix(in srgb,currentColor 30%,transparent);border-top-color:currentColor;border-radius:50%;animation:xct-reply-spin .8s linear infinite}
      @keyframes xct-reply-spin{to{transform:rotate(1turn)}}
      @media(prefers-reduced-motion:reduce){[data-busy=true] p::before{animation:none}}
    </style><section><header><label class="language-label"><span class="label-text"></span><span class="info-tip" tabindex="0" role="note">?<span></span></span><select class="target-select"></select></label><label class="engine-label"><span></span><select class="engine-select"></select></label><button type="button" hidden>${refreshIcon}<span></span></button></header><p dir="auto"></p><footer><label class="intercept"><input type="checkbox"><span></span></label><span class="status" role="status" aria-live="polite"></span></footer></section>`;
    const r = {input, context:info, host, root, section:root.querySelector('section'), select:root.querySelector('.target-select'),
      engineSelect:root.querySelector('.engine-select'), toggle:root.querySelector('input'), body:root.querySelector('p'), status:root.querySelector('.status'), retry:root.querySelector('button'), autoLanguage:languageCode(info.language)};
    r.section.setAttribute('aria-label', t('replyPreview'));
    root.querySelector('.language-label .label-text').textContent = t('replyTarget');
    const tip = root.querySelector('.info-tip');
    tip.setAttribute('aria-label', t('replyAutoTip'));
    tip.querySelector('span').textContent = t('replyAutoTip');
    root.querySelector('.engine-label span').textContent = t('replyEngineShort');
    root.querySelector('.intercept span').textContent = t('replyIntercept');
    r.select.replaceChildren(new Option(t('replyAuto'), 'auto'), ...languages.map(([code, name]) => new Option(name, code)));
    r.engineSelect.replaceChildren(new Option('Google Translate', 'google'), new Option('Gemini API', 'gemini'), new Option('AgentRelay', 'relay'));
    r.select.onchange = () => save({replyTargetLanguage:r.select.value});
    r.engineSelect.onchange = async () => {
      const nextKind = r.engineSelect.value;
      if (nextKind === engine.kind) return;
      try {
        const nextEngine = typeof XCTRelay !== 'undefined'
          ? await XCTRelay.message('XCT_SWITCH_SCENE_ENGINE', {scene:'reply', kind:nextKind})
          : {kind:nextKind, revision:engine.revision};
        hasReplyEngine = true;
        engine = nextEngine || {kind:nextKind, revision:engine.revision};
        for (const rec of records.values()) {update(rec, true); render(rec);}
      } catch (error) {
        r.engineSelect.value = engine.kind;
        r.error = error.message || 'translationFailed';
        render(r);
      }
    };
    r.toggle.onchange = () => save({replyInterceptEnabled:r.toggle.checked});
    r.retry.onclick = () => {r.queryRequested = true; r.error = ''; translate(r);};
    // Keep editor focus and reply shortcuts outside the preview's controls.
    for (const type of ['keydown', 'pointerdown', 'mousedown', 'mouseup', 'click', 'focusin', 'focusout']) {
      host.addEventListener(type, event => event.stopPropagation());
    }
    // X measures RichTextInputContainer itself; children there can be clipped or affect its height.
    // The label's outer row sits in the native composer's column, before attachments and toolbar.
    const label = input.closest('[data-testid$="_label"]');
    (label?.parentElement || input.closest('.DraftEditor-root') || input).after(host);
    records.set(input, r); update(r); detect(r);
    return r;
  }
  function remove(r) {
    clearTimeout(r.timer); clearTimeout(r.slowTimer); clearTimeout(r.sendTimer);
    callbacks.delete(r.requestId); r.host.remove(); records.delete(r.input);
    r.toolbar?.removeAttribute('data-xct-reply-toolbar');
    delete r.input.dataset.xctReplyId;
  }
  function alignToolbar(r) {
    let toolbar;
    if (enabled) {
      for (let ancestor = r.host.parentElement; ancestor && !ancestor.matches('main,body'); ancestor = ancestor.parentElement) {
        const toolbars = ancestor.querySelectorAll('[data-testid="toolBar"]');
        if (!toolbars.length) continue;
        if (toolbars.length === 1 && ancestor.querySelectorAll('[contenteditable="true"][data-testid^="tweetTextarea_"]').length === 1) toolbar = toolbars[0];
        break;
      }
    }
    if (toolbar === r.toolbar) return;
    r.toolbar?.removeAttribute('data-xct-reply-toolbar');
    if (toolbar) toolbar.setAttribute('data-xct-reply-toolbar', '');
    r.toolbar = toolbar;
  }
  function scan() {
    scanning = undefined;
    if (stopped || !ready) return;
    if (!service.available()) {stop(); return;}
    for (const r of records.values()) if (!r.input.isConnected || !r.host.isConnected) remove(r);
    if (!enabled) return;
    document.querySelectorAll('[contenteditable="true"][data-testid^="tweetTextarea_"]').forEach(input => {
      input.dataset.xctReplyId ||= crypto.randomUUID();
      const info = context(input), r = records.get(input);
      if (!info) {if (r) remove(r); return;}
      if (!r) {alignToolbar(mount(input, info)); return;}
      alignToolbar(r);
      const changedPost = r.context.postId !== info.postId || r.context.kind !== info.kind;
      r.context = info; update(r);
      if (changedPost) detect(r);
    });
  }
  function schedule() {if (!stopped && !scanning) scanning = setTimeout(scan, 60);}
  const observer = new MutationObserver(schedule);
  const prevent = event => {event.preventDefault(); event.stopImmediatePropagation();};
  function hasTypeahead(input) {
    if (input.getAttribute('aria-expanded') === 'true') return true;
    const option = document.querySelector('[data-testid^="typeaheadDropdown"] [role="option"], [data-testid="TypeaheadUser"]');
    return Boolean(option && option.getBoundingClientRect().height > 0);
  }
  function onKey(event) {
    if (!enabled || !intercept || event.key !== 'Enter' || event.shiftKey || event.altKey || event.isComposing || event.keyCode === 229) return;
    const input = event.target.closest?.('[contenteditable="true"][data-testid^="tweetTextarea_"]');
    if (!input || hasTypeahead(input)) return;
    if (!ready) {if (refreshInput(input)?.context.source.trim()) prevent(event); return;}
    const r = refreshInput(input);
    if (r && r.context.source.trim()) {prevent(event); send(r);}
  }
  function onClick(event) {
    // Automation (including XFollower's quote publisher) already owns its
    // reviewed text. Only a direct user click opts into translated sending.
    if (!event.isTrusted || !enabled || !intercept) return;
    const button = event.target.closest?.('[data-testid="tweetButton"],[data-testid="tweetButtonInline"]');
    if (!button) return;
    scan();
    for (const r of records.values()) {
      if (r.nativeDispatch) continue;
      if (button.dataset.xctReplyButton !== r.input.dataset.xctReplyId) continue;
      if (r.context.source.trim()) {prevent(event); send(r);} return;
    }
  }
  function refreshInput(input) {
    input.dataset.xctReplyId ||= crypto.randomUUID();
    const info = context(input);
    if (!info) return null;
    let r = records.get(input);
    if (!r) r = mount(input, info);
    else {r.context = info; update(r);}
    return r;
  }
  function onSettings(changes, area) {
    if (area !== 'local') return;
    if (changes.skipNativeLanguage) skipNativeLanguage = changes.skipNativeLanguage.newValue !== false;
    if (changes.replyTranslationEnabled) enabled = changes.replyTranslationEnabled.newValue !== false;
    if (changes.replyInterceptEnabled) intercept = changes.replyInterceptEnabled.newValue !== false;
    if (changes.replyTargetLanguage) target = changes.replyTargetLanguage.newValue || 'auto';
    let engineChanged = false;
    if (changes.replyEngine) {
      const nextEngine = changes.replyEngine.newValue || {kind:'google'};
      const same = hasReplyEngine === Boolean(changes.replyEngine.newValue) &&
        engine.kind === nextEngine.kind && engine.revision === nextEngine.revision;
      hasReplyEngine = Boolean(changes.replyEngine.newValue);
      engine = nextEngine;
      engineChanged = !same;
    } else if (!hasReplyEngine && changes.postEngine) {
      engine = changes.postEngine.newValue || {kind:'google'};
      engineChanged = true;
    }
    if (!engineChanged && !['skipNativeLanguage','replyTranslationEnabled','replyInterceptEnabled','replyTargetLanguage'].some(key => changes[key])) return;
    configureBridge();
    for (const r of records.values()) {
      if (changes.replyTranslationEnabled) alignToolbar(r);
      if (!intercept || !enabled) r.pendingSend = false;
      update(r, !!changes.skipNativeLanguage || engineChanged || !!changes.replyTranslationEnabled || !!changes.replyTargetLanguage);
      render(r);
    }
    schedule();
  }
  function configureBridge() {
    document.dispatchEvent(new CustomEvent(requestEvent, {detail:{id:crypto.randomUUID(), action:'configure', enabled:enabled && intercept}}));
  }
  function stop() {
    stopped = true; clearTimeout(scanning); observer.disconnect();
    document.dispatchEvent(new CustomEvent(requestEvent, {detail:{id:crypto.randomUUID(),action:'configure',enabled:false}}));
    for (const r of records.values()) remove(r);
    callbacks.clear();
    document.removeEventListener(responseEvent, onResponse);
    document.removeEventListener('input', schedule, true);
    document.removeEventListener('compositionend', schedule, true);
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('click', onClick, true);
    try {chrome.storage?.onChanged?.removeListener(onSettings);} catch {}
  }
  document.addEventListener(responseEvent, onResponse);
  document.addEventListener('input', schedule, true);
  document.addEventListener('compositionend', schedule, true);
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('click', onClick, true);
  chrome.storage.onChanged.addListener(onSettings);
  globalThis.xctReplyTranslations = {stop};
  chrome.storage.local.get(['replyTranslationEnabled','replyInterceptEnabled','replyTargetLanguage','replyEngine','postEngine','skipNativeLanguage']).then(data => {
    if (stopped) return;
    skipNativeLanguage = data.skipNativeLanguage !== false;
    enabled = data.replyTranslationEnabled !== false; intercept = data.replyInterceptEnabled !== false;
    target = data.replyTargetLanguage || 'auto';
    hasReplyEngine = Boolean(data.replyEngine);
    engine = data.replyEngine || data.postEngine || {kind:'google'}; ready = true;
    configureBridge();
    observer.observe(document.body, {childList:true, subtree:true, characterData:true}); scan();
  }).catch(stop);
})();
