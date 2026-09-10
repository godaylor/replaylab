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
  }): void;
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
        <div className="coordinate-fields">
          <label><span>{t('endX')}</span><input type="number" min="20" max="820" value={x} onChange={event => setX(event.target.valueAsNumber)} /></label>
          <label><span>{t('endY')}</span><input type="number" min="20" max="440" value={y} onChange={event => setY(event.target.valueAsNumber)} /></label>
        </div>
        <div className="dialog-actions">
          <button type="button" onClick={() => props.onClose(true)}>{t('cancel')}</button>
          <button
            className="button button-accent"
            type="button"
            onClick={() => props.onCreate({ actorId, type, targetActorId: needsTarget ? targetActorId : null, x, y })}
          >
            {t('createAction')}
          </button>
        </div>
      </section>
    </div>
  );
}
