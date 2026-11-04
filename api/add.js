const L = require('./_lib');
// Mengirim transaksi ke Google Form yang sama dengan form pencatatan, sehingga masuk ke sheet.
//
// Variabel lingkungan (Vercel):
//   GFORM_ID, GFORM_E_DATE, GFORM_E_CAT, GFORM_E_AMT, GFORM_E_NOTE   (wajib)
//   GFORM_E_FROM     kolom F  rekening pengirim  (uang keluar)
//   GFORM_E_TO       kolom G  rekening penerima  (uang masuk)
//   GFORM_E_TF_FROM  kolom H  rekening pengirim  (transfer antar rekening)
//   GFORM_E_TF_TO    kolom I  rekening penerima  (transfer antar rekening)
//   GFORM_DATE_TEXT  isi 1 jika kolom tanggal di form berupa teks (bukan pemilih tanggal)
//   GFORM_PAGES      (opsional) paksa pageHistory, mis. "0,2". Biasanya tidak perlu.

let META = { at: 0, v: null };

// Membaca struktur form (bagian/section, opsi dropdown) supaya jawaban di bagian
// bercabang ikut tercatat. Form bercabang WAJIB dikirim bersama pageHistory.
async function formMeta(id) {
  if (META.v && Date.now() - META.at < 10 * 60 * 1000) return META.v;
  try {
    const r = await fetch(`https://docs.google.com/forms/d/e/${id}/viewform`, { redirect: 'follow' });
    if (!r.ok) return null;
    const html = await r.text();
    const m = html.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*([\s\S]*?);\s*<\/script>/);
    if (!m) return null;
    const items = JSON.parse(m[1])[1][1] || [];
    const q = {};
    let sec = 0;
    for (const it of items) {
      if (!Array.isArray(it)) continue;
      if (it[3] === 8) { sec++; continue; } // 8 = pemisah bagian (section)
      for (const sub of it[4] || []) {
        if (!Array.isArray(sub) || sub[0] == null) continue;
        q[String(sub[0])] = { sec, opts: (sub[1] || []).map(o => String(o && o[0] != null ? o[0] : '')).filter(Boolean) };
      }
    }
    META = { at: Date.now(), v: q };
    return q;
  } catch (e) { return null; }
}

const pick = (opts, re, fb) => (opts && opts.find(o => re.test(o))) || fb;
const same = (opts, v) => (opts && opts.find(o => o.toLowerCase() === v.toLowerCase())) || null;

module.exports = async (req, res) => {
  if (!L.guard(req, res)) return;
  const E = process.env;
  if (!E.GFORM_ID || !E.GFORM_E_DATE || !E.GFORM_E_CAT || !E.GFORM_E_AMT || !E.GFORM_E_NOTE)
    return res.status(501).json({ error: 'not_configured' });

  const b = req.body || {};
  const t = b.t === 'in' ? 'in' : b.t === 'tf' ? 'tf' : 'out';
  const { d, a, n } = b;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '') || !(a > 0)) return res.status(400).json({ error: 'Data tidak valid' });

  // Rekening: from = pengirim, to = penerima. Field lama "r" tetap dipahami.
  const r0 = String(b.r || '').slice(0, 60);
  const from = String(b.from || (t === 'out' ? r0 : '')).slice(0, 60);
  const to = String(b.to || (t === 'in' ? r0 : '')).slice(0, 60);
  if (t === 'tf') {
    if (!from || !to) return res.status(400).json({ error: 'Transfer butuh rekening pengirim dan penerima' });
    if (from === to) return res.status(400).json({ error: 'Rekening pengirim dan penerima tidak boleh sama' });
  }

  const meta = await formMeta(E.GFORM_ID);
  const f = new URLSearchParams();
  const used = [E.GFORM_E_CAT];
  const warn = [];

  // Tanggal
  const [y, m, day] = d.split('-');
  if (E.GFORM_DATE_TEXT) f.set('entry.' + E.GFORM_E_DATE, `${day}/${m}/${y}`);
  else { f.set(`entry.${E.GFORM_E_DATE}_year`, y); f.set(`entry.${E.GFORM_E_DATE}_month`, String(+m)); f.set(`entry.${E.GFORM_E_DATE}_day`, String(+day)); }
  used.push(E.GFORM_E_DATE);

  // Jenis transaksi: pakai label persis seperti di form
  const co = meta && meta[E.GFORM_E_CAT] && meta[E.GFORM_E_CAT].opts;
  const cat = t === 'in' ? pick(co, /masuk/i, 'Uang Masuk') : t === 'tf' ? pick(co, /transfer/i, 'Transfer') : pick(co, /keluar/i, 'Uang Keluar');
  if (t === 'tf' && co && co.length && !/transfer/i.test(cat))
    return res.status(422).json({ error: 'Form belum punya pilihan jenis "Transfer"' });
  f.set('entry.' + E.GFORM_E_CAT, cat);
  f.set('entry.' + E.GFORM_E_AMT, String(a)); used.push(E.GFORM_E_AMT);
  f.set('entry.' + E.GFORM_E_NOTE, String(n || '').slice(0, 200)); used.push(E.GFORM_E_NOTE);

  // Rekening -> kolom F / G / H / I sesuai jenis transaksi
  const slots = t === 'out' ? [[E.GFORM_E_FROM, from, 'GFORM_E_FROM']]
    : t === 'in' ? [[E.GFORM_E_TO, to, 'GFORM_E_TO']]
    : [[E.GFORM_E_TF_FROM, from, 'GFORM_E_TF_FROM'], [E.GFORM_E_TF_TO, to, 'GFORM_E_TF_TO']];
  for (const [id, val, name] of slots) {
    if (!val) continue;
    if (!id) { warn.push(name + ' belum diisi di Vercel, rekening tidak ikut tersimpan'); continue; }
    const opts = meta && meta[id] && meta[id].opts;
    const exact = opts && opts.length ? same(opts, val) : val;
    if (!exact) return res.status(422).json({ error: `Rekening "${val}" tidak ada di pilihan form (cek ejaan dropdown di Google Form)` });
    f.set('entry.' + id, exact); used.push(id);
  }

  // Form bercabang: kirim urutan bagian yang dilewati
  if (E.GFORM_PAGES) f.set('pageHistory', E.GFORM_PAGES);
  else if (meta) {
    const secs = [...new Set([0, ...used.map(id => meta[String(id)] ? meta[String(id)].sec : 0)])].sort((x, y) => x - y);
    if (secs.length > 1) f.set('pageHistory', secs.join(','));
  }
  f.set('fvv', '1');

  try {
    const r = await fetch(`https://docs.google.com/forms/d/e/${E.GFORM_ID}/formResponse`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: f, redirect: 'manual'
    });
    if (r.status < 400) return res.status(200).json({ ok: true, warn });
    res.status(502).json({ error: 'Google Form menolak data (' + r.status + ')' });
  } catch (e) { res.status(502).json({ error: e.message }); }
};
