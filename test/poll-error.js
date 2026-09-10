var assert = require("assert");
var fs = require("fs");
var path = require("path");
var events = require("events");
var raw = require("..");

// HandleIOEvent is not exposed to JS, and constructing SocketWrap opens a raw
// socket. There is no test-only native injection facility. Guard the native
// call site directly, then exercise the existing JS forwarding path below.
// This is source-level coverage, not execution of the native poll callback.
var source = fs.readFileSync(path.join(__dirname, "../src/raw.cc"), "utf8");
var handler = source.match(/void SocketWrap::HandleIOEvent\s*\([^]*?\n}\s/);
assert(handler, "HandleIOEvent must be found");
var branches = handler[0].match(/if \(status\) \{([^]*?)\} else \{([^]*)/);
assert(branches, "poll errors must be separate from readiness handling");
var errorBranch = branches[1];
assert.match(errorBranch, /args\[0\] = Nan::New<String>\("error"\).ToLocalChecked\(\);/);
assert.match(errorBranch, /sprintf\(status_str, "%d", status\);/);
assert.match(errorBranch, /args\[1\] = Nan::Error\(status_str\);/);
assert.match(errorBranch,
	/Nan::Call\(Nan::New<String>\("emit"\).ToLocalChecked\(\), handle\(\), 2, args\);/,
	"emit must receive both the event name and the Error");
assert.doesNotMatch(errorBranch, /recvReady|sendReady/);
assert.match(branches[2], /recvReady/);
assert.match(branches[2], /sendReady/);

// Use the real Socket handlers with an EventEmitter stand-in for the native
// wrapper. No privileged socket, OS poll failure, or production hook is needed.
var socket = Object.create(raw.Socket.prototype);
events.EventEmitter.call(socket);
socket.closed = false;
socket.requests = [];
socket.wrap = new events.EventEmitter();
var order = [];
var closeCalls = 0;
var readiness = 0;
var received;
var failure = new Error(String(-22));
socket.wrap.close = function () {
	closeCalls++;
	order.push("native close");
	this.emit("close");
};
socket.wrap.on("close", socket.onClose.bind(socket));
socket.wrap.on("recvReady", function () { readiness++; });
socket.wrap.on("sendReady", function () { readiness++; });
socket.wrap.on("error", function (error) {
	assert.strictEqual(arguments.length, 1);
	assert(error instanceof Error);
	assert.strictEqual(error.message, "-22");
	assert.strictEqual(error, failure);
	received = error;
	order.push("onError");
	raw.Socket.prototype.onError.call(socket, error);
});
socket.on("error", function (error) {
	assert.strictEqual(arguments.length, 1);
	assert(error instanceof Error);
	assert.strictEqual(error.message, "-22");
	assert.strictEqual(error, received);
	assert.strictEqual(error, failure);
	assert.strictEqual(socket.closed, false);
	assert.strictEqual(closeCalls, 0);
	order.push("public error");
});
socket.on("close", function () {
	assert.strictEqual(socket.closed, true);
	order.push("public close");
});
socket.wrap.emit("error", failure);
assert.strictEqual(readiness, 0);
assert.strictEqual(closeCalls, 1);
assert.deepStrictEqual(order, ["onError", "public error", "native close", "public close"]);
console.log("Poll error source contract and JS forwarding passed");
