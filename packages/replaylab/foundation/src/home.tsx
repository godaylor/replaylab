import { useState } from 'react';
import { useI18n } from './i18n';
import { recentPlays } from './recent-plays';
import { useOfflineShellState } from './offline';
import { openPractice } from './practice-guide';
import { Brand, ThemeSwitch } from './brand';
import { PlayShowcase } from './play-showcase';

export function PlayHome() {
  const { locale, setLocale } = useI18n();
  const ru = locale === 'ru';
  const [plays] = useState(recentPlays);
  const [link, setLink] = useState('');
  const [error, setError] = useState(false);
  useOfflineShellState();
  return <main className="play-home">
    <header className="home-header"><Brand />
      <a className="home-library-link" href="#plays">{ru ? 'Мои комбинации' : 'My plays'} <span aria-hidden="true">↗</span></a>
      <div className="home-preferences"><ThemeSwitch /><div className="language-switcher" role="group" aria-label={ru ? 'Язык' : 'Language'}>{(['ru', 'en'] as const).map(value => <button key={value} aria-pressed={locale === value} onClick={() => setLocale(value)}>{value.toUpperCase()}</button>)}</div></div>
    </header>
    <section className="home-intro">
      <div className="home-story"><p className="eyebrow"><span className="live-dot" />{ru ? 'ДЛЯ ТЕХ, КТО ВИДИТ ИГРУ НА ШАГ ВПЕРЁД' : 'FOR THOSE WHO SEE THE NEXT MOVE'}</p>
        <h1>{ru ? <>Сначала<br /><em>замысел.</em><br />Потом — игра.</> : <>First,<br /><em>the idea.</em><br />Then, the game.</>}</h1>
        <p className="home-description">{ru ? 'Заслон. Свободный проход. Точная передача. Превратите тренерскую идею в движение, которое поймёт вся пятёрка.' : 'A screen. An open lane. The right pass. Turn your coaching idea into movement all five players can follow.'}</p>
        <button className="button button-accent home-primary" onClick={() => openPractice()}>{ru ? 'Разобрать пик-н-ролл' : 'Explore the pick & roll'} <span aria-hidden="true">↗</span></button>
        <button className="button" onClick={() => { location.assign(`/app/play/${crypto.randomUUID()}/edit?new=1`); }}>{ru ? 'Создать комбинацию' : 'Create a play'}</button>
        <button className="button" onClick={() => openPractice(true)}>{ru ? 'Как пользоваться' : 'How to use'}</button>
        <p className="home-device-note">{ru ? 'Без регистрации · Сохранение на устройстве · Работа без сети' : 'No sign-up · Saved on your device · Works offline'}</p>
      </div>
      <PlayShowcase />
    </section>
    <div className="home-manifesto"><span>01 / {ru ? 'Расставьте' : 'Position'}</span><span>02 / {ru ? 'Нарисуйте движение' : 'Draw movement'}</span><span>03 / {ru ? 'Покажите команде' : 'Show the team'}</span></div>
    <section className="home-work" id="plays"><div><h2>{ru ? 'Недавние комбинации' : 'Recent plays'}</h2><p className="home-hint">{ru ? 'На этом устройстве. На компьютере — редактор, на телефоне — просмотр. Для переноса скачайте файл восстановления.' : 'On this device. Create on desktop; review on your phone. Download a recovery file to move a play.'}</p>
      {plays.length ? <ul className="recent-plays">{plays.map(play => <li key={play.id}><a href={play.href}><span className="recent-court" aria-hidden="true">◒</span><span><strong>{play.title}</strong><small>{new Date(play.opened).toLocaleDateString(locale, { month: 'short', day: 'numeric' })}</small></span><span aria-hidden="true">↗</span></a></li>)}</ul> : <div className="home-empty">{ru ? 'Здесь появятся ваши комбинации. Создайте первую — начните с расстановки десяти игроков.' : 'Your plays will appear here. Create your first one and start with the ten-player lineup.'}</div>}
    </div><form className="home-join" noValidate onSubmit={event => { event.preventDefault(); try { const url = new URL(link); if (url.origin !== location.origin || !/^\/app\/play\/[^/]+\/edit\/?$/.test(url.pathname)) throw new Error(); location.assign(url.href); } catch { setError(true); } }}>
      <h2>{ru ? 'Работаете вместе?' : 'Working together?'}</h2><p>{ru ? 'Без регистрации: доступ даёт личная ссылка на комнату. В редакторе нажмите «Пригласить» и выберите ссылку для просмотра или редактирования. Храните её приватно: восстановление через аккаунт не предусмотрено.' : 'No account needed: a private room link grants access. Use Invite in the editor for view or edit links. Keep the link private; there is no account-based access recovery.'}</p><label htmlFor="invite-link">{ru ? 'Ссылка на комнату' : 'Room link'}</label><input id="invite-link" type="url" required value={link} aria-invalid={error} onChange={event => { setLink(event.target.value); setError(false); }} placeholder="https://…"/><button className="button" type="submit">{ru ? 'Открыть комнату' : 'Open room'}</button>{error && <p role="alert">{ru ? 'Вставьте полную ссылку на комбинацию с этого сайта.' : 'Paste a complete play link from this site.'}</p>}
    </form></section>
    <footer className="home-footer"><Brand /><span>{ru ? 'Пять игроков. Один замысел.' : 'Five players. One idea.'}</span></footer>
  </main>;
}
