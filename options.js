const {t,localize,languages,readingLanguage} = XCTI18n;
const el = id => document.getElementById(id);
const samples = [
  {id:'field',name:'Field Notes',text:'La lumière revient sur le lac.',en:'The light returns to the lake.','zh-CN':'湖面又有了光。'},
  {id:'studio',name:'Studio Letter',text:'新しい書体を今日公開しました。',en:'We released a new typeface today.','zh-CN':'我们今天发布了一款新字体。'}
];
let revision = 0, dirty = false, trial, busy = false, results = null;
let activeProvider = 'google';

function notify(key, error = false, targetId = 'feedback') {
  const node = el(targetId);
  if (!node) return;
  node.textContent = key ? t(key) || t('relayOffline') : '';
  node.classList.toggle('error', error);
}
function switchTab(tab) {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.setAttribute('aria-selected', String(btn.dataset.tab === tab));
  });
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.hidden = panel.id !== 'tab-' + tab;
  });
}
function selectProvider(name) {
  activeProvider = name;
  document.querySelectorAll('.provider-item').forEach(btn => {
    btn.setAttribute('aria-selected', String(btn.dataset.provider === name));
  });
  document.querySelectorAll('.provider-pane').forEach(pane => {
    pane.hidden = pane.id !== 'pane-' + name;
  });
  resetTrial();
}
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.onclick = () => switchTab(btn.dataset.tab);
});
document.querySelectorAll('.provider-item').forEach(btn => {
  btn.onclick = () => selectProvider(btn.dataset.provider);
});

function applyTheme(theme) {
  const mode = theme === 'light' || theme === 'dark' ? theme : 'auto';
  const resolved = mode === 'auto' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : mode;
  document.documentElement.dataset.theme = resolved;
}
function readPrefs(data) {
  el('enabled').checked = data.postsEnabled !== false;
  el('language').value = data.incomingLanguage || readingLanguage;
  document.querySelector('[name=mode][value=' + (data.postDisplayMode === 'replace' ? 'replace' : 'both') + ']').checked = true;
  const theme = data.optionsTheme || 'auto';
  document.querySelector('[name=theme][value=' + (['light','dark'].includes(theme) ? theme : 'auto') + ']').checked = true;
  applyTheme(theme);
}
function draw() {
  const enabled = el('enabled').checked;
  const replace = document.querySelector('[value=replace]').checked;
  const target = el('language').value;
  el('feed').replaceChildren(...samples.map(post=>{
    const article = document.createElement('article'), name = document.createElement('p');
    name.className = 'byline'; name.textContent = post.name;
    const original = document.createElement('p'), translation = document.createElement('p');
    original.className = 'source'; original.textContent = post.text;
    const text = results ? results.get(post.id) : post[target];
    translation.className = 'translation'; translation.textContent = text || '';
    const show = enabled && !busy && text;
    translation.hidden = !show; original.hidden = Boolean(show && replace);
    article.append(name,original,translation);
    if (show && replace) {
      const button = document.createElement('button'); button.className='original';button.textContent=t('showOriginal');
      button.onclick=()=>{original.hidden=!original.hidden;translation.hidden=!original.hidden;button.textContent=t(original.hidden?'showOriginal':'showTranslation');};
      article.append(button);
    }
    return article;
  }));
  el('preview-caption').textContent = t(busy ? 'translating' : results ? 'trialResults' : 'sample');
  el('feed').setAttribute('aria-busy',String(busy));
  el('trial').disabled = busy || !enabled;
  el('trial').querySelector('span').textContent = t(trial?.unknown ? 'checkResult' : 'trialPosts');
}
function draft() {
  return {address:el('address').value,token:el('token').value,provider:el('provider').value,
    sessionId:el('session').value,sessionName:el('session').selectedOptions[0]?.textContent || ''};
}
function sceneEngines() {
  return {
    post: el('engine').value,
    reply: el('engine-reply').value,
    chatIncoming: el('engine-chat-incoming').value,
    chatOutgoing: el('engine-chat-outgoing').value,
  };
}
function geminiDraft() {
  return { apiKey: el('gemini-key').value, model: el('gemini-model').value || 'gemini-flash-lite-latest' };
}
function geminiPermission() {
  return chrome.permissions.request({ origins: ['https://generativelanguage.googleapis.com/*'] });
}
function permission(address) {
  const host = new URL(XCTRelay.origin(address)).hostname;
  return chrome.permissions.request({origins:['http://' + host + '/*']});
}
function hasPermission(address) {
  const host = new URL(XCTRelay.origin(address)).hostname;
  return chrome.permissions.contains({origins:['http://' + host + '/*']});
}
function showGuide(kind) {
  const dialog = el('relay-guide');
  if (!dialog) return;
  const notInstalled = kind === 'not_installed';
  el('guide-title').textContent = t(notInstalled ? 'relayNotInstalled' : 'relayNotRunning');
  el('guide-desc').textContent = t(notInstalled ? 'relayGuideNotInstalledBody' : 'relayGuideNotRunningBody');
  el('guide-learn').hidden = !notInstalled;
  if (!dialog.open) dialog.showModal();
}
function emptyList() { el('session').replaceChildren(new Option(t('pickSession'),'')); }

