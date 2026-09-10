declare module 'ws' {
  import type { EventEmitter } from 'node:events';

  export class WebSocket extends EventEmitter {
    static readonly OPEN: number;
    readonly readyState: number;
    send(data: string): void;
    close(code?: number, reason?: string): void;
  }

  export class WebSocketServer extends EventEmitter {
    constructor(options: { port?: number; host?: string; server?: import('node:http').Server; path?: string; maxPayload?: number; perMessageDeflate?: boolean; verifyClient?: (info: { origin: string; req: import('node:http').IncomingMessage }) => boolean });
    readonly clients: Set<WebSocket>;
    address(): { port: number; address: string; family: string } | string | null;
    close(callback?: (error?: Error) => void): void;
  }
}
