// MAIN world: keep Draft.js untouched and replace only the explicitly authorized reply payload.
(() => {
  if (globalThis.__xctReplyBridge) return;
  globalThis.__xctReplyBridge = true;
  const request = 'xct:reply-request', response = 'xct:reply-response';
  const nativeFetch = window.fetch, nativeOpen = XMLHttpRequest.prototype.open, nativeSend = XMLHttpRequest.prototype.send;
  let upstreamFetch = nativeFetch, upstreamOpen = nativeOpen, upstreamSend = nativeSend;
  let inFetch = false, inOpen = false, inSend = false;
  const urls = new WeakMap();
  let active;
  let interception = true;
  const uncertain = new Set();
  const normalize = text => text.replace(/\r\n/g, '\n');
  const sourceKey = (postId, source) => JSON.stringify([postId, source]);
  function isHooked(fn, target) {
    for (let cur = fn, depth = 0; typeof cur === 'function' && depth < 10; depth++, cur = cur.__sentry_original__) {
      if (cur === target) return true;
    }
    return false;
  }
  function ensureHooks() {
    if (!isHooked(window.fetch, fetchReply) && typeof window.fetch === 'function') {
      upstreamFetch = window.fetch;
      try {window.fetch = fetchReply;} catch {}
    }
    if (!isHooked(XMLHttpRequest.prototype.open, open) && typeof XMLHttpRequest.prototype.open === 'function') {
      upstreamOpen = XMLHttpRequest.prototype.open;
      try {XMLHttpRequest.prototype.open = open;} catch {}
    }
    if (!isHooked(XMLHttpRequest.prototype.send, send) && typeof XMLHttpRequest.prototype.send === 'function') {
      upstreamSend = XMLHttpRequest.prototype.send;
      try {XMLHttpRequest.prototype.send = send;} catch {}
    }
    return isHooked(window.fetch, fetchReply) &&
           isHooked(XMLHttpRequest.prototype.open, open) &&
           isHooked(XMLHttpRequest.prototype.send, send);
  }
  function rejectReplay(body) {
    if (!interception) return;
    let vars;
    try {vars = JSON.parse(body)?.variables;} catch {return;}
    if (typeof vars?.tweet_text === 'string' && uncertain.has(sourceKey(String(vars.reply?.in_reply_to_tweet_id), normalize(vars.tweet_text)))) {
      throw Error('replySendUnknown');
    }
  }
  function context(editorId) {
    if (!/^[a-z0-9-]{1,80}$/.test(editorId || '')) return null;
    const input = document.querySelector(`[data-xct-reply-id="${editorId}"]`);
    if (!input?.isConnected || !input.matches('[contenteditable="true"][data-testid^="tweetTextarea_"]')) return null;
    let fiber = input[Object.keys(input).find(key => key.startsWith('__reactFiber$'))];
    let source, post;
    for (let depth = 0; fiber && depth < 180; depth++, fiber = fiber.return) {
      const p = fiber.memoizedProps;
      if (!p || typeof p !== 'object') continue;
      if (source === undefined && p.editorState?.getCurrentContent) source = p.editorState.getCurrentContent().getPlainText();
      if (p.inReplyToStatusId && p.inReplyToStatus && String(p.inReplyToStatus.id_str) === String(p.inReplyToStatusId)) {
        post = p.inReplyToStatus; break;
      }
    }
    if (typeof source !== 'string' || !post || !/^\d+$/.test(post.id_str)) return null;
    let button;
    for (let parent = input.parentElement, depth = 0; parent && depth < 64; depth++, parent = parent.parentElement) {
      const buttons = parent.querySelectorAll('[data-testid="tweetButton"],[data-testid="tweetButtonInline"]');
      if (buttons.length === 1) {button = buttons[0]; break;}
    }
    if (!button) return null;
    button.dataset.xctReplyButton = editorId;
    return {input, button, source:normalize(source), postId:post.id_str, language:post.lang || '', postText:post.full_text || ''};
  }
  function reply(id, value) {
    document.dispatchEvent(new CustomEvent(response, {detail:{id, ...value}}));
  }
  function finish(operation, ok, errorCode, tweetId) {
    if (active !== operation) return;
    clearTimeout(operation.timer);
    if (errorCode === 'replySendUnknown') {
      uncertain.add(operation.signature);
      if (uncertain.size > 50) uncertain.delete(uncertain.values().next().value);
    }
    active = undefined;
    reply(operation.id, {ok, errorCode, tweetId});
  }
  function isCreate(url) {
    try {const parsed = new URL(url, location.href); return parsed.origin === location.origin && /\/graphql\/[^/]+\/CreateTweet$/.test(parsed.pathname);}
    catch {return false;}
  }
  function rewrite(body, operation) {
    if (operation.sent) throw Error('replySendBusy');
    let data;
    try {data = JSON.parse(body);} catch {throw Error('replySenderChanged');}
    const vars = data?.variables, current = context(operation.editorId);
    if (!current || current.source !== operation.source || current.postId !== operation.postId ||
        typeof vars?.tweet_text !== 'string' || normalize(vars.tweet_text) !== operation.source ||
        String(vars.reply?.in_reply_to_tweet_id) !== operation.postId) throw Error('replyDraftChanged');
    vars.tweet_text = operation.translation;
    operation.sent = true;
    return JSON.stringify(data);
  }
  function result(operation, status, data) {
    const raw = data?.data?.create_tweet?.tweet_results?.result;
    const tweet = raw?.tweet || raw;
    if (/^\d+$/.test(tweet?.rest_id || '') && (!tweet.legacy?.in_reply_to_status_id_str ||
        tweet.legacy.in_reply_to_status_id_str === operation.postId)) {
      finish(operation, true, undefined, tweet.rest_id);
    } else if ((status >= 400 && status < 500) || (Array.isArray(data?.errors) && data.errors.length && !raw)) {
      finish(operation, false, 'replySendFailed');
    } else finish(operation, false, 'replySendUnknown');
  }
  async function fetchReply(input, init) {
    if (inFetch) return nativeFetch.apply(this, arguments);
    const operation = active;
    const url = typeof input === 'string' || input instanceof URL ? String(input) : input?.url;
    if (!isCreate(url)) {
      let promise;
      inFetch = true;
      try {promise = upstreamFetch.apply(this, arguments);} finally {inFetch = false;}
      return await promise;
    }
    if (!operation) {
      if (interception && uncertain.size) rejectReplay(typeof init?.body === 'string' ? init.body : input instanceof Request ? await input.clone().text() : '');
      let promise;
      inFetch = true;
      try {promise = upstreamFetch.apply(this, arguments);} finally {inFetch = false;}
      return await promise;
    }
    if (operation.sent && upstreamFetch !== nativeFetch) {
      return nativeFetch.apply(this, arguments);
    }
    let body;
    try {
      body = rewrite(typeof init?.body === 'string' ? init.body : input instanceof Request ? await input.clone().text() : '', operation);
    } catch (error) {
      if (!operation.sent) finish(operation, false, error.message);
      throw error;
    }
    try {
      const requestInput = input instanceof Request ? new Request(input, {...init, body}) : input;
      let promise;
      inFetch = true;
      try {
        promise = upstreamFetch.call(this, requestInput, input instanceof Request ? undefined : {...init, body});
      } finally {inFetch = false;}
      const outcome = await promise;
      outcome.clone().json().then(data => result(operation, outcome.status, data), () => finish(operation, false, 'replySendUnknown'));
      return outcome;
    } catch (error) {finish(operation, false, 'replySendUnknown'); throw error;}
  }
  function open(method, url) {
    urls.set(this, String(url));
    if (inOpen) return nativeOpen.apply(this, arguments);
    inOpen = true;
    try {return upstreamOpen.apply(this, arguments);} finally {inOpen = false;}
  }
  function send(body) {
    if (inSend) return nativeSend.apply(this, arguments);
    const operation = active;
    if (!isCreate(urls.get(this))) {
      inSend = true;
      try {return upstreamSend.apply(this, arguments);} finally {inSend = false;}
    }
    if (!operation) {
      rejectReplay(body);
      inSend = true;
      try {return upstreamSend.apply(this, arguments);} finally {inSend = false;}
    }
    if (operation.sent && upstreamSend !== nativeSend) {
      return nativeSend.apply(this, arguments);
    }
    try {body = rewrite(body, operation);} catch (error) {if (!operation.sent) finish(operation, false, error.message); throw error;}
    this.addEventListener('loadend', () => {
      let data;
      try {data = this.responseType === 'json' ? this.response : JSON.parse(this.responseText);} catch {}
      result(operation, this.status, data);
    }, {once:true});
    inSend = true;
    try {return upstreamSend.call(this, body);} catch (error) {finish(operation, false, 'replySendUnknown'); throw error;}
    finally {inSend = false;}
  }
  window.fetch = fetchReply;
  XMLHttpRequest.prototype.open = open;
  XMLHttpRequest.prototype.send = send;
  document.addEventListener(request, event => {
    const detail = event.detail || {}, {id, editorId} = detail;
    if (typeof id !== 'string') return;
    if (detail.action === 'configure') {interception = detail.enabled === true; return;}
    const current = context(editorId);
    if (detail.action === 'context') {
      ensureHooks();
      reply(id, {ok:!!current, context:current && {source:current.source, postId:current.postId, language:current.language, postText:current.postText}});
      return;
    }
    if (detail.action !== 'send') return;
    if (active) {reply(id, {ok:false, errorCode:'replySendBusy'}); return;}
    if (!current || current.source !== detail.source || current.postId !== detail.postId || !current.source.trim()) {
      reply(id, {ok:false, errorCode:'replyDraftChanged'}); return;
    }
    if (typeof detail.translation !== 'string' || !detail.translation.trim() || detail.translation.length > 15000 ||
        !ensureHooks() || current.button.disabled || current.button.getAttribute('aria-disabled') === 'true') {
      reply(id, {ok:false, errorCode:'replySenderChanged'}); return;
    }
    const signature = sourceKey(current.postId, current.source);
    if (uncertain.has(signature)) {reply(id, {ok:false, errorCode:'replySendUnknown'}); return;}
    const operation = active = {id, editorId, source:current.source, postId:current.postId, translation:detail.translation, signature};
    operation.timer = setTimeout(() => finish(operation, false, operation.sent ? 'replySendUnknown' : 'replySenderChanged'), 30000);
    try {current.button.click();} catch {finish(operation, false, operation.sent ? 'replySendUnknown' : 'replySenderChanged');}
  });
})();
