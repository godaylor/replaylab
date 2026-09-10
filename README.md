# ReplayLab

Local release verification (2026-09-08): **GREEN** — 74 tests, ten immediate-close repetitions, isolated release packaging and Node/Docker collaboration/backup-restore smoke pass. Public publication remains gated on the external reviews and hosting decisions in `PLAN.md`.

Локальный редактор баскетбольных комбинаций: расставьте игроков, добавьте фазы, нарисуйте передачу или движение и проиграйте результат. Два тренера могут редактировать одну комбинацию, продолжать работу офлайн и после подключения явно разрешать конфликты.

Local-first multiplayer editor for animated basketball plays. RU is the default; EN is available in the app. One half-court, ten players, a derived ball, 2–12 phases, four tactical actions, rich coaching cues and local-only undo.

Desktop supports full authoring. Tablet supports playback, player movement and cue editing. Mobile supports playback and semantic review. IndexedDB is authoritative; the server stores a recoverable network copy.

An additive, versioned emergency journal retains committed gestures and unapplied title/cue drafts across abrupt renderer closure. Existing local plays are backed up before adoption; corrupt or unknown records are preserved for read-only recovery/export. See [recovery contract](docs/EMERGENCY_JOURNAL.md). Browser data clearing or complete storage failure still requires an independent export/backup.

## Local setup

Use Node 22 (`>=22.12 <23`) and the repository's Yarn 4.18.0. Run from the repository root:

```sh
node .yarn/releases/yarn-4.18.0.cjs workspaces focus @replaylab/foundation-proof
cd packages/replaylab/foundation
node ../../../.yarn/releases/yarn-4.18.0.cjs build
node ../../../.yarn/releases/yarn-4.18.0.cjs build:server
node ../../../.yarn/releases/yarn-4.18.0.cjs start
```

Open http://127.0.0.1:32400. The server serves the app and `/sync` on the same port. Check port availability first; it fails if the port is occupied. `dev` also uses 32400, so run only one of them. No full monorepo or upstream Docker stack is needed.

For collaboration, provision a private room with `room:create <room-id>` before starting/restarting the server. The command prints separate read/write bearer links and stores only hashes. Do not put a write link in a public README. See [standalone release instructions](docs/RELEASE.md) for room provisioning, persistence, backups, Docker and future HTTPS setup.

## Verification

```sh
# From packages/replaylab/foundation; install the pinned Chromium once:
node ../../../node_modules/@playwright/test/cli.js install chromium
node ../../../.yarn/releases/yarn-4.18.0.cjs verify:release
```

Checks use 32410–32412, one worker, isolated browser profiles and temporary rooms. `verify:release` checks free ports, typechecks, builds client/server, runs the product tests, audits provenance/licenses and prepares `release-dist`. This directory is the deployment artifact; do not upload the upstream checkout or raw development `dist`.

Evidence lives in [foundation/evidence](packages/replaylab/foundation/evidence). [PLAN.md](PLAN.md) records actual results and open manual gates. CI produces an artifact, not an automatic deploy. Public release still requires the recorded manual review and domain/name decisions.

## Demo and review

Open a play with `?demo=1` for the 30/60-second runbook. [Manual release review](docs/RELEASE.md#manual-release-review) covers screen readers, keyboard, zoom, touch, and the two-person demo. Automated checks do not substitute for those reviews.

## Provenance

The [source state export](docs/SOURCE_STATE.md) prepares the permitted source closure, required documents and a SHA-256 provenance inventory for a separate owner repository. It excludes inherited upstream workflows and creates no Git history or remote changes.

ReplayLab is original product code built on four reviewed BlockSuite framework packages, React, Yjs and other inventoried dependencies. This checkout retains upstream AFFiNE source/history as an audit baseline; ReplayLab does not use its application shell, backend, network protocol or branding and is not endorsed by AFFiNE/TOEVERYTHING.

The composite [LICENSE](LICENSE), [LICENSE-MIT](LICENSE-MIT), nested notices and [license boundaries](docs/LICENSE_BOUNDARIES.md) remain authoritative. The entire repository is not uniformly MIT. The release package includes the SBOM, license inventory and full third-party notices at `/legal/THIRD_PARTY_NOTICES.md`. “ReplayLab” remains a working title pending independent mark/domain clearance.
