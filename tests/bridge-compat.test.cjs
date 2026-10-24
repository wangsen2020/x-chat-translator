const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '..', 'page-bridge.js'), 'utf8');
const context = { document: { addEventListener() {} } };
vm.runInNewContext(source.replace('  document.addEventListener(requestEvent,',
  '  globalThis.resolveSender = findSendMethod;\n  document.addEventListener(requestEvent,'), context);
const resolve = context.resolveSender;
const historical = function(e,t,n,r,i){return abc(this.owner,e,t,n,r,i)};
const current = function(e,t,n,r,i){return $Pl(this.owner,e,t,n,r,i)};
const renamed = function send (text, attachments, reply, edit, extra) {
  return _$send(this.$owner, text, attachments, reply, edit, extra);
};
function sender(fn, own = false) {
  const prototype = { send: fn };
  const instance = Object.create(own ? null : Object.create(prototype));
  instance.owner = {}; instance.$owner = {};
  if (own) instance.send = fn;
  return instance;
}
for (const fn of [historical, current, renamed]) {
  for (const own of [false, true]) {
    const value = sender(fn, own);
    assert.equal(resolve({ delegate: value }).sender, value);
  }
}
const reordered = function(e,t,n,r,i){return abc(this.owner,t,e,n,r,i)};
assert.equal(resolve({ delegate: sender(reordered) }), null);
assert.equal(resolve({ delegate: sender(function(e,t,n,r){return abc(this.owner,e,t,n,r)}) }), null);
const missing = sender(current); delete missing.owner;
assert.equal(resolve({ delegate: missing }), null);
assert.throws(() => resolve({ first: sender(current), second: sender(historical) }), /多个/);
const getters = {};
Object.defineProperty(getters, 'danger', { get() { throw Error('Getter must not run'); } });
assert.equal(resolve(getters), null);
const alias = sender(current, true); alias.otherName = current;
assert.equal(resolve({ delegate: alias }).sender, alias);
console.log('PASS: historical/current $ wrappers, renamed arguments, formatting, own/inherited methods, ambiguous candidates, argument order, missing owner, getters, aliases');
