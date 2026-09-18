'use strict';
const assert = require('assert');
const dgram = require('dgram');
const {once} = require('events');
const addon = require(process.argv[2]);
require.cache[require.resolve('../../build/Release/raw.node')] = {exports: addon};
const raw = require('../..');

// No child watchdog/heartbeat: progress must come from production readiness.
(async () => {
  const peer = dgram.createSocket('udp4');
  peer.bind(0, '127.0.0.1');
  await once(peer, 'listening');
  addon.peer(peer.address().port);
  const s = raw.createSocket();
  s.pauseRecv();
  const payload = Buffer.from('!native success!');
  let request, before = 0, after = 0;
  const order = [];
  let resolveImmediate;
  const immediate = new Promise(resolve => { resolveImmediate = resolve; });
  const packet = once(peer, 'message');
  // Observe the real readiness boundary without replacing Send or completion.
  s.wrap.removeAllListeners('sendReady');
  s.wrap.on('sendReady', () => {
    s.pauseSend();
    order.push('ready');
    process.nextTick(() => order.push('tick'));
    Promise.resolve().then(() => order.push('microtask'));
    setImmediate(() => { order.push('immediate'); resolveImmediate(); });
    s.onSendReady();
    order.push('returned');
    assert.deepStrictEqual(order, ['ready', 'before', 'after', 'returned']);
  });
  s.send(payload, 1, payload.length - 2, '127.0.0.1', function () {
    before++;
    assert.strictEqual(arguments.length, 0);
    assert.strictEqual(this, request);
    assert.notStrictEqual(this, s);
    assert.notStrictEqual(this, globalThis);
    assert.strictEqual(addon.state().sends, 0);
    assert.strictEqual(s.requests.includes(request), false);
    order.push('before');
  }, function (error, bytes) {
    after++;
    assert.strictEqual(arguments.length, 2);
    assert.strictEqual(this, s);
    assert.strictEqual(error, null);
    assert.strictEqual(bytes, payload.length - 2);
    assert.strictEqual(addon.state().sends, 1);
    assert.strictEqual(s.requests.includes(request), false);
    assert.deepStrictEqual(order, ['ready', 'before']);
    order.push('after');
  });
  request = s.requests[0];
  assert(request);
  assert.deepStrictEqual(order, []);
  const [sent] = await packet;
  assert.deepStrictEqual(sent, payload.subarray(1, -1));
  assert.strictEqual(before, 1); assert.strictEqual(after, 1);
  await immediate;
  assert.deepStrictEqual(order, ['ready', 'before', 'after', 'returned', 'tick', 'microtask', 'immediate']);
  // All deliberate task markers have drained before receive scenarios begin.

  const sentinelSend = new Error('native send sentinel');
  let completions = 0, caughtSend;
  s.wrap.removeAllListeners('sendReady');
  s.wrap.on('sendReady', () => {
    s.pauseSend();
    try { s.onSendReady(); } catch (error) { caughtSend = error; }
    assert.strictEqual(caughtSend, sentinelSend);
    assert.strictEqual(completions, 1);
  });
  const exceptionalPacket = once(peer, 'message');
  s.send(payload, 0, payload.length, '127.0.0.1', function (error, bytes) {
    completions++;
    assert.strictEqual(error, null); assert.strictEqual(bytes, payload.length);
    throw sentinelSend;
  });
  assert.deepStrictEqual((await exceptionalPacket)[0], payload);
  assert.strictEqual(caughtSend, sentinelSend); assert.strictEqual(completions, 1);

  // Direct Recv: catch the pending native exception inside real recvReady.
  const direct = raw.createSocket();
  direct.wrap.removeAllListeners('recvReady');
  const sentinelRecv = new Error('native recv sentinel');
  let received = 0;
  const directDone = new Promise(resolve => {
    direct.wrap.on('recvReady', () => {
      direct.pauseRecv();
      let caught, returned = false;
      try {
        direct.wrap.recv(direct.buffer, function (buffer, bytes, source) {
          received++;
          assert.strictEqual(arguments.length, 3);
          assert.strictEqual(buffer, direct.buffer);
          assert.strictEqual(bytes, payload.length);
          assert.deepStrictEqual(buffer.subarray(0, bytes), payload);
          assert.strictEqual(source, '127.0.0.1');
          assert.strictEqual(returned, false);
          throw sentinelRecv;
        });
        returned = true;
      } catch (error) { caught = error; }
      assert.strictEqual(caught, sentinelRecv);
      assert.strictEqual(returned, false);
      assert.strictEqual(received, 1);
      direct.close(); resolve();
    });
  });
  peer.send(payload, addon.state(direct.wrap).port, '127.0.0.1');
  await directDone;

  const message = raw.createSocket();
  const sentinelMessage = new Error('message sentinel');
  let messages = 0, errors = 0, closes = 0;
  message.on('close', () => closes++);
  let resolveSecond;
  const second = new Promise(resolve => { resolveSecond = resolve; });
  message.on('message', (buffer, source) => {
    messages++;
    assert.deepStrictEqual(buffer, payload);
    assert.strictEqual(source, '127.0.0.1');
    if (messages === 1) throw sentinelMessage;
    assert.strictEqual(messages, 2);
    resolveSecond();
  });
  const forwarded = new Promise(resolve => {
    message.on('error', error => {
      errors++; assert.strictEqual(error, sentinelMessage);
      assert.strictEqual(message.closed, false);
      assert.strictEqual(closes, 0);
      resolve();
    });
  });
  peer.send(payload, addon.state(message.wrap).port, '127.0.0.1');
  await forwarded;
  assert.strictEqual(message.closed, false); assert.strictEqual(closes, 0);
  peer.send(payload, addon.state(message.wrap).port, '127.0.0.1');
  await second;
  assert.strictEqual(errors, 1); assert.strictEqual(messages, 2);
  assert.strictEqual(closes, 0); assert.strictEqual(message.closed, false);
  message.close();

  const poll = raw.createSocket();
  let pollErrors = 0, pollCloses = 0;
  poll.on('error', error => { pollErrors++; assert.strictEqual(error.message, String(addon.badfd)); });
  poll.on('close', () => pollCloses++);
  addon.dispatch(poll.wrap, addon.badfd, 1);
  assert.strictEqual(pollErrors, 1); assert.strictEqual(pollCloses, 1);
  assert.strictEqual(poll.closed, true);

  let cancelledBefore = 0, cancelledAfter = 0;
  const cancelled = new Promise(resolve => {
    s.send(payload, 0, payload.length, '127.0.0.1', () => cancelledBefore++, function (error, bytes) {
      cancelledAfter++;
      assert.strictEqual(this, s); assert.strictEqual(arguments.length, 2);
      assert.strictEqual(error.message, 'Socket is closed'); assert.strictEqual(bytes, 0);
      resolve();
    });
  });
  s.close();
  assert.strictEqual(cancelledBefore, 0); assert.strictEqual(cancelledAfter, 0);
  await cancelled;
  assert.strictEqual(cancelledBefore, 0); assert.strictEqual(cancelledAfter, 1);
  assert.strictEqual(received, 1); assert.strictEqual(completions, 1);
  peer.close();
  const counts = addon.state();
  assert.strictEqual(counts.sends, 2); assert.strictEqual(counts.receives, 3);
  assert(counts.readable >= 3); assert(counts.writable >= 2);
  console.log('Callback native counters: ' + JSON.stringify(counts));
  console.log('REQUIRED callback contract PASS');
})().catch(error => { console.error(error); process.exit(1); });
