import { useCallback, useEffect, useState } from 'react';

import { translate, type Locale } from './i18n';

export type OfflineShellState =
  | 'checking'
  | 'ready'
  | 'update-ready'
  | 'unsupported'
  | 'error';

export type StorageRetentionState =
  | 'checking'
  | 'requesting'
  | 'persisted'
  | 'evictable'
  | 'denied'
  | 'unsupported'
  | 'error';

const SERVICE_WORKER_READY_TIMEOUT_MS = 20_000;

function serviceWorkerReadyTimeout() {
  return new Promise<never>((_, reject) => {
    window.setTimeout(
      () => reject(new Error('Service worker readiness timed out')),
      SERVICE_WORKER_READY_TIMEOUT_MS
    );
  });
}

export function offlineShellLabel(state: OfflineShellState, locale: Locale = 'en') {
  switch (state) {
    case 'ready':
      return translate(locale, 'offlineShellReady');
    case 'unsupported':
      return translate(locale, 'offlineShellUnsupported');
    case 'update-ready':
      return translate(locale, 'offlineShellUpdate');
    case 'error':
      return translate(locale, 'offlineShellError');
    default:
      return translate(locale, 'offlineShellPreparing');
  }
}

export function storageRetentionLabel(state: StorageRetentionState, locale: Locale = 'en') {
  switch (state) {
    case 'requesting':
      return translate(locale, 'storageRequesting');
    case 'persisted':
      return translate(locale, 'storagePersisted');
    case 'evictable':
      return translate(locale, 'storageEvictable');
    case 'denied':
      return translate(locale, 'storageDenied');
    case 'unsupported':
      return translate(locale, 'storageUnsupported');
    case 'error':
      return translate(locale, 'storageError');
    default:
      return translate(locale, 'storageChecking');
  }
}

export function useOfflineShellState() {
  const [state, setState] = useState<OfflineShellState>('checking');

  useEffect(() => {
    let active = true;
    if (!('serviceWorker' in navigator)) {
      setState('unsupported');
      return;
    }
    void navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then(async registration => {
        await Promise.race([navigator.serviceWorker.ready, serviceWorkerReadyTimeout()]);
        if (!active) return;
        const updateState = () => setState(registration.waiting ? 'update-ready' : 'ready');
        updateState();
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && active) updateState();
          });
        });
        navigator.serviceWorker.addEventListener('controllerchange', updateState);
      })
      .catch(() => {
        if (active) setState('error');
      });
    return () => {
      active = false;
    };
  }, []);

  return state;
}

export function useStorageRetention() {
  const [state, setState] = useState<StorageRetentionState>('checking');

  useEffect(() => {
    let active = true;
    if (!navigator.storage?.persisted || !navigator.storage?.persist) {
      setState('unsupported');
      return;
    }
    void navigator.storage
      .persisted()
      .then(persisted => {
        if (active) setState(persisted ? 'persisted' : 'evictable');
      })
      .catch(() => {
        if (active) setState('error');
      });
    return () => {
      active = false;
    };
  }, []);

  const requestPersistence = useCallback(async () => {
    if (!navigator.storage?.persist) {
      setState('unsupported');
      return false;
    }
    setState('requesting');
    try {
      const granted = await navigator.storage.persist();
      setState(granted ? 'persisted' : 'denied');
      return granted;
    } catch {
      setState('error');
      return false;
    }
  }, []);

  return { state, requestPersistence };
}
