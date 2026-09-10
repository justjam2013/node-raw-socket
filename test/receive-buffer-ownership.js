var assert = require("assert");
var events = require("events");
var raw = require("..");

// Exercise the public JS handler without constructing a privileged raw socket.
var socket = Object.create(raw.Socket.prototype);
events.EventEmitter.call(socket);
socket.closed = false;
socket.buffer = Buffer.alloc(8);
var internalBuffer = socket.buffer;
var packets = [
	{bytes: [1, 1], source: "192.0.2.1"},
	{bytes: [2, 2], source: "2001:db8::2"},
	{bytes: [], source: "192.0.2.3"}
];
var receives = 0;
socket.wrap = {
	recv: function (buffer, callback) {
		assert.strictEqual(buffer, internalBuffer);
		var packet = packets[receives++];
		buffer.fill(0xff);
		Buffer.from(packet.bytes).copy(buffer);
		callback(buffer, packet.bytes.length, packet.source);
	}
};
var messages = [];
socket.on("message", function (buffer, source) {
	messages.push({buffer: buffer, source: source});
});
socket.onRecvReady();
assert.deepStrictEqual(messages[0].buffer, Buffer.from([1, 1]));
socket.onRecvReady();
assert.deepStrictEqual(messages[0].buffer, Buffer.from([1, 1]));
assert.deepStrictEqual(messages[1].buffer, Buffer.from([2, 2]));
socket.onRecvReady();
internalBuffer.fill(0xaa);
assert.strictEqual(messages.length, packets.length);
messages.forEach(function (message, index) {
	assert(Buffer.isBuffer(message.buffer));
	assert.notStrictEqual(message.buffer, internalBuffer);
	assert.strictEqual(message.buffer.length, packets[index].bytes.length);
	assert.deepStrictEqual(message.buffer, Buffer.from(packets[index].bytes));
	assert.strictEqual(message.source, packets[index].source);
});

socket.closed = true;
socket.onRecvReady();
assert.strictEqual(receives, packets.length);
assert.strictEqual(messages.length, packets.length);

socket.closed = false;
var failure = new Error("recv failed");
var errors = [];
socket.on("error", function (error) { errors.push(error); });
socket.wrap.recv = function () { throw failure; };
socket.onRecvReady();
assert.deepStrictEqual(errors, [failure]);
assert.strictEqual(messages.length, packets.length);
console.log("Receive buffer ownership passed");
