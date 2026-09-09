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

var shortBuffer = Buffer.alloc(4, 0x5a);
assert.strictEqual(socket.wrap.getOption(raw.SocketLevel.SOL_SOCKET,
		raw.SocketOption.SO_RCVBUF, shortBuffer, 2), 2);
assert.strictEqual(shortBuffer[2], 0x5a);
assert.strictEqual(shortBuffer[3], 0x5a);

socket.close();
