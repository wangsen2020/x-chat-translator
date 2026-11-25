const { t, localize, languages, readingLanguage: defaultReadingLanguage, language } = globalThis.XCTI18n;
localize();
document.documentElement.lang = language;
document.documentElement.dir = chrome.i18n.getMessage('@@bidi_dir') || 'ltr';
const postsEnabled = document.querySelector('#posts-enabled');
const readingLanguage = document.querySelector('#reading-language');
const repliesEnabled = document.querySelector('#replies-enabled');
const replyLanguage = document.querySelector('#reply-language');
replyLanguage.replaceChildren(new Option(t('replyAuto'), 'auto'), ...languages.map(([code, label]) => new Option(label, code)));
readingLanguage.replaceChildren(...languages.map(([code, label]) => new Option(label, code)));
const saveStatus = document.querySelector('#save-status');
chrome.storage.local.get(['postsEnabled', 'incomingLanguage', 'replyTranslationEnabled', 'replyTargetLanguage']).then(data => {
  postsEnabled.checked = data.postsEnabled !== false;
  readingLanguage.value = data.incomingLanguage || defaultReadingLanguage;
  postsEnabled.disabled = false;
  readingLanguage.disabled = false;
  repliesEnabled.checked = data.replyTranslationEnabled !== false;
  replyLanguage.value = data.replyTargetLanguage || 'auto';
  repliesEnabled.disabled = false;
  replyLanguage.disabled = false;
}).catch(() => { saveStatus.textContent = t('readSettingsFailed'); });
async function save(event) {
  try {
    const values = event.target === postsEnabled ? {postsEnabled:postsEnabled.checked} :
      event.target === repliesEnabled ? {replyTranslationEnabled:repliesEnabled.checked} :
      event.target === replyLanguage ? {replyTargetLanguage:replyLanguage.value} : {incomingLanguage:readingLanguage.value};
    await chrome.storage.local.set(values);
    saveStatus.textContent = t('saved');
  } catch { saveStatus.textContent = t('saveFailed'); }
}
postsEnabled.addEventListener('change', save);
readingLanguage.addEventListener('change', save);
repliesEnabled.addEventListener('change', save);
replyLanguage.addEventListener('change', save);

document.querySelector('#options').onclick = () => chrome.runtime.openOptionsPage();
chrome.storage.onChanged.addListener((changes,area)=>{
  if(area !== 'local')return;
  if(changes.postsEnabled)postsEnabled.checked=changes.postsEnabled.newValue !== false;
  if(changes.incomingLanguage)readingLanguage.value=changes.incomingLanguage.newValue || defaultReadingLanguage;
  if(changes.replyTranslationEnabled)repliesEnabled.checked=changes.replyTranslationEnabled.newValue !== false;
  if(changes.replyTargetLanguage)replyLanguage.value=changes.replyTargetLanguage.newValue || 'auto';
});
