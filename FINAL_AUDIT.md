# Финальный аудит ReplayLab для портфолио

Дата: 2026-09-09  
Режим: исходный аудит + локальные исправления по его обязательным пунктам (2026-09-09); общий аудит не повторялся  
База сравнения: AFFiNE `canary` / `329839e467d936f90230fb02a8983f8eb4b62fc0`

## Вердикт

**Локальная демонстрация технически готова. Публичная публикация пока заблокирована.**

Текущий standalone-артефакт запускается на `127.0.0.1:32400`: `/`, `/healthz` и `/legal/THIRD_PARTY_NOTICES.md` отвечают `200`; health сообщает `ReplayLab`; legal-файл содержит 16 121 байт. Сервер выставляет CSP, `nosniff`, `DENY` для framing и `no-referrer`. После аудита временный сервер остановлен; слушателей на `32400–32499` нет.

Свежие сохранённые результаты от 2026-09-08 подтверждают Windows и изолированный Linux: **74/74** теста, **10/10** повторов немедленного закрытия вкладки, typecheck, client/server build, boundary/license audit, packaging, Node и non-root Docker smoke. Проверены два клиента, offline-конфликт, явное разрешение, local-only undo и восстановление backup в отдельной директории. Эти проверки не запускались повторно, потому что актуальные отчёты уже существуют.

При follow-up CUA снова завершился при подключении. Штатный Playwright проекта создал свежие full-page PNG для desktop RU/EN (viewport 1440×900) и mobile RU/EN (390×844). Codex просмотрел эти изображения через разрешённое чтение файлов вне неисправной песочницы. Исправлена обнаруженная противоречивая mobile-инструкция: onboarding больше не предлагает перемещать игрока в режиме просмотра. Перекрытий и горизонтального overflow в проверенных видах не обнаружено. Это визуальная проверка моделью, не человеческая оценка и не реальный screen-reader/touch/IME-прогон. Доказательство: `packages/replaylab/foundation/evidence/final-audit-visual-review.md`.

После исправлений выполнены только затронутые проверки: typecheck, client/server build в source export, 4/4 Slice 7 tests, 1/1 максимальная rendering fixture, immutable Yarn install, проверка source inventory и production provenance, новый изолированный package и Node smoke. Полные 74/74 и 10/10, Linux/Docker результаты выше остаются датированными доказательствами от 2026-09-08, не новыми прогонами. Новая client closure: 726 328 raw / 218 555 gzip bytes; 78 runtime instances, 31 emitted package, 0 forbidden modules.

## Что готово для демонстрации

- Сфокусированный продуктовый сценарий: одна баскетбольная комбинация, 5×5 игроков, производный мяч, 2–12 фаз, cut/dribble/pass/screen, rich cue и детерминированное воспроизведение.
- Полное редактирование на desktop; на tablet оставлены playback, перемещение игроков и cue; mobile ограничен playback, scrub и семантическим просмотром. Capability gates и отсутствие горизонтального overflow проверены в `tests/slice7.e2e.spec.ts`.
- RU по умолчанию и EN с сохранением выбора; неизвестная locale безопасно возвращается к RU. Локализованы навигация, состояния, ошибки, metadata и recovery UI; пользовательский текст намеренно не переводится.
- Local-first: IndexedDB — основной источник, сеть — shadow; cold-offline, reload, migration/recovery, аварийный journal и незакоммиченные title/cue drafts покрыты тестами.
- Совместная работа: независимый WebSocket-протокол ReplayLab, read/write capabilities, bounded awareness, reconnect, семантические конфликты и per-user undo.
- Доступность на уровне реализации: semantic DOM companion, pointer/keyboard parity, focus restoration, announcements, reduced motion, forced colors и ноль serious/critical axe-нарушений в сохранённых прогонах.
- Производительность максимальной сцены: 12 фаз, 10 игроков, мяч и 30 действий — 60.003 FPS, p95 16.7 ms, 0 long tasks, 0 React renders во время playback и 0 измеренного роста heap на локальном профиле.
- Standalone Node/Docker, private room CLI, persistent data directory, fail-closed package, backup/restore инструкции и CI workflow подготовлены. Публичного deploy нет.
- Записаны синтетические `final-30s.webm` и `final-60s.webm`; они не содержат capability links или пользовательских данных.

## Сравнение с исходной версией

