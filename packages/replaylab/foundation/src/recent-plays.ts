// A disposable navigation index, never a second source of document truth.
export type RecentPlay = { id: string; title: string; href: string; opened: number };
const prefix = 'replaylab:recent:v1:';
export function recentPlays(): RecentPlay[] {
  const plays: RecentPlay[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(prefix)) continue;
      try {
        const value = JSON.parse(localStorage.getItem(key)!);
        if (typeof value.id === 'string' && typeof value.title === 'string' && typeof value.href === 'string' && value.href.startsWith(`/app/play/${encodeURIComponent(value.id)}/edit`) && Number.isFinite(value.opened)) plays.push(value);
      } catch { /* A damaged index never prevents opening the original document. */ }
    }
  } catch { /* Storage denied: authoring retains its existing recovery UI. */ }
  return plays.sort((a, b) => b.opened - a.opened).slice(0, 30);
}
export function rememberPlay(id: string, title: string) {
  // Capability secrets stay in the user's private link, never in the catalog.
  if (location.hash || new URLSearchParams(location.search).has('db')) return;
  try {
    const lesson = new URLSearchParams(location.search).get('lesson') === '1';
    localStorage.setItem(prefix + id, JSON.stringify({ id, title, href: `/app/play/${encodeURIComponent(id)}/edit${lesson ? '?lesson=1' : ''}`, opened: Date.now() }));
  } catch { /* The index is optional; the document's save status is independent. */ }
}
