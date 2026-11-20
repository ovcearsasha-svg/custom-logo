'use strict';
// Optional integration check using an external, reviewed Store linker checkout.
// The synthetic donor below is test code, never BMW SDK or a distributable app.
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert'), vm = require('vm');
if (!process.argv[2]) throw new Error('Usage: node test/upstream-build.js /path/to/idrive-apps');
const link = require(path.resolve(process.argv[2], 'tools/oap_link.js'));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'custom-logo-link-'));
const app = path.resolve(__dirname, '../apps/alx_custom_logo');
const donor = path.join(dir, 'donor.js');
fs.writeFileSync(donor, '(function(){function r(mods,cache,entries){function get(id){if(cache[id])return cache[id].exports;if(!mods[id])return require(id);var m=cache[id]={exports:{}};mods[id][0](function(n){return get(mods[id][1][n]||n)},m,m.exports);return m.exports;}entries.forEach(get);return get;}return r})()({0:[function(require,module,exports){require("oap-sdk/src/core/OnlineApp.js");require("oap-sdk/src/logging/logging");},{"oap-sdk/src/core/OnlineApp.js":1,"oap-sdk/src/logging/logging":2}],1:[function(require,module,exports){class MockOnlineApp {on(){} start(){global.started=true;return Promise.resolve();}}module.exports=MockOnlineApp;},{}],2:[function(require,module,exports){module.exports={getSDKLogger:function(){return {error:function(){},warn:function(){}};}};},{}]},{},[0]);');
const a = path.join(dir, 'source-a.tgz'), b = path.join(dir, 'source-b.tgz');
link.packSource(app, a); link.packSource(app, b);
assert(fs.readFileSync(a).equals(fs.readFileSync(b)), 'Source package must be reproducible');
const built = path.join(dir, 'mock-only.tgz');
const result = link.build(app, built, { donors: [donor] });
const members = link.untar(fs.readFileSync(built));
const bundle = members.find(m => m.name === 'javascript/app.js');
assert(bundle, 'Linked bundle present');
const scope = { require: require, Buffer: Buffer, process: process, setTimeout: setTimeout, clearTimeout: clearTimeout, global: {} };
vm.runInNewContext(bundle.data.toString(), scope);
assert.strictEqual(scope.global.started, true, 'Bundled app starts with mock SDK');
assert(!members.some(m => /node_modules/.test(m.name)));
console.log('PASS upstream source packing (reproducible), synthetic-donor linking, bundled entry smoke test');
console.log('Mock SDK only; real head-unit build and installation remain untested.');
