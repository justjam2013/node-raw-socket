'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { validateRelease } = require('../.github/scripts/validate-release.cjs');

test('stable releases use the default npm dist-tag', () => {
  assert.deepEqual(validateRelease('1.2.3', 'v1.2.3', 'false'), {
    distTag: '', publishArgs: ['publish', '--access', 'public']
  });
});

for (const channel of ['beta', 'rc', 'alpha-2']) {
  test('prerelease explicitly selects ' + channel, () => {
    const version = '1.2.3-' + channel + '.1';
    assert.deepEqual(validateRelease(version, 'v' + version, 'true'), {
      distTag: channel, publishArgs: ['publish', '--access', 'public', '--tag', channel]
    });
  });
}

test('build metadata does not select a prerelease channel', () => {
  assert.equal(validateRelease('1.2.3+build.1', 'v1.2.3+build.1', 'false').distTag, '');
  assert.equal(validateRelease('1.2.3-beta.1+build.2', 'v1.2.3-beta.1+build.2', 'true').distTag, 'beta');
});

for (const tag of ['v1.2.4', '1.2.3', 'foo-1.2.3', 'v1.2.3-test', 'v1.2.3\n', 'v1.2.3$(touch injected)']) {
  test('rejects non-exact release tag ' + JSON.stringify(tag), () => {
    assert.throws(() => validateRelease('1.2.3', tag, 'false'), /Release tag mismatch/);
  });
}

for (const version of [undefined, 123, '', '1.2', '01.2.3', '1.02.3', '1.2.03',
  '1.2.3-01', '1.2.3-beta.01', '1.2.3-', '1.2.3+', '1.2.3-beta..1', '1.2.3\n', '1.2.3;echo bad']) {
  test('rejects malformed package version ' + JSON.stringify(version), () => {
    assert.throws(() => validateRelease(version, 'v' + version, 'false'), /valid SemVer/);
  });
}

for (const [version, metadata] of [['1.2.3', 'true'], ['1.2.3-beta.1', 'false'],
  ['1.2.3', undefined], ['1.2.3', 'False']]) {
  test('rejects inconsistent metadata ' + version + ' / ' + metadata, () => {
    assert.throws(() => validateRelease(version, 'v' + version, metadata), /prerelease metadata/);
  });
}

for (const channel of ['latest', 'Latest', '1', '-beta', 'BETA']) {
  test('rejects forbidden channel ' + channel, () => {
    const version = '1.2.3-' + channel + '.1';
    assert.throws(() => validateRelease(version, 'v' + version, 'true'), /Unsafe prerelease npm dist-tag/);
  });
}

test('CLI and workflow publish block fail closed; malicious tags are only data', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'release-validation-'));
  try {
    const output = path.join(directory, 'output');
    const calls = path.join(directory, 'npm-calls');
    const script = path.resolve(__dirname, '../.github/scripts/validate-release.cjs');
    const workflow = fs.readFileSync(path.resolve(__dirname, '../.github/workflows/publish.yml'), 'utf8');
    const publishBlock = workflow.split('        run: |\n')[1]
      .split('\n').map(line => line.replace(/^          /, '')).join('\n');
    assert.match(publishBlock, /npm publish --access public --tag "\$NPM_DIST_TAG"/);
    // This mock records argv only: no test can publish or contact npm.
    fs.writeFileSync(path.join(directory, 'npm'), '#!/bin/sh\nprintf "%s\\n" "$@" > "$NPM_CALLS"\n', { mode: 0o755 });
    const cases = [
      ['1.2.3', 'v1.2.3', 'false', ['publish', '--access', 'public']],
      ['1.2.3-beta.1', 'v1.2.3-beta.1', 'true', ['publish', '--access', 'public', '--tag', 'beta']],
      ['1.2.3', 'v1.2.4', 'false', null],
      ['1.2.3', 'v1.2.3', 'true', null],
      ['1.2.3-beta.1', 'v1.2.3-beta.1', 'false', null],
      ['1.2.3', 'v1.2.3$(touch injected); echo unexpected', 'false', null],
      ['1.2.3-latest.1', 'v1.2.3-latest.1', 'true', null],
      ['1.02.3', 'v1.02.3', 'false', null]
    ];
    for (const [version, tag, metadata, expectedArgs] of cases) {
      fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ version }));
      fs.writeFileSync(output, '');
      fs.rmSync(calls, { force: true });
      const env = { ...process.env, RELEASE_TAG: tag, RELEASE_PRERELEASE: metadata,
        GITHUB_OUTPUT: output, PATH: directory + path.delimiter + process.env.PATH, NPM_CALLS: calls };
      const validation = spawnSync(process.execPath, [script], { cwd: directory, env, encoding: 'utf8' });
      assert.match(validation.stdout, /Package version:/);
      assert.match(validation.stdout, /Release tag:/);
      if (expectedArgs) {
        assert.equal(validation.status, 0, validation.stderr);
        env.NPM_DIST_TAG = fs.readFileSync(output, 'utf8').trim().slice('dist_tag='.length);
        const publish = spawnSync('/bin/sh', ['-eu', '-c', publishBlock], { cwd: directory, env, encoding: 'utf8' });
        assert.equal(publish.status, 0, publish.stderr);
        assert.deepEqual(fs.readFileSync(calls, 'utf8').trim().split('\n'), expectedArgs);
      } else {
        assert.equal(validation.status, 1);
        assert.match(validation.stderr, /Release validation failed:/);
        assert.equal(fs.readFileSync(output, 'utf8'), '');
        assert.equal(fs.existsSync(calls), false);
      }
      assert.equal(fs.existsSync(path.join(directory, 'injected')), false);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
