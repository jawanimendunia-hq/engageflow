const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const filename = join(__dirname, '../src/lib/import-retry.ts');
const subject = new Module(filename, module);
subject._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const retry = subject.exports;
const ad = {
  ad_id: 'ad-1', ad_name: 'NAS-20LG-SEP', post_url: 'https://facebook.com/post/1',
  campaign_id: 'meta-campaign', campaign_name: 'Tas', ad_status: 'ACTIVE',
  page_id: null, post_id: null, primary_text: 'Tas dengan kantong samping.',
  headline: null, description: null, matched_keywords: ['NAS'],
};
const comment = { isi: 'Kantong sampingnya muat botol ukuran berapa?', tone: 'pertanyaan' };

function storage(t) {
  const values = new Map();
  const originalStorage = global.localStorage;
  const originalWindow = global.window;
  global.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  global.window = { dispatchEvent() {} };
  t.after(() => { global.localStorage = originalStorage; global.window = originalWindow; });
  return values;
}

function database({ links = [], lookupError = null } = {}) {
  const filters = [];
  let insertCount = 0;
  const supabase = {
    from(table) {
      assert.equal(table, 'links');
      const conditions = [];
      const builder = {
        select() { return builder; },
        eq(field, value) { conditions.push([field, value]); filters.push([field, value]); return builder; },
        order() { return builder; },
        async limit() {
          return { data: links.filter(link => conditions.every(([field, value]) => link[field] === value)).slice(0, 1), error: lookupError };
        },
        insert(row) { insertCount++; builder.newRow = { ...row, id: `link-${insertCount}` }; return builder; },
        async single() { links.push(builder.newRow); return { data: builder.newRow, error: null }; },
      };
      return builder;
    },
  };
  return { supabase, filters, get insertCount() { return insertCount; } };
}

test('failed job and partial comments survive modal close / reload', t => {
  storage(t);
  const job = { ...retry.createRetryJob(ad, 'tas', 4, true), linkId: 'saved-link', status: 'failed', error: 'Quota exceeded', partialComments: [comment] };
  retry.saveRetryJob('user-1', 'campaign-1', job);
  assert.deepEqual(retry.loadRetryJobs('user-1', 'campaign-1'), [job]);
});

test('queue persists unstarted rows, not only rows already attempted', t => {
  storage(t);
  retry.saveRetryJob('user-1', 'campaign-1', retry.createRetryJob(ad, 'tas', 4, true));
  retry.saveRetryJob('user-1', 'campaign-1', retry.createRetryJob({ ...ad, ad_id: 'ad-2' }, 'tas', 4, true));
  assert.equal(retry.loadRetryJobs('user-1', 'campaign-1').filter(job => job.status === 'pending').length, 2);
});

test('retry storage is isolated by user and campaign', t => {
  storage(t);
  retry.saveRetryJob('user-1', 'campaign-1', retry.createRetryJob(ad, 'tas', 4, true));
  assert.deepEqual(retry.loadRetryJobs('user-2', 'campaign-1'), []);
  assert.deepEqual(retry.loadRetryJobs('user-1', 'campaign-2'), []);
});

test('repeated persistence updates a job rather than duplicating it', t => {
  storage(t);
  const job = retry.createRetryJob(ad, 'tas', 4, true);
  retry.saveRetryJob('user-1', 'campaign-1', job);
  retry.saveRetryJob('user-1', 'campaign-1', { ...job, status: 'failed' });
  assert.equal(retry.loadRetryJobs('user-1', 'campaign-1').length, 1);
});

test('finished jobs release cached comments and stop being retry candidates', t => {
  storage(t);
  const job = { ...retry.createRetryJob(ad, 'tas', 4, true), status: 'done', generated: [comment], partialComments: [comment], accountIds: ['account-1'], error: 'Old failure' };
  retry.saveRetryJob('user-1', 'campaign-1', job);
  const saved = retry.loadRetryJobs('user-1', 'campaign-1')[0];
  assert.equal(saved.status, 'done');
  assert.deepEqual(saved.generated, []);
  assert.equal(saved.error, undefined);
});

