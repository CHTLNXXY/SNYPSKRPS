// Talking to a staff member. Understands everyday Indonesian (and some English): firing, renaming,
// disagreeing, being angry, praise, status questions, "start", "approve", "revise".
// Returns what the staff member says and which office actions to run. Actions are only ones you could
// also do with a button (give go-ahead, approve, request revision, rename, replace a staff member).
(function () {
  const R = window.SNYP_ROSTER;
  const NEW_NAMES = ['Budi', 'Sari', 'Dimas', 'Ayu', 'Rizky', 'Putri', 'Fajar', 'Intan', 'Bayu', 'Dewi', 'Gilang', 'Wulan', 'Arif', 'Nisa', 'Yoga', 'Laras', 'Hendra', 'Maya', 'Tono', 'Citra'];
  const ROLE_ID = { rina: 'resepsionis', nadia: 'sekretaris', stat: 'ahli statistik', metod: 'ahli metodologi', lib: 'pustakawan referensi', director: 'direktur' };
  const JOB_ID = {
    rina: 'menerima permintaanmu, membuat tiket, dan mengantarnya ke staf yang tepat',
    nadia: 'mengurus format, administrasi, jadwal, dan notulen rapat',
    stat: 'mengurus sampel, responden, kuesioner, dan olah data',
    metod: 'mengurus variabel, indikator, skala, hipotesis, dan BAB III',
    lib: 'mengurus referensi, sitasi APA 7, dan jurnal',
    director: 'mengawasi semua meja dan memberi tahu kalau ada yang tertunda. Saya tidak mengubah skripsimu dan tidak menyetujui apa pun tanpa izinmu',
  };
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const has = (re, t) => re.test(t);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  function newName(taken) {
    const free = NEW_NAMES.filter((n) => !taken.includes(n));
    return pick(free.length ? free : NEW_NAMES);
  }
  function cleanName(s) {
    const n = String(s || '').replace(/[^\p{L}\p{N} .'-]/gu, '').trim().split(/\s+/).slice(0, 3).join(' ');
    return n ? n.split(' ').map(cap).join(' ').slice(0, 24) : '';
  }

  // text: what you typed; who: staff id; data: office data
  function reply(who, text, data) {
    const t = ' ' + String(text || '').toLowerCase().replace(/\s+/g, ' ') + ' ';
    const me = R.STAFF[who];
    const mine = (data.tickets || []).filter((x) => x.assignee === who && !['approved', 'closed'].includes(x.status));
    const ready = mine.filter((x) => x.status === 'ready');
    const waiting = mine.filter((x) => x.status === 'delivered');
    const working = mine.filter((x) => ['authorized', 'working', 'revision'].includes(x.status));
    const num = (t.match(/#\s?(\d+)|tiket\s+(\d+)/) || []).slice(1).find(Boolean);
    const byNo = (list) => (num ? list.filter((x) => String(x.no) === num) : list);
    const taken = Object.values(R.STAFF).map((s) => s.name);
    const NEG = /\b(ga|gak|nggak|enggak|tidak|tak|kurang|belum|bukan|jangan)\s+(setuju|suka|bagus|oke|ok|acc|cocok|sesuai|benar|bener)\b|\bnot (ok|good|agree)\b|\bdisagree\b/;

    // 1. Fire / replace
    if (has(/\b(pecat|dipecat|kupecat|gua pecat|saya pecat|keluar (kamu|lu|lo)|you'?re fired|fire you)\b/, t)) {
      const m = t.match(/\b(?:ganti|diganti|gantiin|pengganti(?:nya)?)\s+(?:dengan|sama|oleh|jadi|:)?\s*([\p{L}][\p{L}' -]{1,23})/u);
      const repl = cleanName(m && m[1]) || newName(taken);
      return {
        confirm: `Pecat ${me.name}? Posisinya (${ROLE_ID[who]}) diisi staf baru bernama ${repl}. Tiket dan riwayat tetap aman.`,
        say: pick([`Baik… saya mengerti. Terima kasih atas kesempatannya. Semua tiket saya serahkan ke ${repl}.`, `Maaf kalau kerja saya mengecewakan. Saya pamit, ${repl} akan melanjutkan tugas saya.`]),
        actions: [{ type: 'fire', who, oldName: me.name, newName: repl }],
        after: { who, text: `Halo, saya ${repl}, ${ROLE_ID[who]} yang baru. Saya sudah baca semua tiket ${me.name}${mine.length ? ` (${mine.map((x) => '#' + x.no).join(', ')})` : ''}, siap melanjutkan.` },
        mood: 'sad',
      };
    }
    // 2. Rename ("ganti nama jadi Budi", "namamu sekarang Budi", "aku panggil kamu Budi")
    const rn = t.match(/\b(?:ganti nama(?:mu|nya)?|namamu|nama kamu|nama lu|nama lo|panggil (?:kamu|lu|lo)|rename)\s*(?:sekarang|jadi|menjadi|=|:|to)?\s*(?:jadi|menjadi)?\s*([\p{L}][\p{L}' -]{1,23})/u);
    if (rn) {
      const n = cleanName(rn[1]);
      if (n && !/^(siapa|apa|kamu|lu|lo|saya|aku)$/i.test(n) && n.toLowerCase() !== me.name.toLowerCase()) return { say: `Siap! Mulai sekarang panggil saya ${n}.`, actions: [{ type: 'rename', who, newName: n }], mood: 'happy' };
    }
    // 3. Disagree / revise
    if (NEG.test(t) || has(/\b(revisi|perbaiki|ulang(i)?|salah|keliru|ganti isinya|redo|revise)\b/, t)) {
      const list = byNo(ready);
      if (list.length === 1) {
        const note = String(text).trim();
        return { say: `Siap, #${list[0].no} saya revisi sesuai catatanmu: "${note.slice(0, 120)}". Nanti saya serahkan lagi untuk kamu setujui.`, actions: [{ type: 'revise', id: list[0].id, note }], mood: 'sad' };
      }
      if (list.length > 1) return { say: `Hasil yang mana yang perlu direvisi? Ada ${list.map((x) => '#' + x.no).join(', ')}. Tulis misalnya "revisi #${list[0].no}: …".`, mood: 'think' };
      return { say: pick([`Oke, saya catat kamu tidak setuju. Bagian mana yang harus diubah? Tulis saja, nanti saya sesuaikan.`, `Maaf kalau belum sesuai. Jelaskan yang kamu mau, saya perbaiki.`]), mood: 'sad' };
    }
    // 4. Angry
    if (has(/\b(marah|kesal|kesel|bete|benci|bodoh|goblok|bego|tolol|lemot|lambat|lelet|payah|kecewa|parah|ngaco|males|malas|kerja apa|gimana sih|angry|stupid|useless|slow)\b|!{2,}/, t)) {
      const pend = waiting.length ? ` Tiket ${waiting.map((x) => '#' + x.no).join(', ')} masih menunggu izinmu, tulis "mulai" kalau mau saya kerjakan sekarang.` : ready.length ? ` Hasil ${ready.map((x) => '#' + x.no).join(', ')} sudah siap, tinggal kamu cek.` : '';
      return { say: pick([`Maaf banget, saya paham kamu kesal.`, `Mohon maaf, itu salah saya. Saya akan lebih cepat.`, `Maaf ya. Saya dengar kok, dan saya mau memperbaikinya.`]) + pend, mood: 'sad' };
    }
    // 5. Approve
    if (has(/\b(acc|setuju|approve|disetujui|terima hasil(nya)?|oke hasilnya|ok hasilnya|sudah bagus|udah bagus|sip hasilnya)\b/, t) && ready.length) {
      const list = byNo(ready);
      if (list.length === 1) return { say: `Terima kasih! #${list[0].no} saya tandai disetujui.`, actions: [{ type: 'approve', id: list[0].id }], mood: 'happy' };
      return { say: `Yang mana yang kamu setujui? ${list.map((x) => '#' + x.no).join(', ')}. Tulis misalnya "acc #${list[0].no}".`, mood: 'think' };
    }
    // 6. Go-ahead
    if (has(/\b(mulai|kerjain|kerjakan|kerjakan sekarang|gas|lanjut(kan)?|silakan|boleh mulai|go ahead|start)\b/, t)) {
      const list = byNo(waiting);
      if (who === 'director' || who === 'rina') return { say: who === 'rina' ? 'Saya cuma mengantar tiket. Izin kerja diberikan langsung ke staf yang memegang tiketnya.' : 'Saya hanya mengawasi. Beri izin langsung ke staf yang memegang tiketnya.', mood: 'think' };
      if (list.length) return { say: `Siap! Saya mulai ${list.map((x) => '#' + x.no).join(', ')} sekarang.`, actions: list.map((x) => ({ type: 'authorize', id: x.id })), mood: 'happy' };
      if (working.length) return { say: `Saya sudah mengerjakan ${working.map((x) => '#' + x.no).join(', ')}.`, mood: 'happy' };
      return { say: 'Belum ada tiket di meja saya. Kirim permintaan lewat Rina di resepsionis, nanti saya kerjakan.', mood: 'think' };
    }
    // 7. Status
    if (has(/\b(gimana|bagaimana|progres|progress|status|sampai mana|udah sampai|update|lagi apa|lagi ngapain|kabar|sibuk|kerjaan)\b/, t)) {
      if (who === 'director') {
        const all = (data.tickets || []).filter((x) => !['approved', 'closed'].includes(x.status));
        return { say: all.length ? `Ada ${all.length} tiket terbuka: ${all.filter((x) => x.status === 'delivered').length} menunggu izinmu, ${all.filter((x) => ['authorized', 'working', 'revision'].includes(x.status)).length} dikerjakan, ${all.filter((x) => x.status === 'ready').length} siap kamu setujui.` : 'Semua beres, tidak ada tiket terbuka.', mood: 'think' };
      }
      if (!mine.length) return { say: 'Meja saya kosong. Siap menerima tugas baru.', mood: 'happy' };
      const parts = [];
      if (waiting.length) parts.push(`${waiting.map((x) => '#' + x.no).join(', ')} menunggu izinmu`);
      if (working.length) parts.push(`${working.map((x) => '#' + x.no).join(', ')} sedang saya kerjakan`);
      if (ready.length) parts.push(`${ready.map((x) => '#' + x.no).join(', ')} sudah siap kamu cek`);
      return { say: cap(parts.join('; ')) + '.', mood: 'think' };
    }
    // 8. Praise / thanks
    if (has(/\b(makasih|terima kasih|thanks|thank you|mantap|mantul|keren|hebat|bagus|good job|nice|sip|top|luar biasa)\b/, t)) return { say: pick(['Sama-sama! Senang bisa membantu.', 'Terima kasih, jadi semangat!', 'Siap, saya lanjutkan dengan semangat.']), mood: 'happy' };
    // 9. Who are you / what do you do
    if (has(/\b(siapa|tugas(mu)?|kerjaan(mu)?|bisa apa|ngapain aja|who are you|your job)\b/, t)) return { say: `Saya ${me.name}, ${ROLE_ID[who]}. Tugas saya ${JOB_ID[who]}.`, mood: 'happy' };
    // 10. Greeting
    if (has(/\b(halo|hai|hi|hello|hey|pagi|siang|sore|malam|assalamualaikum|permisi)\b/, t)) return { say: `${/assalamualaikum/.test(t) ? "Wa'alaikumsalam" : 'Halo'}! Saya ${me.name}. Ada yang bisa saya bantu?`, mood: 'happy' };
    return { unknown: true, say: `Maaf, saya belum paham. Kamu bisa bilang misalnya: "gimana progresnya", "mulai", "acc", "ga setuju, …", "ganti nama jadi Budi", atau "kamu dipecat".`, mood: 'think' };
  }

  window.SNYP_TALK = { reply, cleanName, newName };
})();
