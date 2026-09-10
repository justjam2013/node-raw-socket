var assert = require("assert");
var fs = require("fs");
var os = require("os");
var path = require("path");
var child = require("child_process");

// Build a separate addon from a temporary copy of the real native source.
// Only registration and raw-socket creation are replaced; IoEvent and
// HandleIOEvent run unchanged. No hook is built into the production addon.
var directory = fs.mkdtempSync(path.join(os.tmpdir(), "raw-event-test-"));
try {
	var source = fs.readFileSync(path.join(__dirname, "../src/raw.cc"), "utf8");
	var registration = "NODE_MODULE(raw, InitAll)";
	var creation = "int rc = socket->CreateSocket ();";
	assert.strictEqual(source.split(registration).length, 2);
	assert.strictEqual(source.split(creation).length, 2);
	fs.writeFileSync(path.join(directory, "raw.cc"), source
		.replace(registration, "")
		.replace(creation, "int rc = 0; // Test fixture: no raw socket."));
	fs.copyFileSync(path.join(__dirname, "../src/raw.h"), path.join(directory, "raw.h"));
	fs.copyFileSync(path.join(__dirname, "fixtures/event-dispatch.cc"), path.join(directory, "harness.cc"));
	fs.writeFileSync(path.join(directory, "binding.gyp"), JSON.stringify({ targets: [{
		target_name: "harness", sources: ["harness.cc"],
		include_dirs: [path.dirname(require.resolve("nan/package.json"))],
		conditions: [['OS=="win"', { libraries: ["ws2_32.lib"] }]]
	}] }));
	var build = child.spawnSync(process.platform === "win32" ? "node-gyp.cmd" : "node-gyp",
		["rebuild", "--directory", directory], { encoding: "utf8", shell: process.platform === "win32" });
	assert.strictEqual(build.status, 0, String(build.error || "") + build.stdout + build.stderr);
	var addon = path.join(directory, "build/Release/harness.node");
	["sync", "async"].forEach(function (mode) {
		["none", "recvReady", "sendReady", "error", "close", "closed"].forEach(function (scenario) {
			var run = child.spawnSync(process.execPath,
				[path.join(__dirname, "fixtures/event-dispatch.js"), addon, mode, scenario],
				{ encoding: "utf8", timeout: 10000 });
			assert.strictEqual(run.status, 0, mode + " " + scenario + ": " + run.stdout + run.stderr);
			assert.strictEqual(run.signal, null);
			assert.strictEqual(run.stderr, "");
			assert.match(run.stdout, /native event case passed/);
		});
	});
	// With no uncaughtException handler, retain Node's usual fatal reporting.
	["recvReady", "sendReady", "error"].forEach(function (scenario) {
		var run = child.spawnSync(process.execPath,
			[path.join(__dirname, "fixtures/event-dispatch.js"), addon, "fatal", scenario],
			{ encoding: "utf8", timeout: 10000 });
		assert.strictEqual(run.status, 1, run.stdout + run.stderr);
		assert.strictEqual(run.signal, null);
		assert.match(run.stderr, new RegExp("distinctive " + scenario));
		assert.doesNotMatch(run.stderr, /FATAL ERROR|pending exception/i);
	});
	console.log("Native event exception dispatch passed (15 isolated cases)");
} finally {
	fs.rmSync(directory, { recursive: true, force: true });
}
