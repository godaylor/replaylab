# Agent operating contract

This file applies to the entire repository. More specific `AGENTS.md` files may narrow behavior later, but they may not weaken the licensing, provenance, safety, or product-scope rules below.

## 1. Current phase

The owner authorized local completion of Slice 7 and portfolio release preparation on 2026-09-08. Follow the current checkpoint in `PLAN.md`: restore dependencies with repository Yarn, verify existing behavior, prepare ReplayLab README/CI/deploy configuration and preserve user data. Site port is 32400; all other local listeners, including tests, must remain within 32400–32499. No public deploy, commit, push or remote mutation is authorized. Unavailable manual reviews must remain explicitly open.

The following was the historical pre-implementation restriction, superseded only within that authorized scope:

- do not edit application source, package manifests, lockfiles, build configuration, generated files, tests, assets, or CI;
- do not create `packages/replaylab/**`;
- do not install dependencies, start services, change databases, or make network writes;
- read and report only, except for explicitly requested planning-document edits.

Slices 0–6 are implemented. Current work is Slice 7/release hardening, not a new product milestone.

The owner additionally authorized emergency recovery journal v1, safe backup/adoption and crash/corruption tests, followed by local release packaging, Docker image and CI verification. Follow `docs/EMERGENCY_JOURNAL.md`; retain existing user records and drafts. Public publication and remote mutation still require a separate instruction.

## 2. Required reading and precedence

Before proposing or changing implementation, read these documents in order:

1. `docs/LICENSE_BOUNDARIES.md` — non-negotiable legal/provenance boundary;
2. `docs/REUSABLE_SCOPE.md` — allowed foundation and import policy;
3. `docs/TRANSFORMATION_SPEC.md` — product behavior and non-goals;
4. `docs/ARCHITECTURE.md` — state, data, sync, rendering, and package contracts;
5. `PLAN.md` — authorized vertical slice and exit gates;
6. `docs/BASELINE_AUDIT.md` and `docs/PRODUCT_OPTIONS.md` — evidence and decision context.

When documents conflict, the earlier item wins. Do not silently resolve an ambiguity that changes scope, licensing posture, canonical data, protocol, or user-visible behavior; record it and ask for a decision.

## 3. Licensing and provenance are build constraints

Never delete, bypass, reinterpret, or weaken a license requirement. This repository policy is intentionally stricter than package metadata.

### Hard-denied source roots

- `packages/backend/**`;
- `packages/common/native/**`;
- `packages/frontend/native/**`;
- `packages/frontend/mobile-native/**`;
- `packages/frontend/apps/electron/**`;
- `packages/frontend/apps/electron-renderer/**`;
- `packages/frontend/apps/android/**`;
- `packages/frontend/apps/ios/**`;
- `packages/frontend/apps/mobile/**`;
- `packages/frontend/apps/mobile-shared/**`;
- `packages/frontend/admin/**`;
- `packages/common/nbstore/**`;
- `packages/common/realtime/**`;
- `packages/common/graphql/**`.

Whole-package reuse is also denied for `packages/frontend/apps/web`, `packages/frontend/core`, and `packages/frontend/component`. They are audit evidence only, never product dependencies.

Do not copy, port, translate, dynamically load, invoke as a sidecar, or reproduce code/protocol artifacts from denied roots. A dependency's MIT-looking `package.json` does not override a root/path license boundary or provenance policy.

### Allowed starting area

Use only paths explicitly approved by the reviewed allowlist in `docs/LICENSE_BOUNDARIES.md`. At this baseline, the direct reusable kernel is limited to:

- `blocksuite/framework/global/**` (`@blocksuite/global`);
- `blocksuite/framework/store/**` (`@blocksuite/store`);
- `blocksuite/framework/std/**` (`@blocksuite/std`);
- `blocksuite/framework/sync/**` (`@blocksuite/sync`).

Every `blocksuite/affine/**` package is a provisional candidate, not approved reuse, until Slice 0 records its exact direct/transitive closure, licenses, inline provenance, patches, emitted bundle presence, and an explicit boundary decision. Optional packages are denied by default.

All BlockSuite imports from product features must pass through `ReplayLabEditorFacade`, `ReplayLabSyncFacade`, or another documented narrow adapter. Never import `@affine/core` or the AFFiNE web shell as the foundation.

