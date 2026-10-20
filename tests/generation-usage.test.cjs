const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
const root = path.resolve(__dirname, '..'), req = Module.createRequire(path.join(root, 'package.json'));
const ts = req('typescript'), cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const mod = new Module(path.join(root, file), module);
  mod.filename = path.join(root, file);
  mod.require = name => name === '@upstash/redis' ? { Redis: class { async get() { return null; } } } :
    name.startsWith('@/') ? load(name.slice(2) + '.ts') : name.startsWith('./') ? load(path.join(path.dirname(file), name) + '.ts') : req(name);
  mod._compile(ts.transpileModule(fs.readFileSync(mod.filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, mod.filename);
  cache.set(file, mod.exports);
  return mod.exports;
}
const { measureUsage, createGenerationUsage } = load('lib/generationUsage.ts');
const { formatMarkdownReport } = load('lib/markdownReport.ts');
const model = 'gpt-5.6-terra';
const usage = (input = 10000, output = 1000, cached = 2000, written = 3000, reasoning = 400) => ({
  prompt_tokens: input, completion_tokens: output, total_tokens: input + output,
  prompt_tokens_details: { cached_tokens: cached, cache_write_tokens: written },
  completion_tokens_details: { reasoning_tokens: reasoning },
});
const envelope = (content, tokenUsage = usage(), finishReason = 'stop') => ({
  id: 'test-response', model, usage: tokenUsage,
  choices: [{ finish_reason: finishReason, message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }],
});
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

test('input, cache reads, writes and output are priced once; reasoning stays inside output', () => {
  const result = measureUsage(envelope({}), model);
  assert.equal(result.totalTokens, 11000);
  assert.equal(result.reasoningTokens, 400);
  close(result.estimatedCostUsd, 0.0299);
  assert.deepEqual(result.ratesPerMillion, { input: 2, cachedInput: 0.2, cacheWrite: 2.5, output: 12 });
});

for (const input of [272000, 272001]) test('context pricing threshold at ' + input + ' input tokens', () => {
  const result = measureUsage(envelope({}, usage(input, 1000, 1000, 2000, 100)), model);
  const rates = input > 272000 ? [4, 0.4, 5, 18] : [2, 0.2, 2.5, 12];
  close(result.estimatedCostUsd, ((input - 3000) * rates[0] + 1000 * rates[1] + 2000 * rates[2] + 1000 * rates[3]) / 1e6);
});

test('same-day recorded compatibility calls total 950 tokens and USD 0.00231', () => {
  // Use frozen provider counters, not a new paid request.
  const counters = [usage(872, 30, 0, 0, 0), usage(37, 11, 0, 0, 0)];
  const measured = counters.map(record => measureUsage({ model, usage: record }, model));
  assert.equal(measured.reduce((sum, stage) => sum + stage.totalTokens, 0), 950);
  close(measured.reduce((sum, stage) => sum + stage.estimatedCostUsd, 0), 0.00231);
});

for (const [label, response] of [
  ['missing usage', { model }],
  ['missing cache breakdown', envelope({}, { prompt_tokens: 100, completion_tokens: 5, total_tokens: 105 })],
  ['negative input', envelope({}, usage(-1, 5, 0, 0, 0))],
  ['cache overlaps beyond input', envelope({}, usage(100, 5, 80, 30, 0))],
  ['reasoning exceeds output', envelope({}, usage(100, 5, 0, 0, 6))],
  ['inconsistent total', envelope({}, { ...usage(), total_tokens: 5 })],
  ['unpriced model', { ...envelope({}), model: 'unknown-model' }],
]) test(label + ' keeps cost unknown', () => {
  const result = measureUsage(response, model);
  assert.equal(result.estimatedCostUsd, null);
  assert.ok(result.note);
});

test('usage tracker preserves response bodies and prices context per call rather than run total', async () => {
  const tracker = createGenerationUsage(model, 'low');
  for (const stage of ['classification', 'strategy']) {
    const response = await tracker.capture(stage, async () => Response.json(envelope({ intact: true }, usage(200000, 1000, 0, 0, 0))));
    assert.equal((await response.json()).choices[0].message.content, '{"intact":true}');
  }
  const result = tracker.report('completed');
  assert.equal(result.totals.inputTokens, 400000);
  assert.equal(result.totals.totalTokens, 402000);
  close(result.totals.estimatedCostUsd, 0.824);
  assert.ok(result.stages.every(stage => stage.ratesPerMillion.input === 2));
  assert.notEqual(result.runId, createGenerationUsage(model, 'low').report('completed').runId);
});

test('network failure retains prior usage and distinguishes known subtotal from unknown full cost', async () => {
  const tracker = createGenerationUsage(model, 'low');
  await tracker.capture('classification', async () => Response.json(envelope({})));
  await assert.rejects(tracker.capture('strategy', async () => { throw Error('network failed'); }));
  const result = tracker.report('failed');
  assert.equal(result.status, 'failed');
  assert.equal(result.stages.length, 2);
  assert.equal(result.totals.complete, false);
  assert.equal(result.totals.estimatedCostUsd, null);
  assert.equal(result.totals.inputTokens, null);
  assert.equal(result.stages[1].inputTokens, null);
  close(result.totals.knownCostUsd, 0.0299);
});

test('no attempted API calls have zero cost', () => {
  const result = createGenerationUsage(model, 'low').report('failed');
  assert.equal(result.stages.length, 0);
  assert.equal(result.totals.estimatedCostUsd, 0);
  assert.equal(result.totals.totalTokens, 0);
});

const classification = envelope({ classifications: { kw_0001: 'current_page' } });
const strategy = envelope({ primary_keyword: { keyword_id: 'kw_0001', keyword: 'protect pdf', validated: true }, usage: { forged: true } });
async function runRoute(responses) {
  const previousFetch = global.fetch, previousKey = process.env.OPENAI_API_KEY;
  const previousInfo = console.info, previousError = console.error;
  let calls = 0;
  const logs = [];
  global.fetch = async () => {
    const response = responses[calls++];
    if (response instanceof Error) throw response;
    assert.ok(response, 'Unexpected extra provider call');
    return response;
  };
  console.info = (...args) => logs.push(args);
  console.error = () => {};
  process.env.OPENAI_API_KEY = 'offline-test-key-never-log';
  try {
    const form = new FormData();
    form.set('pageType', 'Online Tool Page'); form.set('primaryKeyword', 'protect pdf');
    form.set('b_role', 'broad_match'); form.set('b_paste', 'protect pdf\t590\t48');
    const { NextRequest } = req('next/server');
    const response = await load('app/api/generate/route.ts').POST(new NextRequest('http://localhost/api/generate', { method: 'POST', body: form }));
    return { status: response.status, body: await response.json(), calls, logs };
  } finally {
    global.fetch = previousFetch; console.info = previousInfo; console.error = previousError;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
}

test('successful route returns both stages, logs metadata only, and exports the same usage', async () => {
  const result = await runRoute([Response.json(classification), Response.json(strategy)]);
  assert.equal(result.status, 200);
  assert.equal(result.calls, 2);
  assert.deepEqual(result.body.result.usage, result.body.usage);
  assert.equal(result.body.usage.totals.totalTokens, 22000);
  close(result.body.usage.totals.estimatedCostUsd, 0.0598);
  const logged = result.logs.find(log => log[0] === 'Keyword analysis usage:');
  assert.deepEqual(JSON.parse(logged[1]), result.body.usage);
  assert.equal(logged[1].includes('protect pdf'), false);
  assert.equal(logged[1].includes('offline-test-key'), false);
  const markdown = formatMarkdownReport(result.body.result, result.body.stats);
  assert.match(markdown, /Token Usage and Estimated Cost/);
  assert.match(markdown, /\$0\.059800/);
  assert.match(markdown, /Cached Input/);
  assert.match(markdown, /Reasoning is included in output/);
  assert.match(markdown, new RegExp(result.body.usage.runId));
});

test('classification truncation retains its paid usage without calling strategy', async () => {
  const result = await runRoute([Response.json(envelope('{incomplete', usage(), 'length'))]);
  assert.equal(result.status, 502);
  assert.equal(result.calls, 1);
  assert.equal(result.body.usage.status, 'failed');
  close(result.body.usage.totals.estimatedCostUsd, 0.0299);
});

test('strategy invalid JSON retains usage from both calls', async () => {
  const result = await runRoute([Response.json(classification), Response.json(envelope('{invalid'))]);
  assert.equal(result.status, 500);
  assert.equal(result.calls, 2);
  assert.equal(result.body.usage.status, 'failed');
  assert.equal(result.body.usage.stages.length, 2);
  close(result.body.usage.totals.estimatedCostUsd, 0.0598);
});

for (const [label, failure] of [
  ['network failure', Error('network failed')],
  ['provider HTTP error', Response.json({ error: 'rate limit' }, { status: 429 })],
  ['unreadable provider envelope', new Response('{invalid')],
]) test(label + ' preserves classification usage with an unknown final total', async () => {
  const result = await runRoute([Response.json(classification), failure]);
  assert.equal(result.status, 500);
  assert.equal(result.calls, 2);
  assert.equal(result.body.usage.totals.estimatedCostUsd, null);
  assert.equal(result.body.usage.totals.complete, false);
  close(result.body.usage.totals.knownCostUsd, 0.0299);
});
