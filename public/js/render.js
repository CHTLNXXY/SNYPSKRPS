// Draws the office artwork and the people moving in it.
(function () {
  const T = (en, id) => (window.SNYP_I18N ? window.SNYP_I18N.L(en, id) : en);
  const Wd = window.SNYP_WORLD, R = window.SNYP_ROSTER, SIM = window.SNYP_SIM, API = window.SNYP_API;
  const CW = Wd.IMG.w, CH = Wd.IMG.h;
  const STATUS_COLOR = { received: '#b9a37a', delivered: '#e8a33d', authorized: '#4f8fd9', working: '#3f7ac4', ready: '#3aa66a', revision: '#d9534f' };
  const LOOK = { // caveman outfits matching the artwork
    rina:     { hair: '#3a2416', style: 'bun',  tunic: '#c8782f' },
    nadia:    { hair: '#2b1a10', style: 'long', tunic: '#b86a2b' },
    stat:     { hair: '#24170f', style: 'short', tunic: '#c27a35' },
    metod:    { hair: '#3b2a1c', style: 'short', tunic: '#a9662c' },
    lib:      { hair: '#2e1d12', style: 'long', tunic: '#cf8a3e' },
    director: { hair: '#1f140c', style: 'beard', tunic: '#8f4f22', staff: true },
    owner:    { hair: '#1a120b', style: 'short', tunic: '#5f7f9c' },
  };
  const S = 1.25; // character scale in artwork pixels

  let canvas, ctx, dpr = 1, img = null, imgReady = false, imgFailed = false;
  function setup(el) {
    canvas = el; ctx = el.getContext('2d');
    img = new Image(); img.onload = () => { imgReady = true; }; img.onerror = () => { imgFailed = true; }; img.src = Wd.IMG.src;
    const fit = () => { dpr = Math.min(2, window.devicePixelRatio || 1); canvas.width = CW * dpr; canvas.height = CH * dpr; };
    fit(); window.addEventListener('resize', fit);
    canvas.style.aspectRatio = CW + ' / ' + CH;
    requestAnimationFrame(frame);
  }
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  function caveman(c, now) {
    const L = LOOK[c.id] || LOOK.owner, st = R.STAFF[c.id] || { name: T('You', 'Kamu') };
    const sitting = !c.walking && ['sit', 'work', 'ready', 'waiting', 'night-wait'].includes(c.pose);
    const x = c.x, y = c.y, f = c.facing || 1;
    ctx.save(); ctx.globalAlpha = c.alpha == null ? 1 : c.alpha;
    ctx.translate(x, y); ctx.scale(S, S);
    const bob = c.walking ? Math.abs(Math.sin(now / 120)) * 2 : 0, sw = c.walking ? Math.sin(now / 120) * 5 : 0;
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(0, 0, 13, 5, 0, 0, 7); ctx.fill();
    const skin = '#e3a878', skinD = '#c98b5e';
    // legs
    ctx.strokeStyle = skinD; ctx.lineWidth = 5; ctx.lineCap = 'round';
    if (sitting) { ctx.beginPath(); ctx.moveTo(-4, -14); ctx.lineTo(4 * f + -4, -8); ctx.lineTo(4 * f - 4, 0); ctx.moveTo(4, -14); ctx.lineTo(4 * f + 6, -8); ctx.lineTo(4 * f + 6, 0); ctx.stroke(); }
    else { ctx.beginPath(); ctx.moveTo(-4, -16); ctx.lineTo(-4 + sw, -1); ctx.moveTo(4, -16); ctx.lineTo(4 - sw, -1); ctx.stroke(); }
    const top = (sitting ? -40 : -46) - bob;
    // tunic with leopard spots
    ctx.fillStyle = L.tunic; ctx.beginPath(); ctx.moveTo(-10, top + 10); ctx.lineTo(10, top + 8); ctx.lineTo(12, top + 30); ctx.lineTo(-12, top + 32); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(60,30,10,.75)';
    for (const [sx, sy] of [[-6, 16], [3, 13], [7, 22], [-3, 25], [-8, 27], [5, 29]]) { ctx.beginPath(); ctx.ellipse(sx, top + sy, 1.8, 1.3, 0, 0, 7); ctx.fill(); }
    // arms
    ctx.strokeStyle = skin; ctx.lineWidth = 4.5;
    const work = c.pose === 'work' && !c.walking ? Math.sin(now / 90) * 3 : 0;
    ctx.beginPath(); ctx.moveTo(-10, top + 13); ctx.lineTo(-13 + (c.walking ? -sw : 6 * f), top + 26 + work); ctx.moveTo(10, top + 13); ctx.lineTo(13 + (c.walking ? sw : 6 * f), top + 26 - work); ctx.stroke();
    if (L.staff) { ctx.strokeStyle = '#7a5a33'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(15 * f, top - 6); ctx.lineTo(15 * f, 0); ctx.stroke(); ctx.fillStyle = '#cfcfcf'; ctx.beginPath(); ctx.moveTo(15 * f, top - 14); ctx.lineTo(12 * f, top - 5); ctx.lineTo(18 * f, top - 5); ctx.fill(); }
    // head
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(0, top - 2, 10, 0, 7); ctx.fill();
    ctx.fillStyle = '#2a1a10'; ctx.beginPath(); ctx.arc(3 * f, top - 2, 1.4, 0, 7); ctx.arc(-3 * f + 6 * f, top - 2, 0, 0, 7); ctx.fill();
    ctx.fillStyle = L.hair;
    ctx.beginPath(); ctx.arc(0, top - 5, 10.5, Math.PI * 1.02, Math.PI * 1.98); ctx.fill();
    if (L.style === 'bun') { ctx.beginPath(); ctx.arc(-2 * f, top - 15, 4.5, 0, 7); ctx.fill(); }
    if (L.style === 'long') { ctx.fillRect(-11, top - 6, 4, 16); ctx.fillRect(7, top - 6, 4, 16); }
    if (L.style === 'beard') { ctx.beginPath(); ctx.arc(0, top + 3, 8, 0, Math.PI); ctx.fill(); }
    if (c.carrying) { ctx.fillStyle = '#f3ead6'; ctx.strokeStyle = '#8a7350'; ctx.lineWidth = 1; ctx.fillRect(8 * f - 6, top + 16, 13, 10); ctx.strokeRect(8 * f - 6, top + 16, 13, 10); ctx.fillStyle = '#b5472f'; ctx.fillRect(8 * f - 6, top + 16, 13, 2.5); }
    ctx.restore();
    const headY = y + (top - 14) * S;
    const badge = { ready: ['#3aa66a', '✓'], waiting: ['#e8a33d', '?'], 'night-wait': ['#3c4f80', '☾'] }[c.pose] || (c.pose === 'work' && !c.walking ? ['#3f7ac4', '…'] : null);
    let by = headY - 6;
    if (badge) { by = headY - 14 - (c.pose === 'ready' ? Math.abs(Math.sin(now / 300)) * 5 : 0); ctx.fillStyle = badge[0]; ctx.beginPath(); ctx.arc(x, by, 10, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = '700 13px system-ui'; ctx.textAlign = 'center'; ctx.fillText(badge[1], x, by + 4.5); by -= 12; }
    // mood while talking to you
    if (c.mood && c.mood.until > now) { const e = { sad: '😟', happy: '😊', think: '🤔' }[c.mood.m]; if (e) { ctx.font = '18px system-ui'; ctx.textAlign = 'center'; ctx.fillText(e, x + 16, headY - 2); by = Math.min(by, headY - 20); } }
    // name tag
    const name = c.nameOverride || st.name;
    ctx.font = '700 12px system-ui'; ctx.textAlign = 'center';
    const tw = ctx.measureText(name).width + 10;
    ctx.fillStyle = 'rgba(30,20,10,.72)'; roundRect(x - tw / 2, y + 6, tw, 16, 8); ctx.fill();
    ctx.fillStyle = '#ffe9c4'; ctx.fillText(name, x, y + 18);
    if (c.bubble) bubble(x, by, c.bubble.text);
  }

  function bubble(x, y, text) {
    ctx.font = '14px system-ui, sans-serif';
    const words = String(text).split(/\s+/), lines = []; let cur = '';
    for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > 210) { lines.push(cur); cur = w; } else cur = t; if (lines.length === 3) break; }
    if (lines.length < 3 && cur) lines.push(cur); else if (lines.length === 3) lines[2] = lines[2].replace(/\s*\S*$/, '') + '…';
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 16, h = lines.length * 17 + 10;
    const bx = Math.max(6, Math.min(CW - w - 6, x - w / 2)), byy = Math.max(4, y - h - 6);
    ctx.fillStyle = 'rgba(255,250,240,.97)'; ctx.strokeStyle = '#8a6b45'; ctx.lineWidth = 1.5; roundRect(bx, byy, w, h, 8); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 5, byy + h); ctx.lineTo(x, byy + h + 7); ctx.lineTo(x + 5, byy + h); ctx.fill();
    ctx.fillStyle = '#2b1d12'; ctx.textAlign = 'left'; lines.forEach((l, i) => ctx.fillText(l, bx + 8, byy + 19 + i * 17));
  }

  function papers(data) {
    for (const [who, [px, py]] of Object.entries(Wd.DESK_PAPERS)) {
      const mine = data.tickets.filter((t) => t.assignee === who && STATUS_COLOR[t.status]);
      mine.slice(0, 5).forEach((t, i) => {
        const x = px + i * 4, y = py - i * 4;
        ctx.fillStyle = '#f3ead6'; ctx.strokeStyle = '#8a7350'; ctx.lineWidth = 1; ctx.fillRect(x - 8, y - 6, 16, 11); ctx.strokeRect(x - 8, y - 6, 16, 11);
        ctx.fillStyle = STATUS_COLOR[t.status]; ctx.fillRect(x - 8, y - 6, 16, 3);
      });
      if (mine.length) { ctx.font = '700 11px system-ui'; ctx.textAlign = 'center'; const label = mine.map((t) => '#' + t.no).join(' '); const tw = ctx.measureText(label).width + 8; ctx.fillStyle = 'rgba(30,20,10,.7)'; roundRect(px - tw / 2, py + 8, tw, 15, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText(label, px, py + 19); }
    }
  }

  // The rooftop's big white screen shows a live report. Drawn in a flat 640x280 box, then
  // skewed onto the screen's parallelogram in the artwork.
  const SCR = { x: 783, y: 54, ux: [306, 39], vy: 134, W: 640, H: 280 };
  const SHORT = { received: 'Di resepsionis', delivered: 'Tunggu izin', authorized: 'Diizinkan', working: 'Dikerjakan', ready: 'Siap disetujui', revision: 'Revisi', approved: 'Disetujui', closed: 'Ditutup' };
  const SHORT_EN = { received: 'At reception', delivered: 'Waiting', authorized: 'Authorized', working: 'Working', ready: 'Ready', revision: 'Revision', approved: 'Approved', closed: 'Closed' };
  const lab = (k) => T(SHORT_EN[k] || k, SHORT[k] || k);
  function clip(t, n) { t = String(t || '').replace(/\s+/g, ' '); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
  function screen(data) {
    const W = SCR.W, H = SCR.H;
    ctx.save();
    ctx.transform(SCR.ux[0] / W, SCR.ux[1] / W, 0, SCR.vy / H, SCR.x, SCR.y);
    ctx.fillStyle = 'rgba(250,246,238,.96)'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    const m = (data.meetings || []).find((x) => x.status !== 'ended');
    const tickets = data.tickets || [];
    ctx.fillStyle = '#5a3416'; ctx.fillRect(0, 0, W, 40);
    ctx.fillStyle = '#ffe9c2'; ctx.font = '700 24px system-ui';
    ctx.fillText(m ? clip(T('Meeting: ', 'Rapat: ') + m.topic, 44) : T('SNYP University Report', 'Laporan SNYP University'), 14, 28);
    if (m) {
      let y = 70;
      const lines = m.minutes ? m.minutes.split('\n').filter(Boolean) : (m.contributions || []).map((c) => ((R.STAFF[c.who] || { name: T('You', 'Kamu') }).name) + ': ' + c.text);
      ctx.fillStyle = '#7a5530'; ctx.font = '600 17px system-ui'; ctx.fillText(m.minutes ? T('Minutes (Nadia)', 'Notulen (Nadia)') : T('Discussion', 'Diskusi'), 14, y - 8 - 6); 
      ctx.font = '18px system-ui'; ctx.fillStyle = '#2b1d12';
      for (const l of lines.slice(-6)) { ctx.fillText(clip(l, 62), 14, y + 10); y += 28; }
      if ((m.actions || []).length) { ctx.fillStyle = '#a3461f'; ctx.font = '700 18px system-ui'; ctx.fillText(clip('Action: ' + m.actions.map((a) => a.text).join(' · '), 60), 14, H - 14); }
    } else {
      const open = tickets.filter((t) => !['approved', 'closed'].includes(t.status));
      const groups = ['received', 'delivered', 'working', 'ready', 'revision'].map((k) => [k, tickets.filter((t) => t.status === k || (k === 'working' && t.status === 'authorized')).length]);
      const done = tickets.length - open.length;
      let x = 14;
      for (const [k, n] of groups.concat([['approved', done]])) {
        const col = STATUS_COLOR[k] || '#3aa66a';
        ctx.fillStyle = col; ctx.font = '800 34px system-ui'; ctx.fillText(String(n), x, 84);
        ctx.fillStyle = '#5b4632'; ctx.font = '600 13px system-ui'; ctx.fillText(k === 'approved' ? T('Done', 'Selesai') : lab(k), x, 102);
        x += 104;
      }
      let y = 134;
      ctx.font = '600 16px system-ui'; ctx.fillStyle = '#7a5530';
      ctx.fillText(open.length ? T(`Open tickets (${open.length})`, `Tiket terbuka (${open.length})`) : T('No open tickets', 'Tidak ada tiket terbuka'), 14, y - 8);
      for (const t of open.sort((a, b) => a.no - b.no).slice(0, 5)) {
        ctx.fillStyle = STATUS_COLOR[t.status] || '#888'; ctx.fillRect(14, y + 2, 10, 18);
        ctx.fillStyle = '#2b1d12'; ctx.font = '700 17px system-ui'; ctx.fillText('#' + t.no, 30, y + 17);
        ctx.font = '17px system-ui'; ctx.fillText(clip(`${(R.STAFF[t.assignee] || { name: '?' }).name} · ${t.title}`, 44), 70, y + 17);
        ctx.fillStyle = '#7a5530'; ctx.font = '600 14px system-ui'; ctx.textAlign = 'right'; ctx.fillText(lab(t.status), W - 12, y + 17); ctx.textAlign = 'left';
        y += 26;
      }
      const st = data.state || {};
      ctx.fillStyle = '#ffd59a'; ctx.font = '700 15px system-ui'; ctx.textAlign = 'right'; ctx.fillText(T('Click the screen to enlarge ▸', 'Klik layar untuk memperbesar ▸'), W - 12, 28 + 0); ctx.textAlign = 'left';
      if (st.lastCheckedAt) { ctx.fillStyle = '#8a6d4d'; ctx.font = '13px system-ui'; ctx.fillText(clip(T('Last draft check: ', 'Cek draf terakhir: ') + new Date(st.lastCheckedAt).toLocaleString(T('en-GB', 'id-ID')) + ' · ' + st.lastCheckedFile, 80), 14, H - 8); }
    }
    ctx.restore();
  }
  const PRINTER = { x0: 1128, y0: 568, x1: 1205, y1: 670 };
  let printerFlash = 0;
  function flashPrinter() { printerFlash = performance.now(); }
  function onPrinter(evt) {
    const r = canvas.getBoundingClientRect(), mx = (evt.clientX - r.left) * CW / r.width, my = (evt.clientY - r.top) * CH / r.height;
    return mx >= PRINTER.x0 && mx <= PRINTER.x1 && my >= PRINTER.y0 && my <= PRINTER.y1;
  }
  function printerLabel(now) {
    const cx = (PRINTER.x0 + PRINTER.x1) / 2;
    const k = printerFlash && now - printerFlash < 2500 ? 1 - (now - printerFlash) / 2500 : 0;
    if (k) { const g = ctx.createRadialGradient(cx, 610, 4, cx, 610, 70); g.addColorStop(0, `rgba(120,220,255,${0.6 * k})`); g.addColorStop(1, 'rgba(120,220,255,0)'); ctx.fillStyle = g; ctx.fillRect(cx - 70, 540, 140, 140); }
    ctx.font = '700 13px system-ui'; ctx.textAlign = 'center';
    const txt = k ? T('Printing…', 'Mencetak…') : T('🖨 Copier', '🖨 Fotokopi');
    const tw = ctx.measureText(txt).width + 12;
    ctx.fillStyle = 'rgba(0,0,0,.6)'; roundRect(cx - tw / 2, PRINTER.y0 - 22, tw, 18, 9); ctx.fill();
    ctx.fillStyle = '#e6f6ff'; ctx.fillText(txt, cx, PRINTER.y0 - 9); ctx.textAlign = 'left';
  }
  function onScreen(evt) {
    const r = canvas.getBoundingClientRect(), mx = (evt.clientX - r.left) * CW / r.width, my = (evt.clientY - r.top) * CH / r.height;
    const u = (mx - SCR.x) / SCR.ux[0]; const v = (my - SCR.y - u * SCR.ux[1]) / SCR.vy;
    return u >= 0 && u <= 1 && v >= 0 && v <= 1;
  }

  function frame() {
    const now = performance.now();
    const data = API.S.data || { tickets: [], settings: {}, meetings: [] };
    const night = !!data.settings.nightShift;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = night ? '#0d0f18' : '#1b1612'; ctx.fillRect(0, 0, CW, CH);
    if (imgReady) ctx.drawImage(img, 0, 0, CW, CH);
    else if (imgFailed) { ctx.save(); ctx.fillStyle = '#ffcf7a'; ctx.font = 'bold 30px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Gambar kantor tidak ditemukan: public/' + Wd.IMG.src, CW / 2, CH / 2 - 20);
      ctx.font = '22px sans-serif'; ctx.fillText('Upload office.webp ke folder public/img/ di GitHub, lalu tunggu redeploy.', CW / 2, CH / 2 + 20); ctx.restore(); }
    ctx.font = '700 16px system-ui'; ctx.textAlign = 'left';
    for (const F of Wd.FLOORS) { ctx.fillStyle = 'rgba(0,0,0,.55)'; const tw = ctx.measureText(T(F.name, F.id)).width + 16; roundRect(F.label[0] - 8, F.label[1] - 17, tw, 24, 12); ctx.fill(); ctx.fillStyle = '#ffe2b0'; ctx.fillText(T(F.name, F.id), F.label[0], F.label[1]); }
    screen(data);
    printerLabel(now);
    papers(data);
    const chars = Object.values(SIM.chars).filter((c) => c.visible).sort((a, b) => a.y - b.y);
    for (const c of chars) caveman(c, now);
    if (night) {
      ctx.fillStyle = 'rgba(10,15,45,.45)'; ctx.fillRect(0, 0, CW, CH);
      ctx.globalCompositeOperation = 'lighter';
      for (const [lx, ly] of Wd.LIGHTS) { const g = ctx.createRadialGradient(lx, ly, 2, lx, ly, 110); g.addColorStop(0, 'rgba(255,170,60,.35)'); g.addColorStop(1, 'rgba(255,170,60,0)'); ctx.fillStyle = g; ctx.fillRect(lx - 110, ly - 110, 220, 220); }
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#ffe9a8'; ctx.font = '700 18px system-ui'; ctx.textAlign = 'right'; ctx.fillText(T('☾ Night Shift', '☾ Shift Malam'), CW - 16, 28);
    }
    requestAnimationFrame(frame);
  }

  function hit(evt) {
    const r = canvas.getBoundingClientRect(), mx = (evt.clientX - r.left) * CW / r.width, my = (evt.clientY - r.top) * CH / r.height;
    let best = null, bd = 40;
    for (const c of Object.values(SIM.chars)) { if (!c.visible) continue; const d = Math.hypot(mx - c.x, my - (c.y - 30)); if (d < bd) { bd = d; best = c; } }
    return best;
  }
  window.SNYP_RENDER = { setup, hit, onScreen, onPrinter, flashPrinter, CW, CH };
})();
