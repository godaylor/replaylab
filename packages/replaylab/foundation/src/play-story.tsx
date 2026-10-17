import { useEffect, useState } from 'react';
import type { ReplaySnapshot } from './domain';
import type { ReplayPlaybackController } from './playback';
import { PICK_ROLL_IDS, pickRollCopy, exampleStepName } from './pick-roll';
import { useI18n } from './i18n';

export function PlayStory({ snapshot, controller, phaseIndex, cue }: {
  snapshot: ReplaySnapshot;
  controller: ReplayPlaybackController;
  phaseIndex: number;
  cue(index: number): string;
}) {
  const { locale } = useI18n();
  const [playbackIndex, setIndex] = useState(phaseIndex);
  const index = Math.min(playbackIndex, snapshot.phases.length - 1);
  useEffect(() => { setIndex(phaseIndex); }, [phaseIndex]);
  useEffect(() => controller.onFrame(frame => setIndex(previous => previous === frame.phaseIndex ? previous : frame.phaseIndex)), [controller]);
  const phase = snapshot.phases[index] ?? snapshot.phases[0]!;
  const exampleIndex = PICK_ROLL_IDS.indexOf(phase.id as typeof PICK_ROLL_IDS[number]);
  const ru = locale === 'ru';
  const savedCue = cue(index);
  const originalCue = exampleIndex >= 0 && [pickRollCopy('ru').cues[exampleIndex], pickRollCopy('en').cues[exampleIndex]].includes(savedCue);
  const actions = snapshot.actions.filter(action => !action.archived && action.fromFrameId === phase.id);
  const exampleName = exampleStepName(phase.id, locale, snapshot);
  const exampleMovement = exampleName !== null;
  const final = index === snapshot.phases.length - 1;
  const detail = exampleMovement ? (ru ? [
    '5 занимает место рядом с защитником 1. Он освобождает путь для игрока с мячом.',
    '1 ведёт мяч мимо заслона. 5 разворачивается и движется к кольцу.',
    '1 отдаёт мяч 5. Остальные игроки остаются широко и удерживают защиту.',
    '5 с мячом у кольца. Конец примера — измените его под свою команду.',
  ] : [
    '5 moves beside 1’s defender to clear a path for the ball handler.',
    '1 dribbles past the screen. 5 turns and moves toward the rim.',
    '1 passes to 5. The other players stay wide and occupy their defenders.',
    '5 has the ball near the rim. The example ends here — adapt it to your team.',
  ])[exampleIndex] : actions.map(action => {
    const player = action.actorId.replace('offense-', '').replace('defense-', ru ? 'Защитник ' : 'Defender ');
    const target = action.targetActorId?.replace('offense-', ru ? 'игроку ' : '').replace('defense-', ru ? 'защитнику ' : 'defender ');
    const movement = ru ? { cut: 'движется без мяча', dribble: 'ведёт мяч', pass: `передаёт мяч${target ? ` ${target}` : ''}`, screen: `ставит заслон${target ? ` ${target}` : ''}` } : { cut: 'moves without the ball', dribble: 'dribbles', pass: `passes${target ? ` to ${target}` : ''}`, screen: `screens${target ? ` ${target}` : ''}` };
    return `${player} ${movement[action.type]}`;
  }).join(' · ');
  return <section className="play-story" aria-labelledby="story-heading">
    <span className="story-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
    <div className="story-main">
      <div className="story-kicker">{final ? (ru ? 'РЕЗУЛЬТАТ' : 'THE FINISH') : (ru ? `ДВИЖЕНИЕ ${index + 1} → ${index + 2}` : `MOVEMENT ${index + 1} → ${index + 2}`)}</div>
      <h2 id="story-heading" key={phase.id}>{exampleName ?? (final ? (ru ? 'Финальная позиция' : 'Final position') : (ru ? 'Следующее движение' : 'Next movement'))}</h2>
      <p className="story-cue">{!originalCue && savedCue ? savedCue : detail || (final ? (ru ? 'Конец комбинации.' : 'End of the play.') : (ru ? 'Выберите игрока и нарисуйте его движение к следующему шагу.' : 'Choose a player and draw their movement to the next step.'))}</p>
    </div>
    {exampleIndex >= 0 && <p className="story-goal"><span>{ru ? 'ЦЕЛЬ ПРИМЕРА' : 'EXAMPLE GOAL'}</span>{ru ? 'Вывести №5 с мячом к кольцу' : 'Get 5 the ball near the rim'}</p>}
  </section>;
}
