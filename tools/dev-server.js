// Local dev server emulating the Vercel routes (no deps).
const http = require('http'), fs = require('fs'), path = require('path');
const routes = {
  '/api/analyze': require('../api/analyze.js'),
  '/api/result': require('../api/result.js'),
  '/api/balance': require('../api/balance.js'),
};
http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const u = new URL(req.url, 'http://localhost');
  if (routes[u.pathname]) {
    req.query = Object.fromEntries(u.searchParams);
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
    try { await routes[u.pathname](req, res); } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: String(e) })); }
    return;
  }
  let p = path.join(__dirname, '..', 'public', u.pathname === '/' ? 'index.html' : u.pathname);
  if (!p.startsWith(path.join(__dirname, '..', 'public')) || !fs.existsSync(p)) { res.statusCode = 404; return res.end('not found'); }
  const ext = path.extname(p);
  res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[ext] || 'application/octet-stream');
  fs.createReadStream(p).pipe(res);
}).listen(3456, () => console.log('dev server on :3456'));