test('corrupted JSON and invalid job shape are ignored safely', t => {
  const values = storage(t);
  const key = retry.retryStorageKey('user-1', 'campaign-1');
  values.set(key, '{broken');
  assert.deepEqual(retry.loadRetryJobs('user-1', 'campaign-1'), []);
  values.set(key, JSON.stringify([null, { ad: { ad_id: 'ad-1' }, count: 999 }]));
  assert.deepEqual(retry.loadRetryJobs('user-1', 'campaign-1'), []);
});

test('storage failure surfaces a clear error instead of silently losing retries', t => {
  storage(t);
  global.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.throws(() => retry.saveRetryJob('user-1', 'campaign-1', retry.createRetryJob(ad, 'tas', 4, true)), /Konteks retry/);
});

test('deleting a link removes only that link retry record', t => {
  storage(t);
  retry.saveRetryJob('user-1', 'campaign-1', { ...retry.createRetryJob(ad, 'tas', 4, true), linkId: 'link-1' });
  retry.saveRetryJob('user-1', 'campaign-1', { ...retry.createRetryJob({ ...ad, ad_id: 'ad-2' }, 'tas', 4, true), linkId: 'link-2' });
  retry.removeRetryJobsForLink('user-1', 'campaign-1', 'link-1');
  assert.equal(retry.loadRetryJobs('user-1', 'campaign-1')[0].linkId, 'link-2');
});

test('retry resolves persisted link without another insert', async () => {
  const db = database({ links: [{ id: 'link-1', campaign_id: 'campaign-1', url: ad.post_url, status: 'pending' }] });
  const job = { ...retry.createRetryJob(ad, 'tas', 4, true), linkId: 'link-1' };
  assert.equal((await retry.getOrCreateImportLink(db.supabase, 'campaign-1', job)).id, 'link-1');
  assert.equal(db.insertCount, 0);
  assert.ok(db.filters.some(([key, value]) => key === 'campaign_id' && value === 'campaign-1'));
});

test('lost insert response recovers by URL, including stale cached link id', async () => {
  const db = database({ links: [{ id: 'link-1', campaign_id: 'campaign-1', url: ad.post_url }] });
  const job = { ...retry.createRetryJob(ad, 'tas', 4, true), linkId: 'missing-link' };
  const result = await retry.getOrCreateImportLink(db.supabase, 'campaign-1', job);
  assert.equal(result.id, 'link-1');
  assert.equal(db.insertCount, 0);
});

test('first import then retry creates exactly one link', async () => {
  const db = database();
  const job = retry.createRetryJob(ad, 'tas', 4, true);
  const first = await retry.getOrCreateImportLink(db.supabase, 'campaign-1', job);
  const second = await retry.getOrCreateImportLink(db.supabase, 'campaign-1', job);
  assert.equal(first.id, second.id);
  assert.equal(db.insertCount, 1);
});

test('lookup error does not proceed to insert a possible duplicate', async () => {
  const db = database({ lookupError: { message: 'Connection interrupted' } });
  await assert.rejects(retry.getOrCreateImportLink(db.supabase, 'campaign-1', retry.createRetryJob(ad, 'tas', 4, true)), /Connection interrupted/);
  assert.equal(db.insertCount, 0);
});

test('assignment plan fills only missing accounts and keeps existing order', () => {
  assert.deepEqual(retry.planRetryAssignments(['a', 'b', 'c', 'd', 'd'], [
    { account_id: 'a', urutan: 0 }, { account_id: 'b', urutan: 1 }, { account_id: 'c', urutan: 5 },
  ], 4), [{ accountId: 'd', urutan: 6 }]);
  assert.deepEqual(retry.planRetryAssignments(['a', 'b'], [{ account_id: 'a', urutan: 0 }], 1), []);
});

test('committed assignments with lost response are excluded from cached generation', () => {
  const second = { isi: 'Talinya bisa diatur sampai panjang berapa?', tone: 'pertanyaan' };
  const job = { ...retry.createRetryJob(ad, 'tas', 2, true), accountIds: ['a', 'b'], generated: [comment, second] };
  assert.deepEqual(retry.cachedRetryComments(job, [{ account_id: 'a' }]), [second]);
});
