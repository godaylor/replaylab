# Slice 7 provenance and Yjs compatibility review

Status: **TECHNICAL GREEN**  
Date: 2026-09-03  
Repository baseline: `canary` at `329839e467d936f90230fb02a8983f8eb4b62fc0`

## Excalidraw hit-test provenance

The emitted `isPointOnlines` implementation in `blocksuite/framework/global/src/gfx/math.ts` derives from Excalidraw's `hitTestFreeDrawElement` variant introduced by commit [`00c6940851b362da0d86f155269ef27a94d234c5`](https://github.com/excalidraw/excalidraw/commit/00c6940851b362da0d86f155269ef27a94d234c5), `src/element/collision.ts` blob `b94e8e7c30f9350c2efa064904c405dd7f99b9c3` (`fix: freehand points`, 2021-10-11).

This revision is exact rather than date-inferred: it introduced the two characteristic changes retained by the current implementation—an unconditional distance precheck against the first two points and the segment loop running from index `0` while `i < points.length`. The earlier Excalidraw introduction commit `49c6bdd5206b7023c938c0dd6030be64f3317452` instead guarded the dot branch with `points.length === 2` and iterated from `1` to `points.length - 1`.

The local provenance chain is:

1. Excalidraw `00c6940851b362da0d86f155269ef27a94d234c5` — exact algorithm variant.
2. BlockSuite `ebdcea25b5dd8cf1ec851ffbb13d6e5c4dbb872d` — adds the adapted function to `packages/framework/global/src/utils/math.ts`, resulting blob `04ca7f64b510defc5e43c844b929a14e00afe317`.
3. AFFiNE `30200ff86dc4fd5e1966b5aa4507db8e924f16a5` — imports the BlockSuite source into this repository.
4. AFFiNE `66d9d576e0af347248eb14609399ffaee6aa5857` — moves it to the current `gfx/math.ts` path. The later `588659ef6781ef3b56f4ca88aa30d6ef7beb39ff` change does not alter this function.

Documented local adaptations:

- `hitTestFreeDrawElement` was renamed to `isPointOnlines`.
- Excalidraw element and point types became BlockSuite `Bound`, `points`, `rotate`, and `hitPoint` parameters.
- `getElementAbsoluteCoords` became the bound's `minX/minY/maxX/maxY`, with BlockSuite's `rotatePoint` handling the counter-rotation.
- Excalidraw-specific dispatch, bounding-box code, and explanatory comments were not copied; the inline Excalidraw credit remains.
- The core endpoint/segment algorithm from `00c6940` is retained.

At the exact upstream revision, Excalidraw's repository `LICENSE` is MIT with `Copyright (c) 2020 Excalidraw`. The generated `THIRD_PARTY_NOTICES.md` now includes that complete license text, exact commit/blob, adaptation path, and the existing inline attribution.

## Official Yjs 13.6.21

ReplayLab now resolves `yjs` to the official npm artifact `13.6.21` through root resolution `npm:13.6.21`. The previous local `uint53` patch file and its lockfile locator were removed. There is no fork, patch-package entry, Yjs patch locator, or active `random.uint53` modification.

Recorded official artifact metadata:

- npm integrity: `sha512-/fzzyeCAfr3Qwx1D71zvumm64x+Q5MEFel6EhWlA1IBFxWPb7tei4J2a8CJyjpYHfVrRij5q3RJTK9W2Iqjouw==`
- npm SHA-1: `888b7077a7236120ae6b74e58ddbef3c9863825a`
- package `gitHead`: `89dddc2a95079460b7203bde07f45dffd56629f2`
- official tag `v13.6.21`: `1f79e4c6f32c43362b2fbaa775604f46b3880da7`
- installed license: MIT; `node_modules/yjs/LICENSE` SHA-256 `341baa53605ed85d6f95782322854cca56c655ebc7fd4712649b8e7afc6020ff`
- installed generator: `generateNewClientId = random.uint32`; no `random.uint53` occurrence.

Compatibility evidence under Node.js 22.23.2 and Yarn 4.18.0:

- `tests/slice7.yjs.pw.spec.ts`: 2/2 PASS. Official Yjs reads and state-vector-syncs an update authored with a deterministic client ID above `uint32`; scoped local undo removes the local operation while preserving a concurrent legacy-`uint53` remote operation.
- targeted `tests/slice5b.e2e.spec.ts`: 1/1 PASS. Two browser contexts pass online → offline local edit → concurrent remote edit → reconnect → convergence within the existing three-second gate → per-user undo preserving collaborator work.
- `tests/slice7.e2e.spec.ts`: 3/3 PASS on the production route.
- TypeScript no-emit typecheck: PASS.
- Production build: PASS, 843 modules; critical JavaScript 716,835 raw / 215,376 gzip bytes.
- Slice 7 provenance/license/SBOM audit: PASS; 78 dependency instances, 31 emitted packages, zero forbidden modules or source/protocol markers, and no audit failures.

This closes the technical Excalidraw/Yjs part of the Slice 7 hard gate. Trademark availability, domain availability/publication authorization, manual screen-reader review, and human review of the silent 30-second/full 60-second demo remain outside this technical decision and block public release.
