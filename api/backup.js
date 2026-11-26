// GET  /api/backup                 -> download ABB.json (all app data)
// GET  /api/backup?list=1          -> list automatic snapshots
// GET  /api/backup?snapshot=NAME   -> download one snapshot
// POST /api/backup {data}          -> restore from an ABB.json (current data is snapshotted first)
// POST /api/backup {snapshot:NAME} -> restore a snapshot
const { getStore } = require('../lib/store');
const { requireAuth } = require('../lib/auth');
const { buildExport, importData, listSnapshots, getSnapshot, OpError } = require('../lib/ops');
const { body, fail } = require('../lib/http');

module.exports = async (req, res) => {
  try {
    if (!requireAuth(req, res)) return;
    const store = getStore();
    const q = req.query || {};
    if (req.method === 'GET') {
      if (q.list) return res.status(200).json({ snapshots: await listSnapshots(store) });
      const data = q.snapshot ? await getSnapshot(store, q.snapshot) : await buildExport(store);
      if (!data) throw new OpError('Snapshot not found', 404);
      res.setHeader('Content-Disposition', `attachment; filename="ABB${q.snapshot ? '-' + String(q.snapshot).replace(/[^\w-]/g, '') : ''}.json"`);
      return res.status(200).json(data);
    }
    if (req.method === 'POST') {
      const b = body(req);
      let data = b.data;
      if (b.snapshot) { data = await getSnapshot(store, b.snapshot); if (!data) throw new OpError('Snapshot not found', 404); }
      const out = await importData(store, data);
      return res.status(200).json({ ok: true, ...out });
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) { fail(res, e); }
};
