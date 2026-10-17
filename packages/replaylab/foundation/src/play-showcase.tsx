import { useEffect, useRef, useState } from 'react';
import { drawCourtScene3D } from './court-scene-3d';
import { ACTOR_IDS, deriveBallPose, type ActorId, type Pose, type RegisterProjection, type ReplaySnapshot } from './domain';
import { PICK_ROLL_IDS, PICK_ROLL_POSES, PICK_ROLL_ACTIONS } from './pick-roll';
import { playbackDuration, playbackPhaseStarts, projectPlayback } from './playback';
import { useI18n } from './i18n';

const previewRegister = <T,>(value: T): RegisterProjection<T> => ({
  winnerId: 'preview', value,
  candidates: [{ id: 'preview', value, actorId: 'preview', commandId: 'preview' }],
});

// A read-only projection of the original example, not a second document store.
// The public preview uses the same interpolation and renderer as an open play.
const PREVIEW: ReplaySnapshot = {
  schemaVersion: 1,
  title: 'Pick & roll',
  conflictCount: 0,
  actors: ACTOR_IDS.map(id => ({ id, team: id.startsWith('offense') ? 'offense' : 'defense', number: Number(id.at(-1)), label: id })),
  phases: PICK_ROLL_POSES.map((poses, index) => {
    const possession = index === 3 ? 'offense-5' : 'offense-1';
    return {
      id: PICK_ROLL_IDS[index]!, rank: String(index), cueBlockId: `preview-${index}`,
      durationMs: 1800, holdMs: index === 3 ? 1800 : 650,
      poses,
      poseRegisters: Object.fromEntries(ACTOR_IDS.map(id => [id, previewRegister(poses[id])])) as Record<ActorId, RegisterProjection<Pose>>,
      possession: previewRegister(possession), looseBallPose: null,
      ballPose: deriveBallPose(poses, possession, null),
    };
  }),
  actions: PICK_ROLL_ACTIONS.map(action => ({ ...action, targetActorId: action.targetActorId ?? null, path: previewRegister(action.path), archived: false, adjacency: 'valid' })),
};
const PREVIEW_DURATION = playbackDuration(PREVIEW);
const PREVIEW_STARTS = playbackPhaseStarts(PREVIEW);

export function PlayShowcase() {
  const { locale } = useI18n();
  const ru = locale === 'ru';
  const scene = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const clock = useRef(0);
  const repaint = useRef<() => void>(() => {});
  const [playing, setPlaying] = useState(() => !matchMedia('(prefers-reduced-motion: reduce)').matches);
  const steps = ru
    ? ['5 ставит заслон', '1 ведёт мяч, 5 идёт к кольцу', '1 передаёт мяч 5', '5 с мячом у кольца']
    : ['5 sets the screen', '1 drives, 5 rolls to the rim', '1 passes to 5', '5 has the ball at the rim'];

  useEffect(() => {
    const root = scene.current!;
    const surface = canvas.current!;
    const context = surface.getContext('2d');
    if (!context) return;
    let animation = 0;
    let previous = 0;
    let visible = true;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    const stepNodes = root.querySelectorAll<HTMLButtonElement>('[data-demo-step]');
    const progress = root.querySelector<HTMLElement>('.demo-progress i')!;
    const paint = () => {
      const frame = projectPlayback(PREVIEW, clock.current);
      drawCourtScene3D(context, surface.width, surface.height, {
        snapshot: PREVIEW, frame,
        theme: document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
        motionReduced: reduce.matches,
      });
      root.dataset.demoStep = String(frame.phaseIndex);
      stepNodes.forEach((node, index) => {
        const active = index === frame.phaseIndex;
        node.dataset.active = String(active);
        if (active) node.setAttribute('aria-current', 'step');
        else node.removeAttribute('aria-current');
      });
      progress.style.transform = `scaleX(${clock.current / PREVIEW_DURATION})`;
    };
    repaint.current = paint;
    const resize = () => {
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(320, Math.round(surface.getBoundingClientRect().width * ratio));
      surface.width = width;
      surface.height = Math.round(width * 460 / 840);
      paint();
    };
    const tick = (now: number) => {
      if (previous) clock.current = (clock.current + Math.min(50, now - previous)) % PREVIEW_DURATION;
      previous = now;
      paint();
      animation = requestAnimationFrame(tick);
    };
    const update = () => {
      cancelAnimationFrame(animation);
      previous = 0;
      if (playing && visible && !document.hidden) animation = requestAnimationFrame(tick);
    };
    const observer = new IntersectionObserver(entries => {
      visible = entries[0]?.isIntersecting ?? false;
      update();
    });
    const sizeObserver = new ResizeObserver(resize);
    const themeObserver = new MutationObserver(paint);
    observer.observe(root);
    sizeObserver.observe(surface);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    document.addEventListener('visibilitychange', update);
    const reduceChanged = () => { if (reduce.matches) setPlaying(false); paint(); };
    reduce.addEventListener('change', reduceChanged);
    resize();
    update();
    return () => {
      cancelAnimationFrame(animation);
      observer.disconnect();
      sizeObserver.disconnect();
      themeObserver.disconnect();
      document.removeEventListener('visibilitychange', update);
      reduce.removeEventListener('change', reduceChanged);
      repaint.current = () => {};
    };
  }, [playing, locale]);

  return <div className="play-showcase" ref={scene}>
    <div className="scene-meta"><span>{ru ? 'КОМБИНАЦИЯ В ДВИЖЕНИИ' : 'A PLAY IN MOTION'}</span><span>5 × 5</span></div>
    <div className="scene-court scene-court-3d"><canvas ref={canvas} width={840} height={460} aria-hidden="true" /></div>
    <div className="scene-transport"><div><small>{ru ? 'ЦЕЛЬ: ВЫВЕСТИ 5 К КОЛЬЦУ' : 'THE GOAL: GET 5 TO THE RIM'}</small><h2>{ru ? 'Пик-н-ролл' : 'Pick & roll'}</h2></div><button type="button" className="demo-toggle" aria-label={playing ? (ru ? 'Остановить пример' : 'Pause example') : (ru ? 'Воспроизвести пример' : 'Play example')} onClick={() => setPlaying(value => !value)}>{playing ? 'Ⅱ' : '▶'}</button></div>
    <div className="demo-progress" aria-hidden="true"><i /></div>
    <ol className="demo-steps" aria-label={ru ? 'Движение по шагам' : 'Movement, step by step'}>{steps.map((step, index) => <li key={index}><button type="button" className="demo-step-button" data-demo-step data-active={index === 0} aria-current={index === 0 ? 'step' : undefined} onClick={() => {
      clock.current = PREVIEW_STARTS[index]!;
      setPlaying(false);
      repaint.current();
    }}><span aria-hidden="true">0{index + 1}</span>{step}</button></li>)}</ol>
    <p className="sr-only">{ru ? 'Оранжевые игроки 1–5 атакуют, светлые 1–5 защищаются. Нажмите на шаг, чтобы остановить движение и рассмотреть расстановку.' : 'Orange players 1–5 attack; light players 1–5 defend. Select a step to pause the movement and inspect the positions.'}</p>
  </div>;
}
