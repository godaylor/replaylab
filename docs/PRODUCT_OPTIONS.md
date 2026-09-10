# Product options

Статус: decision record  
Решение: **ReplayLab**  
Fallback: **Incident Replay**, только по technical kill criterion Phase 0

## 1. Decision principles

Варианты обязаны:

- использовать rich editor, canvas, collaboration и local-first как ядро продукта, а не checklist;
- быть уже AFFiNE и завершаться production-quality vertical slices;
- не выглядеть как task manager, Notion clone, generic knowledge base или LifeOS;
- объясняться одной фразой и демонстрироваться за 30–60 секунд;
- иметь самостоятельную visual language и domain-specific interactions;
- не зависеть от AFFiNE backend/native/enterprise/cloud protocol.

## 2. Weighted matrix

Оценки 1–5; выше лучше: `5` = strongest fit/lowest comparative risk for this portfolio constraint, `3` = material trade-offs, `1` = likely infeasible or indistinct. Licensing score compares boundary complexity only; `5` is not legal clearance and does not bypass the package/provenance gates.

| Criterion | Weight |
|---|---:|
| Реализуемость solo за 9–12 недель | 20 |
| Frontend depth | 20 |
| Wow-effect | 15 |
| Эффективность по времени | 15 |
| Простота лицензирования | 10 |
| Отличимость от AFFiNE | 10 |
| Отличимость от productivity apps | 10 |

Итоговая формула: `Σ(score × weight) / 100`.

| Product | Feasible | FE depth | Wow | Time | License | ≠ AFFiNE | ≠ productivity | Weighted |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| **ReplayLab** — basketball tactics animator | 4 | 5 | 5 | 4 | 5 | 5 | 5 | **4.65** |
| **Incident Replay** — causal incident studio | 4 | 5 | 4 | 4 | 5 | 5 | 4 | **4.40** |
| **BranchLab** — branching narrative studio | 3 | 5 | 5 | 3 | 4 | 4 | 5 | **4.10** |

## 3. Option A — ReplayLab

### One-line pitch

Совместная local-first студия, где тренер расставляет игроков на площадке, рисует передачу или движение, переключает фазы и сразу проигрывает комбинацию.

### Product surface

- 5×5 player tokens и мяч на half-court;
- phase/keyframe timeline;
- cut, pass, dribble and screen tools;
- rich coaching cues, привязанные к фазе;
- live cursors, selections и gesture previews;
- offline authoring, reconnect reconciliation и local-only undo;
- presenter/follow mode;
- keyboard-first and accessible lineup companion.

### Why it works

- Понятен без onboarding: пользователь двигает игрока и нажимает Play.
- Canvas animation является продуктом, а не generic whiteboard.
- Rich editor нужен для coaching intent, но не превращает продукт в workspace.
- Offline имеет реальную ценность в спортзале и дороге.
- Collaboration визуальна и проверяема в двух окнах.
- Demo показывает domain model, derived animation, concurrent state и rendering depth.

### Hard cuts

- только basketball half-court;
- ровно 5×5 игроков + derived ball entity;
- один play, 2–12 phases;
- без physics, collision/rule engine и branching plays;
- без roster, season, scheduling, stats и tasks;
- без video, AI, marketplace, payments и branded team assets;
- desktop full authoring; tablet actor reposition/cue editing; mobile playback, scrub and cue reading;
- JSON export, но без GIF/MP4 в v1.

### Estimate and risk

9–12 focused solo weeks. Главный риск — custom Gfx/undo integration и соблазн превратить scrub/playback в CRDT writes. Architecture запрещает второе: playhead и interpolated pose остаются локальной derived projection.

## 4. Option B — Incident Replay

### One-line pitch

Совместная реконструкция технического инцидента, где timeline, causal graph, evidence и rich postmortem проигрываются как единая история.

### Product surface

- event timeline и causal canvas;
- services, symptoms, hypotheses, evidence and decisions;
- scrubber, подсвечивающий активную causal chain;
- rich postmortem linked to graph objects;
- presence, offline edits, semantic conflicts and local undo.

