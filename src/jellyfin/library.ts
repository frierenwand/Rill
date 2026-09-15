/**
 * The library as a Jellyfin client sees it: catalogs are CollectionFolders,
 * catalog pages are Items, series unfold into Seasons and Episodes from the
 * meta's video list, and watch state is painted on from the tracker snapshot.
 *
 * A `Library` instance lives for one request. It memoises the catalog list and
 * the watch snapshot for that request only.
 */
import { catalogPage, enabledCatalogDefinitions, type CatalogDefinition } from '../addon/catalogs';
import { trackerTargets } from '../trackers/targets';
import { externalMeta } from '../stremio/client';
import { metaApi } from '../meta/index';
import { passesAgeCap } from '../meta/rating';
import type { IdBundle } from '../meta/types';
import { episodeId as stremioEpisodeId, type IdSource } from '../stremio/ids';
import type { ContentType, Meta, MetaPreview, MetaVideo } from '../stremio/types';
import { trackerApi } from '../trackers/index';
import type { ResumeEntry, WatchSnapshot, WatchedEpisode, WatchedMovie } from '../trackers/types';
import { mapLimit, uniq } from '../util/concurrency';
import { collectionFolder, episodeItem, placeholderSource, runtimeTicks, seasonItem, titleItem, userData, type Dto } from './dto';
import {
  decodeGuid,
  encodeGuid,
  episodeIdOf,
  fnv1a32,
  isAnimeSource,
  parentSeriesOf,
  seasonIdOf,
  stremioIdOfGuid,
  titleRoot,
  viewHash,
  viewIdOf,
  type LabelGuid,
  type TitleGuid,
} from './ids';
import type { JfRequest } from './request';

export const SHELF_LIMIT = 20;
export const SHELF_CONCURRENCY = 4;
const MAX_WINDOW_PAGES = 64;
const WINDOW_HEADROOM = 6;
const UPCOMING_DAYS = 14;

/** The loose shape this module reads off a catalog definition. */
interface CatalogShape {
  id: string;
  type: ContentType;
  name: string;
  group?: string;
  genres?: string[];
  extra?: Array<{ name: string; isRequired?: boolean; options?: string[] }>;
  enabled?: boolean;
}

export interface CatalogRef {
  id: string;
  type: ContentType;
  name: string;
  group: string;
  genres: string[];
  searchable: boolean;
  browsable: boolean;
  viewId: string;
  hash: number;
}

export function collectionTypeOf(type: ContentType): 'movies' | 'tvshows' | null {
  if (type === 'movie') return 'movies';
  if (type === 'series' || type === 'anime') return 'tvshows';
  return null;
}

export type ItemType = 'Movie' | 'Series' | 'Episode' | 'Season';

function kindOfPreview(m: MetaPreview, catType: ContentType): 'movie' | 'series' {
  const t = m.type || catType;
  return t === 'movie' ? 'movie' : 'series';
}

/** Id key used by the watch index: `${source}:${num}`. */
function key(source: IdSource, num: number): string {
  return `${source}:${num}`;
}

export function bundleKeys(ids: IdBundle | Meta['ids'] | undefined): string[] {
  const out: string[] = [];
  if (!ids) return out;
  if (ids.imdb) {
    const n = Number(String(ids.imdb).replace(/^tt/i, ''));
    if (Number.isFinite(n)) out.push(key('imdb', n));
  }
  for (const s of ['tmdb', 'tvdb', 'mal', 'anilist', 'kitsu', 'anidb'] as const) {
    const v = ids[s];
    if (typeof v === 'number' && Number.isFinite(v)) out.push(key(s, v));
  }
  return out;
}

/** Turn a title guid into the IdBundle trackers understand, enriched by meta ids when given. */
export function bundleOf(g: TitleGuid, meta?: Meta | null): IdBundle {
  const b: IdBundle = { ...(meta?.ids ?? {}) };
  if (g.source === 'imdb') b.imdb ??= `tt${String(g.num).padStart(7, '0')}`;
  else if (g.source !== 'other') b[g.source] ??= g.num;
  if (g.kind === 'movie') b.tmdbType ??= 'movie';
  else b.tmdbType ??= 'tv';
  return b;
}

// ---------- Watch index ----------

interface EpisodeMark {
  plays: number;
  lastAt: string;
}

