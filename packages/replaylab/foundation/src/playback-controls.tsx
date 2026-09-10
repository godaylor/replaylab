import { useEffect, useRef, useState } from 'react';

import type { ReplaySnapshot } from './domain';
import {
  ReplayPlaybackController,
  type PlaybackFrame,
  type PlaybackState,
} from './playback';
import { useI18n } from './i18n';

type Props = {
  controller: ReplayPlaybackController;
  snapshot: ReplaySnapshot;
  getCue(index: number): string;
  onPhaseSelected(index: number): void;
  onPresentationChange?(presenting: boolean): void;
};

function formatTime(milliseconds: number) {
  return `${(milliseconds / 1000).toFixed(1)}s`;
}

export function PlaybackControls({ controller, snapshot, getCue, onPhaseSelected, onPresentationChange }: Props) {
  const { t } = useI18n();
  const [state, setState] = useState<PlaybackState>(controller.state);
  const [presenting, setPresenting] = useState(false);
  const [currentPhaseIndex, setCurrentPhaseIndex] = useState(controller.currentFrame.phaseIndex);
  const rangeRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLOutputElement>(null);
  const phaseRef = useRef<HTMLSpanElement>(null);
  const presenterPhaseRef = useRef<HTMLSpanElement>(null);
  const presenterCloseRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => controller.onState(setState), [controller]);

  useEffect(() => {
    controller.setSnapshot(snapshot);
  }, [controller, snapshot]);

  useEffect(() => {
    const update = (frame: PlaybackFrame) => {
      setCurrentPhaseIndex(frame.phaseIndex);
      const phaseLabel = t('phaseCard', { number: frame.phaseIndex + 1 });
      const range = rangeRef.current;
      if (range) {
        range.max = String(frame.totalDurationMs);
        range.value = String(frame.playheadMs);
        range.setAttribute(
          'aria-valuetext',
          t('phaseAtTime', { number: frame.phaseIndex + 1, current: formatTime(frame.playheadMs), total: formatTime(frame.totalDurationMs) })
        );
      }
      if (timeRef.current) {
        timeRef.current.value = `${formatTime(frame.playheadMs)} / ${formatTime(frame.totalDurationMs)}`;
      }
      if (phaseRef.current) phaseRef.current.textContent = phaseLabel;
      if (presenterPhaseRef.current) presenterPhaseRef.current.textContent = phaseLabel;
    };
    return controller.onFrame(update);
  }, [controller, t]);

  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => controller.setReducedMotion(query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, [controller]);

  useEffect(() => {
    let courtVisible = true;
    const update = () => controller.setRenderable(!document.hidden && courtVisible);
    const onVisibility = () => update();
    document.addEventListener('visibilitychange', onVisibility);
    const target = document.querySelector('[data-playback-viewport]');
    const observer =
      target && 'IntersectionObserver' in window
        ? new IntersectionObserver(entries => {
            courtVisible = entries[0]?.isIntersecting ?? true;
            update();
          })
        : null;
    if (target) observer?.observe(target);
    update();
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      observer?.disconnect();
    };
  }, [controller]);

  useEffect(() => {
    if (!presenting) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setPresenting(false);
      } else if (event.key === ' ') {
        event.preventDefault();
        controller.toggle();
      } else if (event.key === '[' || event.key === ']') {
        event.preventDefault();
        const index = controller.step(event.key === '[' ? -1 : 1);
        onPhaseSelected(index);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [controller, onPhaseSelected, presenting]);

  useEffect(() => {
    document.body.classList.toggle('is-presenting', presenting);
    onPresentationChange?.(presenting);
    if (presenting) requestAnimationFrame(() => presenterCloseRef.current?.focus());
    else restoreFocusRef.current?.focus();
    return () => document.body.classList.remove('is-presenting');
  }, [onPresentationChange, presenting]);

  const step = (direction: -1 | 1) => {
    controller.pause();
    const index = controller.step(direction);
    onPhaseSelected(index);
  };

  return (
    <section className="playback-bar" aria-label={t('playbackControls')} data-playback-state={state}>
      <div className="playback-buttons">
        <button type="button" onClick={() => step(-1)} aria-label={t('previousPhase')}>
          {t('previous')} <kbd>[</kbd>
        </button>
        <button
          type="button"
          className="button button-accent playback-primary"
          aria-label={controller.playing ? t('pausePlayback') : t('playTactic')}
          onClick={() => controller.toggle()}
        >
          {controller.playing ? t('pause') : t('play')} <kbd>Space</kbd>
        </button>
        <button type="button" onClick={() => step(1)} aria-label={t('nextPhase')}>
          {t('next')} <kbd>]</kbd>
        </button>
      </div>
      <label className="playback-scrubber">
        <span className="sr-only">{t('playhead')}</span>
        <input
          ref={rangeRef}
          type="range"
          min="0"
          max={controller.totalDurationMs}
          step="10"
          defaultValue={controller.playheadMs}
          onPointerDown={() => controller.pause()}
          onInput={event => controller.scrub(Number(event.currentTarget.value))}
          onChange={event => {
            controller.scrub(Number(event.currentTarget.value));
            onPhaseSelected(controller.currentFrame.phaseIndex);
          }}
        />
      </label>
      <div className="playback-readout" aria-hidden="true">
        <span ref={phaseRef}>{t('phaseCard', { number: 1 })}</span>
        <output ref={timeRef}>0.0s / {formatTime(controller.totalDurationMs)}</output>
        {state === 'suspended' ? <small>{t('pausedOffscreen')}</small> : null}
      </div>
      <button
        type="button"
        className="present-button"
        aria-haspopup="dialog"
        onClick={event => {
          restoreFocusRef.current = event.currentTarget;
          controller.pause();
          setPresenting(true);
        }}
      >
        {t('present')}
      </button>

      {presenting ? (
        <div className="presenter-overlay" role="dialog" aria-modal="true" aria-label={t('presentationMode')}>
          <div className="presenter-scorebug">
            <span>{t('presentLabel')}</span>
            <strong ref={presenterPhaseRef}>{t('phaseCard', { number: 1 })}</strong>
            <span>{t('presentShortcuts')}</span>
          </div>
          <div className="presenter-cue" aria-live="off">
            <span>{t('coachCue')}</span>
            <p>{snapshot.phases[currentPhaseIndex] ? getCue(currentPhaseIndex) : ''}</p>
          </div>
          <button
            ref={presenterCloseRef}
            type="button"
            className="presenter-close"
            onClick={() => setPresenting(false)}
          >
            {t('exitPresentation')}
          </button>
        </div>
      ) : null}
    </section>
  );
}
