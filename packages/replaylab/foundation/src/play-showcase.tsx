import { useEffect, useRef, useState } from 'react';
import { CourtMiniature } from './court-miniature';
import { ACTOR_IDS, deriveBallPose, type ActorId, type Pose } from './domain';
import { PICK_ROLL_IDS, PICK_ROLL_POSES, PICK_ROLL_ACTIONS, pickRollCopy } from './pick-roll';
import { pointOnPath } from './trajectory';
import { useI18n } from './i18n';

export function PlayShowcase() {
  const { locale } = useI18n();
  const copy = pickRollCopy(locale);
  const scene = useRef<HTMLDivElement>(null);
  const clock = useRef(0);
  const [playing, setPlaying] = useState(() => !matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const root = scene.current!;
    let frame = 0;
    let previous = 0;
    let visible = true;
    const pieces = [...ACTOR_IDS, 'ball'].map(id => root.querySelector<SVGGElement>(`[data-piece="${id}"]`)!);
    const stepNodes = root.querySelectorAll<HTMLElement>('[data-demo-step]');
    const progress = root.querySelector<HTMLElement>('.demo-progress i')!;
    const paint = () => {
      const step = Math.min(3, Math.floor(clock.current / 2400));
      root.dataset.demoStep = String(step);
      const ratio = Math.max(0, Math.min(1, (clock.current % 2400 - 600) / 1800));
      const from = PICK_ROLL_POSES[step]!;
      const to = PICK_ROLL_POSES[Math.min(3, step + 1)]!;
      const projected = {} as Record<ActorId, Pose>;
      ACTOR_IDS.forEach((id, i) => {
        const path = PICK_ROLL_ACTIONS.find(action => action.fromFrameId === PICK_ROLL_IDS[step] && action.actorId === id && action.type !== 'pass')?.path.points;
        const a = from[id]; const b = to[id];
        const pose = path ? pointOnPath(path, ratio) : { x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio };
        projected[id] = pose;
        pieces[i]!.setAttribute('transform', `translate(${pose.x} ${pose.y})`);
      });
      const ballFrom = deriveBallPose(from, step === 3 ? 'offense-5' : 'offense-1', null);
      const ballTo = deriveBallPose(to, step >= 2 ? 'offense-5' : 'offense-1', null);
      const ball = step === 2 ? { x: ballFrom.x + (ballTo.x - ballFrom.x) * ratio, y: ballFrom.y + (ballTo.y - ballFrom.y) * ratio } : deriveBallPose(projected, step === 3 ? 'offense-5' : 'offense-1', null);
      pieces[10]!.setAttribute('transform', `translate(${ball.x} ${ball.y})`);
      stepNodes.forEach((node, i) => node.dataset.active = String(i === step));
      progress.style.transform = `scaleX(${clock.current / 9600})`;
    };
    const tick = (now: number) => {
      if (previous) clock.current = (clock.current + Math.min(50, now - previous)) % 9600;
      previous = now; paint();
      frame = requestAnimationFrame(tick);
    };
    const update = () => {
      cancelAnimationFrame(frame); previous = 0;
      if (playing && visible && !document.hidden) frame = requestAnimationFrame(tick);
    };
    const observer = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? false; update(); });
    observer.observe(root);
    document.addEventListener('visibilitychange', update);
    paint(); update();
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    const reduceChanged = () => { if (reduce.matches) setPlaying(false); };
    reduce.addEventListener('change', reduceChanged);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); document.removeEventListener('visibilitychange', update); reduce.removeEventListener('change', reduceChanged); };
  }, [playing, locale]);
  return <div className="play-showcase" ref={scene}>
    <div className="scene-meta"><span>{locale === 'ru' ? 'РАЗБИРАЕМ КОМБИНАЦИЮ' : 'INSIDE THE PLAY'}</span><span>5 × 5 / 01</span></div>
    <div className="scene-court"><CourtMiniature /><span className="scene-label label-handler">1 · {locale === 'ru' ? 'ведёт игру' : 'ball handler'}</span><span className="scene-label label-screen">5 · {locale === 'ru' ? 'создаёт пространство' : 'creates space'}</span></div>
    <div className="scene-transport"><div><small>{locale === 'ru' ? 'ОТ ЗАМЫСЛА К ДВИЖЕНИЮ' : 'FROM IDEA TO MOTION'}</small><h2>{locale === 'ru' ? 'Пик-н-ролл' : 'Pick & roll'}</h2></div><button type="button" className="demo-toggle" aria-label={playing ? (locale === 'ru' ? 'Остановить пример' : 'Pause example') : (locale === 'ru' ? 'Воспроизвести пример' : 'Play example')} onClick={() => setPlaying(value => !value)}>{playing ? 'Ⅱ' : '▶'}</button></div>
    <div className="demo-progress" aria-hidden="true"><i /></div>
    <ol className="demo-steps">{copy.steps.map((step, index) => <li key={step} data-demo-step data-active={index === 0}><span>0{index + 1}</span>{step}</li>)}</ol>
    <p className="sr-only">{copy.cues.join(' ')}</p>
  </div>;
}
