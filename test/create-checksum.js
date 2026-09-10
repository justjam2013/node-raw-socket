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

// Known Internet checksum constants, independent of the implementation.
[
	[[], 0xffff], [[1], 0xfeff], [[1, 2], 0xfefd],
	[[1, 2, 3], 0xfbfd], [[0xff, 0xff], 0],
	[[0xff, 0xff, 0, 0], 0], [[0, 0, 0, 0], 0xffff]
].forEach(function (vector) {
	assert.strictEqual(raw.createChecksum(Buffer.from(vector[0])), vector[1]);
});

var oddPair = [Buffer.from([1]), Buffer.from([2])];
assert.strictEqual(raw.createChecksum(oddPair), 0xfefd);
assert.strictEqual(raw.createChecksum.apply(null, oddPair), 0xfefd);
var zeroContinuation = [Buffer.from([0xff, 0xff]), Buffer.from([0, 0])];
assert.strictEqual(raw.createChecksum(zeroContinuation), 0);
assert.strictEqual(raw.createChecksum.apply(null, zeroContinuation), 0);
assert.strictEqual(raw.createChecksum(zeroContinuation),
		raw.createChecksum(Buffer.concat(zeroContinuation)));

function checkSegments(segments) {
	var expected = raw.createChecksum(Buffer.concat(segments));
	assert.strictEqual(raw.createChecksum(segments), expected);
	assert.strictEqual(raw.createChecksum.apply(null, segments), expected);
	// Exercise odd offsets, Buffer views, and range objects with sentinels.
	var ranges = segments.map(function (segment) {
		var backing = Buffer.concat([Buffer.from([0xaa, 0xbb]), segment,
				Buffer.from([0xcc])]);
		return {buffer: backing.subarray(1), offset: 1, length: segment.length};
	});
	assert.strictEqual(raw.createChecksum(ranges), expected);
	assert.strictEqual(raw.createChecksum.apply(null, ranges), expected);
}

[
	[1, 1], [1, 2], [2, 1], [3, 1], [1, 3], [3, 3],
	[1, 1, 1], [2, 1, 2], [0, 2], [2, 0], [0, 0], [1, 0, 1]
].forEach(function (lengths) {
	var position = 0;
	checkSegments(lengths.map(function (length) {
		var segment = Buffer.alloc(length);
		for (var i = 0; i < length; i++)
			segment[i] = (++position * 37) & 255;
		return segment;
	}));
});

// Fixed-seed segmentation, covering both total parities and many carries.
var seed = 0x12345678;
function next() {
	seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
	return seed;
}
[1, 2, 3, 31, 32, 255, 256, 4095, 4096].forEach(function (length) {
	var bytes = Buffer.alloc(length);
	for (var i = 0; i < length; i++)
		bytes[i] = next() >>> 24;
	for (var trial = 0; trial < 32; trial++) {
		var segments = [Buffer.alloc(0)];
		for (var offset = 0; offset < length;) {
			var end = Math.min(length, offset + 1 + (next() % 19));
			segments.push(bytes.subarray(offset, end), Buffer.alloc(0));
			offset = end;
		}
		checkSegments(segments);
	}
});
checkSegments(Array.from({length: 4097}, function () { return Buffer.from([255]); }));
assert.strictEqual(raw.createChecksum(), 0);
console.log("Checksum continuation regressions passed");
assert.strictEqual(raw.createChecksum([]), 0xffff);
// Explicit native state preserves both kinds of zero and pending byte 0.
var state = {sum: 0, pending: -1};
native.createChecksum(state, Buffer.from([0]));
assert.deepStrictEqual(state, {sum: 0, pending: 0});
native.createChecksum(state, Buffer.alloc(0));
assert.deepStrictEqual(state, {sum: 0, pending: 0});
native.createChecksum(state, Buffer.from([1]));
assert.deepStrictEqual(state, {sum: 1, pending: -1});
state = {sum: 0, pending: -1};
native.createChecksum(state, Buffer.from([255, 255]));
assert.deepStrictEqual(state, {sum: 65535, pending: -1});
native.createChecksum(state, Buffer.from([0, 0]));
assert.deepStrictEqual(state, {sum: 65535, pending: -1});
