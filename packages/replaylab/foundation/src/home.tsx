import { useState } from 'react';
import { useI18n } from './i18n';
import { recentPlays } from './recent-plays';
import { useOfflineShellState } from './offline';
import { openPractice } from './practice-guide';
import { CourtMiniature } from './court-miniature';

export function PlayHome() {
  const { locale, setLocale } = useI18n();
  const ru = locale === 'ru';
  const [plays] = useState(recentPlays);
  const [link, setLink] = useState('');
  const [error, setError] = useState(false);
  useOfflineShellState();
  return <main className="play-home">
    <header className="home-header"><a className="brand" href="/"><span className="brand-mark" aria-hidden="true">RL</span><strong>ReplayLab</strong></a>
      <div className="language-switcher" role="group" aria-label={ru ? 'Язык' : 'Language'}>{(['ru', 'en'] as const).map(value => <button key={value} aria-pressed={locale === value} onClick={() => setLocale(value)}>{value.toUpperCase()}</button>)}</div>
    </header>
    <section className="home-intro">
      <div><p className="eyebrow">{ru ? 'Баскетбольная тактическая доска' : 'Basketball coaching board'}</p>
        <h1>{ru ? <>Покажите<br /><em>замысел.</em></> : <>Show them<br /><em>the play.</em></>}</h1>
        <p className="home-description">{ru ? 'Расставьте игроков, добавьте движение и проиграйте замысел. Ваша работа сохраняется в этом браузере — даже без сети.' : 'Position your players, add movement, and play it back. Your work stays in this browser, even when you go offline.'}</p>
        <button className="button button-accent" onClick={() => openPractice()}>{ru ? 'Открыть пример' : 'Open example'} <span aria-hidden="true">↗</span></button>
        <button className="button" onClick={() => { location.assign(`/app/play/${crypto.randomUUID()}/edit?new=1`); }}>{ru ? 'Создать комбинацию' : 'Create a play'}</button>
        <button className="button" onClick={() => openPractice(true)}>{ru ? 'Как пользоваться' : 'How to use'}</button>
        <p className="home-device-note">{ru ? 'Полный редактор — на компьютере. На телефоне — просмотр и воспроизведение.' : 'Create on desktop. Review and play back on your phone.'}</p>
      </div>
      <div className="home-board" aria-hidden="true"><div className="example-caption"><span>01 — 02</span><strong>{ru ? 'Ваша первая комбинация' : 'Your first play'}</strong></div><CourtMiniature /><div className="board-caption">5 × 5 <span>{ru ? 'РАССТАВИТЬ → ДВИЖЕНИЕ → ИГРАТЬ' : 'POSITION → MOVE → PLAY'}</span></div></div>
    </section>
    <section className="home-work"><div><h2>{ru ? 'Недавние комбинации' : 'Recent plays'}</h2><p className="home-hint">{ru ? 'На этом устройстве. Для переноса используйте экспорт в редакторе.' : 'On this device. Use export in the editor to keep a portable copy.'}</p>
      {plays.length ? <ul className="recent-plays">{plays.map(play => <li key={play.id}><a href={play.href}><span className="recent-court" aria-hidden="true">◒</span><span><strong>{play.title}</strong><small>{new Date(play.opened).toLocaleDateString(locale, { month: 'short', day: 'numeric' })}</small></span><span aria-hidden="true">↗</span></a></li>)}</ul> : <div className="home-empty">{ru ? 'Здесь появятся ваши комбинации. Создайте первую — начните с расстановки десяти игроков.' : 'Your plays will appear here. Create your first one and start with the ten-player lineup.'}</div>}
    </div><form className="home-join" noValidate onSubmit={event => { event.preventDefault(); try { const url = new URL(link); if (url.origin !== location.origin || !/^\/app\/play\/[^/]+\/edit\/?$/.test(url.pathname)) throw new Error(); location.assign(url.href); } catch { setError(true); } }}>
      <h2>{ru ? 'Работаете вместе?' : 'Working together?'}</h2><p>{ru ? 'Без регистрации: доступ даёт личная ссылка на комнату. В редакторе нажмите «Пригласить» и выберите ссылку для просмотра или редактирования. Храните её приватно: восстановление через аккаунт не предусмотрено.' : 'No account needed: a private room link grants access. Use Invite in the editor for view or edit links. Keep the link private; there is no account-based access recovery.'}</p><label htmlFor="invite-link">{ru ? 'Ссылка на комнату' : 'Room link'}</label><input id="invite-link" type="url" required value={link} aria-invalid={error} onChange={event => { setLink(event.target.value); setError(false); }} placeholder="https://…"/><button className="button" type="submit">{ru ? 'Открыть комнату' : 'Open room'}</button>{error && <p role="alert">{ru ? 'Вставьте полную ссылку на комбинацию с этого сайта.' : 'Paste a complete play link from this site.'}</p>}
    </form></section>
    <footer className="home-footer">ReplayLab · {ru ? 'Одна площадка. Весь замысел.' : 'One court. The whole idea.'}</footer>
  </main>;
}
