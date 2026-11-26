// Draws the 3-floor isometric building and everyone in it on a canvas.
(function () {
  const Wd = window.SNYP_WORLD, R = window.SNYP_ROSTER, SIM = window.SNYP_SIM, API = window.SNYP_API;
  const TW = 40, TH = 20, FLOOR_H = 262, TOP = 70;
  const CW = 560, CH = TOP + 2 * FLOOR_H + (Wd.W + Wd.H) * TH / 2 + 40;
  const OX = CW / 2 + (Wd.H - Wd.W) * TW / 4;
  const P = (x, y, z) => [OX + (x - y) * TW / 2, TOP + (x + y) * TH / 2 + (2 - z) * FLOOR_H];
  const STATUS_COLOR = { received: '#b9a37a', delivered: '#e8a33d', authorized: '#4f8fd9', working: '#3f7ac4', ready: '#3aa66a', revision: '#d9534f', approved: '#8c8c8c' };

  let canvas, ctx, dpr = 1;
  function setup(el) {
    canvas = el; ctx = el.getContext('2d');
    const fit = () => { dpr = window.devicePixelRatio || 1; canvas.width = CW * dpr; canvas.height = CH * dpr; };
    fit(); window.addEventListener('resize', fit);
    canvas.style.aspectRatio = CW + ' / ' + CH;
    requestAnimationFrame(frame);
  }

  function poly(pts, fill, stroke) { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); } }
  // Iso box on tile (x,y) of floor z, size w x d tiles, height h px.
  function box(x, y, z, w, d, h, top, left, right) {
    const a = P(x - .5, y - .5, z), b = P(x - .5 + w, y - .5, z), c = P(x - .5 + w, y - .5 + d, z), e = P(x - .5, y - .5 + d, z);
    const up = ([px, py]) => [px, py - h];
    poly([e, c, up(c), up(e)], left); poly([c, b, up(b), up(c)], right); poly([up(a), up(b), up(c), up(e)], top, 'rgba(0,0,0,.12)');
    return up(P(x - .5 + w / 2, y - .5 + d / 2, z));
  }
  const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); const f = (v) => Math.max(0, Math.min(255, Math.round(v * k))); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; };

  function drawFloor(z) {
    const F = Wd.FLOORS[z];
    const a = P(-.5, -.5, z), b = P(Wd.W - .5, -.5, z), c = P(Wd.W - .5, Wd.H - .5, z), d = P(-.5, Wd.H - .5, z);
    const dn = ([x, y]) => [x, y + 10];
    poly([d, c, dn(c), dn(d)], shade(F.tint, .72)); poly([c, b, dn(b), dn(c)], shade(F.tint, .6));
    poly([a, b, c, d], F.tint);
    ctx.strokeStyle = 'rgba(0,0,0,.05)';
    for (let i = 0; i <= Wd.W; i++) { const p1 = P(i - .5, -.5, z), p2 = P(i - .5, Wd.H - .5, z); ctx.beginPath(); ctx.moveTo(...p1); ctx.lineTo(...p2); ctx.stroke(); }
    for (let j = 0; j <= Wd.H; j++) { const p1 = P(-.5, j - .5, z), p2 = P(Wd.W - .5, j - .5, z); ctx.beginPath(); ctx.moveTo(...p1); ctx.lineTo(...p2); ctx.stroke(); }
    if (z < 2) { // back walls with windows
      const wh = 38, up = ([x, y]) => [x, y - wh];
      poly([a, d, up(d), up(a)], shade(F.tint, .85)); poly([a, b, up(b), up(a)], shade(F.tint, .93));
      for (let i = 1; i < Wd.W - 1; i += 2) { const p = P(i, -.5, z); poly([[p[0] - 8, p[1] - 30], [p[0] + 8, p[1] - 22], [p[0] + 8, p[1] - 10], [p[0] - 8, p[1] - 18]], z === 0 ? '#bcd7ec' : '#c7dcef'); }
    } else { // rooftop railing
      ctx.strokeStyle = '#8a9a86'; ctx.lineWidth = 2;
      for (const [p, q] of [[a, b], [a, d]]) { ctx.beginPath(); ctx.moveTo(p[0], p[1] - 16); ctx.lineTo(q[0], q[1] - 16); ctx.stroke(); }
      ctx.lineWidth = 1;
    }
    ctx.fillStyle = '#4a4f57'; ctx.font = '600 12px system-ui, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(F.name, 8, d[1] + 46);
  }

  function drawStairs(z) { // stairwell column at x = 11: a flight from floor z up to z+1
    const n = 22;
    const s0 = P(11.5, 2.5, z), s1 = P(11.5, -.5, z + 1);
    poly([[s0[0], s0[1]], [s1[0], s1[1]], [s1[0] + 6, s1[1] + 3], [s0[0] + 6, s0[1] + 3]], 'rgba(120,110,95,.35)');
    for (let i = 0; i <= n; i++) {
      const t = i / n, y = 2.2 - t * 2.4, zz = z + t;
      box(11, y, zz, 1, .22, 4, '#d8c8a8', '#a8987c', '#bba98a');
    }
    ctx.strokeStyle = '#8b7a5e'; ctx.lineWidth = 1.5;
    const r0 = P(11.5, 2.2, z), r1 = P(11.5, -.2, z + 1);
    ctx.beginPath(); ctx.moveTo(r0[0], r0[1] - 14); ctx.lineTo(r1[0], r1[1] - 14); ctx.stroke(); ctx.lineWidth = 1;
  }

  function drawFurniture(it, data) {
    const [x, y] = it.tiles[0], z = it.f;
    if (it.kind === 'counter') { box(4, 3, z, 3, 1, 20, '#b07d4f', '#8a5f3a', '#9c6c44'); const p = P(5, 3, z); ctx.fillStyle = '#fff'; ctx.font = '600 9px system-ui'; ctx.textAlign = 'center'; ctx.fillText('RECEPTION', p[0], p[1] - 4); return; }
    if (it.kind === 'table') { box(4, 3, z, 4, 3, 12, '#9b6b43', '#7a5233', '#875c3a'); return; }
    if (it.kind === 'sofa') { box(1, 6, z, 2, 1, 10, '#6f8fb0', '#58738f', '#62809e'); return; }
    if (it.kind === 'shelf') { const top = box(0, 4, z, 1, 4, 44, '#7d5a3c', '#5f4330', '#6c4c35'); for (let k = 0; k < 4; k++) { const p = P(.5, 4 + k, z); ctx.fillStyle = ['#c0504d', '#4f81bd', '#9bbb59', '#f2c14e'][k]; ctx.fillRect(p[0] - 3, p[1] - 36, 6, 26); } return top; }
    if (it.kind === 'printer') { box(x, y, z, 1, 1, 14, '#d9d9d9', '#a6a6a6', '#bfbfbf'); return; }
    if (it.kind === 'plant') { const p = P(x, y, z); ctx.fillStyle = '#8b5e3c'; ctx.fillRect(p[0] - 5, p[1] - 10, 10, 10); ctx.fillStyle = '#4c9a5b'; ctx.beginPath(); ctx.arc(p[0], p[1] - 18, 10, 0, 7); ctx.fill(); return; }
    if (it.kind === 'sign') { const p = P(x, y, z); ctx.fillStyle = '#2f4b7c'; ctx.fillRect(p[0] - 22, p[1] - 44, 44, 16); ctx.fillStyle = '#fff'; ctx.font = '700 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText(it.label, p[0], p[1] - 32); return; }
    if (it.kind === 'desk') {
      const top = box(x, y, z, 1, 1, 16, '#c99a6b', '#9d7550', '#b0835c');
      ctx.fillStyle = '#2b2f36'; ctx.fillRect(top[0] - 7, top[1] - 14, 14, 10);
      ctx.fillStyle = data.settings && data.settings.nightShift ? '#9fd3ff' : '#5c7da3'; ctx.fillRect(top[0] - 6, top[1] - 13, 12, 8);
      const mine = data.tickets.filter((t) => t.assignee === it.owner && STATUS_COLOR[t.status] && t.status !== 'approved');
      mine.slice(0, 5).forEach((t, i) => {
        const px = top[0] + 9 + i * 3, py = top[1] - 2 - i * 3;
        ctx.fillStyle = '#fff'; ctx.fillRect(px - 5, py - 4, 10, 7); ctx.fillStyle = STATUS_COLOR[t.status]; ctx.fillRect(px - 5, py - 4, 10, 2);
      });
      if (mine.length) { ctx.fillStyle = '#333'; ctx.font = '600 9px system-ui'; ctx.textAlign = 'left'; ctx.fillText(mine.map((t) => '#' + t.no).join(' '), top[0] + 4, top[1] + 12); }
      return;
    }
  }

  function drawChar(c, now) {
    if (!c.visible) return;
    const st = R.STAFF[c.id] || { name: 'You', color: '#33475b' };
    const [sx, sy0] = P(c.x, c.y, c.z);
    const sitting = c.pose === 'sit' || c.pose === 'work' || c.pose === 'ready' || c.pose === 'waiting' || c.pose === 'night-wait';
    const sy = sy0 + (sitting && !c.walking ? -2 : 0);
    const bob = c.walking ? Math.abs(Math.sin(now / 110)) * 2 : 0;
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(sx, sy0, 9, 4, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#2f2f2f'; ctx.lineWidth = 2.5;
    const sw = c.walking ? Math.sin(now / 110) * 4 : 0;
    if (!sitting || c.walking) { ctx.beginPath(); ctx.moveTo(sx - 3, sy - 12); ctx.lineTo(sx - 3 + sw, sy); ctx.moveTo(sx + 3, sy - 12); ctx.lineTo(sx + 3 - sw, sy); ctx.stroke(); }
    else { ctx.beginPath(); ctx.moveTo(sx - 3, sy - 10); ctx.lineTo(sx - 3 + 5 * c.facing, sy - 7); ctx.moveTo(sx + 3, sy - 10); ctx.lineTo(sx + 3 + 5 * c.facing, sy - 7); ctx.stroke(); }
    const by = sy - (sitting && !c.walking ? 24 : 28) - bob;
    ctx.fillStyle = st.color; roundRect(sx - 7, by, 14, 17, 4); ctx.fill();
    if (c.id === 'director') { ctx.fillStyle = '#222'; ctx.fillRect(sx - 1, by + 2, 2, 10); }
    if (c.pose === 'work' && !c.walking) { const k = Math.sin(now / 90) * 2; ctx.strokeStyle = shade(st.color, .7); ctx.beginPath(); ctx.moveTo(sx - 6, by + 8); ctx.lineTo(sx - 9 + 4 * c.facing, by + 12 + k); ctx.moveTo(sx + 6, by + 8); ctx.lineTo(sx + 9 + 4 * c.facing, by + 12 - k); ctx.stroke(); }
    ctx.fillStyle = '#f1c9a5'; ctx.beginPath(); ctx.arc(sx, by - 6, 6, 0, 7); ctx.fill();
    ctx.fillStyle = c.id === 'rina' || c.id === 'nadia' ? '#3b2618' : '#2b2b2b'; ctx.beginPath(); ctx.arc(sx, by - 8, 6, Math.PI, 0); ctx.fill();
    if (c.id === 'rina' || c.id === 'nadia') ctx.fillRect(sx - 6, by - 8, 2.5, 9);
    if (c.carrying) { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#999'; ctx.lineWidth = 1; ctx.fillRect(sx + 4 * c.facing - 5, by + 6, 10, 8); ctx.strokeRect(sx + 4 * c.facing - 5, by + 6, 10, 8); ctx.fillStyle = '#c55'; ctx.fillRect(sx + 4 * c.facing - 5, by + 6, 10, 2); }
    // status badge
    const badge = { ready: ['#3aa66a', '✓'], waiting: ['#e8a33d', '?'], 'night-wait': ['#3c4f80', '☾'] }[c.pose] || (c.pose === 'work' && !c.walking ? ['#3f7ac4', '…'] : null);
    if (badge) { const yy = by - 22 - (c.pose === 'ready' ? Math.abs(Math.sin(now / 300)) * 4 : 0); ctx.fillStyle = badge[0]; ctx.beginPath(); ctx.arc(sx, yy, 7, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = '700 10px system-ui'; ctx.textAlign = 'center'; ctx.fillText(badge[1], sx, yy + 3.5); }
    ctx.fillStyle = '#222'; ctx.font = '600 9px system-ui'; ctx.textAlign = 'center'; ctx.fillText(st.name, sx, sy0 + 12);
    if (c.bubble) bubble(sx, by - (badge ? 32 : 18), c.bubble.text);
  }
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function bubble(x, y, text) {
    ctx.font = '11px system-ui, sans-serif';
    const words = String(text).split(/\s+/), lines = []; let cur = '';
    for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > 150) { lines.push(cur); cur = w; } else cur = t; if (lines.length === 3) break; }
    if (lines.length < 3 && cur) lines.push(cur); else if (lines.length === 3) lines[2] = lines[2].replace(/\s*\S*$/, '') + '…';
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 12, h = lines.length * 13 + 8;
    let bx = Math.max(4, Math.min(CW - w - 4, x - w / 2)); const byy = y - h;
    ctx.fillStyle = 'rgba(255,255,255,.96)'; ctx.strokeStyle = '#9aa4b1'; roundRect(bx, byy, w, h, 6); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x, y + 6); ctx.lineTo(x + 4, y); ctx.fill();
    ctx.fillStyle = '#1f2933'; ctx.textAlign = 'left'; lines.forEach((l, i) => ctx.fillText(l, bx + 6, byy + 15 + i * 13));
  }

  function frame() {
    const now = performance.now();
    const data = API.S.data || { tickets: [], settings: {}, meetings: [] };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = data.settings.nightShift ? '#1d2538' : '#eef2f6'; ctx.fillRect(0, 0, CW, CH);
    const chars = Object.values(SIM.chars);
    for (let z = 0; z < 3; z++) {
      drawFloor(z);
      const items = Wd.FURNITURE.filter((f) => f.f === z).map((f) => ({ d: f.kind === 'table' ? -1 : Math.max(...f.tiles.map(([x, y]) => x + y)), draw: () => drawFurniture(f, data) }));
      for (const c of chars.filter((c) => !c.onStairs && c.f === z)) items.push({ d: c.x + c.y + .5, draw: () => drawChar(c, now) });
      items.sort((a, b) => a.d - b.d).forEach((i) => i.draw());
      if (z < 2) drawStairs(z);
    }
    for (const c of chars.filter((c) => c.onStairs)) drawChar(c, now);
    if (data.settings.nightShift) { ctx.fillStyle = 'rgba(15,25,60,.28)'; ctx.fillRect(0, 0, CW, CH); ctx.fillStyle = '#ffe9a8'; ctx.font = '700 12px system-ui'; ctx.textAlign = 'right'; ctx.fillText('☾ Night Shift', CW - 10, 20); }
    requestAnimationFrame(frame);
  }

  // Click a character to see what they are doing.
  function hit(evt) {
    const r = canvas.getBoundingClientRect(), mx = (evt.clientX - r.left) * CW / r.width, my = (evt.clientY - r.top) * CH / r.height;
    let best = null, bd = 22;
    for (const c of Object.values(SIM.chars)) { if (!c.visible) continue; const [sx, sy] = P(c.x, c.y, c.z); const d = Math.hypot(mx - sx, my - (sy - 18)); if (d < bd) { bd = d; best = c; } }
    return best;
  }

  window.SNYP_RENDER = { setup, hit, P, CW, CH };
})();
