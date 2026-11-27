// The Floor 2 photocopier: turns office data into Word (.docx), Excel (.xlsx) or a printable page (Save as PDF).
// One small document model, three writers. No external services; .docx/.xlsx are zipped XML built with fflate.
const { zipSync, strToU8 } = require('fflate');
const R = require('../public/js/roster.js');

const name = (id) => (R.STAFF[id] ? R.STAFF[id].name : id === 'owner' || id === 'you' ? 'You' : id || '-');
const STATUS_ID = { received: 'Di resepsionis', delivered: 'Menunggu izin', authorized: 'Diizinkan', working: 'Dikerjakan', ready: 'Siap disetujui', revision: 'Revisi', approved: 'Disetujui', closed: 'Ditutup' };
const fmt = (ms) => (ms ? new Date(ms).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }) : '-');
const safe = (s) => String(s || 'dokumen').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_').slice(0, 60) || 'dokumen';

// Model: { title, file, meta: [[k,v]], blocks: [{h}|{p}|{table:{head,rows}}] }
function buildModel(data, kind, id) {
  const tickets = data.tickets || [];
  if (kind === 'ticket') {
    const t = tickets.find((x) => x.id === id || String(x.no) === String(id));
    if (!t) { const e = new Error('Ticket not found'); e.status = 404; throw e; }
    const blocks = [{ h: 'Detail' }, { p: t.detail || '-' }];
    if (t.result) blocks.push({ h: 'Hasil' }, { p: t.result });
    if ((t.comments || []).length) blocks.push({ h: 'Catatan' }, { table: { head: ['Waktu', 'Dari', 'Catatan'], rows: t.comments.map((c) => [fmt(c.at), name(c.who), c.text]) } });
    if ((t.history || []).length) blocks.push({ h: 'Riwayat' }, { table: { head: ['Waktu', 'Status', 'Oleh'], rows: t.history.map((x) => [fmt(x.at), STATUS_ID[x.to] || x.to, name(x.by)]) } });
    return { title: `Tiket #${t.no}: ${t.title}`, file: `Tiket_${t.no}_${safe(t.title)}`,
      meta: [['Penanggung jawab', name(t.assignee)], ['Status', STATUS_ID[t.status] || t.status], ['Bagian', t.section || '-'], ['Sumber', t.source || '-'], ['Prioritas', t.priority || '-'], ['Dibuat', fmt(t.createdAt)], ['Diperbarui', fmt(t.updatedAt || t.createdAt)]], blocks };
  }
  if (kind === 'meeting') {
    const ms = data.meetings || [];
    const m = id ? ms.find((x) => x.id === id) : ms[ms.length - 1];
    if (!m) { const e = new Error('Meeting not found'); e.status = 404; throw e; }
    const blocks = [];
    if (m.agenda) blocks.push({ h: 'Agenda' }, { p: m.agenda });
    if ((m.contributions || []).length) blocks.push({ h: 'Diskusi' }, { table: { head: ['Peserta', 'Pendapat'], rows: m.contributions.map((c) => [name(c.who), c.text]) } });
    if (m.minutes) blocks.push({ h: 'Notulen (Nadia)' }, { p: m.minutes });
    if ((m.actions || []).length) blocks.push({ h: 'Action item' }, { table: { head: ['No', 'Tugas', 'Penanggung jawab', 'Tiket'], rows: m.actions.map((a, i) => [String(i + 1), a.text, name(a.assignee), a.ticket ? '#' + ((tickets.find((t) => t.id === a.ticket) || {}).no || '') : '-']) } });
    return { title: `Notulen Rapat: ${m.topic}`, file: `Notulen_${safe(m.topic)}`, meta: [['Tanggal', fmt(m.createdAt)], ['Status', m.status]], blocks };
  }
  // Default: the office report (same content as the rooftop screen, in full).
  const open = tickets.filter((t) => !['approved', 'closed'].includes(t.status));
  const counts = Object.keys(STATUS_ID).map((k) => [STATUS_ID[k], String(tickets.filter((t) => t.status === k).length)]);
  const blocks = [{ h: 'Ringkasan status' }, { table: { head: ['Status', 'Jumlah'], rows: counts } },
    { h: 'Semua tiket' }, { table: { head: ['No', 'Judul', 'Penanggung jawab', 'Status', 'Bagian', 'Sumber', 'Dibuat', 'Diperbarui'], rows: tickets.map((t) => ['#' + t.no, t.title, name(t.assignee), STATUS_ID[t.status] || t.status, t.section || '-', t.source || '-', fmt(t.createdAt), fmt(t.updatedAt || t.createdAt)]) } }];
  const done = tickets.filter((t) => t.result);
  if (done.length) { blocks.push({ h: 'Hasil kerja' }); for (const t of done) blocks.push({ h3: `#${t.no} ${t.title} (${name(t.assignee)})` }, { p: t.result }); }
  const st = data.state || {};
  return { title: 'Laporan SNYP University', file: 'Laporan_SNYP_' + new Date().toISOString().slice(0, 10),
    meta: [['Dicetak', fmt(Date.now())], ['Tiket terbuka', String(open.length)], ['Total tiket', String(tickets.length)], ['Cek draf terakhir', st.lastCheckedAt ? fmt(st.lastCheckedAt) + ' · ' + (st.lastCheckedFile || '') : '-']], blocks };
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

// ---------- Word ----------
function docx(model) {
  const run = (t, o = {}) => `<w:r><w:rPr>${o.b ? '<w:b/>' : ''}${o.sz ? `<w:sz w:val="${o.sz}"/>` : ''}${o.color ? `<w:color w:val="${o.color}"/>` : ''}</w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
  const para = (text, o = {}) => String(text).split('\n').map((line) => `<w:p><w:pPr><w:spacing w:after="${o.after ?? 80}"/></w:pPr>${run(line, o)}</w:p>`).join('');
  const table = ({ head, rows }) => {
    const wt = head.map((h, i) => Math.min(45, Math.max(11, String(h).length, ...rows.map((r) => Math.min(45, String(r[i] ?? '').length)))));
    const tot = wt.reduce((a, b) => a + b, 0), pct = wt.map((w) => Math.round(5000 * w / tot));
    let ci = 0;
    const cell = (t, b) => `<w:tc><w:tcPr><w:tcW w:w="${pct[ci++ % pct.length]}" w:type="pct"/>${b ? '<w:shd w:val="clear" w:color="auto" w:fill="F1E4D0"/>' : ''}</w:tcPr>${String(t).split('\n').map((l) => `<w:p>${run(l, { b, sz: 20 })}</w:p>`).join('')}</w:tc>`;
    const bd = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="single" w:sz="4" w:color="A08C70"/>`).join('');
    return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblLayout w:type="fixed"/><w:tblBorders>${bd}</w:tblBorders></w:tblPr><w:tblGrid>${pct.map((p) => `<w:gridCol w:w="${Math.round(9026 * p / 5000)}"/>`).join('')}</w:tblGrid>`
      + `<w:tr>${head.map((x) => cell(x, true)).join('')}</w:tr>${rows.map((r) => `<w:tr>${r.map((x) => cell(x, false)).join('')}</w:tr>`).join('')}</w:tbl>${para('', { after: 120 })}`;
  };
  let body = para(model.title, { b: true, sz: 36, after: 200 });
  for (const [k, v] of model.meta) body += `<w:p><w:pPr><w:spacing w:after="40"/></w:pPr>${run(k + ': ', { b: true, sz: 20 })}${run(v, { sz: 20 })}</w:p>`;
  for (const b of model.blocks) {
    if (b.h) body += para(b.h, { b: true, sz: 28, color: '5A3416', after: 100 });
    else if (b.h3) body += para(b.h3, { b: true, sz: 22, after: 60 });
    else if (b.p != null) body += para(b.p);
    else if (b.table) body += table(b.table);
  }
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="24"/><w:lang w:val="id-ID"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>`;
  return zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    'word/_rels/document.xml.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'),
    'word/document.xml': strToU8(doc),
    'word/styles.xml': strToU8(styles),
  });
}

