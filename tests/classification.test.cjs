const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
const root = path.resolve(__dirname, '..'), req = Module.createRequire(path.join(root, 'package.json'));
const ts = req('typescript'), cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const mod = new Module(path.join(root, file), module);
  mod.filename = path.join(root, file);
  mod.require = name => name === '@upstash/redis' ? { Redis: class { async get() { return null; } } } :
    name.startsWith('@/') ? load(name.slice(2) + '.ts') : req(name);
  mod._compile(ts.transpileModule(fs.readFileSync(mod.filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, mod.filename);
  cache.set(file, mod.exports);
  return mod.exports;
}
const { readClassification, classificationTokenBudget, classificationResponseFormat } = load('lib/classification.ts');
const ids = new Set(['kw_0001', 'kw_0002']);
const pools = { current_page_ids: ['kw_0001'], new_page_ids: [], out_of_brand_ids: ['kw_0002'] };
const envelope = (value, finish_reason = 'stop', extra = {}) => ({
  choices: [{ finish_reason, message: { content: typeof value === 'string' ? value : JSON.stringify(value), ...extra } }],
});

test('budget grows with admitted rows, including the 1500-row broad/gap union', () => {
  assert.equal(classificationTokenBudget(1), 5000);
  assert.equal(classificationTokenBudget(500), 11024);
  assert.equal(classificationTokenBudget(1500), 31024);
  assert.equal(classificationTokenBudget(10000), 32768);
  assert.equal(classificationResponseFormat.type, 'json_schema');
  assert.equal(classificationResponseFormat.json_schema.strict, true);
  assert.deepEqual(classificationResponseFormat.json_schema.schema.required, Object.keys(pools));
  assert.equal(classificationResponseFormat.json_schema.schema.additionalProperties, false);
});

test('valid classifications preserve current/future overlap and deduplicate within pools', () => {
  const value = { ...pools, current_page_ids: ['kw_0001', 'kw_0001'], new_page_ids: ['kw_0001'] };
  assert.deepEqual(readClassification(envelope(value), ids), { ok: true, classification: { ...pools, new_page_ids: ['kw_0001'] } });
});

for (const [label, response, code] of [
  ['truncated JSON', envelope('{"current_page_ids":["kw_0001",', 'length'), 'classification_truncated'],
  ['parseable but truncated output', envelope(pools, 'length'), 'classification_truncated'],
  ['refusal', envelope(null, 'stop', { refusal: 'Declined' }), 'classification_refused'],
  ['content filter', envelope(pools, 'content_filter'), 'classification_incomplete'],
  ['missing choice', {}, 'classification_incomplete'],
  ['malformed JSON', envelope('{broken}'), 'classification_invalid_json'],
  ['missing pool', envelope({ current_page_ids: ['kw_0001', 'kw_0002'] }), 'classification_invalid_schema'],
  ['wrong array element', envelope({ ...pools, new_page_ids: [12] }), 'classification_invalid_schema'],
  ['extra property', envelope({ ...pools, explanation: 'text' }), 'classification_invalid_schema'],
  ['unknown IDs', envelope({ ...pools, new_page_ids: ['kw_9999'] }), 'classification_unknown_ids'],
  ['omitted IDs', envelope({ ...pools, out_of_brand_ids: [] }), 'classification_missing_ids'],
  ['all empty pools', envelope({ current_page_ids: [], new_page_ids: [], out_of_brand_ids: [] }), 'classification_missing_ids'],
  ['conflicting decisions', envelope({ ...pools, new_page_ids: ['kw_0002'] }), 'classification_conflicting_ids'],
]) test('rejects ' + label + ' with a specific reason', () => {
  const result = readClassification(response, ids);
  assert.equal(result.ok, false);
  assert.equal(result.code, code);
});

test('all keywords may legitimately be out of brand', () => {
  assert.equal(readClassification(envelope({ current_page_ids: [], new_page_ids: [], out_of_brand_ids: [...ids] }), ids).ok, true);
});

async function withMockProvider(provider, action) {
  const previousFetch = global.fetch, previousKey = process.env.OPENAI_API_KEY;
  global.fetch = provider;
  process.env.OPENAI_API_KEY = 'offline-mock-not-a-key';
  try { await action(); } finally {
    global.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
}
function request(broadCount, gapCount = 0) {
  const form = new FormData(), { NextRequest } = req('next/server');
  form.set('pageType', 'Online Tool Page'); form.set('primaryKeyword', 'chat pdf');
  form.set('b_role', 'broad_match');
  form.set('b_paste', Array.from({ length: broadCount }, (_, i) => `chat pdf broad ${i}\t100\t20`).join('\n'));
  if (gapCount) {
    form.set('g_role', 'current_page_gap');
    form.set('g_paste', Array.from({ length: gapCount }, (_, i) => `chat pdf gap ${i}\t100\t20`).join('\n'));
  }
  return new NextRequest('http://localhost/api/generate', { method: 'POST', body: form });
}

test('route stops before strategy and logs metadata when classification hits its limit', async () => {
  let calls = 0, logged;
  const previousError = console.error;
  console.error = (...args) => { logged = args; };
  try {
    await withMockProvider(async () => {
      calls++;
      return Response.json({ ...envelope('{"current_page_ids":["kw_0001",', 'length'), id: 'test-response', usage: { completion_tokens: 5000 } });
    }, async () => {
      const response = await load('app/api/generate/route.ts').POST(request(2));
      assert.equal(response.status, 502);
      assert.equal((await response.json()).code, 'classification_truncated');
      assert.equal(calls, 1);
      assert.equal(logged[1].finishReason, 'length');
      assert.equal(logged[1].admittedCount, 2);
      assert.equal(logged[1].responseId, 'test-response');
      assert.equal(logged[1].usage.completion_tokens, 5000);
      assert.equal(JSON.stringify(logged).includes('kw_0001'), false);
    });
  } finally { console.error = previousError; }
});

test('route admits 500 broad + 500 gap rows with a scaled budget and retains both stages', async () => {
  let calls = 0;
  await withMockProvider(async (url, options) => {
    const payload = JSON.parse(options.body);
    calls++;
    if (calls === 1) {
      assert.equal(payload.max_tokens, 21024);
      assert.equal(payload.response_format.json_schema.strict, true);
      const suppliedIds = payload.messages[1].content.split('\n').filter(line => /^kw_/.test(line)).map(line => line.split('\t')[0]);
      assert.equal(suppliedIds.length, 1000);
      return Response.json(envelope({ current_page_ids: suppliedIds, new_page_ids: [], out_of_brand_ids: [] }));
    }
    assert.equal(payload.response_format.type, 'json_object');
    return Response.json(envelope({ primary_keyword: null }));
  }, async () => {
    const response = await load('app/api/generate/route.ts').POST(request(500, 500));
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(calls, 2);
    assert.equal(data.stats.sentToAI, 1000);
    assert.equal(data.result.data_audit.keyword_classification.current_page_ids.length, 1000);
  });
});
