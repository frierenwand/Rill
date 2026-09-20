# Rill

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/mrtxiv/Rill)

Rill is a single Cloudflare Worker that does two things:

- **Stremio addon** serving metadata, search and catalogs from TMDB, TVDB, TVmaze, Trakt, Simkl, MDBList, Letterboxd, MovieLens, FlixPatrol, PublicMetaDB, MAL, AniList and Kitsu, plus your own custom and merged catalogs.
- **Jellyfin-compatible server** so any Jellyfin client can browse those catalogs and direct-play the HTTP streams returned by your Stremio stream addons, with watch history, profiles and scrobbling to Trakt, Simkl, MDBList, MAL, AniList and PublicMetaDB.

There is no server to run. Cloudflare D1 (serverless SQLite) stores history, profiles, sessions, refreshed OAuth credentials and the tracker delivery queue. The Worker Cache API is only a disposable accelerator.

## Deploy

Click **Deploy to Cloudflare** above and sign in. Cloudflare copies this repository into your GitHub account, creates the D1 database, deploys the Worker and gives you a `*.workers.dev` URL. Rill creates its own tables and signing key on first start. Pushes to your copy redeploy automatically.

That is all. The free plan is enough for a personal installation.

### Updates

Your copy checks this repository once a day, merges new commits and Cloudflare redeploys the Worker. Database changes apply themselves on the next request. Nothing to configure. To update right away, open **Actions → Sync with upstream → Run workflow** in your copy.

GitHub pauses scheduled workflows in repositories with no activity for 60 days. If the Actions tab shows a banner saying so, click **Enable** and the updates resume.

If your copy predates this file, add it once and updates run from then on:

```bash
git clone https://github.com/YOUR_USER/Rill && cd Rill
curl -fsSLo .github/workflows/sync.yml --create-dirs https://raw.githubusercontent.com/mrtxiv/Rill/main/.github/workflows/sync.yml
git add .github && git commit -m "Sync with upstream" && git push
```

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

**Simple** (default) needs no API keys and no accounts. Paste your Stremio catalog, metadata, stream and subtitle addons, switch the catalogs you want on or off and order them, set a Jellyfin password and you are done. Cinemeta and Metahub fill in details and artwork automatically.

**Advanced** adds Scrobbling, Metadata and Catalogs: Trakt, Simkl, MDBList, MyAnimeList and AniList tracking; TMDB, TVDB, Fanart and RPDB keys with provider and artwork priority; anime lists; list sources such as MDBList, Letterboxd, TVDB and MovieLens; custom and merged catalogs; AI recommendations. API-backed catalogs only appear in your apps while Advanced is on.

Tip for operators: setting the optional `TMDB_KEY` secret lets Simple-mode users resolve titles that addons identify only by TMDB id.

**One account, every device.** The first time you open your Worker it asks you to create an account: a username and a password of at least 8 characters. That single account protects the settings page and is what you type into Jellyfin apps. Every change saves to your Worker's database automatically, nothing is kept in the browser, and any device that signs in sees the same configuration. There is no registration afterwards, so nobody else can create an account or open your settings. Forgot the password? Delete the row in the `owner` table of your D1 database in the Cloudflare dashboard and the setup screen returns.

Then connect your apps:

1. **Stremio:** install the manifest link from the Connect tab.
2. **Jellyfin clients:** add just the Worker URL (for example, `https://your-worker.workers.dev`) as a server and sign in with the username and password from the Jellyfin tab. The server loads your saved settings automatically. Quick Connect is supported.

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

**Jellyfin collections.** Build box set libraries for Jellyfin clients under the Jellyfin tab. A collection is a library of its own, typed as box sets so clients draw it as one, with its own cover, backdrop, description and default tile shape (poster 2:3, landscape 16:9 or square). Each tile inside is a row of its own with its own name, artwork and shape override. Tile members come from your catalogs (optionally filtered by genre), an actor or director's TMDB credits, a franchise (TMDB collection), a studio, a network, or raw TMDB discover filters, in any mix and order with duplicates removed. Auto rows expand a whole set of tiles at request time: every genre of a catalog or of TMDB, decades, popular actors, studios, streaming networks and franchises, with a cap and a shape per row. Covers resolve on their own when none is set: actor photos, studio and network logos, franchise posters, otherwise the first member's artwork. Starter packs create finished libraries in one click, collections can be duplicated, restricted to profiles, and exported or imported as JSON or from a link. Everything except catalog-based tiles needs a TMDB key.

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
