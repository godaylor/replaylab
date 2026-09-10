# ReplayLab transformation plan

Status: **Local technical verification GREEN after emergency journal recovery (2026-09-08); public release pending external/manual gates. The failed preflight below is historical, not an active durability regression.**  
Baseline: AFFiNE `canary`, commit `329839e467d936f90230fb02a8983f8eb4b62fc0`, version `0.27.0`  
Expected delivery window after explicit implementation approval: **9–12 focused weeks**

## 1. Goal

Build one production-quality vertical product: a local-first collaborative basketball play animator where a coach can position ten players and a ball, author 2–12 phases, draw actions, attach rich cues, play the result, edit offline, reconnect, resolve meaningful conflicts, and undo only their own changes.

The goal is not to fork or reskin AFFiNE. ReplayLab reuses a reviewed BlockSuite kernel and builds a new domain model, interaction model, UI, network protocol, accessibility layer, and brand around it.

## 2. Hard scope boundary

### Included in v1

- one basketball half-court play per document;
- exactly five offense players, five defense players, and one derived ball entity;
- 2–12 ordered phases;
- player pose editing plus cut, dribble, pass, and screen actions;
- rich-text cue per phase;
- selection, multi-selection where useful, drag, keyboard movement, timeline reorder, history and per-user undo/redo;
- deterministic playback and presenter/follow mode;
- IndexedDB persistence, cold offline launch, reconnect and multi-tab coordination;
- realtime document sync and ephemeral awareness through a product-owned protocol;
- visible semantic conflict resolution for critical concurrent edits;
- accessible DOM companion for the canvas;
- desktop full authoring; tablet playback/actor reposition/cue editing; mobile playback/scrub/semantic review/cue reading;
- measured rendering, bundle, accessibility, migration, and convergence gates.

### Explicitly excluded from v1

- generic documents, arbitrary whiteboards, databases, task management, calendars, wiki/workspace hierarchy;
- rosters, seasons, statistics, video analysis, computer vision, AI generation, physics simulation, play marketplace;
- full-court and other sports;
- freeform plugin platform or user-authored block types;
- native, Electron, and mobile apps;
- AFFiNE backend, native bindings, GraphQL/realtime protocol, branding, icons, assets, cloud accounts, billing, AI, and enterprise modules;
- full mobile authoring;
- compatibility with arbitrary AFFiNE workspaces.

Any proposal that enlarges one of these boundaries requires a written change to `TRANSFORMATION_SPEC.md`, a revised estimate, and explicit approval before code is changed.

## 3. Intended package boundaries

These paths remain the later-slice target. Slices 0–1B pragmatically remain in the isolated `packages/replaylab/foundation` package; the package split is deferred until a later slice consumes it and may not broaden the dependency boundary.

```text
packages/replaylab/domain        commands, migrations, conflict projection
packages/replaylab/schema        portable structure/caps validator
packages/replaylab/editor        BlockSuite facade, cue block, Gfx projection
packages/replaylab/web           React shell, routes, design system, service worker
packages/replaylab/sync-protocol original envelopes, capabilities, versions
packages/replaylab/sync-client   network DocSource and awareness source
packages/replaylab/sync-server   independent protocol, ACL, persistence
packages/replaylab/test-kit      fixtures, replica simulator, performance scenes
```

Product features import BlockSuite only through the narrow editor and sync facades. The dependency allowlist and denylist in `docs/LICENSE_BOUNDARIES.md` are release gates, not suggestions.

## 4. Delivery principles

Each slice must leave a demonstrable, tested product increment. Infrastructure may be introduced only when the same slice consumes it. A slice is not complete because its files exist; it is complete when its user flow, recovery behavior, accessibility path, and automated evidence pass.

- Preserve one canonical `Y.Doc`; do not mirror collaborative state into a second store.
- Keep playhead, interpolation, hover, open panels, and other ephemeral UI state out of the CRDT.
- Use typed domain commands as the only mutation boundary.
- Validate fallible drafts before a non-throwing Yjs transaction; one transaction is one observer/history unit, not rollback.
- Use one local-origin undo history spanning cue blocks and the `replay` root.
- Store canonical domain data; treat Gfx elements and React views as projections.
- Keep IndexedDB authoritative for local progress. Network sync is a shadow, not a save button.
- Make semantic conflicts visible for critical values instead of relying on last-writer-wins UX.
- Build the accessible companion alongside each canvas interaction, not as final remediation.
- Measure the maximum supported scene from the first rendering slice.

## 5. Vertical slices

### Slice 0 — prove the foundation or stop

Timebox: **3–5 working days**

User-visible proof:

- a seeded two-phase play opens from IndexedDB;
- moving one actor and editing one cue participate in the same local undo/redo history;
- reload restores both changes;
- a minimal custom ReplayLab Gfx projection renders without importing the AFFiNE application shell.

Implementation boundary:

- establish provenance allowlist/denylist checks before adding product dependencies;
- create only the minimal package skeleton needed by this proof;
- compose explicit BlockSuite framework/affine extensions through `ReplayLabEditorFacade`;
- admit no provisional `blocksuite/affine/**` package until its exact direct/transitive closure, notices, patches and emitted presence have an explicit boundary decision;
- add the `replay` root with a pose candidate register to one `Y.Doc` and a unified, local-origin `UndoManager`;
- use `@blocksuite/sync` abstractions for IndexedDB; do not use `@affine/nbstore`;
- record the actual transitive package and production bundle closure.

Required evidence:

- schema round-trip test;
- undo test proving local cue and actor mutations reverse in order;
- exception-path test proving a rejected/throwing draft leaves the next command and history correct, with an explicit pin/patch/avoid decision for the audited `withoutTransact` path;
- reload persistence test;
- dependency/provenance report;
- production bundle measurement;
- compatibility test pinning every non-public Gfx assumption.

Exit gate:

- proceed only if unified undo and custom projection work through supported or narrowly isolated extension points in five days;
- if that fails, stop ReplayLab implementation and evaluate the documented **Incident Replay** fallback;
- if total critical JS required before the play is editable cannot approach the provisional 1.5 MB gzip target, timebox one dependency-pruning attempt, then stop instead of rebuilding BlockSuite.

#### Slice 0 actual evidence — 2026-08-28

Verdict: **GO**. Implementation is limited to `packages/replaylab/foundation`; Slice 1A has not started.

