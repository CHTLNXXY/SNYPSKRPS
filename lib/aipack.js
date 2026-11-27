// "Paket untuk AI": one Markdown file with everything another Claude chat (or a search) needs to continue:
// instructions, the current state of the office, and the full text of the compiled thesis.
const { unzipSync, strFromU8 } = require('fflate');
const R = require('../public/js/roster.js');

const ent = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const name = (id) => (R.STAFF[id] ? R.STAFF[id].name : id === 'owner' || id === 'you' ? 'Saya' : id || '-');
const STATUS_ID = { received: 'Di resepsionis', delivered: 'Menunggu izin', authorized: 'Diizinkan', working: 'Dikerjakan', ready: 'Siap disetujui', revision: 'Revisi', approved: 'Disetujui', closed: 'Ditutup' };
const fmt = (ms) => (ms ? new Date(ms).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }) : '-');

// .docx -> Markdown: headings by style, list items as "- ", italics kept, table of contents skipped.
function docxToMarkdown(buf) {
  const xml = strFromU8(unzipSync(new Uint8Array(buf), { filter: (f) => f.name === 'word/document.xml' })['word/document.xml'] || new Uint8Array());
  const body = xml.split(/<w:body>/)[1] || xml;
  const out = [];
  const blocks = body.match(/<w:p[ >][\s\S]*?<\/w:p>|<w:tbl>[\s\S]*?<\/w:tbl>/g) || [];
  const runText = (p) => (p.match(/<w:r[ >][\s\S]*?<\/w:r>/g) || []).map((r) => {
    const t = (r.match(/<w:t(?:\s[^>]*)?>[^<]*<\/w:t>|<w:tab\/>|<w:br\/>/g) || []).map((x) => (x === '<w:tab/>' ? ' ' : x === '<w:br/>' ? ' ' : ent(x.replace(/<[^>]+>/g, '')))).join('');
    if (!t.trim()) return t;
    return /<w:i\/>|<w:i w:val="(true|1)"\/>/.test(r) ? `*${t.trim()}*${/\s$/.test(t) ? ' ' : ''}` : t;
  }).join('').replace(/\*(\s*)\*/g, '$1').replace(/[ \t]+/g, ' ').trim();
  for (const b of blocks) {
    if (b.startsWith('<w:tbl>')) {
      const rows = (b.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || []).map((tr) => (tr.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || []).map((tc) => (tc.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []).map(runText).filter(Boolean).join(' ').replace(/\|/g, '/')));
      if (rows.length) { out.push('', '| ' + rows[0].join(' | ') + ' |', '|' + rows[0].map(() => '---').join('|') + '|', ...rows.slice(1).map((r) => '| ' + r.join(' | ') + ' |'), ''); }
      continue;
    }
    const style = (b.match(/<w:pStyle w:val="([^"]+)"/) || [])[1] || '';
    if (/^toc|^TOC/i.test(style)) continue;
    const text = runText(b);
    if (!text) continue;
    if (/^Heading1$|^heading 1$/i.test(style)) out.push('', '# ' + text.replace(/\*/g, ''), '');
    else if (/^Heading2$/i.test(style)) out.push('', '## ' + text.replace(/\*/g, ''), '');
    else if (/^Heading3$/i.test(style)) out.push('', '### ' + text.replace(/\*/g, ''), '');
    else if (/<w:numPr>/.test(b)) out.push('- ' + text);
    else out.push(text, '');
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function build(data, thesis) {
  const t = data.tickets || [];
  const open = t.filter((x) => !['approved', 'closed'].includes(x.status));
  const done = t.filter((x) => x.result);
  const m = (data.meetings || []).filter((x) => x.minutes).slice(-3).reverse();
  const L = [];
  L.push('# Paket Lanjutan Skripsi (SNYP University)', '');
  L.push(`Dibuat: ${fmt(Date.now())}`, '');
  L.push('## Instruksi untuk AI', '');
  L.push('Kamu membantu saya melanjutkan skripsi berjudul **"Pengaruh Trust in AI dan AI Reliance terhadap Minat Investasi Syariah pada Pengguna Artificial Intelligence"**. Di bawah ini ada status pekerjaan terakhir dari kantor skripsi virtual saya dan teks lengkap skripsi versi terbaru.', '');
  L.push('Aturan:', '- Gunakan Bahasa Indonesia akademik.', '- Jangan mengarang angka, data responden, hasil olah data, atau referensi. Jika data belum ada, tulis dengan jelas data apa yang harus saya isi.', '- Pertahankan struktur bab dan penomoran yang sudah ada.', '- Bagian bertanda "Belum ditulis", [BELUM ...] atau [………] adalah bagian yang masih harus dilengkapi.', '- Catatan [CEK: …] berarti isi itu harus dicocokkan dulu dengan artikel aslinya; jangan dianggap pasti benar.', '- Sitasi memakai format APA 7.', '');
  L.push('## Status pekerjaan', '');
  L.push(`Tiket terbuka: ${open.length} · total tiket: ${t.length}`, '');
  for (const x of open) {
    L.push(`### Tiket #${x.no}: ${x.title}`, `- Penanggung jawab: ${name(x.assignee)}`, `- Status: ${STATUS_ID[x.status] || x.status}${x.section ? ` · bagian ${x.section}` : ''}`);
    if (x.detail) L.push('- Detail: ' + x.detail.replace(/\n+/g, ' '));
    for (const c of (x.comments || []).slice(-3)) L.push(`- Catatan ${name(c.who)}: ${String(c.text).replace(/^\[[\w-]+\]\s*/, '')}`);
    L.push('');
  }
  if (done.length) { L.push('## Hasil kerja yang sudah ada', ''); for (const x of done) L.push(`### #${x.no} ${x.title} (${STATUS_ID[x.status]})`, '', x.result, ''); }
  if (m.length) { L.push('## Notulen rapat terakhir', ''); for (const x of m) L.push(`### ${x.topic} (${fmt(x.createdAt)})`, '', x.minutes, ''); }
  if (data.state && data.state.lastCheckedAt) L.push(`Cek draf otomatis terakhir: ${fmt(data.state.lastCheckedAt)} pada ${data.state.lastCheckedFile}`, '');
  L.push('---', '', `## Teks lengkap skripsi${thesis ? ` (${thesis.file})` : ''}`, '');
  L.push(thesis ? thesis.markdown : '_File skripsi tidak ditemukan di arsip._');
  return L.join('\n') + '\n';
}

module.exports = { docxToMarkdown, build };
