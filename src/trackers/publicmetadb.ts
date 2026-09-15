import type { Ctx } from '../context';
import { emptySnapshot, sendRequest } from './common';
import type { MarkEvent, ScrobbleEvent, Tracker } from './types';
import { fetchJson } from '../util/cache';
import { metaApi } from '../meta/index';
import { mapLimit } from '../util/concurrency';
import type { ManifestCatalog, MetaPreview } from '../stremio/types';

async function catalogs(ctx: Ctx): Promise<ManifestCatalog[]> {
  if (!ctx.cfg.keys.publicmetadb) return [];
  const refs=[{id:'resume',name:'Continue watching'},...(ctx.cfg.lists.publicmetadb ?? []).map(id=>({id:`list:${id}`,name:`List ${id}`})),...(ctx.cfg.lists.publicmetadbPicks ?? []).map(id=>({id:`pick:${id}`,name:`Pick ${id}`}))];
  return refs.flatMap(r => (['movie','series'] as const).map(type => ({id:`publicmetadb:${type}:${r.id}`,type,name:`PublicMetaDB ${r.name}`,extra:[{name:'skip'}]})));
}

async function catalogItems(ctx: Ctx, id: string, skip: number): Promise<MetaPreview[]> {
  if (!ctx.cfg.keys.publicmetadb) return [];
  const match=/^publicmetadb:(movie|series):(resume|list|pick)(?::(.+))?$/.exec(id);
  if (!match) return [];
  const type=match[1] as 'movie'|'series',kind=match[2],ref=match[3];
  if (kind!=='resume' && !ref) return [];
  if (kind==='resume' && skip>0) return [];
  const page=Math.floor(Math.max(0,skip)/20)+1;
  if (kind==='pick' && page>5) return [];
  const path=kind==='resume' ? '/resume' : kind==='list' ? `/lists/${encodeURIComponent(ref!)}/items?page=${page}&perPage=20` : `/catalogs/${encodeURIComponent(ref!)}/items?page=${page}`;
  const result=await fetchJson<{items?:Array<{tmdb_id:number;media_type:string;season?:number;episode?:number}>}>(`https://publicmetadb.com/api/external${path}`,{headers:{authorization:`Bearer ${ctx.cfg.keys.publicmetadb}`},ttl:60,cacheScope:ctx.scope});
  if (!result) throw new Error('PublicMetaDB catalog unavailable');
  const rows=(result.items ?? []).filter(r => (r.media_type==='movie' ? 'movie':'series')===type);
  const items=await mapLimit(rows,4,async row => {
    const meta=await metaApi.resolveMeta(ctx,type,`tmdb:${row.tmdb_id}`);
    if (!meta) return null;
    if (kind==='resume' && type==='series') {
      const video=meta.videos?.find(v=>v.season===row.season && v.episode===row.episode);
      if (video) return {...meta,name:`${meta.name} · S${row.season}E${row.episode}`,videos:[video],behaviorHints:{...meta.behaviorHints,defaultVideoId:video.id}};
    }
    return meta;
  });
  return items.filter((m):m is NonNullable<typeof m>=>m!==null);
}

function target(ev: MarkEvent | ScrobbleEvent) {
  if (!ev.ids.tmdb) throw new Error('PublicMetaDB requires a TMDB ID');
  if (ev.kind === 'series' || (ev.kind === 'episode' && (ev.season === undefined || !ev.episode))) throw new Error('PublicMetaDB requires an individual movie or episode');
  return { tmdb_id: ev.ids.tmdb, media_type: ev.kind === 'movie' ? 'movie' : 'tv', ...(ev.kind === 'episode' ? { season: ev.season, episode: ev.episode } : {}) };
}
async function write(ctx: Ctx, path: string, method: string, body?: unknown) {
  const r = await sendRequest(`https://publicmetadb.com/api/external${path}`, {
    method, headers: { authorization: `Bearer ${ctx.cfg.keys.publicmetadb}`, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!r.ok || (r.body as { success?: boolean } | null)?.success === false) throw new Error('PublicMetaDB write rejected');
}
async function mark(ctx: Ctx, ev: MarkEvent) {
  const body = target(ev);
  if (ev.watched) await write(ctx, '/watched?dedupe=true', 'POST', body);
  else {
    const params = new URLSearchParams(Object.entries(body).map(([k, v]) => [k, String(v)]));
    await write(ctx, `/watched?${params}`, 'DELETE');
  }
}
export const publicmetadbTracker: Tracker = {
  name: 'publicmetadb', ready: ctx => !!ctx.cfg.keys.publicmetadb,
  // Output-only integration, matching the inspected Jellyfin source's read limitation.
  snapshot: async () => emptySnapshot(),
  catalogs,
  catalogItems,
  mark,
  async scrobble(ctx, ev) {
    if (ev.action !== 'stop') return;
    const body = target(ev);
    if (ev.runtimeMs && ev.runtimeMs > 0) await write(ctx, '/resume', 'POST', {
      ...body, position_ms: Math.round(ev.runtimeMs * ev.progress / 100), runtime_ms: ev.runtimeMs,
    });
    if (ev.progress >= 90) await mark(ctx, { ...ev, watched: true });
  },
};
