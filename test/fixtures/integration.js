const assert = require('assert');
const dgram = require('dgram');
const {once} = require('events');
const addon = require(process.argv[2]);
require.cache[require.resolve('../../build/Release/raw.node')] = {exports: addon};
const raw = require('../..');
const tick = () => new Promise(resolve => setImmediate(resolve));
const delay = () => new Promise(resolve => setTimeout(resolve, 20));
const watchdog = setTimeout(() => { throw new Error('required integration timed out'); }, 10000);

(async () => {
  assert.throws(() => addon.SocketWrap(0), {name: 'TypeError', message: 'SocketWrap constructor must be called with new'});
  assert.strictEqual(addon.state().creates, 0);
  const omitted = new addon.SocketWrap(0);
  omitted.close(); omitted.close();
  const s = raw.createSocket();
  assert(s.wrap instanceof addon.SocketWrap);
  assert.strictEqual(s.addressFamily, raw.AddressFamily.IPv4);
  let closeEvents = 0;
  s.on('close', () => { closeEvents++; s.close(); });
  s.on('error', error => { throw error; });
  assert.strictEqual(addon.state(s.wrap).initialised, true);
  assert.strictEqual(addon.state(s.wrap).active, true);
  s.pauseRecv().pauseSend();
  assert.strictEqual(addon.state(s.wrap).active, false);
  const peer = dgram.createSocket('udp4');
  peer.bind(0, '127.0.0.1'); await once(peer, 'listening');
  addon.peer(peer.address().port);
  const retained = [];
  s.on('message', (buffer, source) => {
    assert(Buffer.isBuffer(buffer)); assert.strictEqual(source, '127.0.0.1');
    retained.push(buffer);
  });
  const sendToWrapper = bytes => new Promise((resolve, reject) => peer.send(bytes, addon.state(s.wrap).port, '127.0.0.1', error => error ? reject(error) : resolve()));
  await sendToWrapper(Buffer.from([0, 1, 254, 255]));
  await delay();
  assert.strictEqual(retained.length, 0, 'paused receive must not deliver');
  const received = once(s, 'message');
  s.resumeRecv(); await received;
  assert.deepStrictEqual(retained[0], Buffer.from([0, 1, 254, 255]));
  const second = once(s, 'message');
  await sendToWrapper(Buffer.from('second packet')); await second;
  s.buffer.fill(0);
  assert.deepStrictEqual(retained[0], Buffer.from([0, 1, 254, 255]));
  assert.strictEqual(retained[1].toString(), 'second packet');
  assert.notStrictEqual(retained[0].buffer, s.buffer.buffer);

  const order = [];
  const arrived = once(peer, 'message');
  const payload = Buffer.from('!production send!');
  s.pauseSend();
  s.send(payload, 1, payload.length - 2, '127.0.0.1', () => {
    order.push('before'); assert.strictEqual(addon.state().sends, 0);
  }, function (error, bytes) {
    assert.strictEqual(this, s); assert.strictEqual(error, null);
    assert.strictEqual(bytes, payload.length - 2); assert.strictEqual(addon.state().sends, 1);
    order.push('after');
  });
  assert.deepStrictEqual(order, []);
  const [bytes, source] = await arrived;
  assert.deepStrictEqual(bytes, payload.subarray(1, -1));
  assert.strictEqual(source.address, '127.0.0.1');
  assert.deepStrictEqual(order, ['before', 'after']);
  assert.strictEqual(s.requests.length, 0);
  s.pauseRecv().pauseSend();
  assert.strictEqual(addon.state(s.wrap).active, false);
  s.resumeRecv().resumeSend();
  assert.strictEqual(addon.state(s.wrap).active, true);
  s.pauseRecv().pauseSend();

  // Read/write co-occurrence varies by poll backend. Inject the event bits,
  // separately from the real readable and writable callbacks above.
  const both = raw.createSocket({protocol: raw.Protocol.UDP, bufferSize: 32});
  assert.strictEqual(both.buffer.length, 32);
  both.pauseRecv().pauseSend();
  both.wrap.removeAllListeners('recvReady'); both.wrap.removeAllListeners('sendReady');
  const readiness = [];
  both.wrap.on('recvReady', () => readiness.push('read'));
  both.wrap.on('sendReady', () => readiness.push('write'));
  addon.dispatch(both.wrap, 0, 3);
  assert.deepStrictEqual(readiness, ['read', 'write']);
  both.close();

  const failed = raw.createSocket();
  let errors = 0, failureCloses = 0;
  failed.on('error', error => {
    errors++; assert(error instanceof Error);
    assert.strictEqual(error.message, String(addon.badfd));
    assert.strictEqual(failed.closed, false);
  });
  failed.on('close', () => failureCloses++);
  addon.dispatch(failed.wrap, addon.badfd, 3);
  assert.strictEqual(errors, 1); assert.strictEqual(failureCloses, 1);
  assert.strictEqual(failed.closed, true); failed.close();
  let cancelled = 0;
  s.send(Buffer.from('cancelled'), 0, 9, '127.0.0.1', () => assert.fail('closed queue must not send'), (error, bytes) => {
    cancelled++; assert.strictEqual(error.message, 'Socket is closed'); assert.strictEqual(bytes, 0);
  });
  const descriptor = addon.state(s.wrap).descriptor;
  assert.strictEqual(addon.descriptorOpen(descriptor), true);
  s.close(); s.close();
  assert.strictEqual(addon.descriptorOpen(descriptor), false);
  assert.strictEqual(closeEvents, 1);
  const closed = addon.state(s.wrap);
  assert.strictEqual(closed.fd, false); assert.strictEqual(closed.watcher, false);
  assert.strictEqual(closed.initialised, false);
  assert.strictEqual(cancelled, 0, 'queued close failures stay on nextTick');
  assert.strictEqual(s.requests.length, 0);
  peer.close();
  await delay();
  assert.strictEqual(cancelled, 1);
  assert.strictEqual(addon.state().deleted, 4, 'each explicitly closed watcher deleted once');

  // Collect a genuinely unclosed native wrapper with an active watcher.
  // Public wrappers have bound JS listener cycles; no timing claim about those.
  const before = addon.state();
  let abandonedDescriptor, gcCloseEvents = 0;
  function abandon() {
    const wrap = new addon.SocketWrap(0);
    abandonedDescriptor = addon.state(wrap).descriptor;
    wrap.on('close', () => gcCloseEvents++);
  }
  abandon();
  assert.strictEqual(addon.descriptorOpen(abandonedDescriptor), true);
  for (let i = 0; i < 100 && addon.state().destroyed === before.destroyed; i++) {
    global.gc(); await tick();
  }
  assert.strictEqual(addon.state().destroyed, before.destroyed + 1);
  await delay();
  const counts = addon.state();
  assert.strictEqual(addon.descriptorOpen(abandonedDescriptor), false);
  assert.strictEqual(gcCloseEvents, 0, 'destruction does not emit public close');
  assert.strictEqual(counts.deleted, before.deleted + 1);
  assert.strictEqual(counts.closes, before.closes + 1);
  assert(counts.creates >= 5); assert(counts.readable >= 3);
  assert(counts.writable >= 2); assert(counts.combined >= 1);
  assert.strictEqual(counts.receives, 2); assert.strictEqual(counts.sends, 1);
  console.log('Native execution counters: ' + JSON.stringify(counts));
  console.log('REQUIRED integration PASS: construction polling receive send error close gc');
  clearTimeout(watchdog);
})().catch(error => { console.error(error); process.exit(1); });
