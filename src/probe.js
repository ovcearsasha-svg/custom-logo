'use strict';
const net = require('net');

// The only outbound operations in this prototype. No layer/scene/frame API.
function request(op) {
    if (op !== 'hello' && op !== 'status') throw new Error('Read-only operation required');
    const body = Buffer.from(JSON.stringify(op === 'hello' ?
        { op: op, app: 'bmw_custom_logo_probe', proto: 1 } : { op: op }));
    const frame = Buffer.alloc(body.length + 5);
    frame.writeUInt32LE(body.length + 1, 0);
    frame[4] = 0x4a;
    body.copy(frame, 5);
    return frame;
}

function probe(config, log) {
    const started = process.hrtime();
    let socket, deadline, retry, done = false, input, greeted = false, attempts = 0;
    let resolveResult;
    const result = new Promise(resolve => { resolveResult = resolve; });
    function emit(event, data) {
        const elapsed = process.hrtime(started);
        log({ event: event, elapsedMs: Math.round(elapsed[0] * 1000 + elapsed[1] / 1e6), data: data });
    }
    function stop(reason, ok) {
        if (done) return;
        done = true;
        clearTimeout(deadline);
        clearTimeout(retry);
        if (socket) socket.destroy();
        emit('stopped', reason);
        resolveResult({ ok: !!ok, reason: reason });
    }
    function open() {
        if (done) return;
        input = Buffer.alloc(0);
        greeted = false;
        attempts++;
        emit('connecting', attempts);
        socket = net.connect(config.socket);
        socket.on('connect', () => {
            emit('connected');
            socket.write(request('hello'));
            // Unsupported head units may return status without a hello.
            socket.write(request('status'));
        });
        socket.on('data', chunk => {
            if (done) return;
            if (input.length + chunk.length > 1048580) return stop('Response exceeds 1 MiB limit');
            input = Buffer.concat([input, chunk]);
            while (!done && input.length >= 5) {
                const length = input.readUInt32LE(0);
                if (length < 1 || length > 1048576) return stop('Invalid response length');
                if (input.length < length + 4) return;
                if (input[4] !== 0x4a) return stop('Unexpected response type');
                let ev;
                try { ev = JSON.parse(input.slice(5, length + 4).toString('utf8')); }
                catch (err) { return stop('Invalid response JSON'); }
                input = input.slice(length + 4);
                if (!ev || typeof ev !== 'object' || Array.isArray(ev)) return stop('Invalid response object');
                emit('renderer_event', ev);
                if (ev.ev === 'hello') {
                    if (ev.proto !== 1 || ev.backend !== 'id7' || typeof ev.targets !== 'string' ||
                        ev.targets.split(',').indexOf('panel:1920x720') < 0) return stop('Unsupported renderer capabilities');
                    greeted = true;
                    emit('protocol_ready', 'Not proof of visible rendering or safe transparency');
                }
                if (ev.ev === 'error') return stop('Renderer refused request: ' + ev.reason);
                if (ev.ev === 'status') {
                    if (typeof ev.text !== 'string') return stop('Invalid status');
                    return stop(greeted ? 'Diagnostic complete; rendering remains blocked' : 'No compatible hello received', greeted);
                }
            }
        });
        socket.on('error', err => emit('connection_error', err.code || err.message));
        socket.on('close', () => {
            if (done) return;
            emit('disconnected');
            retry = setTimeout(open, [250, 500, 1000, 2000][Math.min(attempts - 1, 3)]);
        });
    }
    deadline = setTimeout(() => stop('Diagnostic deadline exceeded'), config.timeoutMs);
    open();
    return { result: result, stop: () => stop('Cancelled') };
}
module.exports = { probe: probe, request: request };
