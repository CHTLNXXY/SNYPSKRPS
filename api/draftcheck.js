// POST /api/draftcheck {path?} -> runs the automatic draft check on the thesis draft in the archive
// and records the findings (new findings become tickets at reception; known ones are skipped).
const { requireAuth } = require('../lib/auth');
const { getStore } = require('../lib/store');
const archive = require('../lib/archive');
const { check } = require('../lib/draftcheck');
const { applyOp, readAll } = require('../lib/ops');
const { body, fail } = require('../lib/http');

module.exports = async (req, res) => {
  try {
    if (!requireAuth(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    let p = body(req).path;
    if (!p) {
      const files = await archive.list();
      p = archive.currentThesis(files);
      if (!p) return res.status(404).json({ error: 'No .docx found in 01_Thesis_Draft' });
    }
    const buf = await archive.readBytes(p);
    const result = check(buf, p.split('/').pop());
    const store = getStore();
    const { state } = await readAll(store);
    const unchanged = state.lastCheckedRevision === result.revision;
    const out = await applyOp(store, 'draftcheck.record', 'system', { file: result.file, revision: result.revision, findings: result.findings });
    res.status(200).json({ ok: true, unchanged, revision: result.revision, findings: result.findings, created: out.created, version: out.version });
  } catch (e) { fail(res, e); }
};