function serviceView() {
  const googleOn = el('google-enabled').checked;
  const geminiOn = el('gemini-enabled').checked;
  const relayOn = el('relay-enabled').checked;

  const googleBadge = document.querySelector('[data-provider="google"] .badge');
  if (googleBadge) {
    googleBadge.textContent = t(googleOn ? 'statusEnabled' : 'statusUnconfigured');
    googleBadge.classList.toggle('ready', googleOn);
  }
  el('gemini-badge').textContent = t(geminiOn ? 'statusEnabled' : 'statusUnconfigured');
  el('gemini-badge').classList.toggle('ready', geminiOn);
  el('relay-badge').textContent = t(relayOn ? 'statusEnabled' : 'statusUnconfigured');
  el('relay-badge').classList.toggle('ready', relayOn);

  const states = { google: googleOn, gemini: geminiOn, relay: relayOn };
  for (const id of ['engine', 'engine-reply', 'engine-chat-incoming', 'engine-chat-outgoing']) {
    for (const opt of el(id).options) {
      opt.disabled = !states[opt.value] && el(id).value !== opt.value;
    }
  }
}

function resetTrial() { revision++; busy=false; results=null; trial=null; draw(); }
function editBinding(targetId = 'feedback') {
  dirty = true;
  resetTrial();
  serviceView();
  notify('draftChanged', false, targetId);
}

for (const id of ['google-enabled', 'gemini-enabled', 'relay-enabled']) {
  el(id).onchange = async () => {
    serviceView();
    await chrome.storage.local.set({
      enabledProviders: {
        google: el('google-enabled').checked,
        gemini: el('gemini-enabled').checked,
        relay: el('relay-enabled').checked,
      },
    }).catch(() => {});
  };
}

el('relay-auto').onclick = async () => {
  selectProvider('relay');
  el('relay-enabled').checked = true;
  el('relay-enabled').onchange();
  await connectRelay(false);
};

for (const id of ['engine', 'engine-reply', 'engine-chat-incoming', 'engine-chat-outgoing']) {
  el(id).onchange = () => {
    editBinding('scenes-feedback');
    serviceView();
  };
}
el('session').onchange = () => editBinding();
el('gemini-key').addEventListener('input', () => editBinding());
el('gemini-model').onchange = () => editBinding();

