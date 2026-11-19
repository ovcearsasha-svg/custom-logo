# Manual procedure

## Diagnostic supported in v0.1.0

For Store use, follow [the no-SSH guide](STORE_INSTALL_RU.md). Verify install
and opening the tile do not initiate a check. Press Check, inspect the report,
test Stop and leaving/reopening the page, RU/EN and report pagination. Photograph
idle, running, success/failure and stopped states. Removing the app must leave
cluster-render and other apps intact. These on-car checks remain pending.

1. Record vehicle, MGU firmware, DKOMBI variant, Node and installed renderer
   versions. Do not assume the installed renderer matches the reviewed commit.
2. Park the vehicle. Photograph the baseline cluster and HUD. Keep an observer
   present; do not run the experiment while driving.
3. Run `check`: rendering blocked, connected false.
4. Run `probe`. Save logs and note visible changes. Only hello/status are sent,
   no layers are created. Completion must occur within the configured deadline.
5. Repeat with Ctrl+C and SIGTERM; verify prompt return and no lingering process.
6. If the renderer is unavailable, verify bounded failure. Do not restart the
   vehicle's shared service for testing; use the fake-server reconnect test.
7. Record diagnostic results, not a successful logo demonstration.

Stop if the cluster changes unexpectedly. No on-car results have been collected.

## Future rendering gate (not executable in this version)

Resolve first-pass alpha and factory composition on a bench first. Document
panel/fallback scene IDs, warning priority and HUD ownership. In a separately
reviewed implementation use a small transparent test asset with no contention,
exclusivity or prewarming. Verify background transparency, stock gauges, PHEV
indicators and naturally occurring warnings with before/after evidence. Do not
induce faults or drive to generate warnings. Reject the approach if it obscures
any safety display. Test stop, disconnect, service failure and recovery.

Only then calibrate renderer pixel coordinates. Measure process start, socket
connection, hello, scene shown and visually observed first image separately.
Wake-to-image needs an external timestamp/video, cold and warm starts, firmware
details and repeated measurements; it cannot be inferred from service settings.
