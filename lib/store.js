// Storage adapter. One small interface, two backends:
//  - Upstash Redis (production on Vercel): shared across devices.
//  - Local JSON file (dev-server only): for testing without any account.
// On Vercel the app NEVER falls back to the local store: if Redis is missing it fails loudly.
const fs = require('fs');
const path = require('path');

// Vercel's Upstash integration may inject either naming convention; support both.
const env = () => ({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
  onVercel: !!process.env.VERCEL,
});

function redisStore() {
  const { Redis } = require('@upstash/redis');
  // Values are always JSON strings we encode ourselves, so turn off auto-deserialisation.
  const { url, token } = env();
  const r = new Redis({ url, token, automaticDeserialization: false });
  return {
    mode: 'server',
    get: (k) => r.get(k),
    set: (k, v) => r.set(k, v),
    del: (k) => r.del(k),
    incr: (k) => r.incr(k),
    expire: (k, s) => r.expire(k, s),
    hget: (k, f) => r.hget(k, f),
    hset: (k, f, v) => r.hset(k, { [f]: v }),
    hdel: (k, f) => r.hdel(k, f),
    hgetall: async (k) => (await r.hgetall(k)) || {},
    lpush: (k, v) => r.lpush(k, v),
    lrange: (k, a, b) => r.lrange(k, a, b),
    ltrim: (k, a, b) => r.ltrim(k, a, b),
    keys: (p) => r.keys(p),
  };
}

function fileStore(file) {
  let db = {};
  const ttl = {};
  try { db = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { db = {}; }
  const save = () => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(db)); };
  const h = (k) => (db[k] && typeof db[k] === 'object' && !Array.isArray(db[k])) ? db[k] : (db[k] = {});
  const l = (k) => Array.isArray(db[k]) ? db[k] : (db[k] = []);
  return {
    mode: 'local',
    get: async (k) => { if (ttl[k] && ttl[k] < Date.now()) { delete db[k]; delete ttl[k]; } return typeof db[k] === 'string' ? db[k] : null; },
    set: async (k, v) => { db[k] = String(v); save(); return 'OK'; },
    del: async (k) => { delete db[k]; save(); return 1; },
    incr: async (k) => { db[k] = String((parseInt(db[k] || '0', 10)) + 1); save(); return parseInt(db[k], 10); },
    expire: async (k, sec) => { ttl[k] = Date.now() + sec * 1000; return 1; },
    hget: async (k, f) => (h(k)[f] ?? null),
    hset: async (k, f, v) => { h(k)[f] = v; save(); return 1; },
    hdel: async (k, f) => { delete h(k)[f]; save(); return 1; },
    hgetall: async (k) => ({ ...h(k) }),
    lpush: async (k, v) => { l(k).unshift(v); save(); return l(k).length; },
    lrange: async (k, a, b) => { const x = l(k); return x.slice(a, b < 0 ? x.length + b + 1 : b + 1); },
    ltrim: async (k, a, b) => { const x = l(k); db[k] = x.slice(a, b < 0 ? x.length + b + 1 : b + 1); save(); return 'OK'; },
    keys: async (p) => { const re = new RegExp('^' + p.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$'); return Object.keys(db).filter(k => re.test(k)); },
  };
}

let cached = null;
function getStore() {
  if (cached) return cached;
  const e = env();
  if (e.url && e.token) return (cached = redisStore());
  if (e.onVercel) {
    const err = new Error('Redis is not connected. Add Upstash Redis to this Vercel project (Storage tab), then redeploy. See docs/DEPLOY.md.');
    err.code = 'NO_REDIS';
    throw err;
  }
  return (cached = fileStore(process.env.SNYP_LOCAL_STORE || path.join(__dirname, '..', '.data', 'store.json')));
}
function _reset() { cached = null; }

module.exports = { getStore, _reset };
