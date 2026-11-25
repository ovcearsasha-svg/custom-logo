'use strict';
// Lifecycle follows bimmer-lab's kit/runtime/mgu.js, without its UI/runtime.
async function run(app, makeLogo, report, exit, processEvents, attachUi) {
    let logo = null;
    let stopping = false;
    const events = processEvents || process;
    function stop() {
        if (stopping) return;
        stopping = true;
        if (logo) logo.stop();
    }
    function shutdown() { stop(); exit(0); }
    function active() {
        if (stopping) return;
        return Promise.resolve().then(() => app.registerActive()).catch((e) => report(String(e)));
    }
    app.on('appStatusProxyReady', active);
    app.on('shutdown', shutdown);
    events.on('SIGTERM', shutdown);
    events.on('SIGINT', shutdown);
    events.on('exit', stop);
    try {
        await app.start();
        if (stopping) return;
        await active();
        if (stopping) return;
        logo = makeLogo();
        logo.start();
        if (attachUi) {
            try { await attachUi(app, logo); } catch (e) { report('Menu unavailable: ' + String(e)); }
        }
        if (!stopping && app.initialized) await app.initialized();
    } catch (e) {
        stop();
        // Unexpected exits can trigger CorruptAppsHandler. Stay managed by SDK.
        report('Custom Logo disabled: ' + String(e));
    }
}
module.exports = { run };
