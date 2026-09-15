/**
 * Rill installation settings travel in compressed URLs. D1 preserves active
 * settings, playback history and refreshed credentials across requests.
 */
export type TrackerName = 'trakt' | 'simkl' | 'mal' | 'anilist' | 'mdblist' | 'publicmetadb';
export type MetaProvider = 'tmdb' | 'tvdb' | 'cinemeta' | 'tvmaze';
export type AnimeProvider = 'mal' | 'anilist' | 'kitsu' | 'tmdb' | 'tvdb';

export interface TraktAuth { clientId: string; clientSecret?: string; accessToken: string; refreshToken?: string; expiresAt?: number; username?: string }
export interface SimklAuth { clientId: string; accessToken: string }
export interface MalAuth { clientId: string; clientSecret?: string; accessToken: string; refreshToken?: string; expiresAt?: number }
export interface AnilistAuth { accessToken: string; userId?: number }

export interface CatalogToggle { id: string; type: 'movie' | 'series' | 'anime'; enabled: boolean; name?: string }
export interface JellyfinProfile { id: string; name: string; sharesHistory: boolean; avatar?: string; ageCap?: string; catalogs?: string[] }
export interface CustomCatalog {
  id: string;
  name: string;
  type: 'movie' | 'series' | 'anime';
  provider: 'tmdb' | 'tvdb' | 'mal' | 'anilist' | 'movielens' | 'simkl' | 'merged';
  params: Record<string, string | number | boolean | string[]>;
  sources?: Array<{ id: string; type: 'movie' | 'series' | 'anime';genre?:string }>;
}
export interface RecommendationSettings {
  aiSearch?:boolean;
  sources:'primary'|'simkl'|'mdblist'|'both';
  enabled:boolean; provider:'gemini'|'openrouter'; apiKey:string; model:string;
  webSearch:boolean; refreshHours:number; order:'suggested'|'popular'|'acclaimed'|'balanced';
  minVotes:number; reasoning:'minimal'|'low'|'medium'|'high'; staleDays:number;
  stalledWeight:'ignore'|'note'|'mild'|'dislike';
}

export interface RillConfig {
  v: 1;
  /** Random installation capability; its hash remains stable across settings edits. */
  installationKey?: string;
  revision?: number;
  /** Display name shown in Jellyfin clients. */
  name: string;
  /** BCP-47 like 'en-US'. Used for TMDB/TVDB text and artwork picks. */
  language: string;
  /** Provider order for each media kind. First wins, others fill gaps. */
  providers: { movie: MetaProvider; series: MetaProvider; anime: AnimeProvider };
  /** Artwork sources, in priority order. */
  artwork: { posters: Array<'tmdb' | 'fanart' | 'tvdb' | 'rpdb' | 'metahub'>; backgrounds: Array<'tmdb' | 'fanart' | 'tvdb' | 'metahub'>; logos: Array<'fanart' | 'tmdb' | 'tvdb' | 'metahub'> };
  keys: { tmdb?: string; tvdb?: string; fanart?: string; rpdb?: string; publicmetadb?: string; mdblist?: string };
  /** External Stremio addons the user pastes in (manifest URLs). */
  addons: { meta: string[]; stream: string[]; subtitle: string[] };
  /** Rill's own catalog switches, persisted in manifest order. */
  catalogs: CatalogToggle[];
  /** MDBList / Trakt list ids the user wants as catalogs. */
  lists: { mdblist: string[]; trakt: string[]; publicmetadb?: string[]; publicmetadbPicks?: string[]; tvdb?: string[]; tmdbCollections?:string[]; letterboxd?: string[]; flixpatrol?: string[] };
  customCatalogs?: CustomCatalog[];
  movieLens?: { username: string; password: string; syncRatings?: boolean };
  recommendations?: RecommendationSettings;
  /** Watch tracking. `primary` answers resume + watched ticks; others only receive scrobbles. */
  trackers: { primary: TrackerName | 'off'; scrobbleTo: TrackerName[]; media?: Partial<Record<TrackerName, { movie?: boolean; series?: boolean }>>; trakt?: TraktAuth; simkl?: SimklAuth; mal?: MalAuth; anilist?: AnilistAuth };
  /** Age rating cap, e.g. 'PG-13' or 'TV-14'. Empty = no cap. */
  ageCap: string;
  /** Advanced mode exposes provider API keys and API-backed catalogs. Simple mode uses addons and Cinemeta. */
  advanced: boolean;
  /** Jellyfin facade options. */
  jellyfin: { username: string; password: string; maxSources: number; home: Array<'resume' | 'nextup' | 'latest' | 'upcoming'>; profiles?: JellyfinProfile[] };
  /** Search behaviour. */
  search: { providers: Array<'tmdb' | 'tvdb' | 'mal' | 'anilist' | 'kitsu' | 'cinemeta'>; includeAdult: boolean };
}

