import type { ActorId, Pose } from './domain';

// Original demonstration data, used only when creating a NEW example. This is
// not a migration, a second document store, or a reset of an existing play.
export const PICK_ROLL_IDS = ['pickroll-setup', 'pickroll-screen', 'pickroll-drive', 'pickroll-pass'] as const;
export const PICK_ROLL_ACTIONS = [
  { id: 'example-screen', fromFrameId: PICK_ROLL_IDS[0], toFrameId: PICK_ROLL_IDS[1], actorId: 'offense-5' as const, type: 'screen' as const, targetActorId: 'defense-1' as const, path: { points: [{ x: 490, y: 315 }, { x: 385, y: 185 }] } },
  { id: 'example-drive', fromFrameId: PICK_ROLL_IDS[1], toFrameId: PICK_ROLL_IDS[2], actorId: 'offense-1' as const, type: 'dribble' as const, path: { points: [{ x: 300, y: 230 }, { x: 360, y: 170 }, { x: 430, y: 135 }, { x: 500, y: 155 }] } },
  { id: 'example-roll', fromFrameId: PICK_ROLL_IDS[1], toFrameId: PICK_ROLL_IDS[2], actorId: 'offense-5' as const, type: 'cut' as const, path: { points: [{ x: 385, y: 185 }, { x: 430, y: 260 }, { x: 540, y: 265 }] } },
  { id: 'example-pass', fromFrameId: PICK_ROLL_IDS[2], toFrameId: PICK_ROLL_IDS[3], actorId: 'offense-1' as const, type: 'pass' as const, targetActorId: 'offense-5' as const, path: { points: [{ x: 519, y: 136 }, { x: 709, y: 226 }] } },
  { id: 'example-finish', fromFrameId: PICK_ROLL_IDS[2], toFrameId: PICK_ROLL_IDS[3], actorId: 'offense-5' as const, type: 'cut' as const, path: { points: [{ x: 540, y: 265 }, { x: 690, y: 245 }] } },
];
export const PICK_ROLL_POSES: ReadonlyArray<Record<ActorId, Pose>> = [
  { 'offense-1': { x: 280, y: 230 }, 'offense-2': { x: 710, y: 65 }, 'offense-3': { x: 710, y: 395 }, 'offense-4': { x: 430, y: 80 }, 'offense-5': { x: 490, y: 315 }, 'defense-1': { x: 345, y: 230 }, 'defense-2': { x: 710, y: 115 }, 'defense-3': { x: 710, y: 345 }, 'defense-4': { x: 485, y: 100 }, 'defense-5': { x: 555, y: 300 } },
  { 'offense-1': { x: 300, y: 230 }, 'offense-2': { x: 710, y: 65 }, 'offense-3': { x: 710, y: 395 }, 'offense-4': { x: 430, y: 80 }, 'offense-5': { x: 385, y: 185 }, 'defense-1': { x: 355, y: 230 }, 'defense-2': { x: 710, y: 115 }, 'defense-3': { x: 710, y: 345 }, 'defense-4': { x: 485, y: 100 }, 'defense-5': { x: 470, y: 240 } },
  { 'offense-1': { x: 500, y: 155 }, 'offense-2': { x: 710, y: 65 }, 'offense-3': { x: 710, y: 395 }, 'offense-4': { x: 400, y: 75 }, 'offense-5': { x: 540, y: 265 }, 'defense-1': { x: 440, y: 200 }, 'defense-2': { x: 710, y: 115 }, 'defense-3': { x: 710, y: 345 }, 'defense-4': { x: 470, y: 105 }, 'defense-5': { x: 565, y: 200 } },
  { 'offense-1': { x: 580, y: 130 }, 'offense-2': { x: 710, y: 65 }, 'offense-3': { x: 710, y: 395 }, 'offense-4': { x: 400, y: 75 }, 'offense-5': { x: 690, y: 245 }, 'defense-1': { x: 525, y: 165 }, 'defense-2': { x: 710, y: 115 }, 'defense-3': { x: 710, y: 345 }, 'defense-4': { x: 470, y: 105 }, 'defense-5': { x: 610, y: 210 } },
];

export function pickRollCopy(locale: 'ru' | 'en') {
  return locale === 'ru' ? {
    title: 'Пик-н-ролл · свободный проход',
    steps: ['Расстановка', 'Заслон', 'Проход', 'Передача'],
    headings: ['Растяните защиту', 'Освободите путь', 'Уведите защитника', 'Найдите открытого'],
    cues: [
      '1 держит мяч наверху. 2 и 3 — в углах, 4 растягивает защиту. 5 выходит к защитнику первого номера: готовим высокий пик-н-ролл.',
      '5 ставит неподвижный заслон рядом с защитником 1. Первый номер проходит плечом к плечу с 5, чтобы защитнику пришлось огибать заслон.',
      '1 ведёт мяч к кольцу и стягивает на себя второго защитника. 5 разворачивается после заслона и открывается в свободный коридор.',
      '1 отдаёт передачу открывшемуся 5 возле кольца. 2, 3 и 4 сохраняют ширину: их защитники не могут одновременно закрыть проход и своих игроков.',
    ],
    roles: ['1 · разыгрывающий с мячом', '5 · заслон и выход к кольцу', '2, 3, 4 · ширина атаки'],
  } : {
    title: 'Pick & roll · create the opening',
    steps: ['Spacing', 'Screen', 'Drive', 'Pass'],
    headings: ['Stretch the defense', 'Create the opening', 'Draw the help', 'Find the open player'],
    cues: [
      '1 has the ball at the top. 2 and 3 hold the corners; 4 spaces the floor. 5 moves toward 1’s defender to set up a high pick and roll.',
      '5 sets a stationary screen beside 1’s defender. 1 brushes past 5, forcing the defender to go around the screen.',
      '1 drives toward the rim and draws a second defender. 5 turns after the screen and rolls into the open lane.',
      '1 passes to the open 5 near the rim. 2, 3 and 4 keep their spacing: their defenders cannot cover both the lane and their own players.',
    ],
    roles: ['1 · ball handler', '5 · screen & roll', '2, 3, 4 · floor spacing'],
  };
}

export function exampleStepName(id: string, locale: 'ru' | 'en') {
  const index = PICK_ROLL_IDS.indexOf(id as typeof PICK_ROLL_IDS[number]);
  return index < 0 ? null : pickRollCopy(locale).steps[index];
}
