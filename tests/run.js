'use strict';
const assert = require('assert');
const net = require('net');
const os = require('os');
const path = require('path');
const EventEmitter = require('events');
const { createLogo, validate } = require('../apps/custom_logo/logo');
const { run } = require('../apps/custom_logo/lifecycle');
const config = require('../apps/custom_logo/logo-config');
const image = require('../apps/custom_logo/logo-data');
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate) {
    const end = Date.now() + 4000;
    while (!predicate()) {
        if (Date.now() > end) throw new Error('Timed out');
        await delay(10);
    }
}
function json(obj) {
    const body = Buffer.from(JSON.stringify(obj));
    const result = Buffer.alloc(5 + body.length);
    result.writeUInt32LE(body.length + 1, 0); result[4] = 0x4a; body.copy(result, 5);
    return result;
}
async function mock(existingPath) {
    const socketPath = existingPath || (process.platform === 'win32' ? '\\\\.\\pipe\\custom-logo-test-' + process.pid + '-' + Math.random()
        : path.join(os.tmpdir(), 'custom-logo-' + process.pid + '-' + Math.random() + '.sock'));
    const clients = [];
    const server = net.createServer((socket) => {
        const client = { socket, messages: [], layers: new Map(), closed: false };
        clients.push(client);
        let input = Buffer.alloc(0);
        socket.on('error', () => {});
        socket.on('close', () => { client.closed = true; client.layers.clear(); });
        socket.on('data', (data) => {
            input = Buffer.concat([input, data]);
            while (input.length >= 5 && input.length >= input.readUInt32LE(0) + 4) {
                const length = input.readUInt32LE(0);
                const type = input[4];
                const body = input.slice(5, 4 + length);
                input = input.slice(4 + length);
                const m = type === 0x4a ? JSON.parse(body.toString()) : { frame: body };
                client.messages.push(m);
                if (m.op === 'hello') {
                    const hello = json({ ev: 'hello', proto: 1, backend: 'idrive7', targets: 'map panel hud' });
                    socket.write(hello.slice(0, 3));
                    setTimeout(() => { if (!socket.destroyed) socket.write(hello.slice(3)); }, 5);
                }
                if (m.op === 'layer') client.layers.set(m.ref, m);
                if (m.op === 'drop') client.layers.delete(m.ref);
            }
        });
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(socketPath, resolve); });
    return { socketPath, clients, close: async function () {
        clients.forEach((c) => c.socket.destroy());
        await new Promise((resolve) => server.close(resolve));
    } };
}
const frames = (c) => c.messages.filter((m) => m.frame);

test('one image upload, straight alpha, no traffic while idle, exact official framing', async () => {
    const server = await mock();
    const logo = createLogo(config, image, { socketPath: server.socketPath });
    try {
        logo.start(); logo.start();
        await until(() => server.clients.length && frames(server.clients[0]).length === 1);
        const c = server.clients[0];
        assert.strictEqual(server.clients.length, 1);
        const layer = c.messages.find((m) => m.op === 'layer');
        assert.strictEqual(layer.target, 'panel');
        assert.strictEqual(layer.kind, 'image');
        assert.strictEqual(layer.exclusive, 0);
        assert.strictEqual(layer.contend, 0);
        assert.strictEqual(layer.preload, 0);
        assert.strictEqual(layer.x, config.x);
        assert.strictEqual(layer.w, config.width);
        assert.strictEqual(layer.others_fps, undefined);
        const body = frames(c)[0].frame;
        assert.strictEqual(body.readUInt32LE(0), layer.ref);
        assert.strictEqual(body.readUInt16LE(12), 0);
        assert.deepStrictEqual(body.slice(14), image.rgba);
        const count = c.messages.length;
        await delay(1100);
        assert.strictEqual(c.messages.length, count);
        // Arbitration changes must not cause pixel resends or slot claims.
        c.socket.write(json({ ev: 'layer', ref: layer.ref, state: 'waiting', reason: 'locked' }));
        c.socket.write(json({ ev: 'layer', ref: layer.ref, state: 'shown' }));
        await delay(50);
        assert.strictEqual(c.messages.length, count);
    } finally { logo.stop(); await server.close(); }
});

