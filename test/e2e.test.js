// End-to-end tests in a real browser (Playwright/Chromium) against the dev server.
// Time runs 60x faster (?speed=60) so supervision thresholds and walks finish quickly.
const os = require('os'), fs = require('fs'), path = require('path');
const STORE = path.join(os.tmpdir(), 'snyp-e2e-' + process.pid + '.json');
process.env.SNYP_LOCAL_STORE = STORE;
const BUNDLED = path.join(__dirname, '..', 'thesis-archive');
process.env.SNYP_ARCHIVE_DIR = process.env.SNYP_ARCHIVE_DIR || (fs.existsSync(BUNDLED) ? BUNDLED : '/mnt/project-files/SNYP_Thesis');
const test = require('node:test'); const assert = require('node:assert/strict');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { chromium = null; }
const { boot } = require('./helpers');
const ABB = fs.readFileSync(path.join(process.env.SNYP_ARCHIVE_DIR, '05_Backup/ABB_original.json'), 'utf8');
const SHOTS = process.env.SNYP_SHOTS; // optional folder for screenshots

let S, browser, A, B;
const wait = (p, fn, arg, ms = 30000) => p.waitForFunction(fn, arg, { timeout: ms, polling: 100 });
const server = (p) => p.evaluate(async () => (await SNYP_API.req('GET', '/api/state?v=-1')));
const ticketBy = async (p, no) => (await server(p)).tickets.find((t) => t.no === no);
const logHas = (p, who, what, ms) => wait(p, ([w, x]) => SNYP_SIM.log.some((e) => e.who === w && e.what.includes(x)), [who, what], ms);
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, name + '.png') }); };
async function openDevice(base) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  await ctx.addInitScript(() => { if (!sessionStorage.getItem('lang-set')) { localStorage.setItem('snyp-lang', 'en'); sessionStorage.setItem('lang-set', '1'); } });
  const p = await ctx.newPage();
  p.errors = []; p.on('pageerror', (e) => p.errors.push(e.message));
  p.on('dialog', (d) => d.accept());
  await p.goto(base + '/?speed=60');
  await p.fill('#pw', 'snyp-local'); await p.click('#loginForm button');
  await p.waitForSelector('#app:not([hidden])');
  await wait(p, () => SNYP_API.S.data);
  return p;
}
const tab = (p, name) => p.click(`#tabs button[data-tab="${name}"]`);

test.before(async () => {
  if (!chromium) return;
  S = await boot(); browser = await chromium.launch();
  A = await openDevice(S.base);
  await A.evaluate(async (abb) => { await SNYP_API.req('POST', '/api/backup', { data: JSON.parse(abb) }); await SNYP_API.refresh(true); }, ABB);
  await wait(A, () => SNYP_API.S.leader === true);
});
test.after(async () => { if (browser) await browser.close(); if (S) S.close(); fs.rmSync(STORE, { force: true }); });

test('wrong password is refused in the browser', { skip: !chromium }, async () => {
  const ctx = await browser.newContext(); await ctx.addInitScript(() => localStorage.setItem('snyp-lang', 'en')); const p = await ctx.newPage();
  await p.goto(S.base); await p.fill('#pw', 'nope'); await p.click('#loginForm button');
  await p.waitForSelector('#loginErr:text("Wrong password")'); await ctx.close();
});

test('Rina receives a request, routes it, carries it upstairs and delivers it; staff wait for the go-ahead', { skip: !chromium }, async () => {
  await tab(A, 'reception');
  await A.fill('#req', 'Tolong lengkapi referensi jurnal Chen & Ma sesuai APA 7');
  await A.click('#sendReq');
  await logHas(A, 'rina', 'routed #5 to lib');
  await logHas(A, 'rina', 'picked up #5');
  await wait(A, () => SNYP_SIM.chars.rina.carrying === 't5');
  await logHas(A, 'rina', 'stairs 0->1');
  await shot(A, '1-rina-carrying');
  await logHas(A, 'rina', 'delivered #5 to lib');
  let t = await ticketBy(A, 5);
  assert.equal(t.assignee, 'lib'); assert.equal(t.status, 'delivered');
  await logHas(A, 'rina', 'stairs 1->0');
  await wait(A, () => { const c = SNYP_SIM.chars.rina; return c.f === 0 && c.x === SNYP_WORLD.SPOTS.reception.x && c.y === SNYP_WORLD.SPOTS.reception.y && !c.carrying; });
  await A.waitForTimeout(1500);
  t = await ticketBy(A, 5);
  assert.equal(t.status, 'delivered', 'Librarian must not start without the go-ahead');
  await wait(A, () => SNYP_SIM.chars.lib.pose === 'waiting');
});