async function loadProviders(preferredId, silent = false) {
  const config = draft();
  if (!config.address || !config.token) {
    if (!silent) notify('relayConfigError', true);
    return false;
  }
  try {
    if (!silent) {
      if (!await permission(config.address)) throw Error('relayForbidden');
      notify('detecting');
    }
    const list = await XCTRelay.message('XCT_RELAY_PROVIDERS', { draft: config });
    if (!Array.isArray(list) || !list.length) {
      if (!silent) throw Error('relayUnavailable');
      return false;
    }
    const target = preferredId || el('provider').value || list[0].id;
    el('provider').replaceChildren(...list.map(p => new Option(p.name, p.id)));
    if (list.some(p => p.id === target)) {
      el('provider').value = target;
    } else {
      el('provider').value = list[0].id;
    }
    return true;
  } catch (e) {
    if (!silent) notify(e.message, true);
    return false;
  }
}

async function loadSessions(silent = false) {
  const ticket = revision, config = draft();
  const button = el('refresh');
  button.disabled = true;
  if (!silent) notify('detecting');
  try {
    if (!await permission(config.address)) throw Error('relayForbidden');
    const sessions = await XCTRelay.message('XCT_RELAY_LIST', { draft: config });
    if (revision !== ticket) return;
    emptyList();
    const counts = new Map();
    for (const s of sessions) counts.set(s.name, (counts.get(s.name) || 0) + 1);
    for (const s of sessions) el('session').add(new Option(counts.get(s.name) > 1 ? s.name + ' · ' + s.id.slice(0, 8) : s.name, s.id));
    el('session').value = sessions.some(s => s.id === config.sessionId) ? config.sessionId : '';
    serviceView();
    notify(sessions.length ? 'pickSession' : 'emptySessions');
  } catch (e) {
    if (revision === ticket) { emptyList(); serviceView(); notify(e.message, true); }
  } finally {
    button.disabled = false;
  }
}

el('provider').onchange = async () => {
  emptyList();
  editBinding();
  if (draft().token && draft().address) {
    await loadSessions(false);
  }
};

for (const id of ['address', 'token']) {
  el(id).addEventListener('input', () => {
    emptyList();
    editBinding();
  });
  el(id).addEventListener('change', () => {
    if (el('address').value && el('token').value) {
      loadProviders(el('provider').value, true).catch(() => {});
    }
  });
}

async function connectRelay(silent = false) {
  if (!silent) notify('detecting');
  const probe = await XCTRelay.message('XCT_RELAY_PROBE').catch(() => null);
  if (probe?.status === 'not_installed' || probe?.status === 'installed_not_running') {
    if (!silent) {
      showGuide(probe.status);
      notify(probe.status === 'not_installed' ? 'relayNotInstalled' : 'relayNotRunning', true);
    }
    return false;
  }
  if (probe?.status === 'auth_mismatch') {
    if (!silent) notify('relayAuth', true);
    return false;
  }
  if (probe?.status === 'port_conflict') {
    if (!silent) notify('relayPortConflict', true);
    return false;
  }
  if (probe?.status === 'running') {
    if (probe.baseUrl && (!el('address').value.trim() || el('address').value.trim() === 'http://127.0.0.1:8787')) {
      el('address').value = probe.baseUrl;
    }
    if (probe.token && el('token').value !== probe.token) {
      el('token').value = probe.token;
      dirty = true;
    }
    serviceView();
  } else if (probe?.status === 'error' && !el('token').value.trim()) {
    if (!silent) notify('relayOffline', true);
    return false;
  }
  try {
    const allowed = silent ? await hasPermission(el('address').value) : await permission(el('address').value);
    if (!allowed) {
      if (!silent) notify('relayForbidden', true);
      return false;
    }
  } catch (e) {
    if (!silent) notify(e.message, true);
    return false;
  }
  const ok = await loadProviders(el('provider').value, silent);
  if (!ok) return false;
  await loadSessions(silent);
  return true;
}

