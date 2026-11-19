'use strict';
const assert = require('assert');
const net = require('net');
const path = require('path');
const os = require('os');
const validate = require('../src/config');
const api = require('../src/probe');
const base = require('../config.example.json');
let passed = 0;
function frame(ev) {
    const body = Buffer.from(JSON.stringify(ev));
    const out = Buffer.alloc(body.length + 5);
    out.writeUInt32LE(body.length + 1, 0); out[4] = 0x4a; body.copy(out, 5); return out;
}
const hello = { ev: 'hello', proto: 1, backend: 'id7', targets: 'map:1088x480,panel:1920x720,hud:800x480' };
async function scenario(name, respond, expected, options) {
    const endpoint = process.platform === 'win32' ? '\\\\.\\pipe\\custom-logo-' + process.pid + '-' + passed :
        path.join(os.tmpdir(), 'custom-logo-' + process.pid + '-' + passed + '.sock');
    const ops = [], sockets = [], logs = [];
    let connections = 0;
    const server = net.createServer(socket => {
        sockets.push(socket); connections++;
        socket.on('error', () => {});
        let buffer = Buffer.alloc(0);
        socket.on('data', chunk => {
            buffer = Buffer.concat([buffer, chunk]);
            while (buffer.length >= 5 && buffer.length >= buffer.readUInt32LE(0) + 4) {
                const length = buffer.readUInt32LE(0);
                assert.strictEqual(buffer[4], 0x4a);
                const msg = JSON.parse(buffer.slice(5, 4 + length));
                ops.push(msg.op);
                buffer = buffer.slice(4 + length);
                if (msg.op === 'status') respond(socket, connections);
            }
        });
    });
    await new Promise(resolve => server.listen(endpoint, resolve));
    try {
        const run = api.probe(Object.assign({}, base, { socket: endpoint, timeoutMs: 1000 }, options), ev => logs.push(ev));
        if (name === 'cancel') setTimeout(run.stop, 20);
        const result = await run.result;
        assert.strictEqual(result.ok, expected, name);
        assert(ops.every(op => op === 'hello' || op === 'status'), 'No mutation permitted');
        assert(logs.some(ev => ev.event === 'stopped'));
        if (name === 'reconnect') assert.strictEqual(connections, 2);
        if (expected) assert(logs.some(ev => ev.event === 'protocol_ready'));
        passed++; console.log('PASS ' + name);
    } finally {
        sockets.forEach(socket => socket.destroy());
        await new Promise(resolve => server.close(resolve));
    }
}
async function main() {
    validate(base);
    [{ target: 'map' }, { x: 1900, y: 0 }, { opacity: NaN }, { timeoutMs: 30001 },
        { x: 1 }, { width: 0 }, { logging: 1 }, { autostart: true }].forEach(change =>
        assert.throws(() => validate(Object.assign({}, base, change))));
    assert.throws(() => api.request('layer'));
    passed++; console.log('PASS configuration and outbound allowlist');
    await scenario('fragmented hello and coalesced status', socket => {
        const data = Buffer.concat([frame(hello), frame({ ev: 'status', text: 'idle' })]);
        socket.write(data.slice(0, 3)); setTimeout(() => socket.write(data.slice(3)), 5);
    }, true);
    await scenario('reject ID8', socket => socket.write(frame(Object.assign({}, hello, { backend: 'id8' }))), false);
    await scenario('reject panel mismatch', socket => socket.write(frame(Object.assign({}, hello, { targets: 'panel:100x100' }))), false);
    await scenario('reject protocol mismatch', socket => socket.write(frame(Object.assign({}, hello, { proto: 2 }))), false);
    await scenario('renderer refusal', socket => socket.write(frame({ ev: 'error', reason: 'unsupported' })), false);
    await scenario('status without hello', socket => socket.write(frame({ ev: 'status', text: 'not supported' })), false);
    await scenario('oversized frame', socket => { const b = Buffer.alloc(5); b.writeUInt32LE(2000000); socket.write(b); }, false);
    await scenario('malformed JSON', socket => socket.write(Buffer.from([2, 0, 0, 0, 0x4a, 0x7b])), false);
    await scenario('invalid object', socket => socket.write(frame(null)), false);
    await scenario('deadline', () => {}, false, { timeoutMs: 30 });
    await scenario('cancel', () => {}, false);
    await scenario('reconnect', (socket, n) => {
        if (n === 1) socket.destroy();
        else socket.write(Buffer.concat([frame(hello), frame({ ev: 'status', text: 'idle' })]));
    }, true);
    console.log(passed + ' tests passed');
}
main().catch(err => { console.error(err); process.exitCode = 1; });
