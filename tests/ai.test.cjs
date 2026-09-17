const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');
const Module = require('node:module');

// Compile the real TS modules, without a new runner dependency or live API keys.
const buildDir = mkdtempSync(join(tmpdir(), 'engageflow-ai-tests-'));
after(() => rmSync(buildDir, { recursive: true, force: true }));
execFileSync(process.execPath, [
  require.resolve('typescript/bin/tsc'), 'src/lib/ai/index.ts',
  '--outDir', buildDir, '--module', 'commonjs', '--target', 'es2022',
  '--lib', 'es2022,dom', '--strict', '--skipLibCheck',
], { cwd: join(__dirname, '..'), stdio: 'pipe' });

const ai = require(join(buildDir, 'index.js'));
const { parseCommentsJson, candidateCount, validatePartialComments } = require(join(buildDir, 'prompt.js'));
const { readRateLimit, outputTokenLimit } = require(join(buildDir, 'limits.js'));
const { resolveGroqModel } = require(join(buildDir, 'groq.js'));
const { openrouter } = require(join(buildDir, 'openrouter.js'));
const args = { url: 'https://example.com/post', kategori: 'tas', count: 4 };
const texts = [
  'Kantong sampingnya bisa muat botol ukuran berapa?',
  'Warna cokelatnya cocok dipadukan sama baju netral.',
  'Kalau kena hujan ringan bahannya gampang dibersihkan?',
  'Tali lebarnya kelihatan nyaman buat dibawa jalan.',
];
const comments = texts.map(isi => ({ isi, tone: 'santai' }));
const cred = provider => ({ id: provider, provider, apiKey: 'test-only', model: 'test', priority: 10, enabled: true });
function output(items, request) {
  return parseCommentsJson(JSON.stringify({ comments: items }), request);
}
function mockProvider(t, provider, generate) {
  const original = ai.PROVIDERS[provider].generate;
  ai.PROVIDERS[provider].generate = generate;
  t.after(() => { ai.PROVIDERS[provider].generate = original; });
}

// Exercise credential query logic against an isolated Supabase test double.
// This deliberately does not read .env or connect to the user's database.
function credentialFixture({ authenticated = true, rows = [] } = {}) {
  const queries = [];
  const patches = [];
  const supabase = {
    auth: { getUser: async () => ({ data: { user: authenticated ? { id: 'test-user' } : null } }) },
    from(table) {
      queries.push(['from', table]);
      const builder = {
        select(fields) { queries.push(['select', fields]); return builder; },
        eq(field, value) { queries.push(['eq', field, value]); return builder; },
        order(field, options) { queries.push(['order', field, options]); return Promise.resolve({ data: rows, error: null }); },
        maybeSingle: async () => ({ data: { success_count: 2, failure_count: 1, consecutive_errors: 0 }, error: null }),
        update(patch) { patches.push(patch); return builder; },
        then(resolve, reject) { return Promise.resolve({ error: null }).then(resolve, reject); },
      };
      return builder;
    },
  };
  const ts = require('typescript');
  const filename = join(__dirname, '../src/lib/ai-creds.ts');
  const source = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const subject = new Module(filename, module);
  subject.require = specifier => {
    if (specifier === '@/lib/supabase/server') return { createClient: () => supabase };
    if (specifier === '@/lib/encryption') return { decrypt: () => 'test-only' };
    if (specifier === '@/lib/ai') return ai;
    if (specifier === '@/lib/ai/groq') return { resolveGroqModel };
    throw new Error(`Unexpected test dependency: ${specifier}`);
  };
  subject._compile(source, filename);
  return { subject: subject.exports, queries, patches };
}

test('credential loading scopes queries to current user and normalizes old model', async () => {
  const fixture = credentialFixture({ rows: [{
    id: 'test-cred', provider: 'groq', model: 'qwen/qwen3.6-27b',
    api_key_encrypted: 'test-only', enabled: true, priority: 10,
  }] });
  const result = await fixture.subject.loadAiCreds();
  assert.equal(result.creds[0].model, 'openai/gpt-oss-20b');
  assert.ok(fixture.queries.some(query => query[0] === 'eq' && query[1] === 'user_id' && query[2] === 'test-user'));
});

test('quality rejection does not execute any credential cooldown update', async () => {
  const fixture = credentialFixture();
  await fixture.subject.markCredentialFailure('test-cred', {
    provider: 'groq', reason: 'Not enough diverse comments', rateLimited: false,
    retryAfterSec: 0, scope: 'unknown', kind: 'quality',
  });
  assert.deepEqual(fixture.queries, []);
  assert.deepEqual(fixture.patches, []);
});

