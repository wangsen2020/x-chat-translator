// Classic script shared by extension pages and isolated content scripts.
(() => {
  const fallback = {

  "replyPreview": {
    "message": "Reply translation"
  },
  "replyTarget": {
    "message": "Translate to"
  },
  "replyAuto": {
    "message": "Follow post"
  },
  "replyAutoTip": {
    "message": "Automatically detects the post's language and translates your reply into it."
  },
  "replyIntercept": {
    "message": "Intercept sending"
  },
  "replyEnabled": {
    "message": "Translate replies"
  },
  "replyPopupHint": {
    "message": "Keep your original text and preview the translation below. With interception on, Enter and Reply send the translation."
  },
  "replyTargetSetting": {
    "message": "Reply target language"
  },
  "replyChooseLanguage": {
    "message": "Post language is uncertain. Choose a target language."
  },
  "replySlow": {
    "message": "AI is still translating. Please wait…"
  },
  "replyWaitingToSend": {
    "message": "Will send when the translation is ready…"
  },
  "replyEnterHint": {
    "message": "Enter sends translation · Shift + Enter adds a line"
  },
  "replyPreviewOnly": {
    "message": "Preview only · X sends your original text"
  },
  "replySendUnknown": {
    "message": "Sending is unconfirmed. Check the replies before trying again."
  },
  "replySendFailed": {
    "message": "Sending failed. Your original text is retained. Check before retrying."
  },
  "replySendBusy": {
    "message": "Sending. Please wait…"
  },
  "replyDraftChanged": {
    "message": "The draft or reply target changed. Send again when ready."
  },
  "replySenderChanged": {
    "message": "X’s publishing interface changed. Sending paused. Refresh this page."
  },
  "replyTooManyPending": {
    "message": "Too many unconfirmed translations. Check earlier results first."
  }
,

  "extName": {
    "message": "Twitter Translator for X – Tweets & DMs | X Chat Translator"
  },
  "extDesc": {
    "message": "Auto-translate tweets and replies on X (Twitter). Read bilingual posts and translate DMs with a preview before sending."
  },
  "refreshRequired": {
    "message": "Extension updated. Refresh this page."
  },
  "translationFailed": {
    "message": "Translation failed. Please retry."
  },
  "paused": {
    "message": "Translation paused"
  },
  "translating": {
    "message": "Translating…"
  },
  "sending": {
    "message": "Sending translation…"
  },
  "enterToSend": {
    "message": "Press Enter to send translation"
  },
  "sendPaused": {
    "message": "Sending paused"
  },
  "on": {
    "message": "On"
  },
  "off": {
    "message": "Off"
  },
  "show": {
    "message": "Show"
  },
  "hide": {
    "message": "Hide"
  },
  "collapse": {
    "message": "Collapse translation settings"
  },
  "expand": {
    "message": "Expand translation settings"
  },
  "translationTimeout": {
    "message": "Translation timed out. Please retry."
  },
  "retry": {
    "message": "Retry"
  },
  "sendUnconfirmed": {
    "message": "Sending is not confirmed. Check the chat before trying again."
  },
  "sendFailed": {
    "message": "Could not send. Check the chat before retrying."
  },
  "previewLabel": {
    "message": "Translation preview"
  },
  "settings": {
    "message": "Translation settings"
  },
  "outgoing": {
    "message": "Outgoing messages"
  },
  "translateTo": {
    "message": "Translate to"
  },
  "previewHint": {
    "message": "Preview before sending. Send only when the translation is ready."
  },
  "sendTranslation": {
    "message": "Translate outgoing"
  },
  "incoming": {
    "message": "Incoming messages"
  },
  "myLanguage": {
    "message": "Translate into my language"
  },
  "autoTranslate": {
    "message": "Auto-translate"
  },
  "showOriginal": {
    "message": "Show original"
  },
  "settingsHint": {
    "message": "Settings save automatically. Incoming translations appear below the original message."
  },
  "postFailed": {
    "message": "Translation failed. Original text preserved."
  },
  "postTranslation": {
    "message": "Post translation"
  },
  "translationLabel": {
    "message": "Translation · $LANGUAGE$",
    "placeholders": {
      "language": {
        "content": "$1"
      }
    }
  },
  "multipleSenders": {
    "message": "Multiple send handlers detected. Sending paused."
  },
  "sendBusy": {
    "message": "A message is still sending. Check the chat first."
  },
  "draftChanged": {
    "message": "Unsaved engine changes."
  },
  "unsupportedMessage": {
    "message": "Translation sending is unavailable for this message state."
  },
  "senderChanged": {
    "message": "X Chat has changed. Sending paused to protect your draft."
  },
  "invalidTranslation": {
    "message": "Invalid translation request."
  },
  "serviceError": {
    "message": "Translation service returned $STATUS$.",
    "placeholders": {
      "status": {
        "content": "$1"
      }
    }
  },
  "emptyTranslation": {
    "message": "The translation was empty."
  },
  "readSettingsFailed": {
    "message": "Could not read settings. Reopen the extension."
  },
  "saved": {
    "message": "Saved. Open pages update automatically."
  },
  "saveFailed": {
    "message": "Could not save. Please retry."
  },
  "popupSubtitle": {
    "message": "Preview outgoing · Translate incoming"
  },
  "popupIntro": {
    "message": "Read posts with translations below the original. Type a message in X Chat, check the translation, then press Enter to send."
  },
  "postsToggle": {
    "message": "Bilingual posts"
  },
  "readingLanguage": {
    "message": "My language (posts and incoming messages)"
  },
  "postsHint": {
    "message": "Applies to visible posts and replies. Choose the display mode in settings."
  },
  "openChat": {
    "message": "Open X Chat"
  },
  "sidebarHint": {
    "message": "Chat settings appear on the right side of X Chat."
  },
  "privacyHint": {
    "message": "Posts and reply drafts are sent to the selected translation service. DMs use Google Translate."
  },
  "lang_en": {
    "message": "English"
  },
  "lang_es": {
    "message": "Spanish"
  },
  "lang_ja": {
    "message": "Japanese"
  },
  "lang_ko": {
    "message": "Korean"
  },
  "lang_fr": {
    "message": "French"
  },
  "lang_de": {
    "message": "German"
  },
  "lang_pt": {
    "message": "Portuguese"
  },
  "lang_ar": {
    "message": "Arabic"
  },
  "lang_ru": {
    "message": "Russian"
  },
  "lang_zh_CN": {
    "message": "Simplified Chinese"
  },
  "optsTitle": {
    "message": "Translation settings"
  },
  "readPrefs": {
    "message": "Reading preferences"
  },
  "autoPosts": {
    "message": "Translate visible posts"
  },
  "readLang": {
    "message": "Reading language"
  },
  "displayMode": {
    "message": "Post display"
  },
  "bilingual": {
    "message": "Bilingual"
  },
  "replaceMode": {
    "message": "Replace in place"
  },
  "postPreview": {
    "message": "Post preview"
  },
  "sample": {
    "message": "Sample posts"
  },
  "sharedLang": {
    "message": "Also used for incoming messages."
  },
  "postEngineTitle": {
    "message": "Post translation engine"
  },
  "translationService": {
    "message": "Translation service"
  },
  "localAddress": {
    "message": "Local service address"
  },
  "accessToken": {
    "message": "Access token"
  },
  "localToken": {
    "message": "Stored only in this browser."
  },
  "aiProvider": {
    "message": "AI engine"
  },
  "existingSession": {
    "message": "Existing session"
  },
  "refreshSessions": {
    "message": "Check connection and refresh sessions"
  },
  "relayScope": {
    "message": "Posts go to the selected AI session. DMs use Google Translate."
  },
  "googleScope": {
    "message": "Posts and DMs use Google Translate."
  },
  "saveEngine": {
    "message": "Save engine"
  },
  "trialPosts": {
    "message": "Try 2 sample posts"
  },
  "trialDone": {
    "message": "Both translations are ready."
  },
  "trialResults": {
    "message": "Trial results"
  },
  "detecting": {
    "message": "Checking connection…"
  },
  "pickSession": {
    "message": "Refresh and choose a session."
  },
  "emptySessions": {
    "message": "Prepare a translation session in AgentRelay, then refresh."
  },
  "showTranslation": {
    "message": "Show translation"
  },
  "checkResult": {
    "message": "Check result"
  },
  "slowTranslation": {
    "message": "Still translating. You can keep reading."
  },
  "relayUnknown": {
    "message": "Result unconfirmed. Check the original request."
  },
  "relayInvalid": {
    "message": "Incomplete or invalid translation."
  },
  "relayFailed": {
    "message": "Translation failed."
  },
  "relayAddressError": {
    "message": "Enter an HTTP loopback address."
  },
  "relayOffline": {
    "message": "Could not reach AgentRelay. Check the address and service."
  },
  "relayAuth": {
    "message": "Check the access token."
  },
  "relayForbidden": {
    "message": "Check browser and AgentRelay origin permissions."
  },
  "relayConfigError": {
    "message": "Check the token, AI engine and session."
  },
  "relayUnavailable": {
    "message": "The selected AI engine is unavailable."
  },
  "relayMissing": {
    "message": "Session or request not found."
  },
  "relayRejected": {
    "message": "AgentRelay rejected this request."
  },
  "relayStale": {
    "message": "Settings have changed."
  },
  "relayPriorPending": {
    "message": "An earlier request is unconfirmed. Check the selected session before retrying."
  },
  "aiGuide": {
    "message": "Set up local AI translation with AgentRelay"
  },
  "relayNotInstalled": {
    "message": "AgentRelay is not installed on this computer."
  },
  "relayNotRunning": {
    "message": "AgentRelay is installed, but not running."
  },
  "relayPortConflict": {
    "message": "The AgentRelay port is in use by another program."
  },
  "relayGuideNotInstalledBody": {
    "message": "Install and launch AgentRelay on this computer, then click Retry. The extension will automatically fetch your local address and token."
  },
  "relayGuideNotRunningBody": {
    "message": "AgentRelay is installed on this computer, but the local service is not running. Launch AgentRelay, then click Retry."
  },
  "relayGuideLearnMore": {
    "message": "Get AgentRelay"
  },
  "relayGuideRetry": {
    "message": "Retry detection"
  },
  "close": {
    "message": "Close"
  },
  "postEngineLabel": {
    "message": "Posts"
  },
  "replyEngineLabel": {
    "message": "Replies"
  },
  "chatIncomingEngineLabel": {
    "message": "Chat incoming"
  },
  "chatOutgoingEngineLabel": {
    "message": "Chat outgoing"
  },
  "geminiApiKey": {
    "message": "Gemini API Key"
  },
  "geminiGetKey": {
    "message": "Get key"
  },
  "geminiTest": {
    "message": "Test"
  },
  "geminiKeyHint": {
    "message": "Stored locally in this browser. Free keys are available in Google AI Studio."
  },
  "geminiModel": {
    "message": "Gemini model"
  },
  "multiEngineScope": {
    "message": "Each area uses its selected engine independently."
  },
  "geminiConfigError": {
    "message": "Enter your Gemini API Key."
  },
  "geminiPermissionDenied": {
    "message": "Allow access to generativelanguage.googleapis.com to use Gemini API."
  },
  "geminiConnected": {
    "message": "Gemini API connection verified."
  },
  "geminiAuth": {
    "message": "Gemini API key was rejected. Check the key."
  },
  "geminiModelError": {
    "message": "Selected Gemini model is unavailable."
  },
  "geminiRateLimit": {
    "message": "Gemini API is busy or rate-limited. Retry shortly."
  },
  "geminiOffline": {
    "message": "Could not reach Gemini API. Check your network."
  },
  "geminiFailed": {
    "message": "Gemini API translation failed."
  },
  "navProviders": {
    "message": "Translation Engines"
  },
  "navScenes": {
    "message": "Engine Assignment"
  },
  "navPreferences": {
    "message": "Preferences"
  },
  "googleDesc": {
    "message": "Free cloud translation, zero setup, enabled by default."
  },
  "relayDesc": {
    "message": "Local AI bridge with one-click install detection and token exchange."
  },
  "statusEnabled": {
    "message": "Enabled"
  },
  "statusUnconfigured": {
    "message": "Not enabled"
  },
  "enableBtn": {
    "message": "Configure"
  },
  "collapseBtn": {
    "message": "Hide"
  },
  "relayAutoEnable": {
    "message": "One-click enable"
  },
  "testPreview": {
    "message": "Test preview"
  },
  "postSceneHint": {
    "message": "Home timeline, post details, and thread tweets"
  },
  "replySceneHint": {
    "message": "Live preview and send interception in reply composer"
  },
  "chatInSceneHint": {
    "message": "Incoming messages received in X Chat"
  },
  "chatOutSceneHint": {
    "message": "Outgoing message preview before sending in X Chat"
  },
  "saveScenes": {
    "message": "Save assignments"
  },
  "themeSetting": {
    "message": "Appearance"
  },
  "themeAuto": {
    "message": "Default"
  },
  "themeLight": {
    "message": "Light"
  },
  "themeDark": {
    "message": "Dark"
  },
  "basicSettings": {
    "message": "Basic"
  },
  "advancedSettings": {
    "message": "Advanced"
  },
  "replyEngineShort": {
    "message": "Engine"
  }
};
  const cache = new Map();
  let language = 'en';
  try { language = chrome.i18n.getUILanguage(); } catch {}
  function t(key, substitutions = []) {
    const values = Array.isArray(substitutions) ? substitutions : [substitutions];
    const cacheKey = JSON.stringify([key, values]);
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    let text = '';
    try { if (chrome.runtime?.id) text = chrome.i18n.getMessage(key, values); } catch {}
    if (!text) {
      const item = fallback[key];
      text = item?.message || '';
      for (const [name, entry] of Object.entries(item?.placeholders || {})) {
        text = text.replaceAll('$' + name.toUpperCase() + '$', String(values[Number(entry.content.slice(1)) - 1] ?? ''));
      }
    }
    cache.set(cacheKey, text);
    return text;
  }
  const codes = ['en','es','ja','ko','fr','de','pt','ar','ru','zh-CN'];
  const base = language.toLowerCase().split(/[-_]/)[0];
  const readingLanguage = base === 'zh' ? 'zh-CN' : codes.includes(base) ? base : 'en';
  const languages = codes.map(code => [code, t('lang_' + code.replace('-', '_'))]);
  function localize(root = document) {
    for (const attr of ['data-i18n','data-i18n-title','data-i18n-aria-label','data-i18n-placeholder']) {
      root.querySelectorAll('[' + attr + ']').forEach(el => {
        if (attr === 'data-i18n') el.textContent = t(el.getAttribute(attr));
        else el.setAttribute(attr.slice(10), t(el.getAttribute(attr)));
      });
    }
  }
  globalThis.XCTI18n = { t, language, readingLanguage, languages, localize };
})();
