'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path'), EventEmitter = require('events');
const appDir = path.join(__dirname, '../apps/alx_custom_logo');
const Controller = require('../apps/alx_custom_logo/src/controller').Controller;
const createApp = require('../apps/alx_custom_logo/src/app');
const tick = () => new Promise(resolve => setImmediate(resolve));
let count = 0;
function pass(name) { count++; console.log('PASS ' + name); }
function fakeProbe() {
    const calls = [];
    return { calls: calls, run: (config, log) => {
        let resolve;
        const run = { result: new Promise(r => { resolve = r; }), stopped: false, stop: () => { run.stopped = true; resolve({ ok: false, reason: 'Cancelled' }); }, finish: resolve, log: log, config: config };
        calls.push(run); return run;
    } };
}
class Component extends EventEmitter {
    constructor(id) { super(); this.id = id; this.text = ''; this.enabled = true; }
    getId() { return this.id; }
    setValue(row, key, value) { this.text = value; return Promise.resolve(); }
    setEnabled(v) { this.enabled = v; return Promise.resolve(); }
    updateResources() { return Promise.resolve(); }
}
class SDK extends EventEmitter {
    constructor() {
        super(); this.startReason = 'ENTRY_POINT';
        this.appDescription = JSON.parse(fs.readFileSync(path.join(appDir, 'package/rhmiData/application.json')));
        this.rhmiApplication = new EventEmitter();
        const desc = JSON.parse(fs.readFileSync(path.join(appDir, 'package/rhmiData/uiDescriptions/ID7/uiDescription.json')));
        this.byName = { ST_CustomLogoDiagnostics: new Component(1) };
        Object.keys(desc.containers['1'].components).forEach(id => { const c = desc.containers['1'].components[id]; this.byName[c.name] = new Component(+id); });
        this.rhmiApplication.getByName = name => this.byName[name];
        this.rhmiApplication.mapEntryState = () => Promise.resolve();
        this.rhmiApplication.openEntryState = () => Promise.resolve();
    }
    getEntryPoints() { return [{ getDescription: () => this.appDescription.application.entryPoints[0], init: () => Promise.resolve(), setAvailability: () => Promise.resolve() }]; }
    initialized() { this._initialized = true; this._appStatusService = true; return Promise.resolve(); }
    registerActive() { return Promise.resolve(); }
    registerInactive() { return Promise.resolve(); }
    registerHmiVisible() { return Promise.resolve(); }
    unregisterHmiVisible() { return Promise.resolve(); }
    destroyBundles() { return Promise.resolve(); }
}
async function main() {
    const fake = fakeProbe(), c = new Controller(fake.run);
    c.start(); assert.strictEqual(fake.calls.length, 0);
    c.setVisible(true); assert.strictEqual(fake.calls.length, 0);
    c.start(); c.start(); assert.strictEqual(fake.calls.length, 1);
    assert.strictEqual(fake.calls[0].config.timeoutMs, 5000);
    pass('manual only, hidden guard, duplicate start');
    c.setVisible(false); assert(fake.calls[0].stopped);
    await tick(); assert.strictEqual(c.state, 'cancelled');
    c.setVisible(true); c.start();
    fake.calls[0].log({ event: 'renderer_event', data: { ev: 'status', text: 'STALE' } });
    assert(c.report.indexOf('STALE') < 0);
    fake.calls[1].log({ event: 'renderer_event', data: { ev: 'status', text: 'x'.repeat(20000) } });
    fake.calls[1].finish({ ok: true, reason: 'Diagnostic complete' }); await tick();
    assert.strictEqual(c.state, 'ok'); assert(c.report.length <= 128); assert(c.report.every(row => row.length <= 64));
    c.turn(10000); assert.strictEqual(c.page, c.pages()-1); c.turn(-10000); assert.strictEqual(c.page, 0);
    c.toggleLanguage(); assert.strictEqual(c.view().status, 'Connection checked');
    pass('cancel, stale results ignored, bounded report, pagination, language');
    c.start(); c.close(); await tick(); assert(fake.calls[2].stopped); c.start(); assert.strictEqual(fake.calls.length, 3);
    pass('shutdown permanently prevents checks');
    const f = fakeProbe(), control = new Controller(f.run), errors = [];
    const app = createApp(SDK, { warn: t => errors.push(t), error: t => errors.push(t) }, control, () => {});
    await app.initializePage(); assert.strictEqual(f.calls.length, 0);
    assert(app.byName.cl_start.enabled); assert(!app.byName.cl_stop.enabled);
    app.byName.cl_start.emit('action');
    app.rhmiApplication.emit('userEvent', { eventType: 'ACTION', sourceId: app.byName.cl_start.getId() });
    assert.strictEqual(f.calls.length, 1); assert(!app.byName.cl_start.enabled); assert(app.byName.cl_stop.enabled);
    app.emit('changeVisibility', { visible: false }); await tick(); assert(f.calls[0].stopped);
    await app.shutdown(); assert.strictEqual(errors.length, 0);
    pass('actual UI adapter actions, enable states, dedupe, hide and shutdown');
    const bgf = fakeProbe(), bg = createApp(SDK, { warn: () => {}, error: () => {} }, new Controller(bgf.run), () => {});
    bg.startReason = 'BACKGROUND'; await bg.initializePage();
    bg.byName.cl_start.emit('action'); assert.strictEqual(bgf.calls.length, 0); await bg.shutdown();
    pass('background initialization does not connect');
    const repo = require('../mgu-repo.json'), manifest = require('../apps/alx_custom_logo/mgu-app.json');
    assert.strictEqual(repo.components.length, 1); assert.deepStrictEqual(repo.components[0].mguHmi, ['ID7']);
    assert.strictEqual(repo.components[0].requires, undefined); assert.strictEqual(repo.tools, undefined);
    const pkg = require('../apps/alx_custom_logo/package/package.json');
    assert.strictEqual(pkg.name, manifest.id); assert.strictEqual(pkg.version, manifest.version);
    assert.strictEqual(pkg.oapAppSettings.visibility, 'FOREGROUND');
    const moduleNames = manifest.modules.map(file => './' + path.basename(file));
    manifest.modules.forEach(file => {
        const source = fs.readFileSync(path.join(appDir, file), 'utf8');
        const regex = /require\(['"]([^'"]+)['"]\)/g; let match;
        while ((match = regex.exec(source))) assert(moduleNames.indexOf(match[1]) >= 0 || manifest.sdk.indexOf(match[1]) >= 0 || ['events', 'net'].indexOf(match[1]) >= 0, match[1]);
    });
    const xml = fs.readFileSync(path.join(appDir, 'package/rhmiData/uiDescriptions/ID7/application.xml'), 'utf8');
    const ui = require('../apps/alx_custom_logo/package/rhmiData/uiDescriptions/ID7/uiDescription.json');
    Object.keys(ui.containers['1'].components).forEach(id => assert(xml.indexOf('component id="' + id + '"') >= 0));
    assert(!fs.existsSync(path.join(appDir, 'package/node_modules')));
    pass('Store manifests, link closure, RHMI IDs, no SDK or tool dependencies');
    console.log(count + ' Store tests passed');
}
main().catch(err => { console.error(err); process.exitCode = 1; });