### Strengths

- сильный enterprise/hiring signal;
- хорошо соответствует готовым BlockSuite shapes/connectors;
- ниже implementation risk, чем у ReplayLab;
- local-first/realtime ценность естественна для incident room.

### Risks and cuts

Без domain replay продукт станет Jira/Miro hybrid. Поэтому исключены Datadog/Sentry/Jira integrations, alerting, raw-log scale, AI root-cause analysis, RBAC/SSO и compliance. Разрешён только synthetic JSON/CSV import и один incident room.

### Estimate

8–10 focused solo weeks.

## 5. Option C — BranchLab

### One-line pitch

Collaborative scene graph, где изменение ранней сцены показывает continuity conflicts во всех downstream-ветках.

### Product surface

- scene graph and branch traversal;
- rich scene editor;
- character/item/location state;
- deterministic continuity warnings;
- compare paths, presence, offline editing and local undo.

### Strengths

- очень сильный creative-tool wow-effect;
- далеко от productivity/LifeOS;
- graph + document duality является domain model.

### Risks and cuts

Без continuity engine это graph of notes. Ограничение: одна история, 100–150 scenes, 3–4 entity types, no AI writing, screenplay production, CMS, video/audio or publishing. Только собственные/CC0 demo assets.

Kill criterion: если к концу третьей недели изменение ранней сцены не создаёт корректный downstream conflict, вариант закрывается.

### Estimate

11–14 focused solo weeks.

## 6. Why ReplayLab wins

ReplayLab лучше всего удовлетворяет ограничениям портфолио:

- отличим от AFFiNE на уровне data model, layout, tools and motion;
- не конкурирует с уже существующим LifeOS/productivity кейсом;
- визуально раскрывает canvas rendering за секунды;
- realtime и offline можно показать, а не описать;
- scope ограничен одной площадкой и двенадцатью phases;
- independent backend не требует интеграций с внешними системами;
- synthetic demo data не несёт content/privacy risk.

Incident Replay остаётся fallback, потому что его canonical entities напрямую соответствуют готовым BlockSuite surface shapes. Fallback разрешён только если Phase 0 докажет, что ReplayLab custom domain root нельзя безопасно включить в unified BlockSuite undo/store через публичные extension points в пятидневный timebox.

Incident has lower Gfx integration risk, but its external-integration expectations and risk of reading as another operational productivity tool offset that advantage; this is why its Feasibility/Time scores remain equal to ReplayLab despite an 8–10 week implementation estimate.

## 7. Recruiter demo

### Silent 30-second core

1. В двух окнах открыт один play; явная **Play** button запускает комбинацию.
2. Автор ставит playback на паузу, перетаскивает point guard и shortcut `P` начинает pass tool; timeline/court preview обновляются.
3. Второй участник одновременно редактирует rich coaching cue; видны cursor, selection and caret.

### Full 60-second proof

4. Первое окно уходит offline; оба участника меняют pose одного защитника в одной phase.
5. После reconnect появляется настоящий ghost conflict с двумя candidate poses; автор явно выбирает вариант.
6. Автор делает отдельный local one-step nudge и нажимает `Ctrl/Cmd+Z`: отменяется nudge, но resolution и remote work остаются.
7. Обновлённая комбинация снова проигрывается.

Одно предложение для работодателя: **«ReplayLab — local-first multiplayer editor for animated basketball plays, built on a CRDT document and a performant canvas projection.»**

## 8. Decision gates

- Week 2: domain artifact reloads from IndexedDB without AFFiNE shell/core.
- Week 4: actor drag, path authoring, keyboard alternative and local-only undo work end-to-end.
- 10 players + ball, 12 frames and 30 actions/transition sustain 55+ FPS.
- Three clients converge after a five-minute offline partition without lost operations.
- Silent core remains understandable within 30 seconds; collaboration/offline/conflict/undo proof completes within 60 seconds.
- No forbidden import, protocol marker or unresolved dependency license is present.