// ---------- Excel ----------
// One sheet per table (first sheet "Info" holds title, meta and text blocks).
function xlsx(model) {
  const sheets = [];
  const info = [[model.title], [], ...model.meta.map(([k, v]) => [k, v])];
  let pendingHeading = 'Data';
  for (const b of model.blocks) {
    if (b.h || b.h3) { pendingHeading = b.h || b.h3; if (b.h3) info.push([], [b.h3]); }
    else if (b.p != null) info.push([], [pendingHeading], [b.p]);
    else if (b.table) sheets.push({ name: pendingHeading, rows: [b.table.head, ...b.table.rows], header: true });
  }
  sheets.unshift({ name: 'Info', rows: info, header: false });
  const used = new Set();
  for (const s of sheets) { let n = s.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 28).trim() || 'Sheet'; let k = n, i = 2; while (used.has(k.toLowerCase())) k = n.slice(0, 25) + ' ' + i++; used.add(k.toLowerCase()); s.name = k; }
  const col = (i) => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const sheetXml = (s) => {
    const widths = []; s.rows.forEach((r) => r.forEach((v, i) => { widths[i] = Math.min(80, Math.max(widths[i] || 8, String(v).split('\n')[0].length + 2)); }));
    const cols = widths.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
    const rows = s.rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => `<c r="${col(ci)}${ri + 1}" t="inlineStr"${(s.header && ri === 0) || (!s.header && ri === 0) ? ' s="1"' : ' s="2"'}><is><t xml:space="preserve">${esc(v)}</t></is></c>`).join('')}</row>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${rows}</sheetData></worksheet>`;
  };
  const files = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    'xl/styles.xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF1E4D0"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'),
  };
  sheets.forEach((s, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s)); });
  return zipSync(files);
}

// ---------- Printable page (the browser's "Save as PDF") ----------
function html(model, autoprint) {
  let b = `<h1>${esc(model.title)}</h1><table class="meta">${model.meta.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>`;
  for (const x of model.blocks) {
    if (x.h) b += `<h2>${esc(x.h)}</h2>`;
    else if (x.h3) b += `<h3>${esc(x.h3)}</h3>`;
    else if (x.p != null) b += `<div class="p">${esc(x.p)}</div>`;
    else if (x.table) b += `<table class="grid"><thead><tr>${x.table.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${x.table.rows.map((r) => `<tr>${r.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(model.file)}</title><style>
  body{font:12pt/1.5 "Times New Roman",serif;color:#1d140c;max-width:800px;margin:24px auto;padding:0 16px;background:#fff}
  h1{font-size:20pt;margin:0 0 8px}h2{font-size:14pt;color:#5a3416;margin:20px 0 6px;border-bottom:1px solid #d8c4a6}h3{font-size:12pt;margin:14px 0 4px}
  .p{white-space:pre-wrap}table{border-collapse:collapse;width:100%;margin:6px 0}.grid th,.grid td{border:1px solid #a08c70;padding:4px 6px;vertical-align:top;font-size:10.5pt;white-space:pre-wrap}
  .grid th{background:#f1e4d0;text-align:left}.meta th{text-align:left;padding:1px 12px 1px 0;width:1%;white-space:nowrap}.meta td{padding:1px 0}
  .bar{font:14px system-ui;background:#5a3416;color:#ffe9c2;padding:10px 14px;border-radius:8px;margin-bottom:16px}.bar button{font:inherit;margin-left:8px}
  @media print{.bar{display:none}body{margin:0}}
  </style></head><body><div class="bar">Pilih <b>Save as PDF</b> / <b>Simpan sebagai PDF</b> di jendela cetak.<button onclick="print()">Cetak / Simpan PDF</button></div>${b}
  ${autoprint ? '<script>addEventListener("load",()=>setTimeout(()=>print(),300))</script>' : ''}</body></html>`;
}

module.exports = { buildModel, docx, xlsx, html };
