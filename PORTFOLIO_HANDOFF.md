# ReplayLab

Актуальная итерация: Coach workbench / 3D. Главная и просмотр используют единую
объёмную сцену; переход в редактирование открывает вид сверху. Практический путь,
реальные экраны и различия с макетом: [обзор](docs/design/COACH_WORKBENCH_REVIEW.md).
Статус финальной проверки и публикации: [отчёт](docs/PRODUCTION_VERIFICATION.md).
Ниже сохранены датированные сведения о предыдущей «Арене».

Текущее дополнение, 17.10.2026: новый интерфейс «Пятый темп / Fifth Tempo»
реализован и проверен локально (99/99 + 10/10, Node/Docker, дополнительные
движки браузеров). Опубликован на существующем Render после явного разрешения;
CI и публичная проверка RU/EN, офлайн-запуска и двух сессий проходят. Начните с
[актуального отчёта](docs/PRODUCTION_VERIFICATION.md) и
[макетов/сравнения](docs/design/ARENA_REVIEW.md). Состояние ниже — историческое.

## Текущее состояние — 28.09.2026

Адрес: https://replaylab-godaylor.onrender.com/ . При сегодняшней проверке
приложение не загрузилось: экран Render `Service waking up / Application loading`
сохранялся существенно дольше обычного холодного старта. Серверные логи недоступны
до входа владельца в Render; причина не установлена. Ни сбой Supabase, ни сбой
инфраструктуры Render пока не подтверждены. Тариф и данные не менялись.
Результаты от 13 сентября ниже — исторические, не подтверждение доступности сегодня.

V3: отдельная сохраняемая учебная комбинация, повторяемое пошаговое знакомство,
легенда игроков/мяча/линий, удаление действия с Undo, пояснения переноса и прав
ссылок, исправление планшетной шапки. Подробности и текущие проверки:
[production verification](docs/PRODUCTION_VERIFICATION.md).

**Animated basketball plays, built and edited together.**

ReplayLab helps a coach turn a half-court formation into a phase-by-phase animated
play and explain it with another coach, including when connectivity is unreliable.

- GitHub: https://github.com/godaylor/replaylab
- Live: https://replaylab-godaylor.onrender.com
- Owner repository: standalone source tree; no AFFiNE shell/backend/protocol.
- Working product name: ReplayLab. Independent trademark clearance remains open.

## Original contribution

Product design and RU/EN UI; basketball data model and typed commands; narrow
BlockSuite adapters; canvas court, timeline and deterministic playback; unified
text/court undo; semantic conflict resolution; IndexedDB/emergency recovery;
original capability-authenticated WebSocket server and Supabase persistence;
private room creation, local recent plays, deployment and end-to-end verification.
The retained BlockSuite framework is explicitly third-party, not claimed as original.

## Features

1. Create separate plays and reopen recent local work.
2. Author 2–12 phases with ten players and cut, dribble, pass and screen actions.
3. Add rich coaching cues; undo text and court edits through one local history.
4. Animate, scrub, step and present the play with reduced-motion support.
5. Create private collaborative rooms with separate edit/view invitations.
6. Continue offline, reconnect, review concurrent intentions and preserve remote work on undo.
7. Recover abrupt-close edits and drafts; export/import portable recovery copies.
8. RU/EN, keyboard alternatives, semantic lineup/action views and mobile playback.

## Actual stack and architecture

React 19, TypeScript, Vite 7, Yjs 13.6.21, BlockSuite global/store/std/sync,
Lit, RxJS, y-protocols, fractional-indexing, IndexedDB, BroadcastChannel,
service worker, Node 22, ws, Supabase Postgres/Data API, Docker, Render,
Yarn 4.18, Playwright 1.58.2, axe-core 4.13, Oxlint 1.78, GitHub Actions.

One canonical Y.Doc contains cue blocks and the versioned basketball domain.
The court and animation are derived projections. IndexedDB is authoritative;
the server is a validated network shadow. Hosted snapshots are written to
Supabase before acknowledgement. Presence is ephemeral. The client receives
only private room capabilities, never the database secret.

## Screenshots

- `packages/replaylab/foundation/evidence/home-desktop.png` — entry and recent plays.
- `packages/replaylab/foundation/evidence/slice7-en.png` — complete desktop editor.
- `packages/replaylab/foundation/evidence/slice7-ru.png` — Russian editor.
- `packages/replaylab/foundation/evidence/home-mobile.png` — mobile entry.
- `packages/replaylab/foundation/evidence/slice7-mobile-en.png` — mobile review.

## Provenance and limits

Original ReplayLab product modules plus four reviewed MIT BlockSuite framework
packages. Root composite license, MIT text, embedded notices and attribution are
retained. Generated source inventory, SBOM and dependency-license inventory are
included. Current runtime audit: 78 instances, 31 emitted packages, no forbidden
source/protocol modules. Artwork is original CSS/canvas; fonts are system fonts.

Render Free may take about a minute to wake. One server instance, 32 rooms maximum;
no public room directory, accounts, billing, video export or analytics suite.
Mobile is intentionally review-only. Human screen-reader/device/IME review and
independent name clearance remain open.

## Verification status

2026-09-11 local: typecheck, lint, client/server builds, 77/77 tests,
10/10 abrupt-close repetitions, provenance and packaged Node smoke PASS.
2026-09-13 production: commit fe37fb0 is live on the existing Render Free service.
CI passed 80 tests, 10 abrupt-close repetitions, lint, builds, provenance, Node
and Docker backup/restore smoke checks. Public create/reopen, bidirectional
room editing and read-only invitations passed in browser clients with separate
local databases. After a confirmed server restart, a fresh database restored
the correct title and both collaborators' player edits from Supabase.
Only service_role received INSERT; RLS and anon/authenticated privileges stayed
unchanged. See [production verification](docs/PRODUCTION_VERIFICATION.md).

## Remaining reviews

Current public availability and V3 deployment need confirmation after Render login.
Human screen-reader/device/IME review and independent name clearance remain open.
