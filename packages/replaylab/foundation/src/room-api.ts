import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ReplaySyncRoom, type ReplaySyncWebSocketServer } from './sync-server';
import { DEFAULT_UPDATE_LIMIT_BYTES } from './sync-protocol';

export function roomApi(input: {
  server: ReplaySyncWebSocketServer;
  publicOrigin?: string;
  provision(id: string, snapshot: Uint8Array): Promise<{ readToken: string; writeToken: string }>;
}) {
  let pending = 0;
  const attempts: number[] = [];
  return async (request: IncomingMessage, response: ServerResponse) => {
    const reply = (status: number, body: unknown) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(body)); };
    if (request.method !== 'POST') { reply(405, { error: 'method' }); return; }
    const localOrigin = `http://${request.headers.host}`;
    const origin = input.publicOrigin ?? localOrigin;
    if ((!input.publicOrigin && !/^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):324\d\d$/.test(origin)) || request.headers.origin !== origin || request.headers['content-type'] !== 'application/json') { reply(403, { error: 'origin' }); return; }
    const now = Date.now();
    while (attempts.length && attempts[0]! < now - 60_000) attempts.shift();
    if (attempts.length >= 6 || pending >= 2) { response.setHeader('Retry-After', '60'); reply(429, { error: 'rate_limit' }); return; }
    if (input.server.rooms.size + pending >= 32) { reply(503, { error: 'capacity' }); return; }
    attempts.push(now);
    pending++;
    try {
      let body = '';
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 360_000) { reply(413, { error: 'size' }); return; }
        body += chunk.toString('utf8');
      }
      let bytes: Uint8Array;
      try {
        const parsed = JSON.parse(body);
        if (typeof parsed.update !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(parsed.update)) throw new Error();
        bytes = Buffer.from(parsed.update, 'base64');
        if (bytes.byteLength > DEFAULT_UPDATE_LIMIT_BYTES) { reply(413, { error: 'size' }); return; }
        const candidate = new ReplaySyncRoom('validation');
        try { await candidate.accept({ sessionId: 'create', role: 'write', commitId: 'initial', update: bytes }); }
        finally { candidate.doc.destroy(); }
      } catch { reply(400, { error: 'invalid_play' }); return; }
      const id = randomUUID();
      const tokens = await input.provision(id, bytes);
      reply(201, { id, ...tokens });
    } catch { reply(503, { error: 'storage_unavailable' }); }
    finally { pending--; }
  };
}
