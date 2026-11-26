// Small helpers shared by the API functions.
function body(req) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = null; } }
  return b && typeof b === 'object' ? b : {};
}
function fail(res, err) {
  const status = err.status || (err.code === 'NO_REDIS' ? 503 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || String(err), code: err.code });
}
module.exports = { body, fail };
