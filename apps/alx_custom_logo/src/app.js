// SPDX-License-Identifier: GPL-3.0-or-later
// Lifecycle/RHMI integration adapted from robertnisipeanu/idrive-apps.
// Copyright (C) 2026 Robert Nisipeanu; modifications (C) 2026 Alx887.
'use strict';
const Controller = require('./controller.js').Controller;
const NAMES = ['status', 'note', 'parked', 'start', 'stop', 'prev', 'next', 'language', 'page', 'row0', 'row1', 'row2', 'row3'];
function yes(v) { return v === true || v === 1 || v === '1' || v === 'true'; }

// Dependency injection keeps the proprietary SDK out of the repository/tests.
module.exports = function createApp(OnlineApp, logger, controller, exit) {
    class App extends OnlineApp {
        constructor() {
            super();
            this.control = controller || new Controller();
            this.components = {}; this.actions = {}; this.pressed = {}; this.stopping = false;
            this.control.on('change', () => this.render());
            this.on('initialized', () => this.initializePage().catch(err => logger.error(err.message)));
            this.on('entryPointExecute', uuid => this.open(uuid));
            this.on('changeVisibility', data => { if (data && data.visible === false) this.visibility(false); });
            this.on('shutdown', () => this.shutdown());
            this.on('error', err => logger.warn(err.message));
        }
        async initializePage() {
            if (!this.rhmiApplication) return this.initialized();
            const rhmi = this.rhmiApplication;
            this.state = rhmi.getByName('ST_CustomLogoDiagnostics');
            if (!this.state) throw new Error('Missing diagnostics state');
            NAMES.forEach(name => {
                this.components[name] = rhmi.getByName('cl_' + name);
                if (!this.components[name]) throw new Error('Missing component: ' + name);
            });
            const handlers = { start: () => this.control.start(), stop: () => this.control.cancel(),
                prev: () => this.control.turn(-1), next: () => this.control.turn(1), language: () => this.control.toggleLanguage() };
            Object.keys(handlers).forEach(name => {
                const comp = this.components[name];
                this.actions[Number(comp.getId())] = name;
                comp.on('action', () => this.press(name, handlers));
            });
            rhmi.on('userEvent', ev => { if (ev && ev.eventType === 'ACTION') this.press(this.actions[Number(ev.sourceId)], handlers); });
            rhmi.on('restoreHmi', () => this.render());
            rhmi.on('applicationStackChanged', stack => {
                if (stack && Object.keys(stack).length) this.visibility(Object.prototype.hasOwnProperty.call(stack, 'ROOT_APP'));
            });
            this.state.on('visible', ev => this.visibility(yes(ev && ev.visible)));
            await this.state.updateResources();
            const descriptions = this.appDescription.application.entryPoints;
            const ep = this.getEntryPoints().find(item => descriptions.some(d => d.uuid === item.getDescription().uuid));
            if (!ep) throw new Error('No app entry point supplied by manager');
            await ep.init();
            await rhmi.mapEntryState(ep.getDescription().uuid, this.state);
            await ep.setAvailability('ENABLED');
            const data = this.getVisibilityData && this.getVisibilityData();
            const reason = (data && data.reason) || this.startReason;
            const foreground = ['ENTRY_POINT', 'LUM', 'BOOKMARK', 'START_WIDGET', 'TRIGGER_HMI', 'SPEECH_COMMAND'].indexOf(reason) >= 0;
            if (foreground) await this.registerActive();
            await this.initialized();
            this.visibility(foreground);
            const uuid = this.getLastExecutedEntryPointUuid && this.getLastExecutedEntryPointUuid();
            if (uuid) await this.open(uuid);
        }
        press(name, handlers) {
            if (!name || !handlers[name] || this.stopping || !this.control.visible) return;
            const now = Date.now();
            if (now - (this.pressed[name] || 0) < 400) return;
            this.pressed[name] = now;
            handlers[name]();
        }
        open(uuid) {
            if (this.stopping || !this.state || !uuid) return Promise.resolve();
            this.visibility(true);
            return Promise.resolve(this.rhmiApplication.openEntryState(uuid)).catch(err => logger.warn(err.message));
        }
        visibility(visible) {
            if (this.stopping) return;
            const changed = this.control.visible !== visible;
            this.control.setVisible(visible);
            if (changed && this._initialized && this._appStatusService) {
                const reports = visible ? [this.registerActive(), this.registerHmiVisible()] : [this.unregisterHmiVisible(), this.registerInactive()];
                reports.forEach(report => Promise.resolve(report).catch(err => logger.warn(err.message)));
            }
            this.render();
        }
        render() {
            if (!this.state || this.stopping) return;
            const view = this.control.view();
            for (let i = 0; i < 4; i++) view['row' + i] = view.rows[i] || '';
            NAMES.forEach(name => {
                Promise.resolve(this.components[name].setValue(0, 'Text', view[name], 'Text')).catch(err => logger.warn(err.message));
            });
            ['start', 'stop', 'prev', 'next'].forEach(name => {
                const enabled = view['can' + name[0].toUpperCase() + name.slice(1)];
                const comp = this.components[name];
                Promise.resolve(comp.setEnabled ? comp.setEnabled(enabled) : comp.setProperty('Enabled', enabled ? 1 : 0, 'UInt')).catch(err => logger.warn(err.message));
            });
        }
        shutdown() {
            if (this.stopping) return this.shutdownPromise;
            this.stopping = true; this.control.close();
            this.shutdownPromise = Promise.resolve().then(() => this.destroyBundles()).catch(err => logger.warn(err.message)).then(() => (exit || process.exit)(0));
            return this.shutdownPromise;
        }
    }
    return new App();
};
