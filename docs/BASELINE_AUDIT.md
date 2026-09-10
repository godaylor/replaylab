# AFFiNE baseline audit

Статус: source-audited baseline, без изменений исходного кода  
Дата аудита: 2026-08-27  
Checkout: `canary@329839e467d936f90230fb02a8983f8eb4b62fc0`  
Версия monorepo: `0.27.0`

## Executive summary

AFFiNE нельзя разумно трансформировать как единый продукт. Его web-приложение — это оболочка из React, custom DI/`LiveData`, routing/workbench, cloud/account/business modules и BlockSuite. Полный declared workspace closure `@affine/web` составляет 85 пакетов: 70 `@blocksuite/*`, 14 `@affine/*` и `@toeverything/infra`. Это dependency closure, а не фактический размер production bundle.

Пригодное ядро находится ниже product shell:

- BlockSuite Store/Std/Sync дают Yjs document model, typed commands, selection, per-user undo, IndexedDB, BroadcastChannel и awareness;
- BlockSuite AFFiNE editor packages дают rich text, root/page mode и edgeless Gfx/Surface;
- canvas использует hybrid DOM/Canvas rendering, spatial grid, layers, viewport culling и gesture tools;
- AFFiNE-specific shell, cloud protocol, backend, native и enterprise контуры в foundation не входят.

Baseline сильный, но не следует обещать больше, чем подтверждено: текущий web-клиент поддерживает local persistence и offline editing после загрузки, но в checkout не найден cold-offline PWA app shell, persistent-storage request или надёжный unload flush barrier.

## 1. Reproducibility envelope

| Параметр | Зафиксированное значение |
|---|---|
| Git branch | `canary` |
| Git commit | `329839e467d936f90230fb02a8983f8eb4b62fc0` |
| Worktree до документации | clean |
| Root package version | `0.27.0` |
| Required Node | `>=22.12.0 <23.0.0`, `package.json` |
| Обнаруженный Node | `v22.15.1` |
| Package manager | `yarn@4.18.0`, `package.json` |
| Install state | `node_modules`, `.pnp.cjs`, `.yarn/install-state.gz` отсутствуют |
| Исполняемые проверки | не запускались: Yarn и зависимости отсутствуют |

Это означает, что аудит подтверждает структуру и поведение по исходникам и существующим тестам, но не заявляет, что этот checkout уже прошёл build/typecheck/test в данном окружении. Bootstrap зависимостей сознательно не выполнялся, чтобы не менять состояние репозитория.

## 2. Monorepo и official web product

Root workspaces охватывают `blocksuite/**/*`, `packages/*/*`, frontend apps, tools и tests (`package.json`). TypeScript использует composite project references; web production build выполняется Rspack через `affine bundle`, а Vite остаётся в test/playground tooling.

### Official web path

```text
packages/frontend/apps/web/src/index.tsx
  -> setup.ts
  -> app.tsx / custom Framework DI
  -> packages/frontend/core
  -> BlockSuite editor + product modules
  -> nbstore worker
  -> IndexedDB / BroadcastChannel / optional AFFiNE cloud
```

Ключевые evidence points:

- web entry и dependencies: `packages/frontend/apps/web/package.json:6-21`;
- React mount: `packages/frontend/apps/web/src/index.tsx:1-17`;
- Framework, workspace flavours и worker: `packages/frontend/apps/web/src/app.tsx:28-70,98-114`;
- worker adapters: `packages/frontend/apps/web/src/nbstore.worker.ts:3-18`;
- Rspack targets и editor workers: `tools/cli/src/bundle.ts:53-128`;
- production splitting: `tools/cli/src/rspack-shared/cache-group.ts:7-99`.

### Declared workspace closure

`@affine/web` раскрывается в 85 workspace-пакетов:

- `@affine/web`, `core`, `component`, `env`, `nbstore`, `track`, `debug`, `error`, `graphql`, `i18n`, `electron-api`, `reader`, `realtime`, `templates`;
- `@toeverything/infra`;
- 70 BlockSuite packages через umbrella `@blocksuite/affine`.