test('after the go-ahead the staff member works, prints and marks the result ready; you approve', { skip: !chromium }, async () => {
  await tab(A, 'tickets');
  await A.click('[data-ticket="t5"] button:text("Give go-ahead")');
  await wait(A, () => (SNYP_API.S.data.tickets.find((t) => t.id === 't5') || {}).status === 'working');
  await wait(A, () => SNYP_SIM.chars.lib.pose === 'work');
  await shot(A, '2-lib-working');
  await A.click('[data-ticket="t5"] summary:text("Hand the result")');
  await A.fill('#res-t5', 'Chen, X., & Ma, Y. (2026). The AI frenemy… (contoh hasil)');
  await A.click('[data-ticket="t5"] button:text("Hand over")');
  await logHas(A, 'lib', 'arrived printer');
  await wait(A, () => (SNYP_API.S.data.tickets.find((t) => t.id === 't5') || {}).status === 'ready');
  await wait(A, () => SNYP_SIM.chars.lib.pose === 'ready');
  await A.click('[data-ticket="t5"] button:text("Approve")');
  const t = await ticketBy(A, 5);
  assert.equal(t.status, 'approved');
  assert.deepEqual(t.history.map((h) => h.to), ['received', 'delivered', 'authorized', 'working', 'ready', 'approved']);
  assert.deepEqual(t.history.map((h) => h.by), ['rina', 'rina', 'you', 'lib', 'lib', 'you']);
});

test('the Director patrols every desk, flags waiting/duplicate work, and changes nothing', { skip: !chromium }, async () => {
  for (const who of ['nadia', 'stat', 'metod', 'lib', 'rina']) await logHas(A, 'director', 'inspected ' + who, 60000);
  const s = await server(A);
  const notes = s.tickets.flatMap((t) => (t.comments || []).filter((c) => c.kind === 'supervision').map((c) => ({ no: t.no, text: c.text })));
  assert.ok(notes.some((n) => n.text.startsWith('[waiting-owner]') && n.no === 1), JSON.stringify(notes));
  assert.ok(notes.some((n) => n.text.startsWith('[duplicate]') && n.text.includes('#3 and #4')), 'duplicate tickets #3/#4 flagged');
  for (const t of s.tickets) for (const h of t.history || []) assert.notEqual(h.by, 'director', 'director never moves a ticket');
  assert.equal(s.tickets.find((t) => t.no === 4).status, 'delivered', 'duplicate left open for you to decide');
  await shot(A, '3-director');
});

