// Behaviour engine. Every movement comes from real ticket and meeting states:
// Rina analyses and delivers tickets, staff start only after your go-ahead, the Director inspects desks,
// and a meeting pulls everyone to the rooftop. Only the "leader" device sends state changes; other open
// devices replay the same behaviour and wait for the leader's changes to arrive.
(function () {
  const T = (en, id) => (window.SNYP_I18N ? window.SNYP_I18N.L(en, id) : en);
  const Wd = window.SNYP_WORLD, R = window.SNYP_ROSTER, API = window.SNYP_API;
  const params = new URLSearchParams(location.search);
  const SPEED = Math.max(1, Math.min(120, parseFloat(params.get('speed') || '1')));
  const MIN = 60000 / SPEED;
  const LIMITS = { waiting: 15 * MIN, stuck: 45 * MIN, ready: 15 * MIN, reception: 5 * MIN };
  const WALK = 2.6 * Math.min(SPEED, 6);      // tiles per second
  const STAIR_TIME = 1800 / Math.min(SPEED, 6); // ms per flight
  const ms = (x) => x / SPEED;

  const log = [];                                // event trace (used by tests and the activity ticker)
  const ev = (who, what) => { log.push({ t: Date.now(), who, what }); if (log.length > 500) log.shift(); };

  const chars = {};
  function makeChar(id) {
    const home = Wd.SPOTS[Wd.HOME[id]] || Wd.SPOTS.seat_owner;
    return { id, f: home.f, x: home.x, y: home.y, z: home.f, path: [], job: null, jobName: '', wait: null, pose: 'stand', bubble: null, carrying: null, facing: 1, stairT: 0, visible: id !== 'owner' };
  }
  for (const id of Object.keys(R.STAFF)) chars[id] = makeChar(id);
  chars.owner = makeChar('owner');
  Object.assign(chars.owner, { ...Wd.SPOTS.stairs2, z: 2 });

  const state = () => (API.S.data || { tickets: [], meetings: [], settings: {}, state: {} });
  const ticket = (id) => state().tickets.find((t) => t.id === id);
  const activeMeeting = () => state().meetings.find((m) => m.status !== 'ended');
  const nightOn = () => !!state().settings.nightShift;
  const say = (c, text, dur = 4000) => { c.bubble = { text, until: performance.now() + Math.max(1500, dur / Math.min(SPEED, 3)) }; };

  // ---------- job helpers (generators yield wait conditions) ----------
  function* go(c, spot) {
    const to = typeof spot === 'string' ? Wd.SPOTS[spot] : spot;
    if (!to) return;
    const here = { f: c.f, x: Math.round(c.x), y: Math.round(c.y) };
    if (here.f === to.f && here.x === to.x && here.y === to.y) return;
    const r = Wd.route(here, to);
    if (!r) { Object.assign(c, { f: to.f, z: to.f, x: to.x, y: to.y }); return; }
    c.path = r;
    yield { until: () => c.path.length === 0 };
    if (typeof spot === 'string') ev(c.id, 'arrived ' + spot);
  }
  const sleep = (t) => ({ sleep: ms(t) });
  // Leader sends the op; other devices wait (max 40 s) until the leader's change shows up in the data.
  function* act(name, actor, payload, confirm) {
    if (API.S.leader) {
      let res, err;
      yield { promise: API.op(name, actor, payload).then((r) => { res = r; }, (e) => { err = e; }) };
      if (err) { console.warn('op failed', name, err.message); ev(actor, 'op failed ' + name + ': ' + err.message); return null; }
      ev(actor, 'op ' + name + (payload && payload.to ? ' ' + payload.to : ''));
      return res;
    }
    yield { until: confirm, timeout: 40000 };
    return null;
  }
  function* aiOrNull(body) {
    if (!API.S.ai || !API.S.leader) return null;
    let out = null;
    yield { promise: API.ai(body).then((r) => { out = r; }, (e) => { console.warn('AI unavailable', e.message); }) };
    return out;
  }

  // ---------- planners ----------
  const meetingJob = (c) => ({
    name: 'meeting', valid: () => !!activeMeeting(),
    *run() {
      if (c.id !== 'owner') say(c, T('Meeting called. Heading up to the rooftop.', 'Ada rapat. Naik ke rooftop.'), 2500);
      c.pose = 'stand';
      yield* go(c, 'seat_' + c.id);
      c.pose = 'sit'; ev(c.id, 'seated');
      yield { until: () => !activeMeeting() };
    },
  });
  const homeJob = (c) => ({
    name: 'home', valid: () => !activeMeeting(),
    *run() {
      if (c.id === 'owner') { yield* go(c, 'stairs2'); c.visible = false; return; }
      c.pose = 'stand'; yield* go(c, Wd.HOME[c.id]);
      c.pose = c.id === 'rina' ? 'stand' : 'sit';
    },
  });

  function planRina(c) {
    const rec = state().tickets.filter((t) => t.status === 'received').sort((a, b) => a.no - b.no);
    const t = rec.find((x) => !x.assignee) || rec[0];
    if (!t) return null;
    if (!t.assignee) return {
      name: 'analyze #' + t.no, valid: () => !activeMeeting() && !!ticket(t.id),
      *run() {
        yield* go(c, 'reception'); c.pose = 'stand';
        if (ticket(t.id).status !== 'received' || ticket(t.id).assignee) return;
        say(c, T(`New request #${t.no}. Let me read it…`, `Permintaan baru #${t.no}. Saya baca dulu…`), 3000);
        yield sleep(2500);
        let route = R.routeRequest(t.title + ' ' + t.detail);
        const ai = yield* aiOrNull({ task: 'route', text: t.title + '\n' + t.detail });
        if (ai && R.WORKERS.includes(ai.assignee)) route = { assignee: ai.assignee, reason: ai.reason || 'AI routing' };
        yield* act('ticket.route', 'rina', { id: t.id, assignee: route.assignee, reason: route.reason }, () => (ticket(t.id) || {}).assignee);
        const a = (ticket(t.id) || {}).assignee || route.assignee;
        say(c, T(`#${t.no} is for ${R.STAFF[a].name}. I'll take it up.`, `#${t.no} untuk ${R.STAFF[a].name}. Saya antar ke atas.`), 3000);
        ev('rina', `routed #${t.no} to ${a}`);
      },
    };
    return {
      name: 'deliver #' + t.no, valid: () => !activeMeeting() && !!ticket(t.id),
      *run() {
        if (c.carrying !== t.id) { yield* go(c, 'reception'); c.carrying = t.id; ev('rina', 'picked up #' + t.no); }
        c.pose = 'stand';
        const to = ticket(t.id).assignee;
        yield* go(c, 'front_' + to);
        if (ticket(t.id).status !== 'received') { c.carrying = null; return; }
        say(c, T(`Ticket #${t.no} for you, ${R.STAFF[to].name}.`, `Tiket #${t.no} untukmu, ${R.STAFF[to].name}.`), 3500);
        yield sleep(1200);
        yield* act('ticket.transition', 'rina', { id: t.id, to: 'delivered' }, () => (ticket(t.id) || {}).status !== 'received');
        c.carrying = null; ev('rina', `delivered #${t.no} to ${to}`);
        if (chars[to]) say(chars[to], T(`Got #${t.no}. I'll start once you give the go-ahead.`, `#${t.no} diterima. Saya mulai setelah kamu beri izin.`), 4000);
        yield sleep(1500);
        yield* go(c, 'reception');
      },
    };
  }

  const TRIP = { lib: 'shelf', metod: 'shelf', stat: 'printer', nadia: 'printer' };
  function planStaff(c) {
    const mine = state().tickets.filter((t) => t.assignee === c.id).sort((a, b) => (a.priority === 'high' ? -1 : 0) - (b.priority === 'high' ? -1 : 0) || a.no - b.no);
    const canWork = (t) => !t.night || nightOn();
    const start = mine.find((t) => (t.status === 'authorized' || t.status === 'revision') && canWork(t));
    if (start) return {
      name: 'start #' + start.no, valid: () => !activeMeeting() && !!ticket(start.id),
      *run() {
        c.pose = 'stand'; yield* go(c, Wd.HOME[c.id]); c.pose = 'sit';
        if (!['authorized', 'revision'].includes(ticket(start.id).status)) return;
        say(c, start.status === 'revision' ? T(`Revising #${start.no}.`, `Merevisi #${start.no}.`) : T(`Go-ahead received. Starting #${start.no}.`, `Izin diterima. Mulai #${start.no}.`), 3000);
        yield sleep(1500);
        yield* act('ticket.transition', c.id, { id: start.id, to: 'working' }, () => (ticket(start.id) || {}).status === 'working');
      },
    };
    const work = mine.find((t) => t.status === 'working');
    if (work) return {
      name: 'work #' + work.no, valid: () => !activeMeeting() && !!ticket(work.id),
      *run() {
        c.pose = 'stand'; yield* go(c, Wd.HOME[c.id]); c.pose = 'work';
        let result = null, lastTrip = performance.now(), asked = false, nudged = 0;
        while (!result) {
          const t = ticket(work.id); if (!t || t.status !== 'working') return;
          if (t.pendingResult) { result = t.pendingResult; break; }
          if (API.S.ai && API.S.leader && !asked) {
            asked = true; say(c, T(`Working on #${t.no}…`, `Mengerjakan #${t.no}…`), 3000);
            const out = yield* aiOrNull({ task: 'work', ticketId: t.id });
            if (out && out.result) { result = out.result; break; }
          }
          if (!API.S.ai && performance.now() - nudged > ms(90000)) { nudged = performance.now(); say(c, T(`Working on #${t.no}. The AI is off, so hand me the result text in the Tickets tab when it's ready.`, `Mengerjakan #${t.no}. AI mati, jadi serahkan teks hasilnya di tab Tiket kalau sudah siap.`), 6000); }
          if (performance.now() - lastTrip > ms(40000)) {
            lastTrip = performance.now(); c.pose = 'stand';
            yield* go(c, TRIP[c.id]); say(c, TRIP[c.id] === 'shelf' ? T('Checking the journal shelf…', 'Cek rak jurnal…') : T('Printing working notes…', 'Mencetak catatan kerja…'), 2500); yield sleep(2500);
            yield* go(c, Wd.HOME[c.id]); c.pose = 'work';
          }
          yield sleep(1000);
        }
        c.pose = 'stand'; yield* go(c, 'printer'); say(c, T(`Printing the result for #${work.no}.`, `Mencetak hasil #${work.no}.`), 2500); yield sleep(2000);
        c.carrying = work.id; yield* go(c, Wd.HOME[c.id]); c.carrying = null; c.pose = 'sit';
        if (ticket(work.id).status !== 'working') return;
        yield* act('ticket.transition', c.id, { id: work.id, to: 'ready', result }, () => (ticket(work.id) || {}).status !== 'working');
        say(c, T(`#${work.no} is ready for your approval.`, `#${work.no} siap kamu setujui.`), 4000);
      },
    };
    return null;
  }

  const DESKS = ['nadia', 'stat', 'metod', 'lib', 'rina'];
  function issuesFor(personId) {
    const s = state(), now = Date.now(), out = [];
    const age = (t) => now - (t.updatedAt || t.createdAt || now);
    const mins = (t) => Math.round(age(t) / 60000);
    for (const t of s.tickets.filter((x) => x.status !== 'closed' && (personId === 'rina' ? x.status === 'received' : x.assignee === personId))) {
      if (t.status === 'delivered' && age(t) > LIMITS.waiting) out.push({ t, tag: 'waiting-owner', text: `#${t.no} has waited ${mins(t)} min for your go-ahead.` });
      if (t.status === 'working' && !t.pendingResult && age(t) > LIMITS.stuck) out.push({ t, tag: 'stuck', text: `#${t.no} has been in progress for ${mins(t)} min with no result. It may need material from you.` });
      if (t.status === 'ready' && age(t) > LIMITS.ready) out.push({ t, tag: 'ready-waiting', text: `#${t.no} has a result waiting ${mins(t)} min for your approval.` });
      if (t.status === 'received' && age(t) > LIMITS.reception) out.push({ t, tag: 'reception-backlog', text: `#${t.no} is still at reception after ${mins(t)} min.` });
    }
    if (personId !== 'rina') {
      const open = s.tickets.filter((x) => x.assignee === personId && !['closed', 'approved'].includes(x.status));
      const seen = {};
      for (const t of open) { const k = (t.findingKey || t.title).toLowerCase(); if (seen[k]) out.push({ t, tag: 'duplicate', text: `#${seen[k].no} and #${t.no} look like duplicates. Only you can close one.` }); else seen[k] = t; }
    }
    return out;
  }
  const alreadyNoted = (t, tag) => (t.comments || []).some((c) => c.kind === 'supervision' && c.tag === tag) || (t.comments || []).some((c) => c.kind === 'supervision' && c.text.startsWith('[' + tag + ']'));
  function planDirector(c) {
    return {
      name: 'patrol', valid: () => !activeMeeting(),
      *run() {
        c.pose = 'stand';
        for (const who of DESKS) {
          yield* go(c, who === 'rina' ? 'counter' : 'front_' + who);
          const issues = issuesFor(who);
          const name = R.STAFF[who].name;
          ev('director', 'inspected ' + who);
          if (!issues.length) say(c, `${name}: ${who === 'rina' ? T('reception is clear', 'resepsionis aman') : T('work is on track', 'pekerjaan sesuai jalur')}.`, 2500);
          else say(c, `${name}: ${issues[0].text}`, 4500);
          for (const i of issues) {
            if (alreadyNoted(i.t, i.tag)) continue;
            yield* act('ticket.comment', 'director', { id: i.t.id, kind: 'supervision', text: `[${i.tag}] ${i.text}` }, () => alreadyNoted(ticket(i.t.id) || { comments: [] }, i.tag));
          }
          yield sleep(issues.length ? 4000 : 2500);
        }
        yield* go(c, 'desk_director'); c.pose = 'sit';
        yield sleep(30000);
      },
    };
  }

  // ---------- meeting driver (leader only sends ops) ----------
  const ORDER = ['director', 'stat', 'metod', 'lib', 'rina', 'nadia'];
  let meetBusy = false;
  function templateContribution(who, m) {
    const s = state(), open = s.tickets.filter((t) => !['closed', 'approved'].includes(t.status));
    const by = (st) => open.filter((t) => t.status === st);
    if (who === 'director') return `Overview: ${open.length} open tickets. ${by('delivered').length} waiting for your go-ahead, ${by('working').length} in progress, ${by('ready').length} ready for your approval. ${by('delivered').length ? 'The main blocker is decisions on your side.' : 'No blockers on your side right now.'}`;
    if (who === 'rina') return by('received').length ? `Reception has ${by('received').length} request(s) still to deliver.` : 'Reception is clear. Every request has been delivered.';
    if (who === 'nadia') return `I am recording the minutes for "${m.topic}". Say "Action: …" in the discussion and I will list it as an action item.`;
    const mine = open.filter((t) => t.assignee === who);
    if (!mine.length) return `No open tickets for me. I can help with ${R.STAFF[who].skills.slice(0, 3).join(', ')}.`;
    return `${mine.map((t) => `#${t.no} ${R.STATUS[t.status].toLowerCase()}`).join('; ')}. ${mine.some((t) => t.status === 'delivered') ? 'I need your go-ahead to start.' : 'Work continues after the meeting.'}`;
  }
  function templateMinutes(m) {
    const name = (w) => (w === 'owner' ? 'You' : R.STAFF[w].name);
    const actions = [];
    for (const c of m.contributions.filter((x) => x.who === 'owner')) {
      for (const line of c.text.split(/\n|;/)) {
        const mm = line.match(/^\s*(?:action|tindak lanjut|todo)\s*:\s*(.+)$/i);
        if (mm) { const at = mm[1].match(/@(nadia|stat|metod|lib)\b/); actions.push({ text: mm[1].replace(/@\w+/, '').trim(), assignee: at ? at[1] : R.routeRequest(mm[1]).assignee }); }
      }
    }
    return {
      minutes: `Minutes: ${m.topic}\nDate: ${new Date().toLocaleString()}\nPresent: You, ${ORDER.map(name).join(', ')}\n\nDiscussion:\n${m.contributions.map((c) => `- ${name(c.who)}: ${c.text}`).join('\n')}\n\nAction items: ${actions.length ? actions.length : 'none new. Existing tickets continue.'}`,
      actions,
    };
  }
  function driveMeeting() {
    const m = activeMeeting();
    if (!m || meetBusy || !API.S.leader) return;
    const run = (p) => { meetBusy = true; p.catch((e) => console.warn(e)).finally(() => setTimeout(() => { meetBusy = false; }, ms(1500))); };
    const seated = () => ['owner', ...ORDER].every((id) => { const c = chars[id], s = Wd.SPOTS['seat_' + id]; return c.f === 2 && !c.path.length && Math.round(c.x) === s.x && Math.round(c.y) === s.y; });
    if (m.status === 'called') return run(API.op('meeting.transition', 'system', { id: m.id, to: 'gathering' }));
    if (m.status === 'gathering' && seated()) return run(API.op('meeting.transition', 'system', { id: m.id, to: 'in_session' }).then(() => ev('system', 'all seated')));
    if (m.status === 'in_session') {
      const next = ORDER.find((w) => !m.contributions.some((c) => c.who === w));
      if (!next) return;
      return run((async () => {
        let text = null;
        if (API.S.ai) { try { text = (await API.ai({ task: 'meeting', meetingId: m.id, who: next })).text; } catch (e) { text = null; } }
        await API.op('meeting.contribute', next, { id: m.id, text: text || templateContribution(next, m) });
        await new Promise((r) => setTimeout(r, ms(3500)));
      })());
    }
    if (m.status === 'minutes' && !m.minutes) {
      return run((async () => {
        chars.nadia.pose = 'work'; say(chars.nadia, T('Writing the minutes…', 'Menulis notulen…'), 3000);
        await new Promise((r) => setTimeout(r, ms(2500)));
        let out = null;
        if (API.S.ai) { try { out = await API.ai({ task: 'minutes', meetingId: m.id }); } catch (e) { out = null; } }
        if (!out || typeof out.minutes !== 'string') out = templateMinutes(m);
        await API.op('meeting.minutes', 'nadia', { id: m.id, minutes: out.minutes, actions: out.actions || [] });
        chars.nadia.pose = 'sit'; say(chars.nadia, T('Minutes are recorded. Action items can become tickets.', 'Notulen tercatat. Action item bisa dijadikan tiket.'), 4000);
      })());
    }
  }

  // Show each new meeting contribution as a speech bubble, on every device.
  const seenTalk = new Set();
  function bubblesFromMeeting() {
    const m = activeMeeting(); if (!m) return;
    for (const c of m.contributions) {
      const k = m.id + c.at + c.who;
      if (seenTalk.has(k)) continue; seenTalk.add(k);
      if (chars[c.who]) { for (const o of Object.values(chars)) o.bubble = null; say(chars[c.who], c.text, 7000); ev(c.who, 'spoke'); }
    }
  }

  // ---------- staff replaced ("kamu dipecat"): the old one walks out, the new one walks in ----------
  const seenFired = {};
  let firedPrimed = false;
  function rehireDue(c) {
    const f = ((state().settings || {}).fired || {})[c.id];
    if (!firedPrimed) { // ignore old firings when the page opens, unless they just happened
      firedPrimed = true;
      for (const [k, v] of Object.entries((state().settings || {}).fired || {})) if (v && Date.now() - Number(v.at) > 120000) seenFired[k] = v.at;
    }
    if (!f || !f.at || seenFired[c.id] === f.at) return null;
    seenFired[c.id] = f.at;
    return f;
  }
  const firedPending = (c) => { const f = ((state().settings || {}).fired || {})[c.id]; return !!(firedPrimed && f && f.at && seenFired[c.id] !== f.at); };
  const rehireJob = (c, f) => ({
    name: 'rehire', valid: () => !activeMeeting(),
    *run() {
      c.nameOverride = f.oldName || null; c.pose = 'stand';
      yield { sleep: 2500 };
      say(c, T('Goodbye, everyone…', 'Pamit dulu ya, semuanya…'), 3000);
      yield* go(c, 'door');
      c.visible = false; ev(c.id, 'left: ' + (f.oldName || ''));
      yield { sleep: 1800 };
      c.nameOverride = null; c.visible = true; ev(c.id, 'arrived: ' + (f.newName || R.STAFF[c.id].name));
      say(c, c.afterHire || T(`Hi, I'm ${R.STAFF[c.id].name}, the new one here.`, `Halo, saya ${R.STAFF[c.id].name}, staf baru di sini.`), 6000);
      c.afterHire = null;
      yield { sleep: 2000 };
      yield* go(c, Wd.HOME[c.id]);
      c.pose = c.id === 'rina' ? 'stand' : 'sit';
    },
  });

  function plan(c) {
    if (activeMeeting()) return meetingJob(c);
    if (c.id !== 'owner' && R.STAFF[c.id]) { const f = rehireDue(c); if (f) return rehireJob(c, f); }
    if (c.id === 'owner') return c.visible ? homeJob(c) : null;
    let j = c.id === 'rina' ? planRina(c) : c.id === 'director' ? planDirector(c) : planStaff(c);
    if (j) return j;
    const home = Wd.SPOTS[Wd.HOME[c.id]];
    if (c.f !== home.f || Math.round(c.x) !== home.x || Math.round(c.y) !== home.y) return homeJob(c);
    return null;
  }

  // ---------- main loop ----------
  function stepJob(c, now) {
    if (c.job && c.jobName !== 'rehire' && c.jobName !== 'meeting' && firedPending(c)) { c.job = null; c.wait = null; c.path = []; }
    if (c.job && !c.job.valid()) { if (c.jobName === 'rehire') { c.nameOverride = null; c.visible = true; } c.job = null; c.wait = null; }
    if (!c.job) {
      if (c.id === 'owner' && activeMeeting() && !c.visible) { Object.assign(c, { ...Wd.SPOTS.stairs2, z: 2, visible: true, path: [] }); }
      const j = plan(c);
      if (!j) {
        c.jobName = '';
        if (c.id !== 'owner' && c.id !== 'rina' && !c.path.length) {
          const mine = state().tickets.filter((t) => t.assignee === c.id);
          c.pose = mine.some((t) => t.status === 'ready') ? 'ready' : mine.some((t) => t.status === 'delivered') ? 'waiting' : mine.some((t) => t.status === 'authorized' && t.night && !nightOn()) ? 'night-wait' : 'sit';
        }
        return;
      }
      c.job = j; c.jobName = j.name; c.gen = j.run(); c.wait = null; ev(c.id, 'job ' + j.name);
    }
    for (let guard = 0; guard < 20; guard++) {
      const w = c.wait;
      if (w) {
        if (w.sleep != null) { if (!w.started) w.started = now; if (now - w.started < w.sleep) return; }
        else if (w.until) { if (!w.started) w.started = now; if (!w.until() && !(w.timeout && now - w.started > w.timeout)) return; }
        else if (w.promise) { if (!w.done) { if (!w.hooked) { w.hooked = true; w.promise.then(() => { w.done = true; }, () => { w.done = true; }); } return; } }
      }
      const r = c.gen.next();
      if (r.done) { c.job = null; c.gen = null; c.wait = null; return; }
      c.wait = r.value || null;
    }
  }

  function move(c, dt) {
    if (!c.path.length) { c.walking = false; return; }
    const n = c.path[0];
    if (n.stairs) { // fade out at this staircase, fade in at the one on the next floor
      c.walking = true; c.onStairs = true;
      const from = c.f; c.stairT = (c.stairT || 0) + dt / STAIR_TIME;
      c.alpha = Math.abs(1 - 2 * Math.min(1, c.stairT));
      if (c.stairT >= 0.5 && c.f === from && !c.switched) { c.switched = true; c.f = n.f; c.z = n.f; c.x = n.x; c.y = n.y; ev(c.id, `stairs ${from}->${n.f}`); }
      if (c.stairT >= 1) { c.stairT = 0; c.alpha = 1; c.onStairs = false; c.switched = false; c.path.shift(); }
      return;
    }
    c.walking = true; c.z = c.f;
    const dx = n.x - c.x, dy = n.y - c.y, d = Math.hypot(dx, dy), stepLen = WALK * Wd.UNIT * dt / 1000;
    if (Math.abs(dx) > 0.5) c.facing = dx >= 0 ? 1 : -1;
    if (d <= stepLen) { c.x = n.x; c.y = n.y; c.path.shift(); } else { c.x += dx / d * stepLen; c.y += dy / d * stepLen; }
  }

  let last = performance.now();
  function tick() {
    const now = performance.now(), dt = Math.min(100, now - last); last = now;
    if (API.S.data) {
      bubblesFromMeeting();
      for (const c of Object.values(chars)) { stepJob(c, now); move(c, dt); if (c.bubble && c.bubble.until < now) c.bubble = null; }
      driveMeeting();
    }
  }
  setInterval(tick, 50);

  // Talking to a staff member: show their answer as a bubble with a mood for a few seconds.
  function speak(id, text, mood) {
    const c = chars[id]; if (!c || !text) return;
    say(c, text, Math.min(12000, 3000 + text.length * 60));
    c.mood = mood ? { m: mood, until: performance.now() + 9000 } : null;
    ev(id, 'talk ' + (mood || ''));
  }
  // What the new hire says when they walk in (falls back to a plain bubble if no walk-in happens).
  function later(id, text) {
    const c = chars[id]; if (!c) return;
    c.afterHire = text;
    setTimeout(() => { if (c.afterHire === text && c.jobName !== 'rehire') { c.afterHire = null; say(c, text, 6000); } }, 20000);
  }

  window.SNYP_SIM = { chars, log, SPEED, LIMITS, issuesFor, templateContribution, speak, later };
})();
