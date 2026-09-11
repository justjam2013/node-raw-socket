var assert = require("assert");
var fs = require("fs");
var path = require("path");
var native = require("../build/Release/raw.node");
var raw = require("..");

function constructors(protocol, family) {
	return [function () { return new native.SocketWrap(protocol, family); },
		function () { return raw.createSocket({protocol: protocol, addressFamily: family}); }];
}
[0x80000000, 0xffffffff].forEach(function (protocol) {
	constructors(protocol, raw.AddressFamily.IPv4).forEach(function (construct) {
		assert.throws(construct, {name: "RangeError", message: "Protocol argument is too large for this platform"});
	});
});
[-1, 1.5, "1", "", null, false, NaN, Infinity, 0x100000000].forEach(function (protocol) {
	constructors(protocol, raw.AddressFamily.IPv4).forEach(function (construct) {
		assert.throws(construct, {name: "TypeError", message: "Protocol argument must be an unsigned integer"});
	});
});
[0, 1, 6, 17, 58, 0x7fffffff].forEach(function (protocol) {
	// A later validation error proves acceptance without any privileged operation.
	constructors(protocol, 99).forEach(function (construct) {
		assert.throws(construct, {name: "RangeError", message: "Address family must be IPv4 or IPv6"});
	});
	constructors(protocol, raw.AddressFamily.IPv4).forEach(function (construct) {
		var socket;
		try {
			socket = construct();
		} catch (error) {
			// The OS can reject representable protocol identifiers or deny raw sockets.
			assert.strictEqual(error.constructor, Error);
			assert.match(error.message, /operation not permitted|permission denied|access is denied|invalid argument|protocol not supported|protocol wrong type|not supported|invalid protocol/i);
			console.log("OS rejected protocol " + protocol + " after numeric validation: " + error.message);
		} finally {
			if (socket) socket.close();
		}
	});
});
var source = fs.readFileSync(path.join(__dirname, "../src/raw.cc"), "utf8");
var constructor = source.split("NAN_METHOD(SocketWrap::New) {")[1].split("NAN_METHOD(SocketWrap::Pause)")[0];
var guard = constructor.indexOf('Nan::ThrowRangeError("Protocol argument is too large');
assert(guard > constructor.indexOf("IsUint32"));
assert(guard < constructor.indexOf("new SocketWrap"));
assert(constructor.indexOf("new SocketWrap") < constructor.indexOf("socket->CreateSocket"));
assert(constructor.includes("socket->protocol_ = static_cast<int> (protocol)"));
console.log("Native and public protocol validation passed; all numeric cases ran without privilege skips");
