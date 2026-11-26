// Password login with a signed, HttpOnly session cookie. Fails closed on Vercel if not configured.
const crypto = require('crypto');
const COOKIE = 'snyp_session';
const DAYS = 30;

function secret() {
  const s = process.env.SESSION_SECRET || (process.env.VERCEL ? '' : 'local-dev-secret');
  if (!s) { const e = new Error('SESSION_SECRET is not set in Vercel environment variables'); e.status = 500; throw e; }
  return s;
}
function password() {
  const p = process.env.APP_PASSWORD || (process.env.VERCEL ? '' : 'snyp-local');
  if (!p) { const e = new Error('APP_PASSWORD is not set in Vercel environment variables'); e.status = 500; throw e; }
  return p;
}
const sign = (body) => crypto.createHmac('sha256', secret()).update(body).digest('base64url');
function makeToken() { const body = Buffer.from(JSON.stringify({ exp: Date.now() + DAYS * 864e5 })).toString('base64url'); return body + '.' + sign(body); }
function checkToken(tok) {
  if (!tok || !tok.includes('.')) return false;
  const [body, mac] = tok.split('.');
  const good = sign(body);
  if (mac.length !== good.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(good))) return false;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString()).exp > Date.now(); } catch (e) { return false; }
}
function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) { const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
  return out;
}
function passwordMatches(given) {
  const a = crypto.createHash('sha256').update(String(given || '')).digest();
  const b = crypto.createHash('sha256').update(password()).digest();
  return crypto.timingSafeEqual(a, b);
}
function setSession(res) {
  const secure = process.env.VERCEL ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${makeToken()}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${DAYS * 86400}${secure}`);
}
function clearSession(res) { res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`); }
function isAuthed(req) { return checkToken(cookies(req)[COOKIE]); }
// Returns true if the request may continue; otherwise sends 401.
function requireAuth(req, res) {
  if (isAuthed(req)) return true;
  res.status(401).json({ error: 'Not logged in' });
  return false;
}
module.exports = { passwordMatches, setSession, clearSession, isAuthed, requireAuth };
