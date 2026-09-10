import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type Locale = 'ru' | 'en';

export const DEFAULT_LOCALE: Locale = 'ru';
export const LOCALE_STORAGE_KEY = 'replaylab:locale';

const en = {
  appTitle: 'ReplayLab — basketball play editor',
  appDescription: 'ReplayLab local-first basketball play authoring',
  bootLoading: 'Opening local play…',
  brandHome: 'ReplayLab home',
  brandTagline: 'Half-court authoring',
  language: 'Language',
  languageRu: 'RU',
  languageEn: 'EN',
  playName: 'Play name',
  history: 'History',
  undo: 'Undo',
  redo: 'Redo',
  documentStatus: 'Document status',
  savedLocally: 'Saved locally',
  savingLocally: 'Saving locally…',
  localSaveFailed: 'Local save failed — export recommended',
  memoryOnly: 'Read-only recovery copy',
  offlineShellReady: 'Offline shell ready',
  offlineShellUpdate: 'Offline shell update ready — closes safely after this tab',
  offlineShellUnsupported: 'Offline shell unavailable in this browser',
  offlineShellError: 'Offline shell unavailable — online load still works',
  offlineShellPreparing: 'Preparing offline shell…',
  storageRequesting: 'Requesting persistent storage…',
  storagePersisted: 'Persistent storage granted',
  storageEvictable: 'Storage may be cleared by the browser',
  storageDenied: 'Persistent storage not granted — export recommended',
  storageUnsupported: 'Storage retention control unavailable',
  storageError: 'Storage retention check failed — export recommended',
  storageChecking: 'Checking storage retention…',
  keepOffline: 'Keep offline',
  networkConnecting: 'Connecting network shadow…',
  networkSyncing: 'Syncing network shadow…',
  networkSyncedRead: 'Read-only room · Synced',
  networkSyncedWrite: 'Write room · Synced',
  networkRateLimited: 'Rate limited · retrying in {{milliseconds}} ms',
  networkBlocked: 'Network shadow stopped · {{reason}}',
  terminalError: 'terminal error',
  networkOffline: 'Network shadow offline · local copy preserved',
  localOnly: 'Local only — network sync not configured',
  offlineContinues: 'Offline — local editing continues',
  needsReview: 'Needs review · {{count}}',
  phaseProgress: 'Phase {{current}} / {{total}}',
  exportJson: 'Export JSON',
  recoveryFile: 'Recovery file',
  openRecovery: 'Open recovery…',
  portableRecoveryExported: 'Portable recovery file exported.',
  recoveryRejected: 'Recovery file was rejected. The current local play was not changed.',
  localStorageFailedTitle: 'Local storage did not open.',
  localStorageFailedBody: '{{reason}} This memory copy is read-only; export it before leaving.',
  localStorageGenericReason: 'The browser could not open ReplayLab local storage.',
  indexedDbDenied: 'IndexedDB access was denied for this session.',
  migrationInterrupted: 'Migration was interrupted',
  localPlayCorrupt: 'Local play data is corrupt',
  futureSchema: 'This play uses a newer schema',
  recoveryUnavailable: 'Recovery copy is unavailable',
  recoveryBody: '{{reason}} The current local database was not overwritten. {{detail}}',
  recoveryPreview: 'A last-valid snapshot is open read-only.',
  recoveryBytes: 'The original bytes remain available for export.',
  localPlayReady: 'Local play ready.',
  editingUnavailable: 'Editing is unavailable because local storage could not open.',
  technicalReason: 'Technical reason: {{reason}}',
  commandFailed: 'The change was not applied. Check the entered values and try again.',
  chooseLooseBall: 'Choose Loose ball possession before moving the ball.',
  ballMoved: 'Ball moved to {{x}}, {{y}}.',
  actorMoved: '{{actor}} moved to {{x}}, {{y}}.',
  phaseAdded: 'Phase added after the current phase.',
  phaseMoved: 'Phase moved to position {{position}} of {{total}}.',
  undid: 'Undid the last local change.',
  redid: 'Redid the last local change.',
  selectToolActive: 'Select tool active.',
  actionToolActive: '{{action}} action tool active.',
  actionToolDraw: '{{action}} action tool active. Draw on the court; Escape cancels.',
  actionCreated: '{{action}} action created.',
  cueUpdated: 'Cue updated.',
  actionCancelled: 'Action creation cancelled.',
  playRenamed: 'Play renamed to {{title}}.',
  possessionLoose: 'Possession set to loose ball.',
  possessionActor: 'Possession set to {{actor}}.',
  ballSelected: 'Ball selected.',
  actorSelected: '{{actor}} selected.',
  actionDrawingCancelled: 'Action drawing cancelled.',
  conflictResolved: 'Conflict resolved.',
  conflictPhaseSelected: 'Phase {{number}} selected for conflict review.',
  phaseSelected: 'Phase {{number}} selected.',
  formationSequence: 'Formation sequence',
  phases: 'Phases',
  addPhase: 'Add phase',
  phaseCard: 'Phase {{number}}',
  phasePosition: 'Phase {{number}}, position {{position}} of {{total}}{{lifted}}',
  liftedSuffix: ', lifted for reorder',
  looseBall: 'Loose ball',
  conflictsCount: '{{count}} conflicts',
  movingPhase: 'Moving phase {{source}} {{relation}} phase {{target}}. Preview position {{position}} of {{total}}.',
  before: 'before',
  after: 'after',
  reorderCancelled: 'Phase reorder cancelled. Original order restored.',
  liftedPhase: 'Lifted phase {{number}}. Position {{position}} of {{total}}.',
  liftedPhaseKeyboard: 'Lifted phase {{number}}. Position {{position}} of {{total}}. Use arrow keys, then Space or Enter to drop; Escape cancels.',
  basketballHalfCourt: 'Basketball · half court',
  formationBoard: 'Formation board',
  phaseChip: 'PHASE {{number}}',
  courtTools: 'Court tools',
  select: 'Select',
  keyboardAction: 'Keyboard action…',
  courtEditorLabel: 'Half-court play editor. Select and move players, or draw the active tactical action. Escape cancels drawing.',
  courtHelp: 'Drag a player or draw the active action. Escape cancels. Arrow keys move the selected player.',
  offense: 'Offense',
  defense: 'Defense',
  semanticCompanion: 'Semantic companion',
  lineup: 'Lineup',
  actorsAndBall: '10 + ball',
  possession: 'Possession',
  actionsFromPhase: 'Actions from this phase',
  pathConflict: 'Path conflict',
  adjacencyRepair: 'Needs adjacency repair',
  ball: 'Ball',
  heldBy: 'Held by {{actor}}',
  mobileReviewTitle: 'Mobile review mode',
  mobileReviewBody: 'Playback, scrubbing, the semantic lineup, actions, and cue reading are available. Authoring requires a tablet or desktop.',
  tabletModeTitle: 'Tablet coaching mode',
  tabletModeBody: 'Move players and edit cues here. Path authoring and phase reordering require desktop.',
  desktopMode: 'Desktop authoring',
  unsupportedHere: 'Unavailable in this layout',
  onboardingEyebrow: 'First edit',
  onboardingTitle: 'Move one player to make this play yours.',
  onboardingBody: 'Select a token on the court or in the lineup, then drag it or use the arrow keys. This guide disappears after the first successful edit.',
  demoEyebrow: 'Portfolio runbook',
  demoTitle: 'ReplayLab in 60 seconds',
  demoCore: '0–30 s · Play, pause, move a player, draw a pass, edit the cue.',
  demoProof: '30–60 s · Take one client offline, create a same-pose conflict, reconnect, resolve, nudge, then undo only the nudge.',
  demoResilient: 'If the network is unavailable, complete the local edit, recovery export, playback, and keyboard proof.',
  createActionTitle: 'Create tactical action',
  createActionIntro: 'Keyboard path: choose an action and enter its end point.',
  action: 'Action',
  player: 'Player',
  targetPlayer: 'Target player',
  endX: 'End x',
  endY: 'End y',
  cancel: 'Cancel',
  createAction: 'Create action',
  cut: 'Cut',
  pass: 'Pass',
  dribble: 'Dribble',
  screen: 'Screen',
  concurrentIntentions: 'Concurrent intentions',
  conflicts: 'Conflicts',
  noConflicts: 'No unresolved semantic conflicts.',
  candidate: 'Candidate {{number}}',
  author: 'author {{actor}}',
  averageCandidates: 'Average candidates',
  showPhase: 'Show phase',
  resolve: 'Resolve',
  conflictResolutionAnnouncement: '{{title}} resolved as one undoable command.',
  conflictPoseTitle: 'Phase {{number}} · {{actor}} pose',
  conflictPossessionTitle: 'Phase {{number}} · possession',
  conflictLooseTitle: 'Phase {{number}} · loose-ball pose',
  conflictPathTitle: 'Phase {{number}} · {{action}} path',
  points: '{{count}} points · {{coordinates}}',
  playbackControls: 'Playback controls',
  previousPhase: 'Previous phase',
  previous: 'Previous',
  playTactic: 'Play tactic',
  pausePlayback: 'Pause playback',
  play: 'Play',
  pause: 'Pause',
  nextPhase: 'Next phase',
  next: 'Next',
  playhead: 'Playhead',
  phaseAtTime: 'Phase {{number}}, {{current}} of {{total}}',
  pausedOffscreen: 'Paused offscreen',
  present: 'Present',
  presentationMode: 'Presentation mode',
  presentLabel: 'REPLAYLAB · PRESENT',
  presentShortcuts: 'Space play/pause · [ ] step · Esc exit',
  coachCue: 'Coach cue',
  exitPresentation: 'Exit presentation',
  collaborationPresence: 'Collaboration presence',
  liveCount: 'Live · {{count}}',
  follow: 'Follow',
  followingAnnouncement: 'Following {{name}}. Press Escape to stop.',
  followEnded: 'Presenter follow ended. Local playback controls restored.',
  stopFollowing: 'Stop following',
  phaseInstruction: 'Phase instruction',
  cue: 'Cue',
  richText: 'Rich text',
  cueBlock: 'Block {{number}}',
  cueBlockType: 'Block type',
  cueBlockTypeLabel: 'Cue block {{number}} type',
  paragraph: 'Paragraph',
  bullet: 'Bullet list item',
  numbered: 'Numbered list item',
  cueFormatting: 'Cue block {{number}} formatting',
  bold: 'Bold',
  italic: 'Italic',
  underline: 'Underline',
  cueText: 'Cue block {{number}} text',
  linkOptional: 'Link URL (optional)',
  cueLink: 'Cue block {{number}} link',
  removeBlock: 'Remove block',
  addCueBlock: 'Add cue block',
  cancelCueChanges: 'Cancel cue changes',
  applyCue: 'Apply cue',
  cuePreview: 'Formatted cue preview',
  cueChangesCancelled: 'Cue changes cancelled.',
  restoreDraft: 'Restore retained draft {{number}}',
  restoreTitleDraft: 'Restore title draft {{number}}',
  draftRestored: 'Draft restored locally. Apply explicitly to update the play.',
  draftPending: 'Unapplied local draft; not shared with collaborators.',
  draftStorageFailed: 'Draft recovery storage failed. Keep this tab open and export drafts.',
  exportDrafts: 'Export drafts / emergency journal',
  emptyEyebrow: 'ReplayLab local authoring',
  emptyTitle: 'Open a half-court play.',
  emptyBody: 'One local play keeps ten players, a derived ball, and every phase available without a save button.',
  openSeededPlay: 'Open seeded play',
  seededTitle: 'Horns entry',
  seededCueOne: 'Start in horns.',
  seededCueTwo: 'Finish at the rim.',
} as const;

