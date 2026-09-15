/** Stremio addon protocol shapes, as Rill produces and consumes them. */
export type ContentType = 'movie' | 'series' | 'anime' | 'channel' | 'tv';

export interface ManifestCatalog {
  type: ContentType;
  id: string;
  name: string;
  extra?: Array<{ name: string; isRequired?: boolean; options?: string[]; optionsLimit?: number }>;
  extraSupported?: string[];
  extraRequired?: string[];
  genres?: string[];
}

export interface Manifest {
  id: string;
  version: string;
  name: string;
  description?: string;
  logo?: string;
  background?: string;
  resources: Array<string | { name: string; types: string[]; idPrefixes?: string[] }>;
  types: string[];
  catalogs: ManifestCatalog[];
  idPrefixes?: string[];
  behaviorHints?: { configurable?: boolean; configurationRequired?: boolean; adult?: boolean; p2p?: boolean };
}

export interface MetaVideo {
  numbering?: 'tvdb' | 'tmdb' | 'anime';
  /** Exact anime entry and episode before franchise display numbering. */
  trackerAnime?: { mal?: number; anilist?: number; kitsu?: number; anidb?: number; episode: number };
  id: string;            // e.g. tt0903747:1:2, kitsu:123:5, mal:123:5
  title: string;
  season?: number;
  episode?: number;
  released?: string;     // ISO date
  thumbnail?: string;
  overview?: string;
  rating?: string;
  streams?: Stream[];
}

export interface MetaLink { name: string; category: string; url: string }

export interface MetaPreview {
  id: string;
  type: ContentType;
  name: string;
  poster?: string;
  posterShape?: 'poster' | 'landscape' | 'square';
  background?: string;
  logo?: string;
  description?: string;
  releaseInfo?: string;
  imdbRating?: string;
  genres?: string[];
  year?: number | string;
}

export interface Meta extends MetaPreview {
  /** A browsable movie collection, rather than a playable title. */
  collection?:boolean;
  seasonPosters?:Record<number,string>;
  runtime?: string;      // "45 min"
  released?: string;     // ISO
  videos?: MetaVideo[];
  cast?: string[];
  director?: string[];
  writer?: string[];
  country?: string;
  language?: string;
  links?: MetaLink[];
  trailers?: Array<{ source: string; type: 'Trailer' | 'Clip' }>;
  awards?: string;
  /** Rill extension: rating certification like 'PG-13' / 'TV-MA'. */
  certification?: string;
  /** Rill extension: external ids we know for this title. */
  ids?: { imdb?: string; tmdb?: number; tvdb?: number; tvmaze?:number; mal?: number; anilist?: number; kitsu?: number; anidb?: number };
  behaviorHints?: { defaultVideoId?: string | null; hasScheduledVideos?: boolean };
  status?: string;
  network?: string;
}

export interface Stream {
  url?: string;
  ytId?: string;
  infoHash?: string;
  fileIdx?: number;
  externalUrl?: string;
  name?: string;
  title?: string;
  description?: string;
  subtitles?: Subtitle[];
  behaviorHints?: {
    notWebReady?: boolean;
    bingeGroup?: string;
    countryWhitelist?: string[];
    proxyHeaders?: { request?: Record<string, string>; response?: Record<string, string> };
    filename?: string;
    videoSize?: number;
    videoHash?: string;
  };
}

export interface Subtitle { id: string; url: string; lang: string }

export interface CatalogRequest {
  type: ContentType;
  id: string;
  extra: { search?: string; genre?: string; skip?: number; [k: string]: string | number | undefined };
}
