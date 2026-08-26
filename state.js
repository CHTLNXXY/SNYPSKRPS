const { Redis } = require('@upstash/redis');

// Vercel's Upstash integration can inject either naming convention depending on
// when the database was created — support both so this works either way.
const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = (REDIS_URL && REDIS_TOKEN) ? new Redis({ url: REDIS_URL, token: REDIS_TOKEN }) : null;

const KEY = 'tcn-stock-state-v1';

module.exports = async (req, res) => {
  if (!redis) {
    res.status(500).json({
      error: 'Environment variable database Redis belum ditemukan (KV_REST_API_URL/TOKEN atau UPSTASH_REDIS_REST_URL/TOKEN). Pastikan database sudah di-Connect ke project ini di dashboard Vercel, lalu redeploy.'
    });
    return;
  }
  try {
    if (req.method === 'GET') {
      const data = await redis.get(KEY);
      res.status(200).json({ value: data || null });
      return;
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch (e) {
          res.status(400).json({ error: 'Body bukan JSON yang valid' });
          return;
        }
      }
      if (!body || typeof body !== 'object') {
        res.status(400).json({ error: 'Body kosong atau tidak valid' });
        return;
      }
      await redis.set(KEY, body);
      res.status(200).json({ ok: true });
      return;
    }

    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).json({ error: 'Method tidak diizinkan' });
  } catch (err) {
    console.error('Error di /api/state:', err);
    res.status(500).json({
      error: 'Terjadi kesalahan di server. Pastikan database Redis sudah dihubungkan ke project ini lewat Vercel Marketplace.',
      detail: String(err && err.message ? err.message : err)
    });
  }
};

