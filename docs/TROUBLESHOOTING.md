# Troubleshooting

| Symptom | Meaning and action |
| --- | --- |
| No logo | Expected: rendering blocked pending composition evidence. |
| Invalid configuration | Use all example fields. Unknown fields fail closed. Set both coordinates or neither. |
| ENOENT | Socket absent. Check existing installation; do not install/enable it from this project. |
| EACCES | Use an already-authorized socket account; do not chmod or bypass with root. |
| Deadline exceeded | No complete diagnostic within the total deadline. Inspect connection logs. |
| Unsupported capabilities | Expected proto 1, id7, panel:1920x720. Do not force a mismatch. |
| No compatible hello | Unsupported unit or unexpected response order; no drawing attempted. |
| Invalid/oversized response | Malformed response rejected; check installed renderer version. |
| Protocol ready | Handshake only, not proof of first render. |

JSON events go to stdout. Logging false suppresses events, but completion/error
still prints. Ctrl+C or SIGTERM closes the connection. There is no app service
to disable or layer to clean up.