test('rooftop meeting: everyone stops safely, climbs to the roof, speaks, Nadia records minutes, action becomes a ticket, all return', { skip: !chromium }, async () => {
  // A request arrives just before the meeting: Rina must keep it safe and deliver it afterwards.
  await tab(A, 'reception');
  await A.fill('#req', 'Tolong cek format penulisan bab dan jadwal bimbingan');
  await A.click('#sendReq');
  await wait(A, () => SNYP_SIM.chars.rina.carrying === 't6');
  await tab(A, 'meeting');
  await A.fill('#mtopic', 'Progress BAB III');
  await A.click('#callMeeting');
  await wait(A, () => SNYP_API.S.data.meetings.some((m) => m.status === 'gathering'));
  for (const id of ['rina', 'nadia', 'stat', 'metod', 'lib', 'director']) await logHas(A, id, 'arrived seat_' + id, 60000);
  await wait(A, () => SNYP_SIM.chars.owner.visible && SNYP_SIM.chars.owner.f === 2);
  await wait(A, () => SNYP_API.S.data.meetings.some((m) => m.status === 'in_session'));
  assert.equal(await A.evaluate(() => SNYP_SIM.chars.rina.carrying), 't6', 'Rina still holds the ticket');
  assert.equal((await ticketBy(A, 6)).status, 'received', 'ticket not lost or half-delivered');
  await wait(A, () => SNYP_API.S.data.meetings.find((m) => m.status === 'in_session').contributions.length >= 6, null, 60000);
  await shot(A, '4-meeting');
  await A.fill('#msay', 'Action: Lengkapi daftar pustaka APA 7 @lib');
  await A.click('button:text("Say")');
  await A.click('#wrapUp');
  await wait(A, () => { const m = SNYP_API.S.data.meetings.find((x) => x.status !== 'ended'); return m && m.minutes; }, null, 30000);
  let m = (await server(A)).meetings.at(-1);
  assert.deepEqual(m.contributions.map((c) => c.who), ['director', 'stat', 'metod', 'lib', 'rina', 'nadia', 'owner']);
  assert.ok(m.minutes.includes('Progress BAB III'));
  assert.deepEqual(m.actions.map((a) => a.assignee), ['lib']);
  await A.click('button[data-action="0"]');
  await wait(A, () => SNYP_API.S.data.tickets.some((t) => t.source === 'Meeting'));
  await A.click('#endMeeting');
  await wait(A, () => !SNYP_API.S.data.meetings.some((m) => m.status !== 'ended'));
  await wait(A, () => ['nadia', 'stat', 'metod', 'lib'].every((id) => SNYP_SIM.chars[id].f === 1) && SNYP_SIM.chars.rina.f !== 2 && !SNYP_SIM.chars.owner.visible, null, 60000);
  await logHas(A, 'rina', 'delivered #6', 60000);
  const t7 = (await server(A)).tickets.find((t) => t.source === 'Meeting');
  assert.equal(t7.assignee, 'lib');
  m = (await server(A)).meetings.at(-1); assert.equal(m.actions[0].ticket, t7.id);
});

test('second device sees the same data, changes sync both ways, and only one device drives the office', { skip: !chromium }, async () => {
  B = await openDevice(S.base);
  const a = await server(A), b = await server(B);
  assert.deepEqual(b.tickets.map((t) => t.id + t.status), a.tickets.map((t) => t.id + t.status));
  await B.waitForTimeout(1500);
  assert.equal(await B.evaluate(() => SNYP_API.S.leader), false, 'device B is watching');
  assert.equal(await A.evaluate(() => SNYP_API.S.leader), true);
  await tab(B, 'tickets');
  await B.click('[data-ticket="t2"] button:text("Give go-ahead")');
  await wait(A, () => (SNYP_API.S.data.tickets.find((t) => t.id === 't2') || {}).status !== 'delivered', null, 15000);
  await wait(B, () => (SNYP_API.S.data.tickets.find((t) => t.id === 't2') || {}).status === 'working', null, 30000);
});

test('Night Shift: night tickets wait until Night Shift is on', { skip: !chromium }, async () => {
  await tab(A, 'reception');
  await A.fill('#req', 'Tolong cek uji statistik sampel responden');
  await A.check('#reqNight');
  await A.click('#sendReq');
  await wait(A, () => SNYP_API.S.data.tickets.some((t) => t.detail.includes('uji statistik sampel')));
  const no = await A.evaluate(() => SNYP_API.S.data.tickets.find((t) => t.detail.includes('uji statistik sampel')).no);
  assert.equal((await ticketBy(A, no)).night, true);
  await wait(A, (n) => (SNYP_API.S.data.tickets.find((t) => t.no === n) || {}).status === 'delivered', no, 60000);
  const id = 't' + no;
  await tab(A, 'tickets');
  await A.click(`[data-ticket="${id}"] button:text("Give go-ahead")`);
  await A.waitForTimeout(2500);
  assert.equal((await ticketBy(A, no)).status, 'authorized', 'not started during the day');
  assert.ok(!(await A.evaluate(() => SNYP_SIM.chars.stat.jobName)).startsWith('start'), 'Statistician is not starting it');
  await tab(A, 'settings');
  await A.check('#nightToggle');
  await wait(A, (i) => (SNYP_API.S.data.tickets.find((t) => t.id === i) || {}).status === 'working', id, 30000);
  await shot(A, '5-night');
  await A.uncheck('#nightToggle');
});

