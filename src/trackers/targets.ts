import type { Ctx } from '../context';
import type { TrackerName } from '../config/schema';
import { loadEpisodeMaps, toAnimeEpisodes, toExternalEpisodes } from '../meta/anime/episode-map';
import { mappingForAnimeId } from '../meta/anime/mapping';
import type { IdBundle } from '../meta/types';
import type { MarkEvent, ScrobbleEvent } from './types';

type Event = ScrobbleEvent | MarkEvent;
export async function trackerTargets<T extends Event>(ctx: Ctx, ev: T, name: TrackerName): Promise<T[]> {
  if (ev.kind !== 'episode' || !ev.numbering || !ev.episode) return [ev];
  const animeSink = name === 'mal' || name === 'anilist';
  if ('action' in ev && ((animeSink && (ev.action !== 'stop' || ev.progress < 90)) || (name === 'publicmetadb' && ev.action !== 'stop'))) return [];
  if (!animeSink && ev.animeEpisode) {
    return trackerTargets(ctx, { ...ev, ids: ev.animeEpisode, numbering: 'anime', season: 1, episode: ev.animeEpisode.episode, animeEpisode: undefined }, name);
  }
  if (animeSink && ev.animeEpisode) return [{...ev,ids:ev.animeEpisode,season:1,episode:ev.animeEpisode.episode}];
  if (ev.numbering === 'anime') {
    const entry = await mappingForAnimeId(ctx, ev.ids);
    const animeIds = { ...entry, ...ev.ids };
    if (animeSink) return [{ ...ev, ids: animeIds }];
    if (!animeIds.anidb) throw new Error('Anime episode has no AniDB mapping');
    const rows = await loadEpisodeMaps(ctx);
    const space = name === 'publicmetadb' ? 'tmdb' : 'tvdb';
    const mapped = toExternalEpisodes(rows, space, { anidb: animeIds.anidb, season: ev.season ?? 1, episode: ev.episode });
    if (!mapped.length) throw new Error(`No ${space.toUpperCase()} episode mapping`);
    return mapped.map(m => ({ ...ev, ids: { [space]: m.id, ...(space === 'tmdb' ? { tmdbType: 'tv' as const } : {}) }, season: m.season, episode: m.episode }));
  }
  if (!animeSink) {
    if (name !== 'publicmetadb' && ev.numbering === 'tmdb' && ev.ids.tmdb) {
      const rows=await loadEpisodeMaps(ctx);
      if (rows.some(r=>r.tmdb===ev.ids.tmdb)) {
        const anime=toAnimeEpisodes(rows,'tmdb',{id:ev.ids.tmdb,season:ev.season ?? 1,episode:ev.episode});
        const mapped=anime.flatMap(a=>toExternalEpisodes(rows,'tvdb',a));
        if (!mapped.length) throw new Error('No TVDB episode mapping');
        const unique=new Map(mapped.map(m=>[`${m.id}:${m.season}:${m.episode}`,m]));
        return [...unique.values()].map(m=>({...ev,ids:{tvdb:m.id},season:m.season,episode:m.episode,numbering:'tvdb'}));
      }
    }
    if (name === 'publicmetadb' && ev.numbering === 'tvdb' && ev.ids.tvdb) {
      const rows = await loadEpisodeMaps(ctx);
      if (rows.some(r => r.tvdb === ev.ids.tvdb)) {
        const anime = toAnimeEpisodes(rows,'tvdb',{id:ev.ids.tvdb,season:ev.season ?? 1,episode:ev.episode});
        const mapped = anime.flatMap(a => toExternalEpisodes(rows,'tmdb',a));
        if (!mapped.length) throw new Error('No TMDB episode mapping');
        const unique = new Map(mapped.map(m => [`${m.id}:${m.season}:${m.episode}`,m]));
        return [...unique.values()].map(m => ({...ev,ids:{tmdb:m.id,tmdbType:'tv' as const},season:m.season,episode:m.episode,numbering:'tmdb'}));
      }
    }
    const anchor = ev.ids[ev.numbering];
    if (anchor && name !== 'publicmetadb') return [{ ...ev, ids: { [ev.numbering]: anchor, ...(ev.numbering === 'tmdb' ? { tmdbType: 'tv' as const } : {}) } }];
    return [ev];
  }
  const space = ev.numbering;
  const id = ev.ids[space];
  if (!id) return [];
  const rows = await loadEpisodeMaps(ctx);
  const mapped = toAnimeEpisodes(rows, space, { id, season: ev.season ?? 1, episode: ev.episode });
  const results: T[] = [];
  for (const anime of mapped) {
    if (anime.season !== 1) continue;
    const ids = await mappingForAnimeId(ctx, { anidb: anime.anidb });
    if (!ids) continue;
    const exact: IdBundle = { mal: ids.mal, anilist: ids.anilist, kitsu: ids.kitsu, anidb: anime.anidb };
    results.push({ ...ev, ids: exact, animeEpisode: { ...exact, episode: anime.episode }, season: 1, episode: anime.episode });
  }
  return results;
}
