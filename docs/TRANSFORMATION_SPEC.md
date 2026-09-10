# ReplayLab transformation specification

Статус: implemented through Slice 7; public release awaits recorded external/manual gates
Working title: **ReplayLab**  
Product type: collaborative local-first basketball tactics animator

## 1. Product promise

ReplayLab позволяет тренеру превратить расстановку на площадке в проигрываемую комбинацию: поставить игроков, добавить фазу, нарисовать движение или передачу, объяснить intent в rich cue и совместно отредактировать play даже при нестабильной сети.

Это не whiteboard, notes app или team manager. Canonical artifact — **animated play**.

## 2. Primary users and jobs

### Primary persona

Coach or assistant coach preparing and explaining a single play with another coach or player.

### Jobs to be done

- «Хочу быстро показать, кто, куда и когда двигается.»
- «Хочу изменить одну фазу и сразу увидеть весь playback.»
- «Хочу вместе поправить play, не перетирая изменения коллеги.»
- «Хочу открыть play в спортзале при плохой сети.»
- «Хочу объяснить intent текстом, не превращая play в документ.»

### Non-personas

ReplayLab v1 не обслуживает league admins, analysts processing video, roster managers, statisticians or public content marketplaces.

## 3. Core artifact

Один shareable play содержит:

- court preset: только basketball half-court в v1;
- offense: exactly five players;
- defense: exactly five players;
- one ball whose position is derived from possession or a loose-ball pose;
- 2–12 ordered phases;
- per-phase full player poses and possession;
- actions only between adjacent phases: cut, dribble, pass, screen;
- one rich coaching cue per phase;
- optional conflict candidates created by concurrent offline edits.

No nested workspace, database, folders, tags, tasks or generic pages.

## 4. V1 workflows

### Create a play

1. Open seeded blank half-court.
2. Set offense/defense starting positions.
3. Rename play and optionally players.
4. Add a second phase; previous poses are copied as one validated command/history unit.
5. Drag actors and draw actions.
6. Add coaching cue.
7. Scrub or play the result.

### Collaborate

1. Open a read/write room link in another browser.
2. See participant, cursor, selection and active phase.
3. Observe remote committed poses and rich-text caret.
4. See gesture ghosts without persisting pointermove.
5. Continue editing offline; reconcile semantic conflicts after reconnect.

### Present

1. Enter distraction-free presenter mode.
2. Play/pause, step phases and scrub.
3. Optional followers explicitly follow presenter playhead.
4. Reduced-motion users receive step transitions instead of continuous motion.

### Recover

1. Open from IndexedDB without waiting for network.
2. See distinct `Saved locally`, `Sync pending`, `Synced`, `Offline` and `Needs review` states.
3. Restore from last valid local snapshot if migration or remote sync fails.

## 5. Interaction model

### Modes

The input coordinator exposes explicit states:

```text
app
court.idle
court.actorSelected
court.draggingActor
court.drawingAction
timeline.focused
timeline.scrubbing
timeline.reordering
notes.editing
presenter.playback
menu
modal
composing
```

Only one context owns a shortcut. Hover never grants keyboard ownership; explicit focus/click does. Modal/menu/rich-text contexts suspend court shortcuts.

### Keyboard contract

| Shortcut | Action |
|---|---|
| `V` | select tool |
| `H` or hold `Space` | pan only while the court owns focus |
| `P` | pass tool |
| `C` | cut tool |
| `D` | dribble tool |
| `S` | screen tool |
| `F` | add phase after current |
| `Enter` | edit selected actor/action/cue |
| `Escape` | unwind current interaction one level |
| Arrow keys | move selected actor by one normalized step |
| `Shift` + Arrow | move by ten steps |
| `Cmd/Ctrl+Z` | undo local command |
| `Shift+Cmd/Ctrl+Z`, `Ctrl+Y` | redo |
| `Cmd/Ctrl+K` | command palette |
| `Space` in presenter mode | play/pause; presenter context outranks court pan |
| `[` / `]` | previous/next phase |

`Tab` follows normal focus order. It is never globally swallowed by the canvas. While timeline keyboard DnD is lifted, `Space` belongs to lift/cancel semantics; otherwise the focused timeline uses normal navigation. This focused-context priority prevents `Space` from simultaneously panning, reordering, and playing.

