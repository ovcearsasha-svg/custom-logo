'use strict';
// Optional source-level integration test against an actual mgu-store checkout.
// node tests/store-catalog.js /path/to/mgu-store
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
if (!process.argv[2]) throw new Error('Supply local mgu-store checkout');
const sources = require(path.resolve(process.argv[2], 'native/mgu-updater/js/sources.js'));
const read = (rel) => Promise.resolve().then(() => {
    try { return fs.readFileSync(path.join(root, rel)); }
    catch (e) { e.missing = e.code === 'ENOENT'; throw e; }
});
sources.repoCatalog(read, null, null, (rel) => Promise.resolve(
    fs.readdirSync(path.join(root, rel)).filter((name) => fs.statSync(path.join(root, rel, name)).isDirectory())
)).then((catalog) => {
    assert.deepStrictEqual(catalog.skipped, []);
    assert.strictEqual(catalog.components.length, 1);
    const app = catalog.components[0];
    assert.strictEqual(app.id, 'custom_logo');
    assert.strictEqual(app.requires['cluster-render'], '0.8.14');
    assert.strictEqual(app.uninstallable, true);
    assert.deepStrictEqual(app.mguHmi, ['ID7']);
    assert.strictEqual(app.script.python, 'tools/build.py');
    console.log('PASS real MGU Store catalog parser: dependency, uninstall, ID7, build');
}).catch((e) => { console.error(e.stack); process.exitCode = 1; });
