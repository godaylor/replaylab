# Verification and deployment

## V3 — 2026-09-28

Current target remains https://replaylab-godaylor.onrender.com/ and Render service
`srv-dah9cq1t0dsc73f4ou50`, repository `godaylor/replaylab`, branch `main`.
The existing standalone checkout was clean at start at `186fb97`; the enclosing
AFFiNE checkout and all other PetProjects resources were left untouched.

### Public availability investigation

The site displayed Render's `Service waking up / Application loading` for much
longer than its ordinary cold start. An independent HTTP request timed out after
30 seconds without response bytes; the browsing fetch could not retrieve the URL.
The reported HTTP 503 is therefore not independently reproduced as a numeric
status in this session; failure to reach the app is reproduced. Repeated public
polling was stopped. Render redirected to login, and GitHub OAuth also required
login. No startup/deploy logs were accessible. The concrete startup cause is
**unknown**; do not attribute it to Supabase or to Render infrastructure without logs.
The previous September 13 Supabase 504 incident is historical, not current evidence.

Owner action: sign into the existing service dashboard in the dedicated in-app
browser tab. Then read the failed startup/deploy log, fix a demonstrated app/config
cause or document a demonstrated Render infrastructure failure. No plan upgrade,
new hosting, data reset, schema/RLS/permission or secret changes were performed.
Current public create/reopen/collaboration and deployed-commit verification remain open.

### Local V3 behavior

- One repeatable guide replaces the old disappearing hint. Practice is a separate
  UUID play with a synthetic pass; returning to an existing practice never reseeds it.
- UI scenario: move, draw, play/pause, undo/redo, archive/undo action, download full
  recovery, reload, home/recent reopen, browser back/forward and import a separate copy.
- A partially visible canvas used to scroll when pointer focus was acquired, changing
  drag coordinates. `preventScroll` fixes it; the original expected coordinate
  assertions are retained. Invite Escape now restores focus after dialog unmount.
- RU/EN widths: 320/360/390/430/649/651/768/849/851/1024/1179/1181/1280/1440/1920/
  2560/3840/5120/7680 CSS px. This is browser emulation, not physical TV testing.
  Tablet header minimum widths and narrow playback control wrapping were fixed.
- Touch-emulated exact selection from an overlapping-player fixture, a simulated
  room API 503 that preserves local content, reduced motion and 200% CSS enlargement
  are tested. A 320 CSS-pixel viewport also covers reflow width equivalent to a
  1280px window at 400%; actual browser zoom/device/assistive technology review remains open.
- Changed old text assertions reflect the requested “Saved in this browser” label;
  the quota negative assertion was updated as well. Old auto-dismiss onboarding
  expectations are replaced by no-auto-start, repeatability and personal-play preservation.

### Current local results — 2026-09-28

| Command / check | Result |
| --- | --- |
| Repository Yarn `workspace @replaylab/foundation-proof verify:release` | PASS: typecheck, client/server builds, 83 Chromium tests, 10 abrupt-close repeats, audit, package |
| Repository Yarn `workspace @replaylab/foundation-proof lint` | PASS |
| `REPLAYLAB_BROWSER=firefox` + `test tests/practice.e2e.spec.ts --workers=1` | 2 PASS, 1 explicit skip: Firefox touch emulation unsupported |
| `REPLAYLAB_BROWSER=webkit` + same test | 3 PASS |
| Independent-context collaboration/reconnect/view role | PASS locally, included in full release suite; current public run unavailable |
| RU manual eight-step completion, Finish focus return, restart at step one | PASS in dedicated in-app browser tab |
| Current provenance | 226,205 gzip JS bytes; zero forbidden modules; manual review items remain open |

Reports: `packages/replaylab/foundation/evidence/release-verification.json`,
`release-tests.json`, `release-durability.json`, `v3-firefox.json`, `v3-webkit.json`.
Screenshots were visually inspected:
[desktop guide](../packages/replaylab/foundation/evidence/v3-guide-desktop.png),
[320px review](../packages/replaylab/foundation/evidence/v3-mobile-review.png).
Tests used one worker, sequential engines, existing ReplayLab ports and isolated
synthetic documents. Windows Playwright engines are not real mobile Safari.

---

## Historical public evidence — 2026-09-13

- Live: https://replaylab-godaylor.onrender.com
- Runtime commit: fe37fb0c4372f40b2ac3984f53a2649d5bd4ed7b
- CI: https://github.com/godaylor/replaylab/actions/runs/34770869306
- Render service: replaylab-godaylor, srv-dah9cq1t0dsc73f4ou50, Free unchanged.
- Successful deploy: dep-dajdl5h42hec73bhf00g.
- Existing Supabase project: wxyoplenptrntdfrlzyf.

## Observed public results

| Check | Result |
| --- | --- |
| Create local play, rename, move player and reopen through recent list | PASS; title and offense-1 x=115 retained |
| Create private collaborative room through the public interface | PASS; edit and view links returned separately |
| Second client with a different IndexedDB name | PASS; correct title and initial pose loaded |
| First client moves offense-1 | PASS; second client receives x=120 |
| Second client moves defense-1 | PASS; first client receives y=315 |
| View capability with a third local database | PASS; correct title and both poses, read-only title and role |
| Close all room clients, restart only ReplayLab, open another fresh database | PASS; correct title, x=120 and y=315 restored, network status synced |

Public checks used the in-app browser with distinct local database namespaces.
The IndexedDB source's BroadcastChannel is scoped to its database name, so these
clients could exchange data only through the network shadow. The local/CI suite
also uses independent browser contexts. A separate headless production run could
not reach the origin from its network environment; it is not counted as passed.

## Database boundary

Executed exactly `GRANT INSERT ON public.replaylab_rooms TO service_role` after
the owner's explicit confirmation. Before: 1 room, RLS true, service INSERT false,
no anon/authenticated table grants. After grant: 1 room, RLS true, INSERT true,
no public-role grants. After synthetic verification: 3 rooms, RLS true, INSERT
true, still no public-role grants. The original room was not opened or modified.
Two synthetic verification rooms were retained; no rows were deleted. No secrets
or invitation capabilities are included in these published materials.

## Release checks and fixes

80/80 tests and 10/10 abrupt-close repetitions passed in GitHub CI, along with
typecheck, lint, client/server build, source inventory, provenance, isolated Node
package smoke, Docker build and non-root container backup/restore smoke.

The release checks exposed Linux font-dependent mobile header overflow; controls
now wrap. A real Supabase 504 exposed startup fragility; only transient reads are
retried with a bounded delay. A first-time join during transport failure exposed
unsafe seeding; a client without a local copy now stops before creating/uploading
replacement blocks. A regression test verifies the server update is byte-for-byte
unchanged after that failed join and the correct title survives a successful retry.

No global Git configuration or auth login/logout was changed. Publication used
ordinary Git transport. Other PetProjects processes, containers, networks and
volumes were not changed.

## Open limitations

Render Free cold starts, one server instance and a 32-room cap remain deliberate
deployment limits. Human screen-reader/device/IME review, full demonstration
review and independent working-name clearance remain open.
