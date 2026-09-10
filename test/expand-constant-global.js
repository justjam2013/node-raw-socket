var assert = require("assert");
var fs = require("fs");
var vm = require("vm");

var modulePath = require.resolve("..");
var cachedModule = require.cache[modulePath];
var hadKey = Object.prototype.hasOwnProperty.call(global, "key");
var oldKey = global.key;
var sentinel = {constantExpansion: true};

try {
	global.key = sentinel;
	delete require.cache[modulePath];
	var raw = require("..");
	assert.strictEqual(global.key, sentinel);

	delete global.key;
	delete require.cache[modulePath];
	var reloaded = require("..");
	assert.strictEqual(Object.prototype.hasOwnProperty.call(global, "key"), false);
	assert.deepStrictEqual(reloaded.AddressFamily, raw.AddressFamily);
	assert.deepStrictEqual(reloaded.Protocol, raw.Protocol);
} finally {
	if (hadKey)
		global.key = oldKey;
	else
		delete global.key;
	if (cachedModule)
		require.cache[modulePath] = cachedModule;
	else
		delete require.cache[modulePath];
}

// The module's other var key currently masks the helper's missing declaration.
// Run the actual helper alone to ensure it owns its loop variable.
var source = fs.readFileSync(modulePath, "utf8");
var helper = source.match(/function _expandConstantObject \(object\) \{[\s\S]*?\n\}/);
assert(helper, "Constant expansion helper must be found");
[true, false].forEach(function (existingKey) {
	var constants = Object.create({7: "Inherited"});
	constants[2] = "Own";
	var context = {constants: constants};
	if (existingKey)
		context.key = sentinel;
	vm.runInNewContext(helper[0] + "\n_expandConstantObject(constants);", context);
	if (existingKey)
		assert.strictEqual(context.key, sentinel);
	else
		assert.strictEqual(Object.prototype.hasOwnProperty.call(context, "key"), false);
	assert.deepStrictEqual(Object.keys(constants), ["2", "Own", "Inherited"]);
	assert.strictEqual(constants.Own, 2);
	assert.strictEqual(constants.Inherited, 7);
	assert.strictEqual(constants[7], "Inherited");
	assert.strictEqual(Object.prototype.hasOwnProperty.call(constants, "7"), false);
});

console.log("Constant expansion global checks passed (no raw-socket privileges required)");
