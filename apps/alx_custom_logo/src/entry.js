// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const OnlineApp = require('oap-sdk/src/core/OnlineApp.js');
const logger = require('oap-sdk/src/logging/logging').getSDKLogger();
const app = require('./app.js')(OnlineApp, logger);
app.start().catch(err => logger.error('Custom Logo Diagnostics: ' + err.message));