el('refresh').onclick = () => connectRelay(false);
el('gemini-get-key').onclick = () => { chrome.tabs.create({ url: 'https://aistudio.google.com/apikey' }); };
el('gemini-test').onclick = async () => {
  const btn = el('gemini-test');
  btn.disabled = true;
  notify('detecting');
  try {
    if (!geminiDraft().apiKey.trim()) throw Error('geminiConfigError');
    if (!await geminiPermission()) throw Error('geminiPermissionDenied');
    await XCTRelay.message('XCT_GEMINI_TEST', { draft: geminiDraft() });
    serviceView();
    notify('geminiConnected');
  } catch (e) {
    notify(e.message, true);
  } finally {
    btn.disabled = false;
  }
};
el('guide-close').onclick = () => el('relay-guide').close();
el('guide-learn').onclick = () => { XCTRelay.message('XCT_OPEN_GUIDE').catch(() => {}); };
el('guide-retry').onclick = async () => { el('relay-guide').close(); await connectRelay(false); };

async function saveAll(targetId = 'feedback') {
  const ticket = revision;
  el('save').disabled = true;
  el('save-scenes').disabled = true;
  try {
    const scenes = sceneEngines();
    if (Object.values(scenes).includes('relay') && !draft().sessionId) throw Error('pickSession');
    if (Object.values(scenes).includes('gemini')) {
      if (!geminiDraft().apiKey.trim()) throw Error('geminiConfigError');
      if (!await geminiPermission()) throw Error('geminiPermissionDenied');
    }
    await chrome.storage.local.set({
      enabledProviders: {
        google: el('google-enabled').checked,
        gemini: el('gemini-enabled').checked,
        relay: el('relay-enabled').checked,
      },
    });
    await XCTRelay.message('XCT_RELAY_SAVE', { scenes, draft: draft(), gemini: geminiDraft() });
    if (ticket === revision) {
      dirty = false;
      serviceView();
      notify('saved', false, 'feedback');
      notify('saved', false, 'scenes-feedback');
    }
  } catch (e) {
    notify(e.message, true, targetId);
  } finally {
    el('save').disabled = false;
    el('save-scenes').disabled = false;
  }
}
el('save').onclick = () => saveAll('feedback');
el('save-scenes').onclick = () => saveAll('scenes-feedback');

el('trial').onclick = async () => {
  const ticket = revision;
  const kind = activeProvider;
  if (kind === 'relay' && !draft().sessionId) { notify('pickSession', true); return; }
  if (kind === 'gemini') {
    if (!geminiDraft().apiKey.trim()) { notify('geminiConfigError', true); return; }
    if (!await geminiPermission()) { notify('geminiPermissionDenied', true); return; }
  }
  const job = trial || { id: crypto.randomUUID() };
  trial = job; busy = true; results = null; draw(); notify('translating');
  const slow = setTimeout(() => { if (ticket === revision) notify('slowTranslation'); }, 7000);
  try {
    const items = samples.map(({ id, text }) => ({ id, text }));
    let reply;
    if (kind === 'google') {
      const lang = el('language').value;
      reply = await Promise.all(items.map(async item => {
        const res = await chrome.runtime.sendMessage({ type: 'XCT_TRANSLATE', text: item.text, language: lang });
        if (!res?.ok) throw Error(res?.errorCode || 'translationFailed');
        return { id: item.id, translation: res.text };
      }));
    } else if (kind === 'gemini') {
      reply = await XCTRelay.message('XCT_GEMINI_BATCH', { items, language: el('language').value, draft: geminiDraft(), scene: 'post' });
    } else {
      reply = await XCTRelay.run(job.id, { items, language: el('language').value, draft: draft() }, () => ticket === revision, job.receipt);
    }
    if (ticket !== revision) return;
    results = new Map(reply.map(item => [item.id, item.translation]));
    trial = null;
    notify(results.size === items.length ? 'trialDone' : 'relayInvalid', results.size !== items.length);
  } catch (e) {
    if (ticket === revision) {
      job.receipt = e.receipt;
      job.unknown = Boolean(e.receipt);
      trial = job.unknown ? job : null;
      notify(e.message, true);
    }
  } finally {
    clearTimeout(slow);
    if (ticket === revision) { busy = false; draw(); }
  }
};

