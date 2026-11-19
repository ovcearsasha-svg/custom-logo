# BMW Custom Logo v0.1.0

Compatibility investigation for BMW G30 530e (2019), MGU ID7, DKOMBI4 and
factory PHEV layout. **This version does not display a logo.**

Upstream supports a full-cluster panel and alpha-blended image layers. Safe
composition over this DKOMBI4's factory scene remains unverified. Following the
task's safety gate, rendering is deferred. The visible test-image milestone is
**not achieved**. See [technical findings](docs/COMPATIBILITY.md).

## Local use

No dependencies or install scripts. Runtime syntax targets Node 8.17+ (upstream
uses Node 8); tests ran on Node 24.22.3. Node 8 and real-car execution are untested.

```sh
node src/cli.js check
node test/run.js
```

Default mode is check: no socket connection. Unknown arguments/settings fail.
Example configuration contains target, image path, geometry, opacity, logging
and test mode. Image/test settings are planning fields only: PNG decoding and
drawing are not implemented. Coordinates stay null until calibrated; panel
coordinates start at the top left of 1920x720 renderer space, not a photograph.

## Manual SSH diagnostic

Use the existing renderer and an account already allowed to access its socket
(normally group tm_oap_app). Do not replace the renderer, change permissions,
enable services or change coding. Copy src/ and config.example.json to a
separate user-writable directory such as /tmp/bmw-custom-logo via your existing
SSH/SCP connection. On the parked vehicle, with an observer watching the cluster:

```sh
cd /tmp/bmw-custom-logo
node --version
node src/cli.js check config.example.json
node src/cli.js probe config.example.json
```

Probe sends only documented hello/status. Connecting can socket-activate the
existing service; it is not zero-side-effect. No scene is acquired and no layer
is created. It exits after status or the total deadline (default 5 seconds,
maximum 30). Ctrl+C or SIGTERM closes the connection. Nothing needs layer cleanup.
Temporary disconnects retry after 250/500/1000/2000 ms within that same deadline.
No autostart, installer, vehicle writes or installable release is included.

JSON logs separate connection, protocol readiness, renderer events and errors.
Success means a compatible hello/status only, not first render or wake latency.

- [Compatibility and pinned references](docs/COMPATIBILITY.md)
- [Manual tests and future rendering gate](docs/MANUAL_TEST.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Changelog](CHANGELOG.md)