test('reconnect restores exactly one layer and one frame; stop prevents reconnect', async () => {
    const server = await mock();
    const logo = createLogo(config, image, { socketPath: server.socketPath });
    try {
        logo.start();
        await until(() => server.clients.length && frames(server.clients[0]).length === 1);
        server.clients[0].socket.destroy();
        await until(() => server.clients.length === 2 && frames(server.clients[1]).length === 1);
        assert.strictEqual(server.clients[0].layers.size, 0);
        const c = server.clients[1];
        assert.strictEqual(c.messages.filter((m) => m.op === 'layer').length, 1);
        assert.deepStrictEqual(frames(c)[0].frame.slice(14), image.rgba);
        await delay(100);
        assert.strictEqual(frames(c).length, 1);
        logo.stop(); logo.stop();
        await until(() => c.closed);
        assert.strictEqual(c.layers.size, 0);
        await delay(400);
        assert.strictEqual(server.clients.length, 2);
    } finally { logo.stop(); await server.close(); }
});

test('other client survives logo removal (Waze ownership contract, not visual verification)', async () => {
    const server = await mock();
    const { ClusterRender } = require('../apps/custom_logo/cluster_render_client');
    const waze = new ClusterRender('waze-contract-fixture', server.socketPath);
    const ref = waze.image({ target: 'map', w: 2, h: 2, iw: 2, ih: 2 });
    waze.pixels(ref, null, Buffer.alloc(16));
    const logo = createLogo(config, image, { socketPath: server.socketPath });
    try {
        waze.connect();
        await until(() => server.clients.length && frames(server.clients[0]).length === 1);
        logo.start();
        await until(() => server.clients.length === 2 && frames(server.clients[1]).length === 1);
        logo.stop();
        await until(() => server.clients[1].closed);
        assert.strictEqual(server.clients[0].closed, false);
        assert.strictEqual(server.clients[0].layers.size, 1);
        assert.strictEqual(server.clients[0].messages.length, 3);
    } finally { logo.stop(); waze.close(); await server.close(); }
});

test('refusal closes own layer and does not retry', async () => {
    const server = await mock();
    const logo = createLogo(config, image, { socketPath: server.socketPath });
    try {
        logo.start();
        await until(() => server.clients.length && frames(server.clients[0]).length);
        server.clients[0].socket.write(json({ ev: 'error', op: 'layer', ref: 1, reason: 'unknown target' }));
        await until(() => server.clients[0].closed);
        await delay(400);
        assert.strictEqual(server.clients.length, 1);
    } finally { logo.stop(); await server.close(); }
});

test('disabled config never connects; invalid rectangle rejected', async () => {
    class Client extends EventEmitter {
        connect() { throw new Error('must not connect'); }
        close() {}
    }
    const logo = createLogo(Object.assign({}, config, { enabled: false }), image, { Client });
    logo.start(); logo.stop();
    [-513, NaN, 0.5, '30', 1920].forEach((x) => {
        assert.throws(() => validate(Object.assign({}, config, { x }), image));
    });
});

