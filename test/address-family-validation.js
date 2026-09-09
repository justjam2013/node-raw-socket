var assert = require("assert");
var native = require("../build/Release/raw.node");
var raw = require("..");

// These assertions must run regardless of raw socket privileges.
[0, 3, 99, 0xffffffff].forEach(function (family) {
	[function () { return new native.SocketWrap(raw.Protocol.ICMP, family); },
	 function () { return raw.createSocket({protocol: raw.Protocol.ICMP, addressFamily: family}); }
	].forEach(function (construct) {
		assert.throws(construct, function (error) {
			return error instanceof RangeError
					&& error.message === "Address family must be IPv4 or IPv6";
		});
	});
});
[-1, 1.5, "1", null, false, NaN, Infinity].forEach(function (family) {
	[function () { return new native.SocketWrap(raw.Protocol.ICMP, family); },
	 function () { return raw.createSocket({protocol: raw.Protocol.ICMP, addressFamily: family}); }
	].forEach(function (construct) {
		assert.throws(construct, function (error) {
			return error instanceof TypeError
					&& error.message === "Address family argument must be an unsigned integer";
		});
	});
});
assert.throws(function () {
	return new native.SocketWrap(raw.Protocol.ICMP, undefined);
}, TypeError);
console.log("Native and public invalid-family/type cases passed without privilege skips");

function checkConstruction (label, construct, family) {
	var socket;
	try {
		socket = construct();
	} catch (error) {
		if (/operation not permitted|permission denied|access is denied/i.test(error.message)) {
			console.log("SKIP " + label + ": construction requires privileges (" + error.message + ")");
			return;
		}
		throw error;
	}
	try {
		if (family !== undefined)
			assert.strictEqual(socket.addressFamily, family);
		console.log(label + " passed");
	} finally {
		socket.close();
	}
}
checkConstruction("Native omitted family", function () {
	return new native.SocketWrap(raw.Protocol.ICMP);
});
checkConstruction("Public omitted family", function () {
	return raw.createSocket({protocol: raw.Protocol.ICMP});
}, raw.AddressFamily.IPv4);
checkConstruction("Public undefined family", function () {
	return raw.createSocket({protocol: raw.Protocol.ICMP, addressFamily: undefined});
}, raw.AddressFamily.IPv4);
[1, 2].forEach(function (family) {
	var protocol = family === 1 ? raw.Protocol.ICMP : raw.Protocol.ICMPv6;
	checkConstruction("Native family " + family, function () {
		return new native.SocketWrap(protocol, family);
	});
	checkConstruction("Public family " + family, function () {
		return raw.createSocket({protocol: protocol, addressFamily: family});
	}, family);
});
