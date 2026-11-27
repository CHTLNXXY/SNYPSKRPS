// Multi-provider AI adapter, tested with a fake fetch (no real keys, no network).
const test = require('node:test'); const assert = require('node:assert/strict');
const llm = require('../lib/llm');

const KEYS = ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY', 'SNYP_AI_STAT', 'SNYP_AI_LIB'];
const realFetch = global.fetch;
let calls;
function env(vals) { for (const k of KEYS) delete process.env[k]; Object.assign(process.env, vals); }
function fakeFetch(handler) { calls = []; global.fetch = async (url, init) => { const body = JSON.parse(init.body); calls.push({ url, body, headers: init.headers }); const [status, json] = handler(url, body); return { ok: status < 400, status, text: async () => JSON.stringify(json) }; }; }
test.afterEach(() => { global.fetch = realFetch; env({}); });

const gem = (text, chunks) => [200, { candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP', groundingMetadata: chunks ? { groundingChunks: chunks } : undefined }] }];
const oai = (text) => [200, { choices: [{ message: { content: text } }] }];

test('no key means AI is off', async () => {
  env({});
  assert.deepEqual(llm.available(), []);
  await assert.rejects(llm.ask({ who: 'rina', system: 's', user: 'u', maxTokens: 100 }), (e) => e.code === 'NO_AI');
});

test('Gemini is called with the key in a header, never in the URL', async () => {
  env({ GEMINI_API_KEY: 'g-key' });
  fakeFetch(() => gem('Halo'));
  const out = await llm.ask({ who: 'rina', system: 'sys', user: 'hai', maxTokens: 100 });
  assert.equal(out.text, 'Halo'); assert.equal(out.provider, 'gemini');
  assert.match(calls[0].url, /generativelanguage\.googleapis\.com/);
  assert.ok(!calls[0].url.includes('g-key'));
  assert.equal(calls[0].headers['x-goog-api-key'], 'g-key');
  assert.equal(calls[0].body.tools, undefined, 'no search unless asked');
});

test('the Librarian gets Google Search and the sources are listed', async () => {
  env({ GROQ_API_KEY: 'q', GEMINI_API_KEY: 'g' });
  fakeFetch(() => gem('Referensi valid.', [{ web: { uri: 'https://doi.org/x', title: 'Jurnal X' } }, { web: { uri: 'https://doi.org/x', title: 'dup' } }]));
  const out = await llm.ask({ who: 'lib', system: 's', user: 'cek', maxTokens: 100, search: true });
  assert.equal(out.provider, 'gemini', 'Librarian prefers Gemini');
  assert.deepEqual(calls[0].body.tools, [{ google_search: {} }]);
  assert.match(out.text, /Sumber \(Google Search\):\n1\. Jurnal X - https:\/\/doi\.org\/x$/);
});

test('Groq and OpenRouter use the OpenAI-style API; thinking text is removed', async () => {
  env({ GROQ_API_KEY: 'q' });
  fakeFetch(() => oai('<think>hmm</think>Siap!'));
  const out = await llm.ask({ who: 'stat', system: 's', user: 'u', maxTokens: 12000 });
  assert.equal(out.text, 'Siap!'); assert.equal(out.provider, 'groq');
  assert.match(calls[0].url, /api\.groq\.com/);
  assert.equal(calls[0].headers.Authorization, 'Bearer q');
  assert.equal(calls[0].body.max_tokens, 4000, 'capped for the free tier');
  assert.equal(calls[0].body.messages[0].role, 'system');
});

test('SNYP_AI_<STAFF> picks the provider for one staff member', async () => {
  env({ GEMINI_API_KEY: 'g', OPENROUTER_API_KEY: 'o', SNYP_AI_STAT: 'openrouter' });
  assert.deepEqual(llm.order('stat'), ['openrouter', 'gemini']);
  assert.deepEqual(llm.order('rina'), ['gemini', 'openrouter']);
  env({ GEMINI_API_KEY: 'g', SNYP_AI_STAT: 'anthropic' });
  assert.deepEqual(llm.order('stat'), ['gemini'], 'a provider without a key is skipped');
});

test('when one free tier hits its limit the next provider answers', async () => {
  env({ GEMINI_API_KEY: 'g', GROQ_API_KEY: 'q' });
  fakeFetch((url) => (url.includes('googleapis') ? [429, { error: { message: 'quota exceeded' } }] : oai('dari Groq')));
  const out = await llm.ask({ who: 'nadia', system: 's', user: 'u', maxTokens: 100 });
  assert.equal(out.provider, 'groq'); assert.equal(out.text, 'dari Groq'); assert.equal(calls.length, 2);
});

test('a refusal is not retried on another provider', async () => {
  env({ GEMINI_API_KEY: 'g', GROQ_API_KEY: 'q' });
  fakeFetch(() => [200, { candidates: [{ finishReason: 'SAFETY' }] }]);
  await assert.rejects(llm.ask({ who: 'rina', system: 's', user: 'u', maxTokens: 100 }), (e) => e.status === 422);
  assert.equal(calls.length, 1);
});

test('if every provider fails, the last error comes back', async () => {
  env({ GEMINI_API_KEY: 'g' });
  fakeFetch(() => [404, { error: { message: 'model not found' } }]);
  await assert.rejects(llm.ask({ who: 'rina', system: 's', user: 'u', maxTokens: 100 }), /404: model not found/);
});
