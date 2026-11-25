'use strict';
const fs = require('fs');
const path = require('path');
const { validate } = require('./logo');
const KEYS = ['enabled', 'x', 'y', 'width', 'height'];
function copy(value) {
    const result = {};
    KEYS.forEach((k) => { result[k] = value[k]; });
    return result;
}
function store(file, image, report) {
    return {
        load: function (defaults) {
            try {
                if (fs.statSync(file).size > 4096) throw new Error('settings file too large');
                const value = JSON.parse(fs.readFileSync(file, 'utf8'));
                validate(value, image);
                // Scaling must preserve the source canvas aspect ratio.
                if (Math.abs(value.height - value.width * image.height / image.width) > 1)
                    throw new Error('invalid image aspect ratio');
                return copy(value);
            } catch (e) {
                if (e.code !== 'ENOENT') report('Settings ignored: ' + e.message);
                return copy(defaults);
            }
        },
        save: function (value) {
            validate(value, image);
            const tmp = file + '.tmp';
            try {
                fs.writeFileSync(tmp, JSON.stringify(copy(value)) + '\n', { mode: 0o600 });
                fs.renameSync(tmp, file);
            } catch (e) {
                try { fs.unlinkSync(tmp); } catch (_) {}
                throw e;
            }
        }
    };
}
module.exports = { store, copy };
