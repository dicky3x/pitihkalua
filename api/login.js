const L = require('./_lib');
const C = 'HttpOnly; Secure; SameSite=Strict; Path=/';
module.exports = async (req, res) => {
  if (req.method === 'GET') { const ok = L.check(req); return res.status(ok ? 200 : 401).json({ ok }); }
  if (req.method === 'DELETE') { res.setHeader('Set-Cookie', `session=; ${C}; Max-Age=0`); return res.status(200).json({ ok: true }); }
  if (req.method !== 'POST') return res.status(405).end();
  const { u, p } = req.body || {};
  if (L.same(u || '', L.USER()) && L.same(p || '', L.PASS())) {
    res.setHeader('Set-Cookie', `session=${L.make(u)}; ${C}; Max-Age=604800`);
    return res.status(200).json({ ok: true });
  }
  await new Promise(r => setTimeout(r, 700));
  res.status(401).json({ error: 'salah' });
};