These are point-in-time manifest inventories, not runtime bundle claims. The audit built a local `name -> package.json` workspace map and traversed workspace `dependencies`, `optionalDependencies`, and `peerDependencies` from `@affine/web`; no installed dependency state was available. The exact 14-seed/50-package editor probe and regeneration requirement are recorded in `REUSABLE_SCOPE.md`.

`packages/frontend/routes` не является product router: это отдельный admin path package. Актуальный browser router находится в `packages/frontend/core/src/desktop/router.tsx`.

### Почему официальный shell не является foundation

`configureCommonModules` eagerly регистрирует cloud, AI, paywall, PDF, imports, comments и analytics (`packages/frontend/core/src/modules/index.ts:73-139`). `@affine/core` также связывает editor с GraphQL, nbstore, telemetry, templates и platform shims. Перенос shell означал бы перенос продуктовой сложности AFFiNE вместо создания нового продукта.

## 3. Document/block editor architecture

BlockSuite строит editor через schema/view extensions и DI:

```text
beforeinput / composition
  -> InlineEventService
  -> transformInput
  -> InlineTextService
  -> Y.Text transaction
  -> Y.Text observer
  -> InlineRenderService
  -> Lit render
```

Опорные места:

- schema/model: `blocksuite/affine/model/src/blocks/paragraph/paragraph-model.ts:21-56`;
- schema registry и parent validation: `blocksuite/framework/store/src/schema/schema.ts:117-324`;
- flavour-to-view binding: `blocksuite/framework/std/src/extension/block-view.ts:24-32`;
- recursive Lit host: `blocksuite/framework/std/src/view/element/lit-host.ts:62-105`;
- contenteditable и `InlineEditor`: `blocksuite/affine/rich-text/src/rich-text.ts:168-179,311-405`;
- DOM selection/input translation: `blocksuite/framework/std/src/inline/services/event.ts:89-250,365-405`;
- direct Y.Text writes: `blocksuite/framework/std/src/inline/services/text.ts:7-89`;
- Yjs-delta rendering and remote caret restoration: `blocksuite/framework/std/src/inline/services/render.ts:54-200`.

Structural editing проходит через `UIEventDispatcher`, `KeymapExtension`, `CommandManager` и `Store` transactions. Block CRUD физически хранится в Yjs maps/arrays, а reactive model сообщает view точечные updates.

## 4. Edgeless canvas/whiteboard architecture

Edgeless — не React-список shapes. Это гибрид:

- `affine:surface` хранит canvas elements в nested `Y.Map`;
- rich blocks остаются DOM children;
- `GfxController` объединяет tools, selection, hit testing и updates;
- `GridManager` даёт sparse spatial index;
- `LayerManager` чередует DOM и canvas layers;
- `CanvasRenderer` перерисовывает dirty layers через RAF;
- `GfxViewportElement` скрывает offscreen DOM blocks и активирует их chunks.

Canvas input flow:

```text
pointer / drag / wheel / pinch
  -> UIEventDispatcher
  -> ToolController / active BaseTool
  -> GfxController / Surface model transaction
  -> element events
  -> Grid + Layer invalidation
  -> CanvasRenderer / DOM block view
```

Evidence:

- surface model: `blocksuite/affine/blocks/surface/src/surface-model.ts:15-39`;
- tool lifecycle: `blocksuite/framework/std/src/gfx/tool/tool-controller.ts:329-615`;
- local drag stash and atomic commit: `blocksuite/framework/std/src/gfx/model/surface/element-model.ts:271-339`;
- spatial grid: `blocksuite/framework/std/src/gfx/grid.ts:18-97,291-510`;
- layer merge/order: `blocksuite/framework/std/src/gfx/layer.ts:190-325,684-877`;
- dirty-layer rendering/culling: `blocksuite/affine/blocks/surface/src/renderer/canvas-renderer.ts:302-417,966-1253`;
- DOM viewport culling/chunking: `blocksuite/framework/std/src/gfx/viewport-element.ts:305-624,943-996`;
- connector endpoint index and path recalculation: `blocksuite/affine/blocks/surface/src/surface-model.ts:41-187`, `blocksuite/affine/gfx/connector/src/connector-watcher.ts:11-90`.

