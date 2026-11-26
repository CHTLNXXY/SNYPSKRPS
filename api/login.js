const { passwordMatches, setSession, clearSession, isAuthed } = require('../lib/auth');
const { getStore } = require('../lib/store');
const { body, fail } = require('../lib/http');

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') return res.status(200).json({ loggedIn: isAuthed(req) });
    if (req.method === 'DELETE') { clearSession(res); return res.status(200).json({ ok: true }); }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    // Brute-force guard: at most 8 wrong attempts per 10 minutes per IP.
    const store = getStore();
    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'x').split(',')[0].trim();
    const key = 'snyp:login-fail:' + ip;
    const fails = parseInt((await store.get(key)) || '0', 10);
    if (fails >= 8) return res.status(429).json({ error: 'Too many wrong passwords. Wait 10 minutes.' });
    if (!passwordMatches(body(req).password)) {
      await store.incr(key); await store.expire(key, 600);
      return res.status(401).json({ error: 'Wrong password' });
    }
    await store.del(key);
    setSession(res);
    res.status(200).json({ ok: true });
  } catch (e) { fail(res, e); }
};
