// All changes to app data go through applyOp(). Each op touches only the records it names,
// so two open devices never overwrite each other's work (unlike a whole-state save).
const R = require('../public/js/roster.js');
const { findingKey } = require('./draftcheck');

const K = {
  v: 'snyp:v', tickets: 'snyp:tickets', meetings: 'snyp:meetings', reviews: 'snyp:reviews',
  activity: 'snyp:activity', state: 'snyp:state', settings: 'snyp:settings', chats: 'snyp:chats',
  snap: (d) => `snyp:snap:${d}`,
};
const ACTIVITY_CAP = 2000;
const SNAP_KEEP = 14;

class OpError extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }
const J = (s, d) => { if (s == null) return d; if (typeof s === 'object') return s; try { return JSON.parse(s); } catch (e) { return d; } };
const now = () => Date.now();
const str = (v, max = 20000) => String(v == null ? '' : v).slice(0, max);
const who = (a) => (R.STAFF[a] ? a : a === 'owner' ? 'you' : a);

async function readAll(store) {
  const [v, tickets, meetings, reviews, activity, state, settings, chats] = await Promise.all([
    store.get(K.v), store.hgetall(K.tickets), store.hgetall(K.meetings), store.hgetall(K.reviews),
    store.lrange(K.activity, 0, 499), store.get(K.state), store.get(K.settings), store.get(K.chats),
  ]);
  return {
    version: parseInt(v || '0', 10),
    tickets: Object.values(tickets).map((x) => J(x)).filter(Boolean).sort((a, b) => a.no - b.no),
    meetings: Object.values(meetings).map((x) => J(x)).filter(Boolean).sort((a, b) => a.createdAt - b.createdAt),
    reviews: Object.values(reviews).map((x) => J(x)).filter(Boolean).sort((a, b) => a.at - b.at),
    activity: (activity || []).map((x) => J(x)).filter(Boolean),
    state: J(state, { nextNo: 1 }),
    settings: J(settings, { nightShift: false }),
    chats: J(chats, { rina: [] }),
  };
}

async function getVersion(store) { return parseInt((await store.get(K.v)) || '0', 10); }
async function log(store, actor, text, extra = {}) {
  await store.lpush(K.activity, JSON.stringify({ at: now(), who: who(actor), text: str(text, 500), ...extra }));
  await store.ltrim(K.activity, 0, ACTIVITY_CAP - 1);
}
async function getTicket(store, id) {
  const t = J(await store.hget(K.tickets, str(id, 40)));
  if (!t) throw new OpError(`Ticket ${id} not found`, 404);
  return t;
}
const putTicket = (store, t) => store.hset(K.tickets, t.id, JSON.stringify(t));
async function getMeeting(store, id) {
  const m = J(await store.hget(K.meetings, str(id, 40)));
  if (!m) throw new OpError(`Meeting ${id} not found`, 404);
  return m;
}
const putMeeting = (store, m) => store.hset(K.meetings, m.id, JSON.stringify(m));

async function newTicket(store, actor, f) {
  const state = J(await store.get(K.state), { nextNo: 1 });
  const no = state.nextNo || 1;
  state.nextNo = no + 1;
  await store.set(K.state, JSON.stringify(state));
  const assignee = R.WORKERS.includes(f.assignee) ? f.assignee : null;
  const t = {
    id: 't' + no, no, title: str(f.title, 300) || 'Untitled request', detail: str(f.detail),
    assignee, routeReason: str(f.routeReason, 500), kind: str(f.kind || 'simple', 40),
    priority: ['high', 'normal', 'low'].includes(f.priority) ? f.priority : 'normal',
    section: str(f.section, 40), source: str(f.source || 'Request', 60), status: 'received',
    createdAt: now(), updatedAt: now(), night: !!f.night, parent: f.parent ? str(f.parent, 40) : null,
    findingKey: f.findingKey ? str(f.findingKey, 300) : undefined, result: '', comments: [], history: [{ at: now(), to: 'received', by: who(actor) }],
  };
  await putTicket(store, t);
  await log(store, actor, `Ticket #${no} created: ${t.title}`, { ticket: t.id });
  return t;
}

