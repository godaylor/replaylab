import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRooms } from './room-storage';
import { ReplaySyncWebSocketServer } from './sync-server';

const port = Number(process.env.PORT ?? 32400);
if (!Number.isInteger(port) || port < 32400 || port > 32499) throw new Error('PORT must be 32400-32499');
const host = process.env.HOST ?? '127.0.0.1';
const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
if (!existsSync(resolve(dist, 'index.html'))) throw new Error('Build the ReplayLab client first');
const publicOrigin = process.env.REPLAYLAB_PUBLIC_ORIGIN || undefined;
if (publicOrigin && new URL(publicOrigin).protocol !== 'https:') throw new Error('Public origin must use HTTPS');
const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
const http = createServer((request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
  response.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'HEAD'].includes(request.method ?? '')) { response.writeHead(405); response.end(); return; }
  let pathname: string;
  try { pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://local').pathname); }
  catch { response.writeHead(400); response.end(); return; }
  if (pathname === '/healthz') { response.setHeader('Content-Type', types['.json']!); response.end(request.method === 'HEAD' ? undefined : '{"status":"ok","product":"ReplayLab"}'); return; }
  const appRoute = pathname === '/' || /^\/app\/play\/[^/]+\/edit\/?$/.test(pathname);
  const permitted = appRoute || pathname === '/index.html' || pathname === '/sw.js' || /^\/assets\/[a-zA-Z0-9_-]+\.(js|css)$/.test(pathname) || /^\/legal\/[a-zA-Z0-9_.-]+$/.test(pathname);
  const target = resolve(dist, appRoute ? 'index.html' : '.' + pathname);
  if (!permitted || !target.startsWith(dist + sep) || !existsSync(target) || !statSync(target).isFile()) { response.writeHead(404); response.end(); return; }
  if (pathname.startsWith('/assets/')) response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  response.setHeader('Content-Type', types[extname(target)] ?? 'application/octet-stream');
  response.setHeader('Content-Length', statSync(target).size);
  if (request.method === 'HEAD') { response.end(); return; }
  createReadStream(target).on('error', () => response.destroy()).pipe(response);
});
const sync = new ReplaySyncWebSocketServer({ server: http, publicOrigin });
try { loadRooms(sync, resolve(process.env.REPLAYLAB_DATA_DIR ?? '.replaylab-data')); }
catch (error) { await sync.close(); throw error; }
http.requestTimeout = 15_000;
http.headersTimeout = 10_000;
http.on('error', error => { console.error(error.message); process.exit(1); });
http.listen(port, host, () => console.log(`ReplayLab listening on ${host}:${port}; ${sync.rooms.size} configured rooms`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => {
  const deadline = setTimeout(() => process.exit(1), 5000);
  deadline.unref();
  void sync.close().finally(() => http.close(() => process.exit(0)));
});
