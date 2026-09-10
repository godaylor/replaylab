# License boundaries

Статус: normative engineering policy  
Audited checkout: `329839e467d936f90230fb02a8983f8eb4b62fc0`  
Disclaimer: это инженерная инвентаризация, не юридическое заключение.

## 1. Governing files

The checkout contains:

- root `LICENSE`;
- root `LICENSE-MIT`;
- identical EE license texts in `packages/backend/server/LICENSE`, `packages/backend/native/LICENSE`, `packages/common/native/LICENSE`;
- five nested MIT license files for embedded BlockSuite utilities;
- no tracked `NOTICE*` file.

Root rules:

- `LICENSE:5` directs all `packages/backend/**` and `packages/common/native/**` content to the backend server license;
- `LICENSE:6` preserves original third-party component licenses;
- `LICENSE:7` assigns remaining content to `LICENSE-MIT`;
- `LICENSE-MIT:12-13` requires preservation of copyright and permission notice.

Supplementary official sources pinned to the audited commit: [AFFiNE repository license](https://github.com/toeverything/AFFiNE/blob/329839e467d936f90230fb02a8983f8eb4b62fc0/LICENSE), [AFFiNE backend EE license](https://github.com/toeverything/AFFiNE/blob/329839e467d936f90230fb02a8983f8eb4b62fc0/packages/backend/server/LICENSE), [Mozilla MPL 2.0 FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/).

## 2. Boundary matrix

| Zone | Observed status | Project policy |
|---|---|---|
| `blocksuite/framework/{global,store,std,sync}` | manifests explicitly say MIT | allowlisted foundation |
| selected `blocksuite/affine/**` packages | manifests generally say MIT; root default MIT | provisional candidates; denied until an exact dependency/notices decision |
| `packages/frontend/**` TypeScript | root default MIT, but product/protocol/brand coupling | do not take wholesale |
| `packages/backend/**` | EE directory carve-out | forbidden |
| `packages/common/native/**` | EE directory carve-out | forbidden |
| frontend native/electron/mobile artifacts | may say MIT but depend on restricted/native/AGPL-exception crates | forbidden |
| `blocksuite/docs/**`, `blocksuite/docs-site/**` | manifests say MPL-2.0 without a local top-level MPL text | exclude or legal review |
| `packages/frontend/admin/**` | enterprise/admin product contour | forbidden by policy |
| `packages/common/{nbstore,realtime,graphql}/**` | paths may be MIT, but implement AFFiNE-specific cloud protocol | forbidden by provenance policy |

## 3. EE hard boundary

`packages/backend/server/LICENSE` states, in summary:

- production use requires compliance with subscription terms and a valid EE subscription;
- modifications/patches remain restricted for production exploitation;
- development/testing use is treated differently;
- other copying, merging, publishing, distribution, sublicensing or sale is restricted;
- the EE text must accompany covered copies/substantial portions.

The same text contains a CE/client-side MPL carve-back that is difficult to reconcile with the directory rule and README's CE/MIT language. The project does not resolve this ambiguity in its own favor.

**Normative control:** no file, build artifact, snippet or protocol implementation from `packages/backend/**` or `packages/common/native/**` may enter ReplayLab, even if someone argues that a client-side or CE carve-back applies.

## 4. Metadata is not sufficient

Examples:

- root `package.json` says MIT, while root `LICENSE` contains directory-specific exceptions;
- `packages/frontend/native/package.json` says MIT, while its Rust crate depends on `affine_common` from the restricted native boundary;
- frontend mobile-native also depends on `affine_common`;
- Rust allowlist contains AGPL exceptions for selected native dependencies.

Therefore package metadata is never the sole licensing decision. The governing path, dependency graph, nested licenses and patches are reviewed together.

## 5. Allowlist

Directly allowlisted at this baseline, subject to notices and dependency scan:

- `blocksuite/framework/global`;
- `blocksuite/framework/sync`;
- `blocksuite/framework/store`;
- `blocksuite/framework/std`;
- new original ReplayLab shell, domain, adapters, backend, tests and branding.

`@blocksuite/sync` is specifically acceptable because this checkout contains generic/browser-local `DocSource`, IndexedDB and BroadcastChannel implementations, not the AFFiNE cloud transport.

The exact provisional `blocksuite/affine/**` candidates are inventoried in [REUSABLE_SCOPE.md](./REUSABLE_SCOPE.md). Candidate status is not permission to ship. Slice 0 must generate a manifest-level direct/transitive closure snapshot and add an explicit decision for every emitted package, nested license, inline source notice, and patch. An optional or newly discovered package remains denied until that decision is recorded here.

## 6. Denylist

Never import, copy, compile, vendor or port:

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

Do not take whole packages:

- `packages/frontend/apps/web`;
- `packages/frontend/core`;
- `packages/frontend/component`.

The web/core/component roots may be studied read-only for architecture patterns, but implementation must be original or use the allowlisted BlockSuite public surface. Denied protocol roots `nbstore`, `realtime`, `graphql`, and backend are different: only provenance auditors may inspect them to record forbidden markers. Developers of the new transport/server must not use those implementations as design references. Their implementation sources are the product-owned specification, generic Yjs contracts, and separately reviewed upstream dependencies.

## 7. AFFiNE protocol prohibition

The new product must not reproduce or remain compatible with:

- AFFiNE `/graphql` and version headers;
- `legacy`/`batch` sync compatibility modes;
- `space:join`, `space:load-doc`, `space:push-doc-update`, broadcast event names;
- AFFiNE realtime request/topic envelopes;
- AFFiNE auth tokens, account flows, migrations or cloud endpoints.

ReplayLab protocol begins with a product-owned specification and message schema. Separately licensed upstream Yjs providers may be evaluated as dependencies; AFFiNE protocol code may not.

## 8. Embedded third-party notices

The following nested MIT license texts must be preserved when corresponding code ships:

- `blocksuite/affine/blocks/surface/src/utils/path-data-parser/LICENSE` — Preet Shihn;
- `blocksuite/affine/blocks/surface/src/utils/points-on-curve/LICENSE` — Preet Shihn;
- `blocksuite/affine/blocks/surface/src/utils/points-on-path/LICENSE` — Preet;
- `blocksuite/affine/blocks/surface/src/utils/rough/LICENSE` — Preet Shihn;
- `blocksuite/framework/global/src/gfx/perfect-freehand/LICENSE` — Stephen Ruiz Ltd.

Inline provenance inventory:

| Source path | Upstream marker | Baseline decision |
|---|---|---|
| `blocksuite/affine/shared/src/adapters/markdown/gfm.ts` | Titus Wormer/GFM copyright header | exclude unless rich-cue import requires it; otherwise verify version/license and notice |
| `blocksuite/affine/components/src/hover/middlewares/safe-area.ts` | Floating UI `safePolygon` port | provisional; emitted-code scan decides, then verify version/license and notice |
| `blocksuite/framework/store/src/adapter/base.ts` | Rich Harris `estree-walker` MIT port | kernel path; verify exact upstream revision and include required notice |
| `blocksuite/framework/global/src/gfx/math.ts` | Excalidraw hit-test credit | verified MIT derivative; exact revision `00c6940851b362da0d86f155269ef27a94d234c5` and local adaptation chain recorded |
| `blocksuite/affine/blocks/surface/src/utils/index.ts` | Excalidraw-derived utility | provisional surface path; verify or exclude |
| `blocksuite/affine/data-view/src/core/utils/utils.ts` | jQuery visibility helper | excluded with data-view |
| `blocksuite/affine/shared/src/utils/figma-squircle/index.ts` and `draw.ts` | figma-squircle/Figma Squircles sources | provisional; verify or exclude from emitted shared closure |
| `blocksuite/affine/shared/src/utils/number-prefix.ts` | Roman numeral gist | provisional; verify or exclude |
| `blocksuite/affine/blocks/surface/src/utils/points-on-curve/index.ts` | offset Bézier source | preserve adjacent nested MIT license and verify upstream attribution |

This is a point-in-time inventory, not clearance. Before release, record upstream project/version/revision and `verified | excluded | pending` status in the generated provenance report. A pending item blocks release.

Slice 7 provenance review identifies the exact Excalidraw variant as `excalidraw/excalidraw@00c6940851b362da0d86f155269ef27a94d234c5`, `src/element/collision.ts` blob `b94e8e7c30f9350c2efa064904c405dd7f99b9c3`. BlockSuite adapted it in `ebdcea25b5dd8cf1ec851ffbb13d6e5c4dbb872d` and retained the characteristic endpoint precheck plus zero-based segment loop introduced by `00c6940`. The function was renamed and decoupled from Excalidraw types/dispatch/bounds helpers; the inline credit remains and the full Excalidraw MIT notice is generated into `THIRD_PARTY_NOTICES.md`. Machine-readable changes and the full commit/blob chain are in `slice7-source-notices.json`.

## 9. Yjs compatibility decision

Slice 7 closes this technical gate with official, unmodified Yjs `13.6.21`:

- the root resolution is `npm:13.6.21` and the package resolution in `yarn.lock` is the official npm locator;
- the previous local uint53 patch file and its stale lock locator are removed; no fork, patch-package entry, patch locator, or hidden Yjs modification remains;
- installed code uses upstream `generateNewClientId = random.uint32` and contains no `random.uint53` client-ID override;
- the installed package is MIT and its license text/hash remain in the generated license inventory and `THIRD_PARTY_NOTICES.md`;
- compatibility tests prove that official Yjs accepts and state-vector-syncs an update authored with a legacy client ID above uint32, and that local scoped undo preserves a concurrent legacy-uint53 remote operation;
- the established two-browser online → offline edit → concurrent edit → reconnect → convergence → per-user undo path passes unchanged.

Official artifact evidence records npm integrity/SHA-1, package `gitHead`, the `v13.6.21` tag commit, installed license hash, runtime generator, and the absence of patch references. See `packages/replaylab/foundation/evidence/slice7-provenance-compatibility.md` and `slice7-audit.json`.

### Slice 0 boundary decision — 2026-08-28

Slice 0 is approved for the isolated `packages/replaylab/foundation` proof with these exact constraints:

- direct BlockSuite reuse is limited to `@blocksuite/global`, `@blocksuite/store`, `@blocksuite/std`, and `@blocksuite/sync` from their allowlisted framework roots;
- no `blocksuite/affine/**`, `@affine/**`, application-shell, backend, native, enterprise, GraphQL, realtime, nbstore, or AFFiNE protocol module is a direct, transitive, or emitted dependency;
- the generated report classifies all 74 direct/transitive runtime package instances and all 27 emitted packages. Framework workspaces are `APPROVED_DIRECT_KERNEL`; separately installed dependencies with permissive recorded SPDX licenses are `ACCEPTED_THIRD_PARTY_RUNTIME`;
- DOMPurify's `(MPL-2.0 OR Apache-2.0)` expression is accepted under its Apache-2.0 option, whose license text is present in the installed package. `fractional-indexing` is accepted under CC0-1.0. Both remain in the generated inventory and notices must be preserved as applicable;
- the Rich Harris `estree-walker` MIT port, Excalidraw hit-test credit, and Stephen Ruiz Ltd `perfect-freehand` MIT license markers are present and must remain preserved;
- the existing patched Yjs 13.6.21 runtime is retained for the proof. The patch file hash and active `uint53` code are recorded; schema/history/IndexedDB browser tests provide Slice 0 compatibility evidence. Upstream notice and final retain-versus-unpatched review remain release gates;
- the production emitted closure is 116,997 gzip bytes, contains zero denylisted paths, and has zero AFFiNE protocol marker candidates.

Authoritative machine-readable evidence is `packages/replaylab/foundation/evidence/slice0-audit.json`. This decision approves only the Slice 0 foundation proof; it does not approve any provisional `blocksuite/affine/**` candidate or authorize Slice 1A.

## 10. CLA

AFFiNE requires its CLA for contributions sent upstream. The CLA grants broad copyright and patent rights while stating contributors retain their rights.

Policy:

- any upstream PR follows AFFiNE's CLA process;
- the CLA does not replace licenses for an independent fork/product;
- no contributor is asked to bypass or misrepresent authorship/provenance;
- ReplayLab original contributions use their own repository contribution policy if the product is separated later.

## 11. Trademark and brand

No explicit trademark grant was found in the audited license texts. ReplayLab therefore uses:

- a new product name, logo, favicon and copy;
- original/cleared court artwork and demo content;
- no AFFiNE logo, onboarding art, screenshots or visual identity;
- no implication of AFFiNE/TOEVERYTHING endorsement.

Required copyright attribution for reused code remains visible in license/notices even though product branding is independent.

## 12. Independent backend policy

The new backend owns:

- room/capability model;
- ACL and token hashes;
- WebSocket transport;
- update log/snapshot persistence;
- presence relay;
- retention/recovery;
- rate limits and observability.

Its protocol names, envelopes and storage model are original. It does not import or compile AFFiNE backend/common protocol code and does not advertise AFFiNE server compatibility.

## 13. CI enforcement

Required gates before implementation is considered mergeable:

1. Forbidden-path import scan over source and build graph.
2. Marker scan for known AFFiNE protocol endpoints/event names.
3. Nested `LICENSE` inventory diff; any new file blocks until classified.
4. Dependency license scan and production SBOM.
5. Production bundle provenance report for selected BlockSuite modules.
6. `THIRD_PARTY_NOTICES` generation and human review.
7. Brand asset scan for AFFiNE names/logos/favicon hashes.
8. Review of every vendored file or local dependency patch.

Suggested deny patterns are policy inputs, not a substitute for review:

```text
packages/backend/
packages/common/native/
packages/common/nbstore/
packages/common/realtime/
packages/common/graphql/
packages/frontend/native/
packages/frontend/mobile-native/
packages/frontend/apps/electron/
packages/frontend/apps/electron-renderer/
packages/frontend/apps/android/
packages/frontend/apps/ios/
packages/frontend/apps/mobile/
packages/frontend/apps/mobile-shared/
packages/frontend/admin/
packages/frontend/apps/web/
packages/frontend/core/
packages/frontend/component/
blocksuite/docs/
blocksuite/docs-site/
```

The CI rule is generated from one canonical policy list and tests that every path pattern resolves against the pinned checkout. A stale/nonexistent pattern fails the policy test rather than silently reducing coverage.

## 14. Release checklist

- [x] Exact upstream commit and modified files recorded for the emitted Excalidraw-derived hit test.
- [x] No forbidden source/import/build artifact present in the Slice 7 production audit.
- [x] Root composite `LICENSE`, `LICENSE-MIT`, and every nested `LICENSE` covering retained source are preserved; generated notices supplement rather than replace them.
- [x] All emitted nested third-party notices included.
- [x] Official unpatched Yjs runtime decision and compatibility evidence documented.
- [x] npm/JS and server runtime dependency licenses scanned.
- [x] SBOM generated from production artifacts.
- [ ] “ReplayLab” (an uncleared working title), final product name, mark, logo, domain, and brand assets are independently cleared.
- [x] Demo assets are original or documented CC0/permissive content: synthetic seed poses/cues, product-owned canvas linework and CSS/letter mark; no imported team/player media or non-system font. Source review recorded 2026-09-08; mark clearance remains open above.
- [x] No claim of AFFiNE endorsement or compatibility: ReplayLab README explicitly disclaims endorsement; public UI uses ReplayLab only (2026-09-08 review).
- [ ] External counsel review obtained if distribution/commercial context requires it.

## 15. Decision rule

When technical convenience conflicts with this document, the license boundary wins. Work stops until an allowed implementation is identified; no license requirement may be removed, bypassed or reinterpreted to keep schedule.