const OPS = {
  // ---------- tickets ----------
  'ticket.create': async (store, actor, p) => {
    if (!['owner', 'rina', 'system'].includes(actor)) throw new OpError('Only you or Rina can create tickets', 403);
    return { ticket: await newTicket(store, actor, p) };
  },
  'ticket.route': async (store, actor, p) => {
    if (!['rina', 'owner'].includes(actor)) throw new OpError('Only Rina or you can route tickets', 403);
    const t = await getTicket(store, p.id);
    if (!R.WORKERS.includes(p.assignee)) throw new OpError('Unknown staff member');
    if (t.status !== 'received' && actor !== 'owner') throw new OpError('Ticket already left reception');
    t.assignee = p.assignee; t.routeReason = str(p.reason, 500); t.updatedAt = now();
    await putTicket(store, t);
    await log(store, actor, `Ticket #${t.no} routed to ${R.STAFF[t.assignee].name}`, { ticket: t.id });
    return { ticket: t };
  },
  'ticket.transition': async (store, actor, p) => {
    const t = await getTicket(store, p.id);
    const to = str(p.to, 20);
    if (!R.STATUS[to]) throw new OpError('Unknown status ' + to);
    if (to === 'delivered' && !t.assignee) throw new OpError('Ticket has no assignee yet');
    if (!R.canTransition(t, to, actor)) throw new OpError(`${who(actor)} cannot move ticket #${t.no} from ${t.status} to ${to}`, 403);
    if (to === 'ready') { if (!String(p.result || '').trim()) throw new OpError('A result is required'); t.result = str(p.result, 60000); delete t.pendingResult; }
    if (to === 'revision' || to === 'closed') t.closeNote = str(p.note, 1000);
    const from = t.status; t.status = to; t.updatedAt = now();
    t.history = [...(t.history || []), { at: now(), from, to, by: who(actor), note: p.note ? str(p.note, 500) : undefined }].slice(-50);
    await putTicket(store, t);
    const verb = { delivered: 'delivered to', authorized: 'authorized for', working: 'started by', ready: 'result ready from', approved: 'approved, by', revision: 'sent back to', closed: 'closed' }[to];
    await log(store, actor, `Ticket #${t.no} ${verb}${to === 'closed' ? '' : ' ' + (R.STAFF[t.assignee] || {}).name}${p.note ? ' — ' + str(p.note, 200) : ''}`, { ticket: t.id });
    return { ticket: t };
  },
  'ticket.edit': async (store, actor, p) => {
    if (actor !== 'owner') throw new OpError('Only you can edit tickets', 403);
    const t = await getTicket(store, p.id);
    for (const f of ['title', 'detail', 'section']) if (p[f] != null) t[f] = str(p[f]);
    if (p.priority && ['high', 'normal', 'low'].includes(p.priority)) t.priority = p.priority;
    if (p.night != null) t.night = !!p.night;
    if (p.assignee && R.WORKERS.includes(p.assignee)) t.assignee = p.assignee;
    t.updatedAt = now(); await putTicket(store, t);
    await log(store, actor, `Ticket #${t.no} edited`, { ticket: t.id });
    return { ticket: t };
  },
  // You hand a finished result to the staff member (e.g. text written with Claude in chat, when the AI is off).
  // The staff member then prints it and marks the ticket ready for your approval.
  'ticket.handoff': async (store, actor, p) => {
    if (actor !== 'owner') throw new OpError('Only you can hand over a result', 403);
    const t = await getTicket(store, p.id);
    if (t.status !== 'working') throw new OpError('Ticket is not being worked on');
    t.pendingResult = str(p.result, 60000);
    if (!t.pendingResult.trim()) throw new OpError('Empty result');
    t.updatedAt = now(); await putTicket(store, t);
    await log(store, actor, `Result material handed to ${R.STAFF[t.assignee].name} for #${t.no}`, { ticket: t.id });
    return { ticket: t };
  },
  'ticket.comment': async (store, actor, p) => {
    const t = await getTicket(store, p.id);
    const c = { at: now(), who: who(actor), kind: str(p.kind || 'note', 20), text: str(p.text, 4000) };
    if (!c.text.trim()) throw new OpError('Empty comment');
    t.comments = [...(t.comments || []), c].slice(-100); t.updatedAt = now();
    await putTicket(store, t);
    await log(store, actor, `${c.kind === 'supervision' ? 'Supervision note' : 'Note'} on #${t.no}: ${c.text.slice(0, 120)}`, { ticket: t.id });
    return { ticket: t };
  },

  // ---------- meetings ----------
  'meeting.create': async (store, actor, p) => {
    if (actor !== 'owner') throw new OpError('Only you can call a meeting', 403);
    const all = Object.values(await store.hgetall(K.meetings)).map((x) => J(x)).filter(Boolean);
    if (all.some((m) => m.status !== 'ended')) throw new OpError('A meeting is already running');
    const m = { id: 'm' + now().toString(36), topic: str(p.topic, 300) || 'General meeting', agenda: str(p.agenda, 4000), status: 'called', createdAt: now(), contributions: [], minutes: '', actions: [], attendees: ['owner', ...Object.keys(R.STAFF)] };
    await putMeeting(store, m);
    await log(store, actor, `Meeting called on the rooftop: ${m.topic}`, { meeting: m.id });
    return { meeting: m };
  },
  'meeting.transition': async (store, actor, p) => {
    const m = await getMeeting(store, p.id);
    const order = R.MEETING_STATUS; const to = str(p.to, 20);
    const ok = (order.indexOf(to) === order.indexOf(m.status) + 1) || (to === 'ended' && actor === 'owner');
    if (!ok) throw new OpError(`Meeting cannot go from ${m.status} to ${to}`);
    if (to === 'ended' && m.status !== 'minutes' && actor !== 'owner') throw new OpError('Only you can end a meeting early', 403);
    m.status = to; m[to + 'At'] = now(); await putMeeting(store, m);
    const label = { gathering: 'Staff are heading to the rooftop', in_session: 'Meeting in session', minutes: 'Nadia is writing the minutes', ended: 'Meeting ended, staff return to their desks' }[to];
    await log(store, actor, `${label}: ${m.topic}`, { meeting: m.id });
    return { meeting: m };
  },
  'meeting.contribute': async (store, actor, p) => {
    const m = await getMeeting(store, p.id);
    if (m.status !== 'in_session') throw new OpError('Meeting is not in session');
    const c = { at: now(), who: actor, text: str(p.text, 4000) };
    if (!c.text.trim()) throw new OpError('Empty contribution');
    m.contributions.push(c); await putMeeting(store, m);
    return { meeting: m };
  },
  'meeting.minutes': async (store, actor, p) => {
    if (!['nadia', 'owner'].includes(actor)) throw new OpError('Only Nadia (or you) records minutes', 403);
    const m = await getMeeting(store, p.id);
    if (!['in_session', 'minutes'].includes(m.status)) throw new OpError('Meeting is not in session');
    m.minutes = str(p.minutes, 30000);
    m.actions = (Array.isArray(p.actions) ? p.actions : []).slice(0, 30).map((a, i) => ({
      idx: i, text: str(a.text, 500), assignee: R.WORKERS.includes(a.assignee) ? a.assignee : null, ticket: (m.actions[i] && m.actions[i].ticket) || null,
    }));
    await putMeeting(store, m);
    await log(store, actor, `Minutes recorded for "${m.topic}" with ${m.actions.length} action item(s)`, { meeting: m.id });
    return { meeting: m };
  },
  'meeting.actionToTicket': async (store, actor, p) => {
    if (actor !== 'owner') throw new OpError('Only you can turn action items into tickets', 403);
    const m = await getMeeting(store, p.id);
    const a = m.actions[p.index];
    if (!a) throw new OpError('Action item not found', 404);
    if (a.ticket) throw new OpError('This action item is already a ticket');
    const t = await newTicket(store, actor, { title: a.text, detail: `Action item from meeting "${m.topic}".`, assignee: a.assignee, source: 'Meeting', routeReason: a.assignee ? 'Assigned in the meeting.' : '' });
    a.ticket = t.id; await putMeeting(store, m);
    return { meeting: m, ticket: t };
  },

  // ---------- reviews, chat, settings ----------
  'review.add': async (store, actor, p) => {
    const r = { id: 'r' + now().toString(36) + Math.random().toString(36).slice(2, 5), at: now(), who: who(actor), file: str(p.file, 300), ticket: p.ticket ? str(p.ticket, 40) : null, verdict: str(p.verdict, 40), text: str(p.text, 20000) };
    await store.hset(K.reviews, r.id, JSON.stringify(r));
    await log(store, actor, `Review added${r.file ? ' for ' + r.file : ''}`);
    return { review: r };
  },
  'chat.add': async (store, actor, p) => {
    const chats = J(await store.get(K.chats), { rina: [] });
    const ch = str(p.channel || 'rina', 20);
    chats[ch] = [...(chats[ch] || []), { at: now(), who: who(actor), text: str(p.text, 4000) }].slice(-300);
    await store.set(K.chats, JSON.stringify(chats));
    return {};
  },
  'settings.set': async (store, actor, p) => {
    if (actor !== 'owner') throw new OpError('Only you can change settings', 403);
    const allowed = ['nightShift', 'names', 'pollSeconds', 'officeTitle'];
    if (!allowed.includes(p.key)) throw new OpError('Unknown setting');
    const s = J(await store.get(K.settings), { nightShift: false });
    s[p.key] = p.value; await store.set(K.settings, JSON.stringify(s));
    await log(store, actor, `Setting changed: ${p.key} = ${JSON.stringify(p.value).slice(0, 80)}`);
    return { settings: s };
  },

  // ---------- automatic draft check ----------
  // Creates one ticket per NEW finding. A finding already covered by an unclosed ticket is skipped,
  // which prevents the duplicate tickets (#3/#4) the old app produced.
  'draftcheck.record': async (store, actor, p) => {
    const state = J(await store.get(K.state), { nextNo: 1 });
    const tickets = Object.values(await store.hgetall(K.tickets)).map((x) => J(x)).filter(Boolean);
    const open = new Set(tickets.filter((t) => t.status !== 'closed').map((t) => t.findingKey || findingKey(t.title)));
    const created = [];
    for (const f of (Array.isArray(p.findings) ? p.findings : []).slice(0, 50)) {
      const key = str(f.key || f.title, 300);
      if (open.has(key)) continue;
      open.add(key);
      created.push(await newTicket(store, 'system', { title: f.title, detail: f.detail, assignee: f.assignee, priority: f.priority || 'high', section: f.section, source: 'Draft check', findingKey: key, kind: 'simple' }));
    }
    const s2 = J(await store.get(K.state), state);
    Object.assign(s2, { lastCheckedAt: now(), lastCheckedFile: str(p.file, 300), lastCheckedRevision: str(p.revision, 64) });
    await store.set(K.state, JSON.stringify(s2));
    await log(store, actor, `Checked ${s2.lastCheckedFile}: ${(p.findings || []).length} findings${created.length ? ', ' + created.length + ' new tickets' : ''}`);
    return { created };
  },
};