class RecordingClient extends EventEmitter {
    constructor() { super(); this.calls = []; RecordingClient.last = this; }
    image(o) { this.calls.push(['image', o]); return 1; }
    pixels() { this.calls.push(['pixels']); return true; }
    set(ref, o) { this.calls.push(['set', o]); }
    drop() { this.calls.push(['drop']); }
    close() { this.calls.push(['close']); }
    connect() { this.calls.push(['connect']); }
}
const { controller } = require('../apps/custom_logo/controller');
function memoryStorage() {
    return { writes: [], load: (c) => Object.assign({}, c), save: function (c) { this.writes.push(Object.assign({}, c)); } };
}
test('menu moves and scales via set only; reset, step, save and off/on work', async () => {
    const storage = memoryStorage();
    const c = controller(config, image, storage, { Client: RecordingClient });
    c.start();
    const client = RecordingClient.last;
    c.action('LEFT'); c.action('UP');
    assert.strictEqual(c.snapshot().config.x, config.x - 5);
    assert.strictEqual(c.snapshot().config.y, config.y - 5);
    c.action('LARGER');
    assert.strictEqual(c.snapshot().config.width, config.width + 5);
    assert.strictEqual(c.snapshot().config.height, config.height + 5);
    assert.strictEqual(client.calls.filter((v) => v[0] === 'pixels').length, 1);
    assert.strictEqual(client.calls.filter((v) => v[0] === 'set').length, 3);
    assert.strictEqual(storage.writes.length, 0);
    assert.strictEqual(c.snapshot().dirty, true);
    c.action('SAVE');
    assert.strictEqual(storage.writes.length, 1);
    assert.strictEqual(c.snapshot().dirty, false);
    c.action('STEP'); assert.strictEqual(c.snapshot().step, 10);
    c.action('RESET'); assert.deepStrictEqual(c.snapshot().config, config);
    c.action('TOGGLE'); assert.strictEqual(c.snapshot().config.enabled, false);
    c.action('TOGGLE'); assert.strictEqual(c.snapshot().config.enabled, true);
    assert.strictEqual(client.calls.filter((v) => v[0] === 'pixels').length, 2);
    c.stop();
    const last = c.snapshot(); c.action('RIGHT'); assert.deepStrictEqual(c.snapshot(), last);
});

test('menu bounds, failed save and persisted settings recovery', async () => {
    const fs = require('fs');
    const storage = memoryStorage();
    storage.save = () => { throw new Error('read only'); };
    const c = controller(config, image, storage, { Client: RecordingClient });
    for (let i = 0; i < 300; i++) c.action('SMALLER');
    assert.strictEqual(c.snapshot().config.width, 32);
    for (let i = 0; i < 300; i++) c.action('UP');
    assert.strictEqual(c.snapshot().config.y, -31);
    c.action('SAVE'); assert.strictEqual(c.snapshot().note, 'Save failed');
    c.stop();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'custom-logo-settings-'));
    const file = path.join(dir, 'settings.json');
    const { store } = require('../apps/custom_logo/settings');
    const s = store(file, image, () => {});
    try {
        assert.deepStrictEqual(s.load(config), config);
        const moved = Object.assign({}, config, { x: config.x + 1 });
        s.save(moved); assert.deepStrictEqual(s.load(config), moved);
        assert.strictEqual(fs.existsSync(file + '.tmp'), false);
        fs.writeFileSync(file, '{broken'); assert.deepStrictEqual(s.load(config), config);
        fs.writeFileSync(file, JSON.stringify(Object.assign({}, config, { height: 32 })));
        assert.deepStrictEqual(s.load(config), config);
    } finally { if (fs.existsSync(file)) fs.unlinkSync(file); fs.rmdirSync(dir); }
});

