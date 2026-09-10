# Portfolio capture inventory — 2026-09-08

Final review media (1440×900, 25 fps, no audio):

- `final-30s.webm`: SHA-256 `ba310b4e661f083e711720c9fa7a42c70b2bade0e17272a6b9d8e9ea7009a294`.
- `final-60s.webm`: SHA-256 `7dfc3206dd9d6f295a46f8af7aa066cbdb88100607b266242022578403e42699`.

Recorded from the final standalone Docker image by `scripts/release-smoke.mjs --docker --capture` in two independent synthetic browser contexts. First 30 seconds: player edit, pass/playback, movement and collaborator cue. Full route adds offline concurrent poses, reconnect, visible candidate review/resolution, local nudge/undo and playback. The server then stops, its synthetic data is backed up and restored into a separate directory, and a fresh read-only/offline client is checked. Machine result: `../release-smoke-docker.json`.

The UI capture contains no browser address bar or capability links. Test content and visuals are product-owned; no user document or external copyrighted media was used. Earlier raw recordings/frames are retained as test evidence, not designated publication media. Trimmed files are copied from the recording without changing the app's rendered content.

Recording and machine checks are complete. A human must still review whether the 30-second value and 60-second collaboration story are understandable. This file does not claim that subjective exit gate or manual assistive-technology review passed.
