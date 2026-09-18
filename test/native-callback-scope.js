var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var child = require('child_process');

// Compile production code with only socket creation/registration substituted
// and entry counters added. No scheduling hook goes into the shipped addon.
var directory = fs.mkdtempSync(path.join(os.tmpdir(), 'raw-callback-scope-'));
try {
  var source = fs.readFileSync(path.join(__dirname, '../src/raw.cc'), 'utf8');
  function replaceOnce(from, to) {
    assert.strictEqual(source.split(from).length, 2, from);
    source = source.replace(from, to);
  }
  replaceOnce('NODE_MODULE(raw, InitAll)', '');
  replaceOnce('socket (this->family_, SOCK_RAW, this->protocol_)', 'CreateUDP (this->family_)');
  replaceOnce('static void IoEvent (uv_poll_t* watcher, int status, int revents) {',
    'static void IoEvent (uv_poll_t* watcher, int status, int revents) { ++ioEntries;');
  replaceOnce('void SocketWrap::HandleIOEvent (int status, int revents) {',
    'void SocketWrap::HandleIOEvent (int status, int revents) { ++handlerEntries;');
  replaceOnce('NAN_METHOD(SocketWrap::Recv) {', 'NAN_METHOD(SocketWrap::Recv) { ++recvEntries;');
  fs.writeFileSync(path.join(directory, 'raw.cc'), source);
  fs.writeFileSync(path.join(directory, 'raw.h'), fs.readFileSync(path.join(__dirname, '../src/raw.h'), 'utf8').replace('private:', 'public:'));
  fs.copyFileSync(path.join(__dirname, 'fixtures/callback-scope.cc'), path.join(directory, 'harness.cc'));
  fs.writeFileSync(path.join(directory, 'binding.gyp'), JSON.stringify({ targets: [{
    target_name: 'harness', sources: ['harness.cc'],
    include_dirs: [path.dirname(require.resolve('nan/package.json'))],
    conditions: [['OS=="win"', { libraries: ['ws2_32.lib'] }]]
  }] }));
  var build = child.spawnSync(process.platform === 'win32' ? 'node-gyp.cmd' : 'node-gyp',
    ['rebuild', '--directory', directory], { encoding: 'utf8', shell: process.platform === 'win32' });
  assert.strictEqual(build.status, 0, String(build.error || '') + build.stdout + build.stderr);
  (process.argv[2] === 'reproduce' ? ['reproduce'] : ['regression', 'combined']).forEach(function (scenario) {
    var run = child.spawnSync(process.execPath,
      [path.join(__dirname, 'fixtures/callback-scope.js'), path.join(directory, 'build/Release/harness.node'), scenario],
      { encoding: 'utf8', timeout: 10000 });
    process.stdout.write(run.stdout);
    assert.strictEqual(run.status, 0, String(run.error || '') + run.stdout + run.stderr);
    assert.strictEqual(run.signal, null);
    assert.strictEqual(run.stderr, '');
    assert.match(run.stdout, process.argv[2] === 'reproduce' ?
      /IoEvent=1 HandleIOEvent=1 Recv=1 work=(1|15)\n/ : /IoEvent=1 HandleIOEvent=1 Recv=1 work=15/);
  });
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