export class WatchIndex {
  readonly localEpisodes=new Map<string,NonNullable<WatchSnapshot['local']>[number]>();
  readonly movies = new Map<string, WatchedMovie>();
  readonly episodes = new Map<string, Map<string, EpisodeMark>>();
  readonly resumeMovies = new Map<string, ResumeEntry>();
  readonly resumeEpisodes = new Map<string, Map<string, ResumeEntry>>();
  readonly shows = new Map<string, WatchSnapshot['shows'][number]>();

  constructor(readonly snapshot: WatchSnapshot) {
    for(const r of snapshot.local ?? []) if(r.kind==='episode') for(const k of bundleKeys(r.ids)) this.localEpisodes.set(`${k}:${r.season ?? 1}:${r.episode}`,r);
    for (const m of snapshot.movies ?? []) for (const k of bundleKeys(m.ids)) this.movies.set(k, m);
    for (const e of snapshot.episodes ?? []) {
      for (const k of bundleKeys(e.ids)) {
        let map = this.episodes.get(k);
        if (!map) this.episodes.set(k, (map = new Map()));
        for (const ek of episodeKeys(e.season, e.episode)) map.set(ek, { plays: e.plays, lastAt: e.lastAt });
      }
    }
    for (const r of snapshot.resume ?? []) {
      for (const k of bundleKeys(r.ids)) {
        if (r.kind === 'movie') {
          this.resumeMovies.set(k, r);
          continue;
        }
        let map = this.resumeEpisodes.get(k);
        if (!map) this.resumeEpisodes.set(k, (map = new Map()));
        for (const ek of episodeKeys(r.season, r.episode)) map.set(ek, r);
      }
    }
    for (const s of snapshot.shows ?? []) for (const k of bundleKeys(s.ids)) this.shows.set(k, s);
  }

  movie(keys: string[]): { watched?: WatchedMovie; resume?: ResumeEntry } {
    const out: { watched?: WatchedMovie; resume?: ResumeEntry } = {};
    for (const k of keys) {
      out.watched ??= this.movies.get(k);
      out.resume ??= this.resumeMovies.get(k);
    }
    return out;
  }

  episode(keys: string[], season: number, episode: number): { watched?: EpisodeMark; resume?: ResumeEntry } {
    const out: { watched?: EpisodeMark; resume?: ResumeEntry } = {};
    for (const k of keys) {
      const w = this.episodes.get(k);
      const r = this.resumeEpisodes.get(k);
      for (const ek of episodeKeys(season, episode)) {
        out.watched ??= w?.get(ek);
        out.resume ??= r?.get(ek);
      }
    }
    return out;
  }

  localEpisode(keys:string[],season:number,episode:number): {watched?:EpisodeMark;resume?:ResumeEntry}|null {
    for(const k of keys) {
      const row=this.localEpisodes.get(`${k}:${season}:${episode}`);
      if(row) return {watched:row.watched ? {plays:1,lastAt:row.at}:undefined,resume:row.progress>0 || (row.positionMs ?? 0)>0 ? {...row,kind:'episode'}:undefined};
    }
    return null;
  }

  show(keys: string[]): WatchSnapshot['shows'][number] | undefined {
    for (const k of keys) {
      const s = this.shows.get(k);
      if (s) return s;
    }
    return undefined;
  }

  /** Any tracker knowledge of this show at all? Used to skip lookups. */
  knowsShow(keys: string[]): boolean {
    return keys.some((k) => this.episodes.has(k) || this.resumeEpisodes.has(k) || this.shows.has(k));
  }
}

/**
 * Anime trackers count absolute episodes with no season, or season 1; TV
 * trackers count broadcast seasons. Both spellings are indexed so a match is
 * found whichever way the meta numbers its videos.
 */
function episodeKeys(season: number | undefined, episode: number | undefined): string[] {
  const e = episode ?? 0;
  const keys = [`${season ?? 1}:${e}`];
  if (season === undefined || season === 1) keys.push(`abs:${e}`);
  return keys;
}

// ---------- Shows ----------

export interface EpisodeView {
  season: number;
  episode: number;
  video: MetaVideo;
  id: string;
  seasonId: string;
}

export interface SeasonView {
  number: number;
  id: string;
  episodes: EpisodeView[];
}

export interface Show {
  guid: TitleGuid;
  id: string;
  meta: Meta;
  seasons: SeasonView[];
  episodes: EpisodeView[];
  keys: string[];
}

/**
 * Group a meta's videos into seasons. Anime metas number episodes absolutely
 * with no season; those become Season 1 unless the meta carries seasons.
 */
