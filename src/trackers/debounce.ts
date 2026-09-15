/** A losable resume overlay of successfully delivered playback transitions.
 * Periodic progress reports never enter this buffer. */
import type { Ctx } from '../context';
import { cacheDelete, cacheGet, cachePut } from '../util/cache';
import { mapLimit } from '../util/concurrency';
import { clampPercent, epoch, nowIso, titleKey } from './common';
import type { ResumeEntry, ScrobbleAction, ScrobbleEvent } from './types';

const WATCHED_AT = 80;
/** How long a title's record lives; long enough to cover a paused evening. */
const RECORD_TTL_S = 24 * 3600;
/** Upper bound on the resume index so it stays a small JSON blob. */
const INDEX_MAX = 60;

export interface BufferRecord {
  /** Last successfully delivered transition. */
  action: ScrobbleAction;
  progress: number;
  at: string;
  /** What we need to rebuild a ResumeEntry. */
  ev: Pick<ScrobbleEvent, 'ids' | 'kind' | 'season' | 'episode'>;
}

interface IndexBlob { keys: string[] }

function recordKey(ctx: Ctx, key: string): string {
  return `scrobble:${ctx.scope}:${key}`;
}
function indexKey(ctx: Ctx): string {
  return `scrobble-index:${ctx.scope}`;
}

/** Overlay only confirmed transitions. Delivery deduplication is scoped per sink and session. */
export async function recordConfirmed(ctx: Ctx, ev: ScrobbleEvent): Promise<void> {
  const key = titleKey(ev.ids, ev.kind, ev.season, ev.episode);
  const next: BufferRecord = {
    action: ev.action, progress: clampPercent(ev.progress), at: nowIso(),
    ev: { ids: ev.ids, kind: ev.kind, season: ev.season, episode: ev.episode },
  };
  await cachePut(recordKey(ctx, key), next, RECORD_TTL_S);
  await touchIndex(ctx, key);
}

async function touchIndex(ctx: Ctx, key: string): Promise<void> {
  const blob = (await cacheGet<IndexBlob>(indexKey(ctx))) ?? { keys: [] };
  const keys = [key, ...blob.keys.filter((k) => k !== key)].slice(0, INDEX_MAX);
  await cachePut(indexKey(ctx), { keys }, RECORD_TTL_S);
}

/** Every record the buffer still holds for this scope, newest first. */
export async function bufferedRecords(ctx: Ctx): Promise<BufferRecord[]> {
  const blob = await cacheGet<IndexBlob>(indexKey(ctx));
  if (!blob?.keys?.length) return [];
  const rows = await mapLimit(blob.keys, 8, (k) => cacheGet<BufferRecord>(recordKey(ctx, k)));
  return rows.filter((r): r is BufferRecord => !!r && !!r.ev).sort((a, b) => epoch(b.at) - epoch(a.at));
}

/**
 * Resume entries as far as the buffer knows them. A stop above the watched
 * threshold means "finished", which the merge in index.ts uses to hide the
 * tracker's stale position; everything else with some progress is a resume point.
 */
export async function bufferedResume(ctx: Ctx): Promise<ResumeEntry[]> {
  const out: ResumeEntry[] = [];
  for (const r of await bufferedRecords(ctx)) {
    if (r.progress <= 0 || finishedInBuffer(r)) continue;
    out.push({ ids: r.ev.ids, kind: r.ev.kind, season: r.ev.season, episode: r.ev.episode, progress: r.progress, at: r.at });
  }
  return out;
}

/** True when the buffer says this title was finished (stop at or above the threshold). */
export function finishedInBuffer(r: BufferRecord): boolean {
  return r.action === 'stop' && r.progress >= WATCHED_AT;
}

/** Drop what the buffer knows about a title (the client cleared it, or it was re-marked). */
export async function forgetTitle(ctx: Ctx, ev: Pick<ScrobbleEvent, 'ids' | 'kind' | 'season' | 'episode'>): Promise<void> {
  await cacheDelete(recordKey(ctx, titleKey(ev.ids, ev.kind, ev.season, ev.episode)));
}
