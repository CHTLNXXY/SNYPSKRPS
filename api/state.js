// GET  /api/state?v=N  -> {unchanged:true} if nothing changed since version N, else the full app data.
// POST /api/state {op, actor, payload} -> applies one operation.
const { getStore } = require('../lib/store');
const { requireAuth } = require('../lib/auth');
const { applyOp, readAll, getVersion } = require('../lib/ops');
const { body, fail } = require('../lib/http');

module.exports = async (req, res) => {
  try {
    if (!requireAuth(req, res)) return;
    const store = getStore();
    if (req.method === 'GET') {
      const since = parseInt((req.query && req.query.v) || '-1', 10);
      const v = await getVersion(store);
      if (since === v) return res.status(200).json({ unchanged: true, version: v, mode: store.mode });
      const data = await readAll(store);
      return res.status(200).json({ ...data, mode: store.mode, ai: !!process.env.ANTHROPIC_API_KEY });
    }
    if (req.method === 'POST') {
      const b = body(req);
      // Only one open device (the "leader") drives the characters' automatic steps, so two
      // devices never deliver the same ticket twice. Leadership expires 25 s after the last claim.
      if (b.lease) {
        const id = String(b.lease).slice(0, 64);
        const cur = await store.get('snyp:lease');
        const leader = !cur || cur === id;
        if (leader) { await store.set('snyp:lease', id); await store.expire('snyp:lease', 25); }
        return res.status(200).json({ leader });
      }
      const out = await applyOp(store, String(b.op || ''), String(b.actor || 'owner'), b.payload);
      return res.status(200).json({ ok: true, ...out });
    }
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) { fail(res, e); }
};
