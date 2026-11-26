// Read-only access to the thesis document archive.
//  Production: a private GitHub repo (GITHUB_ARCHIVE_REPO = "owner/name", GITHUB_TOKEN = fine-grained, read-only Contents).
//  Otherwise:  a folder: SNYP_ARCHIVE_DIR, or thesis-archive/ in the repo (recommended, no token needed).
const fs = require('fs');
const path = require('path');

const REPO = process.env.GITHUB_ARCHIVE_REPO;
const TOKEN = process.env.GITHUB_TOKEN;
const BRANCH = process.env.GITHUB_ARCHIVE_BRANCH || 'main';
// Default: the thesis-archive/ folder inside this (private) repo, bundled into the functions by vercel.json.
// It sits outside public/, so it is never served directly, only through /api/docs after login.
const BUNDLED = path.join(__dirname, '..', 'thesis-archive');
const DIR = process.env.SNYP_ARCHIVE_DIR || (fs.existsSync(BUNDLED) ? BUNDLED : null);

function safe(p) {
  const s = String(p || '').replace(/\\/g, '/');
  if (!s || s.startsWith('/') || s.split('/').includes('..')) { const e = new Error('Invalid path'); e.status = 400; throw e; }
  return s;
}
async function gh(url) {
  const r = await fetch('https://api.github.com' + url, { headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'snyp-university' } });
  if (!r.ok) { const e = new Error(`GitHub archive error ${r.status}: check GITHUB_TOKEN and GITHUB_ARCHIVE_REPO`); e.status = r.status === 404 ? 404 : 502; throw e; }
  return r.json();
}

function mode() { return REPO && TOKEN ? 'github' : DIR ? 'local' : 'none'; }

async function list() {
  if (mode() === 'github') {
    const t = await gh(`/repos/${REPO}/git/trees/${encodeURIComponent(BRANCH)}?recursive=1`);
    return t.tree.filter((x) => x.type === 'blob').map((x) => ({ path: x.path, size: x.size }));
  }
  if (mode() === 'local') {
    const out = [];
    const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else out.push({ path: path.relative(DIR, p).replace(/\\/g, '/'), size: fs.statSync(p).size }); } };
    walk(DIR);
    return out.sort((a, b) => a.path.localeCompare(b.path));
  }
  const e = new Error('Document archive not found. Put the thesis folders in thesis-archive/ in the repo and redeploy.'); e.status = 503; throw e;
}

// Returns { redirect } for GitHub (short-lived signed link) or { file } for local.
async function locate(p) {
  p = safe(p);
  if (mode() === 'github') {
    const meta = await gh(`/repos/${REPO}/contents/${p.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(BRANCH)}`);
    if (!meta.download_url) { const e = new Error('Not a file'); e.status = 400; throw e; }
    return { redirect: meta.download_url, size: meta.size };
  }
  if (mode() === 'local') {
    const f = path.join(DIR, p);
    if (!f.startsWith(path.resolve(DIR)) || !fs.existsSync(f)) { const e = new Error('File not found'); e.status = 404; throw e; }
    return { file: f, size: fs.statSync(f).size };
  }
  return list();
}

async function readBytes(p) {
  const loc = await locate(p);
  if (loc.file) return fs.readFileSync(loc.file);
  const r = await fetch(loc.redirect);
  if (!r.ok) throw new Error('Could not download ' + p);
  return Buffer.from(await r.arrayBuffer());
}

module.exports = { mode, list, locate, readBytes };
