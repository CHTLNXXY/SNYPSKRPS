// Backend tests on the local store. Run: node --test test/
const os = require('os'), fs = require('fs'), path = require('path');
const STORE = path.join(os.tmpdir(), 'snyp-test-' + process.pid + '.json');
process.env.SNYP_LOCAL_STORE = STORE;
const BUNDLED = path.join(__dirname, '..', 'thesis-archive');
process.env.SNYP_ARCHIVE_DIR = process.env.SNYP_ARCHIVE_DIR || (fs.existsSync(BUNDLED) ? BUNDLED : '/mnt/project-files/SNYP_Thesis');
const test = require('node:test'); const assert = require('node:assert/strict');
const { boot } = require('./helpers');
const ABB = JSON.parse(fs.readFileSync(path.join(process.env.SNYP_ARCHIVE_DIR, '05_Backup/ABB_original.json'), 'utf8'));

let S, A, FAKE;
test.before(async () => {
  if (process.env.SNYP_TEST_REDIS) { // run the whole suite through the real @upstash/redis client
    FAKE = await require('./fake-upstash').start();
    process.env.UPSTASH_REDIS_REST_URL = FAKE.url; process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
  }
  S = await boot(); A = S.client();
});
test.after(() => {
  S.close(); fs.rmSync(STORE, { force: true });
  if (FAKE) { FAKE.close(); }
});

test('login is required and wrong passwords are refused', async () => {
  assert.equal((await A.call('GET', '/api/state')).status, 401);
  assert.equal((await A.call('GET', '/api/backup')).status, 401);
  assert.equal((await A.call('GET', '/api/docs')).status, 401);
  assert.equal((await A.login('wrong')).status, 401);
  assert.equal((await A.login()).status, 200);
  assert.equal((await A.call('GET', '/api/state')).status, 200);
});

test('ABB.json imports with all tickets, activity and numbering', async () => {
  const r = await A.call('POST', '/api/backup', { data: ABB });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const s = (await A.call('GET', '/api/state')).body;
  assert.equal(s.tickets.length, 4);
  assert.deepEqual(s.tickets.map((t) => t.status), ['delivered', 'delivered', 'delivered', 'delivered']);
  assert.deepEqual(s.tickets.map((t) => t.assignee), ['stat', 'metod', 'lib', 'lib']);
  assert.equal(s.tickets[0].legacyStatus, 'open');
  assert.equal(s.state.nextNo, 5);
  assert.equal(s.state.lastCheckedRevision, '951804354c86ceb4c26a0e8f994bd649');
  assert.ok(s.activity.length >= 7);
});

test('export round-trips to an ABB.json the app can read back', async () => {
  const e = (await A.call('GET', '/api/backup')).body;
  assert.equal(e.app, 'SNYP University');
  assert.deepEqual(e.tickets.map((t) => t.id), ['t1', 't2', 't3', 't4']);
  assert.equal(e.tickets[2].detail, ABB.tickets[2].detail);
});

test('ticket lifecycle enforces who may do what', async () => {
  let r = await A.op('ticket.create', 'rina', { title: 'Cek uji validitas kuesioner', detail: 'Tolong cek hasil uji validitas dan reliabilitas data responden' });
  const id = r.body.ticket.id; assert.equal(r.body.ticket.status, 'received'); assert.equal(r.body.ticket.no, 5);
  assert.equal((await A.op('ticket.transition', 'rina', { id, to: 'delivered' })).status, 400, 'cannot deliver without assignee');
  assert.equal((await A.op('ticket.route', 'rina', { id, assignee: 'stat', reason: 'statistik' })).status, 200);
  assert.equal((await A.op('ticket.transition', 'rina', { id, to: 'delivered' })).status, 200);
  assert.equal((await A.op('ticket.transition', 'stat', { id, to: 'working' })).status, 403, 'staff wait for authorization');
  assert.equal((await A.op('ticket.transition', 'director', { id, to: 'authorized' })).status, 403, 'director cannot authorize');
  assert.equal((await A.op('ticket.transition', 'owner', { id, to: 'authorized' })).status, 200);
  assert.equal((await A.op('ticket.transition', 'metod', { id, to: 'working' })).status, 403, 'only the assignee works it');
  assert.equal((await A.op('ticket.transition', 'stat', { id, to: 'working' })).status, 200);
  assert.equal((await A.op('ticket.transition', 'stat', { id, to: 'ready' })).status, 400, 'result required');
  assert.equal((await A.op('ticket.transition', 'stat', { id, to: 'ready', result: 'Semua item valid (r hitung > r tabel).' })).status, 200);
  assert.equal((await A.op('ticket.comment', 'director', { id, kind: 'supervision', text: 'Result ready, waiting for owner approval.' })).status, 200);
  assert.equal((await A.op('ticket.transition', 'director', { id, to: 'approved' })).status, 403, 'director cannot approve');
  assert.equal((await A.op('ticket.edit', 'director', { id, title: 'x' })).status, 403, 'director cannot edit');
  r = await A.op('ticket.transition', 'owner', { id, to: 'approved' });
  assert.equal(r.status, 200); assert.equal(r.body.ticket.history.length, 6);
});

