var assert = require("assert");
var fs = require("fs");
var os = require("os");
var path = require("path");
var child = require("child_process");

// Build a separate addon from a temporary copy of the real native source.
// Intercept poll starts and use an unprivileged UDP descriptor. Production
// restart and ownership logic runs unchanged; no public test hook is added.
var directory = fs.mkdtempSync(path.join(os.tmpdir(), "raw-poll-restart-test-"));
try {
	var source = fs.readFileSync(path.join(__dirname, "../src/raw.cc"), "utf8");
	assert.strictEqual(source.split("uv_poll_start (").length, 3);
	assert.strictEqual(source.split("delete reinterpret_cast<uv_poll_t *> (handle);").length, 2);
	assert.strictEqual(source.split("socket (this->family_, SOCK_RAW, this->protocol_)").length, 2);
	fs.writeFileSync(path.join(directory, "raw.cc"), source
		.replace("NODE_MODULE(raw, InitAll)", "")
		.replace("socket (this->family_, SOCK_RAW, this->protocol_)", "CreateUDP (this->family_)")
		.replace(/uv_poll_start \(/g, "Restart (")
		.replace("delete reinterpret_cast<uv_poll_t *> (handle);", "++deleted; delete reinterpret_cast<uv_poll_t *> (handle);"));
	fs.writeFileSync(path.join(directory, "raw.h"), fs.readFileSync(path.join(__dirname, "../src/raw.h"), "utf8").replace("private:", "public:"));
	fs.copyFileSync(path.join(__dirname, "fixtures/poll-restart.cc"), path.join(directory, "harness.cc"));
	fs.writeFileSync(path.join(directory, "binding.gyp"), JSON.stringify({ targets: [{
		target_name: "harness", sources: ["harness.cc"],
		include_dirs: [path.dirname(require.resolve("nan/package.json"))],
		conditions: [['OS=="win"', { libraries: ["ws2_32.lib"] }]]
	}] }));
	var build = child.spawnSync(process.platform === "win32" ? "node-gyp.cmd" : "node-gyp",
		["rebuild", "--directory", directory], { encoding: "utf8", shell: process.platform === "win32" });
	assert.strictEqual(build.status, 0, String(build.error || "") + build.stdout + build.stderr);
	var addon = path.join(directory, "build/Release/harness.node");
	(process.argv[2] ? [process.argv[2]] : ["fixed", "throw", "auto", "pauseSend", "resumeRecv", "pauseRecv"]).forEach(function (scenario) {
		var run = child.spawnSync(process.execPath,
			["--expose-gc", path.join(__dirname, "fixtures/poll-restart.js"), addon, scenario],
			{ encoding: "utf8", timeout: 10000 });
		assert.strictEqual(run.status, 0, run.stdout + run.stderr);
		process.stdout.write(run.stdout);
	});
} finally {
	fs.rmSync(directory, { recursive: true, force: true });
}
