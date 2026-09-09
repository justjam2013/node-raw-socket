var assert = require("assert");
var childProcess = require("child_process");
var raw = require("..");

// A timeout also detects an accidentally resurrected socket keeping the loop alive.
if (!process.env.RAW_CLOSE_CHILD) {
	var result = childProcess.spawnSync(process.execPath, ["--expose-gc", __filename], {
		env: Object.assign({}, process.env, {RAW_CLOSE_CHILD: "1"}),
		timeout: 10000,
		encoding: "utf8"
	});
	process.stdout.write(result.stdout || "");
	process.stderr.write(result.stderr || "");
	assert.ifError(result.error);
	assert.strictEqual(result.status, 0);
} else {
	var sockets = [];
	function create () {
		var socket = raw.createSocket({protocol: raw.Protocol.ICMP});
		sockets.push(socket);
		return socket;
	}
	try {
		var socket = create();
	} catch (error) {
		if (/operation not permitted|permission denied|access is denied/i.test(error.message)) {
			console.log("SKIP close lifecycle: socket construction requires privileges");
			process.exit(0);
		}
		throw error;
	}
	var buffer = Buffer.alloc(8);
	var callbacks = 0;
	function failed (error, bytes) {
		assert(error instanceof Error);
		assert.strictEqual(error.message, "Socket is closed");
		assert.strictEqual(bytes, 0);
		callbacks++;
	}
	function unexpected () { assert.fail("Closed socket callback/readiness must not run"); }
	try {
		var closes = 0;
		socket.on("close", function () {
			closes++;
			socket.close(); // Reentrant close is also idempotent.
		});
		for (var i = 0; i < 3; i++)
			socket.send(buffer, 0, buffer.length, "127.0.0.1", unexpected, failed);
		socket.wrap.close(); // Direct native close must drain the JS queue too.
		assert.strictEqual(socket.close(), socket);
		assert.strictEqual(closes, 1);
		assert.strictEqual(socket.requests.length, 0);
		assert.strictEqual(callbacks, 0); // Queued failures run on nextTick.
		assert.throws(function () {
			socket.wrap.send(buffer, 0, buffer.length, "127.0.0.1", unexpected);
		}, /^Error: Socket is closed$/);
		assert.throws(function () { socket.wrap.recv(buffer, unexpected); }, /^Error: Socket is closed$/);
		assert.throws(function () {
			socket.getOption(raw.SocketLevel.SOL_SOCKET, raw.SocketOption.SO_RCVBUF, buffer, 4);
		}, /^Error: Socket is closed$/);
		assert.throws(function () {
			socket.setOption(raw.SocketLevel.IPPROTO_IP, raw.SocketOption.IP_TTL, 64);
		}, /^Error: Socket is closed$/);
		["pauseRecv", "pauseSend", "resumeRecv", "resumeSend"].forEach(function (method) {
			assert.strictEqual(socket[method](), socket);
		});
		assert.strictEqual(socket.wrap.pause(false, false), socket.wrap);
		socket.wrap.emit("recvReady");
		socket.wrap.emit("sendReady");
		assert.strictEqual(socket.send(buffer, 0, buffer.length, "127.0.0.1", unexpected, failed), socket);
		assert.strictEqual(callbacks, 1); // Matches synchronous JS validation errors.

		var duringSend = create();
		duringSend.send(buffer, 0, buffer.length, "127.0.0.1", function () {
			duringSend.close();
		}, failed);
		duringSend.onSendReady();
		assert.strictEqual(callbacks, 2);

		// Fresh construction and pause/resume still work after another instance closes.
		var fresh = create();
		fresh.pauseRecv().pauseSend().resumeRecv().resumeSend();
		assert.strictEqual(fresh.getOption(raw.SocketLevel.SOL_SOCKET,
			raw.SocketOption.SO_RCVBUF, buffer, 4), 4);
		fresh.close();
	} finally {
		sockets.forEach(function (s) { s.close(); });
	}
	setImmediate(function () {
		assert.strictEqual(callbacks, 5);
		sockets = null;
		socket = null;
		duringSend = null;
		fresh = null;
		global.gc();
		console.log("Close lifecycle passed");
	});
}
