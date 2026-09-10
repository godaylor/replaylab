# ReplayLab standalone release

Local status (2026-09-08): **technical verification GREEN**. The unchanged immediate-close regression passes ten consecutive repetitions; the full suite passes 74/74 with no skipped tests. The isolated release package and non-root Docker image pass two-client/offline/conflict/undo and separate-directory backup/restore smoke checks. This is not public deployment or manual accessibility/name clearance; see the current `PLAN.md` checkpoint.

This is a single-process portfolio deployment. The site and authenticated WebSocket endpoint `/sync` share port **32400**. Additional local test listeners are restricted to **32400–32499**. No database, Redis, AFFiNE service, migration container or global tool configuration is required.

## Build and validate

For an owner's source repository, use the reviewed export described in `docs/SOURCE_STATE.md` in the source checkout. It includes the required contracts, provenance and only the ReplayLab workflow; it creates no commits or remote changes.

ReplayLab is original product code built on four reviewed BlockSuite framework packages, React, Yjs and inventoried dependencies. It uses no AFFiNE application shell, backend, network protocol or branding and is not endorsed by AFFiNE/TOEVERYTHING. The preserved composite `dist/legal/LICENSE`, `LICENSE-MIT`, nested notices, SBOM and `THIRD_PARTY_NOTICES.md` remain authoritative; the upstream checkout is not uniformly MIT. “ReplayLab” is an uncleared working title.

Use Node 22 (`>=22.12 <23`; local verification uses 22.15.1) and checked-in Yarn 4.18.0. From repository root, run `node .yarn/releases/yarn-4.18.0.cjs workspaces focus @replaylab/foundation-proof`; then from `packages/replaylab/foundation` run `node ../../../.yarn/releases/yarn-4.18.0.cjs verify:release` after installing pinned Playwright Chromium. The resulting `release-dist` contains only the app, server, five audited server runtime packages (Yjs, lib0, ws, fractional-indexing, isomorphic.js) and legal artifacts. It excludes development sourcemaps and absolute-path bundle metadata. Every artifact file is SHA-256 inventoried. Repackaging stages a new artifact and retains the previous generated release under repository `tmp`; user-added/modified files or room data cause a refusal, not deletion.

The existing upstream monorepo workflows and deployment directories are audit baseline material, not ReplayLab pipelines. Use `.github/workflows/replaylab.yml` only. Before enabling Actions in your own remote, disable or explicitly restrict inherited upstream workflows in that repository; no remote settings have been changed here.

## Run without Docker

Copy the complete `release-dist` to a directory on the chosen server. No package install is necessary inside it. Run `node server-dist/server-entry.js`. The default host is `127.0.0.1`, port 32400; `PORT` rejects values outside 32400–32499. `/healthz` returns product health without room content.

Set `REPLAYLAB_DATA_DIR` to an absolute persistent directory outside the replaceable release artifact. Default `.replaylab-data` is relative to the launch directory. Preserve that directory across releases. Use one server process per data directory, no clustering or multiple writers. Stop the previous instance before starting a replacement. Browser local data remains authoritative and is never deleted by server deployment.

For the free hosted portfolio variant, apply `deploy/supabase/schema.sql`, insert room IDs with SHA-256 read/write capability hashes, and set `REPLAYLAB_SUPABASE_URL` plus `REPLAYLAB_SUPABASE_SECRET_KEY`. The server then loads and atomically replaces private Yjs network-shadow snapshots through the Supabase Data API before acknowledging a commit; it does not initialize or write `REPLAYLAB_DATA_DIR`. RLS is enabled, browser roles have no table grants, and only the server-side secret role can select or update rows. Never place raw capability tokens or the Supabase secret in Git, browser code, logs, screenshots, or public documentation.

`render.yaml` selects only Render's `free` compute plan and keeps both database values as `sync: false`. The service derives its exact HTTPS origin from Render at runtime, so `/sync` validates the corresponding browser origin and upgrades to WSS on the same host. Supabase Free may pause after low activity; its stored data remains external to Render and can be resumed from the Supabase dashboard.

## Private collaboration rooms

Before launch, from the same runtime directory with the same `REPLAYLAB_DATA_DIR`:

```sh
node server-dist/room-cli.js portfolio
```

This prints two private links for http://127.0.0.1:32400. Open the write link in two independent browser contexts to collaborate; use the read link to review. The command never overwrites an existing room. Only SHA-256 capability hashes are saved. Save the links privately: hashes cannot recreate them. Room discovery and public room-creation endpoints intentionally do not exist. Restart after provisioning to load new rooms.

After choosing a domain, provision links with `node server-dist/room-cli.js <new-room-id> https://your-host`. This only formats links locally; it does not publish anything. Set `REPLAYLAB_PUBLIC_ORIGIN` to the exact HTTPS origin for WebSocket origin validation. Non-local HTTP origins are rejected. Protect write links like passwords; do not share them in public demos/screenshots. Do not log fragments or request bodies. Capabilities do not provide end-to-end encryption.

## Server persistence and recovery