- `node .yarn/releases/yarn-4.18.0.cjs workspaces focus @replaylab/foundation-proof` completed using Yarn 4.18.0 from the repository. No global toolchain setting or arbitrary dependency upgrade was made. Yarn retains the existing upstream warning that `@blocksuite/sync` does not declare the `yjs` peer requested by `y-protocols`; ReplayLab declares `yjs` directly and the audited root resolution supplies the patched runtime.
- `typecheck` passes with the repo-local TypeScript 6 alias. Package scripts call the root repo-local binaries explicitly because focused Yarn did not expose `tsc` on the workspace script PATH.
- Four focused production-browser logic tests pass: two-phase schema/update round-trip, mixed actor/cue local-origin undo/redo ordering, rejected draft before transaction with usable subsequent history, and custom local Gfx projection/index/hit/paint compatibility.
- The production-preview E2E passes: the initial two-phase/ten-actor play is seeded and saved, actor and cue edits undo/redo in order, and a reload reports IndexedDB as the source while restoring both edits.
- `build` passes. Critical JavaScript is 393,858 raw bytes and 116,997 gzip bytes across two chunks, below the provisional 1,500,000-byte gzip gate. Exact module closure is emitted as `dist/bundle-closure.json` and summarized in repository evidence.
- `audit` passes. It classifies 7 direct dependencies, 74 direct/transitive runtime package instances, and 27 emitted packages; finds zero denied AFFiNE/backend/native/enterprise/protocol paths or imports; preserves three known inline provenance markers; and confirms the installed Yjs 13.6.21 uint53 patch.
- The audited `Store.withoutTransact` exception-safety path is explicitly **avoided**. Fallible command drafts validate before `Store.transact`; the exception-path test proves a rejected draft creates no history and does not poison the next command.
- Gfx is product-projected through `ReplayLabGfxAdapter` using public `SurfaceBlockModel`, `GfxLocalElementModel`, bounds and local-element APIs. The only narrowly isolated compatibility assumption is that the base `includesPoint` implementation does not dereference its `EditorHost` parameter when testing a local element; the browser compatibility test pins the projection count, surface membership, hit result and painted canvas without loading an AFFiNE shell.
- Machine-readable closure, licenses, notice hashes, inline provenance, patch state and boundary decisions are in `packages/replaylab/foundation/evidence/slice0-audit.json`; the concise human report is `slice0-audit.md`.

Forced deviation: Node-mode Vitest cannot execute the browser-oriented public `@blocksuite/std/gfx` source closure in this checkout and fails during module evaluation. The same `@blocksuite/std` package uses a browser runner upstream, so Slice 0 logic tests run through repo-local Playwright against the production build and system Chrome. No browser download or global installation was performed.

### Slice 1A — author and reload one local formation

Estimate: **0.75–1 week**

User-visible increment:

- create/open one play, see exactly ten players and the derived ball on a half-court;
- add a second phase;
- select and move a player by pointer or keyboard;
- reload through an available app shell without losing work;
- inspect and operate the same players through an accessible lineup/tree.

Implementation boundary:

- versioned v1 schema and migrations entry point;
- full snapshots of ten player poses plus possession/loose-ball pose, capped at 12 phases;
- player pose, loose-ball pose and possession use their final candidate-register representation before realtime exists;
- frame order is `(fractionalRank, immutableFrameId)`;
- typed create/set-pose/add-phase commands with invariants and non-throwing transaction callbacks;
- React route shell with deliberate loading, empty, storage-error and export states;
- Gfx projection, hit testing, grid/layer use, dirty rendering and viewport culling;
- keyboard focus model, roving tabindex, arrow movement, visible focus and announcements;
- IndexedDB persistence; its internal document BroadcastChannel handles cross-tab document updates;
- pin the separate render profile, recovery network profile, and maximum fixture used by all later gates.

Required evidence:

- domain property tests for caps, IDs, bounds, derived-ball rules and total phase ordering;
- rename, player-pose and loose-ball-pose command/undo tests;
- candidate-register, command and migration tests;
- pointer/keyboard parity tests;
- Playwright author → reload with available shell → second-tab convergence flow;
- axe scan plus manual screen-reader smoke test;
- 30-second maximum-fixture frame-time trace on the render profile.

Exit gate:

- no lost edits across reload or two-tab use;
- every pointer-only pose operation has a keyboard path;
- seeded play opens under the specified local-load budget on the render profile.

#### Slice 1A actual evidence — 2026-08-28

Verdict: **GREEN**. The production route now supports one complete local formation authoring flow and satisfies the Slice 1A exit gate.

- The v1 replay root keeps exactly ten actor poses per frame, a derived ball, 2–12 frames ordered by (fractionalRank, immutableFrameId), and pose/possession/loose-ball candidate registers without a hidden active-candidate pointer.
- Typed commands validate fallible drafts before transaction entry. Unified local-origin history covers title, cue, player pose, possession and loose-ball edits; remote candidates survive local undo. The Slice 0 migration preserves a recoverable legacy artifact before one non-throwing system transaction.
- Nine domain/history/Gfx tests pass, including caps, IDs, bounds, derived ball, candidate convergence/resolution, deterministic idempotent migration, rejected drafts, remote-origin preservation and the 10-player-plus-ball projection.
- Five production-browser tests pass for pointer/keyboard parity, author → reload persistence, IndexedDB BroadcastChannel two-tab convergence, storage-error/export behavior, roving focus, live announcements and the semantic 10-player-plus-ball companion.
- Axe reports zero serious or critical violations. The captured accessibility tree includes the complete lineup, possession control, phase list and polite move announcement; evidence/slice1a-accessibility.json and slice1a-ui.png preserve the result.
- The pinned Playwright 1.58.2 Chromium 145 trace uses a 1440×900 viewport, DPR 1, a 5-second warm-up and a 30-second 12-phase fixture: 60.00 FPS, 17.5 ms pointer-to-paint p95, 22.3 ms local open, zero long tasks and zero React renders during pointermove.
- Production critical JavaScript is 617,373 raw bytes and 187,430 gzip bytes. The Slice 1 audit records 77 runtime package instances, 31 emitted packages, zero forbidden modules, zero forbidden source markers and zero AFFiNE protocol markers.

Recorded environment limitations: the automated trace ran on the documented local Windows runner (16 logical CPUs/32 GB), not the canonical dedicated 4-vCPU/8-GB CI worker, so that CI replay remains outstanding. Windows Computer Use failed twice at sandbox initialization, so Narrator audio was not captured; keyboard, axe and the browser accessibility tree passed and the missing audio smoke is explicitly marked NOT RUN in evidence.

### Slice 1B — cold-offline app shell

Estimate: **0.5 week**

User-visible increment:

- after one successful visit, close the browser, disconnect the network, reopen the URL, move a player, reload, and keep working;
- see honest local-ready/offline state rather than a save button or indefinite network spinner.

Implementation boundary:

- minimal versioned service worker for the product shell and seeded demo;
- persisted-storage request/denial UX;
- clear separation between shell readiness, IndexedDB readiness and network status;
- no migration rollback, quota cleanup or stale-client recovery yet; those remain Slice 6.

Required evidence:

- Playwright cold browser restart while offline;
- service-worker install/activate smoke test;
- offline author → reload → local undo flow;
- failure state when neither a cached shell nor recoverable document exists.

Exit gate:

- the complete currently implemented local formation flow launches cold offline after one visit;
- service-worker failure never blocks an online load or misreports durability.

#### Slice 1B actual evidence — 2026-08-28

Verdict: **GREEN**. The complete Slice 1A formation flow launches cold offline after one successful visit, remains editable, and survives another offline reload.

- The versioned replaylab-shell-v1 service worker pre-caches the production index and hashed critical assets, claims clients, serves the app shell for offline navigations, and removes only older ReplayLab shell caches.
- The status rail reports shell readiness, IndexedDB save readiness, browser storage-retention state and network state separately. A denied persistent-storage request leaves authoring available and explicitly recommends export; there is no save button or false network-synced state.
- Five pinned-Chromium tests pass: install/activate/cache smoke, persisted-storage denial, registration failure with an unaffected online load, cold persistent-browser restart offline with edit → undo → edit → reload, and a 503 recovery page when an active worker has neither shell cache nor a previously opened document URL.
- The cold test closes the first Chromium context, relaunches the same short persistent profile with networking disabled, confirms IndexedDB as the source, edits and undoes locally, edits again, reloads offline and observes the durable pose. Machine-readable evidence is in packages/replaylab/foundation/evidence/slice1b-offline.json.
- The final combined verify command passes all 20 checks: 9 domain/history/Gfx, 5 authoring/browser/accessibility, 1 performance trace and 5 offline/service-worker scenarios. Boundary audit remains PASS with zero forbidden roots/imports/protocol markers.

