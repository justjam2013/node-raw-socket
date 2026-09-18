'use strict';

const fs = require('node:fs');

// SemVer 2.0.0: no leading zeroes in numeric core/prerelease identifiers.
// Build metadata is allowed but is not part of the prerelease channel.
const numeric = '(?:0|[1-9][0-9]*)';
const identifier = '(?:' + numeric + '|[0-9]*[A-Za-z-][0-9A-Za-z-]*)';
const semver = new RegExp('^' + numeric + '\\.' + numeric + '\\.' + numeric +
  '(?:-(' + identifier + '(?:\\.' + identifier + ')*))?' +
  '(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$');

function validateRelease(version, releaseTag, githubPrerelease) {
  if (typeof version !== 'string' || !semver.test(version) || /[\r\n]/.test(version)) {
    throw new Error('package.json version must be a valid SemVer 2.0.0 version');
  }
  // Only v-prefixed tags are supported; package.json remains authoritative.
  const expectedTag = 'v' + version;
  if (releaseTag !== expectedTag) {
    throw new Error('Release tag mismatch: expected ' + JSON.stringify(expectedTag) +
      ' exactly (v-prefixed package.json version)');
  }
  const prerelease = semver.exec(version)[1];
  const isPrerelease = prerelease !== undefined;
  if (githubPrerelease !== String(isPrerelease)) {
    throw new Error('GitHub Release prerelease metadata must be ' + isPrerelease +
      ' for this package version');
  }
  if (!isPrerelease) return { distTag: '', publishArgs: ['publish', '--access', 'public'] };

  const distTag = prerelease.split('.')[0];
  // Deliberately conservative npm channel policy: lowercase letter first,
  // then lowercase letters, digits or hyphens. Reject numeric/range-like tags.
  if (!/^[a-z][a-z0-9-]*$/.test(distTag) || distTag === 'latest') {
    throw new Error('Unsafe prerelease npm dist-tag: ' + JSON.stringify(distTag) +
      '; use a lowercase letter-led channel other than latest (e.g. beta or rc)');
  }
  return { distTag, publishArgs: ['publish', '--access', 'public', '--tag', distTag] };
}

if (require.main === module) {
  let version;
  const releaseTag = process.env.RELEASE_TAG;
  try {
    version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
    // JSON quoting keeps untrusted text on one log line and treats it as data.
    console.log('Package version: ' + JSON.stringify(version));
    console.log('Release tag: ' + JSON.stringify(releaseTag));
    const result = validateRelease(version, releaseTag, process.env.RELEASE_PRERELEASE);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, 'dist_tag=' + result.distTag + '\n');
    console.log('Validated publish command: npm ' + result.publishArgs.join(' '));
  } catch (error) {
    console.error('Release validation failed: ' + error.message);
    process.exitCode = 1;
  }
}

module.exports = { validateRelease };
