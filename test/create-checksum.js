var assert = require("assert");
var raw = require("..");

var buffer = Buffer.from([0x00, 0x01, 0xf2, 0x03, 0xf4, 0xf5, 0xf6, 0xf7]);

assert.strictEqual(raw.createChecksum(buffer), 0x220d);
assert.strictEqual(raw.createChecksum({buffer: buffer, offset: 2, length: 4}),
		raw.createChecksum(buffer.slice(2, 6)));
assert.throws(function () {
	raw.createChecksum({buffer: Buffer.alloc(100), offset: 90, length: 20});
}, /Length argument/);

var native = require("../build/Release/raw.node");
var offsetBuffer = Buffer.from([0xaa, 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xdd]);

// Expected values complement the folded sum of network-order words.
[
	{offset: 2, length: 4, expected: 0x530f}, // 0x3456 + 0x789a = 0xacf0
	{offset: 1, length: 4, expected: 0x9753}, // 0x1234 + 0x5678 = 0x68ac
	{offset: 0, length: 3, expected: 0x21ed}, // 0xaa12 + 0x3400 = 0xde12
	{offset: 1, length: 5, expected: 0xfd52}, // 0x1234 + 0x5678 + 0x9a00 folds to 0x02ad
	{offset: 1, length: 1, expected: 0xedff}  // Final byte alone: 0x1200
].forEach(function (vector) {
	assert.strictEqual(native.createChecksum(0, offsetBuffer, vector.offset,
			vector.length), vector.expected, "native offset/length " +
			vector.offset + "/" + vector.length);
	assert.strictEqual(raw.createChecksum({buffer: offsetBuffer,
			offset: vector.offset, length: vector.length}), vector.expected);
});

// Repeated carries: 0xffff + 0xffff + 0xff00 folds to 0xff00.
assert.strictEqual(native.createChecksum(0,
		Buffer.from([0xaa, 0xff, 0xff, 0xff, 0xff, 0xff]), 1, 5), 0x00ff);

var continuation = Buffer.from([0xaa, 0x9a, 0xbc, 0xde, 0xf0, 0xbb]);
// ~0x9753 contributes 0x68ac; adding 0x9abc + 0xdef0 folds to 0xe259.
assert.strictEqual(native.createChecksum(0x9753, continuation, 1, 4), 0x1da6);
// An odd final byte contributes 0xde00 instead, folding to 0xe169.
assert.strictEqual(native.createChecksum(0x9753, continuation, 1, 3), 0x1e96);
assert.strictEqual(raw.createChecksum(
		{buffer: offsetBuffer, offset: 1, length: 4},
		{buffer: continuation, offset: 1, length: 4}), 0x1da6);
assert.strictEqual(raw.createChecksum(
		{buffer: offsetBuffer, offset: 1, length: 4},
		{buffer: continuation, offset: 1, length: 3}), 0x1e96);
