chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const post = message?.type === 'XCT_POST_GOOGLE';
  if (!post && message?.type !== 'XCT_TRANSLATE') return;
  if (post && (_sender?.id !== chrome.runtime.id || !_sender.url?.startsWith('https://x.com/') || _sender.frameId !== 0)) return;
  const text = String(message.text || '').trim();
  const language = String(message.language || 'en');
  const scene = message.scene === 'article' ? 'article' : 'post';
  if (!text || text.length > 5000 || !/^[a-z]{2}(?:-[A-Z]{2})?$/.test(language)) {
    sendResponse({ ok: false, errorCode: 'invalidTranslation' });
    return;
  }
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', 'auto');
  url.searchParams.set('tl', language);
  url.searchParams.set('dt', 't');
  url.searchParams.set('q', text);
  async function translate() {
    const response = await fetch(url, {signal:AbortSignal.timeout(12000)});
      if (!response.ok) throw Object.assign(new Error('serviceError'), { status: response.status });
      const data = await response.json();
      const translated = Array.isArray(data?.[0])
        ? data[0].map((segment) => segment?.[0] || '').join('').trim()
        : '';
      if (!translated) throw new Error('emptyTranslation');
      return translated;
  }
  async function translatePost() {
    const cache = XCTPostCache;
    const key = await cache.key(cache.scope(null,scene),language,text);
    return navigator.locks.request('xct-google:' + key, async () => {
      const [cached] = await cache.lookup(cache.scope(null,scene),language,[{id:'post',text}]);
      if (cached.translation) return cached.translation;
      const translation = await translate();
      await cache.save([{key,translation}]);
      return translation;
    });
  }
  (post ? translatePost() : translate())
    .then(text => sendResponse({ok:true,text}))
    .catch((error) => sendResponse({ ok: false, errorCode: ['serviceError', 'emptyTranslation'].includes(error.message) ? error.message : 'translationFailed', status: error.status }));
  return true;
});
