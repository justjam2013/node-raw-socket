var assert = require("assert");
var EventEmitter = require("events").EventEmitter;
var addon = require(process.argv[2]);
var mode = process.argv[3];
var scenario = process.argv[4];
var socket = new addon.SocketWrap(1);
socket.emit = EventEmitter.prototype.emit;
var failure = new Error("distinctive " + scenario);
var seen = [];
var exceptions = 0;
var closes = 0;
var throwing = ["recvReady", "sendReady", "error"].includes(scenario);
EventEmitter.prototype.on.call(socket, "close", function () { closes++; });
["recvReady", "sendReady", "error"].forEach(function (name) {
	EventEmitter.prototype.on.call(socket, name, function (error) {
		seen.push(name);
		if (name === "error") {
			assert.strictEqual(arguments.length, 1);
			assert(error instanceof Error);
			assert.strictEqual(error.message, "-22");
			assert.notStrictEqual(error, failure);
		}
		if (name === "recvReady" && scenario === "close") {
			socket.close();
			socket.close();
		}
		if (name === scenario) throw failure;
	});
});
function checkException(error) {
	assert.strictEqual(error, failure);
	assert.strictEqual(error.message, "distinctive " + scenario);
	exceptions++;
}
if (mode === "async") process.on("uncaughtException", checkException);
if (scenario === "closed") socket.close();
var status = scenario === "error" ? -22 : 0;
var flags = scenario === "sendReady" ? 2 : 3; // UV_WRITABLE or READABLE | WRITABLE.
if (mode === "sync" && throwing) {
	assert.throws(function () { addon.dispatch(socket, status, flags, false); }, function (error) {
		checkException(error);
		return true;
	});
} else {
	addon.dispatch(socket, status, flags, mode !== "sync");
}
// The native timer was queued first. This later JS timer also checks that
// dispatch returned to a usable event loop after the handled exception.
setTimeout(function () {
	var expected = scenario === "none" ? ["recvReady", "sendReady"] :
		scenario === "closed" ? [] : scenario === "close" ? ["recvReady"] : [scenario];
	assert.deepStrictEqual(seen, expected);
	assert.strictEqual(exceptions, throwing ? 1 : 0);
	assert.strictEqual(closes, scenario === "close" || scenario === "closed" ? 1 : 0);
	// A fresh native dispatch must still work; closed sockets stay silent.
	EventEmitter.prototype.removeAllListeners.call(socket);
	var later = [];
	["recvReady", "sendReady"].forEach(function (name) {
		EventEmitter.prototype.on.call(socket, name, function () { later.push(name); });
	});
	addon.dispatch(socket, 0, 3, false);
	assert.deepStrictEqual(later, closes ? [] : ["recvReady", "sendReady"]);
	console.log("native event case passed");
}, 25);
