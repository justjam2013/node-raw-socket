var assert = require("assert");
var native = require(process.argv[2]);
var expected = "SocketWrap constructor must be called with new";

// Valid arguments exercise the historical abort path; invalid arguments prove
// the invocation check takes precedence over all argument validation.
[[1], [1, 1], [1, 2], [], ["1"], [0xffffffff], [1, 99]].forEach(function (args) {
	assert.throws(function () {
		native.SocketWrap.apply(native, args);
	}, function (error) {
		return error instanceof TypeError && error.message === expected;
	});
});
assert.throws(function () { native.SocketWrap(1); }, {
	name: "TypeError", message: expected
});
setImmediate(function () {
	assert.strictEqual(2 + 2, 4);
	console.log("SocketWrap misuse caught; JavaScript still running");
});
