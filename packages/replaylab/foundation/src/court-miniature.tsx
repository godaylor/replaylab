import type { ReplaySnapshot } from './domain';

// A read-only projection, never a second store or a document mutation.
export function CourtMiniature({ phase, actors }: {
  phase?: ReplaySnapshot['phases'][number];
  actors?: ReplaySnapshot['actors'];
}) {
  const tokens = actors?.map(actor => ({ ...phase!.poses[actor.id], team: actor.team, number: actor.number })) ??
    Array.from({ length: 10 }, (_, index) => ({
      x: 150 + (index % 5) * 125, y: index < 5 ? 145 : 305,
      team: index < 5 ? 'offense' : 'defense', number: index % 5 + 1,
    }));
  return <svg className="court-miniature" viewBox="0 0 840 460" aria-hidden="true" focusable="false">
    <rect width="840" height="460" rx="12" fill="#e1ecf2" />
    <g fill="none" stroke="#7893a5" strokeWidth="4">
      <path d="M20 20H820V440H20Z M540 154H820V306H540 M20 172A58 58 0 0 1 20 288 M540 172A58 58 0 0 0 540 288 M788 205V255" />
      <path d="M720 20V44A260 260 0 0 0 720 416V440" />
      <circle cx="774" cy="230" r="10" />
    </g>
    {tokens.map((token, index) => <g key={index}>
      <circle cx={token.x} cy={token.y} r="20" fill={token.team === 'offense' ? '#c84d16' : '#ffffff'} stroke={token.team === 'offense' ? '#ffffff' : '#18364a'} strokeWidth="3" />
      <text x={token.x} y={token.y + 7} textAnchor="middle" fontSize="20" fontWeight="700" fill={token.team === 'offense' ? '#ffffff' : '#18364a'}>{token.number}</text>
    </g>)}
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
