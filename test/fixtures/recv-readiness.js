var assert = require('assert');
var addon = require(process.argv[2]);
require.cache[require.resolve('../../build/Release/raw.node')] = { exports: addon };
var raw = require('../..');
var scenario = process.argv[3];
var s = raw.createSocket();
var errors = 0, closes = 0, messages = 0, callbacks = 0;
var originalRecv = s.wrap.recv;
s.wrap.recv = function (buffer, cb) {
  return originalRecv.call(this, buffer, function () { callbacks++; cb.apply(null, arguments); });
};
s.on('error', function (error) {
  assert(error instanceof Error);
  errors++;
  // The existing receive error path lets applications choose to close.
  s.close();
});
s.on('close', function () { closes++; });
s.on('message', function () { messages++; });
s.resumeRecv();
var initial = addon.state(s.wrap);
assert.strictEqual(initial.active, true);
assert.strictEqual(initial.events, 1);
addon.fail(addon[scenario === 'before' ? 'again' : scenario]);
addon.readable(s.wrap);
assert.strictEqual(addon.state(s.wrap).attempts, 1);
assert.strictEqual(callbacks, 0);
assert.strictEqual(messages, 0);
if (scenario === 'before' || scenario === 'genuine') {
  assert.strictEqual(errors, 1);
  assert.strictEqual(closes, 1);
  assert.strictEqual(s.closed, true);
  console.log(scenario + ': receive error reached JS; application closed socket; no callback');
} else {
  assert.strictEqual(errors, 0);
  assert.strictEqual(closes, 0);
  assert.strictEqual(s.closed, false);
  var state = addon.state(s.wrap);
  assert.strictEqual(state.active, true);
  assert.strictEqual(state.events, 1);
  assert.strictEqual(state.starts, initial.starts);
  assert.strictEqual(state.pollError, 0);
  assert.strictEqual(state.fd, true);
  var sender = require('dgram').createSocket('udp4');
  var timeout = setTimeout(function () { throw new Error('receive timed out'); }, 3000);
  s.on('message', function (buffer, source) {
    assert.strictEqual(buffer.toString(), 'real packet');
    assert.strictEqual(source, '127.0.0.1');
    // The delivered Buffer still owns a copy of the receive data.
    s.buffer.fill(0);
    assert.strictEqual(buffer.toString(), 'real packet');
    s.close(); sender.close(); clearTimeout(timeout);
    setImmediate(function () {
      assert.strictEqual(messages, 1);
      assert.strictEqual(callbacks, 1);
      assert.strictEqual(errors, 0);
      assert.strictEqual(closes, 1);
      console.log(scenario + ': transient ignored; polling unchanged; later UDP packet delivered once');
    });
  });
  sender.send(Buffer.from('real packet'), state.port, '127.0.0.1');
}
