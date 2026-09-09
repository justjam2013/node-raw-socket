var assert = require("assert");
var raw = require("..");

var socket;
try {
	socket = raw.createSocket({protocol: raw.Protocol.ICMP});
} catch (error) {
	/* Construction itself opens a socket; Send validation cannot avoid this. */
	if (/operation not permitted|permission denied|access is denied/i.test(error.message)) {
		console.log("SKIP send buffer bounds: socket construction requires privileges");
		process.exit(0);
	}
	throw error;
}

var buffer = Buffer.alloc(4);
var callbackCalls = 0;
function callback () {
	callbackCalls++;
}

try {
	[
		[5, 0],          // Offset past the end, even with zero length.
		[0, 5],          // Length past the end.
		[3, 2],          // Individually small values whose range exceeds the end.
		[0xffffffff, 0], // Maximum Uint32 offset.
		[0, 0xffffffff], // Maximum Uint32 length.
		[3, 0xffffffff]  // Would wrap if offset and length were added as Uint32.
	].forEach(function (range) {
		assert.throws(function () {
			socket.wrap.send(buffer, range[0], range[1], "127.0.0.1", callback);
		}, function (error) {
			return error instanceof RangeError &&
				error.message === "Offset and length exceed the bounds of the buffer";
		}, "native range " + range);
	});
	assert.strictEqual(callbackCalls, 0);

	// Only loopback is used. OS raw-send errors do not imply invalid Buffer bounds.
	[[0, buffer.length], [buffer.length, 0]].forEach(function (range) {
		var calls = 0;
		var result;
		try {
			result = socket.wrap.send(buffer, range[0], range[1], "127.0.0.1",
					function (bytes) {
						calls++;
						assert.strictEqual(bytes, range[1]);
					});
		} catch (error) {
			assert(error instanceof Error);
			assert(!(error instanceof RangeError));
			assert(!(error instanceof TypeError));
			assert(!/bounds of the buffer/.test(error.message));
			assert.strictEqual(calls, 0);
			console.log("Valid native range " + range + " reached OS send: " + error.message);
			return;
		}
		assert.strictEqual(calls, 1);
		assert.strictEqual(result, socket.wrap);
	});
} finally {
	socket.close();
}

console.log("Native send buffer bounds passed");
