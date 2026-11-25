// Credentials and outstanding requests live in the extension origin's IndexedDB.
const relay = XCTRelay;
const database = new Promise((resolve, reject) => {
  const request = indexedDB.open('xct-relay', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('records');
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
async function get(key) {
  const db = await database;
  return new Promise((resolve, reject) => {
    const request = db.transaction('records').objectStore('records').get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function write(entries) {
  const db = await database;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readwrite');
    const store = tx.objectStore('records');
    for (const [key, value] of entries) {
      if (value === undefined) store.delete(key); else store.put(value, key);
    }
    tx.oncomplete = resolve;
    tx.onabort = () => reject(tx.error);
  });
}
const NATIVE_HOST = 'com.goodexts.agentrelay';
async function probeNative() {
  try {
    const res = await chrome.runtime.sendNativeMessage(NATIVE_HOST, {
      id: crypto.randomUUID(),
      action: 'probe',
      timeoutMs: 2000,
    });
    if (res && typeof res === 'object') return res;
    return { ok: false, status: 'error', installed: false, running: false, errorCode: 'INVALID_RESPONSE' };
  } catch (error) {
    const message = String(error?.message || '');
    const notFound = /not found/i.test(message);
    return {
      ok: false,
      status: notFound ? 'not_installed' : 'error',
      installed: false,
      running: false,
      errorCode: notFound ? 'HOST_NOT_FOUND' : 'NATIVE_ERROR',
      message,
    };
  }
}
const KNOWN_PROVIDERS = [
  { id: 'codex', name: 'Codex' },
  { id: 'antigravity', name: 'Antigravity' },
  { id: 'antigravity-acp', name: 'Antigravity (ACP)' },
  { id: 'grok-cli', name: 'Grok CLI' },
  { id: 'grokbot', name: 'Grok Bot' },
  { id: 'dsh', name: 'DeepSeek Harness' },
  { id: 'workbuddy', name: 'WorkBuddy' },
  { id: 'codex-acp', name: 'Codex (ACP)' }
];
function binding(draft, needSession = true, needProvider = true) {
  const address = relay.origin(draft?.address);
  const provider = typeof draft?.provider === 'string' ? draft.provider.trim() : '';
  if (!draft?.token?.trim() || (needProvider && !/^[a-z0-9_-]{2,32}$/.test(provider)) ||
      (needSession && !draft.sessionId)) throw Error('relayConfigError');
  return { address, token:draft.token.trim(), provider, sessionId:draft.sessionId || '', sessionName:draft.sessionName || '' };
}
async function api(config, route, body) {
  let response;
  try {
    response = await fetch(config.address + route, {
      method:body ? 'POST' : 'GET', credentials:'omit', redirect:'error',
      signal:AbortSignal.timeout(15000),
      headers:{ Authorization:'Bearer ' + config.token, ...(body && {'Content-Type':'application/json'}) },
      ...(body && {body:JSON.stringify(body)})
    });
  } catch { throw Error('relayOffline'); }
  if (!response.ok) {
    const codes = {401:'relayAuth',403:'relayForbidden',404:'relayMissing',400:'relayRejected',413:'relayRejected',429:'relayRejected'};
    throw Error(codes[response.status] || 'relayOffline');
  }
  return response.json();
}
async function sessions(draft) {
  const config = binding(draft, false);
  const health = await api(config, '/health');
  if (!['grok-bridge','agent-relay','gbot-local-service'].includes(health.service)) throw Error('relayConfigError');
  const engine = await api(config, '/' + config.provider + '/health');
  if (engine.ok === false || engine.ready === false) throw Error('relayUnavailable');
  const list = await api(config, '/' + config.provider + '/sessions');
  return Array.from(new Map(list.sessions.filter(s => typeof s.id === 'string').map(s => [s.id,{id:s.id,name:s.name || s.id}])).values());
}
async function providers(draft) {
  const config = binding(draft, false, false);
  const health = await api(config, '/health');
  if (!['grok-bridge','agent-relay','gbot-local-service'].includes(health.service)) throw Error('relayConfigError');
  const results = await Promise.allSettled(
    KNOWN_PROVIDERS.map(async p => {
      try {
        const engine = await api(config, '/' + p.id + '/health');
        if (engine && engine.ok !== false && engine.status !== 'unavailable') return p;
      } catch {}
      return null;
    })
  );
  const available = results
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value);
  if (available.length) return available;
  if (/^[a-z0-9_-]{2,32}$/.test(config.provider)) {
    return [KNOWN_PROVIDERS.find(p => p.id === config.provider) || { id: config.provider, name: config.provider }];
  }
  throw Error('relayUnavailable');
}
const SCENE_KEYS = {
  post: 'postEngine',
  reply: 'replyEngine',
  chatIncoming: 'chatIncomingEngine',
  chatOutgoing: 'chatOutgoingEngine',
};
const VALID_KINDS = new Set(['google', 'gemini', 'relay']);

async function settings(scene = 'post') {
  const key = SCENE_KEYS[scene] || 'postEngine';
  return (await chrome.storage.local.get(key))[key] || {kind:'google'};
}
async function allSettings() {
  const keys = Object.values(SCENE_KEYS);
  const data = await chrome.storage.local.get(keys);
  const post = data.postEngine || { kind: 'google' };
  return {
    post,
    reply: data.replyEngine || post,
    chatIncoming: data.chatIncomingEngine || { kind: 'google' },
    chatOutgoing: data.chatOutgoingEngine || { kind: 'google' },
  };
}
async function save(message) {
  return navigator.locks.request('xct-settings', async () => {
    const previous = await allSettings();
    const revision = crypto.randomUUID();
    const scenes = message.scenes || {
      post: message.kind,
      reply: message.kind,
      chatIncoming: message.kind,
      chatOutgoing: message.kind,
    };
    for (const scene of Object.keys(SCENE_KEYS)) {
      if (!VALID_KINDS.has(scenes[scene])) throw Error('relayConfigError');
    }
    const usesRelay = Object.values(scenes).includes('relay');
    const usesGemini = Object.values(scenes).includes('gemini');
    const writes = [];
    if (usesRelay) {
      const bound = binding(message.draft);
      writes.push(['binding:' + revision, bound], ['binding:saved', bound]);
    } else if (message.draft?.address?.trim()) {
      const partial = {
        address: relay.origin(message.draft.address),
        token: typeof message.draft.token === 'string' ? message.draft.token.trim() : '',
        provider: typeof message.draft.provider === 'string' ? message.draft.provider.trim() : '',
        sessionId: message.draft.sessionId || '',
        sessionName: message.draft.sessionName || '',
      };
      writes.push(['binding:saved', partial]);
    }
    const apiKey = typeof message.gemini?.apiKey === 'string' ? message.gemini.apiKey.trim() : '';
    const model = typeof message.gemini?.model === 'string' && message.gemini.model.trim()
      ? message.gemini.model.trim()
      : 'gemini-flash-lite-latest';
    if (usesGemini && !apiKey) throw Error('geminiConfigError');
    if (message.gemini) writes.push(['gemini:config', { apiKey, model }]);
    const prevRevs = new Set(Object.values(previous).map(s => s?.revision).filter(Boolean));
    for (const prevRev of prevRevs) {
      if (prevRev !== revision) writes.push(['binding:' + prevRev, undefined]);
    }
    if (writes.length) await write(writes);
    await chrome.storage.local.set({
      postEngine: { kind: scenes.post, revision },
      replyEngine: { kind: scenes.reply, revision },
      chatIncomingEngine: { kind: scenes.chatIncoming, revision },
      chatOutgoingEngine: { kind: scenes.chatOutgoing, revision },
    });
  });
}
const alarmPrefix = 'xct-job:';
// A fixed set of primary-key pointers restores scheduled alarms after a browser restart.
async function trackedWrite(jobId, entries, include) {
  const db = await database;
  return new Promise((resolve,reject) => {
    const tx = db.transaction('records','readwrite'), store = tx.objectStore('records');
    const read = store.get('trackedJobs');
    read.onsuccess = () => {
      const ids = new Set(read.result || []);
      if (include && !ids.has(jobId) && ids.size >= 512) {tx.abort();return;}
      if (include) ids.add(jobId); else ids.delete(jobId);
      store.put([...ids],'trackedJobs');
      for (const [key,value] of entries) {
        if (value === undefined) store.delete(key); else store.put(value,key);
      }
    };
    tx.oncomplete=resolve;
    tx.onabort=()=>reject(Error('relayRejected'));
  });
}
chrome.runtime.onStartup.addListener(async () => {
  for (const id of await get('trackedJobs') || []) {
    if (!await chrome.alarms.get(alarmPrefix + id)) await chrome.alarms.create(alarmPrefix + id,{periodInMinutes:1});
  }
});
const expireMs = 24 * 60 * 60 * 1000;
function cleanItems(raw, validIds) {
  let decoded;
  try { decoded = JSON.parse(raw); } catch { throw Error('relayInvalid'); }
  if (!Array.isArray(decoded?.items)) throw Error('relayInvalid');
  const results = new Map();
  for (const entry of decoded.items) {
    if (!validIds.includes(entry?.id)) continue;
    results.set(entry.id, results.has(entry.id) ? null : (typeof entry.translation === 'string' ? entry.translation.trim() : null));
  }
  return Array.from(results, ([id,translation]) => ({id,translation})).filter(item => item.translation);
}
async function terminal(jobId, record, result) {
  if (result.status === 'completed' && record.cacheKeys) {
    const keys = new Map(record.cacheKeys);
    await XCTPostCache.save(result.items.map(item=>({key:keys.get(item.id),translation:item.translation})));
    result.items = [...(record.hits || []),...result.items];
  }
  const remember = result.status === 'completed' && result.items.length === record.ids.length;
  const entries = [['job:' + jobId,{owner:record.owner, ids:record.ids, signature:record.signature, ...result}], ['body:' + jobId,undefined]];
  if (!remember && record.signature && await get(record.signature) === jobId) entries.push([record.signature,undefined]);
  if (await get(record.slot) === jobId) entries.push([record.slot,undefined]);
  await write(entries);
  await chrome.alarms.create(alarmPrefix + jobId,{delayInMinutes:10});
  return result;
}
function query(jobId, owner) {
  return navigator.locks.request('query:' + jobId, async () => {
    const record = await get('job:' + jobId);
    if (!record || (owner && record.owner !== owner)) return {status:'unknown'};
    if (record.status !== 'pending') return {status:record.status,items:record.items,error:record.error};
    let result;
    try { result = await api(record.config, '/' + record.config.provider + '/jobs/' + jobId); }
    catch (error) { return {status:'unavailable',error:error.message}; }
    if (result.status === 'completed') {
      try { return await terminal(jobId,record,{status:'completed',items:cleanItems(result.result?.text,record.requestIds || record.ids)}); }
      catch (error) { if (error.message !== 'relayInvalid') throw error; return terminal(jobId,record,{status:'failed',error:'relayInvalid'}); }
    }
    // AgentRelay 2.x can wrap a completed native Codex failure in status=unknown.
    // Only these exact native terminal messages prove the turn has ended.
    const nativeFailure = result.status === 'unknown' && record.config.provider === 'codex' &&
      result.error === 'codex_error' && typeof result.turnId === 'string' &&
      ['Codex turn failed','Codex turn interrupted'].includes(result.message);
    if (nativeFailure) return terminal(jobId,record,{status:'failed',error:'relayFailed'});
    if (result.status === 'failed') return terminal(jobId,record,{status:'failed',error:'relayFailed'});
    return {status:['running','queued'].includes(result.status) ? result.status : 'unknown'};
  });
}
function checkItems(m) {
  if (!Array.isArray(m.items) || !m.items.length || !/^[a-z]{2}(-[A-Z]{2})?$/.test(m.language) ||
      m.items.some(s => !/^[a-zA-Z0-9_-]{1,90}$/.test(s?.id) || typeof s.text !== 'string' || !s.text.trim()) ||
      new Set(m.items.map(s=>s.id)).size !== m.items.length || !relay.fits(m.items,m.language)) throw Error('relayInvalid');
}
async function start(m, owner, options) {
  checkItems(m);
  const configState = await settings(m.scene || 'post');
  if (!options && (configState.kind !== 'relay' || configState.revision !== m.revision)) throw Error('relayStale');
  const config = options ? binding(m.draft) : binding(await get('binding:' + configState.revision));
  const slot = 'slot:' + [config.address,config.provider,config.sessionId].join('|');
  return navigator.locks.request(slot, async () => {
    const existing = await get('job:' + m.jobId);
    if (existing) {
      if (existing.owner !== owner) throw Error('relayForbidden');
      return {status:'query'};
    }
    // Reopening the same page while a slow batch is running must reattach.
    const inputs = JSON.stringify([owner,slot,options ? config.token : m.revision,m.language,m.items.map(item=>item.text)]);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(inputs)));
    const signature = 'repeat:' + Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('');
    const originalId = await get(signature);
    const original = originalId && await get('job:' + originalId);
    if (original && (original.status === 'pending' || (!options && original.status === 'completed'))) {
      return {status:'query',jobId:originalId,ids:original.ids};
    }
    const readCache = async () => options ? [] : XCTPostCache.lookup(XCTPostCache.scope(config),m.language,m.items);
    let cached = await readCache();
    const asHits = () => cached.filter(e=>e.translation).map(({id,translation})=>({id,translation}));
    if (cached.length && asHits().length === m.items.length) return {status:'completed',items:asHits()};
    const pending = await get(slot);
    if (pending) {
      const prior = await query(pending);
      if (prior.status === 'unavailable') throw Error(prior.error);
      if (prior.status === 'unknown') throw Error('relayPriorPending');
      if (['running','queued'].includes(prior.status)) return {status:'busy'};
      cached = await readCache();
    }
    const hits = asHits();
    const hitIds = new Set(hits.map(item=>item.id));
    const missing = m.items.filter(item=>!hitIds.has(item.id));
    if (!missing.length) return {status:'completed',items:hits};
    // Offline before dispatch is a retryable connection error, with no durable queue lock.
    const health = await api(config,'/health');
    if (!['agent-relay','grok-bridge','gbot-local-service'].includes(health.service)) throw Error('relayConfigError');
    const body = {jobId:m.jobId,sessionId:config.sessionId,timeoutMs:300000,text:relay.prompt(missing,m.language)};
    const record = {owner,config,slot,signature,status:'pending',created:Date.now(),ids:m.items.map(s=>s.id)};
    if (!options) {
      record.requestIds = missing.map(item=>item.id);
      record.cacheKeys = cached.filter(entry=>!entry.translation).map(({id,key})=>[id,key]);
      record.hits = hits;
    }
    await chrome.alarms.create(alarmPrefix + m.jobId,{periodInMinutes:1});
    await trackedWrite(m.jobId,[['job:' + m.jobId,record],['body:' + m.jobId,body],[slot,m.jobId],[signature,m.jobId]],true);
    try { await api(config,'/' + config.provider + '/jobs',body); }
    catch (error) {
      if (['relayAuth','relayForbidden','relayRejected','relayMissing'].includes(error.message)) {
        await terminal(m.jobId,record,{status:'failed',error:error.message});
      }
    }
    return {status:'query'};
  });
}
chrome.alarms.onAlarm.addListener(async alarm => {
  if (!alarm.name.startsWith(alarmPrefix)) return;
  const id = alarm.name.slice(alarmPrefix.length);
  const record = await get('job:' + id);
  if (record?.status === 'pending' && Date.now() - record.created < expireMs) { await query(id); return; }
  if (record?.status === 'pending') await terminal(id,record,{status:'failed',error:'relayUnknown'});
  else {
    const entries = [['job:' + id,undefined]];
    if (record?.signature && await get(record.signature) === id) entries.push([record.signature,undefined]);
    await trackedWrite(id,entries,false); await chrome.alarms.clear(alarm.name);
  }
});
chrome.runtime.onMessage.addListener((m,sender,reply) => {
  if (!['XCT_OPEN_GUIDE','XCT_RELAY_READ','XCT_RELAY_PROBE','XCT_RELAY_LIST','XCT_RELAY_PROVIDERS','XCT_RELAY_SAVE','XCT_SWITCH_SCENE_ENGINE','XCT_BATCH_LOOKUP','XCT_BATCH_START','XCT_BATCH_QUERY'].includes(m?.type)) return;
  const options = sender.url === chrome.runtime.getURL('options.html');
  const post = sender.tab && sender.url?.startsWith('https://x.com/') && sender.frameId === 0;
  (async () => {
    if (sender.id !== chrome.runtime.id || (!options && !post)) throw Error('relayForbidden');
    if (m.type === 'XCT_OPEN_GUIDE') {
      const language = chrome.i18n.getUILanguage().toLowerCase();
      const prefix = language.startsWith('zh') ? '/zh' : language.startsWith('es') ? '/es' : language.startsWith('pt') ? '/pt-br' : '';
      await chrome.tabs.create({url:'https://goodexts.com' + prefix + '/x-chat-translator#agentrelay'});
      return;
    }
    if (m.type === 'XCT_SWITCH_SCENE_ENGINE') {
      const key = SCENE_KEYS[m.scene];
      if (!key || !VALID_KINDS.has(m.kind)) throw Error('relayConfigError');
      return navigator.locks.request('xct-settings', async () => {
        const current = await settings(m.scene);
        const revision = current.revision || crypto.randomUUID();
        if (m.kind === 'gemini') {
          const gem = await get('gemini:config');
          if (!gem?.apiKey?.trim()) throw Error('geminiConfigError');
        } else if (m.kind === 'relay') {
          const saved = (await get('binding:' + revision)) || (await get('binding:saved'));
          const bound = binding(saved);
          await write([['binding:' + revision, bound]]);
        }
        const next = { kind: m.kind, revision };
        await chrome.storage.local.set({ [key]: next });
        return next;
      });
    }
    if (m.type.startsWith('XCT_RELAY_')) {
      if (!options) throw Error('relayForbidden');
      if (m.type === 'XCT_RELAY_PROBE') return probeNative();
      if (m.type === 'XCT_RELAY_SAVE') return save(m);
      if (m.type === 'XCT_RELAY_LIST') return sessions(m.draft);
      if (m.type === 'XCT_RELAY_PROVIDERS') return providers(m.draft);
      const scenes = await allSettings();
      const rev = Object.values(scenes).find(s => s.kind === 'relay' && s.revision)?.revision || scenes.post.revision;
      const draft = (rev && await get('binding:' + rev)) || await get('binding:saved');
      return {state:scenes.post,scenes,draft,gemini:await get('gemini:config')};
    }
    if (m.type === 'XCT_BATCH_LOOKUP') {
      checkItems(m);
      const state = await settings(m.scene || 'post');
      if (!post || state.kind !== 'relay' || state.revision !== m.revision) throw Error('relayStale');
      const config = binding(await get('binding:' + state.revision));
      const rows = await XCTPostCache.lookup(XCTPostCache.scope(config),m.language,m.items);
      return rows.filter(entry=>entry.translation).map(({id,translation})=>({id,translation}));
    }
    if (!/^[0-9a-f-]{36}$/.test(m.jobId)) throw Error('relayInvalid');
    const owner = options ? 'options' : 'tab:' + sender.tab.id;
    return m.type === 'XCT_BATCH_START' ? start(m,owner,options) : query(m.jobId,owner);
  })().then(value=>reply({ok:true,value}), error=>reply({ok:false,error:/^(?:relay|gemini)[A-Z]\w+$/.test(error.message) ? error.message : 'relayOffline'}));
  return true;
});
