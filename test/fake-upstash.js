// Minimal in-memory server speaking the Upstash Redis REST protocol, so tests exercise the real @upstash/redis client.
const http = require('http');
function start() {
  const db = new Map(); const calls = [];
  const enc = (v, b64) => v == null ? null : Array.isArray(v) ? v.map((x) => enc(x, b64)) : typeof v === 'number' ? v : b64 ? Buffer.from(String(v)).toString('base64') : String(v);
  function run([cmd, ...a]) {
    cmd = String(cmd).toLowerCase(); calls.push(cmd);
    const H = (k) => { if (!db.has(k)) db.set(k, new Map()); return db.get(k); };
    const L = (k) => { if (!db.has(k)) db.set(k, []); return db.get(k); };
    const sl = (x, s, e) => x.slice(+s, +e < 0 ? x.length + +e + 1 : +e + 1);
    switch (cmd) {
      case 'get': return typeof db.get(a[0]) === 'string' ? db.get(a[0]) : null;
      case 'set': db.set(a[0], String(a[1])); return 'OK';
      case 'del': return a.reduce((n, k) => n + (db.delete(k) ? 1 : 0), 0);
      case 'incr': { const v = parseInt(db.get(a[0]) || '0', 10) + 1; db.set(a[0], String(v)); return v; }
      case 'expire': return 1;
      case 'hget': return db.get(a[0]) instanceof Map ? (db.get(a[0]).get(a[1]) ?? null) : null;
      case 'hset': { const h = H(a[0]); for (let i = 1; i < a.length; i += 2) h.set(a[i], String(a[i + 1])); return 1; }
      case 'hdel': return H(a[0]).delete(a[1]) ? 1 : 0;
      case 'hgetall': { const h = db.get(a[0]); return h instanceof Map ? [...h].flat() : []; }
      case 'lpush': { const l = L(a[0]); for (const v of a.slice(1)) l.unshift(String(v)); return l.length; }
      case 'lrange': return sl(L(a[0]), a[1], a[2]);
      case 'ltrim': db.set(a[0], sl(L(a[0]), a[1], a[2])); return 'OK';
      case 'keys': { const re = new RegExp('^' + a[0].split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$'); return [...db.keys()].filter((k) => re.test(k)); }
      default: throw new Error('unsupported ' + cmd);
    }
  }
  const srv = http.createServer(async (req, res) => {
    let raw = ''; for await (const c of req) raw += c;
    const b64 = String(req.headers['upstash-encoding'] || '').toLowerCase() === 'base64';
    if (req.headers.authorization !== 'Bearer test-token') { res.statusCode = 401; return res.end(JSON.stringify({ error: 'unauthorized' })); }
    const body = JSON.parse(raw);
    const one = (c) => { try { return { result: enc(run(c), b64) }; } catch (e) { return { error: e.message }; } };
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(req.url.startsWith('/pipeline') || req.url.startsWith('/multi-exec') ? body.map(one) : one(body)));
  });
  return new Promise((ok) => srv.listen(0, () => ok({ url: `http://127.0.0.1:${srv.address().port}`, db, calls, close: () => srv.close() })));
}
module.exports = { start };
