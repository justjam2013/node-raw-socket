var assert = require("assert");
var fs = require("fs");
var os = require("os");
var path = require("path");
var child = require("child_process");

// Compile the actual production length-validation block for both API signatures.
// No large allocation or public test hook is needed, even on a POSIX host.
var source = fs.readFileSync(path.join(__dirname, "../src/raw.cc"), "utf8");
var send = source.split("NAN_METHOD(SocketWrap::Send) {")[1]
		.split("NAN_METHOD(SocketWrap::SetOption)")[0];
var lengthBlock = send.slice(send.indexOf("#ifdef _WIN32"),
		send.indexOf("\trc = socket->CreateSocket"));
assert(lengthBlock.includes("Nan::ThrowRangeError"));
assert(send.indexOf("IsFunction") < send.indexOf(lengthBlock));
assert(send.indexOf(lengthBlock) < send.indexOf("sendto ("));
assert.strictEqual((send.match(/sent = sendto \(socket->poll_fd_, data, send_length/g) || []).length, 2);
assert(send.includes("decltype (sendto ("));
assert(send.includes("if (sent == SOCKET_ERROR)"));
assert(send.includes("Nan::New<Number>(sent)"));
var dir = fs.mkdtempSync(path.join(os.tmpdir(), "raw-send-"));
try {
	var unit = '#include <cstdint>\n#include <cstddef>\n#include <limits>\n#include <cassert>\n' +
		'#undef _WIN32\n#ifdef SEND_TEST_WINDOWS\n#define _WIN32\n#endif\n' +
		'bool rejected; size_t result;\n' +
		'namespace Nan { void ThrowRangeError(const char*) { rejected = true; } }\n' +
		'void check(uint32_t length) { rejected = false;\n' + lengthBlock +
		' result = send_length; }\n' +
		'int main() { const size_t bound = std::numeric_limits<int>::max();\n' +
		'check(0); assert(!rejected && result == 0);\n' +
		'check(bound - 1); assert(!rejected && result == bound - 1);\n' +
		'check(bound); assert(!rejected && result == bound);\n' +
		'check(bound + 1);\n#ifdef _WIN32\nassert(rejected);\n#else\nassert(!rejected && result == bound + 1);\n#endif\n' +
		'check(std::numeric_limits<uint32_t>::max());\n#ifdef _WIN32\nassert(rejected);\n#else\nassert(!rejected && result == std::numeric_limits<uint32_t>::max());\n#endif\n}\n';
	fs.writeFileSync(path.join(dir, "length.cc"), unit);
	[false, true].forEach(function (windows) {
		var executable = path.join(dir, process.platform === "win32" ? "length-test.exe" : "length-test");
		var compiler = process.env.CXX || (process.platform === "win32" ? "cl" : "c++");
		var args = process.platform === "win32"
			? ["/nologo", "/EHsc", "/std:c++14", "/Fe:" + executable]
			: ["-std=c++11", "-o", executable];
		if (windows) args.push(process.platform === "win32" ? "/DSEND_TEST_WINDOWS" : "-DSEND_TEST_WINDOWS");
		args.push(path.join(dir, "length.cc"));
		child.execFileSync(compiler, args, {cwd: dir});
		child.execFileSync(executable);
	});
} finally {
	fs.rmSync(dir, {recursive: true, force: true});
}
console.log("Send length boundaries (Windows and POSIX) and result-width guards passed");

