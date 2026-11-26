// Shared by the browser and the server. Staff, ticket states and who may move a ticket between states.
(function (root) {
  const STAFF = {
    rina:     { name: 'Rina',     role: 'Receptionist',   floor: 1, color: '#e0789b', skills: ['intake', 'routing'] },
    nadia:    { name: 'Nadia',    role: 'Secretary',      floor: 2, color: '#9b7be0', skills: ['minutes', 'format', 'admin', 'jadwal', 'surat'] },
    stat:     { name: 'Statistician', role: 'Statistics Expert', floor: 2, color: '#4fa3e0', skills: ['sampel', 'sample', 'statistik', 'pls', 'sem', 'spss', 'regresi', 'uji', 'data', 'responden', 'kuesioner', 'olah'] },
    metod:    { name: 'Methodologist', role: 'Methodology Expert', floor: 2, color: '#53b88a', skills: ['metode', 'metodologi', 'variabel', 'indikator', 'skala', 'definisi operasional', 'hipotesis', 'model', 'teori', 'bab iii', 'kerangka'] },
    lib:      { name: 'Librarian', role: 'Reference Librarian', floor: 2, color: '#e0a64f', skills: ['referensi', 'reference', 'pustaka', 'jurnal', 'apa', 'sitasi', 'citation', 'doi', 'literatur'] },
    director: { name: 'Director', role: 'Director / Supervisor', floor: 2, color: '#d9534f', skills: ['supervise'] },
  };
  const WORKERS = ['nadia', 'stat', 'metod', 'lib'];

  const STATUS = {
    received:   'At reception',
    delivered:  'On desk, waiting for your go-ahead',
    authorized: 'Authorized, about to start',
    working:    'Being worked on',
    ready:      'Result ready for your approval',
    revision:   'Sent back for revision',
    approved:   'Approved',
    closed:     'Closed',
  };

  // from -> to -> actors allowed. "assignee" means the staff member the ticket is assigned to.
  const TRANSITIONS = {
    received:   { delivered: ['rina'], closed: ['owner'] },
    delivered:  { authorized: ['owner'], closed: ['owner'] },
    authorized: { working: ['assignee'], delivered: ['owner'], closed: ['owner'] },
    working:    { ready: ['assignee'], closed: ['owner'] },
    ready:      { approved: ['owner'], revision: ['owner'], closed: ['owner'] },
    revision:   { working: ['assignee'], closed: ['owner'] },
    approved:   { closed: ['owner'] },
    closed:     {},
  };

  function canTransition(ticket, to, actor) {
    const allowed = (TRANSITIONS[ticket.status] || {})[to];
    if (!allowed) return false;
    return allowed.includes(actor) || (allowed.includes('assignee') && actor === ticket.assignee);
  }

  // Rule-based routing, used when no AI key is configured. Returns { assignee, reason }.
  function routeRequest(text) {
    const t = (' ' + String(text || '').toLowerCase() + ' ');
    let best = null, bestScore = 0, hits = [];
    for (const id of WORKERS) {
      let score = 0; const matched = [];
      for (const k of STAFF[id].skills) if (t.includes(k)) { score += k.length > 4 ? 2 : 1; matched.push(k); }
      if (score > bestScore) { best = id; bestScore = score; hits = matched; }
    }
    if (!best) return { assignee: 'nadia', reason: 'No specialist keyword found, so the secretary takes it and can re-route.' };
    return { assignee: best, reason: `Matched ${STAFF[best].role} keywords: ${hits.join(', ')}.` };
  }

  const MEETING_STATUS = ['called', 'gathering', 'in_session', 'minutes', 'ended'];
  const ACTORS = ['owner', 'system', ...Object.keys(STAFF)];

  const api = { STAFF, WORKERS, STATUS, TRANSITIONS, canTransition, routeRequest, MEETING_STATUS, ACTORS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SNYP_ROSTER = api;
})(typeof window !== 'undefined' ? window : globalThis);
