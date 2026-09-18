const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const child = require('child_process');

// Required suite: no permission catch, platform skip, or successful empty run.
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'raw-integration-'));
function replaceOnce(source, from, to) {
  assert.strictEqual(source.split(from).length, 2, 'fixture boundary: ' + from);
  return source.replace(from, to);
}
function verify(run) {
  assert.ifError(run.error);
  assert.strictEqual(run.signal, null);
  assert.strictEqual(run.status, 0, run.stdout + run.stderr);
  assert.doesNotMatch(run.stdout + run.stderr, /skip|permission denied|operation not permitted/i);
  assert.match(run.stdout, /^REQUIRED integration PASS: construction polling receive send error close gc$/m);
}
try {
  let source = fs.readFileSync(path.join(__dirname, '../src/raw.cc'), 'utf8');
  source = replaceOnce(source, 'NODE_MODULE(raw, InitAll)', '');
  source = replaceOnce(source, 'socket (this->family_, SOCK_RAW, this->protocol_)', 'CreateUDP (this->family_)');
  // Raw sockets use port zero. Only the fixture supplies the UDP peer port;
  // production Send still validates, calls sendto, checks and returns its result.
  source = replaceOnce(source, 'uv_ip4_addr(*Nan::Utf8String(info[3]), 0, &addr)',
    'uv_ip4_addr(*Nan::Utf8String(info[3]), peerPort, &addr)');
  const probes = [
    ['SocketWrap::~SocketWrap () {', '++destroyed;'],
    ['int SocketWrap::CreateSocket (void) {', '++creates;'],
    ['void SocketWrap::CloseSocket (void) {', '++closes;'],
    ['void SocketWrap::HandleIOEvent (int status, int revents) {',
      'if (!status) { if (revents & UV_READABLE) ++readable; if (revents & UV_WRITABLE) ++writable; if (revents == (UV_READABLE | UV_WRITABLE)) ++combined; }'],
    ['NAN_METHOD(SocketWrap::Recv) {', '++receives;'],
    ['NAN_METHOD(SocketWrap::Send) {', '++sends;'],
    ['delete reinterpret_cast<uv_poll_t *> (handle);', '++deleted;']
  ];
  probes.forEach(([needle, probe]) => {
    source = replaceOnce(source, needle, needle.startsWith('delete') ? probe + ' ' + needle : needle + '\n' + probe);
  });
  fs.writeFileSync(path.join(directory, 'raw.cc'), source);
  fs.writeFileSync(path.join(directory, 'raw.h'), fs.readFileSync(path.join(__dirname, '../src/raw.h'), 'utf8').replace('private:', 'public:'));
  fs.copyFileSync(path.join(__dirname, 'fixtures/integration.cc'), path.join(directory, 'harness.cc'));
  const addon = require('./helpers/build-addon')(directory);
  const args = ['--expose-gc', path.join(__dirname, 'fixtures/integration.js'), addon];
  const run = child.spawnSync(process.execPath, args, {encoding: 'utf8', timeout: 15000});
  verify(run);
  process.stdout.write(run.stdout);
  // Deliberately simulate a child that exits green without doing any work.
  // The same verifier must reject both empty and permission-skip successes.
  for (const stdout of ['', 'permission denied — skipping\n']) {
    const empty = child.spawnSync(process.execPath, ['-e', 'process.stdout.write(' + JSON.stringify(stdout) + ')'], {encoding: 'utf8'});
    assert.throws(() => verify(empty));
  }
  console.log('REQUIRED integration anti-skip proof: empty and permission-skip successes rejected');
} finally {
  fs.rmSync(directory, {recursive: true, force: true});
}
