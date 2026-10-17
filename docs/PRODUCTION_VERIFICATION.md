# Verification and deployment

## Direct 3D authoring — local verification passed, publication pending, 2026-10-18

The current source removes the forced overhead editing view. It adds body drag,
projected action drawing, independent view/mode choice, a larger court and a
playback/step rail. [Decision and scope](DIRECT_3D_WORKBENCH.md).
Local release gates passed: **125/125 Chromium**, **10/10 durability**, typecheck,
builds, audit and 946-file packaging. Lint also passes. Direct-3D **WebKit 11/11**
passes against the same production build, with no skips or flaky retries.
The maximum 3D fixture runs at 60.01 FPS, p95 frame 16.7 ms, p95 input-to-paint
3.3 ms, local open 51.1 ms, zero long tasks and zero playback React renders on
this Windows host. Gzip JavaScript is **246,424 bytes**; 78 dependency instances,
31 emitted packages and zero forbidden modules. Technical status is green;
the independent mark, screen-reader and human video reviews remain open.

The packaged Node runtime and non-root Docker image each pass four smoke groups,
including two writers, offline reconciliation, backup/restore and read-only
offline reopening. Tests use isolated port 32421 and synthetic data. All six
frontend files match between the 946-file package and the image. The tar archive
round-trip preserves exact inventory and hashes; SHA256:
`0ffbe80950a06613051bffa33aecdcb62cb61bb3c2a481e133588fa90571cdc6`.
Receipt: `packages/replaylab/foundation/evidence/direct3d-artifact.json`.

All 125 test bodies and then all ten durability repetitions passed before their
own Vite preview processes were stopped by exact PID/command identity to finish
Windows teardown. Both runners then exited zero; no test was skipped or weakened.

Publication and public checks for this revision are pending; the deployed receipt
below belongs to the preceding workbench and remains historical.

## Published: Coach workbench / 3D · 2026-10-18

The coach-facing revision replaces the previous Arena workflow. Home opens a
concrete pick-and-roll in **Watch · 3D**; **Edit play** switches to the accurate
overhead board. Home and playback share original procedural court/player geometry.
Movement captions identify the player and next action. Compact mouse/trackpad
windows retain authoring, and drawing begins with the player under the pointer.
No dependency, canonical schema, protocol, stored cue or existing record changed.

[Actual screens, generated reference and before/after](design/COACH_WORKBENCH_REVIEW.md)
· [Product decisions and practical exercise](COACH_WORKBENCH.md).
This is a simulated coach task, not a field study with a coach.

Local release, packaged runtime and hosted CI checks passed. The new workbench
is published on the existing service; the old Arena section below is historical.
The owner's existing commit/push/Render authorization is retained; service,
tariff, data and credentials are unchanged.

