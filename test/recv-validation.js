var assert = require("assert");
var fs = require("fs");
var os = require("os");
var path = require("path");
var child = require("child_process");
var raw = require("..");

// Compile the actual production length-validation block for both API signatures.
// No large allocation or public test hook is needed, even on a POSIX host.
var source = fs.readFileSync(path.join(__dirname, "../src/raw.cc"), "utf8");
var recv = source.split("NAN_METHOD(SocketWrap::Recv) {")[1]
		.split("NAN_METHOD(SocketWrap::Send)")[0];
var lengthBlock = recv.slice(recv.indexOf("\tconst size_t buffer_length"),
		recv.indexOf("\trc = socket->CreateSocket"));
assert(lengthBlock.includes("Nan::ThrowRangeError"));
assert(recv.indexOf("IsFunction") < recv.indexOf(lengthBlock));
assert(recv.indexOf(lengthBlock) < recv.indexOf("recvfrom ("));
assert.strictEqual((recv.match(/recv_length, 0, \(sockaddr \*\)/g) || []).length, 2);
assert(!recv.includes("(int) node::Buffer::Length"));
[4, 6].forEach(function (version) {
	assert(recv.includes("name_rc = uv_ip" + version + "_name"));
});
assert(/if \(name_rc != 0\)\s*\{\s*Nan::ThrowError\(uv_strerror \(name_rc\)\);\s*return;\s*\}/.test(recv));
assert(recv.indexOf("if (name_rc != 0)") < recv.indexOf("Nan::New(addr)"));
assert(recv.indexOf("if (name_rc != 0)") < recv.indexOf("Nan::Call"));
var dir = fs.mkdtempSync(path.join(os.tmpdir(), "raw-recv-"));
try {
	var unit = '#include <cstddef>\n#include <limits>\n#include <cassert>\n' +
		'#undef _WIN32\n#ifdef RECV_TEST_WINDOWS\n#define _WIN32\n#endif\n' +
		'namespace node { namespace Buffer { size_t Length(size_t n) { return n; } } }\n' +
		'bool rejected; size_t result;\n' +
		'namespace Nan { void ThrowRangeError(const char*) { rejected = true; } }\n' +
		'void check(size_t buffer) { rejected = false;\n' + lengthBlock +
		' result = recv_length; }\n' +
		'int main() { const size_t bound = std::numeric_limits<int>::max();\n' +
		'check(0); assert(!rejected && result == 0);\n' +
		'check(bound - 1); assert(!rejected && result == bound - 1);\n' +
		'check(bound); assert(!rejected && result == bound);\n' +
		'check(bound + 1);\n#ifdef _WIN32\nassert(rejected);\n#else\nassert(!rejected && result == bound + 1);\n#endif\n' +
		'check(std::numeric_limits<size_t>::max());\n#ifdef _WIN32\nassert(rejected);\n#else\nassert(!rejected && result == std::numeric_limits<size_t>::max());\n#endif\n}\n';
	fs.writeFileSync(path.join(dir, "length.cc"), unit);
	[false, true].forEach(function (windows) {
		var executable = path.join(dir, process.platform === "win32" ? "length-test.exe" : "length-test");
		var compiler = process.env.CXX || (process.platform === "win32" ? "cl" : "c++");
		var args = process.platform === "win32"
			? ["/nologo", "/EHsc", "/std:c++14", "/Fe:" + executable]
			: ["-std=c++11", "-o", executable];
		if (windows) args.push(process.platform === "win32" ? "/DRECV_TEST_WINDOWS" : "-DRECV_TEST_WINDOWS");
		args.push(path.join(dir, "length.cc"));
		child.execFileSync(compiler, args, {cwd: dir});
		child.execFileSync(executable);
	});
} finally {
	fs.rmSync(dir, {recursive: true, force: true});
}
console.log("Recv length boundaries (Windows and POSIX) and formatting guards passed");

// ICMP construction also works without elevation on some platforms (macOS).
[4, 6].forEach(function (version) {
	var socket;
	try {
		socket = raw.createSocket({addressFamily: raw.AddressFamily["IPv" + version],
			protocol: version === 4 ? raw.Protocol.ICMP : raw.Protocol.ICMPv6});
	} catch (error) {
		if (/operation not permitted|permission denied|access is denied|address family not supported|protocol not supported/i.test(error.message)) {
			console.log("SKIP IPv" + version + " native Recv arguments: " + error.message);
			return;
		}
		throw error;
	}
	try {
		var buffer = Buffer.alloc(4096);
		var calls = 0;
		function callback() { calls++; }
		assert.throws(function () { socket.wrap.recv(buffer); }, /Two arguments are required/);
		[null, {}, "buffer", 42].forEach(function (value) {
			assert.throws(function () { socket.wrap.recv(value, callback); }, TypeError);
		});
		assert.throws(function () { socket.wrap.recv(buffer, null); }, TypeError);
		assert.strictEqual(calls, 0);
		console.log("IPv" + version + " native Recv argument validation passed");
	} finally {
		socket.close();
	}
});

async function receive(version) {
	var socket;
	try {
		socket = raw.createSocket({addressFamily: raw.AddressFamily["IPv" + version],
			protocol: raw.Protocol.UDP});
	} catch (error) {
		if (/operation not permitted|permission denied|access is denied|address family not supported|protocol not supported/i.test(error.message)) {
			console.log("SKIP IPv" + version + " native Recv: " + error.message);
			return;
		}
		throw error;
	}
	var dgram = require("dgram");
	var sender = dgram.createSocket("udp" + version);
	var target = dgram.createSocket("udp" + version);
	var loopback = version === 4 ? "127.0.0.1" : "::1";
	try {
		var buffer = Buffer.alloc(4096);
		socket.wrap.removeAllListeners("recvReady");
		await new Promise(function (resolve, reject) {
			target.once("error", reject);
			target.bind(0, loopback, resolve);
		});
		var payload = Buffer.from("native-recv-regression-" + process.pid);
		await new Promise(function (resolve, reject) {
			var timer = setTimeout(function () { reject(new Error("IPv" + version + " loopback receive timed out")); }, 3000);
			socket.once("error", function (error) { clearTimeout(timer); reject(error); });
			socket.wrap.on("recvReady", function () {
				try {
					var matched = false;
					var synchronous = true;
					var callbackCalls = 0;
					var result = socket.wrap.recv(buffer, function (received, bytes, address) {
						callbackCalls++;
						assert(synchronous);
						assert.strictEqual(arguments.length, 3);
						assert.strictEqual(received, buffer);
						assert(Number.isInteger(bytes) && bytes > 0 && bytes <= buffer.length);
						if (buffer.subarray(0, bytes).includes(payload)) {
							assert.strictEqual(address, loopback);
							matched = true;
						}
					});
					synchronous = false;
					assert.strictEqual(callbackCalls, 1);
					assert.strictEqual(result, socket.wrap);
					if (matched) { clearTimeout(timer); resolve(); }
				} catch (error) { clearTimeout(timer); reject(error); }
			});
			sender.send(payload, target.address().port, loopback, function (error) {
				if (error) { clearTimeout(timer); reject(error); }
			});
		});
		console.log("IPv" + version + " native Recv loopback formatting, Buffer, byte count, callback timing and return passed");
	} finally {
		socket.close();
		sender.close();
		target.close();
	}
}
receive(4).then(function () { return receive(6); }).catch(function (error) {
	console.error(error);
	process.exitCode = 1;
});
