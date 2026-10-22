import { useRef, useState } from 'react';
import { useI18n } from './i18n';
import { recentPlays } from './recent-plays';
import { useOfflineShellState } from './offline';
import { openPractice } from './practice-guide';
import { Brand, ThemeSwitch } from './brand';
import { PlayShowcase } from './play-showcase';

function CourtIcon() {
  return <svg viewBox="0 0 64 44" width="64" height="44" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" focusable="false">
    <rect x="3" y="3" width="58" height="38" rx="2" />
    <path d="M44 13H61M44 31H61M44 13V31M61 7H53C22 7 22 37 53 37H61" />
    <path d="M44 16a6 6 0 0 0 0 12M3 16a6 6 0 0 1 0 12M56 17V27" />
    <circle cx="53" cy="22" r="2.5" />
  </svg>;
}

export function PlayHome() {
  const { locale, setLocale } = useI18n();
  const ru = locale === 'ru';
  const [plays] = useState(recentPlays);
  const [link, setLink] = useState('');
  const [error, setError] = useState(false);
  const inviteInput = useRef<HTMLInputElement>(null);
  useOfflineShellState();
  return <main className="play-home">
    <header className="home-header"><Brand />
      <a className="home-library-link" href="#plays">{ru ? 'Мои комбинации' : 'My plays'} <span aria-hidden="true">↗</span></a>
      <div className="home-preferences"><ThemeSwitch /><div className="language-switcher" role="group" aria-label={ru ? 'Язык' : 'Language'}>{(['ru', 'en'] as const).map(value => <button key={value} aria-pressed={locale === value} onClick={() => setLocale(value)}>{value.toUpperCase()}</button>)}</div></div>
    </header>
    <section className="home-intro">
      <div className="home-story"><p className="eyebrow"><span className="live-dot" />{ru ? 'Для баскетбольного тренера' : 'For basketball coaches'}</p>
        <h1>{ru ? <>Игра начинается<br />с <em>замысла.</em></> : <>Every play starts<br />with an <em>idea.</em></>}</h1>
        <p className="home-description">{ru ? 'Расставьте игроков. Покажите движение. Разберите комбинацию с командой.' : 'Position your players. Show the movement. Walk your team through the play.'}</p>
        <div className="home-actions"><button className="button button-accent home-primary" onClick={() => openPractice()}>{ru ? 'Смотреть пример' : 'Watch example'} <span aria-hidden="true">↗</span></button>
          <button className="button" onClick={() => { location.assign(`/app/play/${crypto.randomUUID()}/edit?new=1`); }}>{ru ? 'Создать комбинацию' : 'Create a play'}</button></div>
        <p className="home-device-note">{ru ? 'Без регистрации · Сохранение на устройстве · Работа без сети' : 'No sign-up · Saved on your device · Works offline'}</p>
      </div>
      <PlayShowcase />
    </section>
    <section className="home-work" id="plays"><div className="home-library" role="group" aria-labelledby="home-plays-heading">
      <div className="home-section-heading"><h2 id="home-plays-heading">{ru ? 'Недавние комбинации' : 'Recent plays'}</h2>{plays.length > 0 ? <span className="home-count"><span className="sr-only">{ru ? 'Показано комбинаций: ' : 'Plays shown: '}</span>{plays.length}</span> : null}</div>
      <p className="home-hint">{ru ? 'Сохраняются автоматически в этом браузере.' : 'Saved automatically in this browser.'}</p>
      {plays.length ? <ul className="recent-plays">{plays.map(play => <li key={play.id}><a href={play.href}><span className="recent-court" aria-hidden="true"><CourtIcon /></span><span><strong>{play.title}</strong><small>{new Date(play.opened).toLocaleDateString(locale, { month: 'short', day: 'numeric' })}</small></span><span className="recent-arrow" aria-hidden="true">↗</span></a></li>)}</ul> : <div className="home-empty">
        <span className="home-empty-icon" aria-hidden="true"><CourtIcon /></span>
        <div className="home-empty-copy"><strong>{ru ? 'Ваша первая комбинация' : 'Your first play'}</strong><p>{ru ? 'Откройте пример и измените его под свою команду. Он появится здесь.' : 'Open an example and adapt it to your team. You’ll find it here.'}</p></div>
        <button type="button" className="button home-empty-action" onClick={() => openPractice()}>{ru ? 'Начать с примера' : 'Start with an example'}</button>
      </div>}
    </div><form className="home-join" aria-labelledby="home-room-heading" noValidate onSubmit={event => { event.preventDefault(); try { const url = new URL(link); if (url.origin !== location.origin || !/^\/app\/play\/[^/]+\/edit\/?$/.test(url.pathname)) throw new Error(); location.assign(url.href); } catch { setError(true); inviteInput.current?.focus(); } }}>
      <h2 id="home-room-heading">{ru ? 'Открыть общую комнату' : 'Open a shared room'}</h2><p id="home-room-help">{ru ? 'Вставьте личную ссылку от тренера. Она даёт доступ к просмотру или совместному редактированию — храните её приватно.' : 'Paste the private link from your coach. It grants viewing or shared editing access, so keep it private.'}</p><label htmlFor="invite-link">{ru ? 'Ссылка на комнату' : 'Room link'}</label><input ref={inviteInput} id="invite-link" name="room-link" type="url" autoComplete="off" autoCapitalize="none" spellCheck={false} required value={link} aria-invalid={error} aria-describedby={error ? 'home-room-help home-room-error' : 'home-room-help'} onChange={event => { setLink(event.target.value); setError(false); }} placeholder="https://…"/><button className="button" type="submit">{ru ? 'Открыть комнату' : 'Open room'}</button>{error && <p id="home-room-error" role="alert">{ru ? 'Вставьте полную ссылку на комбинацию с этого сайта.' : 'Paste a complete play link from this site.'}</p>}
    </form></section>
    <footer className="home-footer"><Brand /><button type="button" className="home-help-link" onClick={() => openPractice(true)}>{ru ? 'Как пользоваться' : 'How to use'}</button><span>{ru ? 'Компьютер — редактор · Телефон — просмотр' : 'Desktop editing · Mobile viewing'}</span></footer>
  </main>;
}
