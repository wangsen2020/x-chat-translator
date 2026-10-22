(() => {
  const requestEvent = 'xct:send-request';
  const responseEvent = 'xct:send-response';
  let sending = false;

  function findComposer(input) {
    const fiberKey = Object.keys(input).find((key) => key.startsWith('__reactFiber$'));
    let fiber = fiberKey && input[fiberKey];
    for (let depth = 0; fiber && depth < 45; depth++, fiber = fiber.return) {
      const component = fiber.memoizedProps?.component;
      if (component?.composer?.state?.state) return component.composer;
    }
    return null;
  }

  function findSendMethod(composer) {
    for (const value of Object.values(composer)) {
      if (!value || typeof value !== 'object') continue;
      const prototype = Object.getPrototypeOf(value);
      if (!prototype) continue;
      const candidates = Object.getOwnPropertyNames(prototype).filter((name) => {
        const method = value[name];
        return typeof method === 'function' && method.length === 5 &&
          /^function\(e,t,n,r,i\)\{return \w+\(this\.\w+,e,t,n,r,i\)\}$/.test(String(method));
      });
      if (candidates.length === 1) return { sender: value, method: candidates[0] };
    }
    return null;
  }

  document.addEventListener(requestEvent, async (event) => {
    const { id, source, translated, conversation } = event.detail || {};
    const reply = (ok, error) => document.dispatchEvent(new CustomEvent(responseEvent, {
      detail: { id, ok, error },
    }));
    if (sending) { reply(false, '上一条消息仍在发送，请先检查会话'); return; }
    if (typeof id !== 'string' || typeof source !== 'string' || typeof translated !== 'string') return;
    sending = true;
    try {
      const host = document.querySelector('[data-testid="xchatEmbedRoute"]');
      const input = host?.shadowRoot?.querySelector('[data-testid="dm-composer-textarea"]');
      if (!input || !source || !translated || input.value !== source || location.pathname !== conversation) {
        throw new Error('会话或中文草稿已变化');
      }
      const composer = findComposer(input);
      const state = composer?.state?.state;
      const attachments = state?.attachments?.asJsReadonlyArrayView?.();
      if (!state || state.currentText !== source || state.editData || state.replyingTo ||
          state.forwardMessage || !Array.isArray(attachments) || attachments.length > 0 || state.isReadOnly) {
        throw new Error('当前消息状态不支持译文发送');
      }
      const target = findSendMethod(composer);
      if (!target) throw new Error('X Chat 发送入口已变化');
      await target.sender[target.method](translated, state.attachments, null, null, null);
      // Keep the Chinese draft intact until X has accepted the translated send.
      // The native setter plus input event lets React update its composer state.
      if (location.pathname === conversation && input.isConnected && input.value === source) {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, '');
        input.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'deleteContentBackward' }));
      }
      reply(true);
    } catch (error) {
      reply(false, error?.message || '发送失败');
    } finally {
      sending = false;
    }
  });
})();
