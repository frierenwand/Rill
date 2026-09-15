import type { Ctx } from '../context';
import { emptySnapshot, sendRequest } from './common';
import type { MarkEvent, ScrobbleEvent, Tracker } from './types';
import { fetchJson } from '../util/cache';
import { metaApi } from '../meta/index';
import { mapLimit } from '../util/concurrency';
import type { ManifestCatalog, MetaPreview } from '../stremio/types';
import { sourcePreview } from '../addon/sources';

async function catalogs(ctx: Ctx): Promise<ManifestCatalog[]> {
  if (!ctx.cfg.keys.publicmetadb) return [];
  type Ref={id:string|number;name?:string;title?:string};
  const options={headers:{authorization:`Bearer ${ctx.cfg.keys.publicmetadb}`},ttl:600,cacheScope:ctx.scope};
  const lists:Ref[]=[];
  for(let page=1;page<=20;page++) {
    const data=await fetchJson<{lists?:Ref[];items?:Ref[];pagination?:{totalPages?:number;hasNextPage?:boolean}}>(`https://publicmetadb.com/api/external/lists?page=${page}&perPage=50`,options);
    const rows=data?.lists??data?.items??[];
    lists.push(...rows);
    if(!rows.length || data?.pagination?.hasNextPage===false || page>=(data?.pagination?.totalPages??Infinity) || rows.length<50) break;
  }
  const picks=await fetchJson<{catalogs?:Ref[];items?:Ref[]}>('https://publicmetadb.com/api/external/catalogs',options);
  const all=[{id:'resume',name:'Continue watching'},...lists.map(l=>({id:`list:${l.id}`,name:l.name||l.title||`List ${l.id}`})),...(picks?.catalogs??picks?.items??[]).map(p=>({id:`pick:${p.id}`,name:p.name||p.title||`Pick ${p.id}`})),...(ctx.cfg.lists.publicmetadb ?? []).map(id=>({id:`list:${id}`,name:`List ${id}`})),...(ctx.cfg.lists.publicmetadbPicks ?? []).map(id=>({id:`pick:${id}`,name:`Pick ${id}`}))];
  const refs=[...new Map(all.slice().reverse().map(r=>[r.id,r])).values()].reverse();
  return refs.flatMap(r => (['movie','series'] as const).map(type => ({id:`publicmetadb:${type}:${r.id}`,type,name:`PublicMetaDB ${r.name}`,extra:[{name:'skip'}]})));
}

async function catalogItems(ctx: Ctx, id: string, skip: number): Promise<MetaPreview[]> {
  if (!ctx.cfg.keys.publicmetadb) return [];
  const match=/^publicmetadb:(movie|series):(resume|list|pick)(?::(.+))?$/.exec(id);
  if (!match) return [];
  const type=match[1] as 'movie'|'series',kind=match[2],ref=match[3];
  if (kind!=='resume' && !ref) return [];
  if (kind==='resume' && skip>0) return [];
  type Row={tmdb_id:number;media_type:string;season?:number;episode?:number;title?:string};
  const selected:Row[]=[];
  for(let page=1;page<=100;page++) {
    const path=kind==='resume' ? '/resume' : kind==='list' ? `/lists/${encodeURIComponent(ref!)}/items?page=${page}&perPage=20` : `/catalogs/${encodeURIComponent(ref!)}/items?page=${page}`;
    const result=await fetchJson<{items?:Row[];pagination?:{hasNextPage?:boolean;totalPages?:number}}>(`https://publicmetadb.com/api/external${path}`,{headers:{authorization:`Bearer ${ctx.cfg.keys.publicmetadb}`},ttl:60,cacheScope:ctx.scope});
    if (!result) throw new Error('PublicMetaDB catalog unavailable');
    const raw=result.items??[];
    selected.push(...raw.filter(r=>(r.media_type==='movie'?'movie':'series')===type));
    if(kind==='resume'||!raw.length||result.pagination?.hasNextPage===false||page>=(result.pagination?.totalPages??Infinity)||selected.length>=skip+20||kind==='pick'&&page===5)break;
    if(page===100)throw new Error('PublicMetaDB list exceeds the supported window');
  }
  const rows=kind==='resume'?selected:selected.slice(skip,skip+20);
  const items=await mapLimit(rows,4,async row => {
    if(kind!=='resume')return sourcePreview(ctx,type,`tmdb:${row.tmdb_id}`,row.title??'Untitled');
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
