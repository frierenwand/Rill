/**
 * Episode lists for anime metas.
 *
 * Anime ids carry a single absolute episode number (mal:123:5). Jikan, Kitsu and AniList each
 * know a different slice of an episode (Jikan: titles / air dates / filler flags, Kitsu:
 * thumbnails / synopses, AniList: streaming thumbnails / future airing times); rows from every
 * provider that answered are merged per episode number.
 *
 * IMDb series ids (tt123:2:5) map to whole franchises in Fribb. Those are laid out season by
 * season: Fribb's `season.tvdb` pairs each MAL entry with a TVDB/IMDb season, and when Fribb
 * lacks season info the TV entries are paired one-to-one with seasons in order.
 */
import type { Ctx } from '../../context';
import type { MetaVideo } from '../../stremio/types';
import { episodeId } from '../../stremio/ids';
import { mapLimit } from '../../util/concurrency';
import { anilistDetails, anilistEpisodeRows, type AlMedia } from './anilist';
import { kitsuEpisodeRows, kitsuEpisodes, type KitsuAnimeAttrs } from './kitsu';
import { malDetails, malEpisodeRows, malEpisodes, type JikanAnime } from './mal';
import { sortFranchise, type AnimeMapping } from './mapping';
import { isoDate } from './shared';

export interface EpisodeRow {
  episode: number;
  title?: string;
  thumbnail?: string;
  released?: string;
  overview?: string;
  runtime?: number;
  filler?: boolean;
  recap?: boolean;
}

export interface EpisodeSources {
  /** Rows in precedence order: the first row that has a field wins. */
  rows: EpisodeRow[][];
  /** Known episode count (from the title record) — pads the list when providers stop short. */
  count?: number | null;
  /** First air date, used to estimate weekly dates for episodes no provider dated. */
  firstAired?: string;
  /** Roughly weekly show? Enables date estimation. */
  weekly?: boolean;
  /** Fallback thumbnail (series background) for undated / unaired entries. */
  fallbackThumb?: string;
}

export interface BuiltEpisodes { videos: MetaVideo[]; hasFuture: boolean; lastAired?: string }

const WEEK_MS = 7 * 24 * 3600 * 1000;

/** Merge provider rows into MetaVideos for a single anime title id (mal:/anilist:/kitsu:). */
export function assembleEpisodes(titleId: string, src: EpisodeSources, season?: number): BuiltEpisodes {
  const merged = new Map<number, EpisodeRow>();
  for (const list of src.rows) {
    for (const r of list) {
      if (!Number.isFinite(r.episode) || r.episode <= 0) continue;
      const cur = merged.get(r.episode) || { episode: r.episode };
      if (!cur.title && r.title) cur.title = r.title;
      if (!cur.thumbnail && r.thumbnail) cur.thumbnail = r.thumbnail;
      if (!cur.released && r.released) cur.released = r.released;
      if (!cur.overview && r.overview) cur.overview = r.overview;
      if (!cur.runtime && r.runtime) cur.runtime = r.runtime;
      if (r.filler) cur.filler = true;
      if (r.recap) cur.recap = true;
      merged.set(r.episode, cur);
    }
  }
  const known = merged.size ? Math.max(...merged.keys()) : 0;
  const total = Math.max(known, src.count && src.count > 0 ? src.count : 0);
  const now = Date.now();
  const first = src.firstAired ? new Date(src.firstAired).getTime() : NaN;
  let hasFuture = false;
  let lastAired: string | undefined;
  const videos: MetaVideo[] = [];
  for (let n = 1; n <= total; n++) {
    const r = merged.get(n) || { episode: n };
    let released = r.released;
    if (!released && src.weekly && Number.isFinite(first)) released = isoDate(first + (n - 1) * WEEK_MS);
    const ts = released ? new Date(released).getTime() : NaN;
    const future = Number.isFinite(ts) && ts > now;
    if (future) hasFuture = true;
    else if (released && (!lastAired || released > lastAired)) lastAired = released;
    const v: MetaVideo = {
      id: episodeId(titleId, season, n),
      title: r.title || `Episode ${n}`,
      season: season ?? 1,
      episode: n,
    };
    if (released) v.released = released;
    const thumb = r.thumbnail || src.fallbackThumb;
    if (thumb) v.thumbnail = thumb;
    const flags = [r.filler ? '[Filler]' : '', r.recap ? '[Recap]' : ''].filter(Boolean).join(' ');
    const overview = [flags, r.overview || ''].filter(Boolean).join(' ').trim();
    if (overview) v.overview = overview;
    videos.push(v);
  }
  return { videos, hasFuture, lastAired };
}

export interface TitleRecords { mal?: JikanAnime | null; anilist?: AlMedia | null; kitsu?: KitsuAnimeAttrs | null }

/**
 * Gather episode rows for one anime from whichever providers the caller managed to resolve.
 * The primary provider's rows come first so its titles win; the other providers fill gaps.
 */