export function episodesOf(meta: Meta, series: TitleGuid): { seasons: SeasonView[]; episodes: EpisodeView[] } {
  const videos = Array.isArray(meta.videos) ? meta.videos : [];
  const seen = new Set<string>();
  const perSeasonCounter = new Map<number, number>();
  const episodes: EpisodeView[] = [];
  for (const v of videos) {
    if (!v || typeof v !== 'object') continue;
    const season = Number.isInteger(v.season) ? Number(v.season) : 1;
    const next = (perSeasonCounter.get(season) ?? 0) + 1;
    perSeasonCounter.set(season, next);
    const episode = Number.isInteger(v.episode) ? Number(v.episode) : next;
    const k = `${season}:${episode}`;
    if (seen.has(k)) continue;
    seen.add(k);
    episodes.push({ season, episode, video: v, id: episodeIdOf(series, season, episode), seasonId: seasonIdOf(series, season) });
  }
  episodes.sort((a, b) => a.season - b.season || a.episode - b.episode);
  const bySeason = new Map<number, EpisodeView[]>();
  for (const e of episodes) {
    let list = bySeason.get(e.season);
    if (!list) bySeason.set(e.season, (list = []));
    list.push(e);
  }
  const seasons = [...bySeason.entries()].sort((a, b) => a[0] - b[0]).map(([number, eps]) => ({ number, id: seasonIdOf(series, number), episodes: eps }));
  return { seasons, episodes };
}

export function guidOfPreview(m: MetaPreview, catType: ContentType): TitleGuid | null {
  const root = titleRoot(String(m.id ?? ''));
  if (!root) return null;
  const kind = kindOfPreview(m, catType);
  return { kind, source: root.source, num: root.num, anime: catType === 'anime' || m.type === 'anime' || isAnimeSource(root.source) };
}

function metaTypeFor(g: TitleGuid): ContentType {
  if (g.anime) return 'anime';
  return g.kind === 'movie' ? 'movie' : 'series';
}

function isReleased(v: MetaVideo): boolean {
  if (!v.released) return true;
  const t = Date.parse(v.released);
  return !Number.isFinite(t) || t <= Date.now();
}

// ---------- The per-request library ----------

export class Library {
  private episodeBook=new Map<string,{show:Show;episode:EpisodeView}>();
  private episodeStates=new Map<string,Promise<{watched?:EpisodeMark;resume?:ResumeEntry}>>();
  private catalogsPromise?: Promise<CatalogRef[]>;
  private watchPromise?: Promise<WatchIndex>;
  private readonly metas = new Map<string, Promise<Meta | null>>();
  /** Item guid -> every id key the item is known by (from meta.ids). */
  private readonly keyBook = new Map<string, string[]>();

  constructor(readonly jf: JfRequest) {}

  get ctx() {
    return this.jf.ctx;
  }

  // ----- catalogs / views -----