test('duplicate ticket can only be closed by the owner', async () => {
  assert.equal((await A.op('ticket.transition', 'lib', { id: 't4', to: 'closed' })).status, 403);
  assert.equal((await A.op('ticket.transition', 'director', { id: 't4', to: 'closed' })).status, 403);
});

test('two devices changing different tickets at the same time both persist', async () => {
  const B = S.client(); await B.login();
  await Promise.all([A.op('ticket.comment', 'owner', { id: 't1', text: 'from device A' }), B.op('ticket.comment', 'owner', { id: 't2', text: 'from device B' })]);
  const s = (await B.call('GET', '/api/state')).body;
  assert.equal(s.tickets.find((t) => t.id === 't1').comments.at(-1).text, 'from device A');
  assert.equal(s.tickets.find((t) => t.id === 't2').comments.at(-1).text, 'from device B');
  const v = s.version;
  assert.deepEqual((await A.call('GET', '/api/state?v=' + v)).body.unchanged, true);
});

test('draft check reads the real draft and does not duplicate existing tickets', async () => {
  const DRAFT = '01_Thesis_Draft/draft skripsi (Pengaruh Trust in AI dan AI Reliance terhadap Minat Investasi Syariah pada Pengguna Artificial Intelligence).docx';
  let r = await A.call('POST', '/api/draftcheck', { path: DRAFT });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.revision, '951804354c86ceb4c26a0e8f994bd649');
  assert.equal(r.body.unchanged, true);
  const keys = r.body.findings.map((f) => f.key);
  assert.ok(keys.includes('refs:incomplete')); assert.ok(keys.some((k) => k.startsWith('ph:[jumlah sampel')));
  assert.deepEqual(r.body.created.map((t) => t.title.slice(0, 12)), ['Front matter'], 'only the finding the old app never ticketed');
  r = await A.call('POST', '/api/draftcheck', { path: DRAFT });
  assert.equal(r.body.created.length, 0, 'second run creates nothing');
  // With no path the office checks the compiled thesis; the same placeholders must not become new tickets.
  r = await A.call('POST', '/api/draftcheck', {});
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.findings.length > 0);
  const st = (await A.call('GET', '/api/state')).body;
  assert.match(st.state.lastCheckedFile, /SKRIPSI_TERSUSUN_v2\.docx/);
  assert.ok(!r.body.created.some((t) => /jumlah sampel|refer/i.test(t.title)), JSON.stringify(r.body.created.map((t) => t.title)));
});