async function applyOp(store, op, actor, payload) {
  if (!OPS[op]) throw new OpError('Unknown operation ' + op);
  if (!R.ACTORS.includes(actor)) throw new OpError('Unknown actor ' + actor);
  const out = await OPS[op](store, actor, payload || {});
  out.version = await store.incr(K.v);
  await maybeSnapshot(store);
  return out;
}

// ---------- export / import / snapshots ----------
async function buildExport(store) {
  const s = await readAll(store);
  return {
    app: 'SNYP University', schemaVersion: 2, exportedAt: new Date().toISOString(),
    state: s.state, settings: s.settings,
    activity: (await store.lrange(K.activity, 0, ACTIVITY_CAP - 1)).map((x) => J(x)).filter(Boolean).reverse(),
    tickets: s.tickets, meetings: s.meetings, reviews: s.reviews, chats: s.chats,
  };
}

function validateImport(d) {
  if (!d || typeof d !== 'object') throw new OpError('Backup is not a JSON object');
  if (d.app !== 'SNYP University') throw new OpError('This file is not a SNYP University backup (app field missing)');
  if (!Array.isArray(d.tickets)) throw new OpError('Backup has no tickets list');
  for (const t of d.tickets) if (!t || !t.id || typeof t.no !== 'number') throw new OpError('A ticket in the backup has no id or number');
}

