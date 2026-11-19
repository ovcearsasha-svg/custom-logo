# BMW Custom Logo v0.1.0

Compatibility investigation for BMW G30 530e (2019), MGU ID7, DKOMBI4 and
factory PHEV layout. **This version does not display a logo.**

Upstream supports a full-cluster panel and alpha-blended image layers. Safe
composition over this DKOMBI4's factory scene remains unverified. Following the
task's safety gate, rendering is deferred. The visible test-image milestone is
**not achieved**. See [technical findings](docs/COMPATIBILITY.md).

## Install through Store (no SSH)

Offline alternative: extract `custom-logo-store-usb.zip` to a USB stick so
`mgu-repo/custom-logo/mgu-repo.json` exists. Insert the stick, refresh Store,
and install Custom Logo Diagnostics from that USB source. Keep it inserted until
installation completes. See the Russian guide below. Source archives are not
prebuilt OAP packages and do not belong in the stick's `oap/` directory.

Once these Store changes are published to the feature branch:
Add GitHub source `ovcearsasha-svg/custom-logo` in Store and select branch
`feature/bmw-custom-logo-v0.1.0`. Refresh, install **Custom Logo Diagnostics**,
then open its iDrive tile and select **Проверить подключение / Check connection**
while parked. Full [Russian installation guide](docs/STORE_INSTALL_RU.md).

The source package is linked on the head unit against its own SDK donor.
No SDK is redistributed and no release or merge is needed. Requires a Store
version supporting branch sources and `mgu-app.json` source packages.
Actual head-unit installation has not yet been tested.

The app has Russian/English controls, a stop button and a paginated report.
Opening it never starts a probe; hiding it cancels an active check. It adds no
autostart service, and declares no dependency that could update cluster-render.
The OAP manager may initialize the UI process as part of its normal lifecycle;
that does not run diagnostics or acquire a renderer scene.

## Local use

No CLI dependencies or install scripts. Runtime syntax targets Node 8.16.2+ (Store's
uses Node 8); tests ran on Node 24.22.3. Node 8 and real-car execution are untested.

```sh
node src/cli.js check
npm test
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
No autostart, vehicle writes or installable release is included. The Store
source package above is a manual diagnostic app, not a rendering release.

JSON logs separate connection, protocol readiness, renderer events and errors.
Success means a compatible hello/status only, not first render or wake latency.

- [Compatibility and pinned references](docs/COMPATIBILITY.md)
- [Manual tests and future rendering gate](docs/MANUAL_TEST.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Changelog](CHANGELOG.md)

## Licenses and validation

CLI/probe/controller: MIT. The Store OAP/RHMI adapter and metadata adapt the
upstream GPL-3.0-or-later app integration; the combined Store app is GPL-3.0-or-later.
See its package NOTICE.md and license files. No proprietary SDK or BMW artwork
is included. Optional integration validation with the reviewed upstream checkout:
`node test/upstream-build.js /path/to/idrive-apps` uses a synthetic test SDK only;
its mock package must never be installed on a car.
