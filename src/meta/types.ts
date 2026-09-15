import type { Ctx } from '../context';
import type { ContentType, Meta, MetaPreview } from '../stremio/types';

/** A place that can answer meta / search for some ids. */
export interface MetaSource {
  name: string;
  /** Return full meta or null when this source cannot answer the id. */
  meta(ctx: Ctx, type: ContentType, id: string): Promise<Meta | null>;
  search?(ctx: Ctx, type: ContentType, query: string, opts?: { skip?: number; limit?: number }): Promise<MetaPreview[]>;
}

/** All external ids we can learn for a title. Any subset may be present. */
export interface IdBundle {
  imdb?: string;
  tmdb?: number;
  tvdb?: number;
  tvmaze?: number;
  mal?: number;
  anilist?: number;
  kitsu?: number;
  anidb?: number;
  /** tmdb media kind when known. */
  tmdbType?: 'movie' | 'tv';
}

/** Contract for src/meta/index.ts (owned by the meta agent). */
export interface MetaApi {
  /** Resolve the best meta for an id using cfg.providers order, with artwork merged in. */
  resolveMeta(ctx: Ctx, type: ContentType, id: string): Promise<Meta | null>;
  /** Search across cfg.search.providers, de-duplicated. */
  searchMeta(ctx: Ctx, type: ContentType, query: string, opts?: { skip?: number; limit?: number }): Promise<MetaPreview[]>;
  /** Learn every id we can for a Stremio id (imdb<->tmdb<->tvdb<->mal<->anilist<->kitsu). */
  resolveIds(ctx: Ctx, id: string, type?: ContentType): Promise<IdBundle>;
  /** Pick a canonical Stremio id for an IdBundle, preferring imdb, then tmdb, then anime ids. */
  canonicalId(ids: IdBundle, type: ContentType): string | null;
}

/** Contract for src/meta/anime/index.ts (owned by the anime agent). */
export interface AnimeApi {
  /** Meta from MAL / AniList / Kitsu depending on cfg.providers.anime; accepts mal:/anilist:/kitsu:/anidb:/tt ids for anime. */
  animeMeta(ctx: Ctx, id: string): Promise<Meta | null>;
  animeSearch(ctx: Ctx, query: string, opts?: { skip?: number; limit?: number }): Promise<MetaPreview[]>;
  /** Fill mal/anilist/kitsu/anidb/imdb/tmdb/tvdb from whatever is present. */
  mapAnimeIds(ctx: Ctx, ids: IdBundle): Promise<IdBundle>;
  /** True when a title (by ids or genres) should be treated as anime. */
  isAnime(ids: IdBundle, genres?: string[]): Promise<boolean>;
}
