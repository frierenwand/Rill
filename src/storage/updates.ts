import type { Env } from '../env';

// Reuse the existing minute trigger so older installations keep their own
// Wrangler configuration. scheduledTime is UTC, including delayed deliveries.
export async function dailyUpdate(event: Pick<ScheduledController, 'scheduledTime'>, env: Env): Promise<void> {
  if (!env.RILL_UPDATE_HOOK || !env.DB) return;
  if (Math.floor(event.scheduledTime / 60_000) % 1440 !== 4 * 60 + 17) return;

  let hook: URL;
  try { hook = new URL(env.RILL_UPDATE_HOOK.trim()); }
  catch { throw new Error('RILL_UPDATE_HOOK must be a Cloudflare Deploy Hook URL.'); }
  if (hook.origin !== 'https://api.cloudflare.com' || hook.username || hook.password || hook.search || hook.hash ||
    !/^\/client\/v4\/workers\/builds\/deploy_hooks\/[a-zA-Z0-9_-]+$/.test(hook.pathname)) {
    throw new Error('RILL_UPDATE_HOOK must be a Cloudflare Deploy Hook URL.');
  }

  const key = `rill:daily-update:${Math.floor(event.scheduledTime / 86_400_000)}`;
  const claim = await env.DB.prepare('INSERT OR IGNORE INTO state(key,value,expires) VALUES(?,?,?)')
    .bind(key, 'true', Date.now() + 2 * 86_400_000).run();
  if (!claim.meta.changes) return;

  try {
    const response = await fetch(hook.href, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000) });
    if (!response.ok || !(await response.json<{ success?: boolean }>()).success) {
      throw new Error('Cloudflare did not accept the daily build request.');
    }
    console.log('Daily Rill update build requested. Check Cloudflare build history for the result.');
  } catch {
    await env.DB.prepare('DELETE FROM state WHERE key=?').bind(key).run();
    // Never include the credential-bearing URL or a raw fetch error in logs.
    throw new Error('Daily Rill update could not start. Check the Deploy Hook or retry a build in Cloudflare.');
  }
}
