# Rill parity status

Updated 12 September 2026. Durable Cloudflare storage is authorized and implemented. **Full upstream parity is not yet certified.**

## Exact reference

The inspected image is `ghcr.io/cedya77/aiometadata:jellyfin`, pinned to digest `sha256:6496d0c4a67ff37cfa982f2168271a5e04848ba93e001b322926e032af8b62ff` (amd64 manifest `sha256:d52a28037ea6b5fd8dab5906e2efe7fbbc253ff6990aef7281252887ab4789cb`). Its addon layer was downloaded and SHA-256 verified. Thirteen relevant files match the inspected source revision byte-for-byte: Jellyfin routes, sessions, profiles, tokens, synchronization, ID mapping and tracker utilities.

Checksums are in [UPSTREAM_REFERENCE.json](UPSTREAM_REFERENCE.json). The image lacks a source-revision label; these are verified file matches, not an assertion about every built artifact. Reference: [upstream playback state](https://github.com/cedya77/aiometadata/blob/ad78577397f550a749439e61d2c17cbb7bd15ca9/addon/lib/jellyfin/playstate.ts). Rill's implementation is original.

## Implemented and locally tested

| Area | Current behavior |
| --- | --- |
| Playback | Device/session-specific start, pause, resumed start and stop; duplicate suppression; heartbeats save position without tracker traffic. |
| Persistent history | D1 history survives cache eviction, works with trackers off, preserves unwatch/clear, and retains exact positions when runtime is unknown. |
| Delivery | Persistent per-service queue; cross-request leases; successful split-part acknowledgements; scheduled stop recovery without further client activity. |
| Retry limits | Backoff, ten attempts, visible failures and explicit retry. Starts/pauses older than ten minutes expire; stops/history remain deliverable. |
| OAuth | Trakt/MAL refresh under a lease; replacement tokens are saved before use. Settings edits preserve rotated credentials. |
| Profiles | Separate login identities, shared/independent history, catalog restrictions, age cap and avatar. Independent profiles do not write trackers. |
| Authentication | Signed 30-day tokens, durable logout revocation, profile authorization, atomic single-use Quick Connect and collision-safe pairing codes. |
| Configuration | Stable installation identity across edits; sign-in activates updated settings; legacy compressed links remain supported. |
| Synchronization | Last successful tracker snapshot survives outages; scheduled reads every 30 minutes; local decisions override imported data. |
| Bulk changes | Aired season/series episodes are queued durably; series exclude specials; bounded processing preserves destination order. |
| Anime episodes | Anime-Lists ranges, offsets, explicit overrides, specials, exclusions, split/merged episodes and reverse TVDB/TMDB conversion; entry-relative MAL/AniList progress. Watched badges and Next Up use the same projection; local unwatch takes precedence. |
| Service selection | All six tracker destinations, per-service movie/series switches, catalogs from every connected service, expanded MAL/AniList lists, PublicMetaDB selected lists/picks/resume and corrected Trakt user/slug references. |
| Playback protocol | Authenticated fixture flow through login, browsing, source selection, redirect, subtitles and reports; unauthorized rejection. |
| UI | Rill branding, compact monochrome tabs, no gradients/default addons, profile controls and on-demand delivery status. |

Resume maps to start, not another completed watch. Session providers apply their own completion rules; anime completion and local played state use the inspected 90% threshold.

## Remaining parity work and release gates

- **Catalog breadth:** upstream includes TVDB discovery/lists, Letterboxd, MovieLens, FlixPatrol, automatic PublicMetaDB list discovery, merged catalogs and configurable discovery/recommendations beyond this port. These are implementation gaps, not merely untested features.
- **Anime read/display parity:** outgoing conversion and watched/Next Up projection are implemented and locally verified. Franchise display grouping still contains heuristics, and every split/merged-episode resume variant has not been validated.
- **Live services/clients:** official Jellyfin Web 12.0 was tested against the local Worker: server selection, login, browsing, video decoding, pause, resume and stop. The client’s transitions and final 19.499-second position were verified in D1. No real tracker account writes or other Jellyfin clients have been verified.
- **Large accounts:** scheduled batches and history pagination are bounded. Very large histories/catalogs need capacity and response-size testing against deployed Worker/D1 limits.
- **Production:** local migrations are applied. Production D1 provisioning, binding configuration, signing secret and deployment remain outstanding.

Direct HTTP playback and excluding header-dependent streams match upstream's Jellyfin implementation. Upstream's broader server administration and collection-builder workflows have not been ported.

## Delivery guarantees

Persistent, ordered retries do not provide exactly-once external side effects. If a provider accepts a write but its response or the subsequent acknowledgement is lost, retrying can repeat it. Provider conflict handling limits duplicates where available. Leases assume an operation completes within their timeout. Database failures surface to the caller; acknowledged playback is not intentionally entrusted solely to background work.

## Verification evidence

TypeScript compiles cleanly. Behaviour was exercised locally against production SQL through SQLite, fixture-based provider APIs and authenticated requests through the Jellyfin router.

The official web client played public Mozilla/W3C test media through a synthetic addon. This exposed and fixed stale install-link activation and replay runtime refresh. The test addon and downloaded client live only in temporary files, not the project.

Local Wrangler returned login **200**, durable storage **true**, logout **204**, and revoked-token rejection **401**. Browser checks exercised adding/removing a profile and restored the configuration afterward. No production deployment or live tracker write was performed.
