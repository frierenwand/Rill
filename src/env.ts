export interface Env {
  /** Persistent accounts, playback history, OAuth credentials and delivery queue. */
  DB?: D1Database;
  /** Optional HMAC secret for Jellyfin tokens. Falls back to a config-derived key. */
  TITAN_SECRET?: string;
  /** Optional server-wide TMDB key used when a config carries none. */
  TMDB_KEY?: string;
}
