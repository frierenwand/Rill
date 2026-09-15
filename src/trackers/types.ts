import type { Ctx } from '../context';
import type { IdBundle } from '../meta/types';
import type { TrackerName } from '../config/schema';
import type { ManifestCatalog, MetaPreview } from '../stremio/types';

/** Where a user is in a title, as the primary tracker reports it. */
export interface ResumeEntry {
  positionMs?: number;
  runtimeMs?: number;
  ids: IdBundle;
  kind: 'movie' | 'episode';
  season?: number;
  episode?: number;
  /** 0..100 */
  progress: number;
  /** ISO timestamp of the last activity. */
  at: string;
  /** Tracker-side id useful for deletion (Trakt playback id). */
  ref?: string | number;
}

export interface WatchedMovie { ids: IdBundle; plays: number; lastAt: string }
export interface WatchedEpisode { ids: IdBundle; season: number; episode: number; plays: number; lastAt: string }

/** Whole watch history as far as the tracker exposes it. Cached briefly, never stored. */
export interface WatchSnapshot {
  /** Local decisions include negative states, so a stale provider cannot undo an unwatch. */
  local?: Array<{ids:IdBundle;kind:'movie'|'episode';season?:number;episode?:number;watched:boolean;progress:number;positionMs?:number;runtimeMs?:number;at:string}>;
  movies: WatchedMovie[];
  episodes: WatchedEpisode[];
  /** Shows the user has any progress on (for Next Up). */
  shows: Array<{ ids: IdBundle; lastAt: string; lastSeason?: number; lastEpisode?: number }>;
  resume: ResumeEntry[];
  fetchedAt: string;
}

export type ScrobbleAction = 'start' | 'pause' | 'stop';

export interface ScrobbleEvent {
  positionMs?: number;
  numbering?: 'anime' | 'tvdb' | 'tmdb';
  animeEpisode?: { mal?: number; anilist?: number; kitsu?: number; anidb?: number; episode: number };
  /** Stable identity of a Jellyfin playback transition, including device and play session. */
  deliveryId?: string;
  action: ScrobbleAction;
  ids: IdBundle;
  kind: 'movie' | 'episode';
  season?: number;
  episode?: number;
  /** 0..100 */
  progress: number;
  /** Title runtime in ms when known; helps trackers that want minutes. */
  runtimeMs?: number;
}

export interface MarkEvent {
  deliveryId?: string;
  at?: string;
  numbering?: ScrobbleEvent['numbering'];
  animeEpisode?: ScrobbleEvent['animeEpisode'];
  ids: IdBundle;
  kind: 'movie' | 'episode' | 'series';
  season?: number;
  episode?: number;
  watched: boolean;
}

export interface Tracker {
  name: TrackerName;
  /** Is this tracker configured with usable credentials? */
  ready(ctx: Ctx): boolean;
  snapshot(ctx: Ctx): Promise<WatchSnapshot>;
  scrobble(ctx: Ctx, ev: ScrobbleEvent): Promise<void>;
  mark(ctx: Ctx, ev: MarkEvent): Promise<void>;
  /** Drop a resume entry (client cleared "continue watching"). */
  clearResume?(ctx: Ctx, entry: ResumeEntry): Promise<void>;
  /** Personal lists this tracker can expose as catalogs. */
  catalogs?(ctx: Ctx): Promise<ManifestCatalog[]>;
  catalogItems?(ctx: Ctx, catalogId: string, skip: number): Promise<MetaPreview[]>;
}

/** Contract for src/trackers/index.ts (owned by the tracker agent). */
export interface TrackerApi {
  /** The tracker answering resume + watched state, or null. */
  primary(ctx: Ctx): Tracker | null;
  /** Every tracker that should receive scrobbles/marks (primary + scrobbleTo, de-duplicated). */
  sinks(ctx: Ctx): Tracker[];
  /** Cached snapshot from the primary tracker (short TTL via Cache API). Empty snapshot when off. */
  snapshot(ctx: Ctx): Promise<WatchSnapshot>;
  /**
   * Fan a scrobble out to every sink, de-bounced through the Cache API so a client
   * reporting progress every few seconds does not become a request per tick.
   */
  scrobble(ctx: Ctx, ev: ScrobbleEvent): Promise<void>;
  mark(ctx: Ctx, ev: MarkEvent): Promise<void>;
  clearResume(ctx: Ctx, entry: ResumeEntry): Promise<void>;
  /** Invalidate the cached snapshot after a write so the next read reflects it. */
  invalidate(ctx: Ctx): Promise<void>;
}
