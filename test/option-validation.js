var assert = require("assert");
var native = require("../build/Release/raw.node");
var raw = require("..");

var socket;
try {
	socket = new native.SocketWrap(raw.Protocol.ICMP);
} catch (error) {
	if (/operation not permitted|permission denied|access is denied/i.test(error.message)) {
		console.log("SKIP option validation: construction requires privileges (" + error.message + ")");
		process.exit(0);
	}
	throw error;
}

var level = raw.SocketLevel.SOL_SOCKET;
var option = raw.SocketOption.SO_RCVBUF;
var buffer = Buffer.alloc(4);

try {
	["getOption", "setOption"].forEach(function (method) {
		[-1, 1.5, NaN, Infinity, -Infinity, "1", null, 0x100000000].forEach(function (value) {
			[0, 1].forEach(function (index) {
				var args = [level, option, buffer, buffer.length];
				args[index] = value;
				assert.throws(function () {
					socket[method].apply(socket, args);
				}, function (error) {
					return error instanceof TypeError && error.message ===
							(index === 0 ? "Level" : "Option") + " argument must be an unsigned integer";
				}, method + " argument " + index + ": " + String(value));
			});
		});
		console.log(method + ": invalid identifiers rejected with native TypeErrors");

		// Integer-valued Numbers (including 1.0) pass type validation. The OS
		// may reject these identifiers; do not assume platform option numbers.
		[0, 1.0, 0xffffffff].forEach(function (value) {
			[0, 1].forEach(function (index) {
				var args = [level, option, buffer, buffer.length];
				args[index] = value;
				var outcome = "succeeded";
				try {
					socket[method].apply(socket, args);
				} catch (error) {
					// With an open socket and a valid Buffer/length, a plain Error
					// comes from getsockopt/setsockopt, not argument validation.
					assert.strictEqual(error.constructor, Error);
					assert.notStrictEqual(error.message, "Socket is closed");
					outcome = "OS error: " + error.message;
				}
				console.log(method + " argument " + index + " = " + value + ": " + outcome);
			});
		});
	});

	assert.strictEqual(socket.getOption(level, option, buffer, buffer.length), 4);
	// A modest receive buffer size is supported on macOS, Linux and Windows.
	assert.strictEqual(socket.setOption(level, option, 8192), socket);
	assert.strictEqual(socket.getOption(level, option, buffer, buffer.length), 4);
	console.log("Native SO_RCVBUF getOption and setOption succeeded");
} finally {
	socket.close();
}