Scoped limitations remain intentional: persistent storage can be denied by the browser; quota cleanup, migration rollback and stale-client recovery remain Slice 6. Network sync is not configured yet and the UI says Local only rather than Synced. The current worker carries one shell version; multi-version stale-client handling is also deferred to the documented recovery slice.

### Slice 2A — tactical actions, rich cues, and unified history

Estimate: **0.75–1 week**

User-visible increment:

- draw a cut, pass, dribble, or screen between adjacent phases;
- write a formatted paragraph/list cue for a phase;
- undo/redo mixed canvas and cue edits predictably.

Implementation boundary:

- adjacent-transition action schema and validation;
- action path uses its final candidate-register representation before realtime exists;
- product-owned Gfx tools and previews behind `ReplayLabGfxAdapter`;
- narrow rich cue composition with paragraph/list and inline formatting/link, not the generic AFFiNE document UI;
- transaction boundaries at intent level; pointermove and playback never create history spam;
- deterministic selection snapshot restoration;
- keyboard position/action dialog as the equivalent of path drawing.

Required evidence:

- action/candidate validation and projection tests;
- IME/composition and non-US-layout tests for cue editing/shortcuts;
- gesture cancel, Escape, keyboard action dialog and mixed cue/court undo tests;
- history test proving a gesture is one unit and a remote-origin mutation is preserved;
- reduced-motion interaction snapshots.

Exit gate:

- actions and cues can be authored without a mouse;
- undoing a local gesture cannot reverse an unrelated remote-origin update in the replica simulator.

#### Slice 2A actual evidence — 2026-08-28

Verdict: **GREEN / GO for Slice 2B**.

- `cut`, `pass`, `dribble`, and `screen` are adjacent-transition commands. Paths use the final observed-set candidate register; product entities remain independent of Gfx local elements and no pointermove mutates Yjs.
- Pointer drawing, `Escape`/pointer-cancel, keyboard action dialog, semantic action rows, path-conflict projection, and deterministic focus/selection restoration pass the Slice 2A browser gate. One undo removes one completed gesture; cancelled gestures create no action.
- Rich cues round-trip paragraph, bullet, and numbered blocks with bold/italic/underline/link runs. Native form controls provide mouse-free authoring; IME composition suspends global shortcuts, and Cyrillic input is preserved.
- Mixed court/cue history uses the same local-origin UndoManager. The observed-set replica test proves local path undo removes the local candidate while preserving both the unrelated remote candidate and the restored previously observed candidate.
- Typecheck and production build pass. The production closure contains 828 transformed modules; JavaScript is 638,651 raw bytes / 193,364 gzip bytes, below the 1,500,000-byte gate.
- Targeted Slice 2A logic/history tests pass (3), targeted pointer/keyboard/IME/axe/reduced-motion tests pass (3), and prior domain/history/Gfx (9) plus authoring/browser/accessibility (5) regressions remain GREEN.
- The 30-second maximum fixture renders 12 phases and 30 visible action paths at 60.00 fps with 17.60 ms input-to-paint p95, 0 long tasks, 0 React renders during pointermove, and 41.60 ms local open. Evidence: `packages/replaylab/foundation/evidence/slice2a-performance.json`.
- Axe reports zero serious/critical violations under `prefers-reduced-motion: reduce`; semantic action/cue accessibility evidence is in `packages/replaylab/foundation/evidence/slice2a-accessibility.json`.
- Boundary audit is PASS across 77 dependency instances and 31 emitted packages, with zero forbidden modules/imports/protocol markers. Evidence: `packages/replaylab/foundation/evidence/slice2a-audit.json` and `slice2a-audit.md`.

### Slice 2B — reorderable phase timeline

Estimate: **0.5 week**

User-visible increment:

- reorder phases through pointer drag or keyboard lift/move/drop/cancel;
- hear/see before/after target and resulting phase position;
- undo one reorder without losing actions or cues.

Implementation boundary:

- deterministic fractional rank with immutable-ID tie-break, not another MV register;
- DnD preview stays local and commits one rank command on drop;
- adjacency validation badges preserve invalidated actions for explicit repair;
- focused timeline context owns `Space` only while keyboard DnD is active.

Required evidence:

- concurrent equal-rank total-order property test;
- pointer/keyboard reorder parity, cancel and focus-restoration E2E;
- action-adjacency repair badge and one-unit undo tests.

Exit gate:

- timeline reordering is keyboard-complete and deterministic on every replica;
- no reorder silently deletes or retargets an action.

#### Slice 2B actual evidence — 2026-08-28

Verdict: **GREEN / READY FOR SLICE 3**.

- Reorder changes exactly one phase `rank` through a typed façade command. Preview order, lifted state, pointer position and keyboard DnD context remain local; equal ranks project by immutable phase ID on every replica.
- Pointer drag and keyboard `Space` lift, Arrow move, `Space`/Enter drop, and `Escape` cancel reach the same final order. Tests verify before/after/position announcements and restore focus to the immutable moved phase after drop or cancel.
- Adjacency is derived after ordering. A broken transition renders `Needs adjacency repair`; the action remains present with the same ID, actor, target and candidate-register path. No reorder deletes, archives, or retargets an action.
- One undo restores the prior phase order and valid action adjacency while preserving every cue and action payload. Selection restoration returns focus to the timeline phase.
- Slice 2B property/command tests pass (3) and pointer/keyboard/focus/announcement E2E pass (2). The existing semantic companion axe check also passes with zero serious/critical violations after the timeline changes.
- Typecheck and production build pass (828 transformed modules). Production JavaScript is 642,256 raw bytes / 194,407 gzip bytes, below the 1,500,000-byte gate.
- Boundary audit is PASS across 77 dependency instances and 31 emitted packages, with zero forbidden modules/imports/protocol markers. Evidence: `packages/replaylab/foundation/evidence/slice2b-audit.json` and `slice2b-audit.md`.
- The Slice 2A maximum Gfx trace and Slice 1B offline suite were not repeated: 2B changes only local timeline preview/rank projection and does not change Gfx, persistence, service worker, or transport code.

### Slice 3 — playback, presentation, and rendering budget

Estimate: **1 week**

User-visible increment:

- play, pause, scrub, step, and present a complete tactic;
- use a reduced-motion mode with discrete phase stepping.

Implementation boundary:

- deterministic interpolation derived from adjacent canonical frames;
- local playhead and presentation state, never persisted as document content;
- requestAnimationFrame scheduler with dirty-layer invalidation;
- pause work when hidden, offscreen, or stationary;
- presenter controls, shortcuts, focus restoration, and readable overlays.

Required evidence:

- deterministic interpolation fixtures;
- no-CRDT-write playback test;
- maximum-scene performance trace and memory soak;
- hidden-tab throttling test;
- reduced-motion and high-contrast visual checks.

Exit gate:

- editor interaction remains at or above the specified 55 FPS reference target for the maximum scene;
- playback performs zero collaborative writes.

