# Reusable scope

Статус: normative boundary для будущей реализации  
Upstream baseline: `329839e467d936f90230fb02a8983f8eb4b62fc0`

## 1. Scope statement

Foundation — не AFFiNE web app. Это разрешённый BlockSuite editor/canvas/local-sync subgraph, обёрнутый новым product-owned facade, shell и realtime backend.

Цель extraction — сохранить настоящие механизмы CRDT editor, selection, undo, commands, Gfx/Surface, spatial rendering и local-first persistence, не унаследовав workspace, AI, database, cloud, account, native и enterprise продукт AFFiNE.

## 2. Three different closures

| Closure | Размер | Назначение |
|---|---:|---|
| Official `@affine/web` declared workspace closure | 85 packages | Только baseline official product; не foundation |
| Existing root + foundation lower bound | 46 BlockSuite packages | Фактическая связность текущего root editor |
| Reproducible 14-seed editor/canvas audit probe | 50 workspace packages в текущих manifests | Point-in-time install closure, not an allowlist |
| Target runtime palette | существенно меньше, измеряется build stats | Только реально зарегистрированные blocks/tools/widgets |

50-пакетная closure получена обходом local workspace `dependencies`, `optionalDependencies` и `peerDependencies` от точного seed set:

`@blocksuite/global`, `@blocksuite/sync`, `@blocksuite/store`, `@blocksuite/std`, `@blocksuite/affine-foundation`, `@blocksuite/affine-rich-text`, `@blocksuite/affine-block-root`, `@blocksuite/affine-block-paragraph`, `@blocksuite/affine-block-note`, `@blocksuite/affine-block-surface`, `@blocksuite/affine-block-edgeless-text`, `@blocksuite/affine-widget-edgeless-selected-rect`, `@blocksuite/affine-widget-toolbar`, `@blocksuite/affine-widget-remote-selection`.

The traversal was rerun against the pinned checkout during verification: 14 seeds → 50 workspace packages. This probe is manual point-in-time evidence; Slice 0 must persist the generated package/path/edge snapshot used by CI. It is smaller than the 70-package umbrella but still pulls unwanted blocks through static `affine-block-root` dependencies.

Нельзя подменять install-time closure runtime tree shaking. Оба числа должны измеряться отдельно.

## 3. Allowlisted kernel

Эти пакеты составляют hard kernel:

- `blocksuite/framework/global` — signals, disposables, environment, DI utilities;
- `blocksuite/framework/sync` — generic `DocSource`, `DocEngine`, `SyncPeer`, IndexedDB, BroadcastChannel, awareness abstractions;
- `blocksuite/framework/store` — Yjs-backed block store, schemas, selection, history, adapters;
- `blocksuite/framework/std` — editor host, commands, event dispatch, inline editing, Gfx controller/grid/layers/viewport/tools.

Нормативный dependency direction:

```text
global <- sync <- store <- std
```

Product code может импортировать их только через `ReplayLabEditorFacade`, `ReplayLabSyncFacade` и узкие typed adapters. Прямые imports BlockSuite internals из React features запрещены.

## 4. Provisional semantic AFFiNE/BlockSuite slice

Only the four framework packages above are directly allowlisted today. Every entry below has an MIT manifest at version `0.27.0`, but remains **provisional/denied for shipping** until Slice 0 records its exact transitive closure, nested licenses, inline provenance, patches, emitted bundle presence, and an explicit approval in `LICENSE_BOUNDARIES.md`.

Минимально нужные capabilities:

| Exact package | Repository path | Candidate use |
|---|---|---|
| `@blocksuite/affine-model` | `blocksuite/affine/model` | block/surface schemas |
| `@blocksuite/affine-foundation` | `blocksuite/affine/foundation` | composition primitives |
| `@blocksuite/affine-shared` | `blocksuite/affine/shared` | narrowly selected shared contracts; high notice-pruning priority |
| `@blocksuite/affine-rich-text` | `blocksuite/affine/rich-text` | coaching cues |
| `@blocksuite/affine-inline-preset` | `blocksuite/affine/inlines/preset` | inline formatting |
| `@blocksuite/affine-inline-link` | `blocksuite/affine/inlines/link` | cue links, only if required |
| `@blocksuite/affine-block-root` | `blocksuite/affine/blocks/root` | cue root; largest closure risk |
| `@blocksuite/affine-block-paragraph` | `blocksuite/affine/blocks/paragraph` | cue paragraphs |
| `@blocksuite/affine-block-list` | `blocksuite/affine/blocks/list` | cue lists |
| `@blocksuite/affine-block-surface` | `blocksuite/affine/blocks/surface` | viewport/renderer extension points |
| `@blocksuite/affine-gfx-pointer` | `blocksuite/affine/gfx/pointer` | pointer projection/tool support |
| `@blocksuite/affine-widget-edgeless-selected-rect` | `blocksuite/affine/widgets/edgeless-selected-rect` | selection feedback, if product adapter cannot replace it |
| `@blocksuite/affine-widget-remote-selection` | `blocksuite/affine/widgets/remote-selection` | remote feedback, if product awareness projection cannot replace it |