### Drag-and-drop

- Actor drag remains a local gesture draft and commits one durable transaction on pointerup.
- Timeline phase reorder uses pointer and keyboard DnD.
- Keyboard DnD: focus, `Space` lift, arrows choose target, `Enter` drop, `Escape` cancel.
- Action path drawing commits one geometry candidate as a single observer/history unit. Fallible validation completes before the non-throwing Yjs transaction; rollback is not assumed.
- Every drop announces source, target and result in a polite live region.

### Undo/history

- One local history spans court and rich cue transactions.
- Remote updates, migrations, awareness, viewport and scrub are not undoable.
- Actor drag, action drawing, phase creation and cue creation define explicit capture boundaries.
- Selection is restored with undo where BlockSuite supports it.
- Durable version history is out of v1; JSON export provides a user-controlled checkpoint.

## 6. Collaboration and conflict UX

Yjs resolves transport-level convergence; ReplayLab exposes semantic conflicts instead of silently choosing critical values.

### Critical multi-value fields

- player pose or loose-ball pose in a phase;
- possession;
- action path;

### Conflict presentation

- alternate pose: translucent ghost token with collaborator color;
- alternate path: dashed ghost path;
- reorder/action adjacency issue: badge on phase transition;
- archived entity edited offline: validation/recovery issue with an explicit restore/archive/remove decision, not an MV field;
- out-of-court value: validation issue, not silent clamp.

Resolution is a new local command and therefore collaborative and undoable. Non-critical labels/colors may use deterministic last-writer semantics.

## 7. Layout and responsive contract

### Desktop, `>= 1180px`

Three-band layout:

1. compact top command/status bar;
2. dominant court stage with optional right coaching-cue panel;
3. bottom phase filmstrip and transport controls.

The court owns visual attention. Notes never exceed 34% width. Timeline height is fixed within a small range so the court does not jump during editing.

### Tablet, `768–1179px`

- playback, actor repositioning and rich-cue editing remain available;
- coaching cue becomes a resizable bottom sheet or side tab;
- all tools have touch targets at least 44×44 CSS px;
- path authoring and timeline reorder are unavailable.

### Mobile, `< 768px`

Review-first mode only:

- playback, phase stepping and scrubbing;
- accessible lineup and action list;
- rich cue reading;
- no durable actor/cue editing, path authoring, timeline reorder, box select or multi-object transform.

This is an intentional product boundary, not a temporary responsive bug.

## 8. Visual direction

Direction: **broadcast analysis desk meets physical coach playbook**, not AFFiNE purple productivity UI.

### Palette

- deep ink court: `#07131F`;
- warm linework: `#E6D9B6`;
- offense: signal coral `#FF625F`;
- defense: electric cyan `#45C8F5`;
- ball/active phase: amber `#FFB020`;
- neutral panels: graphite and warm off-white;
- conflict ghosts use collaborator hue plus pattern/dash, never color alone.

### Typography

- compact athletic display face for phase labels and scorebug-like status;
- highly readable sans for controls and notes;
- tabular/monospace numerals for time and coordinates.

Any non-system font is admitted only after license review. The product must remain coherent on the system fallback stack.

### Shape and hierarchy

- actors are high-contrast numbered tokens with team shape differences;
- paths have domain-specific arrowheads/dashes for pass/cut/dribble/screen;
- panels use tight radii and physical-playbook dividers, not generic floating cards;
- shadows are rare; separation comes from contrast, linework and layer rhythm;
- no decorative gradient is allowed to compete with the animated play.

### Motion

Motion is functional:

- players interpolate between resolved phase poses;
- pass follows a restrained Bézier arc;
- selected tactical action pulses once, not continuously;
- remote gesture ghost decays quickly;
- reduced motion switches to discrete phase steps and removes nonessential transitions.

## 9. Accessibility contract

Canvas is never the only interface.

Required DOM companion:

- ordered phase list with move-before/move-after actions;
- lineup table for selected phase;
- textual action descriptions such as “#4 cuts from left wing to rim”;
- focusable playback controls and range slider with `aria-valuetext`;
- keyboard position/action dialog as alternative to drag/path drawing;
- live announcements for select, move, connect, drop, undo and conflict creation;
- toolbar roving tabindex and menu/listbox semantics.

