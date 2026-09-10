import { createRoot } from 'react-dom/client';

import { EmptyRoute, ReplayLabApp, type AppStorageMode } from './app';
import { ReplayAwarenessSource } from './awareness';
import { DEFAULT_DB_NAME, ReplayLabEditorFacade } from './facade';
import { EmergencyJournal } from './emergency-journal';
import { ReplayNetworkDocSource } from './network-source';
import { parseCapabilityFragment } from './sync-protocol';
import { ReplayOpenError } from './recovery';
import {
  LocaleProvider,
  applyDocumentLocale,
  readInitialLocale,
  translate,
} from './i18n';
import './styles.css';
import './playback.css';
import './conflicts.css';
import './presence.css';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('Missing app root');
const initialLocale = readInitialLocale();
applyDocumentLocale(initialLocale);

const routeMatch = location.pathname.match(/^\/app\/play\/([^/]+)\/edit\/?$/);
const root = createRoot(app);

if (!routeMatch) {
  app.setAttribute('aria-busy', 'false');
  root.render(<LocaleProvider initialLocale={initialLocale}><EmptyRoute /></LocaleProvider>);
} else {
  const playId = decodeURIComponent(routeMatch[1]!);
  const query = new URLSearchParams(location.search);
  const dbName = query.get('db') ?? undefined;
  const networkConfig = parseCapabilityFragment(location.hash);
  const networkSource = networkConfig ? new ReplayNetworkDocSource(networkConfig) : undefined;
  const awarenessSource = networkConfig ? new ReplayAwarenessSource(networkConfig, {
    participantName: query.get('name') ?? undefined,
    color: query.get('color') ?? undefined,
  }) : undefined;
  let facade: ReplayLabEditorFacade;
  let storageMode: AppStorageMode;

  performance.mark('replaylab-open-start');
  try {
    if (query.get('storage') === 'unavailable') {
      throw new Error(translate(initialLocale, 'indexedDbDenied'));
    }
    facade = await ReplayLabEditorFacade.open({
      dbName,
      playId,
      networkSource,
      readOnly: networkConfig?.access === 'read',
      seedContent: {
        title: translate(initialLocale, 'seededTitle'),
        cueOne: translate(initialLocale, 'seededCueOne'),
        cueTwo: translate(initialLocale, 'seededCueTwo'),
      },
    });
    storageMode = {
      kind: 'indexeddb',
      loadedFromIndexedDB: facade.loadedFromIndexedDB,
    };
  } catch (error) {
    if (error instanceof ReplayOpenError && error.recoveryJson) {
      let previewAvailable = false;
      try {
        if (error.issue === 'future-schema') throw error;
        facade = await ReplayLabEditorFacade.previewRecovery(error.recoveryJson);
        previewAvailable = true;
      } catch {
        facade = ReplayLabEditorFacade.createMemory(`${playId}:recovery`, {
          title: translate(initialLocale, 'seededTitle'),
          cueOne: translate(initialLocale, 'seededCueOne'),
          cueTwo: translate(initialLocale, 'seededCueTwo'),
        });
        facade.setReadOnly(true);
      }
      storageMode = {
        kind: 'recovery',
        issue: error.issue,
        message: error.message,
        recoveryJson: error.recoveryJson,
        previewAvailable,
      };
    } else {
      facade = ReplayLabEditorFacade.createMemory(`${playId}:recovery`, {
        title: translate(initialLocale, 'seededTitle'),
        cueOne: translate(initialLocale, 'seededCueOne'),
        cueTwo: translate(initialLocale, 'seededCueTwo'),
      });
      facade.setReadOnly(true);
      storageMode = { kind: 'memory-error', message: (error as Error).message };
    }
  }
  performance.mark('replaylab-open-ready');
  // Even read-only recovery can export original damaged journal bytes.
  facade.emergencyJournal ??= new EmergencyJournal(dbName ?? DEFAULT_DB_NAME, playId);
  performance.measure(
    'replaylab-local-open',
    'replaylab-open-start',
    'replaylab-open-ready'
  );

  app.setAttribute('aria-busy', 'false');
  root.render(
    <LocaleProvider initialLocale={initialLocale}>
      <ReplayLabApp facade={facade} storageMode={storageMode} networkSource={networkSource} awarenessSource={awarenessSource} />
    </LocaleProvider>
  );

  window.addEventListener(
    'pagehide',
    () => {
      void facade.flushForPageLifecycle(450).catch(() => undefined).finally(() => {
        networkSource?.close();
        awarenessSource?.close();
        facade.close();
      });
    },
    { once: true }
  );

  Object.assign(window, {
    replayLabApp: {
      facade,
      ReplayLabEditorFacade,
      ReplayNetworkDocSource,
      storageMode,
      localOpenDurationMs: facade.localOpenDurationMs,
      recoveryDiagnostics: facade.recoveryDiagnostics,
      networkSource,
      awarenessSource,
      ReplayAwarenessSource,
    },
  });
}
