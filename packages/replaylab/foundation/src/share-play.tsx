import { useEffect, useRef, useState } from 'react';
import type { ReplayLabEditorFacade } from './facade';
import { useI18n } from './i18n';
import { bytesToBase64, capabilityFragment, parseCapabilityFragment } from './sync-protocol';

export function SharePlay({ facade }: { facade: ReplayLabEditorFacade }) {
  const { locale } = useI18n();
  const ru = locale === 'ru';
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [links, setLinks] = useState<{ read?: string; write?: string } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const connection = parseCapabilityFragment(location.hash);
  useEffect(() => { if (open) dialog.current?.showModal(); }, [open]);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  const create = async () => {
    setPending(true); setMessage('');
    try {
      const response = await fetch('/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ update: bytesToBase64(facade.encode()) }), signal: AbortSignal.timeout(60_000) });
      if (!response.ok) {
        if (response.status === 429) throw new Error(ru ? 'Слишком много запросов. Повторите через минуту.' : 'Too many requests. Try again in one minute.');
        if (response.status === 413) throw new Error(ru ? 'Комбинация слишком большая для комнаты. Сохраните экспорт.' : 'This play is too large for a room. Keep an export copy.');
        throw new Error(ru ? 'Комната пока недоступна. Ваша локальная комбинация сохранена; попробуйте позже.' : 'Rooms are unavailable right now. Your local play is safe; try again later.');
      }
      const result = await response.json();
      const href = (access: 'read' | 'write') => `${location.origin}/app/play/${encodeURIComponent(result.id)}/edit${capabilityFragment({ roomId: result.id, endpoint: location.origin.replace(/^http/, 'ws') + '/sync', access, capability: result[`${access}Token`] })}`;
      setLinks({ read: href('read'), write: href('write') });
    } catch (error) { setMessage(error instanceof Error ? error.message : (ru ? 'Не удалось создать комнату.' : 'Could not create the room.')); }
    finally { setPending(false); }
  };
  const shown = links ?? (connection ? { [connection.access]: location.href } : null);
  return <>
    <button ref={trigger} className="button" onClick={() => setOpen(true)}>{ru ? 'Пригласить' : 'Invite'}</button>
    {open && <dialog ref={dialog} className="share-dialog" aria-labelledby="share-title" onCancel={event => { event.preventDefault(); close(); }} onClose={close}>
      <div className="share-heading"><h2 id="share-title">{ru ? 'Работа над комбинацией вместе' : 'Work on this play together'}</h2><button className="icon-button" aria-label={ru ? 'Закрыть' : 'Close'} onClick={close}>×</button></div>
      {shown ? <><p>{ru ? 'Ссылка даёт доступ каждому, у кого она есть. Отправляйте её только участникам. Сохраните ссылки перед закрытием окна.' : 'Anyone with a link can use its access. Share only with your collaborators. Keep the links before closing this window.'}</p>
        {(['write', 'read'] as const).map(access => shown[access] ? <div className="share-link" key={access}><label htmlFor={`share-${access}`}>{access === 'write' ? (ru ? 'Редактирование' : 'Can edit') : (ru ? 'Только просмотр' : 'Can view')}</label><input id={`share-${access}`} readOnly value={shown[access]} onFocus={event => event.target.select()} /><button className="button" onClick={() => { void navigator.clipboard.writeText(shown[access]!).then(() => setMessage(ru ? 'Ссылка скопирована.' : 'Link copied.')).catch(() => setMessage(ru ? 'Выделите ссылку и скопируйте вручную.' : 'Select the link and copy it manually.')); }}>{ru ? 'Копировать' : 'Copy'}</button></div> : null)}
        {links?.write && <a className="button button-accent" href={links.write}>{ru ? 'Перейти в совместную комнату' : 'Open collaborative room'}</a>}
      </> : <><p>{ru ? 'Создайте приватную комнату с копией текущей комбинации. Локальный оригинал останется на этом устройстве. Примените изменения заметки перед созданием комнаты.' : 'Create a private room with a copy of this play. Your local original stays on this device. Apply any cue draft before creating the room.'}</p><button className="button button-accent" disabled={pending} onClick={() => void create()}>{pending ? (ru ? 'Создаём комнату…' : 'Creating room…') : (ru ? 'Создать совместную комнату' : 'Create collaborative room')}</button></>}
      <p role="status" aria-live="polite">{message}</p>
    </dialog>}
  </>;
}