export const DEFAULT_CONFIG: RillConfig = {
  v: 1,
  name: 'Rill',
  language: 'en-US',
  providers: { movie: 'tmdb', series: 'tmdb', anime: 'mal' },
  artwork: { posters: ['tmdb', 'fanart', 'metahub'], backgrounds: ['tmdb', 'fanart', 'metahub'], logos: ['fanart', 'tmdb', 'metahub'] },
  keys: {},
  addons: { meta: [], stream: [], subtitle: [] },
  catalogs: [],
  lists: { mdblist: [], trakt: [], publicmetadb: [], publicmetadbPicks: [] },
  trackers: { primary: 'off', scrobbleTo: [], media: Object.fromEntries(['trakt','simkl','mdblist','publicmetadb','mal','anilist'].map(name => [name, { movie: true, series: true }])) },
  ageCap: '',
  advanced: false,
  jellyfin: { username: 'rill', password: '', profiles: [], maxSources: 30, home: ['resume', 'nextup', 'latest', 'upcoming'] },
  search: { providers: ['tmdb', 'mal'], includeAdult: false },
  recommendations:{sources:'both',enabled:false,provider:'gemini',apiKey:'',model:'',webSearch:false,refreshHours:24,order:'balanced',minVotes:100,reasoning:'low',staleDays:180,stalledWeight:'note'},
};

