'use strict';

function validate(c) {
    const keys = ['target', 'imagePath', 'x', 'y', 'width', 'height', 'opacity',
        'testMode', 'logging', 'socket', 'timeoutMs'];
    if (!c || typeof c !== 'object' || Array.isArray(c)) throw new Error('Expected a configuration object');
    Object.keys(c).forEach(k => { if (keys.indexOf(k) < 0) throw new Error('Unknown setting: ' + k); });
    keys.forEach(k => { if (!Object.prototype.hasOwnProperty.call(c, k)) throw new Error('Missing setting: ' + k); });
    if (c.target !== 'panel') throw new Error('Only panel is in scope');
    if (c.imagePath !== null && (typeof c.imagePath !== 'string' || !c.imagePath.length)) throw new Error('Invalid imagePath');
    ['width', 'height', 'timeoutMs'].forEach(k => { if (!Number.isInteger(c[k]) || c[k] < 1) throw new Error('Invalid ' + k); });
    if (c.width > 1920 || c.height > 720 || c.timeoutMs > 30000) throw new Error('Size or timeout out of bounds');
    ['x', 'y'].forEach(k => { if (c[k] !== null && (!Number.isInteger(c[k]) || c[k] < 0)) throw new Error('Invalid ' + k); });
    if ((c.x === null) !== (c.y === null)) throw new Error('Set both coordinates or neither');
    if (c.x !== null && (c.x + c.width > 1920 || c.y + c.height > 720)) throw new Error('Rectangle outside panel');
    if (typeof c.opacity !== 'number' || !Number.isFinite(c.opacity) || c.opacity < 0 || c.opacity > 1) throw new Error('Invalid opacity');
    if (typeof c.testMode !== 'boolean' || typeof c.logging !== 'boolean') throw new Error('Expected boolean settings');
    if (typeof c.socket !== 'string' || !c.socket.length || /[\r\n\0]/.test(c.socket)) throw new Error('Invalid socket');
    return c;
}
module.exports = validate;
