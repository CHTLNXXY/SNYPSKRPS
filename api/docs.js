// GET /api/docs             -> list the archive
// GET /api/docs?path=...    -> open/download one file (behind login)
const fs = require('fs');
const path = require('path');
const { requireAuth } = require('../lib/auth');
const archive = require('../lib/archive');
const { fail } = require('../lib/http');

const TYPES = { '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.json': 'application/json', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.zip': 'application/zip' };

module.exports = async (req, res) => {
  try {
    if (!requireAuth(req, res)) return;
    const q = req.query || {};
    if (!q.path) return res.status(200).json({ mode: archive.mode(), files: await archive.list() });
    const loc = await archive.locate(q.path);
    res.setHeader('Cache-Control', 'private, no-store');
    if (loc.redirect) { res.statusCode = 302; res.setHeader('Location', loc.redirect); return res.end(); }
    res.setHeader('Content-Type', TYPES[path.extname(loc.file).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(path.basename(loc.file))}`);
    res.statusCode = 200;
    fs.createReadStream(loc.file).pipe(res);
  } catch (e) { fail(res, e); }
};
