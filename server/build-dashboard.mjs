// Build one pasteable module for Cloudflare's browser editor (no npm install required).
import { readFile, writeFile } from 'node:fs/promises';
const catalog = JSON.parse(await readFile(new URL('./catalog.json', import.meta.url), 'utf8'));
let source = await readFile(new URL('./worker.mjs', import.meta.url), 'utf8');
source = source.replace("import catalog from './catalog.json' with { type: 'json' };", `const catalog = ${JSON.stringify(catalog)};`);
source = source.replace('export default { fetch: (request, env) => handleRequest(request, env) };', `
// Dashboard-only fallback. Per-isolate, best effort; not a global Gemini quota cap.
const visits = new Map();
const dashboardLimiter = { async limit({key}) {
  const now = Date.now();
  if (visits.size > 10000) for (const [k,v] of visits) if (now-v.start >= 60000) visits.delete(k);
  const prev = visits.get(key);
  const row = prev && now-prev.start < 60000 ? prev : {start:now,count:0};
  if (visits.size >= 10000 && !visits.has(key)) return {success:false};
  visits.set(key,row); return {success:++row.count <= 5};
}};
export default { fetch: (request, env) => handleRequest(request, { ...env, RATE_LIMITER: env.RATE_LIMITER || dashboardLimiter }) };
`);
await writeFile(new URL('./dashboard-worker.js', import.meta.url), source);
console.log('Created server/dashboard-worker.js');
