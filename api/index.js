import { handle } from '../lib/api.js';
export default async function (req, res) {
  const chunks = []; for await (const c of req) chunks.push(c);
  let body = {}; try { const t = Buffer.concat(chunks).toString('utf8'); if (t) body = JSON.parse(t); } catch { res.statusCode = 400; res.end('{"error":"Bad JSON"}'); return; }
  const u = new URL(req.url, 'http://x'); const p = u.searchParams.get('__p');
  if (p) { u.searchParams.delete('__p'); const q = u.searchParams.toString(); req.url = p + (q ? '?' + q : ''); }
  const r = await handle({ method: req.method, url: req.url, headers: req.headers, body, ip: (req.headers['x-forwarded-for'] || '').split(',')[0] || 'x' });
  res.statusCode = r.status; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(r.headers)) res.setHeader(k, v);
  res.end(r.raw !== undefined ? r.raw : JSON.stringify(r.body));
}
