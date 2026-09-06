var assert = require("assert");
var raw = require("..");

var buffer = Buffer.from([0x00, 0x01, 0xf2, 0x03, 0xf4, 0xf5, 0xf6, 0xf7]);

assert.strictEqual(raw.createChecksum(buffer), 0x220d);
assert.strictEqual(raw.createChecksum({buffer: buffer, offset: 2, length: 4}),
		raw.createChecksum(buffer.slice(2, 6)));
assert.throws(function () {
	raw.createChecksum({buffer: Buffer.alloc(100), offset: 90, length: 20});
}, /Length argument/);