/** Deep-merge a partial over defaults so old configs keep working as fields are added. */
export function normalizeConfig(input: unknown): RillConfig {
  const src = (input && typeof input === 'object' ? input : {}) as Partial<RillConfig>;
  const cfg: RillConfig = structuredClone(DEFAULT_CONFIG);
  if (typeof src.installationKey === 'string' && /^[a-f0-9-]{32,64}$/i.test(src.installationKey)) cfg.installationKey=src.installationKey;
  if (typeof src.revision==='number' && Number.isSafeInteger(src.revision) && src.revision>=0) cfg.revision=src.revision;
  cfg.name = str(src.name, cfg.name);
  cfg.language = str(src.language, cfg.language);
  cfg.providers = { ...cfg.providers, ...(src.providers ?? {}) };
  cfg.artwork = { ...cfg.artwork, ...(src.artwork ?? {}) };
  cfg.keys = { ...(src.keys ?? {}) };
  cfg.addons = { meta: arr(src.addons?.meta), stream: arr(src.addons?.stream), subtitle: arr(src.addons?.subtitle) };
  cfg.catalogs = Array.isArray(src.catalogs) ? src.catalogs.filter((c) => c && typeof c.id === 'string') : [];
  cfg.lists = { mdblist: arr(src.lists?.mdblist), trakt: arr(src.lists?.trakt), publicmetadb: arr(src.lists?.publicmetadb), publicmetadbPicks: arr(src.lists?.publicmetadbPicks) };
  cfg.lists.tvdb = arr(src.lists?.tvdb);
  cfg.lists.tmdbCollections=arr(src.lists?.tmdbCollections);
  cfg.lists.letterboxd = arr(src.lists?.letterboxd);
  cfg.lists.flixpatrol = arr(src.lists?.flixpatrol);
  cfg.customCatalogs = (Array.isArray(src.customCatalogs) ? src.customCatalogs : []).filter(c => c && /^[a-zA-Z0-9_-]{1,80}$/.test(c.id) && typeof c.name === 'string' && ['movie','series','anime'].includes(c.type) && ['tmdb','tvdb','mal','anilist','movielens','simkl','merged'].includes(c.provider)).map(c => ({
    id:c.id, name:c.name.trim().slice(0,150), type:c.type, provider:c.provider,
    params:Object.fromEntries(Object.entries(c.params ?? {}).filter(([k,v]) => /^[a-zA-Z0-9_.]+$/.test(k) && (typeof v === 'string' || typeof v === 'boolean' || typeof v === 'number' && Number.isFinite(v) || Array.isArray(v) && v.every(x=>typeof x==='string')))),
    sources:(Array.isArray(c.sources) ? c.sources : []).filter(s => s && typeof s.id==='string' && ['movie','series','anime'].includes(s.type) && !s.id.startsWith('merged.')).slice(0,10),
  }));
  if (src.movieLens && typeof src.movieLens.username==='string' && typeof src.movieLens.password==='string') cfg.movieLens={username:src.movieLens.username.trim(),password:src.movieLens.password,syncRatings:src.movieLens.syncRatings===true};
  const rec=src.recommendations;
  if(rec)cfg.recommendations={...DEFAULT_CONFIG.recommendations!,aiSearch:rec.aiSearch===true,sources:['primary','simkl','mdblist','both'].includes(rec.sources)?rec.sources:'both',enabled:rec.enabled===true,provider:rec.provider==='openrouter'?'openrouter':'gemini',apiKey:typeof rec.apiKey==='string'?rec.apiKey.trim():'',model:typeof rec.model==='string'?rec.model.trim():'',webSearch:rec.webSearch===true,refreshHours:[6,12,24].includes(Number(rec.refreshHours))?Number(rec.refreshHours):24,order:['suggested','popular','acclaimed','balanced'].includes(rec.order)?rec.order:'balanced',minVotes:Math.max(0,Number.isFinite(Number(rec.minVotes))?Number(rec.minVotes):100),reasoning:['minimal','low','medium','high'].includes(rec.reasoning)?rec.reasoning:'low',staleDays:Math.max(7,Number(rec.staleDays)||180),stalledWeight:['ignore','note','mild','dislike'].includes(rec.stalledWeight)?rec.stalledWeight:'note'};
  cfg.trackers = { ...cfg.trackers, ...(src.trackers ?? {}) };
  cfg.trackers.media = Object.fromEntries(['trakt','simkl','mdblist','publicmetadb','mal','anilist'].map(name => [name, { movie: true, series: true, ...src.trackers?.media?.[name as TrackerName] }]));
  cfg.trackers.scrobbleTo = arr(cfg.trackers.scrobbleTo) as TrackerName[];
  cfg.ageCap = str(src.ageCap, '');
  cfg.advanced = src.advanced === true;
  cfg.jellyfin = { ...cfg.jellyfin, ...(src.jellyfin ?? {}) };
  const seenProfiles = new Set<string>();
  const seenNames = new Set<string>([cfg.jellyfin.username.toLowerCase()]);
  cfg.jellyfin.profiles = (Array.isArray(src.jellyfin?.profiles) ? src.jellyfin.profiles : []).filter(p => {
    if (!p || typeof p.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(p.id) || typeof p.name !== 'string' || !p.name.trim() || seenProfiles.has(p.id) || seenNames.has(p.name.trim().toLowerCase())) return false;
    seenProfiles.add(p.id); seenNames.add(p.name.trim().toLowerCase()); return true;
  }).map(p => ({ id:p.id,name:p.name.trim(),sharesHistory:p.sharesHistory === true,avatar:typeof p.avatar === 'string' && /^https?:\/\//i.test(p.avatar) ? p.avatar : undefined,ageCap:typeof p.ageCap === 'string' ? p.ageCap : undefined,catalogs:arr(p.catalogs) }));
  cfg.jellyfin.maxSources = Math.max(1, Math.min(200, Number(cfg.jellyfin.maxSources) || 30));
  cfg.search = { ...cfg.search, ...(src.search ?? {}) };
  return cfg;
}

function str(v: unknown, d: string): string { return typeof v === 'string' && v.length ? v : d; }
function arr(v: unknown): string[] { return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()) : []; }
