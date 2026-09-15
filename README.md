# Rill

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/mrtxiv/Rill)

Rill is a single Cloudflare Worker that does two things:

- **Stremio addon** serving metadata, search and catalogs from TMDB, TVDB, TVmaze, Trakt, Simkl, MDBList, Letterboxd, MovieLens, FlixPatrol, PublicMetaDB, MAL, AniList and Kitsu, plus your own custom and merged catalogs.
- **Jellyfin-compatible server** so any Jellyfin client can browse those catalogs and direct-play the HTTP streams returned by your Stremio stream addons, with watch history, profiles and scrobbling to Trakt, Simkl, MDBList, MAL, AniList and PublicMetaDB.

There is no server to run. Cloudflare D1 (serverless SQLite) stores history, profiles, sessions, refreshed OAuth credentials and the tracker delivery queue. The Worker Cache API is only a disposable accelerator.

## Deploy

Click **Deploy to Cloudflare** above and sign in. Cloudflare copies this repository into your GitHub account, creates the D1 database, deploys the Worker and gives you a `*.workers.dev` URL. Rill creates its own tables and signing key on first start. Pushes to your copy redeploy automatically.

That is all. The free plan is enough for a personal installation.

Optional secrets, under the Worker's **Settings → Variables and Secrets**:

| Name | Purpose |
| --- | --- |
| `TMDB_KEY` | Server-wide TMDB API key, used when a configuration has none. You can also enter it in the settings page instead. |
| `RILL_SECRET` | Override the auto-generated Jellyfin token signing key, for example to keep sessions valid across database resets. |

### Deploy with the Wrangler CLI instead

```bash
npm install
npx wrangler login
npm run deploy
```

Wrangler provisions the D1 database on the first deploy. Node.js 20 or newer is required.

## Configure

The settings page has two modes, switched at the top.

**Simple** (default) needs no API keys and no accounts. Paste your Stremio metadata, stream and subtitle addons, set a Jellyfin password and you are done. Catalogs and details come from your metadata addons, with Cinemeta and Metahub filling in details and artwork automatically.

**Advanced** adds Scrobbling, Metadata and Catalogs: Trakt, Simkl, MDBList, MyAnimeList and AniList tracking; TMDB, TVDB, Fanart and RPDB keys with provider and artwork priority; anime lists; list sources such as MDBList, Letterboxd, TVDB and MovieLens; custom and merged catalogs; AI recommendations. API-backed catalogs only appear in your apps while Advanced is on.

Tip for operators: setting the optional `TMDB_KEY` secret lets Simple-mode users resolve titles that addons identify only by TMDB id.

Then connect your apps:

1. **Stremio:** install the manifest link from the Connect tab.
2. **Jellyfin clients:** add the Worker URL as a server and sign in with the username and password from the Jellyfin tab. Signing in activates that configuration's settings. Quick Connect is supported.

Configuration links carry credentials. Share the Worker URL, never the install link.

## Local development

```bash
npm install
npm run dev
```

Tables are created automatically in the local database. Optional local secrets go in a `.dev.vars` file (see `.dev.vars.example`).

## Free plan notes

Rill is built to run on the Workers Free plan for a personal installation:

- All scheduled work stays within D1's 50-statement limit per invocation. If you upgrade to Workers Paid, set the variable `D1_QUERY_BUDGET` to `1000`.
- The one-minute cron trigger uses about 1,440 of the 100,000 daily free requests.
- Heavy features can exceed the free CPU and request limits: cold merged catalogs, very large history imports and AI recommendation builds. Those may need Workers Paid.

See [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) and [D1 limits](https://developers.cloudflare.com/d1/platform/limits/).

## Features

**Catalogs.** Add list links or IDs from any supported provider and enable the returned catalogs. Custom catalogs support provider filters or ordered merges of existing catalogs. Date filters accept expressions such as `today-7d`, `today-3m` and `today+1y`. Collections expose their member titles in both Stremio and Jellyfin.

**Recommendations.** Opt-in Gemini or OpenRouter with your own model and key. Choose which viewing history to use, vote thresholds and ordering. Cached results are durable and exclude titles you have since watched. Calls to the model provider may incur their charges.

**Tracking.**
- Trakt, Simkl and MDBList receive start, pause, resume and stop. MAL and AniList receive completed watches and manual changes. PublicMetaDB receives stopped positions and watched changes.
- Playback reports are stored durably first, then delivered to providers in order with retries. Failed deliveries stop after ten attempts and are listed under **Scrobbling → Check delivery status**.
- Refreshed Trakt and MAL tokens are stored in D1, so token rotation never requires a new install link.

**Profiles.** Each profile has its own login. Profiles can share the account's history and tracking, or keep an independent local history with no tracker writes. Profiles can restrict catalogs and set an age-rating cap.

**Anime.** Episode mapping uses Anime-Lists ranges, offsets and explicit overrides, including specials, split and merged episodes, with MAL and AniList progress calculated per entry.

**Playback.** Direct play of HTTP streams from your configured addons. Torrent streams, transcoding and streams that need custom HTTP headers are not supported.

## Layout

```
src/addon      Stremio manifest, catalogs, search, discovery, collections, recommendations
src/jellyfin   Jellyfin REST facade: auth, library, playback, sessions, people, segments
src/meta       Metadata providers and anime mapping
src/trackers   Trakt, Simkl, MDBList, MAL, AniList, PublicMetaDB
src/storage    D1 access: history, deliveries, credentials, scheduled work, budget
src/ui         Configuration page
migrations     D1 schema
```

## License

MIT. See [LICENSE](LICENSE).
