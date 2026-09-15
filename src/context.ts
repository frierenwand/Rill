import type { Env } from './env';
import type { TitanConfig } from './config/schema';
import type { JellyfinProfile } from './config/schema';

/** Everything a request handler needs. Built once per request in index.ts. */
export interface Ctx {
  cfg: TitanConfig;
  env: Env;
  /** Encoded config token as it appeared in the URL (for building self-links). */
  cfgToken: string;
  accountConfigToken?: string;
  /** Origin of this worker, e.g. https://titan.example.workers.dev */
  origin: string;
  /** Short stable hash of the config, used to scope caches per user. */
  scope: string;
  cacheRevision?: string;
  profile?: JellyfinProfile;
  /** Independent viewers keep history separate while authentication stays account-scoped. */
  historyScope?: string;
  defer?: (work: Promise<unknown>) => void;
  queueOnly?: boolean;
  /** Lowercase 2-letter language, e.g. 'en'. */
  lang: string;
  /** TMDB key: config first, then env. */
  tmdbKey: string | undefined;
}
