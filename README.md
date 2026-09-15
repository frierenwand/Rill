# Rill

A Cloudflare Worker providing Stremio metadata/catalogs and a Jellyfin-compatible direct-play server. The configuration UI is compact, dark and monochrome. Addon lists start empty; Cinemeta is opt-in.

Cloudflare D1 stores playback history, separate viewer histories, sessions, refreshed OAuth credentials and queued tracker writes. The Cache API is only a disposable accelerator. Read [PORT_STATUS.md](PORT_STATUS.md) for verified coverage and remaining parity work; full parity is not yet certified.

## Local development

Use Node.js 24:

```sh
npm install
npx wrangler d1 migrations apply DB --local
npm run dev
```

Configure providers and addons, then copy the Jellyfin server URL into your player. Signing in activates that installation's settings. New installations retain their identity across configuration edits. Existing compressed links remain supported.

## Deployment (GitHub + Cloudflare, no CLI needed)

1. Push this repository to GitHub.
2. In the Cloudflare dashboard open **Storage & Databases → D1**, click **Create database**, name it `rill`, and copy its **Database ID**.
3. Paste that ID into `database_id` in `wrangler.jsonc` (replacing the zeros) and push the change.
4. Open **Workers & Pages → Create → Import a repository** and pick this repo. Set the deploy command to `npm run deploy`. Leave the build command empty.
5. After the first deploy open the Worker's **Settings → Variables and Secrets** and add a secret `TITAN_SECRET` with any long random string. `TMDB_KEY` is an optional server-wide metadata key.

`npm run deploy` applies the D1 migrations and then deploys the Worker, so every push to `main` updates both. Everything runs on the free plan: the Worker, D1 and the one-minute Cron Trigger that drains pending deliveries and synchronizes each account's tracker history every 30 minutes.

## Tracking

- Trakt, Simkl and MDBList receive start, pause, resumed start and stop transitions. MAL/AniList receive completed watches and manual changes. PublicMetaDB receives stopped positions and watched changes.
- Heartbeats retain the latest position without calling trackers. Incoming requests still count as Worker requests.
- Reports are acknowledged after durable recording. Provider delivery runs afterward and retries independently of the player, ordered per service.
- Failed deliveries stop after ten attempts and remain visible under **Scrobbling → Check delivery status**. Reconnect the affected service before retrying.
- Profiles may share account history/tracking or keep independent local history with no tracker writes. Profiles can restrict catalogs and age ratings.
- Playback redirects to HTTP stream URLs supplied by configured addons. The inspected upstream Jellyfin implementation also excludes transcoding, torrent playback and streams requiring custom HTTP headers.

Configuration URLs contain credentials and the installation capability. Refreshed Trakt/MAL credentials remain in D1, so routine rotation does not require replacing the install URL. Legacy storage-less deployments lack these guarantees and are explicitly identified by the status check.

## Verification

```sh
npm run typecheck
```

Official Jellyfin Web 12.0 login, browsing, decoded video, pause/resume and stop were verified locally using a synthetic addon. Live tracker writes and other Jellyfin clients remain release checks.