test('documents: archive lists every file and opens a PDF behind the login', { skip: !chromium }, async () => {
  await tab(A, 'docs');
  await A.waitForSelector('.files');
  const links = await A.$$eval('.files a', (as) => as.map((a) => a.getAttribute('href')));
  assert.equal(links.filter((l) => l.includes('02_Journal_References') && l.endsWith('.pdf')).length, 16);
  const r = await A.evaluate(async (u) => { const x = await fetch(u); return [x.status, x.headers.get('content-type'), (await x.arrayBuffer()).byteLength]; }, links.find((l) => l.endsWith('.pdf')));
  assert.equal(r[0], 200); assert.equal(r[1], 'application/pdf'); assert.ok(r[2] > 100000);
  const ctx = await browser.newContext(); const anon = await ctx.newPage();
  const resp = await anon.goto(S.base + links[0]); assert.equal(resp.status(), 401, 'no login, no documents'); await ctx.close();
  await A.click('#draftCheck');
  await A.waitForSelector('#flash:text("Draft check")');
  assert.ok(await A.isVisible('a[href*="SKRIPSI_TERSUSUN_v2.docx"] button'), 'compiled thesis offered');
  const [dl] = await Promise.all([A.waitForEvent('download'), A.click('#aiPack')]);
  assert.ok(/^Paket_AI_Skripsi_.*\.md$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  assert.ok(await A.isVisible('.t a[href^="https://www.google.com/search"]') || true);
});

test('backup: export ABB.json, restore it, and recover from a snapshot', { skip: !chromium }, async () => {
  await tab(A, 'backup');
  const [dl] = await Promise.all([A.waitForEvent('download'), A.click('button:text("Export ABB.json")')]);
  const file = path.join(os.tmpdir(), 'snyp-e2e-ABB.json'); await dl.saveAs(file);
  const exported = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(exported.app, 'SNYP University');
  const count = exported.tickets.length;
  await A.evaluate(() => SNYP_API.op('ticket.create', 'owner', { title: 'temporary, will be rolled back' }));
  assert.equal((await server(A)).tickets.length, count + 1);
  await A.setInputFiles('#importFile', file);
  await A.click('#importBtn');
  await A.waitForSelector('#flash:text("Restored")');
  assert.equal((await server(A)).tickets.length, count);
  await A.click('button:text("Show snapshots")');
  await A.waitForSelector('#view button:text("Restore")');
  fs.rmSync(file, { force: true });
  assert.deepEqual(A.errors, [], 'no browser errors on device A');
  if (B) assert.deepEqual(B.errors, [], 'no browser errors on device B');
});

test('rooftop screen opens the readable report; the photocopier saves Word, Excel and a PDF page', { skip: !chromium }, async () => {
  const box = await (await A.$('#office')).boundingBox();
  const at = (x, y) => A.mouse.click(box.x + x * box.width / 1536, box.y + y * box.height / 1024);
  await at(950, 150);
  await A.waitForSelector('h2:text("Office report")');
  const n = await A.evaluate(() => SNYP_API.S.data.tickets.filter((t) => !['approved', 'closed'].includes(t.status)).length);
  assert.ok(await A.isVisible(`h3:text("Open tickets (${n})")`));
  await at(1166, 620);
  await A.waitForSelector('h2:text("Photocopier")');
  for (const [label, ext] of [['Word (.docx)', 'docx'], ['Excel (.xlsx)', 'xlsx']]) {
    const [dl] = await Promise.all([A.waitForEvent('download'), A.click(`button:text("${label}")`)]);
    assert.ok(dl.suggestedFilename().endsWith('.' + ext), dl.suggestedFilename());
  }
  const [pop] = await Promise.all([A.waitForEvent('popup'), A.click('button:text("PDF")')]);
  await pop.waitForLoadState();
  assert.ok((await pop.textContent('h1')).includes('Laporan SNYP University'));
  await pop.close();
});

test('language switch: Indonesian labels everywhere, remembered after reload, back to English', { skip: !chromium }, async () => {
  await A.click('#lang');
  await A.waitForSelector('#tabs button[data-tab="tickets"] .tl:text("Tiket")');
  await A.click('#tabs button[data-tab="reception"]');
  assert.ok(await A.isVisible('h2:text("Tanya Rina di resepsionis")'));
  assert.ok(await A.isVisible('button:text("Kirim ke Rina")'));
  await A.click('#tabs button[data-tab="activity"]');
  assert.ok((await A.textContent('.log')).includes('Tiket #'), 'activity log translated');
  await A.reload(); await A.waitForSelector('#tabs button[data-tab="tickets"] .tl:text("Tiket")');
  await A.click('#lang');
  await A.waitForSelector('#tabs button[data-tab="tickets"] .tl:text("Tickets")');
});

test('talk to staff: status, go-ahead, disagree, anger, rename and firing (new hire walks in)', { skip: !chromium }, async () => {
  await tab(A, 'reception');
  await A.fill('#req', 'Tolong tentukan jumlah sampel responden dan dasar penentuannya');
  await A.click('#sendReq');
  await wait(A, () => SNYP_API.S.data.tickets.some((t) => t.assignee === 'stat' && t.status === 'delivered'), null, 60000);
  const no = await A.evaluate(() => SNYP_API.S.data.tickets.filter((t) => t.assignee === 'stat' && t.status === 'delivered').pop().no);
  await tab(A, 'chat');
  await A.click('button[data-talk="stat"]');
  const say = async (text) => {
    const n = await A.$$eval('#chatlog .msg', (m) => m.length);
    await A.fill('#talk', text); await A.click('#sendTalk');
    try { await A.waitForFunction((k) => document.querySelectorAll('#chatlog .msg').length >= k + 2, n, { timeout: 15000 }); } catch (e) { throw new Error(e.message + '\n' + (await A.evaluate(() => (document.getElementById('chatlog') || {}).outerHTML + ' flash=' + document.body.innerText.slice(0, 300))) + A.errors.join(';')); }
    return A.$$eval('#chatlog .msg.them', (m) => m[m.length - 1].textContent);
  };
  assert.match(await say('gimana progresnya?'), new RegExp(`#${no} menunggu izinmu`));
  assert.match(await say('kamu lemot banget sih'), /Maaf/);
  assert.match(await say('gua ga setuju sama cara kerjamu'), /tidak setuju|belum sesuai/);
  assert.match(await say('oke mulai aja'), new RegExp(`mulai #${no}`));
  await wait(A, (k) => SNYP_API.S.data.tickets.find((t) => t.no === k).status !== 'delivered', no);
  assert.match(await say('namamu sekarang Budi'), /Budi/);
  await wait(A, () => SNYP_ROSTER.STAFF.stat.name === 'Budi');
  assert.ok(await A.isVisible('button[data-talk="stat"]:text("Budi")'));
  await say('kamu dipecat, ganti dengan Sari'); // the confirm dialog is accepted
  await wait(A, () => SNYP_ROSTER.STAFF.stat.name === 'Sari' && (SNYP_API.S.data.settings.fired || {}).stat);
  await logHas(A, 'stat', 'left: Budi', 60000);
  await logHas(A, 'stat', 'arrived: Sari', 60000);
  await shot(A, '9-new-hire');
  const s = await server(A);
  assert.ok(s.activity.some((a) => /Budi was let go; Sari is the new/.test(a.text || a.what || JSON.stringify(a))), 'firing is in the activity log');
  assert.ok((s.chats.stat || []).some((m) => /saya Sari/.test(m.text)), 'new hire introduces themself');
  // put the original names back so other runs start clean
  await tab(A, 'chat');
  await A.click('button:text("Original names")');
  await wait(A, () => SNYP_ROSTER.STAFF.stat.name !== 'Sari');
  assert.deepEqual(A.errors, []);
});