Application source: `cd6fd3a6d00cbe6f7f639b49afade9e3578382f9`.
[Hosted CI 39071486059](https://github.com/godaylor/replaylab/actions/runs/39071486059)
completed **success** at 21:40:10 UTC on 2026-10-17 (18 October in Moscow).
It includes exact source inventory, immutable install, complete release suite,
durability, lint, technical audit, package, Node smoke, Docker build and container
backup/restore smoke. The preceding workbench commit `6617a96` also passed
[CI 39070455588](https://github.com/godaylor/replaylab/actions/runs/39070455588).

Existing Frankfurt Free service `srv-dah9cq1t0dsc73f4ou50` reports
**Deploy succeeded | Live**, duration **55.2 seconds**, for
[deploy dep-db9umtfbtjjs73d4ffvg](https://dashboard.render.com/web/srv-dah9cq1t0dsc73f4ou50/deploys/dep-db9umtfbtjjs73d4ffvg).
Logs show HTTP/local editor listening at **21:42:00 UTC**, then collaboration
ready with **five restored rooms** at **21:42:03 UTC**, live at 21:42:05 UTC.
Four rooms preceded this iteration; the first public exercise added one synthetic
private room. No room reset, deletion, schema, credential or tariff change was made.
Auto-deploy did not start after CI; the already-authorized manual deploy was used.
[Final Render receipt](design/public-coach3d-render-final.png).

Public HTML (including the icon), entry JavaScript and CSS hashes match the
verified final local package. `/healthz` and `/readyz` both return HTTP 200,
`collaboration: ready`, `storage: supabase-postgres`.
`public-coach3d-receipt.json` and `coach-ci.json` record exact identities.

**Final public browser checks: PASS**, installed Chrome **155.0.8059.80**, fresh
independent contexts on this Windows host, starting 21:42:29 UTC. Both reports
carry the verified source/deploy identity:

- `public-coach3d-smoke.json`: RU/EN home → 3D playback without canonical mutation
  → Edit → keyboard movement → draw from player 5 while player 1 is selected →
  one-unit Undo/Redo → append → complete playback → reload → recent reopen.
  Language/theme choice is made through real controls and survives reload.
  Closing the tab then opening a new tab offline in the same prepared context
  preserves the play and font. This is not a first-ever uncached offline visit
  or a full browser-process restart.
- Two writers exchange edits; one goes offline and edits while the other makes
  concurrent changes; reconnect converges. The reconnected writer undoes/redoes
  its offline edit while retaining the other writer's change. The other writer
  then undoes its own edit while retaining the reconnected writer's change.
  A fresh context restores hosted values; a view-capability context cannot edit
  title, steps or actors through keyboard. This final repetition adds one more
  synthetic private room; capabilities remain only in memory.
- `public-coach3d-mobile.json`: RU and EN at 390 × 844 with coarse touch, actual
  play/pause, step taps, immutable document, no authoring controls, readonly
  title/Add step, no horizontal overflow, locale retained after reload. Both
  viewport screenshots retain the coarse-pointer/mobile capability state.
  **Zero captured console/page errors or failed asset responses** after the icon
  fix. Desktop captures zero page errors and failed asset responses; its logger
  does not claim to capture every console or deliberately offline network event.

[Public homepage](design/public-coach3d-home.png) ·
[3D review](design/public-coach3d-watch.png) ·
[Edited play](design/public-coach3d-editor.png) ·
[RU phone](design/public-coach3d-mobile-ru.png) ·
[EN phone](design/public-coach3d-mobile-en.png).
These are actual final-site screenshots, not mockups. Available IAB checks also
show the new homepage and retained older local records. All browser contexts
share the available host network; no VPN/Russian-route claim follows from this.

| Current revision check | Actual result |
| --- | --- |
| Repository `verify:release` | PASS, all seven stages |
| Chromium full suite | **111/111**, no failures, flakes or skips |
| Immediate-close durability | **10/10** |
| Typecheck, client/server builds, lint | PASS |
| WebKit 26.0, Windows | **26/26** targeted authoring, 3D, coach, accessibility and touch/reflow tests; **2/2** additional final caption regressions |
| Firefox 146.0.1, Windows | Environment BLOCKED: 5 pure tests pass, 3 existing touch-emulation skips, 18 page tests fail before app navigation; exact pinned revision and blank-page retry reproduce Playwright `_page` initialization error |
| Actual installed Chrome 155 motion capture | 32.28-second 1440 × 900 recording of the packaged app, zero captured browser/request errors |
| Maximum 3D scene, 30-second measured trace | 12 steps, ten players, 30 paths × 64 points; **60.008 FPS**, p95 **16.8 ms**, input-to-paint p95 **2.3 ms**, no long tasks or root React playback renders |
| License/import/bundle audit | Technical PASS: 78 dependency instances, 31 emitted packages, **0 forbidden modules**, **243,779 gzip JS bytes** (<250,000 budget) |
| Packaged Node smoke | PASS: four static/room/offline/convergence/undo/backup-restore checks, isolated port **32421** |
| Non-root Docker smoke | PASS: same four checks, read-only filesystem and dropped capabilities, isolated port **32421** |
| Runtime inventory and archive | **946** files hash-verified; **988** safe relative archive entries, no room data |
| Final hosted release CI | **PASS**, run 39071486059, application commit `cd6fd3a` |
| Final public desktop and two-session collaboration | **PASS**, RU/EN, closed-tab offline, reconnect and both users' local undo |
| Final public phone emulation | **PASS**, RU/EN, no captured console/page errors or failed asset responses |

The complete suite includes the practical RU/EN coach path, Watch/Edit state,
unchanged canonical bytes during 3D playback, action origin and one-unit undo,
compact desktop, phone/tablet limits, legacy records, recovery, cold-offline
launch, two writers, partition/reconnect, conflict resolution and per-user undo.
Reports: `release-verification.json`, `release-tests.json`,
`release-durability.json`, `coach-3d-performance.json`, `slice7-audit.json`,
`release-smoke-node.json`, `release-smoke-docker.json`, `coach-artifact.json`
under `packages/replaylab/foundation/evidence/`.
Browser reports: `coach-webkit.json`, `coach-firefox.json` and
`coach-firefox-environment.json`. The latter confirms the Firefox failure before
any application URL was opened, with and without storageState and on a clean
retry. No application assertion or browser capability was weakened to hide it.
Earlier Firefox passes belong to the previous application revision.

The final manual coach exercise additionally found stale example captions after
edits/deletion/append. The fix uses current formations, possession, action sets
and paths in all three caption surfaces. Targeted Chromium **14/14**, final
WebKit caption checks **2/2**, then the complete **111/111** and **10/10** passed.
The new cases explicitly retain a custom rich cue through edits and local undo.

One intermediate full run had four outdated UI-label/hidden-control expectations
after the redesign. The expectations were aligned with the actual new labels
and disabled readonly controls; canonical-data, focus, axe, reorder and undo
assertions were retained. The subsequent complete run above passed. On this
Windows host Playwright's Vite teardown hung after all cases finished; only each
identified task-owned preview process was stopped so the pipeline could finish.
No running application or unrelated process was stopped by test cleanup.

Local working package: `http://127.0.0.1:32400/`, from
`tmp/replaylab-coach3d-icon-delivery-20261018`, with the previous local data directory
retained. HTTP `/`, `/healthz` and `/readyz` return 200; local storage backend is
filesystem. This is independent of hosted Supabase readiness.

Archive SHA-256:
`3944ed7e72a1db899b83f9b73ce5a60921757aa3a08edfc4daee38fdd43a400d`.
Docker `replaylab:coach3d-icon-20261018` image identity:
`sha256:aa13d6a0f6e108494785716570bcb1a219920305f3b0293496976999f79975f7`.
The final public mobile check found a missing `/favicon.ico`. The page now
declares the original brand mark as an inline SVG icon. Only `dist/index.html`
differs from the full-suite package; all six frontend files in the final image
match the final package. Fresh local RU/EN mobile checks, Node and Docker smoke,
and all 946 source/extracted archive hashes passed again. Reports:
`coach-icon-package.json`, `coach-icon-local-mobile.json`,
`coach-icon-artifact.json`. The initial public failure and its exact favicon
diagnosis are retained as `public-coach3d-mobile-before-icon.json` and
`public-coach3d-mobile-diagnostic.json`; no console assertion was suppressed.
Existing Yarn peer/optional TypeScript-patch warnings and Vite's chunk-size
warning remain visible; builds, audit and measured gzip budget pass.

The technical audit still explicitly leaves independent trademark review,
manual screen-reader review and human review of the required demo open. Physical
touch hardware, real IME and a coach field study were not substituted by automation.

The confirmed startup diagnosis and independent local-editor fix remain in
force: hosted room reads previously threw before HTTP listen. That application
dependency failure is distinct from an outage of Render itself or network
blocking. The underlying historical Supabase failure remains unproven. A verified
Russian route and controlled VPN on/off comparison are still unavailable.

## Historical: Arena / Пятый темп · 2026-10-17

**Published and verified on the existing service, 2026-10-17.** The owner
explicitly authorized commit, push and Render update: “Разрешаю commit, push и
Render”. Application commit `b735f4beefabd1295835d7821120a90205c4f05e` includes the
Arena revision and the independent-startup fix from parent `1db56b1`.

- [Hosted CI 39062581983](https://github.com/godaylor/replaylab/actions/runs/39062581983)
  completed **success** at 19:33:16 UTC: exact-byte source check, immutable
  installation, Chromium release/durability, audit/package, lint, Node smoke,
  Docker build and non-root container/restore smoke.
- Existing Render service `srv-dah9cq1t0dsc73f4ou50`, Frankfurt **Free**, deployed
  `b735f4b` via [deploy dep-db9srabrjlhs7381urfg](https://dashboard.render.com/web/srv-dah9cq1t0dsc73f4ou50/deploys/dep-db9srabrjlhs7381urfg).
  Status **Deploy succeeded**, duration 50.9s, live at 19:34:52 UTC. No automatic
  deploy appeared after CI; the approved manual **Deploy latest commit** was used.
  No tariff, environment, permissions, schema or storage configuration changed.
- Render logs: `ReplayLab listening on 0.0.0.0:32400; local editor ready`, followed
  by `collaboration.ready` with **3 existing rooms**, before public verification.
- [Public application](https://replaylab-godaylor.onrender.com/) and public
  `/healthz` + `/readyz` return **200**, `collaboration: ready`,
  `storage: supabase-postgres`.
- Fresh installed **Chrome 155.0.8059.80** contexts on this Windows host: RU/EN
  example → keyboard move → draw → append → full playback → reload → recent
  reopen PASS; language/theme retained. Close tab → disconnect → open new tab
  PASS, including existing IndexedDB data and self-hosted font.
- **One new synthetic private room only**: two independent writers,
  bidirectional updates, offline local edits plus concurrent remote edits,
  reconnect/convergence and local undo preserving remote edits PASS. Fresh third
  context restores both writers' edits. Separate view link stays read-only.
  All pre-existing rooms/local records retained; no reset or deletion. Test
  capabilities were kept only in memory and are not included in evidence.
- No captured JavaScript errors or failed HTTP asset responses. Machine report:
  `packages/replaylab/foundation/evidence/public-arena-smoke.json`.

[Public editor screenshot](design/public-arena-editor.png) ·
[Public home screenshot](design/public-arena-home.png) ·
[Render deployment receipt](design/public-arena-render.jpg).
These publication checks apply to application commit `b735f4b`; follow-up
documentation/evidence commits do not change application source.

Working result: `http://127.0.0.1:32400/`, served by the **verified runtime
package**, not the development server. The explicit isolated review document is
`/app/play/arena-preview-final-20261017/edit?lesson=1&db=arena-preview-final-20261017`.
Health returns HTTP 200 with `collaboration: ready, storage: filesystem` locally;
this does not claim readiness of hosted Supabase rooms.

[Three concepts, mockups, real screens and before/after](design/ARENA_REVIEW.md).
[Product and architecture decisions](ARENA_REWORK.md). Previous daylight “After”
images and the section below are historical, owner-rejected design evidence.

### Actual final checks

| Check | Result |
| --- | --- |
| Repository Yarn `workspace @replaylab/foundation-proof verify:release` | **PASS**, all seven stages, exact current application source |
| Chromium full suite | **99/99**, zero failures, flaky results or skips |
| Immediate-close durability repetitions | **10/10**, unchanged assertions |
| Typecheck, client/server builds, lint, working-tree `git diff --check` | PASS |
| New action/endpoint/path tests | PASS: a single undo unit, concurrent remote pose/possession retained, invalid drafts write nothing, deterministic path sampling and ball follows holder |
| New first-use tests | PASS RU/EN: example → move → draw → append → play → reload → home/reopen; appending preserves adjacency and leaves drawing enabled |
| New keyboard/dialog/error checks | PASS: pause before arrow editing, undo/canvas selection alignment, contained dialog Tab/Escape, visible localized validation and failed recovery import with original bytes preserved |
| Theme/locale/reflow | PASS: preferences persist; 320px through wide desktop; phone review/tablet capabilities; browser Ctrl+F/Cyrillic key positions; Home axe scan in both themes |
| Installed Google Chrome | **155.0.8059.80**, fresh profile on this Windows host: HTTP assets, animation, full playback, keyboard/undo and light theme PASS; zero failed HTTP requests |
| WebKit 26.0 / Windows | **17/17** targeted action, Arena, coach and practice tests PASS |
| Firefox 146.0.1 / Windows | **16 PASS, 1 explicit existing skip**: Playwright Firefox cannot emulate the touch context |
| Maximum scene | 12 phases, 10 actors, derived ball, 30 visible actions: **60.005 FPS**, frame p95 **16.7ms**, zero long tasks/root React playback renders, no growth in the reported coarse heap metric |
| License/import/bundle audit | PASS: **78 dependency instances, 31 emitted packages, 0 forbidden modules**, **236,786 gzip JS bytes**; two visual assets included in SBOM/license inventory |
| Packaged Node smoke | PASS, four checks: static/legal/health boundary; two writers; offline conflict/reconnect/local undo; backup into a separate restored directory and fresh read-only offline client |
| Product Docker build + smoke | PASS, same four checks; non-root `node`, read-only filesystem, dropped capabilities; only the task's temporary container was created/removed |

Authoritative machine reports are in `packages/replaylab/foundation/evidence/`:
`release-verification.json`, `release-tests.json`, `release-durability.json`,
`arena-webkit.json`, `arena-firefox.json`, `release-smoke-node.json`,
`release-smoke-docker.json`, `slice7-audit.json`, `slice3-performance.json`.
`docs/design/arena-browser-check.json` records the exact installed-Chrome scope.
`arena-motion.webm` is a 30-second recording of the real app, not generated video.

The earlier availability assertion used the old example's coordinate and hidden
roster; it was updated for the new actual formation/disclosure. An intermediate
run also timed out in `browserContext.newPage` before the application page was
created; its timeout/assertions were not weakened. The affected accessibility
case and the final complete suite subsequently passed. These superseded runs do
not override the final 99-test report.

### Reproducible local delivery

- Runtime package: `tmp/replaylab-arena-delivery-20261017`.
- **946 inventoried files**, all hashes rechecked; no room data inside the package.
- Archive: `tmp/replaylab-arena-delivery-20261017.tar.gz`; 988 safe relative
  archive entries, zero traversal/private data paths.
- Archive SHA-256:
  `884f705ef088b29f83c43ca3d8c5ecc5dbe4c0fe8875945b7526af33818b5d28`.
- Local Docker image `replaylab:arena-20261017`:
  `sha256:dadf448b53d1ab78197ae38846556be3475b246bf9a58575210f47af4220b6a2`.
- The previously locked default `release-dist` was preserved. The guarded
  alternate output is a fresh directory under `tmp`; no ACL/data reset was used.
- `SOURCE_STATE.json` is refreshed after final generated evidence. It preserves
  upstream kernel provenance and explicitly identifies the unmodified OFL font
  as third-party, rather than original product code.

Builds retain the existing Yarn peer/optional TypeScript patch warnings and the
Vite 500KB chunk advisory. Immutable installation/build and the explicit gzip
budget pass. The warnings were not suppressed or “fixed” by dependency upgrades.

### Hosting, network and approval boundaries

The original Render logs confirmed **an application startup dependency failure**:
hosted room reads threw before HTTP listen. It is not evidence of a general
Render outage or Russian blocking. The retained fix starts the editor shell
first, separates `/readyz`, fails room operations closed and retries hosted
restoration without replacing data. A fault-injected server check proves HTTP,
local edits/reload and later room readiness recovery independently.

The old hosted Supabase failure's underlying cause is still unverified. Existing
Supabase sign-in reached owner MFA; automatic approval review rejected further
inspection of the intermediate credential-bearing auth screen. No inspection
or alternate bypass followed. The authenticated Render observations and earlier
host DNS/HTTP timeouts are recorded below; they do not establish DNS/connectivity
inside the current Render container.

The earlier push was automatically rejected under the enclosing repository's
remote-mutation restriction. The owner subsequently explicitly authorized
commit, push to existing `godaylor/replaylab:main` and existing Render update;
the approved actions and exact results are recorded above. No replacement
service, tariff change, database reset or credential/permission change occurred.
Current Supabase readiness and real room writes/reads pass. The historical
intermittent failure's underlying cause is still unproven; current success does
not retroactively establish that cause or replace the pending dashboard review.

**Not tested:** a verified Russian residential/mobile route; a controlled VPN
on/off pair; the owner's existing Chrome profile/extensions; physical iOS/Android
touch hardware; manual NVDA/VoiceOver, real IME, actual browser zoom; human review
of the complete required demo. Local multi-engine automation does not establish
these conditions. Initial exact-name web searching is not independent trademark,
company/store/domain clearance: **Пятый темп / Fifth Tempo remains a working name**.

---

## Historical daylight revision and startup incident — 2026-10-17

Target: existing `godaylor/replaylab` / `replaylab-godaylor`, Frankfurt Free, service `srv-dah9cq1t0dsc73f4ou50`. Standalone checkout was clean at `5c85f73` at start. The enclosing historical repository and other projects' resources are preserved.

### Confirmed incident

The public browser reproduced Render's application-loading screen. After owner sign-in, Render application logs showed repeated `Supabase room read unavailable` exceptions from `SupabaseRoomStorage.readResponse → readRooms → loadRooms → server-entry`, terminating Node before HTTP listen. This is a confirmed application startup dependency failure. It is not evidence that Render itself is down or that the endpoint is blocked in Russia.

At discovery Render still identified `fe37fb0c4372f40b2ac3984f53a2649d5bd4ed7b` as its last successful deployment; GitHub `main` was `5c85f7387304240e4b5651436f59e26458ba7385`. Docker build context/path, `main`, Free plan and `/healthz` were checked in the existing dashboard. No tariff, service, secret, permission or database schema changes were made.

The startup fix serves the editor before hosted storage is available, exposes independent `/readyz`, refuses room API/WS use until complete restoration, and retries hosted initialization. It never falls back to an empty ephemeral room store. A separate first-join error view offers retry/local plays, without displaying a seeded pretend room. Existing cached documents, journal recovery, local undo and network protocol/schema remain unchanged.

### Design and local verification

Three built-in imagegen concepts and a coherent desktop/home/mobile board are saved in [design review](design/REVIEW.md), with [complete prompts](design/PROMPTS.md). Before/after screenshots are real browser captures. No generated bitmap is used as court state or application UI.

Both coach journeys pass: example → move → draw → add phase → play from the beginning → automatic save → reload → home/reopen. Localized room fetch errors and retry screens, locale retention, browser Ctrl+F, Cyrillic-position shortcuts, Escape/focus return and 320px reflow are covered. A production-server test passes with unavailable hosted storage, local edit/reload and later readiness recovery. Atomic room-loading tests prevent partial installation after a corrupt room.

Windows `Page.crash` once did not emit a crash event. The existing Linux crash stimulus was extended to Windows: terminate renderer PIDs obtained from this isolated test browser's own CDP process inventory. No unrelated browser/process is targeted, and every storage/draft/restoration assertion is unchanged. Both crash cases passed three repetitions each.

| Local command / check | Actual result |
| --- | --- |
| Repository Yarn `workspace @replaylab/foundation-proof verify:release` with fresh `REPLAYLAB_RELEASE_DIR` | PASS: typecheck, builds, 89/89 Chromium tests, 10/10 unchanged abrupt-close repetitions, audit and 942-file guarded package |
| Repository Yarn `workspace @replaylab/foundation-proof lint` | PASS |
| Dependency/bundle/provenance audit | PASS: 78 dependency instances, 31 emitted packages, zero forbidden modules; 228,702 gzip JS bytes |
| Maximum-scene playback | 60.005 FPS, p95 16.7 ms, zero long tasks/React playback renders; local runner, not a canonical dedicated host |
| New isolated Node package smoke | PASS: health/legal boundary, two writers, offline conflicts/resolve/local undo, separate-directory backup/restore, fresh read-only client and offline reload |
| Product Docker build and smoke | PASS, non-root/read-only runtime; image `sha256:15523a730bb4a6963ab78c03983fa291a430aa8e000afd7dee49d5d361f1dbec` |
| Focused Chromium coach scenarios after replacing network interception with a real browser disconnect | 4/4 PASS |
| WebKit 26.0 on Windows: coach journey and existing practice suite | 7/7 PASS |
| Firefox 146.0.1: same suite | 6 PASS, 1 existing explicit skip for unsupported Firefox touch emulation |

Cross-engine runs use separate reports `coach-chromium.json`, `coach-webkit.json`, `coach-firefox.json`. Service-worker request interception differed in WebKit; the network-error check now actually disconnects the browser, preserving service-worker coverage and the original language/data assertions. Windows WebKit automation is not physical iOS/Safari or touch-device approval.

Windows refused to move the retained default `release-dist` (`EPERM`). It was preserved, not deleted or given new ACLs. The final exact verification used `tmp/replaylab-coach-verified-20261017`; an earlier identical-runtime isolated package supplied the Node/Docker smoke. Runtime sources/dependencies are unchanged between these artifacts. CI uses a fresh default `release-dist`.

### Network envelope and open conditions

- In-app browser: Render interstitial and authenticated application startup logs observed.
- Host Node HTTPS fetch: `/healthz` timed out after 15,005 ms before the fix was deployed.
- Host DNS: resolving the existing Supabase hostname timed out. This does not establish the resolver behavior inside Render.
- Web fetch environment: could not retrieve the public health URL.
- Supabase dashboard: existing GitHub sign-in reached MFA. Automated approval review refused inspection of the credential-bearing intermediate auth screen; no further inspection/bypass was attempted. Owner completion of MFA and access to the actual project page remain necessary to verify database/project health and the underlying hosted fetch cause.
- Russia residential/mobile access: **not tested**. VPN on/off comparison: **not tested**; no controlled VPN pair or verified Russian test environment was available. No VPN/system-network settings were changed.
- Render Free can still show its ordinary cold-start interstitial; the existing service has not been replaced or upgraded. A previously cached local editor can launch offline.
- Manual NVDA/VoiceOver, real device/touch/IME, actual browser zoom and independent name/mark clearance remain open. Automated checks do not close these reviews.

Publication revision and hosted smoke results will be recorded after those commands complete. Current machine reports are authoritative; dated historical green labels below are not current deployment proof.

---

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
