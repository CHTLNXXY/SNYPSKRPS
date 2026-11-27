// Automatic draft check: reads the thesis .docx and reports unfinished placeholders and incomplete references.
const crypto = require('crypto');
const { unzipSync, strFromU8 } = require('fflate');

function paragraphs(buf) {
  const files = unzipSync(new Uint8Array(buf), { filter: (f) => f.name === 'word/document.xml' });
  const xml = strFromU8(files['word/document.xml'] || new Uint8Array());
  const out = [];
  for (const p of xml.split(/<\/w:p>/)) {
    const text = (p.match(/<w:t(?:\s[^>]*)?>[^<]*<\/w:t>|<w:tab\/>|<w:br\/>|<w:cr\/>/g) || [])
      .map((x) => (x === '<w:tab/>' ? '\t' : x === '<w:br/>' || x === '<w:cr/>' ? '\n' : x.replace(/<[^>]+>/g, ''))).join('')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim();
    if (text) out.push(text);
  }
  return out;
}

// Same key for a finding whether it comes from this checker or from an old imported ticket title.
function findingKey(title) {
  const t = String(title || '');
  if (/reference entries are incomplete/i.test(t)) return 'refs:incomplete';
  if (/^front matter/i.test(t)) return 'front:placeholders';
  const m = t.match(/^Unfinished placeholder: (.*)$/);
  if (m) return 'ph:' + m[1].replace(/…$/, '').trim().toLowerCase();
  return t;
}

function check(buf, fileName) {
  const revision = crypto.createHash('md5').update(Buffer.from(buf)).digest('hex');
  const ps = paragraphs(buf);
  let section = '', inRefs = false, inBody = false;
  const front = [], body = [], refs = [], unwritten = [];
  let inAppendix = false;
  for (const t of ps) {
    if (/^LAMPIRAN\s*$/i.test(t) && inBody) { inAppendix = true; inRefs = false; continue; }
    if (inAppendix) continue;
    if (/^Belum ditulis\b/i.test(t) && inBody) { unwritten.push(section); continue; }
    const head = t.match(/^(\d+(?:\.\d+)+)\s/);
    if (/^BAB\s+I\b/.test(t) && !/\t\d+$/.test(t)) inBody = true;
    if (/^DAFTAR PUSTAKA\s*$/i.test(t)) { if (inBody) { inRefs = true; section = 'DAFTAR PUSTAKA'; } continue; }
    if (head && !/\t\d+$/.test(t)) section = head[1];
    if (inRefs) { if (/\(\d{4}[a-z]?[,)]/.test(t) || /\[/.test(t)) refs.push(t); continue; }
    for (const b of t.match(/\[[^\]]{1,300}\]/g) || []) (inBody ? body : front).push({ section, text: b });
  }
  const findings = [];
  for (const b of body) {
    const assignee = /^\[\s*CEK\b|PDF|artikel|jurnal|DOI/i.test(b.text) ? 'lib' : /sampel|sample|responden/i.test(b.text) ? 'stat' : /skala|indikator|variabel/i.test(b.text) ? 'metod' : 'nadia';
    findings.push({
      key: findingKey('Unfinished placeholder: ' + b.text), section: b.section, assignee, priority: 'high',
      title: 'Unfinished placeholder: ' + b.text,
      detail: `Draft check finding:\n- ${b.section}: Unfinished placeholder: ${b.text} (Suggestion: replace it with the real content.)\n\nPrepare the fix and hand over ready-to-paste replacement text.`,
    });
  }
  if (front.length) {
    findings.push({
      key: 'front:placeholders', section: 'Front matter', assignee: 'nadia', priority: 'normal',
      title: `Front matter: ${front.length} placeholders to fill (name, NIM, campus, dates…)`,
      detail: 'Draft check finding:\n' + front.map((f) => '- ' + f.text).join('\n') + '\n\nThese need your personal details; Nadia lists them for you to fill.',
    });
  }
  if (unwritten.length) {
    findings.push({
      key: 'chapters:unwritten', section: unwritten[0], assignee: 'nadia', priority: 'normal',
      title: `${unwritten.length} sections not written yet (${[...new Set(unwritten.map((s) => 'BAB ' + ['', 'I', 'II', 'III', 'IV', 'V'][parseInt(s, 10)]))].join(', ')})`,
      detail: 'Draft check finding:\n' + unwritten.map((s) => '- ' + s).join('\n') + '\n\nThese sections wait for the questionnaire data. Nadia keeps the list; nothing to do until the data is collected.',
    });
  }
  const isBook = (r) => /\(\d+(?:st|nd|rd|th)\s+ed\.\)|\b(Press|Publishing|Learning|Associates|Wiley|Pearson|Sage|Springer|Routledge|Alfabeta|Erlangga)\b/i.test(r);
  const bad = refs.filter((r) => /\[/.test(r) || (!/(doi\.org|https?:\/\/)/i.test(r) && !isBook(r)));
  if (bad.length) {
    const names = bad.map((r) => r.split('(')[0].trim().slice(0, 45));
    findings.push({
      key: 'refs:incomplete', section: 'DAFTAR PUSTAKA', assignee: 'lib', priority: 'high',
      title: `${bad.length} of ${refs.length} reference entries are incomplete (missing initials, journal, volume, pages or URL)`,
      detail: 'Draft check finding:\n' + names.map((n) => '- ' + n).join('\n') + '\n\nComplete each entry in APA 7 from the original article (see 02_Journal_References) and hand over ready-to-paste text.',
    });
  }
  return { file: fileName, revision, paragraphs: ps.length, findings };
}

module.exports = { check, paragraphs, findingKey };
