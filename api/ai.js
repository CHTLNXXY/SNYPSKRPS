// Optional AI "brain" for the staff. Only active when ANTHROPIC_API_KEY is set in Vercel.
// Without it this returns 503 and the office falls back to rule-based routing and templates.
// POST /api/ai {task: 'chat', who, text} | {task: 'route', text} | {task: 'work', ticketId} | {task: 'meeting', meetingId, who} | {task: 'minutes', meetingId}
const { requireAuth } = require('../lib/auth');
const { getStore } = require('../lib/store');
const { readAll } = require('../lib/ops');
const archive = require('../lib/archive');
const { paragraphs } = require('../lib/draftcheck');
const R = require('../public/js/roster.js');
const { body, fail } = require('../lib/http');

const MODEL = process.env.SNYP_MODEL || 'claude-opus-5-5';

const office = () => `You are part of SNYP University, a virtual thesis office helping one student finish an Indonesian undergraduate thesis (skripsi):
"Pengaruh Trust in AI dan AI Reliance terhadap Minat Investasi Syariah pada Pengguna Artificial Intelligence".
Staff: ${Object.entries(R.STAFF).map(([, v]) => `${v.name} (${v.role})`).join(', ')}.
Rules: never invent citations, page numbers, DOIs or data; if something is unknown say exactly what the student must supply. Write thesis text in formal Indonesian; write notes to the student in short, plain Indonesian.`;

async function ask(system, user, effort = 'medium', maxTokens = 8000) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic();
  const stream = client.beta.messages.stream({
    model: MODEL, max_tokens: maxTokens,
    betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    output_config: { effort },
    system: [{ type: 'text', text: office() + '\n\n' + system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') { const e = new Error('The AI declined this request'); e.status = 422; throw e; }
  return msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
}
function json(text) { const m = text.match(/\{[\s\S]*\}/); if (!m) throw new Error('AI did not return JSON'); return JSON.parse(m[0]); }

async function draftContext(section) {
  try {
    const path = archive.currentThesis(await archive.list());
    if (!path) return '';
    const ps = paragraphs(await archive.readBytes(path));
    if (!section) return '';
    const key = section === 'DAFTAR PUSTAKA' ? 'DAFTAR PUSTAKA' : section + ' ';
    const i = ps.findIndex((p, idx) => idx > 40 && p.startsWith(key));
    return i < 0 ? '' : ps.slice(i, i + 25).join('\n').slice(0, 12000);
  } catch (e) { return ''; }
}

module.exports = async (req, res) => {
  try {
    if (!requireAuth(req, res)) return;
    if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'AI is off (no ANTHROPIC_API_KEY). Using rule-based office.', code: 'NO_AI' });
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const b = body(req);
    const s = await readAll(getStore());

    if (b.task === 'route') {
      const out = json(await ask(
        `You are Rina. Turn the student's request into one ticket. Reply with JSON only: {"title": short Indonesian title, "detail": what to do and what to hand back, "assignee": one of ${JSON.stringify(R.WORKERS)}, "priority": "high"|"normal"|"low", "section": thesis section number or "", "reason": one sentence why this staff member}.`,
        String(b.text || '').slice(0, 6000), 'low', 2000));
      if (!R.WORKERS.includes(out.assignee)) out.assignee = R.routeRequest(b.text).assignee;
      return res.status(200).json(out);
    }
    if (b.task === 'work') {
      const t = s.tickets.find((x) => x.id === b.ticketId);
      if (!t) return res.status(404).json({ error: 'Ticket not found' });
      const who = R.STAFF[t.assignee];
      const ctx = await draftContext(t.section);
      const text = await ask(
        `You are the ${who.role}. Do the ticket's work and hand back a result the student can review. Start with "Hasil:" then ready-to-paste replacement text if applicable, then "Yang perlu Anda lengkapi:" listing anything only the student can supply.`,
        `Ticket #${t.no}: ${t.title}\n\n${t.detail}\n\n${t.closeNote ? 'Revision request from the student: ' + t.closeNote + '\n\n' : ''}${ctx ? 'Current draft text around this section:\n' + ctx : ''}`, 'high', 12000);
      return res.status(200).json({ result: text });
    }
    if (b.task === 'meeting' || b.task === 'minutes') {
      const m = s.meetings.find((x) => x.id === b.meetingId);
      if (!m) return res.status(404).json({ error: 'Meeting not found' });
      const board = s.tickets.filter((t) => t.status !== 'closed').map((t) => `#${t.no} [${t.status}] ${t.title} (${t.assignee || 'unassigned'})`).join('\n');
      const talk = m.contributions.map((c) => `${(R.STAFF[c.who] || { name: 'Student' }).name}: ${c.text}`).join('\n');
      if (b.task === 'meeting') {
        const who = R.STAFF[b.who];
        if (!who) return res.status(400).json({ error: 'Unknown staff member' });
        const text = await ask(`You are ${who.name}, the ${who.role}, speaking in a rooftop meeting. Give your perspective in 2-4 sentences from your role only. Do not repeat what others said.`,
          `Topic: ${m.topic}\n${m.agenda ? 'Agenda: ' + m.agenda + '\n' : ''}Open tickets:\n${board}\n\nSo far:\n${talk || '(nothing yet)'}`, 'low', 1500);
        return res.status(200).json({ text });
      }
      const out = json(await ask(`You are Nadia, the secretary. Write meeting minutes. Reply with JSON only: {"minutes": minutes in Indonesian with decisions, "actions": [{"text": action item, "assignee": one of ${JSON.stringify(R.WORKERS)}}]}.`,
        `Topic: ${m.topic}\nDiscussion:\n${talk}\n\nOpen tickets:\n${board}`, 'medium', 4000));
      return res.status(200).json(out);
    }
    if (b.task === 'chat') {
      const who = R.STAFF[b.who];
      if (!who) return res.status(400).json({ error: 'Unknown staff member' });
      const mine = s.tickets.filter((t) => t.assignee === b.who && !['closed', 'approved'].includes(t.status)).map((t) => `#${t.no} [${t.status}] ${t.title}`).join('\n');
      const hist = (s.chats[b.who] || []).slice(-10).map((m) => `${m.who === 'owner' || m.who === 'you' ? 'Student' : who.name}: ${m.text}`).join('\n');
      const text = await ask(`You are ${who.name}, the ${who.role}, chatting casually with the student. Reply in short, friendly, casual Indonesian (1-3 sentences), in character, reacting to their mood. You cannot change the thesis, approve, start or close tickets from this chat; if they want that, tell them which word to type ("mulai", "acc", "revisi #n: ...") or which button to press. Never claim you already did something.`,
        `Your open tickets:\n${mine || '(none)'}\n\nRecent chat:\n${hist || '(nothing yet)'}\n\nStudent now says: ${String(b.text || '').slice(0, 2000)}`, 'low', 800);
      return res.status(200).json({ text });
    }
    res.status(400).json({ error: 'Unknown task' });
  } catch (e) { fail(res, e); }
};
