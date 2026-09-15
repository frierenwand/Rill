import type { Env } from '../env';
import type { Ctx } from '../context';
import { decodeConfig } from '../config/codec';
import { drainTracking, trackerApi } from '../trackers/index';
import { statePut } from './state';
import { advanceBulk } from './bulk';
import { sha256 } from '../util/bytes';

/** One bounded batch per minute; history synchronization is due every 30 minutes. */
export async function scheduled(_event: ScheduledController, env: Env): Promise<void> {
  const db = env.DB;
  if (!db) throw new Error('Scheduled synchronization requires DB');
  const now = Date.now();
  const accounts = await db.prepare(`SELECT scope,config,origin,sync_after FROM accounts WHERE sync_after<=?
    OR scope IN (SELECT scope FROM deliveries WHERE status='pending' AND due<=?)
    OR scope IN (SELECT scope FROM bulk_actions WHERE status='pending') ORDER BY sync_after LIMIT 10`)
    .bind(now,now).all<{scope:string;config:string;origin:string;sync_after:number}>();
  for (const a of accounts.results) {
    const cfg = await decodeConfig(a.config);
    if (!cfg) continue;
    const ctx: Ctx = {cfg,env,cfgToken:a.config,scope:a.scope,cacheRevision:(await sha256(JSON.stringify(cfg))).slice(0,16),origin:a.origin,lang:cfg.language.slice(0,2).toLowerCase(),tmdbKey:cfg.keys.tmdb || env.TMDB_KEY};
    try {
      await advanceBulk(ctx);
      await drainTracking(ctx);
      if (a.sync_after <= now) {
        const claimed = await db.prepare('UPDATE accounts SET sync_after=? WHERE scope=? AND sync_after<=?').bind(now+30*60_000,a.scope,now).run();
        if (claimed.meta.changes) {
          const tracker = trackerApi.primary(ctx);
          if (tracker) await statePut(ctx,`history-import:${ctx.scope}:${tracker.name}`,await tracker.snapshot(ctx),365*86400);
          await trackerApi.invalidate(ctx);
        }
      }
    } catch { console.warn('Account synchronization failed'); }
  }
  await db.batch([
    db.prepare('DELETE FROM state WHERE expires<=?').bind(now),
    db.prepare("DELETE FROM deliveries WHERE status IN ('done','superseded') AND created<?").bind(now-30*86400_000),
    db.prepare("DELETE FROM bulk_actions WHERE status IN ('done','cancelled') AND created<?").bind(now-30*86400_000),
  ]);
}
