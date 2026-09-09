var assert = require("assert");
var raw = require("..");

var socket;
try {
	socket = raw.createSocket({protocol: raw.Protocol.ICMP});
} catch (error) {
	/* Raw sockets require elevated privileges on some platforms. */
	if (/operation not permitted|permission denied|access is denied/i.test(error.message))
		process.exit(0);
	throw error;
}

var buffer = Buffer.alloc(4);

assert.throws(function () {
	socket.wrap.getOption(raw.SocketLevel.SOL_SOCKET, raw.SocketOption.SO_RCVBUF,
			buffer);
}, /Four arguments/);

assert.throws(function () {
	socket.wrap.getOption(raw.SocketLevel.SOL_SOCKET, raw.SocketOption.SO_RCVBUF,
			buffer, 1.5);
}, /Length argument/);

assert.throws(function () {
	socket.wrap.getOption(raw.SocketLevel.SOL_SOCKET, raw.SocketOption.SO_RCVBUF,
			buffer, -1);
}, /Length argument cannot be negative/);

assert.throws(function () {
	socket.wrap.getOption(raw.SocketLevel.SOL_SOCKET, raw.SocketOption.SO_RCVBUF,
			buffer, 5);
}, /Length argument/);

var optionBuffer = Buffer.alloc(8, 0x5a);
assert.strictEqual(socket.wrap.getOption(raw.SocketLevel.SOL_SOCKET,
		raw.SocketOption.SO_RCVBUF, optionBuffer, 4), 4);
assert.strictEqual(optionBuffer[4], 0x5a);
assert.strictEqual(optionBuffer[5], 0x5a);
assert.strictEqual(optionBuffer[6], 0x5a);
assert.strictEqual(optionBuffer[7], 0x5a);

socket.close();
