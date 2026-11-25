'use strict';
const { ClusterRender } = require('./cluster_render_client');

function validate(config, image) {
    if (!config || typeof config.enabled !== 'boolean') throw new Error('enabled must be boolean');
    ['x', 'y', 'width', 'height'].forEach((key) => {
        if (!Number.isInteger(config[key])) throw new Error(key + ' must be an integer');
    });
    if (config.width < 32 || config.height < 32 || config.width > 512 || config.height > 512 ||
        config.x <= -config.width || config.y <= -config.height || config.x >= 1920 ||
        config.y >= 720) throw new Error('logo rectangle outside allowed panel bounds');
    if (!image || !Number.isInteger(image.width) || !Number.isInteger(image.height) ||
        image.width < 1 || image.height < 1 || image.width > 512 || image.height > 512 ||
        !Buffer.isBuffer(image.rgba) || image.rgba.length !== image.width * image.height * 4)
        throw new Error('invalid RGBA image');
}

function createLogo(config, image, options) {
    validate(config, image);
    const opts = options || {};
    const cr = new (opts.Client || ClusterRender)('custom_logo', opts.socketPath);
    let stopped = false;
    let started = false;
    let current = Object.assign({}, config);
    const report = opts.report || function () {};
    cr.on('refused', (op, ref, reason) => {
        report('refused: ' + op + ': ' + reason);
        // Do not fight arbitration or retry a rejected layer in a tight loop.
        stop();
    });
    cr.on('disconnected', () => report('disconnected; reconnecting'));
    cr.on('ready', () => report('connected'));
    cr.on('layer', (ref, state, reason) => report('layer ' + state + (reason ? ': ' + reason : '')));
    let layer = 0;
    function addLayer() {
        layer = cr.image({ target: 'panel', klass: 'overlay', z: 0,
            x: current.x, y: current.y, w: current.width, h: current.height,
            iw: image.width, ih: image.height, sampling: 'bilinear',
            exclusive: false, contend: false, prewarm: false, preload: false });
        // Queue ONCE before connect. Upstream replays the retained pixels itself.
        if (!layer || !cr.pixels(layer, null, image.rgba)) throw new Error('image rejected by client');
    }
    if (current.enabled) addLayer();
    function stop() {
        if (stopped) return;
        stopped = true;
        // Socket ownership is the authoritative cleanup, even if drop cannot drain.
        if (layer) cr.drop(layer);
        cr.close();
    }
    return {
        start: function () {
            if (started || stopped) return;
            started = true;
            if (current.enabled) cr.connect();
        },
        update: function (next) {
            validate(next, image);
            if (stopped) return;
            const wasEnabled = current.enabled;
            const changed = ['x', 'y', 'width', 'height'].some((k) => current[k] !== next[k]);
            current = Object.assign({}, next);
            if (!current.enabled) {
                if (layer) cr.drop(layer);
                layer = 0;
                cr.close();
            } else if (!wasEnabled) {
                addLayer();
                if (started) cr.connect();
            } else if (layer && changed) {
                cr.set(layer, { x: current.x, y: current.y, w: current.width, h: current.height });
            }
        },
        stop: stop
    };
}
module.exports = { createLogo, validate };
