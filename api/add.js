const L = require('./_lib');
// Mengirim transaksi ke Google Form yang sama dengan form pencatatan, sehingga masuk ke sheet.
module.exports = async (req, res) => {
  if (!L.guard(req, res)) return;
  const E = process.env;
  if (!E.GFORM_ID || !E.GFORM_E_DATE || !E.GFORM_E_CAT || !E.GFORM_E_AMT || !E.GFORM_E_NOTE)
    return res.status(501).json({ error: 'not_configured' });
  const { d, t, a, n } = req.body || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '') || !(a > 0)) return res.status(400).json({ error: 'Data tidak valid' });
  const [y, m, day] = d.split('-');
  const f = new URLSearchParams();
  if (E.GFORM_DATE_TEXT) f.set('entry.' + E.GFORM_E_DATE, `${day}/${m}/${y}`);
  else { f.set(`entry.${E.GFORM_E_DATE}_year`, y); f.set(`entry.${E.GFORM_E_DATE}_month`, String(+m)); f.set(`entry.${E.GFORM_E_DATE}_day`, String(+day)); }
  f.set('entry.' + E.GFORM_E_CAT, t === 'in' ? 'Uang Masuk' : 'Uang Keluar');
  f.set('entry.' + E.GFORM_E_AMT, String(a));
  f.set('entry.' + E.GFORM_E_NOTE, String(n || '').slice(0, 200));
  const rek = String((req.body || {}).r || '').slice(0, 60);
  if (rek && t === 'in' && E.GFORM_E_TO) f.set('entry.' + E.GFORM_E_TO, rek);
  if (rek && t !== 'in' && E.GFORM_E_FROM) f.set('entry.' + E.GFORM_E_FROM, rek);
  try {
    const r = await fetch(`https://docs.google.com/forms/d/e/${E.GFORM_ID}/formResponse`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: f, redirect: 'manual'
    });
    if (r.status < 400) return res.status(200).json({ ok: true });
    res.status(502).json({ error: 'Google Form menolak data (' + r.status + ')' });
  } catch (e) { res.status(502).json({ error: e.message }); }
};
