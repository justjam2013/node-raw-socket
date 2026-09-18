var assert = require("assert");
var fs = require("fs");
var os = require("os");
var path = require("path");
var child = require("child_process");

// Build a separate addon from a temporary copy of the real native source.
// Inject receive failures on an unprivileged UDP descriptor. Production
// receive, readiness and ownership logic runs unchanged; no public test hook.
var directory = fs.mkdtempSync(path.join(os.tmpdir(), "raw-recv-readiness-test-"));
try {
	var source = fs.readFileSync(path.join(__dirname, "../src/raw.cc"), "utf8");
	assert.strictEqual(source.split("socket (this->family_, SOCK_RAW, this->protocol_)").length, 2);
	assert.strictEqual(source.split("recvfrom (").length, 4);
	if (process.argv[2] !== "before") {
		// Compile the exact production predicate with synthetic platform constants.
		// This exercises Winsock and equal/distinct POSIX constants on every host.
		var condition = source.match(/#ifdef _WIN32\s+if \(error == WSAEWOULDBLOCK\)[\s\S]*?#endif/)[0];
		var header = fs.readFileSync(path.join(__dirname, "../src/raw.h"), "utf8");
		assert(header.includes("#define SOCKET_ERRNO WSAGetLastError()"));
		assert(source.includes("const int error = SOCKET_ERRNO;"));
		var unit = "";
		["winsock", "equal", "distinct"].forEach(function (platform) {
			unit += "#undef _WIN32\n#undef EAGAIN\n#undef EWOULDBLOCK\n";
			unit += platform === "winsock" ? "#define _WIN32\n#define WSAEWOULDBLOCK 10035\n" :
				"#define EAGAIN 11\n#define EWOULDBLOCK " + (platform === "equal" ? 11 : 35) + "\n";
			unit += "static bool " + platform + "(int error) {\n" + condition + "\nreturn true; return false; }\n";
		});
		fs.writeFileSync(path.join(directory, "transient.h"), unit);
	} else fs.writeFileSync(path.join(directory, "transient.h"), "static bool winsock(int e) { return e == 10035; }\nstatic bool equal(int e) { return e == 11; }\nstatic bool distinct(int e) { return e == 11 || e == 35; }");
	fs.writeFileSync(path.join(directory, "raw.cc"), source
		.replace("NODE_MODULE(raw, InitAll)", "")
		.replace("socket (this->family_, SOCK_RAW, this->protocol_)", "CreateUDP (this->family_)")
		.replace(/recvfrom \(/g, "Receive (")
		.replace(/uv_poll_start \(/g, "Restart ("));
	fs.writeFileSync(path.join(directory, "raw.h"), fs.readFileSync(path.join(__dirname, "../src/raw.h"), "utf8").replace("private:", "public:"));
	fs.copyFileSync(path.join(__dirname, "fixtures/recv-readiness.cc"), path.join(directory, "harness.cc"));
	var addon = require("./helpers/build-addon")(directory);
	(process.argv[2] === "before" ? ["before"] : ["again", "wouldblock", "genuine"]).forEach(function (scenario) {
		var run = child.spawnSync(process.execPath,
			[path.join(__dirname, "fixtures/recv-readiness.js"), addon, scenario],
			{ encoding: "utf8", timeout: 10000 });
		assert.strictEqual(run.status, 0, run.stdout + run.stderr);
		process.stdout.write(run.stdout);
	});
} finally {
	fs.rmSync(directory, { recursive: true, force: true });
}
