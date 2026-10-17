import { useId } from 'react';
import type { ReplaySnapshot } from './domain';
import { ACTOR_IDS, deriveBallPose } from './domain';
import { PICK_ROLL_IDS, PICK_ROLL_POSES, PICK_ROLL_ACTIONS } from './pick-roll';

// A read-only projection, never a second store or a document mutation.
export function CourtMiniature({ phase, actors }: {
  phase?: ReplaySnapshot['phases'][number];
  actors?: ReplaySnapshot['actors'];
}) {
  const id = useId().replaceAll(':', '');
  const tokens = (actors ?? ACTOR_IDS.map((actorId, i) => ({ id: actorId, team: i < 5 ? 'offense' : 'defense', number: i % 5 + 1 })))
    .map(actor => ({ ...actor, ...(phase?.poses[actor.id] ?? PICK_ROLL_POSES[0]![actor.id]) }));
  const ball = phase?.ballPose ?? deriveBallPose(PICK_ROLL_POSES[0]!, 'offense-1', null);
  return <svg className="court-miniature" viewBox="0 0 840 460" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id={`${id}-off`} cx="32%" cy="20%" r="80%"><stop stopColor="#ffa45a"/><stop offset=".55" stopColor="#f26722"/><stop offset="1" stopColor="#ae3512"/></radialGradient>
      <radialGradient id={`${id}-def`} cx="30%" cy="20%" r="85%"><stop stopColor="#436a68"/><stop offset="1" stopColor="#0d2a2b"/></radialGradient>
      <filter id={`${id}-shadow`} x="-70%" y="-60%" width="240%" height="260%"><feDropShadow dx="0" dy="5" stdDeviation="4" floodOpacity=".45"/></filter>
      <marker id={`${id}-arrow`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#ffe3a7"/></marker>
    </defs>
    <rect width="840" height="460" rx="6" className="mini-floor"/>
    <g className="mini-planks" stroke="currentColor" strokeWidth="1">{Array.from({ length: 23 }, (_, i) => <path key={i} d={`M0 ${i * 20}H840 M${(i % 3) * 130 + 130} ${i * 20}v20 M${(i % 3) * 130 + 520} ${i * 20}v20`} />)}</g>
    <g fill="none" className="mini-lines" strokeWidth="2.5">
      <path d="M20 20H820V440H20Z M560 154H820V306H560 M20 172A58 58 0 0 1 20 288 M560 172A58 58 0 0 0 560 288 M788 205V255" />
      <path d="M820 44H774A370 186 0 0 0 774 416H820" />
      <circle cx="774" cy="230" r="10" />
    </g>
    {!phase && <g className="demo-paths" fill="none" stroke="#ffe3a7" strokeWidth="3" strokeLinecap="round">{PICK_ROLL_ACTIONS.map(action => {
      const points = action.path.points;
      const end = points.at(-1)!; const before = points.at(-2)!;
      const angle = Math.atan2(end.y - before.y, end.x - before.x) + Math.PI / 2;
      return <g key={action.id} data-transition={PICK_ROLL_IDS.indexOf(action.fromFrameId)}><path d={points.map((point, i) => `${i ? 'L' : 'M'}${point.x} ${point.y}`).join(' ')} strokeDasharray={action.type === 'pass' ? '8 6' : undefined} markerEnd={action.type === 'screen' ? undefined : `url(#${id}-arrow)`}/>{action.type === 'screen' && <path d={`M${end.x - 13 * Math.cos(angle)} ${end.y - 13 * Math.sin(angle)}L${end.x + 13 * Math.cos(angle)} ${end.y + 13 * Math.sin(angle)}`}/>}</g>;
    })}</g>}
    {tokens.map(token => <g key={token.id} data-piece={token.id} transform={`translate(${token.x} ${token.y})`} filter={`url(#${id}-shadow)`}>
      {token.team === 'offense' ? <circle r="20" fill={`url(#${id}-off)`} stroke="#ffcf93" strokeWidth="2"/> : <rect x="-18" y="-18" width="36" height="36" rx="10" fill={`url(#${id}-def)`} stroke="#a4d2c8" strokeWidth="2"/>}
      <text y="7" textAnchor="middle" fontSize="21" fontWeight="700" fill="#fff8e8" stroke="#16312c" strokeWidth="1.2" paintOrder="stroke">{token.number}</text>
    </g>)}
    <g data-piece="ball" transform={`translate(${ball.x} ${ball.y})`}><circle r="9" fill="#ffd16b" stroke="#733810" strokeWidth="2"/><path d="M-7 -3Q2 -4 6 5M-3 -7Q-4 2 5 6" fill="none" stroke="#733810"/></g>
  </svg>;
}

export function ToolGlyph({ type }: { type: 'select' | 'cut' | 'pass' | 'dribble' | 'screen' }) {
  return <svg className="tool-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {type === 'select' ? <path d="M5 3L19 13L12 14L9 21Z" /> : type === 'screen' ? <path d="M4 17H20M12 17V5M7 5H17" /> : <>
      <path d={type === 'dribble' ? 'M3 19Q3 10 7 13T12 10T17 7L21 3' : 'M3 20Q6 8 21 4'} strokeDasharray={type === 'pass' ? '3 4' : undefined} />
      <path d="M15 3L21 3L21 9" />
    </>}
  </svg>;
}
