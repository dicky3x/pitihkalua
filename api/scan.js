const L = require('./_lib');
module.exports = async (req, res) => {
  if (!L.guard(req, res)) return;
  if (!process.env.GROQ_API_KEY) return res.status(500).json({ error: 'GROQ_API_KEY belum diatur di Vercel' });
  const img = (req.body || {}).image;
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(img || '')) return res.status(400).json({ error: 'Gambar tidak valid' });
  const today = new Date().toISOString().slice(0, 10);
  const prompt = `Ini foto struk belanja atau screenshot transaksi (bank, e-wallet, marketplace). Ekstrak satu transaksi. Balas HANYA satu objek JSON: {"tanggal":"YYYY-MM-DD" atau null,"jumlah":angka total yang dibayar tanpa pemisah ribuan (desimal pakai titik),"keterangan":"nama toko atau penerima + ringkasan barang, maks 60 karakter","jenis":"out" atau "in"}. Angka Indonesia "Rp 1.250.000" berarti 1250000. Pakai TOTAL akhir yang dibayar, bukan subtotal atau kembalian. Jika tanggal tidak terbaca isi null. Hari ini ${today}. Isi "in" hanya jika jelas uang masuk ke pengguna.`;
  try {
    const txt = await L.groq({
      model: process.env.GROQ_VISION_MODEL || 'qwen/qwen3.8-27b',
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: img } }] }],
      temperature: 0, max_tokens: 1500
    });
    const m = txt.match(/\{[^{}]*"jumlah"[^{}]*\}/);
    if (!m) throw new Error('AI tidak mengembalikan data yang bisa dibaca');
    const j = JSON.parse(m[0]);
    const a = Number(j.jumlah);
    res.status(200).json({
      tanggal: /^\d{4}-\d{2}-\d{2}$/.test(j.tanggal || '') ? j.tanggal : null,
      jumlah: a > 0 ? a : null,
      keterangan: String(j.keterangan || '').slice(0, 80),
      jenis: j.jenis === 'in' ? 'in' : 'out'
    });
  } catch (e) { res.status(502).json({ error: e.message }); }
};
