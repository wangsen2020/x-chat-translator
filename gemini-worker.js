// Gemini API (BYOK) translation worker for posts, replies, and X Chat.
(() => {
  const DEFAULT_MODEL = 'gemini-flash-lite-latest';
  const KNOWN_MODELS = [
    'gemini-flash-lite-latest',
    'gemini-flash-latest',
    'gemini-3.8-flash',
    'gemini-3.5-flash-lite',
  ];
  const SCENE_KEYS = {
    post: 'postEngine',
    article: 'articleEngine',
    reply: 'replyEngine',
    chatIncoming: 'chatIncomingEngine',
    chatOutgoing: 'chatOutgoingEngine',
  };

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('xct-relay', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('records');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function readConfig() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction('records').objectStore('records').get('gemini:config');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  function normalizeConfig(raw) {
    const apiKey = typeof raw?.apiKey === 'string' ? raw.apiKey.trim() : '';
    const model = typeof raw?.model === 'string' && /^[a-z0-9._-]{3,80}$/i.test(raw.model.trim())
      ? raw.model.trim()
      : DEFAULT_MODEL;
    if (!apiKey) throw Error('geminiConfigError');
    return { apiKey, model };
  }

  async function callGemini(config, body, timeoutMs = 20000) {
    let response;
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`;
      response = await fetch(url, {
        method: 'POST',
        credentials: 'omit',
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': config.apiKey,
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw Error('geminiOffline');
    }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw Error('geminiAuth');
      if (response.status === 404) throw Error('geminiModelError');
      if (response.status === 429 || response.status === 503) throw Error('geminiRateLimit');
      throw Error('geminiFailed');
    }
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.map(p => p?.text || '').join('').trim() || '';
    if (!text) throw Error('emptyTranslation');
    return text;
  }

  async function verifyScene(scene, revision) {
    const key = SCENE_KEYS[scene || 'post'];
    if (!key) throw Error('geminiConfigError');
    const stored = await chrome.storage.local.get(scene === 'article' ? [key,'postEngine'] : key);
    const engine = stored[key] || (scene === 'article' ? stored.postEngine : null) || { kind: 'google' };
    if (engine.kind !== 'gemini' || (revision && engine.revision !== revision)) throw Error('relayStale');
  }

  function parseBatchJson(raw, validIds) {
    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    }
    let decoded;
    try { decoded = JSON.parse(cleaned); } catch { throw Error('relayInvalid'); }
    if (!Array.isArray(decoded?.items)) throw Error('relayInvalid');
    const results = new Map();
    for (const entry of decoded.items) {
      if (!validIds.includes(entry?.id)) continue;
      const val = typeof entry.translation === 'string' ? entry.translation.trim() : '';
      if (val) results.set(entry.id, val);
    }
    return Array.from(results, ([id, translation]) => ({ id, translation }));
  }

  async function translateSingle(m) {
    const text = String(m.text || '').trim();
    const language = String(m.language || 'en');
    if (!text || text.length > 5000 || !/^[a-z]{2}(?:-[A-Z]{2})?$/.test(language)) {
      throw Error('invalidTranslation');
    }
    await verifyScene(m.scene || 'chatOutgoing', m.revision);
    const config = normalizeConfig(await readConfig());
    const useCache = ['post','article','reply'].includes(m.scene);
    const providerScope = { address: 'gemini', provider: config.model, sessionId: 'api' };
    const scope = m.scene === 'article' ? [providerScope,'article'] : providerScope;
    if (useCache) {
      const [cached] = await XCTPostCache.lookup(scope, language, [{ id: 'single', text }]);
      if (cached?.translation) return cached.translation;
    }
    const prompt = `Translate the following text into ${language}. Preserve URLs, @mentions, product names, emojis, and line breaks. Return only the translated text without explanations or quotes.\n\n${text}`;
    const translated = await callGemini(config, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 },
    });
    if (useCache) {
      const cacheKey = await XCTPostCache.key(scope, language, text);
      await XCTPostCache.save([{ key: cacheKey, translation: translated }]);
    }
    return translated;
  }

  async function translateBatch(m, options = false) {
    if (!Array.isArray(m.items) || !m.items.length || !/^[a-z]{2}(?:-[A-Z]{2})?$/.test(m.language)) {
      throw Error('relayInvalid');
    }
    if (!options) await verifyScene(m.scene || 'post', m.revision);
    const config = normalizeConfig(options && m.draft ? m.draft : await readConfig());
    const providerScope = { address: 'gemini', provider: config.model, sessionId: 'api' };
    const scope = m.scene === 'article' ? [providerScope,'article'] : providerScope;
    const cachedRows = await XCTPostCache.lookup(scope, m.language, m.items);
    const hits = cachedRows.filter(e => e.translation).map(({ id, translation }) => ({ id, translation }));
    const hitIds = new Set(hits.map(h => h.id));
    const missing = m.items.filter(item => !hitIds.has(item.id));
    if (!missing.length) return hits;

    const prompt = XCTRelay.prompt(missing, m.language);
    const raw = await callGemini(config, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
    }, 25000);
    const fresh = parseBatchJson(raw, missing.map(i => i.id));
    const keyById = new Map(cachedRows.filter(e => !e.translation).map(({ id, key }) => [id, key]));
    if (fresh.length) {
      await XCTPostCache.save(fresh.map(item => ({ key: keyById.get(item.id), translation: item.translation })).filter(e => e.key));
    }
    return [...hits, ...fresh];
  }

  async function testConnection(draft) {
    const config = normalizeConfig(draft);
    const started = Date.now();
    await callGemini(config, {
      contents: [{ parts: [{ text: 'Translate "Hello" into Chinese. Return only the translation.' }] }],
      generationConfig: { temperature: 0 },
    }, 15000);
    return { ok: true, model: config.model, latencyMs: Date.now() - started };
  }

  chrome.runtime.onMessage.addListener((m, sender, reply) => {
    if (!['XCT_GEMINI_TEST', 'XCT_GEMINI_TRANSLATE', 'XCT_GEMINI_BATCH'].includes(m?.type)) return;
    const options = sender.url === chrome.runtime.getURL('options.html');
    const post = sender.tab && sender.url?.startsWith('https://x.com/') && sender.frameId === 0;
    (async () => {
      if (sender.id !== chrome.runtime.id || (!options && !post)) throw Error('relayForbidden');
      if (m.type === 'XCT_GEMINI_TEST') {
        if (!options) throw Error('relayForbidden');
        return testConnection(m.draft);
      }
      if (m.type === 'XCT_GEMINI_TRANSLATE') return translateSingle(m);
      return translateBatch(m, options);
    })().then(
      value => reply({ ok: true, value }),
      error => reply({ ok: false, error: error?.message || 'geminiFailed' })
    );
    return true;
  });

  globalThis.XCTGemini = { DEFAULT_MODEL, KNOWN_MODELS };
})();
