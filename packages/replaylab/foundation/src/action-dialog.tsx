import { useEffect, useRef, useState } from 'react';

import type {
  ActorId,
  ReplaySnapshot,
  TacticalActionType,
} from './domain';
import { actionLabel, teamLabel, useI18n } from './i18n';

type Props = {
  snapshot: ReplaySnapshot;
  phaseIndex: number;
  initialActorId: ActorId;
  onCreate(input: {
    actorId: ActorId;
    type: TacticalActionType;
    targetActorId: ActorId | null;
    x: number;
    y: number;
  }): boolean;
  onClose(cancelled: boolean): void;
};

export function ActionDialog(props: Props) {
  const { locale, t } = useI18n();
  const [type, setType] = useState<TacticalActionType>('cut');
  const [actorId, setActorId] = useState(props.initialActorId);
  const [targetActorId, setTargetActorId] = useState<ActorId>('offense-2');
  const destination = props.snapshot.phases[props.phaseIndex + 1]?.poses[actorId] ??
    props.snapshot.phases[props.phaseIndex]!.poses[actorId];
  const [x, setX] = useState(destination.x);
  const [y, setY] = useState(destination.y);
  const [error, setError] = useState('');
  const firstRef = useRef<HTMLSelectElement>(null);
  const needsTarget = type === 'pass' || type === 'screen';

  useEffect(() => firstRef.current?.focus(), []);

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className="action-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="action-dialog-heading"
        onKeyDown={event => {
          if (event.key === 'Escape') {
            event.preventDefault();
            props.onClose(true);
          } else if (event.key === 'Tab') {
            const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button, select, input, textarea, [href]')].filter(element => !element.matches(':disabled'));
            const first = controls[0]; const last = controls.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
          }
        }}
      >
        <h2 id="action-dialog-heading">{t('createActionTitle')}</h2>
        <p>{t('createActionIntro')}</p>
        <label>
          <span>{t('action')}</span>
          <select ref={firstRef} value={type} onChange={event => setType(event.target.value as TacticalActionType)}>
            {(['cut', 'pass', 'dribble', 'screen'] as const).map(action => <option key={action} value={action}>{actionLabel(locale, action)}</option>)}
          </select>
        </label>
        <label>
          <span>{t('player')}</span>
          <select value={actorId} onChange={event => setActorId(event.target.value as ActorId)}>
            {props.snapshot.actors.map(actor => <option key={actor.id} value={actor.id}>{actor.label} · {teamLabel(locale, actor.team)}</option>)}
          </select>
        </label>
        {needsTarget ? (
          <label>
            <span>{t('targetPlayer')}</span>
            <select value={targetActorId} onChange={event => setTargetActorId(event.target.value as ActorId)}>
              {props.snapshot.actors.filter(actor => actor.id !== actorId && (type !== 'pass' || actor.team === 'offense')).map(actor => (
                <option key={actor.id} value={actor.id}>{actor.label} · {teamLabel(locale, actor.team)}</option>
              ))}
            </select>
          </label>
        ) : null}
        {type === 'pass' ? <p>{locale === 'ru' ? 'Передача направляется к выбранному игроку в следующей расстановке. Мяч перейдёт к нему.' : 'The pass goes to the selected player in the next formation. They receive possession.'}</p> : <div className="coordinate-fields">
          <label><span>{t('endX')}</span><input type="number" min="20" max="820" value={x} onChange={event => setX(event.target.valueAsNumber)} /></label>
          <label><span>{t('endY')}</span><input type="number" min="20" max="440" value={y} onChange={event => setY(event.target.valueAsNumber)} /></label>
        </div>}
        {error && <p role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" onClick={() => props.onClose(true)}>{t('cancel')}</button>
          <button
            className="button button-accent"
            type="button"
            onClick={() => {
              if (type !== 'pass' && (![x, y].every(Number.isFinite) || x < 20 || x > 820 || y < 20 || y > 440)) { setError(locale === 'ru' ? 'Конечная позиция должна быть внутри площадки: X от 20 до 820, Y от 20 до 440.' : 'The destination must be inside the court: X 20–820, Y 20–440.'); return; }
              if (needsTarget && targetActorId === actorId) { setError(locale === 'ru' ? 'Выберите другого игрока в качестве цели.' : 'Choose a different target player.'); return; }
              if ((type === 'pass' || type === 'dribble') && props.snapshot.phases[props.phaseIndex]!.possession.value !== actorId) { setError(locale === 'ru' ? 'Передачу или ведение начинает игрок с мячом. Выберите владельца мяча или измените владение.' : 'The ball holder starts a pass or dribble. Choose the ball holder or change possession.'); return; }
              setError('');
              if (!props.onCreate({ actorId, type, targetActorId: needsTarget ? targetActorId : null, x, y })) setError(t('commandFailed'));
            }}
          >
            {t('createAction')}
          </button>
        </div>
      </section>
    </div>
  );
}