#### Slice 3 implementation evidence (2026-08-28)

Verdict: **GREEN / READY FOR SLICE 4**.

- Deterministic interpolation, play/pause/scrub/step, visibility/offscreen scheduling, presentation keyboard/focus restoration, and reduced-motion phase stepping pass in 5 focused Playwright tests.
- The no-CRDT-write test observes the canonical `Y.Doc` throughout playback and records zero updates; playhead, presentation, interpolation, and renderability remain local derived state.
- The 12-phase maximum fixture (10 actors, derived ball, 30 visible actions) sustains 60.00 FPS with a 16.70 ms p95 frame interval, zero long tasks, zero React renders during playback, and zero measured heap growth over the 30-second trace/soak. Evidence: `packages/replaylab/foundation/evidence/slice3-performance.json`.
- Reduced-motion and forced-colors checks pass; automated axe reports zero serious/critical violations for the introduced controls. Evidence: `packages/replaylab/foundation/evidence/slice3-accessibility.json` and `slice3-high-contrast.png`.
- Typecheck and production build pass (831 transformed modules). Production JavaScript is 651,175 raw bytes / 196,916 gzip bytes, below the 1,500,000-byte gate.
- Boundary audit is PASS across 77 dependency instances and 31 emitted packages, with zero forbidden modules/imports/protocol markers. Evidence: `packages/replaylab/foundation/evidence/slice3-audit.json` and `slice3-audit.md`.
- Already-GREEN Slice 0–2B checks were not repeated; the Slice 3 verification set is scoped to the new playback, presentation, rendering, accessibility, bundle, and boundary behavior.

### Slice 4 — semantic pose, possession, and path conflicts

Estimate: **0.5–0.75 week**

User-visible increment:

- conflicting replica-simulator edits to the same player/loose-ball pose, possession or action path appear as a small court/timeline marker;
- compare live candidates and choose or derive a result by pointer or keyboard;
- undo a local resolution as one command while preserving unseen candidates.

Implementation boundary:

- reuse the candidate-register representation already shipped in Slices 1A/2A;
- candidate set has no hidden LWW `resolvedCandidateId`;
- resolution removes only observed candidates and adds one immutable candidate, so concurrent resolutions remain visible;
- deterministic display winner, ghost pose/path layers and possession alternatives;
- unresolved candidates are never erased by automatic compaction;
- rank/adjacency and archive/edit remain validation/repair badges, not MV scope.

Required evidence:

- arbitrary-order replica conflict creation/resolution property tests;
- concurrent resolution and undo tests;
- simulated partition with same-pose alternatives;
- conflict keyboard, focus, announcement, contrast and reduced-motion review.

Exit gate:

- no future transport can expose critical concurrency only as a silent deterministic winner;
- every unresolved candidate remains inspectable until an explicit observed-set resolution.


#### Slice 4 implementation evidence (2026-08-28)

Verdict: **GREEN / READY FOR SLICE 5A**.

- Arbitrary-order replica tests create deterministic, inspectable pose, possession, loose-ball pose, and action-path candidate sets; all four converge with two live candidates and no hidden `resolvedCandidateId`/`activeCandidateId` pointer.
- For every MV register kind, focused tests cover simulated partition, observed-set resolution, an unseen concurrent candidate, one local undo, and two concurrent resolutions. Unseen candidates survive; undo restores observed candidates; concurrent resolutions remain visible instead of collapsing through silent LWW.
- Court ghosts, action/lineup badges, timeline counts, and the semantic conflict companion expose the same candidates. Candidate selection and derived pose/path averages work by pointer and keyboard as one undoable command.
- Focus restoration and polite announcements pass for resolution and undo. Reduced-motion and forced-colors checks pass; scoped axe reports zero serious/critical violations. Evidence: `packages/replaylab/foundation/evidence/slice4-accessibility.json` and `slice4-high-contrast.png`.
- Typecheck and production build pass (835 transformed modules). Production JavaScript is 658,082 raw bytes / 198,616 gzip bytes, below the 1,500,000-byte gate.
- Boundary audit is PASS across 77 dependency instances and 31 emitted packages, with zero forbidden modules/imports/protocol markers. Evidence: `packages/replaylab/foundation/evidence/slice4-audit.json` and `slice4-audit.md`.
- Already-GREEN Slice 0–3 checks were not repeated; verification was scoped to the new semantic conflict model, UI, accessibility, build, and boundary behavior.
### Slice 5A — capability room and two online clients

Estimate: **0.75–1 week**

User-visible increment:

- open one capability URL in two browsers and see committed pose/cue changes arrive both ways;
- open a read capability and review the play without accumulating local unsyncable edits.

Implementation boundary:

- original `sync-protocol` package written from generic Yjs contracts, not denied AFFiNE protocol sources;
- `ReplayNetworkDocSource` implementing the generic `DocSource` contract;
- separate read/write capability tokens, room authorization, WebSocket fanout, update log and snapshot;
- state-vector pull, idempotent update push and duplicate safety;
- typed retryable versus terminal protocol errors;
- pre-ACK payload caps plus isolated-clone structural validation on the server;
- read capability configures both transport and local Store/command bus as read-only;
- structured logs without document content.

Required evidence:

- two-replica online convergence and duplicate/reorder tests;
- browser E2E for bidirectional pose + cue editing;
- read/write authorization and local read-only E2E;
- malformed, oversized, structurally invalid and rate-limited update tests;
- terminal auth/schema/oversize stops only the shadow, does not repeat push or report `Synced`, and preserves IndexedDB/export; rate-limit honors `Retry-After`;
- forbidden protocol marker/provenance scan.

Exit gate:

- two clients converge without a save action;
- the server never ACKs/fans out an update that violates versioned schema/caps;
- no denied protocol source, handler, endpoint, event or envelope enters the graph.


#### Slice 5A implementation evidence (2026-08-28)

Verdict: **GREEN / READY FOR SLICE 5B**.

- ReplayLab owns a versioned JSON/WebSocket protocol built from generic Yjs state-vector/update contracts. Read/write tokens are separate, stored only as server-side hashes, and capability URLs keep the token in the fragment rather than the HTTP query.
- `IndexedDBDocSource` remains the `DocEngine` main source; `ReplayNetworkDocSource` is a shadow. The server authenticates every session and applies byte caps, rate limits, and versioned ReplayLab structural validation on an isolated clone before canonical apply, ACK, or fanout.
- Focused room tests pass for duplicate idempotency, reordered delivery convergence, read authorization, malformed bytes, oversize, structural schema failure, invalid capability, and rate limiting. Rejected updates leave the canonical room unchanged. Evidence: `packages/replaylab/foundation/evidence/slice5a-security.json`.
- Actual WebSocket E2E passes across three independent browser contexts: two write clients synchronize committed pose and rich cue edits bidirectionally with no save action; a third read client receives the play while Store and command mutations remain read-only and sends zero commits. Scoped status-rail axe reports zero serious/critical violations. Evidence: `packages/replaylab/foundation/evidence/slice5a-sync.json`.
- Retryable rate-limit handling waits for server `Retry-After` (113.1 ms measured) and returns to `synced`. Terminal oversize/schema/auth shadows remain `blocked`, do not repeat network pushes, never report `Synced`, and preserve the IndexedDB-backed facade/export. Evidence: `packages/replaylab/foundation/evidence/slice5a-terminal.json`.
- Typecheck and production build pass (838 transformed modules). Production JavaScript is 665,650 raw bytes / 200,852 gzip bytes, below the 1,500,000-byte gate.
- Boundary/protocol audit is PASS across 78 dependency instances and 31 emitted packages, with zero forbidden modules/imports/protocol markers. The only new direct server dependency is installed MIT `ws`; it is not emitted in the browser bundle. Evidence: `packages/replaylab/foundation/evidence/slice5a-audit.json` and `slice5a-audit.md`.
- Already-GREEN Slice 0–4 suites were not repeated; verification was scoped to the new sync protocol, network shadow, capability/read-only behavior, server validation, two-client flow, build, and boundary graph.
### Slice 5B — partitions, presence, presenter follow, and per-user undo

