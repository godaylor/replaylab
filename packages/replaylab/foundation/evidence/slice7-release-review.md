# Slice 7 release review

## Current technical decision — 2026-09-08, after journal authorization

Root rename: PASS. Windows and isolated Linux technical release verification: GREEN (each 74/74 full tests, 10/10 unchanged immediate-close repetitions). Additive emergency journal v1 and nine adversarial recovery/draft tests are implemented; canonical data format and previous portable exports remain compatible. Node and non-root Docker artifact smoke pass two writers, offline conflict/resolve/local undo and separate-copy backup/restore. Current machine reports supersede the historical figures below. Linux evidence is under `local-ci-linux/`; it is not a hosted Actions run or a dedicated canonical host.

Silent 30-second and complete 60-second synthetic demo recordings exist in `evidence/demo-capture/`. Recording/technical smoke is complete; human evaluation of understandability is not. Manual screen-reader/IME/device review, independent name/mark clearance, owner repository/hosted CI and hosting/domain/HTTPS deployment approval remain external gates. No public publication, commit or push was performed.

## Historical failed preflight — 2026-09-08 (superseded)

**ROOT RENAME: PASS. RELEASE PREFLIGHT: BLOCKED.** The historical technical GREEN below is superseded.

Repository Yarn 4.18.0 rebuilt the five workspace junctions after the manual rename to `05-replaylab`; client/server output contains the new root only. The old Yarn state was retained. Node 22.15.1 typecheck and both production builds pass. Git remains on `canary` at the baseline commit, with the existing upstream origin; user changes were preserved.

Full production-route runs recorded **64 passed / 1 failed**. The unchanged Slice 6 immediate-tab-close test can lose the last gesture (expected x=115; reopened x=110); ten focused repetitions recorded seven failures. Explicit IndexedDB commit/transaction completion and local-peer-only readiness are implemented, but do not clear that regression. The repeat gate is now required in the release pipeline. No test has been skipped, loosened, or replaced by waiting for save, and no releasable package is approved.

The standalone HTTP/WebSocket server passes two independent writers, fsynced journal, forced process restart, fresh read-only client, production-route offline reload, disk-failure non-mutation and journal-corruption preservation checks. Site and sync share 32400; verification uses 32410–32412. No foreign process/container was touched.

RU/EN tests, local draft preservation, capability/reflow/axe checks, cold offline, conflict/reconnect/per-user undo and the maximum-scene suites pass. Fresh RU/EN desktop screenshots were inspected; the half-court linework and status-row wrapping were corrected. Human screen-reader and demo review remain unperformed. Latest performance evidence is `slice3-performance.json` (local Windows hardware, not the canonical hosted runner).

Boundary/license audit: PASS, 78 dependency instances, 31 emitted packages, 717,739 raw / 215,694 gzip JS bytes, zero forbidden modules. Server closure, official Yjs compatibility, source notices, inventory and SBOM are included. A passing licensing audit does not imply passing runtime durability.

Own README, CI, runtime/room CLI, fail-closed packaging and optional Docker/Compose configuration exist. Compose config validates. Image build, isolated packaged-runtime smoke, hosted CI/performance and public TLS/host restore checks are not claimed. See `docs/RELEASE.md` and the current PLAN checkpoint.

Remaining order: fix and review immediate-close durability; pass full/repeat gates; package and smoke-test the isolated runtime/image; complete recorded manual accessibility and 30/60-second demo review; clear working name/mark; choose own repository, hosting and domain; restrict inherited workflows; configure/test HTTPS, WebSocket proxy and backups; explicitly authorize publication. No commit, push, deploy, public room or domain was created.

Final verification: full suite 64/65; latest durability repetition 5/10, no skipped tests. The earlier 7-failure repetition is historical diagnostic evidence. Direct packaging correctly refuses `test:release` and no `release-dist` exists. The requested port range is free after test cleanup. Root licenses and denied source roots have no git diff; `git diff --check` passes.

## Historical review — 2026-09-03 (superseded)

Status: **TECHNICAL GREEN / PUBLIC RELEASE BLOCKED**  
Date: 2026-09-03  
Repository baseline: `canary` at `329839e467d936f90230fb02a8983f8eb4b62fc0`

