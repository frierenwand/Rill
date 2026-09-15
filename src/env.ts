export interface Env {
  /** Persistent accounts, playback history, OAuth credentials and delivery queue. */
  DB?: D1Database;
  /** Optional HMAC secret for Jellyfin tokens. When absent a random key is generated once and stored in D1. */
  RILL_SECRET?: string;
  /** Optional server-wide TMDB key used when a config carries none. */
  TMDB_KEY?: string;
  /** 50 on Free; set to 1000 only on Workers Paid. */
  D1_QUERY_BUDGET?: string;
}
