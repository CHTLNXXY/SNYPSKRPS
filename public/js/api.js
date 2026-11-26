// Talks to the server: login, polling for changes, sending operations, leader lease.
(function () {
  const DEVICE = (() => { try { let d = localStorage.getItem('snyp-device'); if (!d) { d = 'd' + Math.random().toString(36).slice(2, 10); localStorage.setItem('snyp-device', d); } return d; } catch (e) { return 'd' + Math.random().toString(36).slice(2, 10); } })();
  const listeners = [];
  const S = { data: null, version: -1, mode: '?', ai: false, leader: false, online: true, error: '' };

  async function req(method, url, body) {
    const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
    let j = null; try { j = await r.json(); } catch (e) { /* non-JSON */ }
    if (r.status === 401 && url !== '/api/login') { S.loggedOut = true; emit(); }
    if (!r.ok) { const e = new Error((j && j.error) || ('HTTP ' + r.status)); e.status = r.status; e.code = j && j.code; throw e; }
    return j;
  }
  function emit() { for (const f of listeners) try { f(S); } catch (e) { console.error(e); } }

  async function refresh(force) {
    try {
      const j = await req('GET', '/api/state?v=' + (force ? -1 : S.version));
      S.online = true; S.error = '';
      S.mode = j.mode;
      if (!j.unchanged) { S.data = j; S.version = j.version; S.ai = !!j.ai; emit(); }
    } catch (e) { S.online = false; S.error = e.message; emit(); }
  }
  async function op(name, actor, payload) {
    const j = await req('POST', '/api/state', { op: name, actor, payload });
    await refresh(true);
    return j;
  }
  async function lease() {
    try { S.leader = (await req('POST', '/api/state', { lease: DEVICE })).leader; } catch (e) { S.leader = false; }
  }
  let timer = null, leaseTimer = null;
  function start() {
    const tick = async () => { if (!document.hidden) await refresh(); const s = (S.data && S.data.settings && S.data.settings.pollSeconds) || 5; timer = setTimeout(tick, s * 1000); };
    refresh(true).then(() => { timer = setTimeout(tick, 5000); });
    lease(); leaseTimer = setInterval(() => { if (!document.hidden) lease(); }, 10000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { refresh(); lease(); } });
  }
  window.SNYP_API = {
    S, DEVICE, req, op, refresh, lease, start, on: (f) => listeners.push(f),
    login: (password) => req('POST', '/api/login', { password }),
    logout: () => req('DELETE', '/api/login'),
    isLoggedIn: async () => (await req('GET', '/api/login')).loggedIn,
    ai: (body) => req('POST', '/api/ai', body),
  };
})();
