// Offline design prototype. Service replies and translations are fixtures.
const byId = id => document.getElementById(id);
const samples = [
  { id: 'field', author: 'Field Notes', source: 'La lumière revient sur le lac.', zh: '湖面又有了光。', en: 'The light returns to the lake.' },
  { id: 'studio', author: 'Studio Letter', source: '新しい書体を今日公開しました。', zh: '我们今天发布了一款新字体。', en: 'We released a new typeface today.' }
];
const sessionNames = { codex: '帖子翻译测试', antigravity: '阅读试译' };
const storageKey = 'xct-options-design-v1';
let saved = {};
try { saved = JSON.parse(localStorage.getItem(storageKey)) || {}; } catch {}
let generation = 0;
let translations = new Map();
let originals = new Set();
function feedback(message, error = false) {
  byId('feedback').textContent = message;
  byId('feedback').classList.toggle('error', error);
}
function persist(patch) {
  Object.assign(saved, patch);
  try { localStorage.setItem(storageKey, JSON.stringify(saved)); return true; }
  catch { feedback('浏览器无法保存演示设置。', true); return false; }
}
function drawPosts() {
  const enabled = byId('enabled').checked;
  const replace = document.querySelector('[value="replace"]').checked;
  byId('feed').replaceChildren(...samples.map(post => {
    const item = document.createElement('article');
    const name = document.createElement('p');
    name.className = 'byline';
    name.textContent = post.author;
    const original = document.createElement('p');
    original.className = 'source';
    original.textContent = post.source;
    const translated = document.createElement('p');
    translated.className = 'translation';
    translated.textContent = translations.get(post.id) || '';
    const hasTranslation = enabled && translations.has(post.id);
    const showOriginal = originals.has(post.id);
    original.hidden = hasTranslation && replace && !showOriginal;
    translated.hidden = !hasTranslation || (replace && showOriginal);
    item.append(name, original, translated);
    if (hasTranslation && replace) {
      const toggle = document.createElement('button');
      toggle.className = 'original';
      const update = () => { toggle.textContent = originals.has(post.id) ? '查看译文' : '查看原文'; };
      update();
      toggle.onclick = () => {
        if (originals.has(post.id)) originals.delete(post.id);
        else originals.add(post.id);
        original.hidden = !originals.has(post.id);
        translated.hidden = originals.has(post.id);
        update();
      };
      item.append(toggle);
    }
    return item;
  }));
}
function preview(result = false) {
  originals.clear();
  const language = byId('language').value;
  // Fixture response intentionally arrives in the reverse order.
  translations = new Map([...samples].reverse().map(post => [post.id, post[language]]));
  byId('preview-caption').textContent = result ? '批量试译结果' : '显示示例';
  drawPosts();
}
function stopTrial() {
  generation++;
  byId('trial').disabled = !byId('enabled').checked;
}
function fillSessions() {
  const provider = byId('provider').value;
  byId('session').replaceChildren(new Option(sessionNames[provider], provider + '-demo'));
}
function checkConnection() {
  const address = byId('address');
  const token = byId('token');
  if (address.value.trim().replace(/\/$/, '') !== 'http://127.0.0.1:8787') {
    feedback('演示服务位于 http://127.0.0.1:8787，请检查地址。', true);
    address.focus(); return false;
  }
  if (token.value !== 'demo') {
    feedback('演示令牌为 demo，请修改后重新检测。', true);
    token.focus(); return false;
  }
  return true;
}
function checkDraft() {
  if (byId('engine').value === 'google') return true;
  if (!checkConnection()) return false;
  if (!byId('session').value) {
    feedback('请刷新并选择一个已有会话。', true);
    byId('refresh').focus(); return false;
  }
  return true;
}
function showEngine() {
  const relay = byId('engine').value === 'relay';
  byId('binding').hidden = !relay;
  byId('trial').hidden = !relay;
  byId('scope').textContent = relay ? '只有帖子正文会交给所选会话。私信沿用 Google Translate。' : '帖子和私信使用 Google Translate。';
}
function changeReading() {
  stopTrial();
  feedback('');
  persist({enabled:byId('enabled').checked,language:byId('language').value,mode:document.querySelector('[name="mode"]:checked').value});
  preview();
}
byId('enabled').checked = saved.enabled !== false;
byId('language').value = saved.language === 'en' ? 'en' : 'zh';
document.querySelector('[value="replace"]').checked = saved.mode === 'replace';
byId('engine').value = saved.engine === 'google' ? 'google' : 'relay';
byId('provider').value = saved.provider === 'antigravity' ? 'antigravity' : 'codex';
fillSessions(); showEngine(); stopTrial(); preview();
for (const id of ['enabled','language']) byId(id).onchange = changeReading;
for (const radio of document.querySelectorAll('[name="mode"]')) radio.onchange = changeReading;
function editDraft() { stopTrial(); preview(); feedback('引擎配置有未保存的更改。'); }
byId('engine').onchange = () => { editDraft(); showEngine(); };
for (const id of ['address','token','provider']) {
  byId(id).addEventListener(id === 'provider' ? 'change' : 'input', () => {
    editDraft();
    byId('session').replaceChildren(new Option('请刷新会话', ''));
  });
}
byId('refresh').onclick = () => {
  editDraft();
  if (checkConnection()) { fillSessions(); feedback('演示连接成功，已载入已有会话。'); }
};
byId('save').onclick = () => {
  if (!checkDraft()) return;
  if (persist({engine:byId('engine').value, provider:byId('provider').value})) feedback('已保存引擎配置。');
};
byId('trial').onclick = () => {
  if (!checkDraft()) return;
  const ticket = ++generation;
  byId('trial').disabled = true;
  translations.clear(); originals.clear(); drawPosts();
  byId('preview-caption').textContent = '试译中…';
  feedback('正在试译 2 条示例帖子…');
  setTimeout(() => {
    if (ticket !== generation) return;
    preview(true); byId('trial').disabled = false;
    feedback('2 条译文已回填到对应帖子。');
  }, 650);
};
