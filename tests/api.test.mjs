import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest, validateInput, normalizeResult, callGemini } from '../server/worker.mjs';
const env = { GEMINI_API_KEY: 'test-key-not-real', GEMINI_MODEL: 'test-model', ALLOWED_ORIGINS: 'https://dmng0.github.io', ACCESS_TOKEN: 'test-password' };
const p = { prompt: '검은 머리 소녀', threshold: 0.6, nl_temperature: 0.4 };
const raw = { tags: [{ tag:'1girl', score:1, category:0 }, { tag:'black_hair', score:0.9, category:0 }, { tag:'black_hair', score:0.8, category:0 }, { tag:'made_up_tag', score:0.8, category:0 }, { tag:'smile', score:0.2, category:0 }], english_prompt: 'A girl with black hair.', ko_units: ['소녀','검은 머리'], keywords: ['girl','black hair'], characters: [], background_tags: [] };
const mockFetch = async (url, options) => {
  assert.match(url, /generativelanguage.googleapis.com\/v1beta\/models\/test-model:generateContent$/);
  assert.equal(options.headers['x-goog-api-key'], env.GEMINI_API_KEY);
  assert.ok(!url.includes(env.GEMINI_API_KEY));
  const body = JSON.parse(options.body);
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  return Response.json({ candidates: [{ finishReason:'STOP', content: { parts: [{ text: JSON.stringify(raw) }] } }] });
};
function request(path = '/api/generate', body = p, headers = {}) {
  return new Request('https://api.example' + path, { method:'POST', headers: { Origin:'https://dmng0.github.io', Authorization:'Bearer test-password', ...headers }, body: JSON.stringify(body) });
}
test('generation uses secret header and returns compatible NDJSON', async () => {
  const response = await handleRequest(request(), env, mockFetch);
  assert.equal(response.status, 200);
  const data = JSON.parse(await response.text()).data;
  assert.equal(data.final_prompt, '1girl, black_hair, made_up_tag');
  assert.deepEqual(data.unverified_tags, ['made_up_tag']);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://dmng0.github.io');
});
test('disallowed origin and wrong access token never call upstream', async () => {
  const never = () => { throw new Error('must not call'); };
  assert.equal((await handleRequest(request(undefined, p, {Origin:'https://evil.example'}), env, never)).status,403);
  assert.equal((await handleRequest(request(undefined, p, {Authorization:'Bearer wrong'}), env, never)).status,401);
});
test('preflight succeeds without an access token', async () => {
  const r = await handleRequest(new Request('https://api.example/api/generate', {method:'OPTIONS', headers:{Origin:'https://dmng0.github.io'}}),env);
  assert.equal(r.status,204); assert.match(r.headers.get('Access-Control-Allow-Headers'),/Authorization/);
});
test('input limits, numbers, categories and JSON are validated', async () => {
  for (const bad of [{prompt:''}, {prompt:'a'.repeat(6001)}, {prompt:'x',threshold:-1}, {prompt:'x',search_categories:[7]}, {prompt:'x',kw_temperature:99}]) assert.equal((await handleRequest(request(undefined,bad),env)).status,400);
  assert.equal((await handleRequest(request(undefined,{prompt:'a'.repeat(50000)}),env)).status,413);
});
test('split mode preserves user identities and individual tags', () => {
  const input = validateInput('/api/generate_split', {characters:[{name:'My Hero',desc:'검은 머리',is_passthrough:true}],background:'숲'});
  const result = normalizeResult({...raw, characters:[{index:1,tags:['black_hair','nonexistent']}],background_tags:['forest']}, input, '/api/generate_split');
  assert.equal(result.characters[0].name,'My Hero'); assert.equal(result.characters[0].is_passthrough,true); assert.deepEqual(result.characters[0].tags,['black_hair']);
});
test('direct search uses explicit model estimated score and category filtering', async () => {
  const r = await handleRequest(request('/api/direct_search',{query:'머리',threshold:0.85,top_k:1,categories:[0]}),env,mockFetch);
  const data = await r.json(); assert.equal(data.score_kind,'model_estimated_relevance'); assert.equal(data.results.length,1);
});
test('quota and upstream errors are actionable and do not leak upstream data', async () => {
  const r = await handleRequest(request(),env,async()=>new Response('secret upstream details',{status:429}));
  assert.equal(r.status,429); assert.ok(!(await r.text()).includes('secret'));
  assert.equal((await handleRequest(request(),{...env,GEMINI_API_KEY:''})).status,503);
  assert.equal((await handleRequest(request(),{...env,RATE_LIMITER:{limit:async()=>({success:false})}})).status,429);
});
test('blocked, incomplete and invalid model responses fail cleanly', async () => {
  for (const response of [{promptFeedback:{blockReason:'SAFETY'}}, {candidates:[{finishReason:'MAX_TOKENS'}]}, {candidates:[{finishReason:'STOP',content:{parts:[{text:'not json'}]}}]}]) {
    await assert.rejects(()=>callGemini(validateInput('/api/generate',p),'/api/generate',env,async()=>Response.json(response)));
  }
});