Эта подсистема — основная reusable сложность. Заменять её простым `elements.map()` нельзя.

## 5. State management, routing и rendering

### AFFiNE shell baseline

Главный state layer — hierarchical `Framework` DI + RxJS-based `LiveData`, а не Redux:

- nested React scopes: `packages/common/infra/src/framework/react/index.tsx:53-80`;
- workspace/doc/editor scopes: `packages/frontend/core/src/modules/{workspace,doc,editor}/scopes`;
- `LiveData`, selectors, signal interop: `packages/common/infra/src/livedata/livedata.ts:88-390`;
- React subscription через `useSyncExternalStore`: `packages/common/infra/src/livedata/react.ts:1-36`.

Jotai используется вторично для settings и component-local/scoped state. В новом продукте этот shell не переносится; его разделение durable/derived/ephemeral state используется только как reference pattern.

### Routing baseline

AFFiNE имеет top-level React Router и отдельные memory routers на workbench views. Это поддерживает split views, independent history и reorder, но приносит product complexity. Новому продукту нужен один небольшой route tree.

### Performance baseline

Подтверждены route-level lazy imports, `react-virtuoso`, memoized roots, canvas spatial culling и worker-based turbo painter. Однако bitmap turbo path выключен по умолчанию и feature-gated, поэтому он не считается гарантированной оптимизацией.

## 6. Local-first, realtime и conflict handling

AFFiNE web local workspace использует IndexedDB; cloud workspace сохраняет локальный слой и добавляет remote adapters. Document updates сначала объединяются и записываются локально, после чего remote sync работает через Yjs state vectors и update diffs.

Подтверждённые свойства:

- snapshot + append-oriented update log восстанавливают Y.Doc;
- Yjs updates идемпотентно сходятся после обмена;
- state vectors передают недостающий diff;
- awareness отделён от durable document state;
- локальный `Y.UndoManager` отслеживает только current client origin, поэтому remote edits не отменяются пользователем.

Evidence:

- local IndexedDB selection: `packages/frontend/core/src/modules/workspace-engine/impls/local.ts:185-222`;
- local commit and clock transaction: `packages/common/nbstore/src/impls/idb/doc.ts:33-85`;
- snapshot/update compaction: `packages/common/nbstore/src/storage/doc.ts:119-164,257-302`;
- state-vector pull/push: `packages/common/nbstore/src/sync/doc/peer.ts:336-568`;
- awareness: `packages/common/nbstore/src/frontend/awareness.ts:13-73`;
- per-user undo: `blocksuite/framework/store/src/extension/history/history-extension.ts:19-25`.

CRDT convergence не равна semantic correctness. Concurrent scalar changes разрешаются правилами Yjs без product-level dialog. Для ReplayLab критические позы, пути и frame order требуют отдельного semantic reconciliation layer.

## 7. UX, keyboard, accessibility и responsive baseline

Сильные части:

- contextual keymaps, IME composition handling и non-US layout fallback;
- Android `beforeinput` bridge;
- block/text/surface/cursor selections;
- selection restoration при undo/redo;
- canvas nudge, tool switching, pan, zoom, grouping;
- pointer and native DnD pipelines;
- touch pan/pinch и viewport optimizations.

Критические пробелы:

- keyboard ownership может активироваться через hover, а не только focus;
- edgeless `Tab` предотвращает default до проверки context;
- drag handles и resize handles в основном pointer-only;
- canvas не имеет semantic object tree, accessible name/fallback или live announcements;
- toolbar/menu semantics неполны;
- в editor/edgeless path нет систематических `forced-colors`, `prefers-contrast` и `prefers-reduced-motion` contracts;
- mobile — отдельный UA-driven product scope, а не полная responsive parity.

Evidence:

