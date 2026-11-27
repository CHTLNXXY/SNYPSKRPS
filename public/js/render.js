// Draws the office artwork and the people moving in it.
(function () {
  const T = (en, id) => (window.SNYP_I18N ? window.SNYP_I18N.L(en, id) : en);
  const Wd = window.SNYP_WORLD, R = window.SNYP_ROSTER, SIM = window.SNYP_SIM, API = window.SNYP_API;
  const CW = Wd.IMG.w, CH = Wd.IMG.h;
  const STATUS_COLOR = { received: '#b9a37a', delivered: '#e8a33d', authorized: '#4f8fd9', working: '#3f7ac4', ready: '#3aa66a', revision: '#d9534f' };
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

  // Kantor Skripsi staff as chibi characters. Each one is built from three SVG layers (back hair, torso,
  // head with held items); legs and arms are drawn live on the canvas so they really walk, sit and type.
  const CHIBI = {
    rina:     { skin: '#f7d9c4', hair: '#1b1412', style: 'long-straight', bangs: 'full', top: '#ffffff', jacket: null, collar: 'sailor', bottom: 'skirt', bcol: '#22307a', legs: 'socks', acc: ['bow'], accent: '#2a3fa0' },
    stat:     { skin: '#f6d6c2', hair: '#2a1d17', style: 'bun', bangs: 'full', top: '#efe6da', jacket: null, bottom: 'skirt', bcol: '#1f1a1f', legs: 'skin', acc: ['glasses-round', 'laptop', 'lanyard'] },
    metod:    { skin: '#f3d2bc', hair: '#151217', style: 'short-messy', bangs: 'side', top: '#232b55', jacket: null, bottom: 'pants', bcol: '#141418', legs: 'pants', acc: ['glasses-rect', 'lanyard', 'arms-crossed'] },
    lib:      { skin: '#f8dccb', hair: '#7a4a2e', style: 'long-wavy', bangs: 'part', top: '#f4efea', jacket: '#232b55', bottom: 'skirt', bcol: '#1b1b22', legs: 'skin', acc: ['lanyard', 'books'] },
    editor:   { skin: '#f3d3bd', hair: '#16131a', style: 'short-messy', bangs: 'full', top: '#dcdbe6', jacket: null, bottom: 'pants', bcol: '#141418', legs: 'pants', acc: ['lanyard', 'notebook', 'pen'] },
    syariah:  { skin: '#ecc7ad', hair: '#1d1713', style: 'short', bangs: 'side', top: '#ffffff', jacket: '#22284f', bottom: 'pants', bcol: '#1d2140', legs: 'pants', acc: ['peci', 'glasses-rect', 'beard', 'shawl', 'quran', 'lanyard'] },
    nadia:    { skin: '#f8dccb', hair: '#6b3f2a', style: 'long-wavy', bangs: 'part', top: '#ffffff', jacket: '#232b55', bottom: 'skirt', bcol: '#1b1b22', legs: 'skin', acc: ['lanyard', 'tablet', 'earrings'] },
    director: { skin: '#f6dccb', hair: '#d9cbbd', style: 'hijab', bangs: 'none', top: '#efe6d6', jacket: '#232b55', bottom: 'skirt', bcol: '#e8dfd0', legs: 'skin', acc: ['lanyard', 'hand-chin'] },
    owner:    { skin: '#f1cfb6', hair: '#1a1410', style: 'short', bangs: 'side', top: '#f4f6fb', jacket: null, bottom: 'pants', bcol: '#2b3550', legs: 'pants', acc: ['backpack'] },
  };
  function layers(c) {
    const dark = c.hair, skin = c.skin, A = [], B = [], C = [];
    if (c.style === 'long-straight') A.push(`<path d="M10 28 Q8 70 14 74 L46 74 Q52 70 50 28 Z" fill="${dark}"/>`);
    if (c.style === 'long-wavy') A.push(`<path d="M10 30 Q4 52 9 62 Q6 72 14 76 L46 76 Q54 72 51 62 Q56 52 50 30 Z" fill="${dark}"/>`);
    if (c.style === 'hijab') A.push(`<path d="M8 30 Q8 8 30 8 Q52 8 52 30 L54 62 Q30 72 6 62 Z" fill="${dark}"/>`);
    if (c.acc.includes('backpack')) A.push(`<rect x="15" y="50" width="30" height="22" rx="6" fill="#3d5a80"/>`);
    B.push(`<path d="M19 52 Q19 49 23 49 L37 49 Q41 49 41 52 L42 74 L18 74 Z" fill="${c.top}"/>`);
    if (c.bottom === 'skirt') B.push(`<path d="M18 66 L42 66 L45 79 L15 79 Z" fill="${c.bcol}"/>` + (c.collar === 'sailor' ? `<path d="M20 67 L18 79 M25 67 L24 79 M30 67 L30 79 M35 67 L36 79 M40 67 L42 79" stroke="#16205a" stroke-width=".8"/>` : ''));
    else B.push(`<rect x="18" y="66" width="24" height="9" fill="${c.bcol}"/><rect x="18" y="66" width="24" height="2" fill="#0c0c10"/><rect x="28" y="66" width="4" height="2.4" fill="#9aa"/>`);
    if (c.jacket) B.push(`<path d="M18 52 Q18 49 22 49 L27 49 L30 60 L26 74 L17 74 Z" fill="${c.jacket}"/><path d="M42 52 Q42 49 38 49 L33 49 L30 60 L34 74 L43 74 Z" fill="${c.jacket}"/>`);
    if (c.collar === 'sailor') B.push(`<path d="M20 49 L40 49 L36 58 L30 62 L24 58 Z" fill="#22307a"/><path d="M22 50 L38 50" stroke="#fff" stroke-width=".8"/><path d="M27 57 L30 63 L33 57 L30 59 Z" fill="#fff"/><circle cx="36" cy="55" r="1.6" fill="#d4a62a"/>`);
    if (c.acc.includes('shawl')) B.push(`<path d="M20 49 L25 49 L27 74 L19 74 Z" fill="#3a4170"/><path d="M20.5 53h5M20.8 58h5.4M21 63h5.6M21.2 68h5.8" stroke="#d8d6e8" stroke-width="1" stroke-dasharray="1.4 1"/>`);
    if (c.acc.includes('lanyard')) B.push(`<path d="M26 49 L30 62 L34 49" fill="none" stroke="#2b46b8" stroke-width="1.2"/><rect x="27.5" y="61" width="5" height="6.5" rx="1" fill="#fff" stroke="#9fb0e0" stroke-width=".5"/>`);
    if (c.acc.includes('backpack')) B.push(`<path d="M21 50 L22 66 M39 50 L38 66" stroke="#3d5a80" stroke-width="2.4"/>`);
    if (c.acc.includes('arms-crossed')) B.push(`<path d="M18 54 Q14 62 20 64 L40 64 Q46 62 42 54" fill="${c.top}"/><path d="M21 61 L39 63 M21 64 L39 60" stroke="${skin}" stroke-width="3.4" stroke-linecap="round"/>`);
    if (c.acc.includes('hand-chin')) C.push(`<rect x="40.5" y="51" width="6" height="12" rx="3" fill="${c.jacket || c.top}" transform="rotate(-150 43 52)"/><circle cx="37" cy="45.5" r="2.8" fill="${skin}"/>`);
    if (c.acc.includes('laptop')) C.push(`<rect x="8" y="57" width="13" height="16" rx="1.6" fill="#b9bcc4" stroke="#8e929c" stroke-width=".6" transform="rotate(-10 14 65)"/>`);
    if (c.acc.includes('books')) C.push(`<rect x="40" y="62" width="11" height="4" fill="#5a3b2a"/><rect x="40.5" y="66" width="11" height="4" fill="#2c2a30"/><rect x="40" y="70" width="11" height="3.5" fill="#6b4a33"/>`);
    if (c.acc.includes('notebook')) C.push(`<rect x="41" y="60" width="10" height="13" rx="1" fill="#1c1c20"/>`);
    if (c.acc.includes('quran')) C.push(`<rect x="40" y="61" width="11" height="13" rx="1" fill="#2e2a26" stroke="#b08a4a" stroke-width=".8"/><circle cx="45.5" cy="67.5" r="2.4" fill="none" stroke="#b08a4a" stroke-width=".7"/>`);
    if (c.acc.includes('tablet')) C.push(`<rect x="41" y="59" width="11" height="15" rx="1.4" fill="#262a3c"/>`);
    if (c.acc.includes('pen')) C.push(`<path d="M45 62 L50 52" stroke="#111" stroke-width="1.6" stroke-linecap="round"/>`);
    const H = [];
    if (c.style === 'hijab') H.push(`<circle cx="30" cy="30" r="17" fill="${skin}"/>`); else H.push(`<circle cx="30" cy="30" r="19" fill="${skin}"/><ellipse cx="11.5" cy="31" rx="2.6" ry="3.4" fill="${skin}"/><ellipse cx="48.5" cy="31" rx="2.6" ry="3.4" fill="${skin}"/>`);
    H.push({ full: `<path d="M11 30 Q10 9 30 9 Q50 9 49 30 Q46 22 42 19 Q40 26 34 24 Q32 19 29 18 Q26 25 19 24 Q17 21 15 20 Q12 24 11 30 Z" fill="${dark}"/>`,
      side: `<path d="M11 28 Q11 8 31 8 Q50 9 49 27 Q45 18 38 16 Q30 22 18 22 Q14 23 11 28 Z" fill="${dark}"/>` + (c.acc.includes('peci') ? '' : `<path d="M20 10 l-4 -3 M27 8 l-2 -4 M36 9 l2 -4" stroke="${dark}" stroke-width="2.6" stroke-linecap="round"/>`),
      part: `<path d="M11 32 Q10 9 30 9 Q50 9 49 32 Q46 20 33 15 Q34 22 30 26 Q26 16 15 22 Q12 26 11 32 Z" fill="${dark}"/>`, none: '' }[c.bangs]);
    if (c.style === 'bun') H.push(`<circle cx="36" cy="9" r="7" fill="${dark}"/>`);
    if (c.style === 'hijab') H.push(`<path d="M12 30 Q12 11 30 11 Q48 11 48 30" fill="none" stroke="#cdbfb0" stroke-width="1"/><path d="M13 34 Q30 52 47 34 L48 46 Q30 60 12 46 Z" fill="${dark}"/>`);
    if (c.acc.includes('peci')) H.push(`<path d="M13 19 Q13 7 30 6.5 Q47 7 47 19 Z" fill="#141414"/>`);
    if (c.acc.includes('bow')) H.push(`<path d="M30 9 L20 3 Q17 9 20 14 Z M30 9 L40 3 Q43 9 40 14 Z" fill="${c.accent}"/><circle cx="30" cy="9" r="2.6" fill="#1e2d80"/>`);
    const ey = c.style === 'hijab' ? 31 : 32;
    H.push(`<ellipse cx="23" cy="${ey}" rx="3" ry="3.8" fill="#2a1a14"/><ellipse cx="37" cy="${ey}" rx="3" ry="3.8" fill="#2a1a14"/><circle cx="24" cy="${ey - 1.4}" r="1.1" fill="#fff"/><circle cx="38" cy="${ey - 1.4}" r="1.1" fill="#fff"/>`);
    H.push(`<ellipse cx="19" cy="${ey + 6}" rx="3" ry="1.6" fill="#f4a3a8" opacity=".6"/><ellipse cx="41" cy="${ey + 6}" rx="3" ry="1.6" fill="#f4a3a8" opacity=".6"/>`);
    if (c.acc.includes('glasses-round')) H.push(`<circle cx="23" cy="${ey}" r="5" fill="none" stroke="#5a4a3a" stroke-width="1"/><circle cx="37" cy="${ey}" r="5" fill="none" stroke="#5a4a3a" stroke-width="1"/><path d="M28 ${ey} L32 ${ey}" stroke="#5a4a3a" stroke-width="1"/>`);
    if (c.acc.includes('glasses-rect')) H.push(`<rect x="17.5" y="${ey - 4}" width="11" height="8" rx="2" fill="none" stroke="#111" stroke-width="1.4"/><rect x="31.5" y="${ey - 4}" width="11" height="8" rx="2" fill="none" stroke="#111" stroke-width="1.4"/><path d="M28.5 ${ey - 1} L31.5 ${ey - 1}" stroke="#111" stroke-width="1.2"/>`);
    if (c.acc.includes('beard')) H.push(`<path d="M26 ${ey + 10} Q30 ${ey + 16} 34 ${ey + 10} Q30 ${ey + 12} 26 ${ey + 10} Z" fill="#2a201a"/>`);
    if (c.acc.includes('earrings')) H.push(`<circle cx="11.5" cy="37" r="1.1" fill="#e6e6f0"/><circle cx="48.5" cy="37" r="1.1" fill="#e6e6f0"/>`);
    const svg = (body) => { const im = new Image(); im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 100" width="240" height="400">${body}</svg>`); return im; };
    return { back: svg(A.join('')), torso: svg(B.join('')), items: svg(C.join('')), head: svg(H.join('')), ey,
      crossed: c.acc.includes('arms-crossed'), chin: c.acc.includes('hand-chin'), legC: c.legs === 'pants' ? c.bcol : skin, socks: c.legs === 'socks', sleeve: c.jacket || c.top, skin, mouthOpen: '#7a2e36' };
  }
  const LAYERS = {};
  const lay = (id) => LAYERS[id] || (LAYERS[id] = layers(CHIBI[id] || CHIBI.owner));
  const K = 1.32;            // artwork pixels per chibi unit (a standing chibi is about 130 px tall)
  const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
  // An arm hanging from a shoulder at (sx, sy), rotated by deg (0 = straight down).
  function arm(L, sx, sy, deg, len) {
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(deg * Math.PI / 180);
    ctx.fillStyle = L.sleeve; rr(-3, -1, 6, len, 3); ctx.fill();
    ctx.fillStyle = L.skin; ctx.beginPath(); ctx.arc(0, len + 0.5, 2.8, 0, 7); ctx.fill();
    ctx.restore();
  }
  function leg(L, x, top, len, lift) {
    ctx.fillStyle = L.legC; rr(x, top - lift, 6.5, len, 3); ctx.fill();
    if (L.socks) { ctx.fillStyle = '#fff'; rr(x, top - lift + len - 8, 6.5, 8, 2); ctx.fill(); }
    ctx.fillStyle = '#141414'; ctx.beginPath(); ctx.ellipse(x + 3.2, top - lift + len + 1, 4.6, 2.6, 0, 0, 7); ctx.fill();
  }
  // Seeds so everybody blinks and breathes at their own rhythm.
  const seed = (id) => { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) % 9973; return h; };

  function person(c, now) {
    const L = lay(c.id), st = R.STAFF[c.id] || { name: T('You', 'Kamu') }, sd = seed(c.id);
    const sitting = !c.walking && ['sit', 'work', 'ready', 'waiting', 'night-wait'].includes(c.pose);
    const typing = !c.walking && c.pose === 'work';
    const talking = !!(c.bubble && c.bubble.until > now);
    const x = c.x, y = c.y, f = c.facing || 1;
    const ph = now / 140;                                     // walk phase
    const step = c.walking ? Math.sin(ph) : 0;
    const bob = c.walking ? Math.abs(Math.cos(ph)) * 2.2 : Math.sin((now + sd * 37) / 900) * 0.45; // step bounce or breathing
    const sink = sitting ? 9 : 0;                              // body drops onto the chair
    ctx.save(); ctx.globalAlpha = c.alpha == null ? 1 : c.alpha;
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(x, y, 19, 6, 0, 0, 7); ctx.fill();
    ctx.translate(x, y); ctx.scale(K * f, K); ctx.translate(-30, -93);
    if (c.walking) ctx.rotate(Math.sin(ph) * 0.025);          // small sway while walking
    const lift = (s) => Math.max(0, s) * 4;
    const by = sink - bob;
    // back hair, then legs
    ctx.drawImage(L.back, 0, by, 60, 100);
    if (sitting) { // thighs forward, shins down
      ctx.fillStyle = L.legC; rr(21, 74 + by - 2, 7, 9, 3); ctx.fill(); rr(32, 74 + by - 2, 7, 9, 3); ctx.fill();
      leg(L, 21.5, 80, 9, 0); leg(L, 32, 80, 9, 0);
    } else {
      leg(L, 22 - step * 1.2, 74 - bob * 0.6, 16, lift(step)); leg(L, 31.5 + step * 1.2, 74 - bob * 0.6, 16, lift(-step));
    }
    ctx.drawImage(L.torso, 0, by, 60, 100);
    // arms: swing while walking, tap at the keyboard while working, rest otherwise
    if (!L.crossed) {
      const sw = c.walking ? step * 22 : 0, tap = typing ? Math.sin(now / 85 + sd) * 6 : 0;
      const restL = typing ? -38 + tap : 8 + Math.sin((now + sd * 11) / 1100) * 1.5, restR = typing ? 38 - tap : -8;
      arm(L, 16, 51 + by, restL - sw, typing ? 13 : 17);
      if (!L.chin) arm(L, 43.5, 51 + by, restR - sw, typing ? 13 : 17);
    }
    ctx.drawImage(L.items, 0, by, 60, 100);
    // head nods a little while talking
    const nod = talking ? Math.sin(now / 160) * 0.8 : 0;
    ctx.drawImage(L.head, 0, by + nod, 60, 100);
    const ey = L.ey + by + nod;
    // blink every few seconds
    if ((now + sd * 53) % 4200 < 130) { ctx.fillStyle = L.skin; ctx.fillRect(19.6, ey - 4.2, 7, 8.6); ctx.fillRect(33.6, ey - 4.2, 7, 8.6); ctx.strokeStyle = '#2a1a14'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(20, ey + 0.5); ctx.lineTo(26, ey + 0.5); ctx.moveTo(34, ey + 0.5); ctx.lineTo(40, ey + 0.5); ctx.stroke(); }
    // mouth: a smile, or opening and closing while talking
    if (talking) { const o = 0.8 + Math.abs(Math.sin(now / 95)) * 2.4; ctx.fillStyle = L.mouthOpen; ctx.beginPath(); ctx.ellipse(30, ey + 8.4, 2.6, o, 0, 0, 7); ctx.fill(); }
    else { ctx.strokeStyle = '#a8484f'; ctx.lineWidth = 1.2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(27.5, ey + 7.5); ctx.quadraticCurveTo(30, ey + 9.5, 32.5, ey + 7.5); ctx.stroke(); }
    if (c.carrying) { ctx.fillStyle = '#f3ead6'; ctx.strokeStyle = '#8a7350'; ctx.lineWidth = 0.8; ctx.fillRect(38, 58 + by, 13, 10); ctx.strokeRect(38, 58 + by, 13, 10); ctx.fillStyle = '#b5472f'; ctx.fillRect(38, 58 + by, 13, 2.5); }
    ctx.restore();
    const headY = y - (93 - 6 - sink) * K;
    const badge = { ready: ['#3aa66a', '✓'], waiting: ['#e8a33d', '?'], 'night-wait': ['#3c4f80', '☾'] }[c.pose] || (typing ? ['#3f7ac4', '…'] : null);
    let bY = headY - 6;
    if (badge) { bY = headY - 14 - (c.pose === 'ready' ? Math.abs(Math.sin(now / 300)) * 5 : 0); ctx.fillStyle = badge[0]; ctx.beginPath(); ctx.arc(x, bY, 11, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = '700 14px system-ui'; ctx.textAlign = 'center'; ctx.fillText(badge[1], x, bY + 5); bY -= 13; }
    if (c.mood && c.mood.until > now) { const e = { sad: '😟', happy: '😊', think: '🤔' }[c.mood.m]; if (e) { ctx.font = '20px system-ui'; ctx.textAlign = 'center'; ctx.fillText(e, x + 28, headY + 10); } }
    const name = c.nameOverride || st.name;
    ctx.font = '700 13px system-ui'; ctx.textAlign = 'center';
    const tw = ctx.measureText(name).width + 12;
    ctx.fillStyle = 'rgba(20,24,48,.78)'; roundRect(x - tw / 2, y + 7, tw, 18, 9); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(name, x, y + 20);
    if (c.bubble) bubble(x, bY, c.bubble.text);
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
    for (const c of chars) person(c, now);
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
    let best = null, bd = 60;
    for (const c of Object.values(SIM.chars)) { if (!c.visible) continue; const d = Math.hypot(mx - c.x, my - (c.y - 60)); if (d < bd) { bd = d; best = c; } }
    return best;
  }
  window.SNYP_RENDER = { setup, hit, onScreen, onPrinter, flashPrinter, CW, CH };
})();