Additional requirements:

- visible focus at 3:1 minimum contrast;
- team, possession and conflict state not encoded by color alone;
- `forced-colors` and high-contrast support;
- no announcement on every animation tick;
- keyboard-only critical-path Playwright suite;
- axe for DOM shell/editor plus manual NVDA and VoiceOver smoke tests.

## 10. Offline and realtime contract

### Local-first

- Local IndexedDB is the primary load/save source.
- The play becomes editable after local load; network never blocks readiness.
- A service worker caches the app shell and seeded demo.
- The app requests persistent storage when appropriate and explains denial without blocking use.
- `pagehide` initiates a bounded flush; an unsaved-local state remains visible if it cannot complete.

### Realtime

- Network sync is a shadow source.
- Awareness is ephemeral and never treated as a lock or permission.
- Remote gesture previews are throttled; durable updates occur on command commit.
- Reconnect uses state-vector pull, idempotent push and explicit sync status.
- Read-only participants never receive a writable channel, and the local BlockSuite Store/command bus opens in read-only mode so it cannot accumulate an unsyncable branch.

## 11. Performance budgets

Supported maximum fixture:

- 10 players + ball;
- 12 phases;
- up to 30 actions per transition;
- 3 concurrent participants.

Profiles, pinned before Slice 1A exits:

- **Render profile:** Playwright-pinned Chromium on a dedicated 4-vCPU/8-GB CI runner, 1440×900 CSS viewport, DPR 1; exact browser/build/runner IDs are attached to every report. A 5-second warm-up precedes a 30-second maximum-fixture trace.
- **Recovery network profile:** 3 clients, 500 mixed commands, a five-minute partition, then restored connectivity at 100 ms RTT and 1% packet loss.
- An optional manual laptop smoke test records exact model/OS/browser separately and is never substituted for the automated gate.

Budgets:

- 55+ FPS sustained pan/zoom/playback on the render profile;
- pointer input-to-paint under 50 ms p95 on the render profile;
- received-update-to-first-paint under 100 ms p95 on the render profile, measured from client receipt and excluding network transit;
- local seeded play open under 1.5 s after app shell load on the render profile;
- post-partition convergence under the separately declared recovery-network gate; do not conflate it with paint latency;
- total critical JS fetched before the play becomes editable (shell plus required lazy editor chunks) at or below the provisional 1.5 MB gzip kill target;
- no React render on pointermove or animation tick.

## 12. Error and recovery UX

- Storage unavailable: read-only in-memory session with prominent export action.
- Quota exceeded: preserve current Y.Doc, offer JSON export and storage cleanup instructions.
- Migration failed: keep previous database, open recovery copy, never destructively retry.
- Retryable network failure/rate limit: remain locally editable, show pending state and honor reconnect/backoff or `Retry-After`.
- Terminal auth/schema/oversize rejection: stop only the network shadow, preserve IndexedDB/Y.Doc, show `Sync blocked` with export/re-authorize, make no repeated terminal push and never report `Synced`.
- Permission revoked: apply the same terminal path; preserve the local branch for export and do not silently discard.
- Invalid/orphan action: show repair badge and keep data until explicit resolution.

## 13. Success criteria

Product success for the portfolio release is demonstrated when:

- a new viewer understands the artifact and core action in under 30 seconds;
- the silent core demo completes within 30 seconds and the collaboration/offline/conflict/undo proof within 60 seconds;
- multi-client/offline/local-undo behaviour is observable and covered by tests;
- keyboard users can author the same supported play without drag;
- supported maximum fixture meets rendering budgets;
- production build contains no forbidden AFFiNE code/protocol/brand asset;
- all included notices and dependency licenses are reviewed.

## 14. Explicit non-goals

- arbitrary whiteboard or docs workspace;
- full-court and other sports in v1;
- rules engine, physics, collision detection or shot probability;
- AI play generation or chat;
- video import, tracking or export;
- roster, season, schedule, stats, tasks or calendar;
- branching versions and approval workflow;
- public marketplace, billing, SSO or organization admin;
- native desktop/mobile applications;
- full mobile canvas authoring;
- AFFiNE import, server or account compatibility;
- hard deletion before a retention/recovery design exists.