test('successful credential query resets cooldown and stores replacement model', async () => {
  const fixture = credentialFixture();
  await fixture.subject.markCredentialUsed('test-cred', 'openai/gpt-oss-20b');
  assert.equal(fixture.patches[0].model, 'openai/gpt-oss-20b');
  assert.equal(fixture.patches[0].cooldown_until, null);
  assert.equal(fixture.patches[0].success_count, 3);
});

test('credential loading without authentication never queries user data', async () => {
  const fixture = credentialFixture({ authenticated: false });
  const result = await fixture.subject.loadAiCreds();
  assert.equal(result.status, 401);
  assert.deepEqual(fixture.queries, []);
});

test('quality gate retains good comments and rejects duplicates / foreign scripts', () => {
  assert.throws(() => output([
    ...comments.slice(0, 3), comments[0],
    { isi: 'Tas ini kelihatan bagus 救赎 banget.', tone: 'reaksi' },
  ], args), error => {
    assert.ok(error instanceof ai.CommentQualityError);
    assert.deepEqual(error.acceptedComments, comments.slice(0, 3));
    return true;
  });
});

test('only missing comment is requested on a bounded quality repair', async t => {
  const counts = [];
  mockProvider(t, 'groq', async request => {
    counts.push(request.count);
    if (counts.length === 1) return output(comments.slice(0, 3), request);
    assert.deepEqual(request.previousComments, texts.slice(0, 3));
    return output(comments.slice(3), request);
  });
  const result = await ai.generateWithRotation([cred('groq')], args);
  assert.deepEqual(counts, [4, 1]);
  assert.deepEqual(result.comments, comments);
  assert.deepEqual(result.usedProviders, ['groq']);
  assert.equal(result.failedProviders[0].kind, 'quality');
  assert.equal(result.failedProviders[0].retryAfterSec, 0);
});

test('repair occurs at most once; final error exposes retained comments', async t => {
  let calls = 0;
  mockProvider(t, 'groq', async request => {
    calls++;
    return output([comments[calls - 1]], request);
  });
  await assert.rejects(ai.generateWithRotation([cred('groq')], args), error => {
    assert.ok(error instanceof ai.AllProvidersFailedError);
    assert.deepEqual(error.partialComments, comments.slice(0, 2));
    return true;
  });
  assert.equal(calls, 2);
});

test('fallback receives only remaining count and avoids retained comments', async t => {
  let groqCalls = 0;
  mockProvider(t, 'groq', async request => {
    groqCalls++;
    if (groqCalls === 1) return output(comments.slice(0, 3), request);
    throw new ai.ProviderRateLimitError('groq', 60, 'minute');
  });
  mockProvider(t, 'openrouter', async request => {
    assert.equal(request.count, 1);
    assert.deepEqual(request.previousComments, texts.slice(0, 3));
    return output(comments.slice(3), request);
  });
  const result = await ai.generateWithRotation([cred('groq'), cred('openrouter')], args);
  assert.deepEqual(result.comments, comments);
  assert.deepEqual(result.usedProviders, ['groq', 'openrouter']);
  assert.ok(result.failedProviders.some(f => f.rateLimited));
});

test('HTTP retry can resume previous quality-checked partial results', async t => {
  mockProvider(t, 'groq', async request => {
    assert.equal(request.count, 1);
    return output(comments.slice(3), request);
  });
  const result = await ai.generateWithRotation([cred('groq')], {
    ...args, partialComments: comments.slice(0, 3),
  });
  assert.deepEqual(result.comments, comments);
});

test('untrusted retry comments cannot bypass language or duplicate validation', () => {
  const result = validatePartialComments([
    comments[0], comments[0],
    { isi: 'This product looks really nice and good.', tone: 'reaksi' },
    comments[1],
  ], args);
  assert.deepEqual(result, comments.slice(0, 2));
  assert.deepEqual(validatePartialComments(null, args), []);
  assert.deepEqual(validatePartialComments([comments[0]], { ...args, previousComments: [texts[0]] }), []);
});

