var assert = require("assert");
var child = require("child_process");
var fs = require("fs");
var os = require("os");
var path = require("path");

function checkChild(addon) {
	var run = child.spawnSync(process.execPath,
		[path.join(__dirname, "fixtures/socketwrap-construction.js"), addon],
		{ encoding: "utf8", timeout: 10000 });
	assert.ifError(run.error);
	assert.strictEqual(run.signal, null, run.stderr);
	assert.strictEqual(run.status, 0, run.stdout + run.stderr);
	assert.strictEqual(run.stderr, "");
	assert.match(run.stdout, /SocketWrap misuse caught; JavaScript still running/);
}

// Isolate the real addon first so an abort cannot kill the test runner.
checkChild(path.join(__dirname, "../build/Release/raw.node"));
var native = require("../build/Release/raw.node");
var raw = require("..");
assert.throws(function () { native.SocketWrap(raw.Protocol.ICMP); }, {
	name: "TypeError", message: "SocketWrap constructor must be called with new"
});

// As in the event-dispatch regression, compile a temporary copy of the native
// source. Trap socket creation to prove it is never reached, even on hosts
// where raw sockets would succeed. No test hook enters the production addon.
var directory = fs.mkdtempSync(path.join(os.tmpdir(), "raw-construction-test-"));
try {
	var source = fs.readFileSync(path.join(__dirname, "../src/raw.cc"), "utf8");
	var creation = "int rc = socket->CreateSocket ();";
	assert.strictEqual(source.split(creation).length, 2);
	fs.writeFileSync(path.join(directory, "raw.cc"), source.replace(creation,
		'delete socket; Nan::ThrowError("Socket creation reached"); return; int rc = 0;'));
	fs.copyFileSync(path.join(__dirname, "../src/raw.h"), path.join(directory, "raw.h"));
	fs.writeFileSync(path.join(directory, "binding.gyp"), JSON.stringify({ targets: [{
		target_name: "raw", sources: ["raw.cc"],
		include_dirs: [path.dirname(require.resolve("nan/package.json"))],
		conditions: [['OS=="win"', { libraries: ["ws2_32.lib"] }]]
	}] }));
	var build = child.spawnSync(process.platform === "win32" ? "node-gyp.cmd" : "node-gyp",
		["rebuild", "--directory", directory], { encoding: "utf8", shell: process.platform === "win32" });
	assert.strictEqual(build.status, 0, String(build.error || "") + build.stdout + build.stderr);
	var addon = path.join(directory, "build/Release/raw.node");
	checkChild(addon);
	var instrumented = require(addon);
	// Positive controls prove the trap is active for ordinary construction.
	assert.throws(function () { return new instrumented.SocketWrap(1); }, {
		name: "Error", message: "Socket creation reached"
	});
	assert.throws(function () { return new instrumented.SocketWrap(1, 2); }, {
		name: "Error", message: "Socket creation reached"
	});
} finally {
	fs.rmSync(directory, { recursive: true, force: true });
}
console.log("SocketWrap invocation regression passed without raw-socket privileges");
