// GET /api/export?kind=report|ticket|meeting&id=...&format=docx|xlsx|pdf
// GET /api/export?kind=aipack  -> Markdown package (instructions + office status + full thesis text) for another AI chat
// The Floor 2 photocopier. "pdf" returns a print-ready page; the browser saves it as PDF.
const { requireAuth } = require('../lib/auth');
const { getStore } = require('../lib/store');
const { readAll } = require('../lib/ops');
const { fail } = require('../lib/http');
const X = require('../lib/export');
const archive = require('../lib/archive');
const AI = require('../lib/aipack');

const TYPES = { docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };

module.exports = async (req, res) => {
  try {
    if (!requireAuth(req, res)) return;
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const q = req.query || {};
    if (q.kind === 'aipack') {
      let thesis = null;
      try { const p = archive.currentThesis(await archive.list()); if (p) thesis = { file: p.split('/').pop(), markdown: AI.docxToMarkdown(await archive.readBytes(p)) }; } catch (e) { thesis = null; }
      const md = AI.build(await readAll(getStore()), thesis);
      const fname = 'Paket_AI_Skripsi_' + new Date().toISOString().slice(0, 10) + '.md';
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
      return res.status(200).end(md);
    }
    const kind = ['report', 'ticket', 'meeting'].includes(q.kind) ? q.kind : 'report';
    const format = ['docx', 'xlsx', 'pdf', 'html'].includes(q.format) ? q.format : 'pdf';
    const model = X.buildModel(await readAll(getStore()), kind, q.id);
    res.setHeader('Cache-Control', 'private, no-store');
    if (format === 'pdf' || format === 'html') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).end(X.html(model, format === 'pdf'));
    }
    const buf = Buffer.from(format === 'docx' ? X.docx(model) : X.xlsx(model));
    res.setHeader('Content-Type', TYPES[format]);
    res.setHeader('Content-Disposition', `attachment; filename="${model.file}.${format}"; filename*=UTF-8''${encodeURIComponent(model.file + '.' + format)}`);
    return res.status(200).end(buf);
  } catch (e) { fail(res, e); }
};
