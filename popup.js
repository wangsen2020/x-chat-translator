const postsEnabled = document.querySelector('#posts-enabled');
const readingLanguage = document.querySelector('#reading-language');
const saveStatus = document.querySelector('#save-status');
chrome.storage.local.get(['postsEnabled', 'incomingLanguage']).then(data => {
  postsEnabled.checked = data.postsEnabled !== false;
  readingLanguage.value = data.incomingLanguage || 'zh-CN';
  postsEnabled.disabled = false;
  readingLanguage.disabled = false;
}).catch(() => { saveStatus.textContent = '无法读取设置，请重新打开插件'; });
async function save() {
  try {
    await chrome.storage.local.set({ postsEnabled: postsEnabled.checked, incomingLanguage: readingLanguage.value });
    saveStatus.textContent = '已保存，已打开的页面自动生效';
  } catch { saveStatus.textContent = '保存失败，请重试'; }
}
postsEnabled.addEventListener('change', save);
readingLanguage.addEventListener('change', save);
