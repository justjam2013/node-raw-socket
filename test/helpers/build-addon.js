const assert = require('assert');
const fs = require('fs');
const path = require('path');
const child = require('child_process');

// Shared compilation only: each caller keeps its source substitutions visible.
module.exports = function buildAddon(directory) {
  fs.writeFileSync(path.join(directory, 'binding.gyp'), JSON.stringify({targets: [{
    target_name: 'harness', sources: ['harness.cc'],
    include_dirs: [path.dirname(require.resolve('nan/package.json'))],
    conditions: [['OS=="win"', {libraries: ['ws2_32.lib']}]]
  }]}));
  const build = child.spawnSync(process.platform === 'win32' ? 'node-gyp.cmd' : 'node-gyp',
    ['rebuild', '--directory', directory], {encoding: 'utf8', shell: process.platform === 'win32'});
  assert.ifError(build.error);
  assert.strictEqual(build.status, 0, build.stdout + build.stderr);
  return path.join(directory, 'build/Release/harness.node');
};
