# Titan module contracts

Titan is a Cloudflare Worker. Rules for every module:

- TypeScript, strict, ES modules. Only dependency: `hono`. No Node built-ins (no `fs`, `crypto` from node, `Buffer`); use Web Crypto / `TextEncoder` / helpers in `src/util/bytes.ts`.
- Durable Cloudflare D1 storage is authorized for parity (12 September 2026). Persist playback history, delivery retries and rotated credentials there. Cache API remains disposable; never use it as the only copy of durable state.
- Network only through `fetchJson` (JSON) or plain `fetch` for non-JSON. Always pass a `ttl` on cacheable GETs. Never call an upstream more than needed; prefer one request that returns more.
- Every handler receives a `Ctx` (`src/context.ts`) that carries the decoded `TitanConfig` (`src/config/schema.ts`).
- Stremio shapes live in `src/stremio/types.ts`; id parsing in `src/stremio/ids.ts`; external addon access in `src/stremio/client.ts`.
- Code is original. Read the AIOMetadata sources for behaviour, provider endpoints, quirks and edge cases, then write it fresh with different structure and names. Do not copy files or function bodies.

## Module ownership and exports

| Path | Owner | Must export |
|---|---|---|
| `src/meta/index.ts` | meta agent | `metaApi: MetaApi` (see `src/meta/types.ts`) plus provider modules `tmdb.ts`, `tvdb.ts`, `tvmaze.ts`, `cinemeta.ts`, `fanart.ts`, `artwork.ts`, `ids.ts`, `rating.ts` (age-rating parse/compare: `passesAgeCap(cert, cap)`), `language.ts` |
| `src/meta/anime/index.ts` | anime agent | `animeApi: AnimeApi` (see `src/meta/types.ts`) plus `mal.ts`, `anilist.ts`, `kitsu.ts`, `mapping.ts` (Fribb anime-lists + fallbacks), `episodes.ts` |
| `src/trackers/index.ts` | tracker agent | `trackerApi: TrackerApi` (see `src/trackers/types.ts`) plus `trakt.ts`, `simkl.ts`, `mal.ts`, `anilist.ts`, `debounce.ts` |
| `src/addon/index.ts` | catalog agent | `addonRouter: Hono<{ Variables: { ctx: Ctx } }>` serving `/manifest.json`, `/catalog/:type/:id/:extra?.json`, `/meta/:type/:id.json`, `/stream/:type/:id.json`, `/subtitles/:type/:id/:extra?.json`; plus `listCatalogDefinitions(ctx): Promise<CatalogDefinition[]>` and `catalogItems(ctx, type, id, extra): Promise<MetaPreview[]>` in `src/addon/catalogs.ts` |
| `src/jellyfin/index.ts` | jellyfin agent | `jellyfinRouter: Hono<{ Variables: { ctx: Ctx } }>` implementing the Jellyfin REST facade; `handleJellyfinSocket(ctx, req): Response` for `/socket` |
| `src/ui/index.ts` | ui agent | `uiRouter: Hono` serving `/` (configure page) and `/api/*` helpers (config encode/decode, OAuth device flows, addon manifest probe) |

`src/index.ts` (integrator) mounts: `/:cfg/jellyfin/*` -> jellyfinRouter, `/:cfg/*` -> addonRouter, `/` and `/api/*` -> uiRouter. It builds `Ctx` and sets it as `c.set('ctx', ctx)`.

## Cross-module calls

- Catalog agent and Jellyfin agent call `metaApi.resolveMeta/searchMeta/resolveIds`, `animeApi.*`, `trackerApi.*`, and `src/stremio/client.ts`.
- Meta agent calls `animeApi` for anime ids (`mal:`, `anilist:`, `kitsu:`, `anidb:`) and for `isAnime`.
- Anime agent calls `tmdb.ts` helpers `tmdbFind(ctx, ids)` and `tmdbImages` exported by the meta agent — signature: `tmdbFind(ctx: Ctx, ids: IdBundle): Promise<IdBundle>`.
- Tracker agent needs nothing from others except `IdBundle`.
- UI agent needs `listCatalogDefinitions` (for the catalog picker) and `getManifest` from `src/stremio/client.ts`.

Where an import target does not exist yet, import it anyway against the contract; the integrator runs `tsc` and fixes seams.
