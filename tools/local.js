'use strict';
const path = require('path');
const { createLogo, validate } = require('../apps/custom_logo/logo');
const config = require('../apps/custom_logo/logo-config');
const image = require('../apps/custom_logo/logo-data');
if (process.argv[2] === '--check') {
    validate(config, image);
    console.log('Validated: ' + image.width + 'x' + image.height + ', RGBA ' + image.rgba.length + ' bytes; no connection');
} else if (process.argv[2] === '--socket' && process.argv[3]) {
    const socketPath = process.argv[3];
    if (socketPath === '/dev/shm/cluster-render/render.sock') throw new Error('Local runner refuses vehicle socket');
    const logo = createLogo(config, image, { socketPath: socketPath, report: console.log });
    process.on('SIGINT', () => { logo.stop(); });
    process.on('SIGTERM', () => { logo.stop(); });
    logo.start();
} else {
    console.error('Use --check or --socket <explicit local mock socket>');
    process.exitCode = 1;
}
