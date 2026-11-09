// Local development server: same API handler + static files + the same rewrites as vercel.json.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { handle } from './lib/api.js';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };
export function createServer() {
  return http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x'); let p = u.pathname;
    if (p.startsWith('/api/')) {
      const chunks = []; for await (const c of req) chunks.push(c);
      let body = {}; try { const t = Buffer.concat(chunks).toString(); if (t) body = JSON.parse(t); } catch {}
      const r = await handle({ method: req.method, url: req.url, headers: req.headers, body, ip: req.socket.remoteAddress });
      res.writeHead(r.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...r.headers }); return res.end(r.raw !== undefined ? r.raw : JSON.stringify(r.body));
    }
    if (/^\/o\//.test(p)) p = '/o/index.html'; else if (/^\/m\/[^/]+/.test(p)) p = '/m/index.html'; else if (/^\/t\/[^/]+/.test(p)) p = '/t/index.html';
    let f = path.join('public', p); if (f.endsWith('/') || (fs.existsSync(f) && fs.statSync(f).isDirectory())) f = path.join(f, 'index.html');
    if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f += '.html';
    if (!f.startsWith('public') || !fs.existsSync(f)) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(f).pipe(res);
  });
}
if (process.argv[1] && process.argv[1].endsWith('dev-server.js')) createServer().listen(3000, () => console.log('http://localhost:3000'));