  catalogs(): Promise<CatalogRef[]> {
    this.catalogsPromise ??= (async () => {
      let defs: CatalogDefinition[] = [];
      try {
        defs = (await enabledCatalogDefinitions(this.ctx)) ?? [];
      } catch {
        defs = [];
      }
      const toggles = this.ctx.cfg.catalogs;
      const order = new Map(toggles.map((t, i) => [t.id, i]));
      const refs: CatalogRef[] = [];
      for (const raw of defs) {
        const d = raw as unknown as CatalogShape;
        if (!d?.id || !d.type) continue;
        if (this.ctx.profile?.catalogs?.length && !this.ctx.profile.catalogs.includes(d.id)) continue;
        const toggle = toggles.find((t) => t.id === d.id);
        const enabled = typeof d.enabled === 'boolean' ? d.enabled : toggle ? toggle.enabled : true;
        if (!enabled) continue;
        const extra = Array.isArray(d.extra) ? d.extra : [];
        const genreExtra = extra.find((e) => e?.name === 'genre');
        refs.push({
          id: d.id,
          type: d.type,
          name: toggle?.name || d.name || d.id,
          group: d.group ?? '',
          genres: (Array.isArray(d.genres) ? d.genres : genreExtra?.options ?? []).filter((g) => typeof g === 'string' && g && g !== 'None'),
          searchable: extra.some((e) => e?.name === 'search'),
          browsable: !extra.some((e) => e?.isRequired),
          viewId: viewIdOf(d.type, d.id),
          hash: viewHash(d.type, d.id),
        });
      }
      refs.sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9));
      return refs;
    })();
    return this.catalogsPromise;
  }

  async browsable(): Promise<CatalogRef[]> {
    return (await this.catalogs()).filter((c) => c.browsable);
  }

  async views(): Promise<Dto[]> {
    return (await this.browsable()).map((c) => collectionFolder(c.viewId, this.jf.who, c.name, collectionTypeOf(c.type)));
  }

  async viewOf(g: LabelGuid | null | undefined): Promise<CatalogRef | null> {
    if (!g || g.kind !== 'view') return null;
    return (await this.catalogs()).find((c) => c.hash === g.hash) ?? null;
  }

  /** Genre name from a misc/genre guid, matched against known genres, else the embedded hint. */
  async genreNameOf(g: LabelGuid): Promise<string> {
    const all = new Set<string>();
    for (const c of await this.catalogs()) for (const name of c.genres) all.add(name);
    for (const name of all) if (fnv1a32(name) === g.hash) return name;
    return g.hint;
  }

  // ----- catalog windows -----

  /**
   * Catalogs page by `skip` and never say how long they are. A window is filled
   * page by page until it has enough, and `hasMore` is whether the last page
   * came back full, so a client keeps asking until a short page ends it.
   */
  async window(cat: CatalogRef, start: number, limit: number, extra: { search?: string; genre?: string } = {}): Promise<{ items: MetaPreview[]; hasMore: boolean }> {
    const collected: MetaPreview[] = [];
    const seen = new Set<string>();
    let skip = Math.max(0, start);
    let pages = 0;
    let exhausted = false;
    let pageSize = 0;
    while (collected.length < limit && pages < Math.min(MAX_WINDOW_PAGES, Math.ceil(limit / Math.max(1, pageSize)) + WINDOW_HEADROOM)) {
      let page: MetaPreview[] = [];
      let consumed = 0;
      try {
        const result = await catalogPage(this.ctx, cat.type, cat.id, { ...extra, skip: skip || undefined });
        page = result.items;
        consumed = result.consumed;
      } catch {
        page = [];
      }
      pages++;
      if (!consumed) {
        exhausted = true;
        break;
      }
      pageSize = Math.max(pageSize, consumed);
      for (const m of page) {
        const id = String(m?.id ?? '');
        if (!id || seen.has(id)) continue;
        seen.add(id);
        if (this.allowed((m as Meta).certification)) collected.push(m);
      }
      skip += consumed;
      if (consumed < pageSize) {
        exhausted = true;
        break;
      }
    }
    return { items: collected.slice(0, limit), hasMore: !exhausted };
  }

  // ----- items from previews / metas -----

  allowed(cert: string | undefined | null): boolean {
    const cap = this.ctx.cfg.ageCap;
    if (!cap) return true;
    try {
      return passesAgeCap(cert ?? undefined, cap);
    } catch {
      return true;
    }
  }

  /** Movie/Series item for a preview from a catalog listing. */
  previewItem(m: MetaPreview, cat: CatalogRef, parentId: string | null): Dto | null {
    const g = guidOfPreview(m, cat.type);
    if (!g) return null;
    const id = encodeGuid(g);
    this.noteKeys(id, g, (m as Meta).ids);
    const item = titleItem(m, g, id, this.jf.who, { parentId });
    if (g.kind === 'movie') item.MediaSources = [placeholderSource(id)];
    return item;
  }

  /** Movie/Series item from a full meta. */
  titleItemOf(meta: Meta, g: TitleGuid, parentId: string | null = null): Dto {
    const id = encodeGuid(g);
    this.noteKeys(id, g, meta.ids);
    const opts: { parentId: string | null; seasonCount?: number; episodeCount?: number } = { parentId };
    if (g.kind === 'series') {
      const { seasons, episodes } = episodesOf(meta, g);
      opts.seasonCount = seasons.length;
      opts.episodeCount = episodes.length;
    }
    const item = titleItem(meta, g, id, this.jf.who, opts);
    if (g.kind === 'movie') item.MediaSources = [placeholderSource(id)];
    return item;
  }

  private noteKeys(id: string, g: TitleGuid, ids?: Meta['ids']): void {
    const keys = uniq([key(g.source, g.num), ...bundleKeys(ids)], (k) => k);
    this.keyBook.set(id, keys);
  }

  keysOf(id: string, g?: TitleGuid | null): string[] {
    const known = this.keyBook.get(id);
    if (known) return known;
    return g ? [key(g.source, g.num)] : [];
  }

  // ----- metas -----

  meta(g: TitleGuid): Promise<Meta | null> {
    const title = g.kind === 'movie' ? g : parentSeriesOf(g);
    const stremioId = stremioIdOfGuid(title);
    const k = `${metaTypeFor(title)}:${stremioId}`;
    let p = this.metas.get(k);
    if (!p) {
      p = (async () => {
        const type = metaTypeFor(title);
        let meta: Meta | null = null;
        try {
          meta = await metaApi.resolveMeta(this.ctx, type, stremioId);
          if (!meta && type === 'anime') meta = await metaApi.resolveMeta(this.ctx, title.kind === 'movie' ? 'movie' : 'series', stremioId);
        } catch {
          meta = null;
        }
        if (!meta && this.ctx.cfg.addons.meta.length) {
          meta = await externalMeta(this.ctx, type, stremioId).catch(() => null);
          if (!meta && type === 'anime') meta = await externalMeta(this.ctx, title.kind === 'movie' ? 'movie' : 'series', stremioId).catch(() => null);
        }
        if (meta && !this.allowed(meta.certification)) return null;
        return meta;
      })();
      this.metas.set(k, p);
    }
    return p;
  }

  async show(g: TitleGuid): Promise<Show | null> {
    const series = parentSeriesOf(g);
    const meta = await this.meta(series);
    if (!meta) return null;
    const id = encodeGuid(series);
    this.noteKeys(id, series, meta.ids);
    const { seasons, episodes } = episodesOf(meta, series);
    return { guid: series, id, meta, seasons, episodes, keys: this.keysOf(id, series) };
  }

  /** The episode view a guid points at: exact numbering first, then absolute numbering folded into season 1. */
  findEpisode(show: Show, g: TitleGuid): EpisodeView | undefined {
    if (g.kind !== 'episode' || g.episode === undefined) return undefined;
    const s = g.season ?? 1;
    return show.episodes.find((e) => e.season === s && e.episode === g.episode) ?? (s === 1 ? show.episodes.find((e) => e.episode === g.episode && show.seasons.length === 1) : undefined);
  }

  /** Stremio id a stream addon wants for an episode: the video's own id when the meta has one. */
  streamIdOf(show: Show | null, g: TitleGuid): string {
    if (g.kind === 'movie' || g.kind === 'series') return stremioIdOfGuid(g);
    const ep = show ? this.findEpisode(show, g) : undefined;
    if (ep?.video?.id) return String(ep.video.id);
    return stremioEpisodeId(stremioIdOfGuid(g), g.season, g.episode ?? 1);
  }

  streamTypeOf(g: TitleGuid): ContentType {
    return g.kind === 'movie' ? 'movie' : g.anime ? 'anime' : 'series';
  }

  seasonItems(show: Show): Dto[] {
    return show.seasons.map((s) =>
      seasonItem({ id: s.id, seriesId: show.id, seriesName: show.meta.name, number: s.number, episodeCount: s.episodes.length, poster: show.meta.poster }, this.jf.who),
    );
  }

  episodeItems(show: Show, season?: number): Dto[] {
    const rt = runtimeTicks(show.meta.runtime);
    return show.episodes
      .filter((e) => season === undefined || e.season === season)
      .map((e) => this.episodeItem(show, e, rt));
  }

  episodeItem(show: Show, e: EpisodeView, rt: number | null = runtimeTicks(show.meta.runtime)): Dto {
    const item = episodeItem(
      {
        id: e.id,
        seriesId: show.id,
        seasonId: e.seasonId,
        seriesName: show.meta.name,
        season: e.season,
        episode: e.episode,
        video: e.video,
        certification: show.meta.certification,
        runtimeTicks: rt,
        hasBackdrop: Boolean(show.meta.background),
        hasLogo: Boolean(show.meta.logo),
      },
      this.jf.who,
    );
    item.MediaSources = [placeholderSource(e.id)];
    this.keyBook.set(e.id, show.keys);
    this.episodeBook.set(e.id,{show,episode:e});
    return item;
  }

  // ----- watch state -----

  async episodeState(idx:WatchIndex,show:Show,episode:EpisodeView): Promise<{watched?:EpisodeMark;resume?:ResumeEntry}> {
    const local=idx.localEpisode(show.keys,episode.season,episode.episode);
    if(local) return local;
    const cached=this.episodeStates.get(episode.id);
    if(cached) return cached;
    const task=(async()=>{
      const primary=trackerApi.primary(this.ctx);
      if(!primary) return idx.episode(show.keys,episode.season,episode.episode);
      const source=show.guid.source;
      const numbering=episode.video.numbering ?? (isAnimeSource(source) ? 'anime' : source==='tvdb' ? 'tvdb' : source==='tmdb' ? 'tmdb' : this.ctx.cfg.providers.series==='tvdb' ? 'tvdb':'tmdb');
      try {
        const queries=await trackerTargets(this.ctx,{kind:'episode' as const,watched:true,ids:bundleOf(show.guid,show.meta),season:episode.season,episode:episode.episode,numbering,animeEpisode:episode.video.trackerAnime},primary.name);
        if(!queries.length) return {};
        const states=queries.map(q=>idx.episode(bundleKeys(q.ids),q.season ?? 1,q.episode ?? 0));
        const watched=states.every(s=>s.watched) ? {plays:Math.min(...states.map(s=>s.watched!.plays)),lastAt:states.map(s=>s.watched!.lastAt).sort().at(-1)!}:undefined;
        return {watched,resume:states.find(s=>s.resume)?.resume};
      } catch { return {}; } // An unresolved mapping is not evidence that another entry was watched.
    })();
    this.episodeStates.set(episode.id,task);
    return task;
  }

  watch(): Promise<WatchIndex> {
    this.watchPromise ??= (async () => {
      try {
        return new WatchIndex(await trackerApi.snapshot(this.ctx));
      } catch (error) {
        if (this.ctx.env.DB) throw error;
        return new WatchIndex({ movies: [], episodes: [], shows: [], resume: [], fetchedAt: new Date().toISOString() });
      }
    })();
    return this.watchPromise;
  }

  /**
   * Paint UserData on built items from the tracker snapshot. Series and
   * seasons aggregate their episodes when the show is loaded; otherwise they
   * keep the empty defaults rather than claiming zero unplayed.
   */
  async decorate(items: Dto[], shows: Map<string, Show> = new Map()): Promise<Dto[]> {
    if (!items.length) return items;
    const idx = await this.watch();
    for (const item of items) {
      const id = String(item.Id ?? '');
      const g = decodeGuid(id);
      if (!g || g.kind === 'view' || g.kind === 'misc') continue;
      const keys = this.keysOf(id, g);
      const rt = typeof item.RunTimeTicks === 'number' ? item.RunTimeTicks : null;
      if (g.kind === 'movie') {
        const st = idx.movie(keys);
        if (!st.watched && !st.resume) continue;
        item.UserData = userData(id, {
          played: Boolean(st.watched),
          playCount: st.watched?.plays ?? 0,
          positionTicks: st.resume?.positionMs !== undefined ? st.resume.positionMs * 10_000 : st.resume && rt ? Math.round((rt * st.resume.progress) / 100) : 0,
          runtimeTicks: rt,
          lastPlayed: st.watched?.lastAt ?? st.resume?.at,
        });
        continue;
      }
      if (g.kind === 'episode') {
        const known=this.episodeBook.get(id);
        const st = known ? await this.episodeState(idx,known.show,known.episode) : idx.episode(keys, g.season ?? 1, g.episode ?? 0);
        if (!st.watched && !st.resume) continue;
        item.UserData = userData(id, {
          played: Boolean(st.watched),
          playCount: st.watched?.plays ?? 0,
          positionTicks: st.resume?.positionMs !== undefined ? st.resume.positionMs * 10_000 : st.resume && rt ? Math.round((rt * st.resume.progress) / 100) : 0,
          runtimeTicks: rt,
          lastPlayed: st.watched?.lastAt ?? st.resume?.at,
        });
        continue;
      }
      // Series / season: aggregate over the show's released episodes when we have it.
      const show = shows.get(g.kind === 'series' ? id : encodeGuid(parentSeriesOf(g)));
      if (!show) continue;
      const pool = show.episodes.filter((e) => isReleased(e.video) && (g.kind === 'series' || e.season === g.season));
      if (!pool.length) continue;
      let watched = 0;
      let lastAt = '';
      for (const e of pool) {
        const st = await this.episodeState(idx,show,e);
        if (st.watched) {
          watched++;
          if (st.watched.lastAt > lastAt) lastAt = st.watched.lastAt;
        }
      }
      const unplayed = pool.length - watched;
      item.UserData = userData(id, { played: unplayed === 0, playCount: unplayed === 0 ? 1 : 0, unplayed, lastPlayed: lastAt || undefined });
      (item.UserData as Dto).PlayedPercentage = (watched / pool.length) * 100;
    }
    return items;
  }

  // ----- shelves -----

  /** Resolve a tracker id bundle to a series/movie guid via the meta agent's canonical id. */
  private guidOfBundle(ids: IdBundle, kind: 'movie' | 'series'): TitleGuid | null {
    let canonical: string | null = null;
    try {
      canonical = metaApi.canonicalId(ids, kind);
    } catch {
      canonical = null;
    }
    const root = canonical ? titleRoot(canonical) : null;
    if (root) return { kind, source: root.source, num: root.num, anime: isAnimeSource(root.source) };
    for (const k of bundleKeys(ids)) {
      const [source, num] = k.split(':') as [IdSource, string];
      return { kind, source, num: Number(num), anime: isAnimeSource(source) };
    }
    return null;
  }

  async resumeShelf(start: number, limit: number): Promise<{ items: Dto[]; total: number }> {
    const idx = await this.watch();
    const rows = [...(idx.snapshot.resume ?? [])].filter((r) => (r.progress > 0 || (r.positionMs ?? 0) > 0) && r.progress < 100).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    const page = rows.slice(start, start + Math.min(limit, SHELF_LIMIT));
    const shows = new Map<string, Show>();
    const built = await mapLimit(page, SHELF_CONCURRENCY, async (row): Promise<Dto | null> => {
      const g = this.guidOfBundle(row.ids, row.kind === 'movie' ? 'movie' : 'series');
      if (!g) return null;
      if (g.kind === 'movie') {
        const meta = await this.meta(g);
        return meta ? this.titleItemOf(meta, g) : null;
      }
      const show = await this.show(g);
      if (!show) return null;
      shows.set(show.id, show);
      let ep = this.findEpisode(show, { ...g, kind: 'episode', season: row.season, episode: row.episode });
      const local=idx.localEpisode(show.keys,row.season ?? 1,row.episode ?? 0);
      if (!local) {
        // Tracker coordinates may be TVDB while the configured metadata uses TMDB/anime.
        // Find the display episode whose projected resume points back to this row.
        if (!ep || (await this.episodeState(idx,show,ep)).resume !== row) {
          ep=undefined;
          for(const candidate of show.episodes) if ((await this.episodeState(idx,show,candidate)).resume===row) {ep=candidate;break;}
        }
      }
      return ep ? this.episodeItem(show, ep) : null;
    });
    const items = built.filter((x): x is Dto => Boolean(x));
    await this.decorate(items, shows);
    return { items, total: rows.length };
  }

  async nextUpShelf(start: number, limit: number, opts: { includeResumable: boolean; includeRewatching: boolean }): Promise<{ items: Dto[]; total: number }> {
    const idx = await this.watch();
    const shows = [...(idx.snapshot.shows ?? [])].sort((a, b) => Date.parse(b.lastAt) - Date.parse(a.lastAt));
    const page = shows.slice(start, start + Math.min(limit, SHELF_LIMIT));
    const loaded = new Map<string, Show>();
    const built = await mapLimit(page, SHELF_CONCURRENCY, async (row): Promise<Dto | null> => {
      const g = this.guidOfBundle(row.ids, 'series');
      if (!g) return null;
      const show = await this.show(g);
      if (!show) return null;
      loaded.set(show.id, show);
      const released = show.episodes.filter(e => isReleased(e.video) && e.season>0);
      const states=await mapLimit(released,8,e=>this.episodeState(idx,show,e));
      let cursor=-1,lastAt='';
      for(let i=0;i<states.length;i++) {
        const watched=states[i].watched;
        if(watched && watched.lastAt>=lastAt) {cursor=i;lastAt=watched.lastAt;}
      }
      const nextIndex=states.findIndex((s,i)=>i>cursor && !s.watched);
      const next=nextIndex>=0 ? released[nextIndex]:undefined;
      if (!next) {
        if (!opts.includeRewatching) return null;
        return released.length ? this.episodeItem(show,released[0]):null;
      }
      if (!opts.includeResumable && states[nextIndex].resume) return null;
      return this.episodeItem(show, next);
    });
    const items = built.filter((x): x is Dto => Boolean(x));
    await this.decorate(items, loaded);
    return { items, total: shows.length };
  }

  async upcomingShelf(start: number, limit: number): Promise<{ items: Dto[]; total: number }> {
    const idx = await this.watch();
    const followed = new Map<string, IdBundle>();
    for (const s of idx.snapshot.shows ?? []) followed.set(bundleKeys(s.ids)[0] ?? JSON.stringify(s.ids), s.ids);
    for (const r of idx.snapshot.resume ?? []) if (r.kind === 'episode') followed.set(bundleKeys(r.ids)[0] ?? JSON.stringify(r.ids), r.ids);
    const now = Date.now();
    const horizon = now + UPCOMING_DAYS * 86_400_000;
    const list = [...followed.values()].slice(0, SHELF_LIMIT);
    const episodes: Array<{ at: number; item: Dto }> = [];
    await mapLimit(list, SHELF_CONCURRENCY, async (ids) => {
      const g = this.guidOfBundle(ids, 'series');
      const show = g ? await this.show(g) : null;
      if (!show) return;
      for (const e of show.episodes) {
        const at = Date.parse(e.video.released ?? '');
        if (Number.isFinite(at) && at >= now && at <= horizon) episodes.push({ at, item: this.episodeItem(show, e) });
      }
    });
    episodes.sort((a, b) => a.at - b.at);
    const items = episodes.slice(start, start + limit).map((e) => e.item);
    return { items, total: episodes.length };
  }

  async latest(cat: CatalogRef, limit: number): Promise<Dto[]> {
    const { items } = await this.window(cat, 0, limit);
    const built = items.map((m) => this.previewItem(m, cat, cat.viewId)).filter((x): x is Dto => Boolean(x));
    return this.decorate(built);
  }

  /** Titles sharing the item's first genre from a catalog of the same type that filters by genre. */
  async similar(g: TitleGuid, limit: number): Promise<Dto[]> {
    const meta = await this.meta(g);
    const genre = meta?.genres?.find((x) => typeof x === 'string' && x);
    if (!meta || !genre) return [];
    const wantType: ContentType = g.anime ? 'anime' : g.kind === 'movie' ? 'movie' : 'series';
    const cats = await this.browsable();
    const cat = cats.find((c) => c.type === wantType && c.genres.includes(genre)) ?? cats.find((c) => c.type === wantType && c.genres.length) ?? cats.find((c) => c.type === wantType);
    if (!cat) return [];
    const { items } = await this.window(cat, 0, limit + 1, cat.genres.includes(genre) ? { genre } : {});
    const selfId = stremioIdOfGuid(g);
    const built = items
      .filter((m) => String(m.id) !== selfId)
      .slice(0, limit)
      .map((m) => this.previewItem(m, cat, null))
      .filter((x): x is Dto => Boolean(x));
    return this.decorate(built);
  }

  /**
   * Search across movie and series metas, interleaving the ranked lists so one
   * provider's weak tail does not bury another's best hit. Titles are de-duped
   * by id and by name|year since the same title reaches us under several ids.
   */
  async search(term: string, wanted: Set<ItemType> | null, limit: number): Promise<Dto[]> {
    const types: Array<{ type: ContentType; kind: 'movie' | 'series' }> = [];
    if (!wanted || wanted.has('Movie')) types.push({ type: 'movie', kind: 'movie' });
    if (!wanted || wanted.has('Series')) types.push({ type: 'series', kind: 'series' });
    if (!types.length) return [];
    const pages = await Promise.all(
      types.map(async (t) => {
        try {
          return { t, items: (await metaApi.searchMeta(this.ctx, t.type, term, { limit })) ?? [] };
        } catch {
          return { t, items: [] as MetaPreview[] };
        }
      }),
    );
    const seen = new Set<string>();
    const out: Dto[] = [];
    const depth = Math.max(0, ...pages.map((p) => p.items.length));
    for (let rank = 0; rank < depth && out.length < limit; rank++) {
      for (const page of pages) {
        const m = page.items[rank];
        if (!m?.id) continue;
        const nameKey = `${String(m.name ?? '').toLowerCase()}|${String(m.year ?? m.releaseInfo ?? '').slice(0, 4)}`;
        if (seen.has(String(m.id)) || seen.has(nameKey)) continue;
        seen.add(String(m.id));
        seen.add(nameKey);
        if (!this.allowed((m as Meta).certification)) continue;
        const fakeCat: CatalogRef = { id: 'search', type: page.t.type, name: 'Search', group: '', genres: [], searchable: true, browsable: false, viewId: '', hash: 0 };
        const item = this.previewItem(m, fakeCat, null);
        if (item) out.push(item);
      }
    }
    return this.decorate(out);
  }
}


export function includeTypesOf(list: string[]): Set<ItemType> | null {
  const wanted = new Set<ItemType>();
  for (const t of list) if (t === 'Movie' || t === 'Series' || t === 'Episode' || t === 'Season') wanted.add(t);
  return wanted.size ? wanted : null;
}

export function filterByType(items: Dto[], wanted: Set<ItemType> | null): Dto[] {
  if (!wanted) return items;
  return items.filter((i) => wanted.has(i.Type as ItemType));
}
