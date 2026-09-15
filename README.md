# Rill

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/mrtxiv/Rill)

Rill is a single Cloudflare Worker that does two things:

- **Stremio addon** serving metadata, search and catalogs from TMDB, TVDB, TVmaze, Trakt, Simkl, MDBList, Letterboxd, MovieLens, FlixPatrol, PublicMetaDB, MAL, AniList and Kitsu, plus your own custom and merged catalogs.
- **Jellyfin-compatible server** so any Jellyfin client can browse those catalogs and direct-play the HTTP streams returned by your Stremio stream addons, with watch history, profiles and scrobbling to Trakt, Simkl, MDBList, MAL, AniList and PublicMetaDB.

There is no server to run. Cloudflare D1 (serverless SQLite) stores history, profiles, sessions, refreshed OAuth credentials and the tracker delivery queue. The Worker Cache API is only a disposable accelerator.

## Requirements

- A free Cloudflare account.
- A GitHub account (for dashboard deploys) or Node.js 20+ (for CLI deploys).
- Optional API keys: TMDB (recommended), Gemini or OpenRouter (only if you want AI recommendations).

## One-click deploy

Click **Deploy to Cloudflare** above. Cloudflare copies this repository into your GitHub account, creates the `rill` D1 database, applies the migrations and deploys the Worker. Pushes to your copy redeploy automatically.

After the first deploy open the Worker's **Settings → Variables and Secrets** and add:

| Name | Required | Purpose |
| --- | --- | --- |
| `RILL_SECRET` | Recommended | Long random string used to sign Jellyfin login tokens. |
| `TMDB_KEY` | Optional | Server-wide TMDB API key used when a configuration has none. |

Then click **Deploy** once more so the secrets take effect, and open `https://rill.<your-subdomain>.workers.dev` to configure.

## Manual deploy from the Cloudflare dashboard

1. **Fork** this repository to your GitHub account.
2. **Create the database.** In the Cloudflare dashboard open **Storage & Databases → D1 SQL Database → Create**, name it `rill`, and copy its **Database ID**.
3. **Set the database ID.** Edit `wrangler.jsonc`, replace the placeholder `database_id` with the ID you copied, and commit the change.
4. **Create the Worker.** Open **Workers & Pages → Create → Import a repository**, choose your fork, leave the build command empty and set the deploy command to `npm run deploy`. This applies the D1 migrations and deploys the Worker.
5. **Add secrets** as in the table above, then deploy once more.

## Deploy with the Wrangler CLI

```bash
npm install
npx wrangler login
npx wrangler d1 create rill
```

Paste the returned `database_id` into `wrangler.jsonc`, then:

```bash
npx wrangler secret put RILL_SECRET
npm run deploy
```

Optional:

```bash
npx wrangler secret put TMDB_KEY
```

## Configure

1. Open the Worker URL. Add your metadata keys, tracker accounts and Stremio stream addons, then enable the catalogs you want.
2. **Stremio:** install the manifest link shown at the bottom of the page.
3. **Jellyfin clients:** add the Worker URL as a server and sign in with the username and password from the Jellyfin section. Signing in activates that configuration's settings. Quick Connect is supported.

Configuration links carry credentials. Share the Worker URL, never the install link.

## Local development

```bash
npm install
npx wrangler d1 migrations apply DB --local
npm run dev
```

Put local secrets in a `.dev.vars` file (see `.dev.vars.example`). It is git-ignored.

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
src/addon      Stremio manifest, catalogs, search, discovery, collections, layouts, recommendations
src/jellyfin   Jellyfin REST facade: auth, library, playback, sessions, people, segments
src/meta       Metadata providers and anime mapping
src/trackers   Trakt, Simkl, MDBList, MAL, AniList, PublicMetaDB
src/storage    D1 access: history, deliveries, credentials, scheduled work, budget
src/ui         Configuration page
migrations     D1 schema
```

## License

MIT. See [LICENSE](LICENSE).