test('native menu uses real RHMI method shapes and shows current coordinates', async () => {
    const { attach, ACTIONS } = require('../apps/custom_logo/menu');
    const app = new EventEmitter(), rhmi = new EventEmitter();
    const components = {};
    ['MAIN', 'POSITION', 'SIZE', 'STATUS'].concat(ACTIONS).forEach((name) => {
        const comp = new EventEmitter();
        comp.setValue = (row, cell, value, type) => {
            assert.strictEqual(row, 0); assert.strictEqual(cell, 'Text'); assert.strictEqual(type, 'Text');
            comp.text = value; return Promise.resolve();
        };
        comp.updateResources = () => Promise.resolve();
        components[name] = comp;
    });
    rhmi.getByName = (name) => components[name];
    let opened = 0, visible = 0;
    rhmi.mapEntryState = (uuid, state) => { assert.strictEqual(uuid, 'entry'); assert.strictEqual(state, components.MAIN); return Promise.resolve(); };
    rhmi.openEntryState = () => { opened++; return Promise.resolve(); };
    app.rhmiApplication = rhmi;
    app.registerHmiVisible = () => { visible++; return Promise.resolve(); };
    app.unregisterHmiVisible = () => Promise.resolve();
    app.startReason = 'ENTRY_POINT';
    app.getLastExecutedEntryPointUuid = () => 'entry';
    const c = controller(config, image, memoryStorage(), { Client: RecordingClient });
    const errors = [];
    await attach(app, c, ['entry'], (e) => errors.push(e));
    await delay(20);
    assert.strictEqual(opened, 1);
    components.RIGHT.emit('action'); await delay(20);
    assert.strictEqual(components.POSITION.text, 'X: ' + (config.x + 5) + '   Y: ' + config.y);
    assert.ok(components.STATUS.text.indexOf('*') >= 0);
    components.SAVE.emit('action'); await delay(20);
    assert.ok(components.STATUS.text.indexOf('Saved') >= 0);
    rhmi.emit('applicationStackChanged', { ROOT_APP: [] }); await delay(20);
    assert.strictEqual(visible, 1);
    assert.deepStrictEqual(errors, []);
    app.emit('shutdown'); c.stop();
});

test('stop while renderer is unavailable cancels the reconnect timer', async () => {
    const server = await mock();
    const socketPath = server.socketPath;
    await server.close();
    const logo = createLogo(config, image, { socketPath });
    logo.start();
    await delay(100);
    logo.stop();
    let connected = false;
    const late = net.createServer((s) => { connected = true; s.destroy(); });
    await new Promise((resolve) => late.listen(socketPath, resolve));
    try { await delay(600); assert.strictEqual(connected, false); }
    finally { await new Promise((resolve) => late.close(resolve)); }
});

test('renderer becoming available after application startup receives the image', async () => {
    const reservation = await mock();
    const socketPath = reservation.socketPath;
    await reservation.close();
    const logo = createLogo(config, image, { socketPath });
    logo.start();
    await delay(100);
    const server = await mock(socketPath);
    try {
        await until(() => server.clients.length && frames(server.clients[0]).length === 1);
        assert.deepStrictEqual(frames(server.clients[0])[0].frame.slice(14), image.rgba);
    } finally { logo.stop(); await server.close(); }
});

test('shutdown during pending SDK start never creates a layer', async () => {
    const app = new EventEmitter();
    let resolve;
    app.start = () => new Promise((r) => { resolve = r; });
    app.registerActive = () => Promise.resolve();
    let exits = 0;
    const result = run(app, () => { throw new Error('must not create'); }, () => {}, () => { exits++; }, new EventEmitter());
    app.emit('shutdown'); resolve(); await result;
    assert.strictEqual(exits, 1);
});

test('SDK activation, clean signal stop, and failure stays alive', async () => {
    const app = new EventEmitter(), events = new EventEmitter();
    let active = 0, starts = 0, stops = 0, exits = 0;
    app.start = () => Promise.resolve();
    app.registerActive = () => { active++; return Promise.resolve(); };
    await run(app, () => ({ start: () => starts++, stop: () => stops++ }), () => {}, () => exits++, events);
    assert.strictEqual(active, 1); assert.strictEqual(starts, 1);
    events.emit('SIGTERM'); events.emit('exit');
    assert.strictEqual(stops, 1); assert.strictEqual(exits, 1);
    const broken = new EventEmitter();
    broken.start = () => Promise.reject(new Error('SDK failure'));
    let errors = 0;
    await run(broken, () => {}, () => errors++, () => { throw new Error('unexpected exit'); }, new EventEmitter());
    assert.strictEqual(errors, 1);
});

(async () => {
    for (const t of tests) { await t.fn(); console.log('PASS ' + t.name); }
    console.log(tests.length + ' JavaScript tests passed');
})().catch((e) => { console.error(e.stack); process.exitCode = 1; });