- global keyboard listener/ownership: `blocksuite/framework/std/src/event/control/keyboard.ts:116-143`, `event/dispatcher.ts:163-230,314-330`;
- edgeless shortcuts/Tab: `blocksuite/affine/blocks/root/src/edgeless/edgeless-keyboard.ts:89-750`;
- pointer-only drag handle: `blocksuite/affine/widgets/drag-handle/src/drag-handle.ts:260-284`;
- programmatic canvas without semantic companion: `blocksuite/affine/blocks/surface/src/renderer/canvas-renderer.ts:392-395`;
- mobile scopes: `blocksuite/affine/ext-loader/src/view-provider.ts:11-17,89-113`.

Итог: keyboard/IME/history mechanisms are technically relevant candidates, but reuse still requires the path/transitive-license gate. Input coordination, keyboard DnD and canvas accessibility remain a separate P0 product slice.

## 8. Tests, offline guarantees и technical debt

### Existing useful coverage

- Yjs convergence and multi-peer sync: `packages/common/nbstore/src/__tests__/sync.spec.ts:298-456`;
- reconnect state machine: `packages/common/nbstore/src/connection/__tests__/auto-reconnection.spec.ts:5-224`;
- international keymaps/Android input: `blocksuite/framework/std/src/__tests__/keymap.unit.spec.ts:45-203`;
- drag/tools/slash-menu/selection integration and E2E suites under `blocksuite/integration-test` and `tests/blocksuite`.

### High-risk gaps

| Priority | Finding | Consequence |
|---|---|---|
| P0 | pending save queue has no proven unload flush barrier | last local changes may be lost on abrupt close |
| P0 | `Store.withoutTransact` lacks `try/finally` | exception can leave transaction/history mode corrupted |
| P1 | no service worker / app-shell cache / `navigator.storage.persist()` | cold offline restart cannot be promised |
| P1 | cross-tab awareness collect ID appears mismatched | new tab may miss existing presence until next update |
| P1 | local/cloud deletion leaves IndexedDB cleanup TODOs | privacy/quota debt |
| P1 | no offline-edit/reload/reconnect convergence E2E | central local-first claim lacks end-to-end proof |
| P1 | skipped cloud collaboration/migration suites | regression risk in critical paths |
| P1 | no axe/semantic canvas/keyboard DnD tests | accessibility is not production baseline |

Relevant sources include `packages/common/nbstore/src/frontend/doc.ts:220-285`, `blocksuite/framework/store/src/model/store/store.ts:401-405`, `tests/affine-cloud/e2e/collaboration.spec.ts:31` and `tests/affine-cloud/e2e/migration.spec.skip.ts:51-52`.

## 9. Stale or misleading documentation

- Root README mentions Vite as frontend tooling, while official web production build is Rspack.
- `docs/contributing/tutorial.md` references an obsolete workspace-plugin architecture and missing file.
- workbench README points to an obsolete router path.
- desktop build doc calls `packages/frontend/core` the web app; actual executable shell is `packages/frontend/apps/web`.

Generated transformation docs should therefore cite live files, not inherit these descriptions.

## 10. Baseline decision B0

The transformation baseline is:

1. Preserve the pinned checkout and root licenses as upstream reference.
2. Treat `@blocksuite/affine` full composition only as a compatibility oracle, never as the target product shell.
3. Build first on the allowlisted BlockSuite Store/Std/Sync kernel; admit any provisional Gfx/Surface/rich-text package only after the exact Slice 0 dependency/provenance gate, behind a product-owned facade.
4. Use BlockSuite `IndexedDBDocSource`/BroadcastChannel for the new local layer; do not reuse AFFiNE nbstore/cloud protocol.
5. Implement a new product-owned network `DocSource`, awareness source and server protocol.
6. Preserve per-user undo and hybrid canvas performance mechanisms.
7. Add product-owned semantic conflicts, accessible DOM companion and cold-offline hardening.
8. If the compatibility spike cannot combine the custom domain root with unified BlockSuite history through supported extension points inside five working days, stop the extraction and use the documented Incident Replay fallback rather than widening scope.

Further boundaries are normative in [REUSABLE_SCOPE.md](./REUSABLE_SCOPE.md) and [LICENSE_BOUNDARIES.md](./LICENSE_BOUNDARIES.md).
