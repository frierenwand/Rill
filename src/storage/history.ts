import type { Ctx } from '../context';
import type { MarkEvent, ResumeEntry, ScrobbleEvent, WatchSnapshot } from '../trackers/types';
import { titleKey } from '../trackers/common';

interface LocalRecord {
  ids: ScrobbleEvent['ids']; kind: 'movie' | 'episode'; season?: number; episode?: number;
  progress: number; watched: boolean; at: string;
  positionMs?: number; runtimeMs?: number;
}

export function historyStatement(ctx: Ctx, ev: ScrobbleEvent | MarkEvent | ResumeEntry, mode: 'progress' | 'mark' | 'clear'): D1PreparedStatement | null {
  if (!ctx.env.DB || ev.kind === 'series') return null;
  const key = `${ev.kind}:${titleKey(ev.ids, ev.kind, ev.season, ev.episode)}`;
  const watched = mode === 'mark' ? (ev as MarkEvent).watched : mode === 'progress' && 'action' in ev && ev.action === 'stop' && ev.progress >= 90;
  const at = 'at' in ev && ev.at && Number.isFinite(Date.parse(ev.at)) ? ev.at : new Date().toISOString();
  const value: LocalRecord = {
    ids: ev.ids, kind: ev.kind, season: ev.season, episode: ev.episode,
    progress: mode === 'progress' && 'progress' in ev && !watched ? ev.progress : 0,
    watched, at,
    positionMs:mode === 'progress' && !watched && 'positionMs' in ev ? ev.positionMs : undefined,
    runtimeMs:'runtimeMs' in ev ? ev.runtimeMs : undefined,
  };
  // A partial rewatch/clear preserves the existing played flag. Explicit unwatch clears it.
  const preserve = mode !== 'mark';
  return ctx.env.DB.prepare(`INSERT INTO history(scope,key,value,updated) VALUES(?,?,?,?) ON CONFLICT(scope,key) DO UPDATE SET
    value=CASE WHEN ? AND json_extract(history.value,'$.watched')=1 THEN json_set(excluded.value,'$.watched',json('true')) ELSE excluded.value END,
    updated=excluded.updated WHERE excluded.updated>=history.updated`).bind(ctx.historyScope ?? ctx.scope, key, JSON.stringify(value), Date.parse(at), preserve ? 1 : 0);
}

export async function saveHistory(ctx: Ctx, ev: ScrobbleEvent | MarkEvent | ResumeEntry, mode: 'progress' | 'mark' | 'clear'): Promise<void> {
  await historyStatement(ctx, ev, mode)?.run();
}

function same(a: LocalRecord, b: { ids: LocalRecord['ids']; season?: number; episode?: number }, kind: string): boolean {
  if (a.kind !== kind || (kind === 'episode' && (a.season !== b.season || a.episode !== b.episode))) return false;
  return (['imdb','tmdb','tvdb','mal','anilist','kitsu','anidb'] as const).some(k => a.ids[k] !== undefined && a.ids[k] === b.ids[k]);
}

/** Local decisions, including explicit unwatch/clear, override stale provider reads. */
export async function overlayHistory(ctx: Ctx, base: WatchSnapshot): Promise<WatchSnapshot> {
  if (!ctx.env.DB) return base;
  const rows = await ctx.env.DB.prepare('SELECT value FROM history WHERE scope=? ORDER BY updated').bind(ctx.historyScope ?? ctx.scope).all<{ value: string }>();
  const out = structuredClone(base);
  out.local=[];
  for (const row of rows.results) {
    const r = JSON.parse(row.value) as LocalRecord;
    out.local.push(r);
    out.resume = out.resume.filter(e => !same(r,e,e.kind));
    if ((r.progress > 0 || (r.positionMs ?? 0) > 0) && r.progress < 100) out.resume.push({ ids:r.ids, kind:r.kind, season:r.season, episode:r.episode, progress:r.progress, positionMs:r.positionMs, runtimeMs:r.runtimeMs, at:r.at });
    if (r.kind === 'movie') {
      out.movies = out.movies.filter(e => !same(r,e,'movie'));
      if (r.watched) out.movies.push({ ids:r.ids, plays:1, lastAt:r.at });
    } else {
      out.episodes = out.episodes.filter(e => !same(r,e,'episode'));
      if (r.watched && r.season !== undefined && r.episode !== undefined) out.episodes.push({ ids:r.ids, season:r.season, episode:r.episode, plays:1, lastAt:r.at });
    }
  }
  // Rebuild show activity from actual remaining history, so unwatch doesn't leave stale Next Up.
  out.shows = [];
  for (const e of [...out.episodes.map(e => ({...e,at:e.lastAt})), ...out.resume.filter(e => e.kind === 'episode')].sort((a,b) => a.at.localeCompare(b.at))) {
    const found = out.shows.find(s => Object.entries(e.ids).some(([k,v]) => k !== 'tmdbType' && v && s.ids[k as keyof typeof s.ids] === v));
    const value = { ids:e.ids, lastAt:e.at, lastSeason:e.season, lastEpisode:e.episode };
    if (found) Object.assign(found,value); else out.shows.push(value);
  }
  out.resume.sort((a,b) => b.at.localeCompare(a.at));
  out.shows.sort((a,b) => b.lastAt.localeCompare(a.lastAt));
  return out;
}
