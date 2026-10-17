import { useEffect, useRef, useState } from 'react';
import { useI18n } from './i18n';

export function openPractice(tour = false) {
  location.assign(`/app/play/practice-${crypto.randomUUID()}/edit?lesson=1${tour ? '&tour=1' : '&watch=1'}`);
}

export function CourtLegend() {
  const { locale } = useI18n();
  return <ul className="court-legend" aria-label={locale === 'ru' ? 'Обозначения площадки' : 'Court legend'}>
    <li><span className="token token-offense">1</span>{locale === 'ru' ? 'Атака' : 'Offense'}</li>
    <li><span className="token token-defense">1</span>{locale === 'ru' ? 'Защита' : 'Defense'}</li>
    <li><span className="token token-ball" aria-hidden="true">●</span>{locale === 'ru' ? 'Мяч · у владельца' : 'Ball · with its holder'}</li>
    <li>{locale === 'ru' ? '→ движение · ⇢ передача · ⊥ заслон' : '→ movement · ⇢ pass · ⊥ screen'}</li>
  </ul>;
}

// Navigation state only. The guide never runs document commands or resets a play.
export function PracticeGuide({ mode }: { mode: 'desktop' | 'tablet' | 'mobile' }) {
  const { locale } = useI18n();
  const ru = locale === 'ru';
  const practice = new URLSearchParams(location.search).get('lesson') === '1';
  const [step, setStep] = useState<number | null>(() => practice && new URLSearchParams(location.search).get('tour') === '1' ? 0 : null);
  const [missing, setMissing] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const steps = mode === 'mobile' ? [
    { title: ru ? 'Кто где играет' : 'Who is where', body: ru ? 'Оранжевые игроки атакуют, светлые защищаются. В каждой команде номера от 1 до 5. На телефоне можно смотреть комбинацию; редактируйте на компьютере.' : 'Orange players attack; light players defend. Each team has numbers 1 to 5. Review on your phone and edit on a computer.', target: '#court' },
    { title: ru ? 'Запустите комбинацию' : 'Play the combination', body: ru ? 'Нажмите «Старт» под площадкой. Чтобы остановиться, нажмите «Пауза».' : 'Press Play below the court. Press Pause to stop.', target: '.playback-primary' },
    { title: ru ? 'Посмотрите каждый шаг' : 'Review each step', body: ru ? 'Выберите шаг под площадкой: увидите позиции игроков и заметку тренера.' : 'Select a step below the court to see player positions and the coach’s note.', target: '.phase-card' },
  ] : [
    { title: ru ? 'Кто где играет' : 'Who is where', body: ru ? 'Оранжевые игроки атакуют, светлые защищаются. В каждой команде номера от 1 до 5. Стрелки показывают движение к следующему шагу.' : 'Orange players attack; light players defend. Each team has numbers 1 to 5. Arrows show movement to the next step.', target: '#court' },
    { title: ru ? 'Переместите игрока' : 'Move a player', body: ru ? 'Перетащите игрока на площадке. С клавиатуры: выберите первого атакующего в «Расстановке» и нажмите стрелку вправо.' : 'Drag a player on the court. With a keyboard, select the first offensive player in Lineup and press Right Arrow.', target: '[data-actor-id="offense-1"]' },
    { title: ru ? 'Добавьте движение' : 'Add movement', body: mode === 'tablet' ? (ru ? 'На сенсорном экране перемещайте игроков и редактируйте заметки. Для рисования нужна мышь или трекпад; этот шаг можно пропустить.' : 'On a touchscreen, move players and edit notes. Drawing needs a mouse or trackpad; you can skip this step.') : (ru ? 'Откройте шаг 1, выберите «Рывок» и проведите линию от игрока к цели. Escape отменяет. Без мыши используйте «Действие с клавиатуры…».' : 'Open step 1, choose Cut and draw from a player to the destination. Escape cancels. Without a mouse, use Keyboard action…. '), target: '.action-tools button' },
    { title: ru ? 'Проиграйте' : 'Play it back', body: ru ? 'Нажмите «Старт» и посмотрите, как игроки переходят к следующему шагу.' : 'Press Play to see players move to the next step.', target: '.playback-primary' },
    { title: ru ? 'Остановите' : 'Pause', body: ru ? 'Нажмите «Пауза», чтобы рассмотреть позиции игроков.' : 'Press Pause to inspect player positions.', target: '.playback-primary' },
    { title: ru ? 'Отмените изменение' : 'Undo your edit', body: ru ? '«Отменить» вверху убирает ваше последнее изменение. «Повторить» возвращает его.' : 'Undo at the top removes your last edit. Redo restores it.', target: '.history-controls button' },
    { title: ru ? 'Перенесите комбинацию' : 'Move the play to another device', body: ru ? 'Изменения сохраняются автоматически. Для другого устройства скачайте «Файл восстановления» и откройте его через «Открыть восстановление…».' : 'Edits save automatically. For another device, download a Recovery file and open it using Open recovery….', target: '#export-recovery' },
    { title: ru ? 'Откройте снова' : 'Reopen the play', body: ru ? 'Нажмите «Пятый темп» и откройте комбинацию в «Недавних». Ваши изменения сохранятся.' : 'Go home with Fifth Tempo and open the play in Recent plays. Your edits remain.', target: '.brand' },
  ];
  const current = step === null ? null : steps[Math.min(step, steps.length - 1)]!;
  const close = () => { setStep(null); trigger.current?.focus(); };
  useEffect(() => {
    const url = new URL(location.href);
    if (url.searchParams.has('tour')) { url.searchParams.delete('tour'); history.replaceState(null, '', url); }
  }, []);
  useEffect(() => {
    if (step === null) return;
    setMissing(false);
    heading.current?.focus();
  }, [step]);
  useEffect(() => {
    setStep(value => value === null ? null : Math.min(value, steps.length - 1));
  }, [steps.length]);
  useEffect(() => {
    if (step === null) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('dialog[open], [aria-modal="true"]')) return;
      event.preventDefault(); setStep(null); trigger.current?.focus();
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [step]);
  return <section className="practice-help" onKeyDown={event => {
    if (event.key === 'Escape' && step !== null) { event.preventDefault(); event.stopPropagation(); close(); }
  }}>
    <div className="practice-heading">
      <button ref={trigger} className="button" onClick={() => practice ? setStep(step === null ? 0 : null) : openPractice(true)}>{ru ? 'Как пользоваться' : 'How to use'}</button>
      <p>{practice ? (ru ? 'Изменения сохраняются автоматически.' : 'Edits save automatically.') : (ru ? 'Откроется отдельный пример.' : 'Opens a separate example.')}</p>
    </div>
    {current && <div className="practice-steps" role="region" aria-label={ru ? 'Пошаговое знакомство' : 'Step-by-step guide'}>
      <h2 ref={heading} tabIndex={-1}>{Math.min(step!, steps.length - 1) + 1} / {steps.length} · {current.title}</h2>
      <p>{current.body}</p>
      <button className="button" onClick={() => {
        const target = document.querySelector<HTMLElement>(current.target);
        for (let disclosure = target?.closest('details'); disclosure; disclosure = disclosure.parentElement?.closest('details') ?? null) disclosure.open = true;
        if (!target || target.getClientRects().length === 0 || target.matches(':disabled')) { setMissing(true); return; }
        target.scrollIntoView({ block: 'center', behavior: 'instant' }); target.focus({ preventScroll: true });
      }}>{ru ? 'Перейти к элементу' : 'Go to control'}</button>
      {missing && <p role="status">{ru ? 'Элемент сейчас недоступен. Можно вернуться назад, продолжить или пропустить знакомство.' : 'This control is unavailable right now. Go back, continue or skip the guide.'}</p>}
      <nav aria-label={ru ? 'Шаги знакомства' : 'Guide steps'}>
        <button className="button" disabled={step === 0} onClick={() => setStep(value => Math.max(0, value! - 1))}>{ru ? 'Назад' : 'Back'}</button>
        <button className="button" onClick={close}>{ru ? 'Пропустить' : 'Skip'}</button>
        <button className="button button-accent" onClick={() => step! >= steps.length - 1 ? close() : setStep(step! + 1)}>{step! >= steps.length - 1 ? (ru ? 'Завершить' : 'Finish') : (ru ? 'Далее' : 'Next')}</button>
      </nav>
    </div>}
  </section>;
}
