// Side panel: reception, tickets, meetings, documents, activity, backup, settings. Also boots the app.
(function () {
  const API = window.SNYP_API, R = window.SNYP_ROSTER, SIM = window.SNYP_SIM, RENDER = window.SNYP_RENDER;
  const $ = (s) => document.querySelector(s);
  const drafts = {};
  let tab = (() => { try { return localStorage.getItem('snyp-tab') || 'reception'; } catch (e) { return 'reception'; } })();
  let docs = null, snaps = null, flash = '';

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'on') for (const [e, f] of Object.entries(v)) el.addEventListener(e, f);
      else if (k === 'keep') { el.id = v; el.value = drafts[v] || ''; el.addEventListener('input', () => { drafts[v] = el.value; }); }
      else if (v === true) el.setAttribute(k, ''); else if (v !== false && v != null) el.setAttribute(k, v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
    return el;
  }
  const name = (w) => (w === 'owner' || w === 'you' ? 'You' : (R.STAFF[w] || { name: w }).name);
  const when = (t) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const data = () => API.S.data || { tickets: [], meetings: [], activity: [], settings: {}, state: {}, chats: {} };
  async function run(fn, okMsg) {
    flash = '';
    try { await fn(); if (okMsg) flash = okMsg; } catch (e) { flash = '⚠ ' + e.message; }
    render();
  }
  const op = (name, payload, msg) => run(() => API.op(name, 'owner', payload), msg);

  // ---------- views ----------
  function reception() {
    const d = data(), chat = (d.chats.rina || []).slice(-12);
    return [
      h('h2', {}, 'Ask Rina at reception'),
      h('p', { class: 'small' }, 'Describe what you need. Rina reads it, opens a ticket, decides who is responsible and walks it to their desk. Nobody starts until you give the go-ahead.'),
      h('textarea', { keep: 'req', placeholder: 'e.g. Tolong tentukan jumlah sampel dan dasar penentuannya untuk 3.2.2' }),
      h('label', { class: 'row small' }, h('input', { type: 'checkbox', id: 'reqNight', style: 'width:auto', checked: !!drafts.night, on: { change: (e) => { drafts.night = e.target.checked; } } }), 'Night Shift ticket (worked only while Night Shift is on)'),
      h('div', { class: 'row' }, h('select', { id: 'reqPrio', style: 'width:auto' }, h('option', { value: 'normal' }, 'Normal priority'), h('option', { value: 'high' }, 'High priority'), h('option', { value: 'low' }, 'Low priority')),
        h('button', { class: 'primary', id: 'sendReq', on: { click: sendRequest } }, 'Send to Rina')),
      chat.length ? h('h3', {}, 'Recent requests') : null,
      ...chat.reverse().map((c) => h('div', { class: 'small' }, `${when(c.at)} · ${name(c.who)}: ${c.text.slice(0, 160)}`)),
    ];
  }
  async function sendRequest() {
    const text = (drafts.req || '').trim(); if (!text) return;
    const night = !!drafts.night, priority = $('#reqPrio').value;
    await run(async () => {
      await API.op('chat.add', 'owner', { channel: 'rina', text });
      const first = text.split('\n')[0];
      await API.op('ticket.create', 'rina', { title: first.length > 120 ? first.slice(0, 117) + '…' : first, detail: text, priority, night, source: 'Request' });
      drafts.req = ''; drafts.night = false;
    }, 'Sent. Watch Rina read it and carry it upstairs.');
  }

  function ticketCard(t) {
    const kids = [h('div', { class: 'head' }, h('span', { class: 'no' }, '#' + t.no), h('span', { class: 'title' }, t.title),
      h('span', { class: 'tag ' + t.status }, R.STATUS[t.status] || t.status), t.priority === 'high' ? h('span', { class: 'tag high' }, 'high') : null, t.night ? h('span', { class: 'tag' }, '☾ night') : null)];
    kids.push(h('div', { class: 'small' }, `${t.assignee ? name(t.assignee) : 'Unassigned'} · ${t.source || ''}${t.section ? ' · ' + t.section : ''} · updated ${when(t.updatedAt || t.createdAt)}`));
    const det = h('details', {}, h('summary', { class: 'small' }, 'Details'), h('pre', {}, t.detail || '(no detail)'), t.routeReason ? h('div', { class: 'small' }, 'Routing: ' + t.routeReason) : null);
    kids.push(det);
    for (const c of (t.comments || []).slice(-3)) kids.push(h('div', { class: 'note' + (c.kind === 'supervision' ? ' sup' : '') }, `${name(c.who)}${c.kind === 'supervision' ? ' (supervision)' : ''}: ${c.text.replace(/^\[[\w-]+\]\s*/, '')}`));
    if (t.result) kids.push(h('div', {}, h('div', { class: 'small' }, 'Result'), h('div', { class: 'result' }, t.result)));
    const acts = h('div', { class: 'row' });
    if (t.status === 'delivered') acts.append(h('button', { class: 'ok', on: { click: () => op('ticket.transition', { id: t.id, to: 'authorized' }, `#${t.no} authorized.`) } }, 'Give go-ahead'));
    if (t.status === 'authorized') acts.append(h('button', { on: { click: () => op('ticket.transition', { id: t.id, to: 'delivered' }) } }, 'Withdraw go-ahead'));
    if (t.status === 'ready') {
      acts.append(h('button', { class: 'ok', on: { click: () => op('ticket.transition', { id: t.id, to: 'approved' }, `#${t.no} approved.`) } }, 'Approve'));
      acts.append(h('input', { keep: 'rev-' + t.id, placeholder: 'What should change?', style: 'flex:1 1 160px' }));
      acts.append(h('button', { on: { click: () => { const note = (drafts['rev-' + t.id] || '').trim(); if (!note) return; op('ticket.transition', { id: t.id, to: 'revision', note }, `#${t.no} sent back.`); } } }, 'Request revision'));
    }
    if (t.status === 'working' && !API.S.ai) {
      kids.push(h('details', {}, h('summary', { class: 'small' }, t.pendingResult ? 'Result handed over, staff is printing it' : 'Hand the result to ' + name(t.assignee)),
        h('textarea', { keep: 'res-' + t.id, placeholder: 'Paste the finished text (for example from Claude in chat)' }),
        h('button', { on: { click: () => { const r = (drafts['res-' + t.id] || '').trim(); if (r) op('ticket.handoff', { id: t.id, result: r }, 'Handed over.'); } } }, 'Hand over')));
    }
    if (!['closed'].includes(t.status)) {
      acts.append(h('details', {}, h('summary', { class: 'small' }, 'Close…'), h('input', { keep: 'close-' + t.id, placeholder: 'Reason (e.g. duplicate of #3)' }),
        h('button', { class: 'bad', on: { click: () => { const note = (drafts['close-' + t.id] || '').trim(); if (!note) { flash = '⚠ Give a reason to close.'; return render(); } if (confirm(`Close ticket #${t.no}? This is recorded in the log.`)) op('ticket.transition', { id: t.id, to: 'closed', note }, `#${t.no} closed.`); } } }, 'Close ticket')));
    }
    kids.push(acts);
    return h('div', { class: 't', 'data-ticket': t.id }, kids);
  }
  function tickets() {
    const d = data(), groups = [['Needs you', ['delivered', 'ready']], ['In the office', ['received', 'authorized', 'working', 'revision']], ['Done', ['approved', 'closed']]];
    return [h('h2', {}, 'Tickets'), ...groups.map(([label, sts]) => {
      const list = d.tickets.filter((t) => sts.includes(t.status));
      return h('div', {}, h('h3', {}, `${label} (${list.length})`), list.length ? list.map(ticketCard) : h('div', { class: 'small' }, 'None.'));
    })];
  }

  function meeting() {
    const d = data(), m = d.meetings.find((x) => x.status !== 'ended');
    const past = d.meetings.filter((x) => x.status === 'ended').slice(-5).reverse();
    const out = [h('h2', {}, 'Rooftop meeting')];
    if (!m) {
      out.push(h('p', { class: 'small' }, 'Everyone stops safely, walks up to the rooftop and sits at the table. You take the head seat. Each role gives its view, Nadia writes the minutes, and action items can become tickets.'),
        h('input', { keep: 'mtopic', placeholder: 'Topic, e.g. Progress BAB III' }), h('textarea', { keep: 'magenda', placeholder: 'Agenda (optional)' }),
        h('button', { class: 'primary', id: 'callMeeting', on: { click: () => run(async () => { await API.op('meeting.create', 'owner', { topic: drafts.mtopic || 'General meeting', agenda: drafts.magenda || '' }); drafts.mtopic = ''; drafts.magenda = ''; }, 'Meeting called.') } }, 'Call meeting'));
    } else {
      const label = { called: 'Calling everyone…', gathering: 'Staff are walking to the rooftop', in_session: 'In session', minutes: 'Nadia is writing the minutes', ended: 'Ended' }[m.status];
      out.push(h('div', { class: 'row' }, h('strong', {}, m.topic), h('span', { class: 'tag' }, label)));
      if (m.agenda) out.push(h('div', { class: 'small' }, m.agenda));
      out.push(...m.contributions.map((c) => h('div', { class: 'note' }, h('strong', {}, name(c.who) + ': '), c.text)));
      if (m.status === 'in_session') {
        out.push(h('textarea', { keep: 'msay', placeholder: 'Your contribution. Lines starting with "Action:" become action items (add @stat, @metod, @lib or @nadia).' }),
          h('div', { class: 'row' }, h('button', { on: { click: () => { const t = (drafts.msay || '').trim(); if (t) run(async () => { await API.op('meeting.contribute', 'owner', { id: m.id, text: t }); drafts.msay = ''; }); } } }, 'Say'),
            h('button', { class: 'primary', id: 'wrapUp', on: { click: () => op('meeting.transition', { id: m.id, to: 'minutes' }) } }, 'Wrap up: minutes')));
      }
      if (m.minutes) {
        out.push(h('h3', {}, 'Minutes (Nadia)'), h('pre', {}, m.minutes), h('h3', {}, 'Action items'));
        if (!m.actions.length) out.push(h('div', { class: 'small' }, 'No action items.'));
        m.actions.forEach((a, i) => out.push(h('div', { class: 'row' }, h('span', { style: 'flex:1' }, `${a.text} → ${a.assignee ? name(a.assignee) : 'Rina decides'}`),
          a.ticket ? h('span', { class: 'tag' }, 'ticket ' + a.ticket) : h('button', { 'data-action': i, on: { click: () => op('meeting.actionToTicket', { id: m.id, index: i }, 'Ticket created at reception.') } }, 'Make ticket'))));
        out.push(h('details', {}, h('summary', { class: 'small' }, 'Edit action items'), h('textarea', { keep: 'mact', placeholder: 'One per line: text @stat' }),
          h('button', { on: { click: () => { const actions = (drafts.mact || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const at = l.match(/@(nadia|stat|metod|lib)\b/); return { text: l.replace(/@\w+/, '').trim(), assignee: at ? at[1] : R.routeRequest(l).assignee }; }); op('meeting.minutes', { id: m.id, minutes: m.minutes, actions: [...m.actions, ...actions] }, 'Action items added.'); drafts.mact = ''; } } }, 'Add items')));
      }
      out.push(h('button', { class: m.minutes ? 'primary' : 'bad', id: 'endMeeting', on: { click: () => { if (m.minutes || confirm('End the meeting before minutes are written?')) op('meeting.transition', { id: m.id, to: 'ended' }, 'Meeting ended.'); } } }, 'End meeting'));
    }
    if (past.length) out.push(h('h3', {}, 'Past meetings'), ...past.map((p) => h('details', {}, h('summary', {}, `${when(p.createdAt)} · ${p.topic}`), h('pre', {}, p.minutes || '(no minutes)'))));
    return out;
  }

  function documents() {
    const out = [h('h2', {}, 'Thesis document archive'), h('div', { class: 'row' },
      h('button', { on: { click: loadDocs } }, docs ? 'Refresh list' : 'Load archive'),
      h('button', { class: 'primary', id: 'draftCheck', on: { click: () => run(async () => { const r = await API.req('POST', '/api/draftcheck', {}); await API.refresh(true); flash = `Draft check: ${r.findings.length} findings, ${r.created.length} new ticket(s)${r.unchanged ? ' (draft unchanged since last check)' : ''}.`; }) } }, 'Run draft check'))];
    const st = data().state;
    if (st.lastCheckedFile) out.push(h('div', { class: 'small' }, `Last check: ${st.lastCheckedFile.slice(0, 60)}… on ${when(st.lastCheckedAt)}`));
    if (docs && docs.error) out.push(h('div', { class: 'err' }, docs.error));
    if (docs && docs.files) {
      const by = {};
      for (const f of docs.files) (by[f.path.split('/')[0]] = by[f.path.split('/')[0]] || []).push(f);
      out.push(h('div', { class: 'small' }, `${docs.files.length} files · source: ${docs.mode === 'github' ? 'private GitHub archive' : 'local folder'}`));
      for (const [folder, files] of Object.entries(by)) out.push(h('details', { class: 'files', open: folder.startsWith('0') && files.length < 6 }, h('summary', {}, `${folder} (${files.length})`),
        ...files.map((f) => h('a', { href: '/api/docs?path=' + encodeURIComponent(f.path), target: '_blank', rel: 'noopener' }, `${f.path.split('/').slice(1).join('/') || f.path} · ${(f.size / 1024).toFixed(0)} KB`))));
    }
    return out;
  }
  async function loadDocs() { try { docs = await API.req('GET', '/api/docs'); } catch (e) { docs = { error: e.message }; } render(); }

  function activity() {
    const d = data();
    return [h('h2', {}, 'Activity log'), h('div', { class: 'log' }, ...d.activity.slice(0, 150).map((a) => h('div', {}, h('span', { class: 'small' }, when(a.at) + ' · '), h('strong', {}, name(a.who) + ' '), a.text)))];
  }

  function backup() {
    return [h('h2', {}, 'Backup and restore'),
      h('p', { class: 'small' }, 'ABB.json holds all app data: tickets, logs, meetings, reviews and settings. Thesis documents are backed up separately in the archive. A snapshot is saved automatically every day and before every restore.'),
      h('a', { href: '/api/backup', download: 'ABB.json' }, h('button', { class: 'primary' }, 'Export ABB.json')),
      h('h3', {}, 'Restore from ABB.json'),
      h('input', { type: 'file', accept: '.json,application/json', id: 'importFile' }),
      h('button', { id: 'importBtn', on: { click: importFile } }, 'Restore this file'),
      h('h3', {}, 'Automatic snapshots'),
      h('button', { on: { click: async () => { try { snaps = (await API.req('GET', '/api/backup?list=1')).snapshots; } catch (e) { snaps = []; flash = '⚠ ' + e.message; } render(); } } }, 'Show snapshots'),
      ...(snaps || []).map((s) => h('div', { class: 'row' }, h('span', { style: 'flex:1' }, s),
        h('a', { href: '/api/backup?snapshot=' + encodeURIComponent(s) }, 'download'),
        h('button', { on: { click: () => { if (confirm('Restore snapshot ' + s + '? Current data is snapshotted first.')) run(async () => { await API.req('POST', '/api/backup', { snapshot: s }); await API.refresh(true); }, 'Snapshot restored.'); } } }, 'Restore')))];
  }
  async function importFile() {
    const f = $('#importFile').files[0]; if (!f) return;
    let parsed; try { parsed = JSON.parse(await f.text()); } catch (e) { flash = '⚠ Not a valid JSON file.'; return render(); }
    if (!confirm(`Restore ${parsed.tickets ? parsed.tickets.length : 0} tickets from ${f.name}? Current data is saved as a snapshot first.`)) return;
    run(async () => { const r = await API.req('POST', '/api/backup', { data: parsed }); await API.refresh(true); flash = `Restored ${r.tickets} tickets. Previous data saved as snapshot ${r.snapshot}.`; });
  }

  function settings() {
    const s = data().settings;
    return [h('h2', {}, 'Settings'),
      h('label', { class: 'row' }, h('input', { type: 'checkbox', id: 'nightToggle', style: 'width:auto', checked: !!s.nightShift, on: { change: (e) => op('settings.set', { key: 'nightShift', value: e.target.checked }) } }), 'Night Shift on (office goes dark; night tickets get worked)'),
      h('div', { class: 'small' }, 'Storage: ' + (API.S.mode === 'server' ? 'Upstash Redis on the server, shared by all your devices.' : 'LOCAL TEST MODE: a file on this computer only. Deploy to Vercel with Upstash for real storage.')),
      h('div', { class: 'small' }, 'AI: ' + (API.S.ai ? 'on (ANTHROPIC_API_KEY set). Staff draft results and meeting views with Claude.' : 'off. Rina routes by keywords; staff wait for you to hand them results.')),
      h('div', { class: 'small' }, 'This device: ' + (API.S.leader ? 'drives the office (leader).' : 'watching. Another open device is driving the office.')),
      h('button', { on: { click: async () => { await API.logout(); location.reload(); } } }, 'Log out')];
  }

  const VIEWS = { reception, tickets, meeting, docs: documents, activity, backup, settings };
  function render() {
    const v = $('#view'); if (!v) return;
    const focus = document.activeElement && document.activeElement.id;
    const scroll = v.scrollTop;
    const openDetails = [...v.querySelectorAll('details')].map((d, i) => d.open ? i : -1).filter((i) => i >= 0);
    v.replaceChildren(...(flash ? [h('div', { class: flash.startsWith('⚠') ? 'err' : 'small', id: 'flash' }, flash)] : []), ...VIEWS[tab]().flat().filter((x) => x != null && x !== false));
    [...v.querySelectorAll('details')].forEach((d, i) => { if (openDetails.includes(i)) d.open = true; });
    v.scrollTop = scroll;
    if (focus && document.getElementById(focus)) document.getElementById(focus).focus();
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    const need = data().tickets.filter((t) => ['delivered', 'ready'].includes(t.status)).length;
    $('#tcount').textContent = need ? `(${need})` : '';
    $('#storage').textContent = API.S.mode === 'server' ? 'Saved on server · shared across devices' : API.S.mode === 'local' ? 'LOCAL TEST MODE · this computer only' : 'Connecting…';
    $('#storage').classList.toggle('warn', API.S.mode !== 'server');
    $('#ai').textContent = API.S.ai ? 'AI on' : 'AI off';
    $('#leader').textContent = API.S.online ? (API.S.leader ? 'This device drives the office' : 'Watching') : 'Offline: ' + API.S.error;
  }

  document.addEventListener('click', (e) => { const b = e.target.closest('#tabs button'); if (b) { tab = b.dataset.tab; flash = ''; try { localStorage.setItem('snyp-tab', tab); } catch (err) { /* ignore */ } if (tab === 'docs' && !docs) loadDocs(); render(); } });

  // Character inspector.
  function inspect(evt) {
    const c = RENDER.hit(evt), box = $('#who');
    if (!c) { box.hidden = true; return; }
    const st = R.STAFF[c.id] || { name: 'You', role: 'Student' };
    const mine = data().tickets.filter((t) => t.assignee === c.id && !['closed', 'approved'].includes(t.status));
    box.replaceChildren(h('strong', {}, `${st.name} · ${st.role}`), h('div', { class: 'small' }, c.jobName ? 'Doing: ' + c.jobName : 'At their spot'),
      ...mine.map((t) => h('div', { class: 'small' }, `#${t.no} ${R.STATUS[t.status]}`)));
    box.hidden = false;
  }

  async function boot() {
    let ok = false;
    try { ok = await API.isLoggedIn(); } catch (e) { $('#loginErr').textContent = e.message; }
    if (!ok) {
      $('#login').hidden = false;
      $('#loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        try { await API.login($('#pw').value); location.reload(); } catch (err) { $('#loginErr').textContent = err.message; }
      });
      return;
    }
    $('#app').hidden = false;
    RENDER.setup($('#office'));
    $('#office').addEventListener('click', inspect);
    API.on(() => { if (API.S.loggedOut) location.reload(); render(); });
    API.start();
    render();
  }
  boot();
  window.SNYP_UI = { render };
})();
