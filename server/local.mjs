import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { handleRequest } from './worker.mjs';
const root = fileURLToPath(new URL('../site/', import.meta.url));
const port = Number(process.env.PORT || 8787);
const origin = `http://127.0.0.1:${port}`;
const env = { ...process.env, ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || `${origin},http://localhost:${port}` };
const counters = new Map();
env.RATE_LIMITER = { async limit({key}) {
  const now = Date.now(), old = counters.get(key);
  const row = old && now - old.start < 60000 ? old : { start: now, count: 0 };
  counters.set(key, row); return { success: ++row.count <= (process.env.LOCAL_TEST_MODE === '1' ? 1000 : 5) };
}};
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.csv': 'text/csv; charset=utf-8' };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, origin);
    if (url.pathname.startsWith('/api/')) {
      const parts = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 40000) { res.writeHead(413).end(); return; } parts.push(chunk); }
      const headers = new Headers(req.headers);
      headers.set('cf-connecting-ip', req.socket.remoteAddress || 'local');
      const request = new Request(url, { method: req.method, headers, ...(['GET','HEAD'].includes(req.method) ? {} : { body: Buffer.concat(parts) }) });
      const response = await handleRequest(request, env);
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer())); return;
    }
    const path = resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!path.startsWith(resolve(root) + sep)) { res.writeHead(403).end(); return; }
    const data = await readFile(path);
    res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data);
  } catch { res.writeHead(404).end('Not found'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Prompt Helper: ${origin} (Gemini key ${env.GEMINI_API_KEY ? 'configured' : 'not configured'})`));
