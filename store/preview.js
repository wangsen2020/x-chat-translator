const params = new URLSearchParams(location.search);
const locale = params.get('lang') || 'en';
const copy = {
 en: ['Preview, then send','Keep your original draft in the composer','Read both languages','Bilingual posts on Home, For you and post details','Demo interface','Demo post','Demo chat','Actual extension UI with sample content · Internet required','Hello, nice to meet you!','Hi! Thank you for sharing your work.','Good design makes everyday conversations easier. Start with a clear idea, then choose the words that feel right.','A quiet morning, a good cup of coffee, and a new city to explore.'],
 zh_CN: ['先预览译文，再发送','原文草稿保留在输入框中','阅读原文，也看懂译文','首页、推荐与帖子详情中的双语正文','示例界面','示例帖子','示例聊天','使用扩展实际界面与示例内容展示 · 翻译需要联网','你好，很高兴认识你！','你好！谢谢你分享你的作品。','好的设计让日常交流更轻松。从一个清晰的想法开始，再选择恰当的表达。','一个宁静的早晨，一杯好咖啡，还有一座等待探索的新城市。'],
 es_419: ['Revisa la traducción antes de enviar','Tu borrador original sigue en el cuadro de texto','Lee en ambos idiomas','Publicaciones bilingües en Inicio, Para ti y detalles','Interfaz de ejemplo','Publicación de ejemplo','Chat de ejemplo','Interfaz real con contenido de ejemplo · Requiere internet','¡Hola, mucho gusto!','¡Hola! Gracias por compartir tu trabajo.','Un buen diseño facilita las conversaciones cotidianas. Empieza con una idea clara y elige las palabras adecuadas.','Una mañana tranquila, un buen café y una nueva ciudad por explorar.'],
 ja: ['訳文を確認してから送信','入力欄の原文はそのまま','原文と訳文を一緒に読む','ホーム、おすすめ、ポスト詳細で二言語表示','サンプル画面','サンプルポスト','サンプルチャット','実際の拡張機能 UI とサンプル内容 · インターネット接続が必要','こんにちは、はじめまして！','こんにちは！作品を共有してくれてありがとう。','優れたデザインは日々の会話をより簡単にします。明確な考えから始めて、適切な言葉を選びましょう。','静かな朝、おいしいコーヒー、そして探索を待つ新しい街。'],
 ko: ['번역을 확인한 후 전송하세요','입력창의 원문 초안은 그대로 유지','원문과 번역을 함께 읽으세요','홈, 추천, 게시물 상세에서 이중 언어 표시','예시 화면','예시 게시물','예시 채팅','실제 확장 프로그램 UI와 예시 콘텐츠 · 인터넷 연결 필요','안녕하세요, 만나서 반가워요!','안녕하세요! 작업을 공유해 주셔서 감사합니다.','좋은 디자인은 일상의 대화를 더 쉽게 만듭니다. 명확한 생각에서 시작해 알맞은 표현을 골라 보세요.','고요한 아침, 맛있는 커피 한 잔, 그리고 탐험할 새로운 도시.']
}[locale];
const catalog = await (await fetch(`../_locales/${locale}/messages.json`)).json();
const uiLanguage = locale.replace('_','-');
const reading = {en:'en',zh_CN:'zh-CN',es_419:'es',ja:'ja',ko:'ko'}[locale];
const getMessage = (key, substitutions=[]) => {
 if(key==='@@bidi_dir')return 'ltr';
 const item=catalog[key];let text=item?.message||'';const values=Array.isArray(substitutions)?substitutions:[substitutions];
 for(const [name,p] of Object.entries(item?.placeholders||{}))text=text.replaceAll('$'+name.toUpperCase()+'$',values[Number(p.content.slice(1))-1]??'');
 return text;
};
const isPosts=params.get('view')==='posts';
const sourceLocale=locale==='en'?'es_419':'en';
const originals=sourceLocale==='en'?['Hi! Thank you for sharing your work.','Good design makes everyday conversations easier. Start with a clear idea, then choose the words that feel right.','A quiet morning, a good cup of coffee, and a new city to explore.']:['¡Hola! Gracias por compartir tu trabajo.','Un buen diseño facilita las conversaciones cotidianas. Empieza con una idea clara y elige las palabras adecuadas.','Una mañana tranquila, un buen café y una nueva ciudad por explorar.'];
const translations=Object.fromEntries(originals.map((s,i)=>[s,copy[9+i]]));
translations[copy[8]]=locale==='en'?'¡Hola, mucho gusto!':'Hello, nice to meet you!';
const preferences={settingsOpen:true,incomingLanguage:reading,incomingEnabled:true,showOriginal:true,['target:'+location.pathname]:locale==='en'?'es':'en'};
window.chrome={i18n:{getMessage,getUILanguage:()=>uiLanguage},runtime:{id:'store-preview',sendMessage:async({text})=>({ok:true,text:translations[text]||text})},storage:{local:{get:async()=>preferences,set:async(v)=>Object.assign(preferences,v)},onChanged:{addListener(){},removeListener(){}}}};
document.documentElement.lang=uiLanguage;
document.querySelector('#headline').textContent=copy[isPosts?2:0];
document.querySelector('#subtitle').textContent=copy[isPosts?3:1];
document.querySelector('.tag').textContent='XTrans · '+copy[4];
document.querySelector('.foot').textContent='XTrans 1.8.0 · '+copy[7];
if(isPosts){
 document.body.classList.add('posts-view');document.querySelector('main').remove();document.querySelector('#posts').hidden=false;
 document.querySelectorAll('.person').forEach((e,i)=>e.textContent=['Design Notes','Travel Journal'][i]+' · '+copy[5]);
 document.querySelectorAll('[data-testid=tweetText]').forEach((e,i)=>{e.textContent=originals[i+1];e.lang=sourceLocale==='en'?'en':'es';});
}else{
 document.querySelector('.tag').hidden=true;
 const root=document.querySelector('#chat').attachShadow({mode:'open'});
 root.innerHTML=`<style>:host{display:block}.name{padding:22px 12px;border-bottom:1px solid #303238;font-weight:bold}.messages{padding:30px 14px;height:370px}.bubble{padding:18px;background:#202327;border-radius:18px;max-width:500px}.composer{box-sizing:border-box;position:absolute;bottom:22px;width:100%;height:58px;display:flex;align-items:center;padding:8px 14px;background:#17191d;border-radius:30px}textarea{resize:none;width:100%;height:38px;background:transparent;border:0;color:#eee;font:16px/34px system-ui;outline-offset:3px}button{border:0;border-radius:50%;width:38px;height:38px;background:#249be8;color:white;font-size:22px;flex-shrink:0}</style><div class="name"></div><div class="messages"><div data-testid="message-111" class="justify-start"><div class="bubble" data-testid="message-text-111"><span dir="auto"><span></span></span></div></div></div><div class="composer" data-testid="dm-composer-container"><textarea data-testid="dm-composer-textarea" aria-label="Draft"></textarea><button data-testid="dm-composer-send-button" aria-label="Send">↑</button></div>`;
 root.querySelector('.name').textContent='Alex · '+copy[6];root.querySelector('.bubble span span').textContent=originals[0];
}
for(const src of ['../i18n.js','../content.js','../posts.js'])await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.onload=resolve;script.onerror=reject;document.body.append(script);});
if(!isPosts){const input=document.querySelector('#chat').shadowRoot.querySelector('textarea');input.value=copy[8];input.dispatchEvent(new Event('input',{bubbles:true}));}
window.previewReady=true;
