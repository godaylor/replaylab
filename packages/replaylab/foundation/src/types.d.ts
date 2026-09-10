import '@blocksuite/global/types';

declare module '*.css';

declare global {
  interface Window {
    replayLabApp?: {
      facade: import('./facade').ReplayLabEditorFacade;
      ReplayLabEditorFacade: typeof import('./facade').ReplayLabEditorFacade;
      ReplayNetworkDocSource: typeof import('./network-source').ReplayNetworkDocSource;
      ReplayAwarenessSource: typeof import('./awareness').ReplayAwarenessSource;
      storageMode: import('./app').AppStorageMode;
      localOpenDurationMs: number;
      playbackController?: import('./playback').ReplayPlaybackController;
      networkSource?: import('./network-source').ReplayNetworkDocSource;
      awarenessSource?: import('./awareness').ReplayAwarenessSource;
    };
  }
}

export {};
