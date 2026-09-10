import { useEffect, useMemo, useRef, useState } from 'react';

import type { ActionPath, Pose, Possession, ReplaySnapshot } from './domain';
import {
  listSemanticConflicts,
  type ResolveConflictInput,
  type SemanticConflict,
} from './conflicts';
import { actionLabel, actorLabel, useI18n } from './i18n';

function conflictTitle(conflict: SemanticConflict, snapshot: ReplaySnapshot, locale: 'ru' | 'en', t: ReturnType<typeof useI18n>['t']) {
  const number = conflict.phaseIndex + 1;
  switch (conflict.target.kind) {
    case 'pose': return t('conflictPoseTitle', { number, actor: actorLabel(locale, conflict.target.actorId) });
    case 'possession': return t('conflictPossessionTitle', { number });
    case 'loose-ball': return t('conflictLooseTitle', { number });
    case 'action-path': {
      const actionId = conflict.target.actionId;
      const action = snapshot.actions.find(item => item.id === actionId);
      return t('conflictPathTitle', { number, action: action ? actionLabel(locale, action.type) : actionId });
    }
  }
}

function candidateLabel(value: Pose | Possession | ActionPath, locale: 'ru' | 'en', t: ReturnType<typeof useI18n>['t']) {
  if (typeof value === 'string') return value === 'loose' ? t('looseBall') : actorLabel(locale, value);
  if ('points' in value) {
    const start = value.points[0]!;
    const end = value.points.at(-1)!;
    return t('points', { count: value.points.length, coordinates: `(${Math.round(start.x)}, ${Math.round(start.y)}) → (${Math.round(end.x)}, ${Math.round(end.y)})` });
  }
  return `x ${Math.round(value.x)} · y ${Math.round(value.y)}`;
}

type ConflictPanelProps = {
  snapshot: ReplaySnapshot;
  readOnly: boolean;
  onResolve(input: ResolveConflictInput): void;
  onPhaseSelected(index: number): void;
  onAnnounce(message: string): void;
};

export function ConflictPanel(props: ConflictPanelProps) {
  const { locale, t } = useI18n();
  const conflicts = useMemo(
    () => listSemanticConflicts(props.snapshot),
    [props.snapshot]
  );
  const [choices, setChoices] = useState<Record<string, string>>({});
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousCount = useRef(conflicts.length);

  useEffect(() => {
    if (conflicts.length < previousCount.current) headingRef.current?.focus();
    previousCount.current = conflicts.length;
  }, [conflicts.length]);

  return (
    <section className="conflict-panel" aria-labelledby="conflict-heading">
      <div className="section-heading-row">
        <div>
          <span className="eyebrow">{t('concurrentIntentions')}</span>
          <h2 id="conflict-heading" ref={headingRef} tabIndex={-1}>{t('conflicts')}</h2>
        </div>
        <span className="entity-count" data-conflict-total={conflicts.length}>{conflicts.length}</span>
      </div>
      {conflicts.length === 0 ? (
        <p className="conflict-empty">{t('noConflicts')}</p>
      ) : (
        <ol className="conflict-list">
          {conflicts.map(conflict => {
            const choice = choices[conflict.id] ?? conflict.candidates[0]!.id;
            const title = conflictTitle(conflict, props.snapshot, locale, t);
            return (
              <li key={conflict.id} data-conflict-kind={conflict.target.kind}>
                <fieldset>
                  <legend>{title}</legend>
                  {conflict.candidates.map((candidate, index) => (
                    <label key={candidate.id}>
                      <input
                        type="radio"
                        name={conflict.id}
                        value={candidate.id}
                        checked={choice === candidate.id}
                        disabled={props.readOnly}
                        onChange={() => setChoices(current => ({ ...current, [conflict.id]: candidate.id }))}
                      />
                      <span>
                        <strong>{t('candidate', { number: index + 1 })}</strong>
                        <small>{candidateLabel(candidate.value, locale, t)} · {t('author', { actor: candidate.actorId })}</small>
                      </span>
                    </label>
                  ))}
                  {conflict.derivedValue ? (
                    <label>
                      <input
                        type="radio"
                        name={conflict.id}
                        value="derived"
                        checked={choice === 'derived'}
                        disabled={props.readOnly}
                        onChange={() => setChoices(current => ({ ...current, [conflict.id]: 'derived' }))}
                      />
                      <span>
                        <strong>{t('averageCandidates')}</strong>
                        <small>{candidateLabel(conflict.derivedValue, locale, t)}</small>
                      </span>
                    </label>
                  ) : null}
                </fieldset>
                <div className="conflict-actions">
                  <button type="button" onClick={() => props.onPhaseSelected(conflict.phaseIndex)}>
                    {t('showPhase')}
                  </button>
                  <button
                    type="button"
                    className="button button-accent"
                    disabled={props.readOnly}
                    onClick={() => {
                      props.onResolve(
                        choice === 'derived'
                          ? { target: conflict.target, derivedValue: conflict.derivedValue! }
                          : { target: conflict.target, candidateId: choice }
                      );
                      props.onAnnounce(t('conflictResolutionAnnouncement', { title }));
                    }}
                  >
                    {t('resolve')}
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
