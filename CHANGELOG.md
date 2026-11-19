# Changelog

## 0.1.0 — 2026-11-19

- Add a Store repo-tree source package for ID7 with RU/EN diagnostic screen,
  manual check/stop, paginated results and cancellation when hidden.
- Share the existing probe with the CLI; add lifecycle and package tests.
- No automatic renderer dependency installation or update.
- Analyze pinned cluster-render 0.6.9 API and document unverified composition.
- Add dependency-free Node 8-compatible configuration check and bounded
  hello/status probe with cancellation, retry and elapsed-time logs.
- Add fake-socket tests, manual procedure and troubleshooting documentation.
- Defer rendering under the safety gate. No autostart, firmware/coding changes,
  or installable rendering release; Store packaging is diagnostic only.
