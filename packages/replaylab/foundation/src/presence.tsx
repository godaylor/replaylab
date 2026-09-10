import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import type { ReplayAwarenessSource } from './awareness';
import type { ReplaySnapshot } from './domain';
import type { ReplayPlaybackController } from './playback';
import { useI18n } from './i18n';

export function PresenceLayer({ source }: { source?: ReplayAwarenessSource }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!source) return;
    const draw = () => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (!canvas || !context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      for (const presence of source.presences) {
        const point = presence.gesture ?? presence.pointer;
        if (!point) continue;
        context.save();
        context.strokeStyle = presence.color;
        context.fillStyle = presence.color;
        context.lineWidth = 3;
        context.beginPath();
        context.arc(point.x, point.y, presence.gesture ? 15 : 7, 0, Math.PI * 2);
        context.stroke();
        context.font = '700 12px sans-serif';
        context.fillText(presence.participantName, point.x + 12, point.y - 12);
        context.restore();
      }
    };
    draw();
    return source.onVisualChange(draw);
  }, [source]);
  if (!source) return null;
  return <canvas ref={canvasRef} className="presence-layer" width={840} height={460} aria-hidden="true" />;
}

export function PresencePanel(props: {
  source?: ReplayAwarenessSource;
  playback: ReplayPlaybackController;
  snapshot: ReplaySnapshot;
  presenting: boolean;
  onPhaseSelected(index: number): void;
  onAnnounce(message: string): void;
}) {
  const { t } = useI18n();
  const { source, playback } = props;
  const revision = useSyncExternalStore(
    listener => source?.onChange(listener) ?? (() => {}),
    () => source?.revision ?? 0,
    () => 0
  );
  const [following, setFollowing] = useState<string | null>(null);
  const exitRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const presences = source?.presences ?? [];

  useEffect(() => {
    if (!source) return;
    void source.connect();
    return () => source.close();
  }, [source]);

  useEffect(() => {
    if (!source) return;
    if (!props.presenting) {
      source.publish({ presenter: null });
      return;
    }
    return playback.onFrame(frame => {
      source.publish({ presenter: {
        phaseIndex: frame.phaseIndex,
        playheadMs: frame.playheadMs,
        playing: playback.playing,
      } });
    });
  }, [playback, props.presenting, source]);

  useEffect(() => {
    if (!following || !source) return;
    const presenter = source.presences.find(item => item.clientId === following)?.presenter;
    if (!presenter) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    playback.pause();
    if (reduced) playback.goToPhase(Math.min(presenter.phaseIndex, props.snapshot.phases.length - 1));
    else playback.scrub(presenter.playheadMs);
    props.onPhaseSelected(playback.currentFrame.phaseIndex);
  }, [following, playback, props, revision, source]);

  useEffect(() => {
    if (!following) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setFollowing(null);
      source?.publish({ following: null });
      props.onAnnounce(t('followEnded'));
      requestAnimationFrame(() => restoreRef.current?.focus());
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [following, props, source, t]);

  if (!source) return null;
  return (
    <section className="presence-panel" aria-label={t('collaborationPresence')} data-awareness-state={source.state} data-following={following ?? ''}>
      <span className="presence-heading">{t('liveCount', { count: presences.length + 1 })}</span>
      <ul>
        {presences.map(presence => (
          <li key={presence.clientId}>
            <i style={{ background: presence.color }} aria-hidden="true" />
            <span>{presence.participantName}{presence.selection ? ` · ${presence.selection.entityId}` : ''}</span>
            {presence.presenter ? (
              <button
                type="button"
                onClick={event => {
                  restoreRef.current = event.currentTarget;
                  setFollowing(presence.clientId);
                  source.publish({ following: presence.clientId });
                  props.onAnnounce(t('followingAnnouncement', { name: presence.participantName }));
                  requestAnimationFrame(() => exitRef.current?.focus());
                }}
              >{t('follow')}</button>
            ) : null}
          </li>
        ))}
      </ul>
      {following ? (
        <button
          ref={exitRef}
          type="button"
          className="stop-follow"
          onClick={() => {
            setFollowing(null);
            source.publish({ following: null });
            props.onAnnounce(t('followEnded'));
            requestAnimationFrame(() => restoreRef.current?.focus());
          }}
        >{t('stopFollowing')} <kbd>Esc</kbd></button>
      ) : null}
    </section>
  );
}
