'use strict';
// Native RHMI list only. API calls follow MGU App Kit's Ui/run implementation.
const ACTIONS = ['LEFT', 'RIGHT', 'UP', 'DOWN', 'SMALLER', 'LARGER', 'STEP', 'TOGGLE', 'RESET', 'SAVE'];
async function attach(app, control, entries, report) {
    const rhmi = app.rhmiApplication;
    if (!rhmi) return; // Background starts can have no RHMI application.
    let disposed = false;
    const timers = new Set();
    function bounded(fn) {
        let timer;
        return Promise.race([
            Promise.resolve().then(fn),
            new Promise((resolve) => {
                timer = setTimeout(() => { timers.delete(timer); report('Menu operation timed out'); resolve(); }, 3000);
                timers.add(timer);
            })
        ]).catch((e) => report('Menu: ' + String(e))).then(() => { clearTimeout(timer); timers.delete(timer); });
    }
    app.on('shutdown', () => { disposed = true; timers.forEach(clearTimeout); timers.clear(); });
    const main = rhmi.getByName('MAIN');
    if (!main) throw new Error('Missing MAIN state');
    let latest = null, painting = false;
    function refresh(snapshot) {
        latest = snapshot;
        if (painting || disposed) return;
        painting = true;
        async function drain() {
            while (latest && !disposed) {
                const s = latest; latest = null;
                const c = s.config;
                const cells = {
                    POSITION: 'X: ' + c.x + '   Y: ' + c.y,
                    SIZE: c.width + ' x ' + c.height + ' px   Step: ' + s.step + ' px',
                    STATUS: (c.enabled ? 'ON' : 'OFF') + (s.dirty ? ' *' : '') + (s.note ? ' | ' + s.note : '')
                };
                await Promise.all(Object.keys(cells).map((name) => bounded(() => {
                    const component = rhmi.getByName(name);
                    if (component) return component.setValue(0, 'Text', cells[name], 'Text');
                })));
            }
            painting = false;
        }
        drain().catch((e) => { painting = false; report(String(e)); });
    }
    ACTIONS.forEach((name) => {
        const component = rhmi.getByName(name);
        if (!component) throw new Error('Missing menu action ' + name);
        component.on('action', () => {
            if (!disposed) {
                try { control.action(name); } catch (e) { report(String(e)); }
            }
        });
    });
    control.onChange(refresh);
    main.on('visible', (ev) => { if (ev && ev.visible) refresh(control.snapshot()); });
    rhmi.on('applicationStackChanged', (stack) => {
        if (disposed) return;
        const shown = stack && Object.prototype.hasOwnProperty.call(stack, 'ROOT_APP');
        bounded(() => shown ? app.registerHmiVisible() : app.unregisterHmiVisible());
    });
    let opening = false;
    function open(uuid) {
        if (disposed || opening || entries.indexOf(uuid) < 0) return;
        opening = true;
        bounded(async () => {
            await rhmi.mapEntryState(uuid, main);
            await main.updateResources();
            await rhmi.openEntryState(uuid);
        }).then(() => { opening = false; refresh(control.snapshot()); });
    }
    app.on('entryPointExecute', open);
    await bounded(() => main.updateResources());
    await Promise.all(entries.map((uuid) => bounded(() => rhmi.mapEntryState(uuid, main))));
    refresh(control.snapshot());
    const last = app.getLastExecutedEntryPointUuid && app.getLastExecutedEntryPointUuid();
    if (last && ['ENTRY_POINT', 'BOOKMARK', 'LUM'].indexOf(String(app.startReason)) >= 0) open(last);
}
module.exports = { attach, ACTIONS };
