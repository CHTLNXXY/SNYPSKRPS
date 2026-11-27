// One small adapter for several AI providers, so each staff member can use a different model.
// A provider is "on" when its key is set in Vercel. No key in the code, ever.
//
//   ANTHROPIC_API_KEY   Claude (paid)                     model: SNYP_MODEL       (default claude-opus-5-5)
//   GEMINI_API_KEY      Google Gemini (free tier)         model: GEMINI_MODEL     (default gemini-flash-latest)
//                       can use Google Search for grounding (the Librarian uses it)
//   GROQ_API_KEY        Groq, open models (free tier)     model: GROQ_MODEL       (default llama-3.3-70b-versatile)
//   OPENROUTER_API_KEY  OpenRouter, many models (free)    model: OPENROUTER_MODEL (default openrouter/free)
//
// Who uses what: SNYP_AI_<STAFF> picks a provider for one staff member, e.g. SNYP_AI_LIB=gemini,
// SNYP_AI_METOD=anthropic. Without it, the order below is used. If a provider fails (limit reached,
// model gone), the next one that has a key is tried, so a free-tier limit never stops the office.

const PROVIDERS = ['anthropic', 'gemini', 'groq', 'openrouter'];
const KEY = { anthropic: 'ANTHROPIC_API_KEY', gemini: 'GEMINI_API_KEY', groq: 'GROQ_API_KEY', openrouter: 'OPENROUTER_API_KEY' };
// The Librarian prefers Gemini because it can check references with Google Search.
const PREFER = { lib: ['gemini'] };

const available = () => PROVIDERS.filter((p) => !!process.env[KEY[p]]);

function order(who) {
  const on = available();
  const pick = String(process.env['SNYP_AI_' + String(who || '').toUpperCase()] || '').toLowerCase();
  const first = [pick, ...(PREFER[who] || [])].filter((p) => on.includes(p));
  return [...new Set([...first, ...on])];
}

const refusal = () => { const e = new Error('The AI declined this request'); e.status = 422; e.final = true; return e; };
const stripThinking = (t) => String(t || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();

async function anthropic({ system, user, effort, maxTokens }) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic();
  const stream = client.beta.messages.stream({
    model: process.env.SNYP_MODEL || 'claude-opus-5-5', max_tokens: maxTokens,
    betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    output_config: { effort },
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') throw refusal();
  return msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
}

async function post(url, headers, payload) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(payload) });
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch (e) { /* not JSON */ }
  if (!r.ok) { const e = new Error(`${new URL(url).host} ${r.status}: ${((j && j.error && (j.error.message || j.error)) || text).toString().slice(0, 300)}`); e.status = 502; throw e; }
  return j || {};
}

async function gemini({ system, user, maxTokens, search }) {
  const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
  const j = await post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    { 'x-goog-api-key': process.env.GEMINI_API_KEY }, {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { maxOutputTokens: maxTokens },
      ...(search ? { tools: [{ google_search: {} }] } : {}),
    });
  const c = (j.candidates || [])[0] || {};
  if (['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST'].includes(c.finishReason) || (j.promptFeedback && j.promptFeedback.blockReason)) throw refusal();
  let text = ((c.content && c.content.parts) || []).filter((p) => p.text && !p.thought).map((p) => p.text).join('').trim();
  if (!text) throw new Error('Gemini returned no text');
  // Google Search sources, so the student can open and check every reference.
  const seen = new Set();
  const sources = ((c.groundingMetadata && c.groundingMetadata.groundingChunks) || [])
    .map((g) => g.web).filter((w) => w && w.uri && !seen.has(w.uri) && seen.add(w.uri));
  if (sources.length) text += '\n\nSumber (Google Search):\n' + sources.map((w, i) => `${i + 1}. ${w.title || w.uri} - ${w.uri}`).join('\n');
  return text;
}

function openaiCompatible(url, keyName, modelName, defModel, cap) {
  return async ({ system, user, maxTokens }) => {
    const j = await post(url, { Authorization: `Bearer ${process.env[keyName]}`, 'X-Title': 'SNYP University' }, {
      model: process.env[modelName] || defModel,
      max_tokens: Math.min(maxTokens, cap),
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    });
    const m = ((j.choices || [])[0] || {}).message || {};
    if (m.refusal) throw refusal();
    const text = stripThinking(m.content);
    if (!text) throw new Error('No text returned');
    return text;
  };
}

const CALL = {
  anthropic,
  gemini,
  // Groq's free tier counts tokens per minute, so long answers are capped lower there.
  groq: openaiCompatible('https://api.groq.com/openai/v1/chat/completions', 'GROQ_API_KEY', 'GROQ_MODEL', 'llama-3.3-70b-versatile', 4000),
  openrouter: openaiCompatible('https://openrouter.ai/api/v1/chat/completions', 'OPENROUTER_API_KEY', 'OPENROUTER_MODEL', 'openrouter/free', 8000),
};

// ask({who, system, user, effort, maxTokens, search}) -> {text, provider}
async function ask(opts) {
  const list = order(opts.who);
  if (!list.length) { const e = new Error('AI is off (no API key set)'); e.status = 503; e.code = 'NO_AI'; throw e; }
  let last;
  for (const p of list) {
    try { return { text: await CALL[p](opts), provider: p }; } catch (e) {
      if (e.final) throw e;
      last = e; console.warn(`AI provider ${p} failed, trying the next one:`, e.message);
    }
  }
  throw last;
}

module.exports = { ask, available, order, PROVIDERS, _call: CALL };