type MessageKey = keyof typeof en;

const ru: Record<MessageKey, string> = {
  restoreDraft: 'Восстановить сохранённый черновик {{number}}',
  restoreTitleDraft: 'Восстановить черновик названия {{number}}',
  draftRestored: 'Черновик восстановлен локально. Примените его явно для изменения комбинации.',
  draftPending: 'Неприменённый локальный черновик; соавторам не передаётся.',
  draftStorageFailed: 'Не удалось сохранить черновик для восстановления. Не закрывайте вкладку и экспортируйте черновики.',
  exportDrafts: 'Экспорт черновиков / аварийного журнала',
  appTitle: 'ReplayLab — редактор баскетбольных комбинаций',
  appDescription: 'ReplayLab — локальный редактор баскетбольных комбинаций',
  bootLoading: 'Открываем локальную комбинацию…',
  brandHome: 'Главная ReplayLab',
  brandTagline: 'Редактор половины площадки',
  language: 'Язык', languageRu: 'RU', languageEn: 'EN', playName: 'Название комбинации', history: 'История', undo: 'Отменить', redo: 'Повторить',
  documentStatus: 'Состояние документа', savedLocally: 'Сохранено локально', savingLocally: 'Сохраняем локально…', localSaveFailed: 'Локальное сохранение не удалось — рекомендуем экспорт', memoryOnly: 'Копия восстановления только для чтения',
  offlineShellReady: 'Офлайн-оболочка готова', offlineShellUpdate: 'Обновление офлайн-оболочки готово — безопасно применится после закрытия вкладки', offlineShellUnsupported: 'Офлайн-оболочка недоступна в этом браузере', offlineShellError: 'Офлайн-оболочка недоступна — онлайн-загрузка продолжает работать', offlineShellPreparing: 'Готовим офлайн-оболочку…',
  storageRequesting: 'Запрашиваем постоянное хранилище…', storagePersisted: 'Постоянное хранилище разрешено', storageEvictable: 'Браузер может очистить хранилище', storageDenied: 'Постоянное хранилище не разрешено — рекомендуем экспорт', storageUnsupported: 'Управление хранением недоступно', storageError: 'Не удалось проверить хранение — рекомендуем экспорт', storageChecking: 'Проверяем сохранность хранилища…', keepOffline: 'Сохранить офлайн',
  networkConnecting: 'Подключаем сетевую копию…', networkSyncing: 'Синхронизируем сетевую копию…', networkSyncedRead: 'Комната только для чтения · синхронизировано', networkSyncedWrite: 'Комната для редактирования · синхронизировано', networkRateLimited: 'Лимит запросов · повтор через {{milliseconds}} мс', networkBlocked: 'Сетевая копия остановлена · {{reason}}', terminalError: 'неустранимая ошибка', networkOffline: 'Сетевая копия офлайн · локальная версия сохранена', localOnly: 'Только локально — сетевая синхронизация не настроена', offlineContinues: 'Офлайн — локальное редактирование доступно',
  needsReview: 'Нужно проверить · {{count}}', phaseProgress: 'Фаза {{current}} / {{total}}', exportJson: 'Экспорт JSON', recoveryFile: 'Файл восстановления', openRecovery: 'Открыть восстановление…', portableRecoveryExported: 'Переносимый файл восстановления экспортирован.', recoveryRejected: 'Файл восстановления отклонён. Текущая локальная комбинация не изменена.',
  localStorageFailedTitle: 'Локальное хранилище не открылось.', localStorageFailedBody: '{{reason}} Эта копия доступна только для чтения; экспортируйте её перед выходом.', localStorageGenericReason: 'Браузер не смог открыть локальное хранилище ReplayLab.', indexedDbDenied: 'Доступ к IndexedDB запрещён для этого сеанса.', migrationInterrupted: 'Миграция была прервана', localPlayCorrupt: 'Локальные данные комбинации повреждены', futureSchema: 'Комбинация использует более новую схему', recoveryUnavailable: 'Копия восстановления недоступна', recoveryBody: '{{reason}} Текущая локальная база не перезаписана. {{detail}}', recoveryPreview: 'Последний корректный снимок открыт только для чтения.', recoveryBytes: 'Исходные байты доступны для экспорта.', localPlayReady: 'Локальная комбинация готова.', editingUnavailable: 'Редактирование недоступно: локальное хранилище не открылось.', technicalReason: 'Техническая причина: {{reason}}', commandFailed: 'Изменение не применено. Проверьте введённые данные и повторите попытку.',
  chooseLooseBall: 'Перед перемещением мяча выберите владение «Свободный мяч».', ballMoved: 'Мяч перемещён в {{x}}, {{y}}.', actorMoved: '{{actor}} перемещён в {{x}}, {{y}}.', phaseAdded: 'Фаза добавлена после текущей.', phaseMoved: 'Фаза перемещена на позицию {{position}} из {{total}}.', undid: 'Последнее локальное изменение отменено.', redid: 'Последнее локальное изменение повторено.', selectToolActive: 'Инструмент выбора активен.', actionToolActive: 'Инструмент «{{action}}» активен.', actionToolDraw: 'Инструмент «{{action}}» активен. Нарисуйте действие на площадке; Escape отменяет.', actionCreated: 'Действие «{{action}}» создано.', cueUpdated: 'Подсказка обновлена.', actionCancelled: 'Создание действия отменено.', playRenamed: 'Комбинация переименована: {{title}}.', possessionLoose: 'Выбрано владение: свободный мяч.', possessionActor: 'Выбрано владение: {{actor}}.', ballSelected: 'Мяч выбран.', actorSelected: '{{actor}} выбран.', actionDrawingCancelled: 'Рисование действия отменено.', conflictResolved: 'Конфликт разрешён.', conflictPhaseSelected: 'Фаза {{number}} выбрана для проверки конфликта.', phaseSelected: 'Выбрана фаза {{number}}.',
  formationSequence: 'Последовательность расстановок', phases: 'Фазы', addPhase: 'Добавить фазу', phaseCard: 'Фаза {{number}}', phasePosition: 'Фаза {{number}}, позиция {{position}} из {{total}}{{lifted}}', liftedSuffix: ', поднята для перемещения', looseBall: 'Свободный мяч', conflictsCount: 'Конфликтов: {{count}}', movingPhase: 'Перемещаем фазу {{source}} {{relation}} фазы {{target}}. Предпросмотр: позиция {{position}} из {{total}}.', before: 'перед', after: 'после', reorderCancelled: 'Перемещение фазы отменено. Исходный порядок восстановлен.', liftedPhase: 'Фаза {{number}} поднята. Позиция {{position}} из {{total}}.', liftedPhaseKeyboard: 'Фаза {{number}} поднята. Позиция {{position}} из {{total}}. Стрелки выбирают место, Space или Enter подтверждают, Escape отменяет.',
  basketballHalfCourt: 'Баскетбол · половина площадки', formationBoard: 'Тактическая доска', phaseChip: 'ФАЗА {{number}}', courtTools: 'Инструменты площадки', select: 'Выбор', keyboardAction: 'Действие с клавиатуры…', courtEditorLabel: 'Редактор комбинации на половине площадки. Выбирайте и перемещайте игроков или рисуйте активное тактическое действие. Escape отменяет рисование.', courtHelp: 'Перетащите игрока или нарисуйте действие. Escape отменяет. Стрелки перемещают выбранного игрока.', offense: 'Атака', defense: 'Защита', semanticCompanion: 'Семантическое представление', lineup: 'Расстановка', actorsAndBall: '10 + мяч', possession: 'Владение', actionsFromPhase: 'Действия из этой фазы', pathConflict: 'Конфликт траектории', adjacencyRepair: 'Нужно восстановить соседство фаз', ball: 'Мяч', heldBy: 'У игрока {{actor}}',
  mobileReviewTitle: 'Мобильный режим просмотра', mobileReviewBody: 'Доступны воспроизведение, прокрутка, семантическая расстановка, список действий и чтение подсказки. Для редактирования нужен планшет или компьютер.', tabletModeTitle: 'Тренерский режим планшета', tabletModeBody: 'Перемещайте игроков и редактируйте подсказки. Траектории и порядок фаз редактируются на компьютере.', desktopMode: 'Полное редактирование', unsupportedHere: 'Недоступно в этом режиме',
  onboardingEyebrow: 'Первое изменение', onboardingTitle: 'Переместите игрока и сделайте комбинацию своей.', onboardingBody: 'Выберите игрока на площадке или в расстановке, затем перетащите его или используйте стрелки. После первого успешного изменения подсказка исчезнет.', demoEyebrow: 'Сценарий портфолио', demoTitle: 'ReplayLab за 60 секунд', demoCore: '0–30 с · Запустите и остановите комбинацию, переместите игрока, нарисуйте передачу, измените подсказку.', demoProof: '30–60 с · Отключите один клиент, создайте конфликт позы, подключитесь снова, разрешите конфликт, сдвиньте игрока и отмените только этот сдвиг.', demoResilient: 'Если сеть недоступна, покажите локальное изменение, экспорт восстановления, воспроизведение и клавиатурный сценарий.',
  createActionTitle: 'Создать тактическое действие', createActionIntro: 'Клавиатурный способ: выберите действие и задайте конечную точку.', action: 'Действие', player: 'Игрок', targetPlayer: 'Целевой игрок', endX: 'Конечная x', endY: 'Конечная y', cancel: 'Отмена', createAction: 'Создать действие', cut: 'Рывок', pass: 'Передача', dribble: 'Дриблинг', screen: 'Заслон',
  concurrentIntentions: 'Параллельные намерения', conflicts: 'Конфликты', noConflicts: 'Неразрешённых семантических конфликтов нет.', candidate: 'Вариант {{number}}', author: 'автор {{actor}}', averageCandidates: 'Среднее вариантов', showPhase: 'Показать фазу', resolve: 'Разрешить', conflictResolutionAnnouncement: '«{{title}}» разрешён одной отменяемой командой.', conflictPoseTitle: 'Фаза {{number}} · поза {{actor}}', conflictPossessionTitle: 'Фаза {{number}} · владение', conflictLooseTitle: 'Фаза {{number}} · позиция свободного мяча', conflictPathTitle: 'Фаза {{number}} · траектория «{{action}}»', points: 'Точек: {{count}} · {{coordinates}}',
  playbackControls: 'Управление воспроизведением', previousPhase: 'Предыдущая фаза', previous: 'Назад', playTactic: 'Воспроизвести комбинацию', pausePlayback: 'Приостановить воспроизведение', play: 'Старт', pause: 'Пауза', nextPhase: 'Следующая фаза', next: 'Далее', playhead: 'Позиция воспроизведения', phaseAtTime: 'Фаза {{number}}, {{current}} из {{total}}', pausedOffscreen: 'Пауза вне экрана', present: 'Показ', presentationMode: 'Режим показа', presentLabel: 'REPLAYLAB · ПОКАЗ', presentShortcuts: 'Space — старт/пауза · [ ] — фаза · Esc — выход', coachCue: 'Подсказка тренера', exitPresentation: 'Выйти из показа',
  collaborationPresence: 'Участники совместной работы', liveCount: 'В сети · {{count}}', follow: 'Следовать', followingAnnouncement: 'Следуем за {{name}}. Escape завершает.', followEnded: 'Слежение за ведущим завершено. Локальное управление восстановлено.', stopFollowing: 'Не следовать',
  phaseInstruction: 'Указание к фазе', cue: 'Подсказка', richText: 'Форматированный текст', cueBlock: 'Блок {{number}}', cueBlockType: 'Тип блока', cueBlockTypeLabel: 'Тип блока подсказки {{number}}', paragraph: 'Абзац', bullet: 'Маркированный пункт', numbered: 'Нумерованный пункт', cueFormatting: 'Форматирование блока подсказки {{number}}', bold: 'Жирный', italic: 'Курсив', underline: 'Подчёркивание', cueText: 'Текст блока подсказки {{number}}', linkOptional: 'Ссылка (необязательно)', cueLink: 'Ссылка блока подсказки {{number}}', removeBlock: 'Удалить блок', addCueBlock: 'Добавить блок', cancelCueChanges: 'Отменить изменения', applyCue: 'Применить подсказку', cuePreview: 'Предпросмотр подсказки', cueChangesCancelled: 'Изменения подсказки отменены.',
  emptyEyebrow: 'Локальный редактор ReplayLab', emptyTitle: 'Откройте комбинацию на половине площадки.', emptyBody: 'Одна локальная комбинация хранит десять игроков, вычисляемый мяч и все фазы без кнопки сохранения.', openSeededPlay: 'Открыть пример', seededTitle: 'Вход через рога', seededCueOne: 'Начните в расстановке «рога».', seededCueTwo: 'Завершите у кольца.',
};

