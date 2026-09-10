var assert = require("assert");
var raw = require("..");

// Use the real handler, but never construct a privileged native socket.
function exercise (failureAt, completionThrows) {
	var socket = Object.create(raw.Socket.prototype);
	socket.closed = false;
	var setupError = new Error("distinctive send/setup failure");
	var completionError = new Error("distinctive application failure");
	var beforeCalls = 0;
	var sendCalls = 0;
	var afterCalls = 0;
	var secondCalls = 0;
	var shifts = 0;
	var inSend = false;
	var second = {
		buffer: Buffer.alloc(3), offset: 0, length: 3, address: "192.0.2.2",
		afterCallback: function (error, bytes) {
			secondCalls++;
			assert.strictEqual(this, socket);
			assert.strictEqual(error, null);
			assert.strictEqual(bytes, 3);
		}
	};
	var first = {
		buffer: Buffer.alloc(8), offset: 1, length: 4, address: "192.0.2.1",
		beforeCallback: function () {
			beforeCalls++;
			assert.strictEqual(shifts, 1);
			assert.strictEqual(socket.requests[0], second);
			if (failureAt === "before")
				throw setupError;
		},
		afterCallback: function (error, bytes) {
			afterCalls++;
			assert.strictEqual(this, socket);
			assert.strictEqual(shifts, 1);
			assert.strictEqual(socket.requests[0], second);
			assert.strictEqual(error, failureAt ? setupError : null);
			assert.strictEqual(bytes, failureAt ? 0 : 4);
			if (!failureAt)
				assert.strictEqual(inSend, true, "completion stays inline");
			if (completionThrows)
				throw completionError;
		}
	};
	socket.requests = [first, second];
	socket.requests.shift = function () {
		shifts++;
		return Array.prototype.shift.call(this);
	};
	socket.wrap = {
		send: function (buffer, offset, length, address, callback) {
			sendCalls++;
			assert.strictEqual(buffer, first.buffer);
			assert.strictEqual(offset, first.offset);
			assert.strictEqual(length, first.length);
			assert.strictEqual(address, first.address);
			if (failureAt === "send")
				throw setupError;
			inSend = true;
			try {
				callback(length); // Deliberately synchronous: reproduces the bug.
			} finally {
				inSend = false;
			}
		}
	};
	if (completionThrows) {
		assert.throws(function () { socket.onSendReady(); }, function (error) {
			return error === completionError;
		});
	} else {
		socket.onSendReady();
	}
	assert.strictEqual(beforeCalls, 1);
	assert.strictEqual(sendCalls, failureAt === "before" ? 0 : 1);
	assert.strictEqual(afterCalls, 1);
	assert.strictEqual(shifts, 1);
	assert.strictEqual(socket.requests.length, 1);
	assert.strictEqual(socket.requests[0], second);
	assert.strictEqual(secondCalls, 0);

	// The next request survives even when the first completion throws.
	socket.wrap.send = function (buffer, offset, length, address, callback) {
		assert.strictEqual(buffer, second.buffer);
		callback(length);
	};
	socket.onSendReady();
	assert.strictEqual(shifts, 2);
	assert.strictEqual(socket.requests.length, 0);
	assert.strictEqual(secondCalls, 1);
	assert.strictEqual(afterCalls, 1);
}

exercise(null, false);
exercise(null, true);
exercise("before", false);
exercise("send", false);
exercise("before", true);
exercise("send", true);
// Closing during setup still reaches native send and reports its rejection.
var closing = Object.create(raw.Socket.prototype);
closing.closed = false;
var closedError = new Error("Socket is closed");
var closedCalls = 0;
var closedSends = 0;
closing.wrap = {
	close: function () { closing.onClose(); },
	send: function () {
		closedSends++;
		assert.strictEqual(closing.closed, true);
		throw closedError;
	}
};
closing.requests = [{
	beforeCallback: function () { closing.close(); },
	afterCallback: function (error, bytes) {
		closedCalls++;
		assert.strictEqual(error, closedError);
		assert.strictEqual(bytes, 0);
	}
}];
closing.onSendReady();
assert.strictEqual(closedCalls, 1);
assert.strictEqual(closedSends, 1);
assert.strictEqual(closing.requests.length, 0);
closing.onSendReady();
assert.strictEqual(closedCalls, 1);
assert.strictEqual(closedSends, 1);
console.log("Send callback exception boundary passed");