test('meeting workflow: call, gather, discuss, minutes, action to ticket, end', async () => {
  let r = await A.op('meeting.create', 'owner', { topic: 'Progress BAB III' }); const id = r.body.meeting.id;
  assert.equal((await A.op('meeting.create', 'owner', { topic: 'second' })).status, 400, 'one meeting at a time');
  assert.equal((await A.op('meeting.create', 'director', { topic: 'x' })).status, 400 + 3);
  assert.equal((await A.op('meeting.contribute', 'stat', { id, text: 'early' })).status, 400, 'not in session yet');
  assert.equal((await A.op('meeting.transition', 'system', { id, to: 'in_session' })).status, 400, 'must gather first');
  assert.equal((await A.op('meeting.transition', 'system', { id, to: 'gathering' })).status, 200);
  assert.equal((await A.op('meeting.transition', 'system', { id, to: 'in_session' })).status, 200);
  for (const w of ['director', 'stat', 'metod', 'lib', 'rina', 'owner']) assert.equal((await A.op('meeting.contribute', w, { id, text: w + ' view' })).status, 200);
  assert.equal((await A.op('meeting.minutes', 'stat', { id, minutes: 'x' })).status, 403);
  assert.equal((await A.op('meeting.transition', 'system', { id, to: 'minutes' })).status, 200);
  r = await A.op('meeting.minutes', 'nadia', { id, minutes: 'Ringkasan', actions: [{ text: 'Tentukan jumlah sampel', assignee: 'stat' }, { text: 'Lengkapi APA 7', assignee: 'lib' }] });
  assert.equal(r.body.meeting.actions.length, 2);
  assert.equal((await A.op('meeting.actionToTicket', 'nadia', { id, index: 0 })).status, 403);
  r = await A.op('meeting.actionToTicket', 'owner', { id, index: 0 });
  assert.equal(r.body.ticket.source, 'Meeting'); assert.equal(r.body.ticket.assignee, 'stat'); assert.equal(r.body.ticket.status, 'received');
  assert.equal((await A.op('meeting.actionToTicket', 'owner', { id, index: 0 })).status, 400, 'no double conversion');
  r = await A.op('meeting.transition', 'system', { id, to: 'ended' });
  assert.equal(r.body.meeting.status, 'ended'); assert.equal(r.body.meeting.contributions.length, 6);
});

test('backup restore brings data back and snapshots what it replaced', async () => {
  const before = (await A.call('GET', '/api/backup')).body;
  await A.op('ticket.create', 'owner', { title: 'temporary' });
  assert.equal((await A.call('GET', '/api/state')).body.tickets.length, before.tickets.length + 1);
  assert.equal((await A.call('POST', '/api/backup', { data: before })).status, 200);
  const s = (await A.call('GET', '/api/state')).body;
  assert.equal(s.tickets.length, before.tickets.length);
  const snaps = (await A.call('GET', '/api/backup?list=1')).body.snapshots;
  assert.ok(snaps.some((x) => x.startsWith('before-import-')));
  assert.ok(snaps.some((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)), 'daily snapshot exists');
  const snap = snaps.find((x) => x.startsWith('before-import-'));
  assert.equal((await A.call('GET', '/api/backup?snapshot=' + snap)).body.app, 'SNYP University');
  assert.equal((await A.call('POST', '/api/backup', { data: { app: 'Other' } })).status, 400, 'rejects foreign files');
});

test('document archive lists every file and serves exact bytes; blocks path tricks', async () => {
  const d = (await A.call('GET', '/api/docs')).body;
  const pdfs = d.files.filter((f) => f.path.startsWith('02_Journal_References/') && f.path.endsWith('.pdf'));
  assert.equal(pdfs.length, 16);
  assert.ok(d.files.some((f) => f.path === '04_Chapter_Documents/BAB.docx'));
  const p = pdfs[0].path;
  const r = await A.call('GET', '/api/docs?path=' + encodeURIComponent(p), null, true);
  assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'application/pdf');
  const got = Buffer.from(await r.arrayBuffer());
  assert.ok(got.equals(fs.readFileSync(path.join(process.env.SNYP_ARCHIVE_DIR, p))));
  assert.equal((await A.call('GET', '/api/docs?path=' + encodeURIComponent('../SNYP_University/docs/ARCHITECTURE.md'))).status, 400);
});

