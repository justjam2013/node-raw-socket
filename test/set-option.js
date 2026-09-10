var assert = require("assert");
var raw = require("..");

// Exercise the public wrapper without constructing a privileged native socket.
var socket = Object.create(raw.Socket.prototype);
var level = raw.SocketLevel.SOL_SOCKET;
var option = raw.SocketOption.SO_RCVBUF;
var buffer = Buffer.alloc(4);

[[level, option, 8192], [level, option, buffer, buffer.length],
		[level, option, buffer, undefined]].forEach(function (args) {
	var calls = 0;
	var failure = null;
	socket.wrap = {
		setOption: function () {
			calls++;
			assert.strictEqual(this, socket.wrap);
			assert.strictEqual(arguments.length, args.length);
			for (var i = 0; i < args.length; i++)
				assert.strictEqual(arguments[i], args[i]);
			if (failure)
				throw failure;
			return this;
		}
	};
	assert.strictEqual(socket.setOption.apply(socket, args), socket);
	assert.strictEqual(calls, 1);

	failure = new TypeError("native validation failure");
	assert.throws(function () {
		socket.setOption.apply(socket, args);
	}, function (error) { return error === failure; });
	assert.strictEqual(calls, 2);
});
console.log("Public setOption chaining and argument forwarding passed");

try {
	socket = raw.createSocket({protocol: raw.Protocol.ICMP});
} catch (error) {
	if (/operation not permitted|permission denied|access is denied/i.test(error.message)) {
		console.log("SKIP native public setOption: construction requires privileges (" + error.message + ")");
		process.exit(0);
	}
	throw error;
}
try {
	assert.strictEqual(socket.setOption(level, option, 8192), socket);
	assert.strictEqual(socket.getOption(level, option, buffer, buffer.length), 4);
	assert.strictEqual(socket.setOption(level, option, buffer, buffer.length), socket);
	console.log("Native public setOption chaining passed for both forms");
} finally {
	socket.close();
}