Packages observed in the 14-seed probe but not listed here—such as generic note, edgeless-text, toolbar, code, database, embeds, attachments, mindmap and shape zoo—are not candidates merely because the current root pulls them transitively. Slice 0 must prune them from the emitted graph or fail the foundation gate. Optional packages are denied by default.

Target product registers only:

- paragraph and list blocks with inline formatting/link only;
- one product-owned `replay:cue` block;
- product-owned actor/action projection elements;
- select, pan, actor move, pass/cut/dribble/screen path tools;
- a narrow product toolbar and timeline.

Do not register database, data-view, embeds, mind map, brush, generic shape zoo, frames, bookmarks, attachments catalogue, AI or AFFiNE app extensions.

## 5. Compatibility oracle vs shipping composition

`blocksuite/affine/all/src/extensions/{store,view}.ts` is useful as an executable composition oracle. It may be used in an isolated baseline spike to identify missing extensions.

It must not become the product architecture:

- no product module imports `@blocksuite/affine` umbrella;
- final extension list is explicit and snapshot-tested;
- unused blocks/tools are not registered;
- production build stats prove which modules ship;
- any slim-root changes stop after a five-day timebox unless they unlock a measured budget.

## 6. Product-owned layers

The following are always new code:

- React web shell, routing, design system and error boundaries;
- ReplayLab domain types, commands, migrations and projection store;
- court background, actor/action renderers and keyframe timeline;
- input coordinator and keyboard map;
- semantic canvas DOM companion and announcements;
- local readiness/sync status UX;
- network `DocSource`, awareness source and protocol;
- room/auth/persistence backend;
- tests, fixtures, public demo and product branding.

No AFFiNE compatibility is a goal.

## 7. Reference-only paths

The following may be studied by architecture auditors for patterns but not copied wholesale or imported by product code:

- `packages/frontend/apps/web` — bootstrap/worker pattern;
- `packages/frontend/core` — React/Lit integration and scoped state patterns;
- `packages/common/infra` — `useSyncExternalStore`/selector ideas;
- AFFiNE desktop/mobile routing and responsive behaviour.

`packages/common/nbstore`, `packages/common/realtime`, `packages/common/graphql`, and backend implementations are stricter than ordinary reference-only paths: only provenance auditors may inspect them to record risks and forbidden protocol markers. Transport/server implementers must not use them as design references.

### Resolved audit contradiction

The storage audit found `@affine/nbstore` technically relevant, while the licensing/provenance audit classified it as an AFFiNE-specific protocol boundary coupled to `realtime` and `graphql`. The stricter rule wins: `packages/common/nbstore`, `realtime` and `graphql` are forbidden implementation/reference sources for transport developers. The product uses the smaller MIT `@blocksuite/sync` API, generic Yjs contracts, separately reviewed upstream sources, and new adapters.

## 8. Forbidden roots

Never copy, import, compile, vendor or derive protocol code from:

- `packages/backend/**`;
- `packages/common/native/**`;
- `packages/frontend/native/**` and `packages/frontend/mobile-native/**`;
- Electron, Android, iOS, mobile and mobile-shared apps;
- `packages/frontend/admin/**`;
- `packages/common/nbstore/**`;
- `packages/common/realtime/**`;
- `packages/common/graphql/**`;
- `blocksuite/docs/**` and `blocksuite/docs-site/**` without separate legal review.

Do not use AFFiNE endpoint names, Socket.IO event names, envelopes, auth tokens, migrations or compatibility logic in the new network implementation.

## 9. State ownership contract

| State | Owner | Durable/shared? |
|---|---|---|
| actors, keyframes, actions, cue blocks | Yjs document | durable + collaborative |
| resolved poses, sorted frames, conflict projection | derived store | rebuildable |
| viewport, playhead, current tool, pointer draft | interaction state | local only |
| cursor, selection, gesture ghost, presenter state | awareness | ephemeral |
| theme, pane sizes, reduced motion | local preferences | local durable |
| room ACL/token hashes | new server | server authority |

No durable entity may be mirrored into Redux/Zustand/Jotai as a second source of truth. React subscribes to typed projections through fine-grained selectors.

## 10. Dependency and provenance gates

Before a dependency or source path enters the product:

1. It is inside the allowlist or receives an explicit boundary decision.
2. Its direct and transitive licenses are recorded.
3. Any nested `LICENSE`, inline provenance or local patch is classified.
4. Its runtime weight is measured in production build stats.
5. Its public API is wrapped behind a facade when upstream churn is likely.
6. A CI rule rejects imports from forbidden roots.
7. A release SBOM and `THIRD_PARTY_NOTICES` are generated and reviewed.

## 11. Foundation acceptance criteria

The foundation is accepted only when a new shell can demonstrate, without AFFiNE core:

- rich cue editing backed by `Y.Text`;
- actor drag and action-path authoring through Gfx/Surface extension points;
- one unified local-only undo stack for cue + court commands;
- IndexedDB reload and same-browser BroadcastChannel convergence;
- explicit extension registration;
- keyboard alternative and semantic DOM representation for every P0 action;
- no import or runtime reference to any forbidden root;
- a measured production bundle and performance fixture.

If unified history/projection cannot be implemented through supported extension points within the Phase 0 timebox, use the Incident Replay fallback described in [PRODUCT_OPTIONS.md](./PRODUCT_OPTIONS.md); do not fork the whole AFFiNE shell.