test('photocopier exports the report, a ticket and a meeting as Word, Excel and a printable PDF page', async () => {
  const { unzipSync, strFromU8 } = require('fflate');
  const B = S.client();
  assert.equal((await B.call('GET', '/api/export?format=docx')).status, 401, 'login required');
  const st = (await A.call('GET', '/api/state')).body;
  const t = st.tickets[0];
  const get = async (q) => { const r = await A.call('GET', '/api/export?' + q, null, true); return { r, buf: new Uint8Array(await r.arrayBuffer()) }; };
  let { r, buf } = await get('kind=report&format=docx');
  assert.equal(r.status, 200); assert.match(r.headers.get('content-disposition'), /Laporan_SNYP_.*\.docx/);
  let z = unzipSync(buf); const doc = strFromU8(z['word/document.xml']);
  assert.ok(doc.includes('Laporan SNYP University') && doc.includes('#' + t.no) && doc.includes('<w:tbl>'));
  ({ r, buf } = await get('kind=report&format=xlsx'));
  z = unzipSync(buf); assert.ok(z['xl/workbook.xml'] && strFromU8(z['xl/workbook.xml']).includes('Semua tiket'));
  assert.ok(Object.keys(z).filter((k) => k.startsWith('xl/worksheets/')).length >= 3);
  ({ r, buf } = await get(`kind=ticket&id=${t.id}&format=docx`));
  assert.ok(strFromU8(unzipSync(buf)['word/document.xml']).includes(`Tiket #${t.no}`));
  ({ r, buf } = await get('kind=report&format=pdf'));
  const html = strFromU8(buf); assert.match(r.headers.get('content-type'), /text\/html/); assert.ok(html.includes('print()') && html.includes('Semua tiket'));
  const ms = st.meetings; if (ms.length) { ({ r } = await get(`kind=meeting&id=${ms[ms.length - 1].id}&format=xlsx`)); assert.equal(r.status, 200); }
  assert.equal((await A.call('GET', '/api/export?kind=ticket&id=nope&format=docx')).status, 404);
});

test('AI package: one Markdown file with instructions, open tickets and the full compiled thesis', async () => {
  const r = await A.call('GET', '/api/export?kind=aipack', null, true);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-disposition'), /Paket_AI_Skripsi_.*\.md/);
  const md = await r.text();
  assert.ok(md.includes('## Instruksi untuk AI') && md.includes('Jangan mengarang angka'));
  assert.ok(md.includes('Tiket terbuka:'));
  for (const hd of ['# BAB I PENDAHULUAN', '## 1.1 Latar Belakang', '# BAB III METODE PENELITIAN', '# BAB IV HASIL PENELITIAN DAN PEMBAHASAN', '# BAB V KESIMPULAN DAN SARAN', '# DAFTAR PUSTAKA']) assert.ok(md.includes(hd), hd);
  assert.ok(md.includes('SKRIPSI_TERSUSUN_v2.docx'), 'uses the compiled thesis');
  const archive = require('../lib/archive');
  assert.equal(archive.currentThesis([{ path: '01_Thesis_Draft/draft skripsi.docx' }, { path: '01_Thesis_Draft/SKRIPSI_TERSUSUN_v2.docx' }, { path: '01_Thesis_Draft/SKRIPSI_TERSUSUN_v10.docx' }]), '01_Thesis_Draft/SKRIPSI_TERSUSUN_v10.docx');
  assert.equal(archive.currentThesis([{ path: '01_Thesis_Draft/a.docx' }, { path: '01_Thesis_Draft/b.docx' }]), '01_Thesis_Draft/b.docx');
});

test('login brute force is throttled', async () => {
  const C = S.client(); let last;
  for (let i = 0; i < 9; i++) last = await C.login('nope' + i);
  assert.equal(last.status, 429);
});

if (process.env.SNYP_TEST_REDIS) test('all of the above went through Redis, not the local file', () => {
  assert.ok(FAKE.calls.length > 50, 'redis calls: ' + FAKE.calls.length);
  assert.ok(FAKE.db.has('snyp:tickets'));
  assert.equal(fs.existsSync(STORE), false);
});

test('AI endpoint reports "off" without a key instead of failing', async () => {
  if (process.env.ANTHROPIC_API_KEY) return;
  const r = await A.call('POST', '/api/ai', { task: 'route', text: 'x' });
  assert.equal(r.status, 503); assert.equal(r.body.code, 'NO_AI');
});

test('on Vercel without Redis the app fails loudly instead of saving to the browser', () => {
  const { _reset, getStore } = require('../lib/store');
  const saved = { ...process.env };
  try {
    _reset(); process.env.VERCEL = '1';
    delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.KV_REST_API_URL;
    assert.throws(() => getStore(), /Redis is not connected/);
  } finally { process.env = saved; _reset(); }
});