test('300 comments at four per post need 75 initial calls when quality passes', async t => {
  let calls = 0;
  mockProvider(t, 'groq', async request => {
    calls++;
    assert.equal(request.count, 4);
    const number = request.url.split('/').at(-1);
    return output([
      { isi: `Model nomor ${number} cocok buat kegiatan sehari hari.`, tone: 'santai' },
      { isi: `Warna pilihan ${number} terlihat menarik dipadukan dengan baju netral.`, tone: 'reaksi' },
      { isi: `Ukuran tipe ${number} muat botol kecil atau besar?`, tone: 'pertanyaan' },
      { isi: `Bahan seri ${number} bisa dibersihkan dengan lap basah?`, tone: 'pertanyaan' },
    ], request);
  });
  let generated = 0;
  const history = [];
  for (let index = 0; index < 75; index++) {
    const result = await ai.generateWithRotation([cred('groq')], {
      ...args, url: `https://example.com/post/${index}`,
      previousComments: history.slice(-24),
    });
    generated += result.comments.length;
    history.push(...result.comments.map(comment => comment.isi));
  }
  assert.equal(generated, 300);
  assert.equal(calls, 75);
});

test('complete partial result does not call an API again', async t => {
  mockProvider(t, 'groq', async () => { assert.fail('unexpected API call'); });
  const result = await ai.generateWithRotation([cred('groq')], { ...args, partialComments: comments });
  assert.deepEqual(result.comments, comments);
  assert.deepEqual(result.usedProviders, []);
});

test('API quota failure skips directly to fallback without same-provider retry', async t => {
  let calls = 0;
  mockProvider(t, 'gemini', async () => {
    calls++;
    throw new ai.ProviderRateLimitError('gemini', 86400, 'daily');
  });
  mockProvider(t, 'openrouter', async request => output(comments, request));
  const result = await ai.generateWithRotation([cred('gemini'), cred('openrouter')], args);
  assert.equal(calls, 1);
  assert.equal(result.failedProviders[0].scope, 'daily');
});

test('PerDay quota metadata takes precedence over a 57-second Gemini retry', () => {
  const result = readRateLimit(new Response('', { status: 429 }), {
    error: {
      message: 'Quota exceeded, limit: 20',
      details: [
        { violations: [{ quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_requests', quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] },
        { retryDelay: '57s' },
      ],
    },
  });
  assert.equal(result.scope, 'daily');
  assert.ok(result.retryAfterSec >= 57);
});

test('minute quota respects retry-after without being called a daily quota', () => {
  const result = readRateLimit(new Response('', { status: 429, headers: { 'retry-after': '57' } }), {
    error: { message: 'Requests per minute exceeded' },
  });
  assert.deepEqual(result, { retryAfterSec: 57, scope: 'minute' });
});

test('Groq exhausted daily request header uses reset duration', () => {
  const result = readRateLimit(new Response('', { status: 429, headers: {
    'retry-after': '2', 'x-ratelimit-remaining-requests': '0',
    'x-ratelimit-reset-requests': '2h',
  } }), { error: { message: 'Rate limit reached' } });
  assert.deepEqual(result, { retryAfterSec: 7200, scope: 'daily' });
});

test('obsolete Groq model resolves to current default, custom model stays unchanged', () => {
  assert.equal(resolveGroqModel('qwen/qwen3.6-27b'), 'openai/gpt-oss-20b');
  assert.equal(resolveGroqModel('openai/gpt-oss-120b'), 'openai/gpt-oss-120b');
});

test('OpenRouter request has no unsupported strict schema restriction', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'openrouter/free');
    assert.equal(body.response_format, undefined);
    assert.equal(body.provider, undefined);
    assert.ok(body.messages[1].content.includes(`tepat ${candidateCount(4)} kandidat`));
    return Response.json({ choices: [{ message: { content: JSON.stringify({ comments }) } }] });
  };
  assert.deepEqual(await openrouter.generate(args, 'test-only', 'openrouter/free'), comments);
});

test('OpenRouter output still goes through language quality checks', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async () => Response.json({ choices: [{ message: {
    content: JSON.stringify({ comments: [{ isi: 'This product looks really nice and good.', tone: 'reaksi' }] }),
  } }] });
  await assert.rejects(openrouter.generate({ ...args, count: 1 }, 'test-only', 'openrouter/free'), ai.CommentQualityError);
});

test('token budget includes extra candidates while remaining bounded', () => {
  assert.ok(outputTokenLimit(4) >= 256 + candidateCount(4) * 128);
  assert.ok(outputTokenLimit(30) <= 4096);
});

test('aborted request does not spend quota on another fallback', async t => {
  mockProvider(t, 'groq', async () => assert.fail('unexpected API call'));
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(ai.generateWithRotation([cred('groq')], { ...args, signal: controller.signal }), ai.AllProvidersFailedError);
});
