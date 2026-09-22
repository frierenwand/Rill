import type { Ctx } from '../context';
import type { Tracker, WatchSnapshot } from '../trackers/types';
import { emptySnapshot, nowIso } from '../trackers/common';
import { cacheGet, cachePut } from '../util/cache';
import { reconcileDropped } from './dropped';
import { loadSnapshot, loadSnapshotSummary, saveSnapshot, touchSnapshot } from './snapshots';

const REFRESH_SECONDS = 60;
const FAILURE_BACKOFF_SECONDS = 10 * 60;

function staleAfterMs(tracker: Tracker): number {
  return tracker.name === 'trakt' || tracker.name === 'simkl' ? 5 * 60_000 : 15 * 60_000;
}

export function historyImportKey(ctx: Ctx, tracker: Tracker): string {
  return `history-import:${ctx.scope}:${tracker.name}`;
}

export async function importSnapshot(ctx: Ctx, tracker: Tracker, previous: WatchSnapshot | null): Promise<WatchSnapshot> {
  const key = historyImportKey(ctx, tracker);
  const fresh = await tracker.snapshot(ctx, previous);
  if (previous && fresh === previous) {
    fresh.fetchedAt = nowIso();
    await reconcileDropped(ctx, tracker.name, fresh);
    await touchSnapshot(ctx, key);
    return fresh;
  }
  await reconcileDropped(ctx, tracker.name, fresh);
  await saveSnapshot(ctx, key, fresh);
  return fresh;
}

export async function backOffImport(ctx: Ctx, tracker: Tracker): Promise<void> {
  const now = Date.now();
  await ctx.env.DB?.prepare('INSERT INTO state(key,value,expires) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,expires=excluded.expires')
    .bind(`${historyImportKey(ctx, tracker)}:refresh`, 'true', now + FAILURE_BACKOFF_SECONDS * 1000).run();
}

// Local progress is overlaid by the caller, so serving the last complete
// import never delays a user's own playback updates.
export async function importedHistory(ctx: Ctx, tracker: Tracker, cacheKey: string, summary = false): Promise<WatchSnapshot> {
  // Database generations are authoritative across isolates and Cloudflare regions.
  const cached = !ctx.env.DB ? await cacheGet<WatchSnapshot>(cacheKey) : null;
  if (cached) return cached;
  const durableKey = historyImportKey(ctx, tracker);
  const stored = ctx.env.DB ? await (summary ? loadSnapshotSummary : loadSnapshot)(ctx, durableKey) : null;

  const refresh = async (): Promise<WatchSnapshot> => {
    if (ctx.env.DB) {
      const now = Date.now();
      // Across clients/isolates, only one foreground refresh starts per minute.
      // Keep the cooldown after failures to avoid repeated imports during outages.
      const claimed = await ctx.env.DB.prepare(`INSERT INTO state(key,value,expires) VALUES(?,?,?)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value,expires=excluded.expires
        WHERE state.expires<=? RETURNING key`)
        .bind(`${durableKey}:refresh`, 'true', now + REFRESH_SECONDS * 1000, now).first();
      if (!claimed) return stored ?? emptySnapshot();
    }
    try {
      if (ctx.env.DB) return await importSnapshot(ctx, tracker, null);
      const fresh = await tracker.snapshot(ctx);
      await cachePut(cacheKey, fresh, REFRESH_SECONDS);
      return fresh;
    } catch {
      console.warn(`History refresh failed (${tracker.name}); retaining saved history`);
      const fallback = stored ?? emptySnapshot();
      if (ctx.env.DB) await backOffImport(ctx, tracker).catch(() => undefined);
      else await cachePut(cacheKey, fallback, REFRESH_SECONDS);
      return fallback;
    }
  };

  if (stored) {
    if (!ctx.env.DB) await cachePut(cacheKey, stored, REFRESH_SECONDS);
    const fetchedAt = Date.parse(stored.fetchedAt);
    const staleAfter = ctx.env.DB ? staleAfterMs(tracker) : REFRESH_SECONDS * 1000;
    if (ctx.defer && (!Number.isFinite(fetchedAt) || Date.now() - fetchedAt >= staleAfter)) {
      // A full import also consumes the browsing request's CPU budget in waitUntil.
      // Let the scheduled worker refresh it while clients use the complete snapshot.
      const now = Date.now();
      if (ctx.env.DB) ctx.defer(ctx.env.DB.prepare(`UPDATE accounts SET sync_after=? WHERE scope=? AND sync_after>?
        AND NOT EXISTS (SELECT 1 FROM state WHERE key=? AND expires>?)`)
        .bind(now, ctx.scope, now, `${durableKey}:refresh`, now).run());
      else ctx.defer(refresh());
    }
    return stored;
  }
  // Only the first import needs to wait; existing installations can browse
  // immediately even if the tracker is slow or unavailable.
  return refresh();
}
