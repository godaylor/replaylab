import { useState } from 'react';
import { useI18n } from './i18n';

const THEME_KEY = 'replaylab:theme';
export function applyInitialTheme() {
  let theme = 'dark';
  try { theme = localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'; } catch { /* Appearance never blocks local access. */ }
  document.documentElement.dataset.theme = theme;
}

export function Brand() {
  const { locale } = useI18n();
  return <a className="brand" href="/" aria-label={locale === 'ru' ? 'Пятый темп — главная' : 'Fifth Tempo home'}>
    <svg className="brand-mark" viewBox="0 0 40 40" aria-hidden="true"><path d="M7 8L18 31L31 8M12 8L20 24L28 8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round"/><circle cx="32" cy="29" r="4" fill="currentColor"/></svg>
    <span><strong>{locale === 'ru' ? 'Пятый темп' : 'Fifth Tempo'}</strong><small>{locale === 'ru' ? 'Баскетбол в движении' : 'Basketball in motion'}</small></span>
  </a>;
}

export function ThemeSwitch() {
  const { locale } = useI18n();
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? 'dark');
  const label = locale === 'ru' ? 'Светлая тема' : 'Light theme';
  return <button className="theme-switch" type="button" aria-label={label} aria-pressed={theme === 'light'} title={label} onClick={() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* Optional appearance preference. */ }
  }}><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="4"/><path d="M12 2V5M12 19V22M2 12H5M19 12H22M5 5L7 7M17 17L19 19M5 19L7 17M17 7L19 5"/></svg></button>;
}
