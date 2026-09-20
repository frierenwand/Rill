import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { prepareBuild, preparedBuild } from '../scripts/build.mjs';
import { dailyUpdate } from '../src/storage/updates.ts';

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

test('imported copies build the latest source while preserving installation configuration', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'rill-build-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const upstream = join(directory, 'upstream');
  const root = join(directory, 'installation');
  mkdirSync(upstream);
  mkdirSync(root);
  git(upstream, 'init', '-b', 'main');
  git(upstream, 'config', 'user.name', 'Test');
  git(upstream, 'config', 'user.email', 'test@example.invalid');
  writeFileSync(join(upstream, 'wrangler.jsonc'), '{"name":"rill"}');
  writeFileSync(join(upstream, 'app.txt'), 'first release');
  writeFileSync(join(upstream, 'removed.txt'), 'old file');
  git(upstream, 'add', '.');
  git(upstream, 'commit', '-m', 'Initial');
  // A Cloudflare import has its own history; no merge or fork is required.
  git(root, 'init', '-b', 'main');
  const config = '// Cloudflare installation\n{"name":"rill10","d1_databases":[{"binding":"DB","database_id":"keep-me"}],"vars":{"CUSTOM":"keep"}}\n';
  writeFileSync(join(root, 'wrangler.jsonc'), config);
  writeFileSync(join(root, 'app.txt'), 'imported source');
  const commands = [];
  const execute = (command, args, cwd) => {
    commands.push([command, ...args]);
    if (command === 'git') execFileSync(command, args, { cwd, stdio: 'pipe' });
  };
  const first = prepareBuild({ root, upstream, execute });
  assert.equal(first.revision, git(upstream, 'rev-parse', 'HEAD'));
  assert.equal(readFileSync(join(first.destination, 'wrangler.jsonc'), 'utf8'), config);
  assert.equal(readFileSync(join(root, 'app.txt'), 'utf8'), 'imported source');
  assert.equal(readFileSync(join(root, 'wrangler.jsonc'), 'utf8'), config);
  assert.deepEqual(commands.slice(-2), [['npm', 'ci', '--no-audit', '--no-fund'], ['npm', 'run', 'typecheck']]);

  writeFileSync(join(upstream, 'app.txt'), 'second release');
  rmSync(join(upstream, 'removed.txt'));
  git(upstream, 'add', '.');
  git(upstream, 'commit', '-m', 'New release');
  const second = prepareBuild({ root, upstream, execute });
  assert.notEqual(second.revision, first.revision);
  assert.equal(readFileSync(join(second.destination, 'app.txt'), 'utf8'), 'second release');
  assert.equal(existsSync(join(second.destination, 'removed.txt')), false);
  assert.equal(readFileSync(join(second.destination, 'wrangler.jsonc'), 'utf8'), config);
  assert.deepEqual(preparedBuild(root), second);

  // A failed dependency install or source fetch cannot deploy a stale build.
  assert.throws(() => prepareBuild({ root, upstream, execute(command, args, cwd) {
    if (command === 'npm') throw new Error('Install failed');
    execute(command, args, cwd);
  } }), /Install failed/);
  assert.throws(() => preparedBuild(root), /Run npm run build/);
  assert.equal(existsSync(join(root, '.rill-build')), false);
  assert.equal(readFileSync(join(root, 'wrangler.jsonc'), 'utf8'), config);
  assert.throws(() => prepareBuild({ root, upstream: join(directory, 'missing'), execute }));
  assert.throws(() => preparedBuild(root), /Run npm run build/);
});

const hook = 'https://api.cloudflare.com/client/v4/workers/builds/deploy_hooks/test-private-hook';
const scheduledTime = Date.parse('2026-09-22T04:17:00Z');

function database(t) {
  const sql = new DatabaseSync(':memory:');
  sql.exec('CREATE TABLE state (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires INTEGER NOT NULL)');
  t.after(() => sql.close());
  return {
    prepare(query) {
      return { bind: (...values) => ({ run: async () => ({ meta: { changes: sql.prepare(query).run(...values).changes } }) }) };
    },
  };
}

test('daily update sends one POST at 04:17 UTC, even with duplicate cron delivery', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (...args) => {
    calls.push(args);
    return Response.json({ success: true });
  });
  const env = { DB: database(t), RILL_UPDATE_HOOK: hook };
  await dailyUpdate({ scheduledTime }, { DB: env.DB });
  await dailyUpdate({ scheduledTime: scheduledTime - 60_000 }, env);
  await dailyUpdate({ scheduledTime: scheduledTime + 60_000 }, env);
  assert.equal(calls.length, 0);
  await Promise.all([dailyUpdate({ scheduledTime }, env), dailyUpdate({ scheduledTime }, env)]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], hook);
  assert.equal(calls[0][1].method, 'POST');
  assert.equal(calls[0][1].redirect, 'error');
  await dailyUpdate({ scheduledTime: scheduledTime + 86_400_000 }, env);
  assert.equal(calls.length, 2);
});

test('a rejected build can be retried and never reports the private URL', async (t) => {
  let attempts = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    attempts++;
    if (attempts === 1) return Response.json({ success: false });
    if (attempts === 2) throw new Error(`Network failed for ${hook}`);
    if (attempts === 3) return new Response('Unavailable', { status: 503 });
    return Response.json({ success: true });
  });
  const env = { DB: database(t), RILL_UPDATE_HOOK: hook };
  for (let i = 0; i < 3; i++) {
    await assert.rejects(dailyUpdate({ scheduledTime }, env), (error) => {
      assert.match(error.message, /could not start/);
      assert.equal(error.message.includes('test-private-hook'), false);
      return true;
    });
  }
  await dailyUpdate({ scheduledTime }, env);
  await dailyUpdate({ scheduledTime }, env);
  assert.equal(attempts, 4);
});

test('daily updates reject invalid hooks before sending requests', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Must not fetch'); });
  const DB = database(t);
  for (const url of ['invalid', 'http://api.cloudflare.com/client/v4/workers/builds/deploy_hooks/id',
    'https://example.com/hook', `${hook}?token=secret`, hook.replace('api.cloudflare.com', 'user@api.cloudflare.com')]) {
    await assert.rejects(dailyUpdate({ scheduledTime }, { DB, RILL_UPDATE_HOOK: url }), /Cloudflare Deploy Hook URL/);
  }
  assert.equal(fetch.mock.callCount(), 0);
});