export async function gatherEpisodeRows(
  ctx: Ctx,
  ids: { mal?: number; anilist?: number; kitsu?: number },
  records: TitleRecords,
  primary: 'mal' | 'anilist' | 'kitsu',
): Promise<EpisodeRow[][]> {
  const tasks: Array<{ name: 'mal' | 'anilist' | 'kitsu'; run: () => Promise<EpisodeRow[]> }> = [];
  if (ids.mal) tasks.push({ name: 'mal', run: async () => malEpisodeRows(await malEpisodes(ctx, ids.mal!)) });
  if (ids.kitsu) tasks.push({ name: 'kitsu', run: async () => kitsuEpisodeRows(await kitsuEpisodes(ctx, ids.kitsu!), ctx.lang) });
  if (ids.anilist || ids.mal) {
    tasks.push({
      name: 'anilist',
      run: async () => {
        const m = records.anilist || (await anilistDetails(ctx, { anilist: ids.anilist, mal: ids.mal }));
        return m ? anilistEpisodeRows(m) : [];
      },
    });
  }
  const results = await mapLimit(tasks, 3, async (t) => ({ name: t.name, rows: await t.run().catch(() => [] as EpisodeRow[]) }));
  const order: Array<'mal' | 'anilist' | 'kitsu'> = [primary, ...(['mal', 'kitsu', 'anilist'] as const).filter((n) => n !== primary)];
  return order.map((n) => results.find((r) => r.name === n)?.rows || []).filter((r) => r.length > 0);
}

/** Lay Fribb franchise rows out as season groups. Returns [seasonNumber, entries in order][]. */
export function seasonGroups(rows: AnimeMapping[]): Array<[number, AnimeMapping[]]> {
  const sorted = sortFranchise(rows.filter((r) => r.kind !== 'MOVIE' && r.kind !== 'MUSIC'));
  const groups = new Map<number, AnimeMapping[]>();
  const withSeason = sorted.filter((r) => r.tvdbSeason !== undefined);
  const without = sorted.filter((r) => r.tvdbSeason === undefined);
  for (const r of withSeason) {
    const s = r.tvdbSeason as number;
    groups.set(s, [...(groups.get(s) || []), r]);
  }
  if (groups.size === 0) {
    // One-to-one: nth TV entry becomes season n; OVAs/specials collect in season 0.
    let n = 0;
    for (const r of without) {
      const s = r.kind === 'TV' || r.kind === 'ONA' ? ++n : 0;
      groups.set(s, [...(groups.get(s) || []), r]);
    }
  } else {
    // Entries Fribb could not place: TV ones become new seasons after the last known, others go to specials.
    let next = Math.max(...groups.keys()) + 1;
    for (const r of without) {
      const s = r.kind === 'TV' ? next++ : 0;
      groups.set(s, [...(groups.get(s) || []), r]);
    }
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0]);
}

const MAX_FRANCHISE_ENTRIES = 12;

/**
 * Videos for an IMDb/TVDB-keyed series that spans several MAL entries. Episode numbers continue
 * across entries that share a season (split cours), ids are `tt123:season:episode`.
 */
export async function franchiseEpisodes(ctx: Ctx, titleId: string, rows: AnimeMapping[], fallbackThumb?: string): Promise<BuiltEpisodes> {
  const groups = seasonGroups(rows);
  let budget = MAX_FRANCHISE_ENTRIES;
  const videos: MetaVideo[] = [];
  let hasFuture = false;
  let lastAired: string | undefined;
  for (const [season, entries] of groups) {
    let offset = 0;
    for (const entry of entries) {
      if (budget-- <= 0) break;
      const built = await singleEntryEpisodes(ctx, titleId, entry, season, offset, fallbackThumb);
      videos.push(...built.videos);
      offset += built.videos.length;
      hasFuture = hasFuture || built.hasFuture;
      if (built.lastAired && (!lastAired || built.lastAired > lastAired)) lastAired = built.lastAired;
    }
  }
  return { videos, hasFuture, lastAired };
}

async function singleEntryEpisodes(ctx: Ctx, titleId: string, entry: AnimeMapping, season: number, offset: number, fallbackThumb?: string): Promise<BuiltEpisodes> {
  const record = entry.mal ? await malDetails(ctx, entry.mal) : null;
  const rows = await gatherEpisodeRows(ctx, { mal: entry.mal, anilist: entry.anilist, kitsu: entry.kitsu }, { mal: record }, 'mal');
  const built = assembleEpisodes(titleId, {
    rows,
    count: record?.episodes ?? null,
    firstAired: isoDate(record?.aired?.from),
    weekly: entry.kind === 'TV',
    fallbackThumb,
  }, season);
  // Renumber so the season keeps counting across split cours.
  for (const v of built.videos) {
    v.trackerAnime = { mal: entry.mal, anilist: entry.anilist, kitsu: entry.kitsu, anidb: entry.anidb, episode: v.episode! };
    v.episode = (v.episode || 0) + offset;
    v.id = episodeId(titleId, season, v.episode);
  }
  return built;
}
