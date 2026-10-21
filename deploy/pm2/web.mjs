// The web front door for a pm2 install (see runonce.sh): serves the built app from app/dist
// and passes /api (including the live-game WebSocket) to the API server on this machine, so
// the app and the API share one origin, as they do behind Caddy in production.
// No dependencies: Node's own http, net, fs and path.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../../app/dist', import.meta.url)));
const WEB_PORT = Number(process.env.WEB_PORT ?? 7070);
const API_PORT = Number(process.env.API_PORT ?? 7071);
const API_HOST = '127.0.0.1';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
};

// Android checks /.well-known/assetlinks.json (the API's) before opening this site's links in
// the app.
const isApi = (url) =>
  url === '/api' || url.startsWith('/api/') || url === '/.well-known/assetlinks.json';

/** Headers for the API: the client's address goes in X-Forwarded-For, for rate limits. */
function forwarded(req) {
  const headers = { ...req.headers };
  const client = req.socket.remoteAddress ?? '';
  headers['x-forwarded-for'] = headers['x-forwarded-for']
    ? `${headers['x-forwarded-for']}, ${client}`
    : client;
  headers['x-forwarded-proto'] = 'http';
  return headers;
}

function proxy(req, res) {
  const upstream = http.request(
    { host: API_HOST, port: API_PORT, method: req.method, path: req.url, headers: forwarded(req) },
    (answer) => {
      res.writeHead(answer.statusCode ?? 502, answer.headers);
      answer.pipe(res);
    },
  );
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end('{"error":{"code":"unavailable","message":"The server is not reachable."}}');
  });
  req.pipe(upstream);
}

async function serveFile(req, res) {
  let file;
  try {
    const wanted = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    file = path.resolve(ROOT, `.${wanted}`);
  } catch {
    res.writeHead(400).end();
    return;
  }
  // Unknown paths (and anything outside the build) load index.html; the app's router takes over.
  let info = file.startsWith(ROOT + path.sep) ? await stat(file).catch(() => null) : null;
  if (info === null || !info.isFile()) {
    file = path.join(ROOT, 'index.html');
    info = await stat(file).catch(() => null);
  }
  if (info === null) {
    res.writeHead(503, { 'Content-Type': 'text/plain' }).end('The app is not built: run runonce.sh');
    return;
  }
  const hashed = file.startsWith(path.join(ROOT, '_expo', 'static') + path.sep);
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  if (req.method === 'HEAD') res.end();
  else createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  if (isApi(req.url ?? '')) proxy(req, res);
  else if (req.method === 'GET' || req.method === 'HEAD') void serveFile(req, res);
  else res.writeHead(405).end();
});

// WebSocket upgrades: replay the request to the API and join the two connections.
server.on('upgrade', (req, socket, head) => {
  if (!isApi(req.url ?? '')) {
    socket.destroy();
    return;
  }
  const upstream = net.connect(API_PORT, API_HOST, () => {
    const lines = [`${req.method} ${req.url} HTTP/1.1`];
    for (const [name, value] of Object.entries(forwarded(req))) {
      for (const v of Array.isArray(value) ? value : [value]) lines.push(`${name}: ${v}`);
    }
    upstream.write(`${lines.join('\r\n')}\r\n\r\n`);
    if (head.length > 0) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
});

server.listen(WEB_PORT, () => console.log(`web: serving ${ROOT} on port ${WEB_PORT}`));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close();
    server.closeAllConnections();
    process.exit(0);
  });
}
