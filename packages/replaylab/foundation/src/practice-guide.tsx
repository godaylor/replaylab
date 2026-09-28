import { useEffect, useRef, useState } from 'react';
import { useI18n } from './i18n';

export function openPractice(tour = false) {
  location.assign(`/app/play/practice-${crypto.randomUUID()}/edit?lesson=1${tour ? '&tour=1' : ''}`);
}

export function CourtLegend() {
  const { locale } = useI18n();
  return <ul className="court-legend" aria-label={locale === 'ru' ? 'Обозначения площадки' : 'Court legend'}>
    <li><span className="token token-offense">O1</span>{locale === 'ru' ? 'Атака · O1–O5' : 'Offense · O1–O5'}</li>
    <li><span className="token token-defense">D1</span>{locale === 'ru' ? 'Защита · D1–D5' : 'Defense · D1–D5'}</li>
    <li><span className="token token-ball" aria-hidden="true">●</span>{locale === 'ru' ? 'Мяч · у владельца' : 'Ball · with its holder'}</li>
    <li>{locale === 'ru' ? '→ Движение · ⇢ пунктир — передача · × — заслон' : '→ Movement · ⇢ dashed pass · × — screen'}</li>
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
    { title: ru ? 'Прочитайте площадку' : 'Read the court', body: ru ? 'O — атака, D — защита, жёлтый кружок — мяч. На телефоне доступны просмотр и воспроизведение; редактируйте на компьютере.' : 'O is offense, D is defense, the yellow circle is the ball. Phones support review and playback; edit on desktop.', target: '#court' },
    { title: ru ? 'Запустите комбинацию' : 'Play the combination', body: ru ? 'Нажмите «Старт» под площадкой. Та же кнопка «Пауза» останавливает воспроизведение.' : 'Use Play below the court. The same button becomes Pause to stop playback.', target: '.playback-primary' },
    { title: ru ? 'Прочитайте подсказку' : 'Read the coaching cue', body: ru ? 'Выбирайте фазы, чтобы читать замысел тренера. Просмотр не изменяет комбинацию.' : 'Choose phases to read the coach’s intent. Reviewing does not change the play.', target: '.phase-card' },
  ] : [
    { title: ru ? 'Прочитайте площадку' : 'Read the court', body: ru ? 'O1–O5 атакуют, D1–D5 защищаются. Жёлтый кружок — мяч у владельца. Линии показывают действие между двумя соседними фазами.' : 'O1–O5 attack, D1–D5 defend. The yellow circle is the holder’s ball. Lines describe an action between adjacent phases.', target: '#court' },
    { title: ru ? 'Переместите игрока' : 'Move a player', body: ru ? 'Выберите O1 в «Расстановке» и нажмите стрелку вправо. Можно также перетащить игрока. Список помогает выбрать игрока, когда значки рядом.' : 'Choose O1 in Lineup and press Right Arrow. You can also drag a player. Use the list when tokens overlap.', target: '[data-actor-id="offense-1"]' },
    { title: ru ? 'Добавьте движение' : 'Add movement', body: mode === 'tablet' ? (ru ? 'Рисование доступно на компьютере. На планшете можно перемещать игроков и редактировать подсказки; пропустите этот шаг.' : 'Draw paths on desktop. On tablet, reposition players and edit cues; skip this step.') : (ru ? 'В первой фазе выберите «Рывок», проведите линию на площадке и отпустите указатель. Escape отменяет черновик. «Действие с клавиатуры…» создаёт тот же тип движения без рисования.' : 'In the first phase, choose Cut, draw on the court, then release to finish. Escape cancels the draft. Keyboard action… creates the same movement without drawing.'), target: '.action-tools button' },
    { title: ru ? 'Проиграйте' : 'Play it back', body: ru ? 'Нажмите «Старт». Движение показывает переход между фазами и не меняет сохранённую расстановку.' : 'Press Play. Playback shows the transition between phases without changing the saved formation.', target: '.playback-primary' },
    { title: ru ? 'Остановите' : 'Pause', body: ru ? 'Нажмите «Пауза». Если комбинация уже закончилась, она остановится сама.' : 'Press Pause. If the play has already ended, playback stops automatically.', target: '.playback-primary' },
    { title: ru ? 'Отмените изменение' : 'Undo your edit', body: ru ? 'Нажмите «Отменить» вверху. Отменяется последнее ваше изменение, а не воспроизведение. «Повторить» возвращает его.' : 'Press Undo at the top. It undoes your last edit, not playback. Redo restores the edit.', target: '.history-controls button' },
    { title: ru ? 'Сохраните переносимую копию' : 'Keep a portable copy', body: ru ? 'Изменения сохраняются в этом браузере. «Файл восстановления» скачивает полную копию; на другом устройстве откройте её через «Открыть восстановление…». Обычный JSON предназначен для чтения, не для импорта.' : 'Edits are saved in this browser. Recovery file downloads a full copy; on another device use Open recovery…. Regular JSON is for inspection, not import.', target: '#export-recovery' },
    { title: ru ? 'Откройте снова' : 'Reopen the play', body: ru ? 'Завершите знакомство, нажмите ReplayLab и найдите учебную комбинацию в «Недавних». Она сохранит изменения. Новый пример создаёт отдельную копию.' : 'Finish the guide, go home with ReplayLab and find the practice play in Recent plays. Your edits remain. A new example creates a separate copy.', target: '.brand' },
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
      <p>{practice ? (ru ? 'Учебная копия · изменения сохраняются в этом браузере. Личные комбинации не затрагиваются.' : 'Practice copy · edits stay in this browser. Your personal plays are untouched.') : (ru ? 'Знакомство откроет отдельный учебный пример.' : 'The guide opens a separate practice play.')}</p>
    </div>
    {current && <div className="practice-steps" role="region" aria-label={ru ? 'Пошаговое знакомство' : 'Step-by-step guide'}>
      <h2 ref={heading} tabIndex={-1}>{Math.min(step!, steps.length - 1) + 1} / {steps.length} · {current.title}</h2>
      <p>{current.body}</p>
      <button className="button" onClick={() => {
        const target = document.querySelector<HTMLElement>(current.target);
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
