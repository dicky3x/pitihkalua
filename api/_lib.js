const crypto = require('crypto');
const secret = () => process.env.SESSION_SECRET || ('k-' + (process.env.AUTH_PASS || 'kyno') + (process.env.GROQ_API_KEY || ''));
const sign = p => crypto.createHmac('sha256', secret()).update(p).digest('base64url');
const h = s => crypto.createHash('sha256').update(String(s)).digest();
exports.USER = () => process.env.AUTH_USER || 'kyna';
exports.PASS = () => process.env.AUTH_PASS || 'kyno';
exports.same = (a, b) => crypto.timingSafeEqual(h(a), h(b));
exports.make = u => { const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 7 * 864e5 })).toString('base64url'); return p + '.' + sign(p); };
exports.check = req => {
  const m = (req.headers.cookie || '').match(/(?:^|;\s*)session=([^;]+)/);
  if (!m) return false;
  const [p, s] = m[1].split('.');
  if (!p || !s) return false;
  const a = Buffer.from(sign(p)), b = Buffer.from(s);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try { return JSON.parse(Buffer.from(p, 'base64url')).exp > Date.now(); } catch (e) { return false; }
};
exports.groq = async body => {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.GROQ_API_KEY },
    body: JSON.stringify(body)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j.error && j.error.message) || ('Groq ' + r.status));
  return String(j.choices[0].message.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
};
exports.guard = (req, res) => {
  if (req.method !== 'POST') { res.status(405).end(); return false; }
  if (!exports.check(req)) { res.status(401).json({ error: 'Belum login' }); return false; }
  return true;
};
