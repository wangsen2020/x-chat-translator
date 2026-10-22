chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'XCT_TRANSLATE') return;
  const text = String(message.text || '').trim();
  const language = String(message.language || 'en');
  if (!text || text.length > 5000 || !/^[a-z]{2}(?:-[A-Z]{2})?$/.test(language)) {
    sendResponse({ ok: false, error: '翻译参数无效' });
    return;
  }
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', 'auto');
  url.searchParams.set('tl', language);
  url.searchParams.set('dt', 't');
  url.searchParams.set('q', text);
  fetch(url, { signal: AbortSignal.timeout(12000) })
    .then(async (response) => {
      if (!response.ok) throw new Error(`翻译服务返回 ${response.status}`);
      const data = await response.json();
      const translated = Array.isArray(data?.[0])
        ? data[0].map((segment) => segment?.[0] || '').join('').trim()
        : '';
      if (!translated) throw new Error('翻译结果为空');
      sendResponse({ ok: true, text: translated });
    })
    .catch((error) => sendResponse({ ok: false, error: error.message || '翻译失败' }));
  return true;
});
