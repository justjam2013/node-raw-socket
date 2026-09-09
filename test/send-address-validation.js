var assert = require("assert");
var raw = require("..");

[4, 6].forEach(function (version) {
	var family = raw.AddressFamily["IPv" + version];
	var loopback = version === 4 ? "127.0.0.1" : "::1";
	var mismatch = version === 4 ? "::1" : "127.0.0.1";
	var message = "Invalid IPv" + version + " address";
	var buffer = Buffer.alloc(8);

	// Exercise the JS queue and callbacks even when native construction needs privileges.
	var wrapper = Object.create(raw.Socket.prototype);
	wrapper.addressFamily = family;
	wrapper.requests = [];
	wrapper.sendPaused = true;
	var sends = 0;
	wrapper.wrap = {
		pause: function () {},
		send: function (data, offset, length, address, callback) {
			sends++;
			assert.strictEqual(address, loopback);
			callback(length);
		}
	};
	[mismatch, "not-an-ip-address"].forEach(function (address) {
		[false, true].forEach(function (withBefore) {
			var calls = 0;
			function after (error, bytes) {
				calls++;
				assert(error instanceof Error);
				assert.strictEqual(error.message, message);
				assert.strictEqual(bytes, 0);
				assert.strictEqual(this, wrapper);
			}
			function before () { assert.fail("beforeCallback must not run"); }
			assert.strictEqual(withBefore
					? wrapper.send(buffer, 0, buffer.length, address, before, after)
					: wrapper.send(buffer, 0, buffer.length, address, after), wrapper);
			assert.strictEqual(calls, 1);
			assert.strictEqual(wrapper.requests.length, 0);
			assert.strictEqual(wrapper.sendPaused, true);
			assert.strictEqual(sends, 0);
		});
	});
	var order = [];
	assert.strictEqual(wrapper.send(buffer, 0, buffer.length, loopback,
			function () { order.push("before"); }, function (error, bytes) {
		order.push("after");
		assert.strictEqual(error, null);
		assert.strictEqual(bytes, buffer.length);
		assert.strictEqual(this, wrapper);
	}), wrapper);
	assert.strictEqual(wrapper.requests.length, 1);
	assert.deepStrictEqual(order, []);
	wrapper.onSendReady();
	assert.deepStrictEqual(order, ["before", "after"]);
	assert.strictEqual(sends, 1);
	assert.strictEqual(wrapper.requests.length, 0);
	console.log("IPv" + version + " JS address validation passed");

	var socket;
	try {
		// Omit the IPv4 family to cover the constructor's existing default.
		socket = raw.createSocket(version === 4 ? {protocol: raw.Protocol.ICMP}
				: {addressFamily: family, protocol: raw.Protocol.ICMPv6});
	} catch (error) {
		if (/operation not permitted|permission denied|access is denied/i.test(error.message)) {
			console.log("SKIP IPv" + version + " native address validation: construction requires privileges ("
					+ error.message + ")");
			return;
		}
		throw error;
	}
	console.log("IPv" + version + " socket construction succeeded");
	try {
		assert.strictEqual(socket.addressFamily, family);
		var calls = 0;
		[mismatch, "not-an-ip-address"].forEach(function (address) {
			assert.throws(function () {
				socket.wrap.send(buffer, 0, buffer.length, address, function () { calls++; });
			}, function (error) {
				return error instanceof Error && error.message === message;
			});
			assert.strictEqual(calls, 0);
		});
		// Only loopback. An OS send error is acceptable after successful conversion.
		var sendError;
		var result;
		var sentBytes;
		try {
			result = socket.wrap.send(buffer, 0, buffer.length, loopback, function (bytes) {
				calls++;
				sentBytes = bytes;
			});
		} catch (error) {
			sendError = error;
		}
		if (sendError) {
			assert(sendError instanceof Error);
			assert(!(sendError instanceof TypeError));
			assert(!(sendError instanceof RangeError));
			assert(!/^Invalid IPv[46] address$/.test(sendError.message));
			assert.strictEqual(calls, 0);
			console.log("IPv" + version + " valid loopback reached OS send: " + sendError.message);
		} else {
			assert.strictEqual(calls, 1);
			assert.strictEqual(sentBytes, buffer.length);
			assert.strictEqual(result, socket.wrap);
			console.log("IPv" + version + " valid loopback send succeeded");
		}
	} finally {
		socket.close();
	}
});
console.log("Send address validation passed (see any native privilege skips above)");