async function importData(store, d, actor = 'owner') {
  validateImport(d);
  const before = await buildExport(store);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await store.set(K.snap('before-import-' + stamp), JSON.stringify(before));
  for (const k of [K.tickets, K.meetings, K.reviews, K.activity]) await store.del(k);
  const legacy = { open: 'delivered', done: 'approved', in_progress: 'working', review: 'ready' };
  for (const t0 of d.tickets) {
    const t = { comments: [], history: [], result: '', ...t0 };
    if (!R.STATUS[t.status]) { t.legacyStatus = t.status; t.status = legacy[t.status] || 'delivered'; }
    if (t.status !== 'received' && !t.assignee) t.status = 'received';
    t.updatedAt = t.updatedAt || t.createdAt || now();
    await putTicket(store, t);
  }
  for (const m of d.meetings || []) if (m && m.id) await putMeeting(store, { contributions: [], actions: [], ...m });
  for (const r of d.reviews || []) if (r && r.id) await store.hset(K.reviews, r.id, JSON.stringify(r));
  const acts = (d.activity || []).slice(-ACTIVITY_CAP); // oldest first in the file
  for (const a of acts) await store.lpush(K.activity, JSON.stringify(a));
  const maxNo = Math.max(0, ...d.tickets.map((t) => t.no));
  const state = { ...(d.state || {}), nextNo: Math.max((d.state && d.state.nextNo) || 1, maxNo + 1) };
  await store.set(K.state, JSON.stringify(state));
  await store.set(K.settings, JSON.stringify({ nightShift: false, ...(d.settings || {}) }));
  await store.set(K.chats, JSON.stringify(d.chats || { rina: [] }));
  await log(store, actor, `Restored from backup exported ${d.exportedAt || 'unknown date'} (${d.tickets.length} tickets). Previous data saved as a snapshot.`);
  const version = await store.incr(K.v);
  return { version, tickets: d.tickets.length, snapshot: 'before-import-' + stamp };
}

async function maybeSnapshot(store) {
  const day = new Date().toISOString().slice(0, 10);
  if (await store.get(K.snap(day))) return;
  await store.set(K.snap(day), JSON.stringify(await buildExport(store)));
  const daily = (await store.keys('snyp:snap:20*')).sort();
  for (const k of daily.slice(0, Math.max(0, daily.length - SNAP_KEEP))) await store.del(k);
}
async function listSnapshots(store) { return (await store.keys('snyp:snap:*')).map((k) => k.slice('snyp:snap:'.length)).sort().reverse(); }
async function getSnapshot(store, name) { return J(await store.get(K.snap(str(name, 80)))); }

module.exports = { applyOp, readAll, getVersion, buildExport, importData, listSnapshots, getSnapshot, OpError, K };
