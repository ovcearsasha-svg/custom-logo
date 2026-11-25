'use strict';
const { OnlineApp, logging } = require('oap-sdk');
const fs = require('fs');
const path = require('path');
const { controller } = require('./controller');
const { store } = require('./settings');
const { attach } = require('./menu');
const { run } = require('./lifecycle');
const log = logging.getSDKLogger();
const report = (message) => log.warn('Custom Logo: ' + message);
const home = path.resolve(__dirname, '..', '..');
run(new OnlineApp(), function () {
    const image = require('./logo-data');
    const config = require('./logo-config');
    const storage = store(path.join(home, 'data', 'custom-logo-settings.json'), image, report);
    return controller(config, image, storage, { report: (message) => log.info('Custom Logo: ' + message) });
}, report, (code) => process.exit(code), process, (app, control) => {
    const description = JSON.parse(fs.readFileSync(path.join(home, 'rhmiData', 'application.json'), 'utf8'));
    return attach(app, control, description.application.entryPoints.map((entry) => entry.uuid), report);
});
