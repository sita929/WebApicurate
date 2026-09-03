/* ============================================================
   Local dev server — static files plus the /api routes.

   Mirrors what Azure Static Web Apps does in production: it serves
   this folder and routes /api/* to the same handlers in api/. Run it
   with `node dev-server.js`; production uses the managed Functions.
   ============================================================ */

const http = require('http');
const fs = require('fs');
const path = require('path');
const verifyConnection = require('./api/verify-connection');
const connections = require('./api/connections');

const PORT = process.env.PORT || 8123;
const ROOT = __dirname;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8'
};

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload)
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 1e6) reject(new Error('Body too large'));
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

/* Route to the same Azure Function handlers the deployed site uses,
   with a minimal stand-in for the Functions `context` object. */
const ROUTES = {
  'verify-connection': verifyConnection,
  'connections': connections
};

async function handleApi(req, res, route) {
  const handler = ROUTES[route];
  if (!handler) return sendJson(res, 404, { ok: false, message: 'No such endpoint' });

  let body = {};
  if (req.method === 'POST' || req.method === 'DELETE') {
    try {
      body = await readBody(req);
    } catch (err) {
      return sendJson(res, 400, { ok: false, message: err.message });
    }
  }

  const query = Object.fromEntries(new URL(req.url, `http://${req.headers.host}`).searchParams);
  const log = (...a) => console.log('  ', ...a);
  log.error = (...a) => console.error('  ', ...a);

  const context = { log, res: null };
  await handler(context, { method: req.method, body, query, headers: req.headers });

  const out = context.res || { status: 500, body: { ok: false, message: 'No response' } };
  sendJson(res, out.status || 200, out.body);
}

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const file = path.resolve(ROOT, rel);

  // Never serve outside the project folder.
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
}

http.createServer((req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host}`);
  console.log(`${req.method} ${pathname}`);

  if (pathname.startsWith('/api/')) {
    handleApi(req, res, pathname.slice(5)).catch(err => {
      console.error('  api error:', err.message);
      sendJson(res, 500, { ok: false, message: 'Server error' });
    });
    return;
  }

  serveStatic(req, res, pathname);
}).listen(PORT, () => {
  console.log(`APIQurate dev server → http://localhost:${PORT}`);
});
