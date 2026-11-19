'use strict';
const fs = require('fs');
const path = require('path');
const validate = require('./config');
const probe = require('./probe').probe;

async function main() {
    const args = process.argv.slice(2);
    const mode = args[0] || 'check';
    if (args.length > 2 || ['check', 'probe'].indexOf(mode) < 0) {
        throw new Error('Usage: node src/cli.js [check|probe] [config.json]. Rendering is blocked in v0.1.0.');
    }
    const config = validate(JSON.parse(fs.readFileSync(args[1] || path.join(__dirname, '../config.example.json'), 'utf8')));
    if (mode === 'check') {
        console.log(JSON.stringify({ valid: true, rendering: 'blocked', connected: false,
            coordinates: config.x === null ? 'uncalibrated' : 'unverified', config: config }, null, 2));
        return;
    }
    const run = probe(config, event => { if (config.logging) console.log(JSON.stringify(event)); });
    const cancel = () => run.stop();
    process.on('SIGINT', cancel);
    process.on('SIGTERM', cancel);
    const outcome = await run.result;
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
    console.log(JSON.stringify(outcome));
    if (!outcome.ok) process.exitCode = 1;
}
main().catch(err => { console.error(err.message); process.exitCode = 1; });