Estimate: **0.75–1 week**

User-visible increment:

- see expiring selections/pointers and optionally follow a presenter;
- edit while offline, reconnect, and converge;
- undo a local post-reconnect gesture without reversing collaborator work.

Implementation boundary:

- awareness on a separate bounded/expiring channel;
- late-tab awareness collection handshake;
- throttled gesture ghosts and presenter playhead; follow can always be exited locally;
- browser `online` triggers immediate sync-facade restart, followed by jittered backoff;
- only retryable failures enter that restart/backoff path; terminal shadows remain stopped until explicit recovery;
- state-vector reconciliation after partition and idempotent replay;
- no awareness or playback state enters document history.

Required evidence:

- three replicas, 500 mixed commands, duplicated/reordered delivery and a five-minute partition;
- browser E2E: online → offline same-pose edits → concurrent online edit → reconnect;
- per-user undo test across replicas;
- awareness expiry, disconnect and late-opening-tab collection tests;
- presenter follow/exit and reduced-motion tests.

Exit gate:

- replicas converge within three seconds on the recovery network profile using the explicit immediate-online restart; if the audited fixed five-second retry remains, publish/test an honest eight-second gate instead;
- local undo preserves collaborator work;
- ephemeral presence never changes history or survives expiry.

#### Slice 5B implementation evidence (2026-09-03)

Verdict: **GREEN / READY FOR SLICE 6**.

- The document shadow now owns an explicit browser-`online` recovery path: it reconnects immediately, pulls by current state vector, applies the missing remote update, pushes only the local diff, and enters bounded jittered backoff only for retryable failure. Terminal shadows remain blocked. In the browser recovery profile, offline/concurrent same-pose edits converged in **27 ms** against the **3,000 ms** gate; the measured immediate recovery itself took **10.5 ms**. IndexedDB remained the main source. Evidence: `packages/replaylab/foundation/evidence/slice5b-partition.json`.
- A separate authenticated awareness WebSocket session carries only bounded ephemeral selection, pointer/gesture ghost, presenter and follow-intent payloads. Pointer/gesture publication is capped at 20 Hz and presenter publication at 10 Hz; server TTL expiry and disconnect both fan out removal, while an explicit collection handshake hydrates a late-opening tab. Oversized awareness is rejected before retention.
- Multi-context E2E passes for late-tab collection, disconnect removal, **1,200 ms** expiry, presenter follow, always-local Escape exit, and reduced-motion phase stepping. Awareness left encoded Y.Doc bytes and undo history unchanged; scoped axe found zero serious/critical violations. Evidence: `packages/replaylab/foundation/evidence/slice5b-awareness.json`.
- The deterministic replica profile executes **500 mixed commands** across three clients during a logical **300,000 ms** partition, then delivers **500 original / 572 duplicated-and-reordered** updates. All replicas converge, and a local post-reconnect undo restores its gesture while preserving the collaborator's pose register. Evidence: `packages/replaylab/foundation/evidence/slice5b-replica.json`.
- The maximum fixture (12 phases, 10 actors, 30 actions) sustained **60.36 FPS**, **16.7 ms p95**, zero React renders during transient presence, and 45 throttled presence publications over the three-second trace. Evidence: `packages/replaylab/foundation/evidence/slice5b-performance.json`.
- Focused verification passed: TypeScript no-emit typecheck; `slice5b.pw.spec.ts` (2 tests); `slice5b.e2e.spec.ts` partition/undo and awareness/follow checks (2 tests); and the separate max-fixture presence performance check (1 test). The first browser attempt correctly exposed that `vite preview` was serving the previous dist; after the required production build, the exact Slice 5B rerun passed. No external process or port was stopped.
- Production build passes (841 transformed modules). JavaScript is **676,280 raw / 203,676 gzip bytes**, below the 1,500,000-byte gate. ReplayLab alone used fixed preview/sync ports **4174 / 42175**, verified free before the run.
- Boundary/protocol audit is PASS across 78 dependency instances and 31 emitted packages, with zero forbidden modules, product markers, or AFFiNE protocol markers. Evidence: `packages/replaylab/foundation/evidence/slice5b-audit.json` and `slice5b-audit.md`.
- Already-GREEN Slice 0–5A suites were not repeated. Verification was limited to code changed for partition recovery, awareness/presenter behavior, maximum-scene rendering impact, build closure, and provenance.

### Slice 6 — migration, quota, and offline recovery

Estimate: **0.75–1 week**

User-visible increment:

- recover or export a last-valid play after corruption, quota failure or interrupted migration;
- continue to launch cold offline across an app-shell upgrade;
- understand local/sync health without exposing document content to telemetry.

Implementation boundary:

- immutable versioned `RecoveryStore` snapshots with checksum before migration and at bounded checkpoints, never a second mutable source of truth;
- deterministic clone-first migration, validate/open-before-switch and previous-database retention;
- service-worker upgrade/version-skew handling layered on Slice 1B;
- bounded page-lifecycle flush, persisted-storage UX, quota/corruption states and portable JSON recovery export;
- privacy-safe local/sync/storage diagnostics.

Required evidence:

- interrupted migration, corrupt main record, quota denial and immutable snapshot restore tests;
- service-worker upgrade/stale-client and cold-offline E2E;
- pagehide/abrupt-close loss-window test;
- recovery export/import and unsupported-future-schema read-only test.

Exit gate:

- a failed migration never destroys the only recoverable local artifact;
- cold offline launch supports the complete v1 local authoring flow after upgrade;
- recovery never silently overwrites the current artifact.

Slice 6 evidence — **GREEN (2026-09-03)**:

