const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

(async () => {
  let detected = {isReliable:true, languages:[{language:'zh', percentage:100}]};
  const languageContext = {chrome:{i18n:{getUILanguage:()=> 'en', getMessage:()=> '', detectLanguage:async()=> detected}}};
  vm.runInNewContext(read('i18n.js'), languageContext);
  const matches = languageContext.XCTI18n.matchesLanguage;
  assert.equal(await matches('中文帖子', 'zh-CN'), true);
  assert.equal(await matches('中文帖子', 'zh-CN', 'en'), true);
  assert.equal(await matches('中文草稿', 'en'), false);
  detected = {isReliable:false, languages:[]};
  assert.equal(await matches('短文', 'zh-CN', 'zh'), true);
  assert.equal(await matches('ambiguous', 'zh-CN'), false);
  detected = {isReliable:false, languages:[{language:'zh',percentage:100}]};
  assert.equal(await matches('你好', 'zh-CN', 'en'), true);
  assert.equal(await matches('谢谢分享！', 'zh-CN'), true);
  assert.equal(await matches('谢谢分享！', 'en'), false);
  assert.equal(await matches('今日はありがとう', 'zh-CN'), false);
  assert.equal(await matches('中文 mixed with English words', 'zh-CN'), false);

  const button = {dataset:{}};
  const props = {editorState:{getCurrentContent:()=> ({getPlainText:()=> 'My comment'})},
    quotedStatusId:'123', quotedStatus:{id_str:'123', lang:'en', full_text:'Quoted post'}};
  const input = {isConnected:true, matches:()=>true, getAttribute:()=> 'tweetTextarea_0', __reactFiber$test:{memoizedProps:props},
    parentElement:{querySelectorAll:()=> [button]}};
  const bridgeContext = {URL, window:{fetch:()=>{}}, XMLHttpRequest:{prototype:{open(){},send(){}}},
    document:{querySelector:()=> input, addEventListener(){}}, location:{href:'https://x.com/compose/post',origin:'https://x.com'}};
  const bridge = read('reply-bridge.js').replace('  window.fetch = fetchReply;',
    '  globalThis.fixture = {context, targetMatches, rewrite, sourceKey};\n  window.fetch = fetchReply;');
  vm.runInNewContext(bridge, bridgeContext);
  const {context, targetMatches, rewrite, sourceKey} = bridgeContext.fixture;
  assert.equal(context('editor').kind, 'quote');
  const operation = {editorId:'editor', kind:'quote', postId:'123',source:'My comment',translation:'译文'};
  const payload = {variables:{tweet_text:'My comment',attachment_url:'https://twitter.com/author/status/123',media:{media_entities:[{media_id:'456'}]}}};
  assert.equal(targetMatches(payload.variables, operation), true);
  assert.equal(targetMatches({...payload.variables,attachment_url:'https://x.com/a/status/999'}, operation), false);
  assert.equal(targetMatches({...payload.variables,reply:{in_reply_to_tweet_id:'123'}}, operation), false);
  const rewritten = JSON.parse(rewrite(JSON.stringify(payload), operation));
  assert.equal(rewritten.variables.tweet_text, '译文');
  assert.deepEqual(rewritten.variables.media, payload.variables.media);
  assert.equal(rewritten.variables.attachment_url, payload.variables.attachment_url);
  assert.throws(()=>rewrite(JSON.stringify(payload), operation), /replySendBusy/);
  assert.equal(sourceKey('https://twitter.com/a/status/123','draft'), sourceKey('https://x.com/i/status/123','draft'));
  delete props.quotedStatusId; delete props.quotedStatus;
  props.composerData=[{text:'My comment',quotedStatus:{id_str:'123',lang:'en',full_text:'Quote'}}];
  assert.equal(context('editor').kind,'quote');
  props.composerData[0].text='A different draft';
  assert.equal(context('editor').source,'My comment');
  delete props.composerData;
  props.inReplyToStatusId='123'; props.inReplyToStatus={id_str:'123'};
  assert.equal(context('editor').kind,'reply');
  assert.equal(targetMatches({reply:{in_reply_to_tweet_id:'123'}}, {kind:'reply',postId:'123'}),true);
  console.log('PASS: local language detection, quote context, target validation, payload preservation, replay guard, reply compatibility');
})().catch(error => {console.error(error); process.exitCode=1;});
