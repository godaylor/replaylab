import { useSyncExternalStore } from 'react';

import type { ReplayNetworkDocSource } from './network-source';
import { useI18n } from './i18n';

function label(source: ReplayNetworkDocSource, t: ReturnType<typeof useI18n>['t']) {
  const state = source.state;
  switch (state.status) {
    case 'connecting': return t('networkConnecting');
    case 'syncing': return t('networkSyncing');
    case 'synced': return t(state.role === 'read' ? 'networkSyncedRead' : 'networkSyncedWrite');
    case 'rate-limited': return t('networkRateLimited', { milliseconds: state.retryAfterMs ?? 0 });
    case 'blocked': return t('networkBlocked', { reason: state.errorCode ?? t('terminalError') });
    default: return t('networkOffline');
  }
}

export function NetworkStatus(props: { source?: ReplayNetworkDocSource; online: boolean }) {
  const { t } = useI18n();
  useSyncExternalStore(
    listener => props.source?.onStateChange(listener) ?? (() => {}),
    () => props.source?.state.status ?? 'local-only',
    () => 'local-only'
  );
  if (!props.source) {
    return (
      <span
        id="network-status"
        className={props.online ? 'status-pill' : 'status-pill status-offline'}
        role="status"
        data-network-state={props.online ? 'online' : 'offline'}
      >
        <i aria-hidden="true" /> {props.online ? t('localOnly') : t('offlineContinues')}
      </span>
    );
  }
  const state = props.source.state;
  const warning = state.status === 'blocked' || state.status === 'offline';
  return (
    <span
      id="network-status"
      className={`status-pill${warning ? ' status-offline' : state.status === 'rate-limited' ? ' status-review' : ''}`}
      role="status"
      data-network-state={state.status}
      data-capability-role={state.role}
    >
      <i aria-hidden="true" /> {label(props.source, t)}
    </span>
  );
}
