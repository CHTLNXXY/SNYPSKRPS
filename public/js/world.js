// The building: three isometric floors on one grid, furniture, named spots, stairs and pathfinding.
(function () {
  const W = 12, H = 9;
  const STAIR = { x: 10, y: 1 };      // landing tile on every floor; the stairwell sits at x = 11
  const FLOORS = [
    { name: 'Floor 1 · Lobby & Reception', tint: '#e9dcc8' },
    { name: 'Floor 2 · Staff Workspace', tint: '#d9e3ec' },
    { name: 'Floor 3 · Rooftop Meeting', tint: '#cfe3c9' },
  ];

  // Furniture: blocked tiles. kind drives drawing.
  const FURNITURE = [
    // Floor 1
    { f: 0, kind: 'counter', tiles: [[4, 3], [5, 3], [6, 3]] },
    { f: 0, kind: 'sofa', tiles: [[1, 6], [2, 6]] },
    { f: 0, kind: 'plant', tiles: [[0, 0]] }, { f: 0, kind: 'plant', tiles: [[9, 8]] },
    { f: 0, kind: 'sign', tiles: [[8, 0]], label: 'SNYP' },
    // Floor 2
    { f: 1, kind: 'desk', owner: 'nadia', tiles: [[2, 2]] },
    { f: 1, kind: 'desk', owner: 'stat', tiles: [[5, 2]] },
    { f: 1, kind: 'desk', owner: 'metod', tiles: [[8, 2]] },
    { f: 1, kind: 'desk', owner: 'lib', tiles: [[3, 6]] },
    { f: 1, kind: 'desk', owner: 'director', tiles: [[8, 6]] },
    { f: 1, kind: 'shelf', tiles: [[0, 4], [0, 5], [0, 6], [0, 7]] },
    { f: 1, kind: 'printer', tiles: [[5, 8]] },
    { f: 1, kind: 'plant', tiles: [[11, 8]] },
    // Floor 3
    { f: 2, kind: 'table', tiles: [[4, 3], [5, 3], [6, 3], [7, 3], [4, 4], [5, 4], [6, 4], [7, 4], [4, 5], [5, 5], [6, 5], [7, 5]] },
    { f: 2, kind: 'plant', tiles: [[0, 0]] }, { f: 2, kind: 'plant', tiles: [[0, 8]] }, { f: 2, kind: 'plant', tiles: [[11, 8]] },
  ];

  // Named spots where characters stand or sit.
  const SPOTS = {
    door:        { f: 0, x: 6, y: 8 },
    reception:   { f: 0, x: 5, y: 2, face: 'down' },   // Rina behind the counter
    counter:     { f: 0, x: 5, y: 4 },                  // visitor side of the counter
    desk_nadia:  { f: 1, x: 2, y: 3 },
    desk_stat:   { f: 1, x: 5, y: 3 },
    desk_metod:  { f: 1, x: 8, y: 3 },
    desk_lib:    { f: 1, x: 4, y: 6 },
    desk_director: { f: 1, x: 8, y: 7 },
    front_nadia: { f: 1, x: 2, y: 4 }, front_stat: { f: 1, x: 5, y: 4 }, front_metod: { f: 1, x: 8, y: 4 },
    front_lib:   { f: 1, x: 3, y: 7 }, front_director: { f: 1, x: 9, y: 6 },
    shelf:       { f: 1, x: 1, y: 5 },
    printer:     { f: 1, x: 5, y: 7 },
    // Rooftop seats: you at the head of the table.
    seat_owner:  { f: 2, x: 3, y: 4 },
    seat_director: { f: 2, x: 8, y: 4 },
    seat_rina:   { f: 2, x: 4, y: 2 }, seat_nadia: { f: 2, x: 5, y: 2 }, seat_stat: { f: 2, x: 6, y: 2 },
    seat_metod:  { f: 2, x: 7, y: 2 }, seat_lib: { f: 2, x: 5, y: 6 },
  };
  for (let f = 0; f < 3; f++) SPOTS['stairs' + f] = { f, x: STAIR.x, y: STAIR.y };
  const HOME = { rina: 'reception', nadia: 'desk_nadia', stat: 'desk_stat', metod: 'desk_metod', lib: 'desk_lib', director: 'desk_director' };

  const blocked = [0, 1, 2].map(() => new Set());
  for (const it of FURNITURE) for (const [x, y] of it.tiles) blocked[it.f].add(x + ',' + y);
  for (let f = 0; f < 3; f++) for (let y = 0; y < H; y++) blocked[f].add('11,' + y); // stairwell column

  const walkable = (f, x, y) => x >= 0 && y >= 0 && x < W && y < H && !blocked[f].has(x + ',' + y);

  // A* on a 4-connected grid. Returns tiles from start (exclusive) to goal (inclusive), or null.
  function astar(f, sx, sy, gx, gy) {
    sx = Math.round(sx); sy = Math.round(sy);
    if (sx === gx && sy === gy) return [];
    const key = (x, y) => x + ',' + y, open = [[sx, sy]], came = {}, g = { [key(sx, sy)]: 0 };
    const h = (x, y) => Math.abs(x - gx) + Math.abs(y - gy);
    const fs = { [key(sx, sy)]: h(sx, sy) };
    while (open.length) {
      open.sort((a, b) => fs[key(...a)] - fs[key(...b)]);
      const [x, y] = open.shift();
      if (x === gx && y === gy) {
        const out = []; let k = key(x, y);
        while (came[k]) { out.unshift(k.split(',').map(Number)); k = came[k]; }
        return out.map(([px, py]) => ({ f, x: px, y: py }));
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, nk = key(nx, ny);
        if (!(walkable(f, nx, ny) || (nx === gx && ny === gy))) continue;
        const ng = g[key(x, y)] + 1;
        if (g[nk] == null || ng < g[nk]) { came[nk] = key(x, y); g[nk] = ng; fs[nk] = ng + h(nx, ny); if (!open.some(([ox, oy]) => ox === nx && oy === ny)) open.push([nx, ny]); }
      }
    }
    return null;
  }

  // Full route between any two points in the building, using the stairs between floors.
  function route(from, to) {
    const steps = [];
    let f = from.f, x = from.x, y = from.y;
    while (f !== to.f) {
      const leg = astar(f, x, y, STAIR.x, STAIR.y);
      if (!leg) return null;
      steps.push(...leg);
      const nf = f + (to.f > f ? 1 : -1);
      steps.push({ f: nf, x: STAIR.x, y: STAIR.y, stairs: true });
      f = nf; x = STAIR.x; y = STAIR.y;
    }
    const last = astar(f, x, y, to.x, to.y);
    if (!last) return null;
    return steps.concat(last);
  }

  window.SNYP_WORLD = { W, H, STAIR, FLOORS, FURNITURE, SPOTS, HOME, walkable, astar, route };
})();
