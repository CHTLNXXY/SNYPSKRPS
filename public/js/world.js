// The building, drawn by the artwork in img/office.webp (1536 x 1024 px).
// Three dioramas: Floor 1 lobby (bottom left), Floor 2 staff office (bottom right), Floor 3 rooftop (top).
// Positions are the characters' feet in artwork pixels. Characters walk along a waypoint graph;
// moving between floors uses the staircases (a short fade between dioramas).
(function () {
  const IMG = { src: 'img/office.webp', w: 1536, h: 1024 };
  const UNIT = 28; // pixels per "tile" of walking speed
  const FLOORS = [
    { name: 'Floor 1 · Lobby & Reception', label: [40, 1000] },
    { name: 'Floor 2 · Staff Office', label: [860, 975] },
    { name: 'Floor 3 · Rooftop Meeting', label: [40, 420] },
  ];

  // Waypoints: [floor, x, y]
  const N = {
    // Floor 1 — lobby
    door: [0, 290, 805], counter: [0, 400, 815], lobby_mid: [0, 470, 835], lobby_right: [0, 585, 765],
    reception: [0, 465, 700], behind_desk: [0, 560, 700],
    stairs_bottom0: [0, 628, 795], stairs_mid0: [0, 682, 705], stairs0: [0, 735, 620],
    // Floor 2 — staff office
    stairs1: [1, 1392, 868], stairs_top1: [1, 1430, 778], office_e: [1, 1378, 748],
    front_director: [1, 1298, 726], desk_director: [1, 1402, 694],
    office_c: [1, 1205, 705], printer: [1, 1176, 682], office_b: [1, 1110, 708], shelf: [1, 1064, 670],
    office_a: [1, 1000, 705], desk_nadia: [1, 965, 722], front_nadia: [1, 990, 695],
    desk_stat: [1, 1042, 752], front_stat: [1, 1042, 714],
    desk_metod: [1, 1112, 790], front_metod: [1, 1140, 742],
    office_s: [1, 1190, 790], desk_lib: [1, 1255, 858], front_lib: [1, 1222, 820],
    roof_exit: [1, 1462, 712],
    // Floor 3 — rooftop
    stairs2: [2, 1112, 342], roof_mid: [2, 965, 345], roof_back: [2, 870, 262], roof_left: [2, 655, 330],
    seat_owner: [2, 805, 252], seat_director: [2, 735, 338], seat_rina: [2, 862, 332],
    seat_stat: [2, 690, 298], seat_metod: [2, 925, 296], seat_lib: [2, 775, 368], seat_nadia: [2, 1035, 366],
  };
  const EDGES = [
    ['door', 'counter'], ['counter', 'lobby_mid'], ['lobby_mid', 'lobby_right'], ['counter', 'lobby_right'],
    ['reception', 'behind_desk'], ['behind_desk', 'lobby_right'], ['lobby_right', 'stairs_bottom0'],
    ['stairs_bottom0', 'stairs_mid0'], ['stairs_mid0', 'stairs0'],
    ['stairs1', 'stairs_top1'], ['stairs_top1', 'office_e'], ['office_e', 'front_director'], ['front_director', 'desk_director'],
    ['office_e', 'roof_exit'], ['front_director', 'office_c'], ['office_c', 'printer'], ['office_c', 'office_b'],
    ['office_b', 'shelf'], ['office_b', 'office_a'], ['office_a', 'front_nadia'], ['front_nadia', 'desk_nadia'],
    ['office_a', 'front_stat'], ['office_b', 'front_stat'], ['front_stat', 'desk_stat'],
    ['office_b', 'front_metod'], ['office_c', 'front_metod'], ['front_metod', 'desk_metod'],
    ['office_c', 'office_s'], ['office_s', 'front_lib'], ['front_lib', 'desk_lib'], ['front_metod', 'office_s'],
    ['stairs2', 'roof_mid'], ['roof_mid', 'roof_back'], ['roof_back', 'seat_owner'], ['roof_back', 'roof_left'],
    ['roof_mid', 'seat_rina'], ['roof_mid', 'seat_metod'], ['roof_mid', 'seat_nadia'], ['roof_mid', 'seat_lib'],
    ['roof_left', 'seat_director'], ['roof_left', 'seat_stat'], ['roof_left', 'seat_lib'], ['seat_lib', 'seat_rina'],
  ];
  // Floor links (staircases): walk to one end, fade, appear at the other.
  const LINKS = [['stairs0', 'stairs1'], ['roof_exit', 'stairs2']];

  const SPOTS = {};
  for (const [k, [f, x, y]] of Object.entries(N)) SPOTS[k] = { f, x, y, key: k };
  const HOME = { rina: 'reception', nadia: 'desk_nadia', stat: 'desk_stat', metod: 'desk_metod', lib: 'desk_lib', director: 'desk_director' };

  const adj = {};
  const dist = (a, b) => Math.hypot(SPOTS[a].x - SPOTS[b].x, SPOTS[a].y - SPOTS[b].y);
  const link = (a, b, w, stairs) => { (adj[a] = adj[a] || []).push({ to: b, w, stairs }); (adj[b] = adj[b] || []).push({ to: a, w, stairs }); };
  for (const [a, b] of EDGES) link(a, b, dist(a, b), false);
  for (const [a, b] of LINKS) link(a, b, 150, true);

  function nearest(p) {
    let best = null, bd = Infinity;
    for (const k of Object.keys(SPOTS)) { const s = SPOTS[k]; if (s.f !== p.f) continue; const d = Math.hypot(s.x - p.x, s.y - p.y); if (d < bd) { bd = d; best = k; } }
    return best;
  }
  // Route from any point to a spot. Returns [{f,x,y}] with {stairs:true} on the first point of a new floor.
  function route(from, to) {
    const start = nearest(from), goal = to.key || nearest(to);
    if (!start || !goal) return null;
    const d = { [start]: 0 }, prev = {}, done = new Set();
    while (true) {
      let u = null;
      for (const k of Object.keys(d)) if (!done.has(k) && (u === null || d[k] < d[u])) u = k;
      if (u === null) return null;
      if (u === goal) break;
      done.add(u);
      for (const e of adj[u] || []) { const nd = d[u] + e.w; if (d[e.to] == null || nd < d[e.to]) { d[e.to] = nd; prev[e.to] = { from: u, stairs: e.stairs }; } }
    }
    const out = []; let k = goal;
    while (k !== start) { const p = prev[k]; out.unshift({ f: SPOTS[k].f, x: SPOTS[k].x, y: SPOTS[k].y, stairs: p.stairs || undefined }); k = p.from; }
    const s = SPOTS[start];
    if (Math.hypot(s.x - from.x, s.y - from.y) > 1) out.unshift({ f: s.f, x: s.x, y: s.y });
    if (to.key == null && (to.x !== SPOTS[goal].x || to.y !== SPOTS[goal].y)) out.push({ f: to.f, x: to.x, y: to.y });
    return out;
  }

  // Desk paper piles (ticket markers) and light sources, in artwork pixels.
  const DESK_PAPERS = { nadia: [925, 712], stat: [1080, 745], metod: [1150, 785], lib: [1300, 835], director: [1360, 668] };
  const LIGHTS = [[305, 562], [600, 607], [858, 662], [1505, 596], [722, 60], [1170, 128], [805, 298]];

  window.SNYP_WORLD = { IMG, UNIT, FLOORS, SPOTS, HOME, route, nearest, DESK_PAPERS, LIGHTS };
})();