const dictionaries: Record<Locale, Record<MessageKey, string>> = { ru, en };

function interpolate(template: string, values?: Record<string, string | number>) {
  if (!values) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(values[key] ?? ''));
}

export function readInitialLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return stored === 'en' || stored === 'ru' ? stored : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function translate(locale: Locale, key: MessageKey, values?: Record<string, string | number>) {
  return interpolate(dictionaries[locale][key], values);
}

export function applyDocumentLocale(locale: Locale) {
  document.documentElement.lang = locale;
  document.title = translate(locale, 'appTitle');
  document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute(
    'content',
    translate(locale, 'appDescription')
  );
}

type LocaleContextValue = {
  locale: Locale;
  setLocale(locale: Locale): void;
  t(key: MessageKey, values?: Record<string, string | number>): string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ initialLocale, children }: { initialLocale: Locale; children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  useEffect(() => applyDocumentLocale(locale), [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // Language selection remains valid for the current session.
    }
  }, []);

  const value = useMemo<LocaleContextValue>(() => ({
    locale,
    setLocale,
    t: (key, values) => translate(locale, key, values),
  }), [locale, setLocale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error('useI18n must be used inside LocaleProvider');
  return context;
}

export function actionLabel(locale: Locale, action: 'cut' | 'pass' | 'dribble' | 'screen') {
  return translate(locale, action);
}

export function teamLabel(locale: Locale, team: 'offense' | 'defense') {
  return translate(locale, team);
}

export function actorLabel(locale: Locale, actorId: string) {
  const match = actorId.match(/^(offense|defense)-(\d+)$/);
  if (!match) return actorId;
  return `${teamLabel(locale, match[1] as 'offense' | 'defense')} ${match[2]}`;
}