## Implemented

- ReplayLab is the only public product brand in the ReplayLab UI and metadata.
- Russian is the safe default. The public RU/EN switch persists in local storage; unknown saved locales fall back to Russian.
- Navigation, controls, forms, help, errors, empty/loading/status/recovery states, document title and description are localized. User cue content and technical identifiers are not translated.
- Desktop keeps full authoring; tablet permits playback, actor repositioning and cue editing; mobile permits playback, scrubbing, semantic review and cue reading.
- First-edit onboarding disappears only after a successful document command.
- `?demo=1` exposes the deterministic 30/60-second portfolio runbook without changing canonical document state.
- Service-worker fallback content is Russian by default and the shell cache version is `v3`.
- The generated release evidence includes a dependency-license inventory, CycloneDX 1.5 SBOM, source-notice report and `THIRD_PARTY_NOTICES.md`.
- The emitted Excalidraw-derived hit-test has an exact upstream commit/blob, MIT notice, comparison, and local adaptation chain.
- ReplayLab uses official unpatched Yjs `13.6.21`; the former uint53 patch file and lock locator are removed.

## Verification

- Toolchain: official portable Node.js `v22.23.2`, executable SHA-256 `0D0F5E39F9F3D9587BC19F73EAB3C2C9C4903FD02D6DBF9C853DD81B3D95FAD4`; repository Yarn `4.18.0` and existing `yarn.lock`.
- TypeScript no-emit typecheck: PASS.
- Production build: PASS, 843 transformed modules; critical JS 716,835 raw / 215,376 gzip bytes against the 1,500,000-byte gzip gate.
- Slice 7 E2E: PASS, 3/3 on the production preview. Coverage includes RU fallback, EN persistence, localized metadata, desktop/tablet/mobile capability gates, mobile reflow, serious/critical axe scan, deterministic runbook and first-edit onboarding.
- Maximum-scene performance revalidation: PASS, 12 phases / 10 actors / derived ball / 30 actions, 60.003 FPS, 16.7 ms frame interval p95, zero long tasks, zero shell React renders and zero measured heap growth over the 30-second trace.
- Boundary/license/protocol audit: PASS, 78 dependency instances, 31 emitted packages, zero forbidden modules, zero forbidden source/protocol markers.
- Excalidraw provenance: PASS. Exact algorithm variant `00c6940851b362da0d86f155269ef27a94d234c5` / blob `b94e8e7c30f9350c2efa064904c405dd7f99b9c3`; local BlockSuite/AFFiNE adaptation chain and changes recorded; full MIT text included in generated notices.
- Official Yjs compatibility: PASS, 2/2 focused tests. A legacy uint53-authored update opens and state-vector-syncs under unmodified Yjs, and local undo preserves a concurrent legacy remote operation.
- Critical two-context Yjs regression: PASS, 1/1 targeted Slice 5B E2E covering offline edit, concurrent remote edit, reconnect, convergence within the three-second gate, and per-user undo.
- Preview ports `43180`, `43181`, `43182` and `43183` plus sync port `42175` were checked free before use; temporary servers were stopped and no foreign process was changed.
- There is no package-local lint script. No dependency or ad-hoc linter was installed.
- Only the Yjs-sensitive Slice 5B critical two-context path was rerun. Other already-GREEN Slice 5B and Slice 6 checks were reviewed without repetition.

## Open release blockers

- Independent trademark availability is not checked.
- Public domain selection/availability is not checked, and public-domain deployment is not authorized.
- Manual screen-reader review is not recorded.
- The silent 30-second capture and human-observed 60-second demo have not been recorded. Automated screenshots exist, but Codex image inspection was blocked by the Windows sandbox `apply deny-read ACLs` error.

## Folder rename readiness

No source, public asset, config, documentation, or plan file contains a hard-coded `05-affine-transform`, `05-replaylab`, or `E:\Projects` path. Generated `dist/bundle-closure.json` records absolute module paths by design and must be regenerated after a future folder rename. The repository is technically ready for a separate, closed-workspace rename to `05-replaylab`; that rename does not clear the release blockers above.
