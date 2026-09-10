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
// Omitted native length covers only the bytes remaining after offset.
var rangeBuffer = Buffer.from([0x01, 0x02, 0x03, 0x04]);
assert.strictEqual(native.createChecksum(0, rangeBuffer), 0xfbf9);
[
	{offset: 2, expected: 0xfcfb}, // 0x0304
	{offset: 1, expected: 0xf9fc}  // 0x0203 + 0x0400
].forEach(function (vector) {
	assert.strictEqual(native.createChecksum(0, rangeBuffer, vector.offset),
			vector.expected);
	assert.strictEqual(native.createChecksum(0, rangeBuffer, vector.offset),
			native.createChecksum(0, rangeBuffer, vector.offset,
					rangeBuffer.length - vector.offset));
	assert.strictEqual(raw.createChecksum({buffer: rangeBuffer,
			offset: vector.offset, length: rangeBuffer.length - vector.offset}),
			vector.expected);
});

// The old omitted-length path consumed the sentinel beyond this Buffer view.
var backing = Buffer.from([0xaa, 0x01, 0x02, 0x03, 0xbb]);
var view = backing.subarray(1, 4);
assert.strictEqual(native.createChecksum(0, view, 1), 0xfdfc); // Only 0x0203.
backing[4] = 0xcc;
assert.strictEqual(native.createChecksum(0, view, 1), 0xfdfc);

// Exact-end offsets and empty Buffers describe valid empty ranges.
[rangeBuffer, Buffer.alloc(0)].forEach(function (emptyRangeBuffer) {
	assert.strictEqual(native.createChecksum(0, emptyRangeBuffer,
			emptyRangeBuffer.length), 0xffff);
	assert.strictEqual(native.createChecksum(0, emptyRangeBuffer,
			emptyRangeBuffer.length, 0), 0xffff);
	assert.strictEqual(raw.createChecksum({buffer: emptyRangeBuffer,
			offset: emptyRangeBuffer.length, length: 0}), 0xffff);
});
assert.strictEqual(native.createChecksum(0, Buffer.alloc(0)), 0xffff);
assert.strictEqual(raw.createChecksum(Buffer.alloc(0)), 0xffff);
assert.strictEqual(native.createChecksum(0, rangeBuffer, 1, 0), 0xffff);

[
	[5], [5, 0], [0xffffffff], [0xffffffff, 0],
	[4, 1], [3, 2], [0, 0xffffffff], [3, 0xffffffff]
].forEach(function (range) {
	assert.throws(function () {
		native.createChecksum.apply(null, [0, rangeBuffer].concat(range));
	}, function (error) {
		return error instanceof RangeError && /^(Offset|Length) argument/.test(error.message);
	}, "native checksum range " + range);
});

// Explicit undefined arguments remain type errors, not omitted arguments.
assert.throws(function () {
	native.createChecksum(0, rangeBuffer, undefined);
}, TypeError);
assert.throws(function () {
	native.createChecksum(0, rangeBuffer, 0, undefined);
}, TypeError);

console.log("Checksum regressions passed");
