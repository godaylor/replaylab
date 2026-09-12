# ReplayLab

**Animated basketball plays, built and edited together.**

ReplayLab helps a coach turn a half-court formation into a phase-by-phase animated
play and explain it with another coach, including when connectivity is unreliable.

- GitHub: https://github.com/godaylor/replaylab
- Live: https://replaylab-godaylor.onrender.com
- Owner repository: standalone source tree; no AFFiNE shell/backend/protocol.
- Working product name: ReplayLab. Independent trademark clearance remains open.

## Original contribution

Product design and RU/EN UI; basketball data model and typed commands; narrow
BlockSuite adapters; canvas court, timeline and deterministic playback; unified
text/court undo; semantic conflict resolution; IndexedDB/emergency recovery;
original capability-authenticated WebSocket server and Supabase persistence;
private room creation, local recent plays, deployment and end-to-end verification.
The retained BlockSuite framework is explicitly third-party, not claimed as original.

## Features

1. Create separate plays and reopen recent local work.
2. Author 2–12 phases with ten players and cut, dribble, pass and screen actions.
3. Add rich coaching cues; undo text and court edits through one local history.
4. Animate, scrub, step and present the play with reduced-motion support.
5. Create private collaborative rooms with separate edit/view invitations.
6. Continue offline, reconnect, review concurrent intentions and preserve remote work on undo.
7. Recover abrupt-close edits and drafts; export/import portable recovery copies.
8. RU/EN, keyboard alternatives, semantic lineup/action views and mobile playback.

## Actual stack and architecture

React 19, TypeScript, Vite 7, Yjs 13.6.21, BlockSuite global/store/std/sync,
Lit, RxJS, y-protocols, fractional-indexing, IndexedDB, BroadcastChannel,
service worker, Node 22, ws, Supabase Postgres/Data API, Docker, Render,
Yarn 4.18, Playwright 1.58.2, axe-core 4.13, Oxlint 1.78, GitHub Actions.

One canonical Y.Doc contains cue blocks and the versioned basketball domain.
The court and animation are derived projections. IndexedDB is authoritative;
the server is a validated network shadow. Hosted snapshots are written to
Supabase before acknowledgement. Presence is ephemeral. The client receives
only private room capabilities, never the database secret.

## Screenshots

- `packages/replaylab/foundation/evidence/home-desktop.png` — entry and recent plays.
- `packages/replaylab/foundation/evidence/slice7-en.png` — complete desktop editor.
- `packages/replaylab/foundation/evidence/slice7-ru.png` — Russian editor.
- `packages/replaylab/foundation/evidence/home-mobile.png` — mobile entry.
- `packages/replaylab/foundation/evidence/slice7-mobile-en.png` — mobile review.

## Provenance and limits

Original ReplayLab product modules plus four reviewed MIT BlockSuite framework
packages. Root composite license, MIT text, embedded notices and attribution are
retained. Generated source inventory, SBOM and dependency-license inventory are
included. Current runtime audit: 78 instances, 31 emitted packages, no forbidden
source/protocol modules. Artwork is original CSS/canvas; fonts are system fonts.

Render Free may take about a minute to wake. One server instance, 32 rooms maximum;
no public room directory, accounts, billing, video export or analytics suite.
Mobile is intentionally review-only. Human screen-reader/device/IME review and
independent name clearance remain open.

## Verification status

2026-09-11 local: typecheck, lint, client/server builds, 77/77 tests,
10/10 abrupt-close repetitions, provenance and packaged Node smoke PASS.
The public URL currently serves the previous deployed revision; this product
completion revision is awaiting publication and production verification.
Do not describe the new browser room flow as production-verified until this
section is updated with the actual deployed result.
