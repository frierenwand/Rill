import type { Env } from '../env';

const SCOPE = 'rill:installation';
const SERVICE = 'updates';
const REQUEST_KEY = 'rill:update-request';
const COOLDOWN = 60_000;

export class UpdateError extends Error {
  status: 400 | 503 | 502;
  constructor(message: string, status: 400 | 503 | 502 = 400) { super(message); this.status = status; }
}

interface Settings { hook: string; daily: boolean }
interface RequestRecord { id: string; requestedAt?: number; buildId?: string }

export function validateUpdateHook(value: string): string {
  let hook: URL;
  try { hook = new URL(value.trim()); }
  catch { throw new UpdateError('Paste a valid Cloudflare Deploy Hook URL.'); }
  if (value.length > 512 || hook.origin !== 'https://api.cloudflare.com' || hook.username || hook.password || hook.search || hook.hash ||
    !/^\/client\/v4\/workers\/builds\/deploy_hooks\/[a-zA-Z0-9_-]+$/.test(hook.pathname)) {
    throw new UpdateError('Paste a valid Cloudflare Deploy Hook URL.');
  }
  return hook.href;
}

async function settings(env: Env): Promise<Settings> {
  const row = await env.DB?.prepare('SELECT value FROM credentials WHERE scope=? AND service=?')
    .bind(SCOPE, SERVICE).first<{ value: string }>();
  // Existing installations with the secret keep their daily update behavior.
  return row ? JSON.parse(row.value) as Settings : { hook: env.RILL_UPDATE_HOOK || '', daily: Boolean(env.RILL_UPDATE_HOOK) };
}

function database(env: Env): D1Database {
  if (!env.DB) throw new UpdateError('Updates need your installation database.', 503);
  return env.DB;
}

export async function updateStatus(env: Env) {
  const config = await settings(env);
  const row = await env.DB?.prepare('SELECT value,expires FROM state WHERE key=? AND expires>?')
    .bind(REQUEST_KEY, Date.now()).first<{ value: string; expires: number }>();
  const request = row ? JSON.parse(row.value) as RequestRecord : null;
  // Never return the hook. It is separate from account configs and exports.
  return { configured: Boolean(config.hook), daily: config.daily,
    retryAfter: row ? Math.max(0, Math.ceil((row.expires - Date.now()) / 1000)) : 0,
    requestedAt: request?.requestedAt ?? null };
}

export async function configureUpdates(env: Env, hook: unknown, daily: unknown): Promise<void> {
  const db = database(env);
  if (typeof daily !== 'boolean' || (hook !== undefined && typeof hook !== 'string')) {
    throw new UpdateError('Choose your update settings and try again.');
  }
  const current = await settings(env);
  const value = typeof hook === 'string' && hook.trim() ? hook : current.hook;
  const config: Settings = { hook: validateUpdateHook(value), daily };
  await db.prepare('INSERT INTO credentials(scope,service,value) VALUES(?,?,?) ON CONFLICT(scope,service) DO UPDATE SET value=excluded.value')
    .bind(SCOPE, SERVICE, JSON.stringify(config)).run();
}

export async function disconnectUpdates(env: Env): Promise<void> {
  // An explicit disabled record also overrides a legacy environment secret.
  await database(env).prepare('INSERT INTO credentials(scope,service,value) VALUES(?,?,?) ON CONFLICT(scope,service) DO UPDATE SET value=excluded.value')
    .bind(SCOPE, SERVICE, JSON.stringify({ hook: '', daily: false })).run();
}

export async function requestUpdate(env: Env) {
  const db = database(env);
  const config = await settings(env);
  if (!config.hook) throw new UpdateError('Connect updates first.');
  const hook = validateUpdateHook(config.hook);
  const now = Date.now(), id = crypto.randomUUID();
  const lease = JSON.stringify({ id });
  // Claim atomically across requests and Worker instances, including the cron.
  const claim = await db.prepare(`INSERT INTO state(key,value,expires) VALUES(?,?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,expires=excluded.expires WHERE state.expires<=?`)
    .bind(REQUEST_KEY, lease, now + COOLDOWN, now).run();
  if (!claim.meta.changes) return { alreadyRequested: true, ...await updateStatus(env) };
  try {
    const response = await fetch(hook, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(15_000) });
    const result = await response.json<{ success?: boolean; result?: { build_uuid?: string } }>();
    if (!response.ok || result.success !== true) throw new Error('Build request rejected');
    const record: RequestRecord = { id, requestedAt: now };
    if (typeof result.result?.build_uuid === 'string') record.buildId = result.result.build_uuid;
    await db.prepare('UPDATE state SET value=? WHERE key=? AND value=?')
      .bind(JSON.stringify(record), REQUEST_KEY, lease).run();
    return { alreadyRequested: false, ...await updateStatus(env) };
  } catch {
    await db.prepare('DELETE FROM state WHERE key=? AND value=?').bind(REQUEST_KEY, lease).run();
    // Fetch errors and Cloudflare responses can contain the private hook URL.
    throw new UpdateError('The update could not start. Check your Cloudflare Deploy Hook and try again.', 502);
  }
}

// Reuse the existing minute trigger; scheduledTime is UTC, even if delayed.
export async function dailyUpdate(event: Pick<ScheduledController, 'scheduledTime'>, env: Env): Promise<void> {
  if (!env.DB || Math.floor(event.scheduledTime / 60_000) % 1440 !== 4 * 60 + 17) return;
  const config = await settings(env);
  if (!config.hook || !config.daily) return;
  validateUpdateHook(config.hook);
  const key = `rill:daily-update:${Math.floor(event.scheduledTime / 86_400_000)}`;
  const claim = await env.DB.prepare('INSERT OR IGNORE INTO state(key,value,expires) VALUES(?,?,?)')
    .bind(key, 'true', Date.now() + 2 * 86_400_000).run();
  if (!claim.meta.changes) return;
  try {
    await requestUpdate(env);
    console.log('Daily Rill update build requested. Check Cloudflare build history for the result.');
  } catch (error) {
    await env.DB.prepare('DELETE FROM state WHERE key=?').bind(key).run();
    throw error;
  }
}
