# Compatibility decision

Reviewed upstream `robertnisipeanu/idrive-apps` commit
`11ccb939830bb49a6304005023ba61bd21834e25`, cluster-render 0.6.9.
Target: G30 530e 2019, MGU ID7, DKOMBI4 with PHEV layout.

## Confirmed from source, not from this vehicle

- [README targets and arbitration](https://github.com/robertnisipeanu/idrive-apps/blob/11ccb939830bb49a6304005023ba61bd21834e25/native/cluster-render/README.md):
  ID7 map is slot 0x100, 1088x480 under gauges; panel is slot 0x203,
  1920x720 over gauges. Panel is a whole-target scene, not an API for editing
  the factory eDrive resource. A PNG's transparency alone is insufficient proof.
- [Protocol](https://github.com/robertnisipeanu/idrive-apps/blob/11ccb939830bb49a6304005023ba61bd21834e25/native/cluster-render/PROTOCOL.md):
  image layers take straight-alpha RGBA bytes (not PNG files), iw/ih,
  target-space x/y/w/h from the top left, opacity. `layer` creates, `set` updates,
  `F` uploads pixels, `drop` removes. References belong to their connection.
  exclusive=0, contend=0, prewarm=0 are defaults; exclusive controls custom
  layers below the layer, not a guarantee about factory gauges.
- [Node client](https://github.com/robertnisipeanu/idrive-apps/blob/11ccb939830bb49a6304005023ba61bd21834e25/native/cluster-render/js/cluster_render_client.js):
  Node 8, only net/events; ClusterRender, connect, image, pixels, set, drop,
  close. JS option klass maps to protocol class. Automatic reconnect replays
  stored layers and images. Ready means hello received, not first pixels visible.
  This prototype independently implements hello/status; no upstream code copied.
- [RAMSES19 graph](https://github.com/robertnisipeanu/idrive-apps/blob/11ccb939830bb49a6304005023ba61bd21834e25/native/cluster-render/src/graph_ramses19.cpp#L21):
  flat_blended uses SrcAlpha/OneMinusSrcAlpha. However build() at lines 111-145
  leaves the first pass's library default clear unchanged. Neither this code nor
  the ABI declarations establish default clear alpha and final composition with
  this DKOMBI4's factory scene. Later passes not clearing colour does not answer
  the first-pass question.
- README documents warning slot locks, waiting for other owners and panel
  fallback scene ID 0x01000400 (shared with HUD, never shown simultaneously).
  These interactions need testing; they do not prove safe PHEV operation.
- Startup can wait for stock HMI mapping up to 10 seconds. Default image fade
  is 250 ms; panel linger is 3 seconds. These are individual mechanisms, not a
  bound on total wake-to-visible latency. On service crash, cluster watchdog
  removal may take approximately 10 seconds.
- target.rendering=verified means scene subscription, not visual verification.
  layer=shown also does not prove correct placement or preserved warnings.

## Decision and deferred implementation

The evidence neither proves safe transparent factory composition nor proves it
impossible. The required safety property remains unverified, so v0.1.0 has no
live rendering path or override flag. It provides an offline configuration check
and bounded manual diagnostics only. The visible-logo milestone is not achieved.

Deferred: PNG decoding/upload, rectangle drawing, coordinate calibration,
own-layer removal, image replay, first-render timing and M artwork. These depend
on the safety gate and are not implemented features. Probe reconnection retains
no display state.

Before implementing rendering, establish RAMSES19 default clear/composition
semantics with vendor/runtime evidence or a non-driving bench, and collect
DKOMBI4/PHEV-specific gauge, warning-priority and HUD results. Then review a
separate bounded rendering change. Diagnostic success must never unlock drawing.
No firmware, coding, renderer settings or stock-logo changes are proposed.