Browser recovery uses the additive [emergency journal v1](EMERGENCY_JOURNAL.md), without changing the existing collection or canonical schema. Before adoption on an existing play, an immutable SHA-256 recovery artifact is stored and checked. Complete document updates are journaled synchronously; only the originating writer's acknowledged records are cleared. Pending title/cue drafts are restored explicitly, never silently committed. Unknown/corrupt entries remain intact and force read-only recovery. Export retained drafts/journal from the cue editor, and keep normal recovery exports independently. A raw emergency export is diagnostic evidence, not an automatically imported canonical play. Foreign/crashed-session evidence has no automatic expiry: monitor browser quota and export before any explicit retention maintenance. No real user browser profile was migrated by these test runs.

Validated updates are appended to a checksummed journal and fsynced before apply/ACK/fanout. Invalid updates and failed disk writes do not mutate the trusted room. Every 100 durable updates also creates a compact Yjs snapshot; the complete append log remains retained. Restart replays the journal with checksum and structural validation. An incomplete unacknowledged tail is copied to an `interrupted-*` recovery file before truncation; a corrupt complete record stops startup with the original intact.

Portfolio caps: 32 rooms, 64 connections total, 12 sessions per room (document and awareness count separately), 384 KiB WebSocket messages, 100 messages/second per connection, 16 MiB encoded room state, 128 MiB journal per room. A full journal stops the network shadow with export available; local authoring survives. There is no automatic deletion/retention expiry. Review capacity and archive/export explicitly; do not erase logs to make a gate pass.

Before an upgrade, stop this server and copy the complete data directory to a dated backup. Keep the old release and the backup. Restore drills must run against a **copy** with a separate data directory and an unused permitted port. Never run a drill against the live directory. Keep client recovery JSON exports independently. The local automated restart/corruption drill is recorded in release evidence; a backup/restore drill on the chosen host remains a publication step.

## Optional container

After `verify:release`, from the repository root:

```sh
docker compose -f deploy/replaylab/compose.yml config --quiet
docker compose -f deploy/replaylab/compose.yml build
docker compose -f deploy/replaylab/compose.yml up -d
```

These are future operator commands, not authorization to publish. Only service `replaylab` exists. The image copies the prepared artifact; it does not compile or import upstream services. The container runs as non-root with a read-only root filesystem, a dedicated `replaylab-portfolio_replaylab-data` volume, and only loopback 32400 exposed. Do not use `down -v`: it would erase the network copy. For room creation, use the same image and named volume with the room CLI before starting the app.

For example, after build and before the first `up`, run `docker compose -f deploy/replaylab/compose.yml run --rm --no-deps replaylab node server-dist/room-cli.js portfolio`. This one-off command shares the dedicated volume and publishes no ports. Retain its links privately. For an already-running site, provision a new room and restart only this service after arranging the short interruption.

From repository root, `node packages/replaylab/foundation/scripts/release-smoke.mjs` tests the packaged Node runtime. Set `REPLAYLAB_IMAGE` to the locally built tag and append `--docker` to test the image. These commands check 32400, use isolated synthetic rooms/profiles and retained backup directories under `tmp`, and stop only their own child process or labelled container. `--capture` records the 60-second route. Do not run against live data or while another service owns 32400.

## Future HTTPS reverse proxy

Hosting/domain are deliberately not selected. Terminate HTTPS at your chosen proxy, forward HTTP and WebSocket upgrades to `127.0.0.1:32400`, preserve the Host header, and set `REPLAYLAB_PUBLIC_ORIGIN`. `/sw.js`, `/index.html` and navigation responses must not be cached by the proxy; hashed `/assets/*` may be immutable. Do not expose `.replaylab-data`, sourcemaps, bundle metadata or server files. The built-in static server enforces that boundary and supplies CSP, no-referrer, anti-framing and nosniff headers. Public TLS port assignment belongs to the later hosting step; no listener outside the requested local range is created here.

## Manual release review

Record reviewer, date, OS/browser/assistive-technology versions and result for each item. Do not mark an automated accessibility tree as a screen-reader pass.

- NVDA on Windows and VoiceOver on macOS: navigate the complete lineup, move a player, add/reorder a phase, author an action/cue, inspect/resolve a conflict, undo, export; verify spoken names, status and restored focus.
- Keyboard, non-US layout/IME, 200% zoom/reflow, forced colors and reduced motion: complete the supported workflow without a mouse. Tablet touch: actor reposition/cue editing; mobile: playback and semantic review only.
- Silent 30 seconds: play, pause, move, pass, collaborator cue. Full 60 seconds: take one writer offline, edit the same pose on both sides, reconnect, inspect both candidates, resolve, nudge and undo only the nudge, play again. Record and have a human confirm the value is understandable. Use temporary synthetic rooms, hide capability links.
- Independently clear name/mark and choose/check a domain; document demo asset provenance. This is an engineering inventory, not a legal clearance opinion.
- Select hosting/domain; review CI on the hosted runner, image build and host backup/restore/TLS/WebSocket/offline smoke; then explicitly authorize publication. No commit, push, remote change or deploy is implied by local readiness.
