// Side panel: reception, tickets, meetings, documents, activity, backup, settings. Also boots the app.
(function () {
  const API = window.SNYP_API, R = window.SNYP_ROSTER, SIM = window.SNYP_SIM, RENDER = window.SNYP_RENDER, TALK = window.SNYP_TALK;
  const $ = (s) => document.querySelector(s);
  const I18N = window.SNYP_I18N, L = I18N.L;
  const ROLE_ID = { rina: 'Resepsionis', nadia: 'Sekretaris', stat: 'Ahli Statistik', metod: 'Ahli Metodologi', lib: 'Pustakawan', editor: 'Editor Akademik', syariah: 'Ahli Keuangan Syariah', director: 'Direktur / Pengawas' };
  const role = (id, en) => L(en, ROLE_ID[id] || en);
  // Activity log lines come from the server in English; show them in Indonesian when chosen.
  const LOG_ID = [
    [/^Ticket #(\d+) created: (.*)$/s, 'Tiket #$1 dibuat: $2'], [/^Ticket #(\d+) routed to (.*)$/, 'Tiket #$1 diarahkan ke $2'],
    [/^Ticket #(\d+) delivered to (.*)$/s, 'Tiket #$1 diantar ke $2'], [/^Ticket #(\d+) authorized for (.*)$/s, 'Tiket #$1 diberi izin untuk $2'],
    [/^Ticket #(\d+) started by (.*)$/s, 'Tiket #$1 mulai dikerjakan oleh $2'], [/^Ticket #(\d+) result ready from (.*)$/s, 'Hasil tiket #$1 siap dari $2'],
    [/^Ticket #(\d+) approved, by (.*)$/s, 'Tiket #$1 disetujui ($2)'], [/^Ticket #(\d+) sent back to (.*)$/s, 'Tiket #$1 dikembalikan ke $2'],
    [/^Ticket #(\d+) closed(.*)$/s, 'Tiket #$1 ditutup$2'], [/^Ticket #(\d+) edited$/, 'Tiket #$1 diubah'],
    [/^Result material handed to (.*) for #(\d+)$/, 'Bahan hasil diserahkan ke $1 untuk #$2'], [/^Supervision note on #(\d+): (.*)$/s, 'Catatan pengawasan untuk #$1: $2'],
    [/^Note on #(\d+): (.*)$/s, 'Catatan untuk #$1: $2'], [/^Meeting called on the rooftop: (.*)$/s, 'Rapat dipanggil di rooftop: $1'],
    [/^Minutes recorded for "(.*)" with (\d+) action item\(s\)$/s, 'Notulen "$1" dicatat dengan $2 action item'], [/^Setting changed: (.*)$/s, 'Pengaturan diubah: $1'],
    [/^Checked (.*): (\d+) findings(?:, (\d+) new tickets)?$/s, (m, f, n, c) => `Memeriksa ${f}: ${n} temuan${c ? ', ' + c + ' tiket baru' : ''}`],
    [/^Restored from backup exported (.*) \((\d+) tickets\)\. Previous data saved as a snapshot\.$/s, 'Dipulihkan dari cadangan $1 ($2 tiket). Data sebelumnya disimpan sebagai snapshot.'],
    [/^Review added(.*)$/s, 'Review ditambahkan$1'],
    [/^(.*) was let go; (.*) is the new (.*)$/s, '$1 dipecat; $2 menggantikan sebagai $3'], [/^Staff names: (.*)$/s, 'Nama staf: $1'],
  ];
  const logText = (t) => { if (I18N.lang !== 'id') return t; for (const [re, rep] of LOG_ID) if (re.test(t)) return t.replace(re, rep); return t; };
  const stat = (k) => L(R.STATUS[k] || k, SID[k] || k);
  const drafts = {};
  let tab = (() => { try { return localStorage.getItem('snyp-tab') || 'reception'; } catch (e) { return 'reception'; } })();
  let docs = null, snaps = null, flash = '';

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'on') for (const [e, f] of Object.entries(v)) el.addEventListener(e, f);
      else if (k === 'keep') { el.id = v; el.value = drafts[v] || ''; el.addEventListener('input', () => { drafts[v] = el.value; if (v === 'webq') { const q = el.value.trim() || 'Trust in AI AI Reliance minat investasi syariah'; const row = el.nextElementSibling; if (row) { const a = row.querySelectorAll('a'); a[0].href = gq(q); a[1].href = sq(q); } } }); }
      else if (v === true) el.setAttribute(k, ''); else if (v !== false && v != null) el.setAttribute(k, v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
    return el;
  }
  const name = (w) => (w === 'owner' || w === 'you' ? L('You', 'Kamu') : (R.STAFF[w] || { name: w }).name);
  const when = (t) => new Date(t).toLocaleString(I18N.lang === 'id' ? 'id-ID' : [], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
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
      h('h2', {}, L('Ask Trisha at reception', 'Tanya Trisha di resepsionis')),
      h('p', { class: 'small' }, L('Describe what you need. Trisha reads it, opens a ticket, decides who is responsible and walks it to their desk. Nobody starts until you give the go-ahead.', 'Tulis apa yang kamu butuhkan. Trisha membacanya, membuat tiket, menentukan siapa yang bertanggung jawab, lalu mengantarnya ke meja staf. Tidak ada yang mulai bekerja sebelum kamu memberi izin.')),
      h('textarea', { keep: 'req', placeholder: 'e.g. Tolong tentukan jumlah sampel dan dasar penentuannya untuk 3.2.2' }),
      h('label', { class: 'row small' }, h('input', { type: 'checkbox', id: 'reqNight', style: 'width:auto', checked: !!drafts.night, on: { change: (e) => { drafts.night = e.target.checked; } } }), L('Night Shift ticket (worked only while Night Shift is on)', 'Tiket Shift Malam (hanya dikerjakan saat Shift Malam aktif)')),
      h('div', { class: 'row' }, h('select', { id: 'reqPrio', style: 'width:auto' }, h('option', { value: 'normal' }, L('Normal priority', 'Prioritas normal')), h('option', { value: 'high' }, L('High priority', 'Prioritas tinggi')), h('option', { value: 'low' }, L('Low priority', 'Prioritas rendah'))),
        h('button', { class: 'primary', id: 'sendReq', on: { click: sendRequest } }, L('Send to Trisha', 'Kirim ke Trisha'))),
      chat.length ? h('h3', {}, L('Recent requests', 'Permintaan terakhir')) : null,
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
    }, L('Sent. Watch Trisha read it and carry it upstairs.', 'Terkirim. Lihat Trisha membacanya dan membawanya ke atas.'));
  }

  function ticketCard(t) {
    const kids = [h('div', { class: 'head' }, h('span', { class: 'no' }, '#' + t.no), h('span', { class: 'title' }, t.title),
      h('span', { class: 'tag ' + t.status }, stat(t.status)), t.priority === 'high' ? h('span', { class: 'tag high' }, L('high', 'tinggi')) : null, t.night ? h('span', { class: 'tag' }, L('☾ night', '☾ malam')) : null)];
    kids.push(h('div', { class: 'small' }, L(`${t.assignee ? name(t.assignee) : 'Unassigned'} · ${t.source || ''}${t.section ? ' · ' + t.section : ''} · updated ${when(t.updatedAt || t.createdAt)}`, `${t.assignee ? name(t.assignee) : 'Belum ditugaskan'} · ${t.source || ''}${t.section ? ' · ' + t.section : ''} · diperbarui ${when(t.updatedAt || t.createdAt)}`)));
    const det = h('details', {}, h('summary', { class: 'small' }, L('Details', 'Detail')), h('pre', {}, t.detail || L('(no detail)', '(tanpa detail)')), t.routeReason ? h('div', { class: 'small' }, L('Routing: ', 'Alasan pembagian: ') + t.routeReason) : null, searchRow(searchTerms(t)));
    kids.push(det);
    for (const c of (t.comments || []).slice(-3)) kids.push(h('div', { class: 'note' + (c.kind === 'supervision' ? ' sup' : '') }, `${name(c.who)}${c.kind === 'supervision' ? ' (supervision)' : ''}: ${c.text.replace(/^\[[\w-]+\]\s*/, '')}`));
    if (t.result) kids.push(h('div', {}, h('div', { class: 'small' }, L('Result', 'Hasil')), h('div', { class: 'result' }, t.result),
      h('button', { on: { click: () => { copyKind = 'ticket'; copyId = t.id; tab = 'copier'; render(); } } }, L('Photocopy: PDF / Word / Excel', 'Fotokopi: PDF / Word / Excel'))));
    const acts = h('div', { class: 'row' });
    if (t.status === 'delivered') acts.append(h('button', { class: 'ok', on: { click: () => op('ticket.transition', { id: t.id, to: 'authorized' }, L(`#${t.no} authorized.`, `#${t.no} diberi izin.`)) } }, L('Give go-ahead', 'Beri izin')));
    if (t.status === 'authorized') acts.append(h('button', { on: { click: () => op('ticket.transition', { id: t.id, to: 'delivered' }) } }, L('Withdraw go-ahead', 'Tarik izin')));
    if (t.status === 'ready') {
      acts.append(h('button', { class: 'ok', on: { click: () => op('ticket.transition', { id: t.id, to: 'approved' }, L(`#${t.no} approved.`, `#${t.no} disetujui.`)) } }, L('Approve', 'Setujui')));
      acts.append(h('input', { keep: 'rev-' + t.id, placeholder: L('What should change?', 'Apa yang harus diubah?'), style: 'flex:1 1 160px' }));
      acts.append(h('button', { on: { click: () => { const note = (drafts['rev-' + t.id] || '').trim(); if (!note) return; op('ticket.transition', { id: t.id, to: 'revision', note }, L(`#${t.no} sent back.`, `#${t.no} dikembalikan untuk revisi.`)); } } }, L('Request revision', 'Minta revisi')));
    }
    if (t.status === 'working' && !API.S.ai) {
      kids.push(h('details', {}, h('summary', { class: 'small' }, t.pendingResult ? L('Result handed over, staff is printing it', 'Hasil sudah diserahkan, staf sedang mencetaknya') : L('Hand the result to ', 'Serahkan hasil ke ') + name(t.assignee)),
        h('div', { class: 'small' }, L('Without AI: copy this prompt, paste it into a Claude chat, then paste the answer in the box below and click Hand over.', 'Tanpa AI: salin prompt ini, tempel di chat Claude, lalu tempel jawabannya di kotak bawah dan klik Hand over.')),
        h('button', { on: { click: async (e) => { try { await navigator.clipboard.writeText(claudePrompt(t)); e.target.textContent = L('Prompt copied ✓', 'Prompt tersalin ✓'); } catch (err) { flash = L('⚠ Could not copy automatically: ', '⚠ Tidak bisa menyalin otomatis: ') + err.message; render(); } } } }, L('Copy prompt for Claude', 'Salin prompt untuk Claude')),
        h('textarea', { keep: 'res-' + t.id, placeholder: L('Paste the finished text (for example from Claude in chat)', 'Tempel teks hasil (misalnya dari chat Claude)') }),
        h('button', { on: { click: () => { const r = (drafts['res-' + t.id] || '').trim(); if (r) op('ticket.handoff', { id: t.id, result: r }, L('Handed over.', 'Sudah diserahkan.')); } } }, L('Hand over', 'Serahkan'))));
    }
    if (!['closed'].includes(t.status)) {
      acts.append(h('details', {}, h('summary', { class: 'small' }, L('Close…', 'Tutup…')), h('input', { keep: 'close-' + t.id, placeholder: L('Reason (e.g. duplicate of #3)', 'Alasan (mis. duplikat dari #3)') }),
        h('button', { class: 'bad', on: { click: () => { const note = (drafts['close-' + t.id] || '').trim(); if (!note) { flash = L('⚠ Give a reason to close.', '⚠ Tulis alasan menutup tiket.'); return render(); } if (confirm(L(`Close ticket #${t.no}? This is recorded in the log.`, `Tutup tiket #${t.no}? Ini dicatat di log.`))) op('ticket.transition', { id: t.id, to: 'closed', note }, L(`#${t.no} closed.`, `#${t.no} ditutup.`)); } } }, L('Close ticket', 'Tutup tiket'))));
    }
    kids.push(acts);
    return h('div', { class: 't', 'data-ticket': t.id }, kids);
  }
  function tickets() {
    const d = data(), groups = [[L('Needs you', 'Menunggu kamu'), ['delivered', 'ready']], [L('In the office', 'Sedang di kantor'), ['received', 'authorized', 'working', 'revision']], [L('Done', 'Selesai'), ['approved', 'closed']]];
    return [h('h2', {}, L('Tickets', 'Tiket')), ...groups.map(([label, sts]) => {
      const list = d.tickets.filter((t) => sts.includes(t.status));
      return h('div', {}, h('h3', {}, `${label} (${list.length})`), list.length ? list.map(ticketCard) : h('div', { class: 'small' }, L('None.', 'Tidak ada.')));
    })];
  }

  function meeting() {
    const d = data(), m = d.meetings.find((x) => x.status !== 'ended');
    const past = d.meetings.filter((x) => x.status === 'ended').slice(-5).reverse();
    const out = [h('h2', {}, L('Rooftop meeting', 'Rapat rooftop'))];
    if (!m) {
      out.push(h('p', { class: 'small' }, L('Everyone stops safely, walks up to the rooftop and sits at the table. You take the head seat. Each role gives its view, Nadia writes the minutes, and action items can become tickets.', 'Semua staf berhenti dengan aman, naik ke rooftop dan duduk di sekitar api unggun. Kamu duduk di kursi utama. Tiap peran menyampaikan pendapat, Nadia menulis notulen, dan action item bisa dijadikan tiket.')),
        h('input', { keep: 'mtopic', placeholder: L('Topic, e.g. Progress BAB III', 'Topik, mis. Progres BAB III') }), h('textarea', { keep: 'magenda', placeholder: L('Agenda (optional)', 'Agenda (opsional)') }),
        h('button', { class: 'primary', id: 'callMeeting', on: { click: () => run(async () => { await API.op('meeting.create', 'owner', { topic: drafts.mtopic || 'General meeting', agenda: drafts.magenda || '' }); drafts.mtopic = ''; drafts.magenda = ''; }, L('Meeting called.', 'Rapat dipanggil.')) } }, L('Call meeting', 'Panggil rapat')));
    } else {
      const label = { called: L('Calling everyone…', 'Memanggil semua…'), gathering: L('Staff are walking to the rooftop', 'Staf berjalan ke rooftop'), in_session: L('In session', 'Berlangsung'), minutes: L('Nadia is writing the minutes', 'Nadia sedang menulis notulen'), ended: L('Ended', 'Selesai') }[m.status];
      out.push(h('div', { class: 'row' }, h('strong', {}, m.topic), h('span', { class: 'tag' }, label)));
      if (m.agenda) out.push(h('div', { class: 'small' }, m.agenda));
      out.push(...m.contributions.map((c) => h('div', { class: 'note' }, h('strong', {}, name(c.who) + ': '), c.text)));
      if (m.status === 'in_session') {
        out.push(h('textarea', { keep: 'msay', placeholder: L('Your contribution. Lines starting with "Action:" become action items (add @stat, @metod, @lib, @editor, @syariah or @nadia).', 'Pendapatmu. Baris yang diawali "Action:" menjadi action item (tambahkan @stat, @metod, @lib, @editor, @syariah atau @nadia).') }),
          h('div', { class: 'row' }, h('button', { on: { click: () => { const t = (drafts.msay || '').trim(); if (t) run(async () => { await API.op('meeting.contribute', 'owner', { id: m.id, text: t }); drafts.msay = ''; }); } } }, L('Say', 'Kirim')),
            h('button', { class: 'primary', id: 'wrapUp', on: { click: () => op('meeting.transition', { id: m.id, to: 'minutes' }) } }, L('Wrap up: minutes', 'Selesai: buat notulen'))));
      }
      if (m.minutes) {
        out.push(h('h3', {}, L('Minutes (Nadia)', 'Notulen (Nadia)')), h('pre', {}, m.minutes), h('h3', {}, L('Action items', 'Action item')));
        if (!m.actions.length) out.push(h('div', { class: 'small' }, L('No action items.', 'Tidak ada action item.')));
        m.actions.forEach((a, i) => out.push(h('div', { class: 'row' }, h('span', { style: 'flex:1' }, `${a.text} → ${a.assignee ? name(a.assignee) : 'Trisha decides'}`),
          a.ticket ? h('span', { class: 'tag' }, 'ticket ' + a.ticket) : h('button', { 'data-action': i, on: { click: () => op('meeting.actionToTicket', { id: m.id, index: i }, L('Ticket created at reception.', 'Tiket dibuat di resepsionis.')) } }, L('Make ticket', 'Jadikan tiket')))));
        out.push(h('details', {}, h('summary', { class: 'small' }, L('Edit action items', 'Ubah action item')), h('textarea', { keep: 'mact', placeholder: L('One per line: text @stat', 'Satu per baris: teks @stat') }),
          h('button', { on: { click: () => { const actions = (drafts.mact || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const at = l.match(/@(nadia|stat|metod|lib|editor|syariah)\b/); return { text: l.replace(/@\w+/, '').trim(), assignee: at ? at[1] : R.routeRequest(l).assignee }; }); op('meeting.minutes', { id: m.id, minutes: m.minutes, actions: [...m.actions, ...actions] }, L('Action items added.', 'Action item ditambahkan.')); drafts.mact = ''; } } }, L('Add items', 'Tambah'))));
      }
      out.push(h('button', { class: m.minutes ? 'primary' : 'bad', id: 'endMeeting', on: { click: () => { if (m.minutes || confirm(L('End the meeting before minutes are written?', 'Akhiri rapat sebelum notulen ditulis?'))) op('meeting.transition', { id: m.id, to: 'ended' }, L('Meeting ended.', 'Rapat selesai.')); } } }, L('End meeting', 'Akhiri rapat')));
    }
    if (past.length) out.push(h('h3', {}, L('Past meetings', 'Rapat sebelumnya')), ...past.map((p) => h('details', {}, h('summary', {}, `${when(p.createdAt)} · ${p.topic}`), h('pre', {}, p.minutes || L('(no minutes)', '(tanpa notulen)')))));
    return out;
  }

  // ---------- talk to your staff ----------
  let talkTo = (() => { try { return localStorage.getItem('snyp-talk') || 'rina'; } catch (e) { return 'rina'; } })();
  let talking = false;
  function chat() {
    const d = data(), me = R.STAFF[talkTo] || R.STAFF.rina;
    const log = (d.chats[talkTo] || []).slice(-40);
    const names = (d.settings && d.settings.names) || {};
    return [h('h2', {}, L('Talk to your staff', 'Ngobrol dengan staf')),
      h('div', { class: 'row' }, ...Object.keys(R.STAFF).map((id) => h('button', { class: id === talkTo ? 'primary' : '', 'data-talk': id, on: { click: () => { talkTo = id; try { localStorage.setItem('snyp-talk', id); } catch (e) { /* ignore */ } render(); } } }, R.STAFF[id].name))),
      h('div', { class: 'small' }, `${me.name} · ${role(talkTo, me.role)}`),
      h('div', { class: 'chatlog', id: 'chatlog' }, log.length ? log.map((m) => h('div', { class: 'msg ' + (m.who === 'you' ? 'me' : 'them') }, h('b', {}, m.who === 'you' ? L('You', 'Kamu') : name(m.who)), ' ', m.text)) : h('div', { class: 'small' }, L('No messages yet. Say hello, ask for progress, give the go-ahead, disagree, rename or fire.', 'Belum ada obrolan. Coba sapa, tanya progres, beri izin, bilang tidak setuju, ganti nama, atau pecat.'))),
      h('textarea', { keep: 'talk', placeholder: L('e.g. how is it going? / start / I disagree, the sample is too small / your name is now Budi / you are fired', 'mis. gimana progresnya? / mulai / ga setuju, sampelnya kekecilan / namamu sekarang Budi / kamu dipecat'), on: { keydown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTalk(); } } } }),
      h('button', { class: 'primary', id: 'sendTalk', disabled: talking, on: { click: sendTalk } }, L('Send', 'Kirim')),
      h('h3', {}, L('Staff names', 'Nama staf')),
      ...Object.keys(R.STAFF).map((id) => h('label', { class: 'row small' }, h('span', { style: 'flex:0 0 150px' }, role(id, R.STAFF[id].role)), h('input', { keep: 'name-' + id, placeholder: names[id] || R.DEFAULT_NAMES[id], style: 'flex:1' }))),
      h('div', { class: 'row' },
        h('button', { id: 'saveNames', on: { click: () => { const n = { ...names }; for (const id of Object.keys(R.STAFF)) { const v = (drafts['name-' + id] || '').trim(); if (v) n[id] = TALK.cleanName(v); drafts['name-' + id] = ''; } op('settings.set', { key: 'names', value: n }, L('Names saved.', 'Nama disimpan.')); } } }, L('Save names', 'Simpan nama')),
        h('button', { on: { click: () => { if (confirm(L('Give everyone their original names back?', 'Kembalikan semua nama ke nama awal?'))) op('settings.set', { key: 'names', value: {} }, L('Original names restored.', 'Nama awal dikembalikan.')); } } }, L('Original names', 'Nama awal')))];
  }
  async function sendTalk() {
    const text = (drafts.talk || '').trim(); if (!text || talking) return;
    const who = talkTo; talking = true; drafts.talk = '';
    try {
      await API.op('chat.add', 'owner', { channel: who, text });
      let r = TALK.reply(who, text, data());
      if (r.unknown && API.S.ai) { try { const a = await API.ai({ task: 'chat', who, text }); if (a && a.text) r = { say: a.text, mood: 'think' }; } catch (e) { /* keep rule reply */ } }
      if (r.confirm && !confirm(r.confirm)) r = { say: L('Phew, thank you. I will do better.', 'Fiuh, terima kasih. Saya akan bekerja lebih baik.'), mood: 'happy' };
      else for (const a of r.actions || []) {
        if (a.type === 'authorize') await API.op('ticket.transition', 'owner', { id: a.id, to: 'authorized' });
        if (a.type === 'approve') await API.op('ticket.transition', 'owner', { id: a.id, to: 'approved' });
        if (a.type === 'revise') await API.op('ticket.transition', 'owner', { id: a.id, to: 'revision', note: a.note });
        if (a.type === 'rename' || a.type === 'fire') await API.op('settings.set', 'owner', { key: 'names', value: { ...((data().settings || {}).names || {}), [a.who]: a.newName } });
        if (a.type === 'fire') await API.op('settings.set', 'owner', { key: 'fired', who: a.who, value: { ...((data().settings || {}).fired || {}), [a.who]: { at: Date.now(), oldName: a.oldName, newName: a.newName } } });
      }
      await API.op('chat.add', who, { channel: who, text: r.say });
      if (SIM.chars[who]) SIM.speak(who, r.say, r.mood);
      if (r.after && !(r.confirm && !(r.actions || []).length)) { await API.op('chat.add', r.after.who, { channel: r.after.who, text: r.after.text }); SIM.later(r.after.who, r.after.text); }
      await API.refresh(true);
    } catch (e) { flash = '⚠ ' + e.message; }
    talking = false; render();
    const lg = $('#chatlog'); if (lg) lg.scrollTop = lg.scrollHeight;
  }

  // ---------- rooftop screen, full size ----------
  const SID = { received: 'Di resepsionis', delivered: 'Menunggu izin kamu', authorized: 'Diizinkan', working: 'Sedang dikerjakan', ready: 'Siap kamu setujui', revision: 'Revisi', approved: 'Disetujui', closed: 'Ditutup' };
  function report() {
    const d = data(), t = d.tickets, m = d.meetings.find((x) => x.status !== 'ended');
    const out = [h('h2', {}, L('Office report (rooftop screen)', 'Laporan kantor (layar rooftop)'))];
    if (m) {
      out.push(h('div', { class: 'note' }, h('strong', {}, L('Meeting in progress: ', 'Rapat berjalan: ')), m.topic), ...m.contributions.map((c) => h('div', { class: 'small' }, h('strong', {}, name(c.who) + ': '), c.text)));
      if (m.minutes) out.push(h('h3', {}, L('Minutes', 'Notulen')), h('pre', {}, m.minutes));
    }
    out.push(h('div', { class: 'stats' }, ...['received', 'delivered', 'authorized', 'working', 'ready', 'revision', 'approved', 'closed'].map((k) => h('div', { class: 'stat tag ' + k }, h('b', {}, String(t.filter((x) => x.status === k).length)), h('span', {}, stat(k))))));
    const open = t.filter((x) => !['approved', 'closed'].includes(x.status));
    out.push(h('h3', {}, L(`Open tickets (${open.length})`, `Tiket terbuka (${open.length})`)));
    out.push(...open.map((x) => h('div', { class: 'note' }, h('strong', {}, `#${x.no} `), x.title, h('div', { class: 'small' }, L(`${x.assignee ? name(x.assignee) : 'Unassigned'} · ${stat(x.status)}${x.section ? ' · section ' + x.section : ''} · ${when(x.updatedAt || x.createdAt)}`, `${x.assignee ? name(x.assignee) : 'Belum ada'} · ${stat(x.status)}${x.section ? ' · bagian ' + x.section : ''} · ${when(x.updatedAt || x.createdAt)}`)))));
    const done = t.filter((x) => x.result);
    if (done.length) out.push(h('h3', {}, L('Work results', 'Hasil kerja')), ...done.map((x) => h('details', {}, h('summary', {}, `#${x.no} ${x.title.slice(0, 70)} (${stat(x.status)})`), h('div', { class: 'result' }, x.result))));
    const st = d.state || {};
    if (st.lastCheckedAt) out.push(h('div', { class: 'small' }, L(`Last draft check: ${when(st.lastCheckedAt)} · ${String(st.lastCheckedFile || '').slice(0, 80)}`, `Cek draf terakhir: ${when(st.lastCheckedAt)} · ${String(st.lastCheckedFile || '').slice(0, 80)}`)));
    out.push(h('div', { class: 'row' }, h('button', { class: 'primary', on: { click: () => { tab = 'copier'; render(); } } }, L('Print / save this report (photocopier)', 'Cetak / simpan laporan ini (fotokopi)'))));
    return out;
  }

  // ---------- Floor 2 photocopier ----------
  let copyKind = 'report', copyId = '';
  function copier() {
    const d = data();
    const opts = [['report|', L('Office report (all tickets + work results)', 'Laporan kantor (semua tiket + hasil kerja)')],
      ...d.tickets.map((t) => [`ticket|${t.id}`, L(`Ticket #${t.no}: ${t.title.slice(0, 60)}${t.result ? ' (has result)' : ''}`, `Tiket #${t.no}: ${t.title.slice(0, 60)}${t.result ? ' (ada hasil)' : ''}`)]),
      ...d.meetings.slice().reverse().map((m) => [`meeting|${m.id}`, L(`Minutes: ${m.topic} (${when(m.createdAt)})`, `Notulen: ${m.topic} (${when(m.createdAt)})`)])];
    const cur = `${copyKind}|${copyId}`;
    const url = (f) => `/api/export?kind=${copyKind}&id=${encodeURIComponent(copyId)}&format=${f}`;
    const go = (f) => { RENDER.flashPrinter && RENDER.flashPrinter(); };
    return [h('h2', {}, L('Photocopier (Floor 2)', 'Mesin fotokopi (Lantai 2)')),
      h('p', { class: 'small' }, L('Choose a document, then a format. Word and Excel download right away. PDF opens a print page: choose "Save as PDF".', 'Pilih dokumen, lalu pilih format. Word dan Excel langsung terunduh. PDF membuka halaman cetak: pilih "Save as PDF" / "Simpan sebagai PDF".')),
      h('select', { id: 'copyWhat', on: { change: (e) => { [copyKind, copyId] = e.target.value.split('|'); render(); } } }, ...opts.map(([v, l]) => h('option', { value: v, selected: v === cur }, l))),
      h('div', { class: 'row' },
        h('a', { href: url('pdf'), target: '_blank', rel: 'noopener', on: { click: () => go('pdf') } }, h('button', { class: 'primary' }, 'PDF')),
        h('a', { href: url('docx'), download: '', on: { click: () => go('docx') } }, h('button', { class: 'primary' }, 'Word (.docx)')),
        h('a', { href: url('xlsx'), download: '', on: { click: () => go('xlsx') } }, h('button', { class: 'primary' }, 'Excel (.xlsx)'))),
      h('p', { class: 'small' }, L('Documents are built from the data on the server, so they are always up to date.', 'Isi dokumen diambil langsung dari data di server, jadi selalu versi terbaru.')),
      h('h3', {}, L('For another AI chat', 'Untuk chat AI lain')),
      h('a', { href: '/api/export?kind=aipack', download: '', on: { click: () => go('md') } }, h('button', { class: 'primary' }, L('AI package (.md)', 'Paket untuk AI (.md)')))];
  }

  // Without AI: a ready-made prompt for Claude in chat; the answer is pasted back with L('Hand over', 'Serahkan').
  function claudePrompt(t) {
    const role = (R.STAFF[t.assignee] || {}).role || 'thesis assistant';
    return `Kamu adalah ${role} di kantor skripsi SNYP University. Skripsi saya: "Pengaruh Trust in AI dan AI Reliance terhadap Minat Investasi Syariah pada Pengguna Artificial Intelligence".

Tugas (tiket #${t.no}${t.section ? ', bagian ' + t.section : ''}):
${t.title}

Detail:
${t.detail || '-'}
${(t.comments || []).length ? '\nCatatan sebelumnya:\n' + t.comments.map((c) => '- ' + name(c.who) + ': ' + c.text).join('\n') + '\n' : ''}
Tolong kerjakan tugas ini dalam Bahasa Indonesia akademik. Tulis hasil akhir yang bisa langsung saya tempel ke skripsi. Jika butuh data yang tidak ada, tulis dengan jelas data apa yang harus saya isi, jangan mengarang angka atau referensi.`;
  }

  // Search the web from the office (opens Google / Google Scholar in a new tab).
  const gq = (q) => 'https://www.google.com/search?q=' + encodeURIComponent(q);
  const sq = (q) => 'https://scholar.google.com/scholar?q=' + encodeURIComponent(q);
  const searchTerms = (t) => String(t.title || '').replace(/^Unfinished placeholder:\s*/i, '').replace(/[[\]…]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  function searchRow(q) {
    return h('div', { class: 'row' },
      h('a', { href: gq(q), target: '_blank', rel: 'noopener' }, h('button', {}, L('Search Google', 'Cari di Google'))),
      h('a', { href: sq(q), target: '_blank', rel: 'noopener' }, h('button', {}, 'Google Scholar')));
  }
  function continueBox() {
    const thesis = docs && docs.files ? (docs.files.filter((f) => /^01_Thesis_Draft\/SKRIPSI_TERSUSUN_v\d+\.docx$/i.test(f.path)).sort((a, b) => b.path.localeCompare(a.path, undefined, { numeric: true }))[0]) : null;
    return h('div', { class: 'note' },
      h('h3', {}, L('Continue your thesis', 'Lanjutkan skripsi')),
      h('div', { class: 'small' }, L('Download the compiled thesis, or the AI package (thesis text + office status + instructions) and upload it to a Claude chat to continue.', 'Unduh skripsi yang sudah tersusun, atau Paket untuk AI (teks skripsi + status kantor + instruksi) lalu upload ke chat Claude untuk melanjutkan.')),
      h('div', { class: 'row' },
        thesis ? h('a', { href: '/api/docs?path=' + encodeURIComponent(thesis.path), target: '_blank', rel: 'noopener' }, h('button', { class: 'primary' }, L('Compiled thesis (.docx)', 'Skripsi tersusun (.docx)'))) : h('button', { on: { click: loadDocs } }, L('Load archive to find the thesis', 'Buka arsip untuk cari skripsi')),
        h('a', { href: '/api/export?kind=aipack', download: '' }, h('button', { class: 'primary', id: 'aiPack' }, L('AI package (.md)', 'Paket untuk AI (.md)')))),
      h('input', { keep: 'webq', placeholder: L('Search the web, e.g. AI reliance investment intention', 'Cari di internet, mis. AI reliance investment intention') }),
      searchRow(drafts.webq || 'Trust in AI AI Reliance minat investasi syariah'));
  }
  function documents() {
    if (!docs) setTimeout(loadDocs, 0);
    const out = [continueBox(), h('h2', {}, L('Thesis document archive', 'Arsip dokumen skripsi')), h('div', { class: 'row' },
      h('button', { on: { click: loadDocs } }, docs ? L('Refresh list', 'Muat ulang daftar') : L('Load archive', 'Buka arsip')),
      h('button', { class: 'primary', id: 'draftCheck', on: { click: () => run(async () => { const r = await API.req('POST', '/api/draftcheck', {}); await API.refresh(true); flash = L(`Draft check: ${r.findings.length} findings, ${r.created.length} new ticket(s)${r.unchanged ? ' (draft unchanged since last check)' : ''}.`, `Cek draf: ${r.findings.length} temuan, ${r.created.length} tiket baru${r.unchanged ? ' (draf belum berubah sejak cek terakhir)' : ''}.`); }) } }, L('Run draft check', 'Jalankan cek draf')))];
    const st = data().state;
    if (st.lastCheckedFile) out.push(h('div', { class: 'small' }, L(`Last check: ${st.lastCheckedFile.slice(0, 60)}… on ${when(st.lastCheckedAt)}`, `Cek terakhir: ${st.lastCheckedFile.slice(0, 60)}… pada ${when(st.lastCheckedAt)}`)));
    if (docs && docs.error) out.push(h('div', { class: 'err' }, docs.error));
    if (docs && docs.files) {
      const by = {};
      for (const f of docs.files) (by[f.path.split('/')[0]] = by[f.path.split('/')[0]] || []).push(f);
      out.push(h('div', { class: 'small' }, L(`${docs.files.length} files · source: ${docs.mode === 'github' ? 'private GitHub archive' : 'local folder'}`, `${docs.files.length} file · sumber: ${docs.mode === 'github' ? 'arsip GitHub privat' : 'folder lokal'}`)));
      for (const [folder, files] of Object.entries(by)) out.push(h('details', { class: 'files', open: folder.startsWith('0') && files.length < 6 }, h('summary', {}, `${folder} (${files.length})`),
        ...files.map((f) => h('a', { href: '/api/docs?path=' + encodeURIComponent(f.path), target: '_blank', rel: 'noopener' }, `${f.path.split('/').slice(1).join('/') || f.path} · ${(f.size / 1024).toFixed(0)} KB`))));
    }
    return out;
  }
  async function loadDocs() { try { docs = await API.req('GET', '/api/docs'); } catch (e) { docs = { error: e.message }; } render(); }

  function activity() {
    const d = data();
    return [h('h2', {}, L('Activity log', 'Log aktivitas')), h('div', { class: 'log' }, ...d.activity.slice(0, 150).map((a) => h('div', {}, h('span', { class: 'small' }, when(a.at) + ' · '), h('strong', {}, name(a.who) + ' '), logText(a.text))))];
  }

  function backup() {
    return [h('h2', {}, L('Backup and restore', 'Cadangan dan pemulihan')),
      h('p', { class: 'small' }, L('ABB.json holds all app data: tickets, logs, meetings, reviews and settings. Thesis documents are backed up separately in the archive. A snapshot is saved automatically every day and before every restore.', 'ABB.json berisi semua data aplikasi: tiket, log, rapat, review dan pengaturan. Dokumen skripsi dicadangkan terpisah di arsip. Snapshot disimpan otomatis setiap hari dan sebelum setiap pemulihan.')),
      h('a', { href: '/api/backup', download: 'ABB.json' }, h('button', { class: 'primary' }, L('Export ABB.json', 'Ekspor ABB.json'))),
      h('h3', {}, L('Restore from ABB.json', 'Pulihkan dari ABB.json')),
      h('input', { type: 'file', accept: '.json,application/json', id: 'importFile' }),
      h('button', { id: 'importBtn', on: { click: importFile } }, L('Restore this file', 'Pulihkan file ini')),
      h('h3', {}, L('Automatic snapshots', 'Snapshot otomatis')),
      h('button', { on: { click: async () => { try { snaps = (await API.req('GET', '/api/backup?list=1')).snapshots; } catch (e) { snaps = []; flash = '⚠ ' + e.message; } render(); } } }, L('Show snapshots', 'Tampilkan snapshot')),
      ...(snaps || []).map((s) => h('div', { class: 'row' }, h('span', { style: 'flex:1' }, s),
        h('a', { href: '/api/backup?snapshot=' + encodeURIComponent(s) }, L('download', 'unduh')),
        h('button', { on: { click: () => { if (confirm(L('Restore snapshot ', 'Pulihkan snapshot ') + s + L('? Current data is snapshotted first.', '? Data saat ini disimpan sebagai snapshot dulu.'))) run(async () => { await API.req('POST', '/api/backup', { snapshot: s }); await API.refresh(true); }, L('Snapshot restored.', 'Snapshot dipulihkan.')); } } }, L('Restore', 'Pulihkan'))))];
  }
  async function importFile() {
    const f = $('#importFile').files[0]; if (!f) return;
    let parsed; try { parsed = JSON.parse(await f.text()); } catch (e) { flash = L('⚠ Not a valid JSON file.', '⚠ Bukan file JSON yang valid.'); return render(); }
    if (!confirm(L(`Restore ${parsed.tickets ? parsed.tickets.length : 0} tickets from ${f.name}? Current data is saved as a snapshot first.`, `Pulihkan ${parsed.tickets ? parsed.tickets.length : 0} tiket dari ${f.name}? Data saat ini disimpan sebagai snapshot dulu.`))) return;
    run(async () => { const r = await API.req('POST', '/api/backup', { data: parsed }); await API.refresh(true); flash = L(`Restored ${r.tickets} tickets. Previous data saved as snapshot ${r.snapshot}.`, `${r.tickets} tiket dipulihkan. Data sebelumnya disimpan sebagai snapshot ${r.snapshot}.`); });
  }

  function settings() {
    const s = data().settings;
    return [h('h2', {}, L('Settings', 'Pengaturan')),
      h('label', { class: 'row' }, h('input', { type: 'checkbox', id: 'nightToggle', style: 'width:auto', checked: !!s.nightShift, on: { change: (e) => op('settings.set', { key: 'nightShift', value: e.target.checked }) } }), L('Night Shift on (office goes dark; night tickets get worked)', 'Shift Malam aktif (kantor gelap; tiket malam dikerjakan)')),
      h('div', { class: 'small' }, L('Storage: ', 'Penyimpanan: ') + (API.S.mode === 'server' ? L('Upstash Redis on the server, shared by all your devices.', 'Upstash Redis di server, dipakai bersama semua perangkatmu.') : L('LOCAL TEST MODE: a file on this computer only. Deploy to Vercel with Upstash for real storage.', 'MODE TES LOKAL: file di komputer ini saja. Deploy ke Vercel dengan Upstash untuk penyimpanan sungguhan.'))),
      h('div', { class: 'small' }, 'AI: ' + (API.S.ai ? L('on (ANTHROPIC_API_KEY set). Staff draft results and meeting views with Claude.', 'aktif (ANTHROPIC_API_KEY terpasang). Staf menyusun hasil dan pendapat rapat dengan Claude.') : L('off. Trisha routes by keywords; staff wait for you to hand them results.', 'mati. Trisha membagi tiket berdasarkan kata kunci; staf menunggu kamu menyerahkan hasil.'))),
      h('div', { class: 'small' }, L('This device: ', 'Perangkat ini: ') + (API.S.leader ? L('drives the office (leader).', 'menggerakkan kantor (leader).') : L('watching. Another open device is driving the office.', 'menonton. Perangkat lain yang sedang menggerakkan kantor.'))),
      h('button', { on: { click: async () => { await API.logout(); location.reload(); } } }, L('Log out', 'Keluar'))];
  }

  const VIEWS = { reception, tickets, chat, meeting, report, copier, docs: documents, activity, backup, settings };
  function render() {
    R.applyNames((data().settings || {}).names);
    const v = $('#view'); if (!v) return;
    const focus = document.activeElement && document.activeElement.id;
    const scroll = v.scrollTop;
    const openDetails = [...v.querySelectorAll('details')].map((d, i) => d.open ? i : -1).filter((i) => i >= 0);
    v.replaceChildren(...(flash ? [h('div', { class: flash.startsWith('⚠') ? 'err' : 'small', id: 'flash' }, flash)] : []), ...VIEWS[tab]().flat().filter((x) => x != null && x !== false));
    [...v.querySelectorAll('details')].forEach((d, i) => { if (openDetails.includes(i)) d.open = true; });
    v.scrollTop = scroll;
    if (focus && document.getElementById(focus)) document.getElementById(focus).focus();
    document.querySelectorAll('#tabs button').forEach((b) => { b.classList.toggle('on', b.dataset.tab === tab); const tl = b.querySelector('.tl'); if (tl && TABS[b.dataset.tab]) tl.textContent = L(...TABS[b.dataset.tab]); });
    $('#lang').textContent = I18N.lang === 'id' ? 'EN' : 'ID';
    const need = data().tickets.filter((t) => ['delivered', 'ready'].includes(t.status)).length;
    $('#tcount').textContent = need ? `(${need})` : '';
    $('#storage').textContent = API.S.mode === 'server' ? L('Saved on server · shared across devices', 'Tersimpan di server · sama di semua perangkat') : API.S.mode === 'local' ? L('LOCAL TEST MODE · this computer only', 'MODE TES LOKAL · komputer ini saja') : L('Connecting…', 'Menghubungkan…');
    $('#storage').classList.toggle('warn', API.S.mode !== 'server');
    $('#ai').textContent = API.S.ai ? L('AI on', 'AI aktif') : L('AI off', 'AI mati');
    $('#leader').textContent = API.S.online ? (API.S.leader ? L('This device drives the office', 'Perangkat ini menggerakkan kantor') : L('Watching', 'Menonton')) : L('Offline: ', 'Offline: ') + API.S.error;
  }

  document.addEventListener('click', (e) => { const b = e.target.closest('#tabs button'); if (b) { tab = b.dataset.tab; flash = ''; try { localStorage.setItem('snyp-tab', tab); } catch (err) { /* ignore */ } if (tab === 'docs' && !docs) loadDocs(); render(); } });

  // Avatar card that pops up when you click someone or when they talk to you.
  let cardTimer = null;
  function showCard(id, line) {
    const box = $('#who'), c = SIM.chars[id]; if (!box || !c) return;
    const st0 = R.STAFF[id] || { name: L('You', 'Kamu'), role: L('Student', 'Mahasiswa') }; const st = { name: st0.name, role: role(id, st0.role) };
    const mine = data().tickets.filter((t) => t.assignee === id && !['closed', 'approved'].includes(t.status));
    const say = line || (c.bubble && c.bubble.text) || '';
    box.replaceChildren(
      R.STAFF[id] ? h('img', { class: 'whofig', src: 'img/full/' + id + '.webp', alt: '' }) : h('span'),
      h('div', { class: 'whotxt' },
        h('strong', {}, st.name), h('div', { class: 'small' }, st.role),
        h('div', { class: 'small' }, c.jobName ? L('Doing: ', 'Sedang: ') + c.jobName : L('At their spot', 'Di tempatnya')),
        ...mine.slice(0, 3).map((t) => h('div', { class: 'small' }, `#${t.no} ${stat(t.status)}`)),
        say ? h('div', { class: 'whosay' }, say.length > 220 ? say.slice(0, 219) + '…' : say) : h('span'),
        h('button', { class: 'whox', 'aria-label': L('Close', 'Tutup'), on: { click: (e) => { e.stopPropagation(); box.hidden = true; } } }, '×')));
    box.hidden = false;
    clearTimeout(cardTimer); cardTimer = setTimeout(() => { box.hidden = true; }, 12000);
  }
  if (SIM.speak) { const sp = SIM.speak; SIM.speak = (id, text, mood) => { sp(id, text, mood); showCard(id, text); }; }

  // Character inspector.
  function inspect(evt) {
    if (RENDER.onScreen && RENDER.onScreen(evt)) { tab = 'report'; flash = ''; render(); $('#who').hidden = true; return; }
    if (RENDER.onPrinter && RENDER.onPrinter(evt)) { copyKind = 'report'; copyId = ''; tab = 'copier'; flash = ''; render(); $('#who').hidden = true; return; }
    const c = RENDER.hit(evt), box = $('#who');
    if (!c) { box.hidden = true; return; }
    showCard(c.id);
    if (R.STAFF[c.id]) { // clicking a staff member opens the chat with them
      talkTo = c.id; try { localStorage.setItem('snyp-talk', c.id); } catch (e) { /* private mode */ }
      tab = 'chat'; flash = ''; render();
      setTimeout(() => { const ta = document.getElementById('talk'); if (ta) ta.focus({ preventScroll: true }); }, 0);
    }
  }

  const TABS = { reception: ['Reception', 'Resepsionis'], tickets: ['Tickets', 'Tiket'], chat: ['Talk', 'Ngobrol'], meeting: ['Meeting', 'Rapat'], report: ['Report', 'Laporan'], copier: ['Copier', 'Fotokopi'], docs: ['Documents', 'Dokumen'], activity: ['Activity', 'Aktivitas'], backup: ['Backup', 'Cadangan'], settings: ['Settings', 'Pengaturan'] };
  document.addEventListener('click', (e) => { if (e.target.closest('#lang')) { I18N.set(I18N.lang === 'id' ? 'en' : 'id'); render(); } });
  async function boot() {
    $('#loginText').textContent = L('Your virtual thesis office. Enter the office password.', 'Kantor skripsi virtualmu. Masukkan password kantor.');
    $('#loginBtn').textContent = L('Enter', 'Masuk');
    $('#pw').placeholder = L('Password', 'Password');
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