Доступная Git-история по-прежнему заканчивается исходным AFFiNE-коммитом: commit/push не разрешены. Подготовлен отдельный source state с разрешённой closure, SHA-256 inventory и upstream commit/blob provenance, без копирования `.git` и без заявления о персональном авторстве промежуточных изменений. Он пригоден как проверяемое исходное дерево собственного репозитория; реальную историю ReplayLab-коммитов ещё должен создать владелец отдельным действием. Инструкции: `docs/SOURCE_STATE.md`.

**Добавлено:** оригинальный ReplayLab shell и визуальный язык; доменная CRDT-схема и typed commands; half-court Gfx projection; timeline/action/cue authoring; playback/presenter; semantic conflicts; RU/EN и responsive modes; product-owned sync protocol/server; recovery и emergency journal; тестовый контур, SBOM/notices, packaging, Docker и ReplayLab CI. В `packages/replaylab/foundation/src` — 37 файлов и около 9 475 строк исходного кода.

**Убрано из продуктовой поверхности:** workspace/page/database/task/calendar UI, generic whiteboard, AFFiNE accounts/cloud/GraphQL/backend/native/mobile apps, AI/enterprise возможности и AFFiNE branding/assets. Они остаются только в исходном monorepo как audit baseline и не входят в shipping graph.

**Осталось похожим:** базовые local-first/CRDT идеи, Yjs и четыре разрешённых BlockSuite framework-пакета (`global`, `store`, `std`, `sync`), включая store/history, IndexedDB/BroadcastChannel и Gfx primitives. Это инфраструктурная преемственность, а не reskin: audit фиксирует ноль `blocksuite/affine` runtime-модулей, ноль AFFiNE shell/backend/protocol imports и ноль forbidden markers.

По дизайну исходный AFFiNE — универсальный productivity/workspace продукт. ReplayLab использует собственную тёмную court-oriented палитру (ink/graphite, coral offense, cyan defense, amber focus), двухпанельную авторскую компоновку и спортивную семантику. Актуальные ReplayLab PNG просмотрены моделью; историческое визуальное before/after и этапы эволюции дизайна по Git не восстановлены.

## Сильные стороны и собственный вклад

- Сильная 30–60-секундная продуктовая история: движение игрока и playback понятны сразу, а offline conflict + local-only undo демонстрируют инженерную глубину.
- Корректное разделение canonical, derived и ephemeral state: один `Y.Doc`, playback/hover/presence вне CRDT, команды как единственная mutation boundary.
- Необычно полный для портфолио recovery-контур: clone-first migration, read-only recovery, checksums, аварийный browser journal, fsynced server journal, corruption tests и separate-copy restore.
- Accessibility встроена в взаимодействия, а не добавлена отдельным слоем после canvas.
- Самостоятельно спроектированы доменная модель, UX, responsive capability matrix, протокол синхронизации, conflict UX, persistence/recovery, RU/EN, performance budgets и release/legal automation.
- Хороший материал для работодателя: объяснить компромиссы CRDT и semantic conflicts, показать typed command/history boundaries, canvas projection без canonical duplication, adversarial durability tests и чистую лицензионную границу с upstream.

## Лицензии и provenance

Технический аудит лицензий **PASS**: 78 runtime dependency instances, 31 emitted package, 0 forbidden modules, 0 forbidden source/protocol markers; официальный неизменённый Yjs 13.6.21; прежний uint53 patch удалён, совместимость с legacy update проверена.

Обязательные уведомления сохранены:

- корневые `LICENSE` и `LICENSE-MIT` сохраняют copyright TOEVERYTHING;
- standalone содержит `dist/legal/LICENSE`, `LICENSE-MIT`, dependency inventory, CycloneDX SBOM, source notices и `THIRD_PARTY_NOTICES.md`;
- Excalidraw-derived hit test имеет точную commit/blob provenance и полный MIT notice;
- корневой README прямо сообщает о BlockSuite/AFFiNE основе, отсутствии endorsement и о том, что весь checkout не является uniformly MIT.

Это инженерная проверка, не юридическое заключение. Независимая проверка названия/знака и домена не выполнена.

## Локальные обязательные исправления — закрыты