### Protocol and branding rules

- Design a new, documented ReplayLab network protocol from generic Yjs/BlockSuite contracts.
- Do not reuse AFFiNE endpoint paths, GraphQL operations, WebSocket event names, envelopes, handlers, fixtures, or persistence schemas.
- Developers implementing the transport/server must not use denied AFFiNE protocol roots as design references. Only provenance auditors may inspect them read-only to maintain forbidden-marker checks.
- Preserve all third-party notices and review vendored/inline provenance.
- Treat the local Yjs uint53 patch as a deliberate decision requiring upstream notice and compatibility evidence.
- Do not reuse AFFiNE names, logos, icons, illustrations, screenshots, or product copy in ReplayLab branding.
- Treat “ReplayLab” as an uncleared working title until name, mark, logo, and domain checks pass.
- Generate an SBOM, dependency-license inventory, source-notice report, and forbidden-path/import report before release.

When uncertain, stop at the boundary and request legal/provenance review. Do not search for a technical workaround.

## 4. Product invariants

ReplayLab v1 is a basketball play animator, not a general productivity suite.

- One document represents one half-court play.
- A play has exactly five offense players, five defense players, one derived ball entity, and 2–12 phases.
- `setActorPose` moves a player; it is an editing operation, not an action. Tactical actions are exactly cut, dribble, pass, and screen.
- Each phase may have one rich cue.
- Frames store complete poses for the ten players; ball position derives from possession or a loose-ball `PoseRegister`, and actions describe only an adjacent transition.
- Playback is derived and deterministic; it never mutates the CRDT.
- Local persistence is authoritative; network sync is a shadow.
- Realtime awareness is ephemeral and is never stored in history.
- Critical concurrent intentions remain inspectable until explicitly resolved.
- Desktop is the full authoring target. Tablet supports playback, actor repositioning, and cue editing but not path authoring or timeline reorder. Mobile supports playback, scrubbing, the semantic lineup/action view, and cue reading only.

Do not add workspaces, generic pages, databases, tasks, calendars, rosters, statistics, video/AI analysis, arbitrary whiteboards, other sports, native apps, or a plugin platform without an approved spec/plan change.

## 5. Canonical state and mutation rules

- Keep one canonical `Y.Doc` with the BlockSuite block root and the versioned `replay` root.
- Never duplicate canonical collaborative data into React, Jotai, Redux, Zustand, a server model, or a second Y.Doc.
- Keep hover, current tool, open panels, playhead, interpolation, local focus, and unsent pointer state local/derived.
- Use awareness only for bounded, expiring presence such as cursor, selection, presenter state, and follow intent.
- Mutate the play only through typed domain commands with invariants and explicit transaction origins.
- Build and validate fallible command drafts before entering a Yjs transaction. Transaction callbacks must be non-throwing; “atomic” means one observer/history unit, not rollback.
- Use one `UndoManager` scoped to cue blocks and the replay root, tracking only the local client origin.
- One user intent is one history unit. Do not record pointermove streams, animation frames, awareness, automatic/system reconciliation, repair, or migrations as user history. An explicit user `resolveConflict` command is one undoable local unit.
- Run schema validation at ingress and migrations at open; preserve a recoverable artifact before destructive migration.
- Store canonical domain data in Yjs. Gfx elements, React components, timeline rows, and accessible tree items are projections.

## 6. Interaction and accessibility contract

Every core operation must be designed for pointer, keyboard, assistive technology, and reduced motion in the slice where it is introduced.

- Use an explicit input-context coordinator; hover alone must not steal global keyboard ownership.
- Preserve browser/assistive navigation keys unless the focused editor context has a documented command for them.
- Give every pointer drag a keyboard lift/move/drop/cancel equivalent where drag changes document structure.
- Restore focus after popovers, dialogs, presenter mode, undo, deletion, and conflict resolution.
- Provide visible focus, roving tabindex where appropriate, clear shortcut discovery, and polite live announcements.
- Maintain an accessible DOM companion for canvas actors, actions, phases, selection, and conflicts.
- Respect `prefers-reduced-motion`, forced colors/high contrast, 200% zoom, and reflow.
- Do not treat the canvas bitmap or visually hidden labels alone as an accessible editor.
- Validate IME composition and non-US layouts for rich editing and shortcuts.

## 7. Rendering and performance contract

