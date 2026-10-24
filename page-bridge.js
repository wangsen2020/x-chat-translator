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
    const identifier = '[$A-Z_a-z][$\\w]*';
    const wrapper = new RegExp(`^(?:function(?:${identifier})?)?\\(([^()]*)\\)\\{return(${identifier})\\(this\\.(${identifier}),([^()]*)\\);?\\}$`);
    const candidates = [];
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(composer))) {
      const value = descriptor.value;
      if (!value || typeof value !== 'object') continue;
      const seen = new Set();
      // Inspect data descriptors only; never invoke getters or probe a method by sending.
      for (let prototype = value, depth = 0; prototype && prototype !== Object.prototype && depth < 6;
        prototype = Object.getPrototypeOf(prototype), depth++) {
        for (const [name, property] of Object.entries(Object.getOwnPropertyDescriptors(prototype))) {
          if (seen.has(name)) continue;
          seen.add(name);
          const method = property.value;
          if (name === 'constructor' || typeof method !== 'function' || method.length !== 5) continue;
          const match = Function.prototype.toString.call(method).replace(/\s+/g, '').match(wrapper);
          if (!match) continue;
          const parameters = match[1].split(',');
          if (parameters.length !== 5 || new Set(parameters).size !== 5 ||
            parameters.some(parameter => !new RegExp(`^${identifier}$`).test(parameter)) ||
            match[4] !== parameters.join(',')) continue;
          // The delegate must forward the owner followed by all five arguments, in order.
          const owner = Object.getOwnPropertyDescriptor(value, match[3]);
          if (!owner || !owner.value || typeof owner.value !== 'object') continue;
          if (!candidates.some(candidate => candidate.sender === value && candidate.fn === method)) {
            candidates.push({ sender: value, method: name, fn: method });
          }
        }
      }
    }
    if (candidates.length > 1) throw new Error('发现多个发送入口，已暂停发送以避免误发');
    return candidates[0] || null;
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
