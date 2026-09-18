var assert = require('assert');
var addon = require(process.argv[2]);
require.cache[require.resolve('../../build/Release/raw.node')] = { exports: addon };
var raw = require('../..');
var reproduce = process.argv[3] === 'reproduce';
var combined = process.argv[3] === 'combined';
var socket = raw.createSocket();
var order = [];
var resolveMessage;
var message = new Promise(function (resolve) { resolveMessage = resolve; });
message.then(function (packet) {
  assert.strictEqual(packet.toString(), 'scope packet');
  order.push('promise'); addon.mark(2);
});
socket.on('close', function () { order.push('close'); });
socket.on('message', function (packet, source) {
  assert.strictEqual(packet.toString(), 'scope packet');
  assert.strictEqual(source, '127.0.0.1');
  order.push('message'); addon.mark(1);
  resolveMessage(packet);
  process.nextTick(function () { order.push('nextTick'); addon.mark(4); });
  queueMicrotask(function () { order.push('microtask'); addon.mark(8); });
  // Reenter the native addon synchronously; close is idempotent and its event
  // must run inline, before the listener returns or queued work executes.
  if (!combined) { socket.close(); socket.close(); }
  else assert.strictEqual(socket.wrap.pause(false, true), socket.wrap);
  order.push('listenerEnd');
  assert.deepStrictEqual(order, combined ? ['message', 'listenerEnd'] : ['message', 'close', 'listenerEnd']);
});
if (combined) socket.wrap.on('sendReady', function () {
  order.push('sendReady');
  assert.deepStrictEqual(order, ['message', 'listenerEnd', 'sendReady']);
  socket.close(); socket.close();
});
addon.start(socket.wrap, reproduce, combined);
assert.deepStrictEqual(order, []);
if (reproduce) {
  // Deliberately rescue the pre-fix case, AFTER the native observer has printed
  // the undrained state. This timer is absent from the regression mode.
  setTimeout(function () {
    console.log('unrelated Node timer: ' + JSON.stringify(order));
  }, 100);
}
process.on('exit', function () {
  assert.deepStrictEqual(order, (combined ? ['message', 'listenerEnd', 'sendReady', 'close'] :
    ['message', 'close', 'listenerEnd']).concat(['nextTick', 'promise', 'microtask']));
  console.log('continuations drained; synchronous close/reentry passed');
});
