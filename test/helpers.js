// Starts the dev server (same API code as Vercel) and gives a tiny cookie-keeping client.
const { createServer } = require('../dev-server');
async function boot() {
  const srv = createServer();
  await new Promise((ok) => srv.listen(0, ok));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const client = () => {
    let cookie = '';
    const call = async (method, url, body, raw) => {
      const r = await fetch(base + url, { method, redirect: 'manual', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
      const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
      if (raw) return r;
      const t = await r.text(); let j; try { j = JSON.parse(t); } catch (e) { j = t; }
      return { status: r.status, body: j };
    };
    return { call, login: (pw = 'snyp-local') => call('POST', '/api/login', { password: pw }), op: (op, actor, payload) => call('POST', '/api/state', { op, actor, payload }) };
  };
  return { base, client, close: () => srv.close() };
}
module.exports = { boot };
