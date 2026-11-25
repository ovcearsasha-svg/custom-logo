'use strict';
const { createLogo } = require('./logo');
const { copy } = require('./settings');
function controller(defaults, image, storage, options) {
    let state = storage.load(defaults);
    let saved = copy(state);
    let step = 5;
    let note = '';
    let closed = false;
    const listeners = [];
    const logo = createLogo(state, image, options);
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    function snapshot() {
        return { config: copy(state), step, note,
            dirty: JSON.stringify(state) !== JSON.stringify(saved) };
    }
    function notify() { listeners.forEach((fn) => fn(snapshot())); }
    function action(name) {
        if (closed) return;
        let next = copy(state);
        note = '';
        if (name === 'LEFT') next.x -= step;
        else if (name === 'RIGHT') next.x += step;
        else if (name === 'UP') next.y -= step;
        else if (name === 'DOWN') next.y += step;
        else if (name === 'SMALLER' || name === 'LARGER') {
            const ratio = image.height / image.width;
            const min = Math.ceil(Math.max(32, 32 / ratio));
            const max = Math.floor(Math.min(512, 512 / ratio));
            const width = clamp(next.width + (name === 'LARGER' ? step : -step), min, max);
            // Keep the canvas centre stationary while scaling.
            next.height = Math.round(width * ratio);
            next.x += Math.round((state.width - width) / 2);
            next.y += Math.round((state.height - next.height) / 2);
            next.width = width;
        } else if (name === 'STEP') {
            const steps = [1, 5, 10, 20];
            step = steps[(steps.indexOf(step) + 1) % steps.length];
        } else if (name === 'TOGGLE') next.enabled = !next.enabled;
        else if (name === 'RESET') next = copy(defaults);
        else if (name === 'SAVE') {
            try { storage.save(state); saved = copy(state); note = 'Saved'; }
            catch (e) { note = 'Save failed'; }
        } else throw new Error('Unknown menu action: ' + name);
        next.x = clamp(next.x, 1 - next.width, 1919);
        next.y = clamp(next.y, 1 - next.height, 719);
        if (JSON.stringify(next) !== JSON.stringify(state)) {
            logo.update(next);
            state = next;
        }
        notify();
    }
    return { start: () => logo.start(), stop: () => { closed = true; logo.stop(); },
        action, snapshot, onChange: (fn) => listeners.push(fn) };
}
module.exports = { controller };