- Use the BlockSuite Gfx viewport, spatial index, layers, culling, hit testing, and dirty rendering behind `ReplayLabGfxAdapter`.
- Keep canonical product entities independent of Gfx internals.
- Schedule visual updates with `requestAnimationFrame`; stop work when hidden, offscreen, or unchanged.
- Never write interpolated positions or the playhead to Yjs.
- Build and run the maximum supported fixture whenever rendering behavior changes.
- Treat production bundle closure, long tasks, frame time, memory, and local-open time as regression-tested budgets.
- Do not solve a budget failure by importing a broader AFFiNE root or by removing accessibility/recovery behavior.

## 8. Collaboration and offline contract

- Use generic state-vector/update semantics through a product-owned `DocSource` implementation.
- Make updates idempotent and tolerate duplication, reordering, partitions, reconnect, and stale clients.
- Classify sync errors: transient/rate-limit retries with backoff/`Retry-After`; auth, revocation, schema and oversize stop only the network shadow, preserve IndexedDB/Y.Doc, expose export/re-authorize, and never report a false `Synced`.
- Authenticate and authorize document membership on every server session; validate sizes and rate limits before applying updates.
- Validate each accepted update against an isolated clone and the versioned structural schema/caps before ACK or fanout; a normal `DocSource` does not provide a safe pre-apply hook in the trusted client document.
- Keep awareness separate, lossy, bounded, and expiring.
- Test at least two independent browser contexts and a deterministic replica simulator.
- A critical collaboration test must cover online → offline local edits → concurrent remote edits → reconnect → convergence → local undo.
- Cold offline launch is required; an already-open tab that merely survives disconnection is insufficient.
- Never add a save button as the durability model.

## 9. Working practices

Before editing:

- inspect `git status` and preserve all user and agent changes;
- identify the currently authorized slice and its exit gate;
- state file/module ownership when parallel agents are used;
- inspect the closest existing pattern without broadening the dependency graph;
- record assumptions that affect schema, imports, licensing, protocol, or UX.

While editing:

- make the smallest vertical change that serves the slice outcome;
- use `apply_patch` for hand edits;
- do not perform broad formatting, dependency upgrades, or unrelated refactors;
- do not revert another agent's work; coordinate overlapping files first;
- keep adapters narrow and product/domain modules free of BlockSuite internals;
- add tests and accessible states with the behavior, not afterward;
- update decisions and public contracts in the relevant document.

After editing:

- run the narrowest relevant tests first, then the slice verification set;
- inspect the production dependency graph and forbidden-import report;
- inspect the diff for generated, vendored, secret, binary, branding, and license changes;
- report commands run, evidence, remaining risks, and any unverified assumption;
- do not claim a slice complete until every exit gate and applicable Definition of Done item passes;
- do not commit, publish, deploy, open a PR, or mutate external services unless explicitly requested.

## 10. Verification expectations

The baseline checkout currently has no installed dependency state and Yarn was unavailable during the audit. Do not report builds/tests as passing until the repository toolchain is installed and the exact commands complete.

Once implementation is authorized and dependencies are available, prefer repository-defined scripts over invented commands. Expected verification classes are:

- targeted package typecheck, unit, and integration tests;
- browser E2E for the current vertical flow;
- replica/convergence and per-user undo tests;
- accessibility automation plus manual keyboard/screen-reader review;
- cold-offline/service-worker and migration recovery tests;
- maximum-scene performance and production bundle measurements;
- dependency-license, SBOM, notice, and forbidden-root/import checks.

If a repository-wide check is too expensive, run the affected package checks and state exactly what was not run. Never weaken or skip a failing test to meet a milestone.

## 11. Decision and escalation rules

- Slice 0 is a kill gate, not an invitation to redesign BlockSuite indefinitely.
- If unified undo/custom projection cannot be proven within five working days, stop and evaluate the documented Incident Replay fallback.
- If the bundle budget fails, measure and prune once within the timebox; do not import more AFFiNE to move faster.
- If a migration, conflict policy, or protocol change could lose user intent, require an architecture decision and adversarial test before merging.
- If a request conflicts with the license denylist, refuse that implementation path and propose a clean-room/product-owned alternative.
- If a request expands a v1 non-goal, update the spec and estimate only after explicit approval; do not smuggle it into another slice.
