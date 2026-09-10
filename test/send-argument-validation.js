var assert = require("assert");
var raw = require("..");

var buffer = Buffer.alloc(4);
var address = "127.0.0.1";
var invalid = [];
[-1, 1.5, NaN, Infinity, -Infinity, "1", null, undefined].forEach(function (value) {
	invalid.push([value, 0, "Offset must be a non-negative integer"]);
	invalid.push([0, value, "Length must be a non-negative integer"]);
});
[[5, 0], [4, 1], [3, 2], [0, 5], [Number.MAX_VALUE, 0],
		[0, Number.MAX_VALUE], [3, 0xffffffff]].forEach(function (range) {
	invalid.push([range[0], range[1], "Offset and length exceed the bounds of the buffer"]);
});
// Offset validation wins when both byte counts are malformed.
invalid.push([null, null, "Offset must be a non-negative integer"]);

function createWrapper () {
	// Same interception as send-address-validation: no privileged socket or packets.
	var wrapper = Object.create(raw.Socket.prototype);
	wrapper.closed = false;
	wrapper.addressFamily = raw.AddressFamily.IPv4;
	wrapper.requests = [];
	wrapper.sendPaused = true;
	wrapper.wrap = {
		pause: function () { assert.fail("Invalid send must not change readiness"); },
		send: function () { assert.fail("Invalid send must not reach native send"); }
	};
	return wrapper;
}

invalid.forEach(function (range) {
	[false, true].forEach(function (closed) {
		[false, true].forEach(function (withBefore) {
			[false, true].forEach(function (queued) {
				var wrapper = createWrapper();
				wrapper.closed = closed;
				var pending = {sentinel: true};
				if (queued) {
					wrapper.requests.push(pending);
					wrapper.sendPaused = false;
				}
				var requests = wrapper.requests;
				var calls = 0;
				function before () { assert.fail("beforeCallback must not run"); }
				function after (error, bytes) {
					calls++;
					assert(error instanceof Error);
					assert.strictEqual(error.message, closed ? "Socket is closed" : range[2]);
					assert.strictEqual(bytes, 0);
					assert.strictEqual(this, wrapper);
				}
				// Byte counts/bounds must still precede address validation.
				[address, "invalid-address"].forEach(function (destination, index) {
					assert.strictEqual(withBefore
							? wrapper.send(buffer, range[0], range[1], destination, before, after)
							: wrapper.send(buffer, range[0], range[1], destination, after), wrapper);
					assert.strictEqual(calls, index + 1);
					assert.strictEqual(wrapper.requests, requests);
					assert.deepStrictEqual(requests, queued ? [pending] : []);
					assert.strictEqual(wrapper.sendPaused, !queued);
				});
				assert.strictEqual(calls, 2);
				// Remove only the sentinel, then prove later readiness cannot send a rejected call.
				if (queued)
					assert.strictEqual(requests.shift(), pending);
				wrapper.wrap.pause = function () {};
				assert.strictEqual(wrapper.resumeSend(), wrapper);
				wrapper.onSendReady();
				wrapper.onSendReady();
				assert.strictEqual(calls, 2);
				assert.strictEqual(wrapper.requests.length, 0);
				assert.strictEqual(wrapper.closed, closed);
			});
		});
	});
});

[[buffer, 0, 0], [buffer, 4, 0], [buffer, 0, 4], [buffer, 3, 1],
		[buffer, 1.0, 1.0], [Buffer.alloc(0), 0, 0]].forEach(function (range) {
	[false, true].forEach(function (withBefore) {
		var wrapper = createWrapper();
		var order = [];
		wrapper.wrap.pause = function () {};
		wrapper.wrap.send = function (data, offset, length, destination, callback) {
			order.push("native");
			assert.strictEqual(data, range[0]);
			assert.strictEqual(offset, range[1]);
			assert.strictEqual(length, range[2]);
			assert.strictEqual(destination, address);
			callback(length);
		};
		function before () { order.push("before"); }
		function after (error, bytes) {
			order.push("after");
			assert.strictEqual(error, null);
			assert.strictEqual(bytes, range[2]);
			assert.strictEqual(this, wrapper);
		}
		assert.strictEqual(withBefore
				? wrapper.send(range[0], range[1], range[2], address, before, after)
				: wrapper.send(range[0], range[1], range[2], address, after), wrapper);
		assert.strictEqual(wrapper.requests.length, 1);
		assert.deepStrictEqual(order, []);
		wrapper.onSendReady();
		wrapper.onSendReady();
		assert.deepStrictEqual(order, withBefore ? ["before", "native", "after"] : ["native", "after"]);
		assert.strictEqual(wrapper.requests.length, 0);
	});
});
console.log("Public send argument validation passed (no raw-socket privileges required)");
