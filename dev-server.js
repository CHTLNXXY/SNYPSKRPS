// Local server that runs the same api/*.js functions the way Vercel does, plus the static files in public/.
// Usage: SNYP_ARCHIVE_DIR=/path/to/SNYP_Thesis node dev-server.js   (password: APP_PASSWORD or "snyp-local")
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = parseInt(process.env.PORT || '3000', 10);
const PUB = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

function wrap(res) {
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)); return res; };
  return res;
}

function createServer() {
  return http.createServer(async (req, res) => {
    wrap(res);
    const u = new URL(req.url, 'http://localhost');
    const m = u.pathname.match(/^\/api\/([a-z]+)$/);
    if (m) {
      const file = path.join(__dirname, 'api', m[1] + '.js');
      if (!fs.existsSync(file)) return res.status(404).json({ error: 'No such API' });
      req.query = Object.fromEntries(u.searchParams);
      let raw = '';
      for await (const c of req) { raw += c; if (raw.length > 4.5e6) return res.status(413).json({ error: 'Body too large (Vercel limit 4.5 MB)' }); }
      req.body = raw && /json/.test(req.headers['content-type'] || '') ? (() => { try { return JSON.parse(raw); } catch (e) { return raw; } })() : raw;
      try { return await require(file)(req, res); } catch (e) { console.error(e); return res.status(500).json({ error: String(e) }); }
    }
    let p = path.normalize(decodeURIComponent(u.pathname)).replace(/^([/\\])+/, '');
    if (!p) p = 'index.html';
    const f = path.join(PUB, p);
    if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end('Not found'); }
    res.setHeader('Content-Type', TYPES[path.extname(f)] || 'application/octet-stream');
    fs.createReadStream(f).pipe(res);
  });
}

if (require.main === module) {
  createServer().listen(PORT, () => console.log(`SNYP University dev server on http://localhost:${PORT} (local store, not shared)`));
}
module.exports = { createServer };
