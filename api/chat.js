const L = require('./_lib');
module.exports = async (req, res) => {
  if (!L.guard(req, res)) return;
  if (!process.env.GROQ_API_KEY) return res.status(500).json({ error: 'GROQ_API_KEY belum diatur di Vercel' });
  const { messages = [], context = '' } = req.body || {};
  const msgs = messages.slice(-10)
    .filter(m => m && ['user', 'assistant'].includes(m.role))
    .map(m => ({ role: m.role, content: String(m.content).slice(0, 2000) }));
  const system = 'Kamu asisten keuangan pribadi di dashboard "Pitih Kalua". Jawab dalam bahasa Indonesia, ringkas dan jelas, hanya berdasarkan data di bawah. Jika data tidak cukup, katakan terus terang dan jangan mengarang angka. Tulis rupiah seperti Rp1.234.567. Transfer antar rekening bukan pemasukan maupun pengeluaran.\n\n' + String(context).slice(0, 14000);
  try {
    const reply = await L.groq({ model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b', messages: [{ role: 'system', content: system }, ...msgs], temperature: 0.3, max_tokens: 1200 });
    res.status(200).json({ reply });
  } catch (e) { res.status(502).json({ error: e.message }); }
};