async function setPref(key,value) {
  if(key === 'optionsTheme') applyTheme(value);
  else if(key !== 'postDisplayMode') {resetTrial();notify(dirty?'draftChanged':'');} else draw();
  try{await chrome.storage.local.set({[key]:value});}catch{notify('saveFailed',true);readPrefs(await chrome.storage.local.get(['postsEnabled','incomingLanguage','postDisplayMode','optionsTheme']));draw();}
}
el('enabled').onchange=()=>setPref('postsEnabled',el('enabled').checked);
el('language').onchange=()=>setPref('incomingLanguage',el('language').value);
document.querySelectorAll('[name=mode]').forEach(r=>r.onchange=()=>setPref('postDisplayMode',r.value));
document.querySelectorAll('[name=theme]').forEach(r=>r.onchange=()=>setPref('optionsTheme',r.value));
chrome.storage.onChanged.addListener((changes,area)=>{
  if(area!=='local')return;
  let invalid=false;
  if(changes.postsEnabled && el('enabled').checked !== (changes.postsEnabled.newValue!==false)){el('enabled').checked=changes.postsEnabled.newValue!==false;invalid=true;}
  if(changes.incomingLanguage && el('language').value !== changes.incomingLanguage.newValue){el('language').value=changes.incomingLanguage.newValue||readingLanguage;invalid=true;}
  if(changes.postDisplayMode)document.querySelector('[value='+ (changes.postDisplayMode.newValue==='replace'?'replace':'both') +']').checked=true;
  if(changes.optionsTheme){
    const th = changes.optionsTheme.newValue || 'auto';
    document.querySelector('[name=theme][value='+ (['light','dark'].includes(th)?th:'auto') +']').checked=true;
    applyTheme(th);
  }
  if(invalid)resetTrial();else draw();
});
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});

(async()=>{
  localize();document.title=t('optsTitle')+' · X Chat Translator';document.documentElement.lang=XCTI18n.language;
  document.documentElement.dir=chrome.i18n.getMessage('@@bidi_dir')||'ltr';
  el('language').replaceChildren(...languages.map(([code,label])=>new Option(label,code)));emptyList();
  const [prefs,config]=await Promise.all([chrome.storage.local.get(['postsEnabled','incomingLanguage','postDisplayMode','optionsTheme','enabledProviders']),XCTRelay.message('XCT_RELAY_READ')]);
  readPrefs(prefs);
  const scenes = config.scenes || {};
  el('engine').value = scenes.post?.kind || config.state?.kind || 'google';
  el('engine-reply').value = scenes.reply?.kind || el('engine').value;
  el('engine-chat-incoming').value = scenes.chatIncoming?.kind || 'google';
  el('engine-chat-outgoing').value = scenes.chatOutgoing?.kind || 'google';

  const used = new Set(Object.values(sceneEngines()));
  const ep = prefs.enabledProviders || {};
  el('google-enabled').checked = ep.google !== false;
  el('gemini-enabled').checked = typeof ep.gemini === 'boolean' ? ep.gemini : used.has('gemini');
  el('relay-enabled').checked = typeof ep.relay === 'boolean' ? ep.relay : used.has('relay');

  if (config.gemini?.apiKey) {
    el('gemini-key').value = config.gemini.apiKey || '';
    if (config.gemini.model && [...el('gemini-model').options].some(o => o.value === config.gemini.model)) {
      el('gemini-model').value = config.gemini.model;
    }
  }
  if (config.draft?.token) {
    const d=config.draft;
    el('address').value=d.address;
    el('token').value=d.token;
    if(d.provider){
      el('provider').replaceChildren(new Option(d.provider,d.provider));
      el('provider').value=d.provider;
    }
    el('session').add(new Option(d.sessionName||d.sessionId,d.sessionId,true,true));
    try { await loadProviders(config.draft?.provider, true); } catch {}
  } else if (Object.values(sceneEngines()).includes('relay')) {
    connectRelay(true).catch(() => {});
  }
  selectProvider('google');
  serviceView();draw();document.querySelector('main').inert=false;
})().catch(()=>{document.querySelector('main').inert=false;notify('readSettingsFailed',true);});