- `RecoveryStore` now writes versioned immutable SHA-256-checked Yjs recovery artifacts before a fallible migration and at content-deduplicated bounded checkpoints. Portable `.replaylab-recovery.json` export verifies byte length/checksum; import validates and opens a separately named IndexedDB copy, never overwriting the current artifact. Local IndexedDB remains the mutable source of truth.
- IndexedDB open is clone-first. A migration writes a separately named target, reopens and validates the full ReplayLab structure, then changes the product-owned active-database registry; the prior database is retained. An injected interruption after target write left the original byte-for-byte unchanged and returned the pre-migration artifact; a subsequent clean open migrated successfully. Corrupt-main recovery restored the latest valid checkpoint read-only, quota denial preserved a portable in-memory export, and schema `99` opened an explicit read-only/export route.
- The production service worker advanced to shell `v2` without unconditional `skipWaiting`, retains the immediately previous ReplayLab shell for stale hashed assets, prefers the current cache for new clients, and activates only through normal lifecycle or an explicit product message. Persistent Chromium `145.0.7632.6` retained both `replaylab-shell-v2` and the seeded compatible `v1` cache, then cold-launched offline and completed pose, rich-cue, phase-add and reload-persistence authoring. Evidence: `packages/replaylab/foundation/evidence/slice6-offline-upgrade.json`.
- Focused browser recovery evidence is GREEN: interrupted migration/original retention; corrupt restore; quota denial; checksum rejection; separate-copy export/import; unsupported-future-schema read-only; keyboard recovery export; zero serious/critical axe violations; and bounded pagehide/abrupt-close pose retention. The first cold-offline run exposed only an incorrect fixture expectation (`y 85` vs the seeded defense pose's correct `y 315`); the assertion was corrected and the isolated rerun passed. Evidence: `packages/replaylab/foundation/evidence/slice6-recovery.json`.
- Changed-path regressions passed without repeating unrelated GREEN suites: production IndexedDB edit/reload, two-tab BroadcastChannel convergence, service-worker v2 install/cache smoke, and Slice 5A two-browser bidirectional pose/cue sync with read capability. TypeScript no-emit typecheck and production build pass. The build transforms 842 modules; JavaScript is **688,411 raw / 206,489 gzip bytes**, below the 1,500,000-byte gate. Rendering code did not change, so Slice 3 performance was not rerun.
- Privacy diagnostics expose only format/time, active/previous database identifiers, migration duration and recovery counts/timestamps; browser evidence confirms no title/cue/pose/action/update payload. Boundary audit is PASS across 78 dependency instances and 31 emitted packages with zero forbidden modules, product markers or AFFiNE protocol markers. Evidence: `packages/replaylab/foundation/evidence/slice6-audit.json` and `slice6-audit.md`.
- ReplayLab browser verification used fixed ports **42176** (preview) and **42175** (existing sync regression), checked free before use. No foreign process, container, volume or port was touched. The configured GSD hook path was absent; after one failed invocation this was treated as the allowed non-blocking environment limitation.

### Slice 7 — portfolio release hardening

Estimate: **1–1.5 weeks**

User-visible increment:

- a polished 30–60 second demo starts from a seeded play, proves two-user collaboration, offline continuation, conflict resolution, and local undo;
- desktop full authoring, tablet playback/actor reposition/cue editing, and mobile playback/scrub/semantic review/cue reading are coherent;
- users can export a portable ReplayLab JSON recovery file.

Implementation boundary:

- a cleared final product name/mark/domain and original visual polish without AFFiNE marks/assets; “ReplayLab” remains a working title until that gate passes;
- responsive review surfaces and explicit unsupported-authoring messages;
- onboarding limited to the first successful play edit;
- accessibility, security, observability, migration, dependency, and license passes;
- deterministic demo fixture and failure-tolerant demo script.

Required evidence:

- full critical-path E2E in two browser contexts plus offline transition;
- keyboard-only, screen-reader, zoom/reflow, contrast, reduced-motion, and touch review;
- production bundle and long-task report;
- dependency license inventory, SBOM, source notices, and protocol provenance review;
- backup restore and previous-schema upgrade drills.

Exit gate:

- all Definition of Done checks pass;
- the core value is understandable in a silent 30-second capture and fully demonstrated in 60 seconds;
- no forbidden package or copied protocol appears in the shipping graph.

Slice 7 implementation results — 2026-09-03 (**technical portion GREEN; public release hard gate remains BLOCKED**):

- The owner authorized the ReplayLab name and current mark for a noncommercial public portfolio release. This is not trademark/domain clearance; independent trademark availability, domain selection/availability, and public-domain publication remain explicit release blockers. No deploy or domain publication was performed.
- ReplayLab now defaults safely to Russian and exposes only RU/EN publicly. The selection persists across reloads; an unknown saved locale falls back to Russian. Navigation, controls, forms, help, errors, empty/loading/status/recovery states, document title/description and seeded system metadata are localized; user cue content and technical identifiers remain unchanged.
- Responsive capability gates match the product matrix: desktop retains full authoring; tablet retains playback, actor repositioning and cue editing but blocks path authoring/timeline reorder; mobile retains playback, scrub, semantic lineup/actions and cue reading while authoring is unavailable. First-edit onboarding closes only after a successful document command, and `?demo=1` exposes a deterministic 30/60-second portfolio runbook without mutating canonical state.
- TypeScript no-emit typecheck and production build pass under the official portable Node.js **22.23.2** (SHA-256 `0D0F5E39F9F3D9587BC19F73EAB3C2C9C4903FD02D6DBF9C853DD81B3D95FAD4`) with repository Yarn **4.18.0** and the existing `yarn.lock`. The final build transforms 843 modules; critical JavaScript is **716,835 raw / 215,376 gzip bytes**, below the 1,500,000-byte gate. The package defines no lint script, so no dependency or ad-hoc linter was installed.
- Focused Slice 7 production-route E2E is GREEN (3/3): RU fallback, persisted EN and localized metadata; desktop/tablet/mobile capability gates; mobile reflow; zero serious/critical axe violations; deterministic runbook; and first-edit onboarding. RU/EN screenshots are stored as `packages/replaylab/foundation/evidence/slice7-ru.png` and `slice7-en.png`. Automated screenshot capture passed, but Codex image inspection was blocked by the Windows sandbox `apply deny-read ACLs` error.
- The required maximum-scene long-task revalidation reused only the established render-profile test, not the rest of the GREEN Slice 3 suite: 12 phases, 10 actors, derived ball and 30 actions sustain **60.003 FPS**, **16.7 ms** frame-interval p95, **0 long tasks**, **0 shell React renders** and **0 measured heap growth** across the 30-second trace. Evidence: `packages/replaylab/foundation/evidence/slice7-performance.json`.
- Boundary/license/protocol audit is PASS across 78 dependency instances and 31 emitted packages, with zero forbidden modules, source markers or AFFiNE protocol markers. The exact emitted Excalidraw hit-test variant is proven as `excalidraw/excalidraw@00c6940851b362da0d86f155269ef27a94d234c5`, `src/element/collision.ts` blob `b94e8e7c30f9350c2efa064904c405dd7f99b9c3`. Its BlockSuite/AFFiNE import chain and local type/bounds/rotation adaptations are recorded, the inline credit remains, and the complete Excalidraw MIT notice is present in generated `THIRD_PARTY_NOTICES.md`.
- ReplayLab now resolves official, unmodified Yjs **13.6.21** from npm. The former local uint53 patch file and its lockfile locator are removed; installed code uses upstream `random.uint32` and has no `random.uint53` override. Focused compatibility tests pass **2/2** for legacy uint53-authored update/state-vector interoperability and scoped local undo preserving a concurrent legacy remote operation. Official npm integrity/SHA-1, package `gitHead`, `v13.6.21` tag commit and installed MIT license hash are recorded in `slice7-provenance-compatibility.md` and `slice7-audit.json`.
- The Yjs-sensitive Slice 5B two-context production path was rerun once and passes **1/1**: online → offline local edit → concurrent remote edit → reconnect → convergence within the existing three-second gate → per-user undo preserving collaborator work. Other already-GREEN Slice 5B and Slice 6 checks were reviewed without repetition.
- Generated technical evidence includes `slice7-license-inventory.json`, CycloneDX 1.5 `slice7-sbom.cdx.json`, `slice7-source-notices.json`, `THIRD_PARTY_NOTICES.md`, and `slice7-provenance-compatibility.md`; final provenance report: `slice7-audit.json` / `slice7-audit.md`. The audit reports technical status **GREEN** with no failures.
- Source/public/config/plan scan finds no hard-coded `05-affine-transform`, `05-replaylab`, or `E:\Projects` path. Generated `dist/bundle-closure.json` intentionally records current absolute module paths and must be regenerated after a future folder rename. The open root was not moved; it is technically ready for a separate closed-workspace rename to `05-replaylab`.
- Remaining public-release blockers: independent trademark check; domain selection/availability and publication authorization; recorded manual screen-reader review; and a human-observed silent 30-second capture / full 60-second demo. The Excalidraw provenance and Yjs compatibility technical blockers are closed. Evidence and rationale: `packages/replaylab/foundation/evidence/slice7-release-review.md`.

## 6. Definition of Done for every slice

A slice may be marked complete only when all applicable items are true:

- its user outcome works through the production route, not only Storybook or a harness;
- domain invariants and migration behavior are automated;
- loading, empty, offline, reconnecting, error, and recovery states are deliberate;
- pointer, keyboard, focus, announcements, contrast, zoom, and reduced motion are covered where relevant;
- undo boundaries and remote-origin behavior are tested;
- no canonical collaborative state is duplicated outside the `Y.Doc`;
- performance is measured against the maximum supported fixture;
- direct BlockSuite imports remain inside approved facades;
- dependency and source-provenance checks pass;
- public behavior and architectural decisions are reflected in the docs;
- unrelated AFFiNE files are untouched.

## 7. Release budgets and kill criteria

| Concern | Gate |
|---|---|
| Foundation | Unified cue + replay undo through a narrow integration in ≤ 5 working days |
| Critical JS | Provisional kill target ≤ 1.5 MB gzip for shell + every lazy chunk required before the play is editable |
| Local open | Seeded play usable ≤ 1.5 s after app-shell load on the render profile |
| Rendering | ≥ 55 FPS during maximum supported scene interaction on the render profile |
| Collaboration | On the recovery network profile, convergence ≤ 3 s only with tested immediate-online restart; otherwise publish/test the honest measured gate (expected ≤ 8 s with audited retry) |
| Offline | Cold launch, author, reload, and reconnect all pass without a save action |
| Accessibility | Core authoring is keyboard-complete; canvas has an equivalent semantic companion |
| Portfolio story | Product value legible in 30 s and full proof in 60 s |
| Licensing | Zero forbidden roots/protocol artifacts; SBOM and notices reviewed |

If a gate fails, reduce implementation complexity within the fixed product boundary. Do not compensate by importing the AFFiNE shell, backend, native code, or enterprise modules. Product fallback is allowed only at Slice 0 and only to the already evaluated Incident Replay option.

## 8. Suggested execution order

The slices are deliberately sequential because each closes a distinct high-risk assumption. Within a slice, domain schema/commands, interaction projection, accessibility companion, and tests can be developed in parallel once their shared contract is pinned.

```text
Slice 0 foundation proof
  -> Slice 1A local authoring -> Slice 1B cold-offline shell
  -> Slice 2A actions + rich editing/history -> Slice 2B timeline DnD
  -> Slice 3 playback + performance
  -> Slice 4 semantic conflict UX on replica simulator
  -> Slice 5A online validated room -> Slice 5B partition/presence
  -> Slice 6 recovery/migrations
  -> Slice 7 release hardening
```

Do not start network infrastructure before the local artifact, commands, undo semantics, and persistence are stable. Do not postpone offline launch, semantic accessibility, or provenance work to a final cleanup phase; their user-facing increments are already assigned above.

## 9. Current checkpoint

### 2026-09-08 — historical root repair preflight (superseded below)

The user authorized necessary local implementation and standalone site/collaboration-server preparation. Hosting and domain are deliberately deferred. No commit, push, remote change, public deploy, full Docker stack, or user-data migration was performed.

- [x] Root rename repaired with repository Yarn 4.18.0 `workspaces focus @replaylab/foundation-proof`. Yarn's stale install-state file was retained as `node_modules/.yarn-state.before-root-repair.yml`; five workspace junctions now target the new root. Client/server output was rebuilt; no stale old-root paths remain in emitted output. A literal old folder name in the audit script is a detection rule, not a dependency path.
- [x] Node 22.15.1 typecheck, client build and standalone server build pass. No dependency upgrade or global configuration change was used to repair the links. Official Yjs 13.6.21 and its compatibility evidence remain in place.
- [x] Original ReplayLab HTTP site and capability-authenticated `/sync` share 32400. Tests use 32410–32412; listeners are range-validated and checked before use. The server journal is fsynced before ACK, corruption is retained, and an incomplete tail is backed up before repair. The two-writer/restart/read-only/offline production-route test passes.
- [x] Fixed unapplied rich-cue draft reset on unrelated React renders; local readiness no longer waits for network peers. IndexedDB writes explicitly commit and await transaction completion. No canonical schema or protocol change was introduced.
- [x] RU/EN, responsive capability gates, automated accessibility, cold-offline/recovery, replica convergence, reconnect/local undo and maximum-scene checks were rerun. Corrected half-court linework and RU status wrapping; desktop screenshots were visually inspected. This is not manual assistive-technology approval.
- [x] Boundary/license audit passes: 78 dependency instances, 31 emitted packages, zero forbidden modules; SBOM, inventory and notices regenerated. Current client JS is 717,739 raw / 215,694 gzip bytes. Server emitted closure is also audited.
- [x] Own README, `.github/workflows/replaylab.yml`, standalone runtime/room CLI and `deploy/replaylab/` Docker/Compose configuration prepared. Compose syntax validation passes. No image build or hosted CI run is claimed.
- [ ] **Technical blocker:** `tests/slice6.e2e.spec.ts:238` intermittently reopens x=110 instead of the just-commanded x=115 when the tab is destroyed immediately after ArrowRight. Full runs recorded 64/65; a focused ten-repeat run recorded 7 failures. The test has not been weakened or skipped. `verify:release` additionally requires ten consecutive durability repetitions, and packaging refuses incomplete gates. Latest machine-readable results: `evidence/release-tests.json`, `release-durability.json` when run, and `release-verification.json`.
- [ ] Resolve the immediate-close durability defect, review the storage/recovery architecture if a new emergency journal is needed, and pass the unchanged full suite plus repeat gate. Do not reinterpret local CRDT mutation as confirmed durable storage. No new recovery format has been silently added.
- [ ] Produce and smoke-test the isolated `release-dist` only after those gates pass; then validate the optional container image and hosted CI/canonical performance runner. Local performance is not evidence for a different target host.
- [ ] Record manual NVDA/VoiceOver, keyboard/IME/non-US layout, zoom/high-contrast/reduced-motion and supported touch review; record the silent 30-second capture and human-observed 60-second collaboration demo.
- [ ] Independently clear the working name/mark, choose/check hosting and domain, configure HTTPS/WebSocket proxy and persistent backup/restore, run host smoke tests, and explicitly authorize publication.
- [ ] Choose the owner's release repository. Current branch remains `canary`; origin is still `https://github.com/toeverything/AFFiNE.git`. Before enabling Actions in a new remote, disable/restrict inherited upstream workflows. No remote or git history was changed here.

Final machine evidence: full suite 64 passed / 1 failed / 0 skipped; latest isolated durability gate 5 passed / 5 failed / 0 skipped. `release-verification.json` is FAIL; direct `package:release` was also checked and refused the red gate before creating `release-dist`. No TCP/UDP listeners remained in 32400–32499 after the tests.

**ROOT RENAME CHECK: PASS. RELEASE PREFLIGHT: BLOCKED. Slice 7 cannot currently be called technically GREEN because an applicable durability exit gate is failing.** See `docs/RELEASE.md` and the current release review for operator steps. Older dated checkpoints above are historical evidence, not the current release decision.

### 2026-09-08 — authorized emergency journal and local release completion

This checkpoint supersedes the earlier red preflight, without marking unavailable human checks complete.

- [x] Architecture and implementation: additive emergency journal v1, full Yjs snapshots in two checksummed/versioned slots per writer, independent pending title/cue drafts, observed-value draft dismissal, no foreign live-record deletion. Canonical schema/protocol and old recovery-v1 compatibility are unchanged. Contract: `docs/EMERGENCY_JOURNAL.md`.
- [x] Safety before adoption: source backup retained at `tmp/before-emergency-journal-20260908`; existing-play bytes receive an immutable SHA-256 recovery backup before journal adoption. Interrupted adoption preserves the original bytes. Real user browser profiles were not opened or migrated; tests use synthetic isolated profiles.
- [x] Adversarial recovery: renderer crash before IndexedDB ACK; truncated newest slot; future version with valid checksum; backup interruption; two writers' Unicode drafts and remote changes; title crash/Escape; foreign draft races; individually valid snapshots with invalid merged phase count; quota failure without false Saved. All nine new tests pass.
- [x] Exact `verify:release` passes on Windows Node 22.15.1 / repository Yarn 4.18.0: typecheck, client/server builds, **74/74 full tests**, **10/10 unchanged immediate-close repetitions**, audit and guarded release packaging. No test skipped or weakened. Evidence: `packages/replaylab/foundation/evidence/release-verification.json`, `release-tests.json`, `release-durability.json`.
- [x] RU/EN, cold offline, two-context online/offline/reconnect/convergence/local undo, migration recovery, responsive capabilities, axe and maximum-scene performance are included in the full suite. Client JS: **726,329 raw / 218,553 gzip bytes**. Provenance audit: 78 dependency instances, 31 emitted packages, zero forbidden modules; regenerated SBOM, inventories and notices.
- [x] Guarded standalone release package: 942 SHA-256 inventoried files, five audited runtime packages, no development path metadata/sourcemaps or user databases. Node runtime smoke passes health/legal/static denial, two writers, offline conflict/resolve/undo and stopped-server backup restored to a separate directory with a fresh read-only client and offline reload.
- [x] Product-only non-root Docker image built; Docker smoke passes the same route on loopback **32400**, with read-only root filesystem, dropped capabilities and only synthetic data. Reports: `evidence/release-smoke-node.json`, `release-smoke-docker.json`. No full upstream stack, foreign container or global environment settings changed.
- [x] ReplayLab-only GitHub workflow includes verification/package, Compose validation, Node smoke, Docker build and Docker backup/restore smoke, with read-only repository permissions and no deploy step. Hosted execution remains external until the owner selects a repository.
- [x] Isolated Linux execution: **74/74 + 10/10**, typecheck/build/audit/package PASS on Node 22.15.1, Chromium 145, 4-CPU affinity/quota, 8-GiB memory limit, no host ports. Evidence: `evidence/local-ci-linux/`. Linux uses SIGKILL on renderer PIDs obtained from its own test browser's CDP process inventory because Docker/WSL's Page.crash command does not emit the event; the crash assertion and restored-data expectations remain mandatory. Maximum playback: 60.004 FPS, p95 16.8 ms, zero long tasks/React playback renders. This shared local machine is not the dedicated canonical hosted runner.
- [x] Recorded synthetic silent `evidence/demo-capture/final-30s.webm` and complete `final-60s.webm`; the final-image smoke validates the underlying full collaborative route. Image `replaylab:portfolio-20260908` is `sha256:5f301d64cc82d715d922a44b5772799c7f2c182158226c9c3435c822db83bb7c`. Release archive `packages/replaylab/foundation/replaylab-portfolio-20260908.tar.gz` has SHA-256 `914cb4d0edf017fa74dec396b787430bcc97e9793dd79d3b4fd71f152c83406c`. Human evaluation remains open below.
- [ ] External: manual NVDA/VoiceOver and keyboard/IME/non-US layout, zoom/high-contrast/reduced-motion and supported touch review; human judgement of silent 30-second and complete 60-second demo recordings.
- [ ] External: independent name/mark clearance; owner repository and inherited-workflow restriction; hosted CI/canonical dedicated performance runner; hosting/domain/HTTPS/WebSocket setup and host backup/restore/offline smoke; explicit publication authorization.

**ROOT RENAME CHECK: PASS. Local technical verification: GREEN. Public Slice 7 release approval remains pending the explicitly external gates above.** No commit, push, remote change or public deployment was performed.

### 2026-09-09 — FINAL_AUDIT local corrections

- [x] Corrected the stale top-level durability status here and in `docs/ARCHITECTURE.md`; the failed preflight remains explicitly historical. The 2026-09-08 full 74/74 and 10/10 reports were not rerun or relabelled as new results.
- [x] Prepared the permitted standalone source tree with exactly five workspaces, repository Yarn, pruned locked dependencies, required contracts including `FINAL_AUDIT.md`, root/retained nested licenses, provenance and one ReplayLab workflow. `prepare-source.mjs` creates a fresh local export; `verify-source.mjs` checks the inventory. See `docs/SOURCE_STATE.md`. No Git history or upstream authorship was fabricated; actual owner commits/repository selection remain external.
- [x] Isolated source install `--immutable --mode=skip-build`, typecheck, client/server builds and boundary/provenance audit pass. Runtime closure remains 78 instances / 31 emitted packages / zero forbidden modules; JS is 726,328 raw / 218,555 gzip bytes. No dependency upgrade or source-license modification.
- [x] CUA remained unavailable. Project Playwright produced desktop RU/EN and mobile RU/EN full-page PNGs, which Codex visually inspected. Fixed mobile first-edit onboarding to follow `canMoveActors`. Targeted Slice 7 tests: 4/4; existing maximum fixture: 1/1, 60.004 FPS, frame p95 16.8 ms, input-to-paint p95 17.6 ms, no long tasks or React pointermove renders. This is model visual inspection and automation, not human/device accessibility approval.
- [x] New isolated standalone package and Node smoke pass, including two-client/offline/conflict/local undo and separate-directory backup/restore. Existing root `release-dist` contains `.replaylab-data`; guarded repackaging refused replacement and that directory was preserved intact. The fresh package was built in the isolated source export. Docker and the full release suite retain their dated 2026-09-08 evidence; they were not repeated for this narrow correction.
- [ ] External: real owner commits and repository selection, hosted CI/canonical runner, hosting/domain/TLS/WS/host restore, name/mark clearance, human screen-reader/device/IME review, human judgement of the 30/60-second demo and publication authorization. `FINAL_AUDIT.md` is the current remaining-action list.
