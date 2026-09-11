var assert = require('assert');
var addon = require(process.argv[2]);
// Load the public JS wrapper against the isolated addon.
require.cache[require.resolve('../../build/Release/raw.node')] = { exports: addon };
var raw = require('../..');
var scenario = process.argv[3];
var s = raw.createSocket();
var order = [], completed = 0, before = 0, sends = 0;
var counts = [0, 0, 0];
s.wrap.send = function () { sends++; };
var listenerError = new Error('listener failed');
s.on('error', function (err) {
  assert(err instanceof Error); assert.strictEqual(err.message, String(addon.failure));
  order.push('error');
  // Reentrant native use cannot recreate the descriptor during error delivery.
  assert.throws(function () { s.wrap.recv(Buffer.alloc(1), function () {}); });
  assert.strictEqual(addon.state(s.wrap).fd, false);
  if (scenario === 'throw') throw listenerError;
});
s.on('close', function () { order.push('close'); });
// Queue several requests without resuming yet.
s.sendPaused = false;
counts.forEach(function (_, i) { s.send(Buffer.alloc(1), 0, 1, '127.0.0.1',
  function () { before++; }, function (err, bytes) {
    assert(err instanceof Error); assert.strictEqual(bytes, 0); completed++; counts[i]++; order.push('callback');
  }); });
if (scenario === 'auto') s.sendPaused = true;
addon.fail();
var thrown;
try {
  if (scenario === 'auto') s.send(Buffer.alloc(1), 0, 1, '127.0.0.1', function (err, bytes) {
    assert(err instanceof Error); assert.strictEqual(bytes, 0); order.push('auto');
  });
  else s[['pauseSend', 'resumeRecv', 'pauseRecv'].includes(scenario) ? scenario : 'resumeSend']();
} catch (err) { thrown = err; }
var state = addon.state(s.wrap);
s.resumeSend(); s.resumeSend();
assert.strictEqual(addon.state(s.wrap).starts, state.starts);
if (scenario === 'before') {
  assert(thrown); assert.strictEqual(s.closed, false);
  assert.strictEqual(s.requests.length, 3); assert.strictEqual(s.sendPaused, false);
  assert.deepStrictEqual([state.initialised, state.watcher, state.fd, state.closed], [false, false, false, false]);
  setImmediate(function () {
    assert.strictEqual(completed, 0);
    console.log('Pre-fix stranded state:', JSON.stringify(state), 'sendPaused=false queued=3 callbacks=0 open=true');
    s.close();
  });
} else {
  if (scenario === 'throw') assert.strictEqual(thrown, listenerError);
  else assert.ifError(thrown);
  assert.strictEqual(s.closed, true); assert.strictEqual(s.requests.length, 0);
  assert.deepStrictEqual([state.initialised, state.watcher, state.fd, state.closed], [false, false, false, true]);
  s.onSendReady(); s.close();
  assert.deepStrictEqual(order, ['error', 'close']);
  process.nextTick(function () {
    assert.deepStrictEqual(counts, [1, 1, 1]);
    assert.strictEqual(completed, 3); assert.strictEqual(before, 0); assert.strictEqual(sends, 0);
    assert.deepStrictEqual(order, ['error', 'close', 'callback', 'callback', 'callback'].concat(scenario === 'auto' ? ['auto'] : []));
    var healthy = raw.createSocket();
    healthy.pauseRecv(); healthy.resumeSend(); healthy.resumeRecv();
    assert.strictEqual(addon.state(healthy.wrap).events, 3); // readable and writable
    healthy.pauseSend();
    assert.strictEqual(addon.state(healthy.wrap).events, 1); // readable remains enabled
    assert.strictEqual(healthy.closed, false);
    var sender = require('dgram').createSocket('udp4');
    healthy.on('message', function (buffer) {
      assert.strictEqual(buffer.toString(), 'readable');
      healthy.close(); healthy.close(); sender.close();
      console.log('Actual receive after healthy resume passed');
      setImmediate(function () {
        setImmediate(function () {
          assert.strictEqual(addon.state(s.wrap).deleted, 2);
          healthy = null;
          global.gc();
          setImmediate(function () {
            assert.strictEqual(addon.state(s.wrap).deleted, 2);
          });
        });
      });
    });
    sender.send(Buffer.from('readable'), addon.state(healthy.wrap).port, '127.0.0.1');
    console.log('Poll restart recovery and healthy readiness passed');
  });
}
