import { useEffect, useState } from 'react';
import type { ReplaySnapshot } from './domain';
import type { ReplayPlaybackController } from './playback';
import { PICK_ROLL_IDS, pickRollCopy } from './pick-roll';
import { useI18n } from './i18n';

export function PlayStory({ snapshot, controller, phaseIndex, cue }: {
  snapshot: ReplaySnapshot;
  controller: ReplayPlaybackController;
  phaseIndex: number;
  cue(index: number): string;
}) {
  const { locale } = useI18n();
  const [index, setIndex] = useState(phaseIndex);
  useEffect(() => { setIndex(phaseIndex); }, [phaseIndex]);
  useEffect(() => controller.onFrame(frame => setIndex(previous => previous === frame.phaseIndex ? previous : frame.phaseIndex)), [controller]);
  const phase = snapshot.phases[index] ?? snapshot.phases[0]!;
  const exampleIndex = PICK_ROLL_IDS.indexOf(phase.id as typeof PICK_ROLL_IDS[number]);
  const copy = pickRollCopy(locale);
  const ru = locale === 'ru';
  const savedCue = cue(index);
  const originalCue = exampleIndex >= 0 && [pickRollCopy('ru').cues[exampleIndex], pickRollCopy('en').cues[exampleIndex]].includes(savedCue);
  return <section className="play-story" aria-labelledby="story-heading">
    <div className="story-kicker"><span>{ru ? 'ЗАМЫСЕЛ НА ПЛОЩАДКЕ' : 'THE IDEA ON COURT'}</span><span>{String(index + 1).padStart(2, '0')} / {String(snapshot.phases.length).padStart(2, '0')}</span></div>
    <span className="story-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
    <h2 id="story-heading" key={phase.id}>{exampleIndex >= 0 ? copy.headings[exampleIndex] : (ru ? 'Ваш следующий ход' : 'Your next move')}</h2>
    <p className="story-cue">{originalCue ? copy.cues[exampleIndex] : savedCue || (ru ? 'Переместите игроков и нарисуйте действие к следующему шагу. Запустите комбинацию, чтобы проверить движение.' : 'Move your players and draw an action to the next step. Play the combination to check the movement.')}</p>
    {exampleIndex >= 0 && <><p className="story-template-note">{ru ? 'Замысел примера · адаптируйте под свою команду' : 'Example play · adapt it to your team'}</p><ul className="story-roles">{copy.roles.map((role, i) => <li key={role}><span>{i === 0 ? '1' : i === 1 ? '5' : '↔'}</span>{role.substring(role.indexOf('·') + 1).trim()}</li>)}</ul></>}
    <div className="story-how"><span aria-hidden="true">↳</span><p>{ru ? 'Каждый шаг — отдельная расстановка. Оранжевые круги — атака, зелёные квадраты — защита. Линия задаёт действие к следующему шагу.' : 'Each step is a formation. Orange circles attack; green squares defend. A line defines an action to the next step.'}</p></div>
  </section>;
}