1. **Source state подготовлен.** Экспорт содержит только четыре разрешённых BlockSuite kernel roots и ReplayLab, ровно пять workspaces, отдельный root manifest/config, сокращённый `yarn.lock`, repository Yarn и runtime patches. Нет denied implementation roots, upstream `.git`, чужих workflows, пользовательских баз или browser profiles. `SOURCE_STATE.json` содержит SHA-256 inventory и upstream blob IDs; проверка целостности сохранена в CI. Immutable install, typecheck, client/server build и provenance audit из экспортированного дерева прошли. Реальные commits остаются отдельным внешним шагом.
2. **Статусы согласованы.** Исправлены верхние статусы `PLAN.md` и `docs/ARCHITECTURE.md`; исторический failed preflight сохранён, добавлен актуальный checkpoint.
3. **Документы и provenance включены.** `FINAL_AUDIT.md` больше не скрыт корневым `/*.md` ignore; README, PLAN, AGENTS, FINAL_AUDIT и девять обязательных документов входят в source inventory. Root/nested license texts сохранены; SBOM, inventory и notices включены. В standalone-инструкции добавлен явный BlockSuite/AFFiNE/no-endorsement абзац.
4. **Недостающая visual-проверка выполнена моделью.** Просмотрены desktop RU/EN и mobile RU/EN снимки, исправлен mobile onboarding; 4/4 целевых tests и 1/1 maximum-scene test прошли. Реальные устройства и человеческая оценка этим не закрыты.
5. **Собственный локальный CI-контур подготовлен.** В export единственный workflow `replaylab.yml`, с source-integrity check и immutable install; inherited workflows остаются только в сохранённом исходном baseline. Новая isolated Node-упаковка и smoke прошли. Старый root `release-dist` не заменён: обнаруженная `.replaylab-data` вызвала штатный отказ упаковщика, данные сохранены. Docker image/archive от 2026-09-08 не пересоздавались и не объявляются актуальными для этой UI-правки.

## Фактический обязательный остаток — внешние действия

1. Выбрать собственный репозиторий, принять подготовленный source state и создать реальные ReplayLab commits после отдельного разрешения. Не выдавать upstream history за авторство ReplayLab.
2. Выполнить и записать NVDA/VoiceOver, полный human keyboard/non-US/IME/200% zoom/contrast/reduced-motion review и физический tablet/mobile touch review с reviewer/date/versions. Все эти пункты остаются NOT RUN.
3. Получить независимую человеческую оценку desktop/mobile визуала и понятности silent 30 s / full 60 s demo. Записи существуют; оценки не выдуманы.
4. Получить hosted CI GREEN и canonical dedicated-runner performance; выбрать hosting/domain, настроить HTTPS/WS и persistent backup, проверить host restore/offline. Локальные результаты не заменяют эти проверки.
5. Независимо закрыть name/mark/domain clearance и отдельно разрешить публикацию. Commit, push, deploy и remote settings в этом follow-up не выполнялись.

## Необязательные улучшения

- Выполнено дополнительно: явный BlockSuite/AFFiNE provenance и no-endorsement абзац включён в README новой изолированной standalone-упаковки.
- Подготовить короткую архитектурную схему `typed command → Y.Doc → Gfx/DOM projections → IndexedDB/network shadow` для собеседования.
- После появления собственного Git history добавить changelog/несколько атомарных design-decision commits, чтобы вклад читался без изучения большого upstream baseline.

## Использованные доказательства и выполненные проверки

- Прочитаны `AGENTS.md`, обязательные boundary/spec/architecture документы, `PLAN.md`, baseline/product options, release/emergency docs и все доступные Slice 0–7/release evidence summaries.
- Сверены текущие source imports, responsive/i18n guards, E2E сценарии, CI, Docker/Compose, release manifest и legal payload.
- Выполнены только недостающие read-only проверки: Git/status/history, порты/процессы, локальный standalone HTTP/health/legal/security headers и актуальность evidence относительно исходников.
- Не выполнялись повторно свежие GREEN typecheck/build/74 tests/10 durability repetitions/audit/smoke.
- В исходном аудите визуальный просмотр кадров не состоялся; follow-up закрыл его модельным просмотром фактических PNG. Не выполнены и не заявлены: человеческая оценка визуала/демо, screen reader, IME на реальном устройстве, touch/mobile device, hosted CI, trademark/domain, TLS/public deploy и host restore.
- Follow-up evidence: `final-audit-visual-review.md`, `final-audit-visual-tests.json`, `final-audit-performance-tests.json`, `slice2a-performance.json`, актуальный `slice7-audit.json`; source export содержит `SOURCE_STATE.json`. Проверки полного release suite/Linux/Docker не повторялись. Старые пользовательские данные и все лицензии сохранены.
