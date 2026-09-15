/**
 * Playback: Stremio streams become Jellyfin MediaSources, and the client is
 * sent straight to the stream URL when it asks the server for the video.
 */
import { externalStreams, externalSubtitles } from '../stremio/client';
import type { Stream } from '../stremio/types';
import { containerOf, mediaSource, mediaSourceId, runtimeTicks, streamLabel, subtitleContentType, subtitleFormat, subtitleEntries, type Dto, type MediaSourceInput } from './dto';
import { plainGuid, type TitleGuid } from './ids';
import type { Library } from './library';

/**
 * A client fetches the URL itself and cannot attach headers, so a stream that
 * needs them would only fail at play time. Torrent-only streams have no URL.
 */
function playable(s: Stream): s is Stream & { url: string } {
  if (!s || typeof s.url !== 'string' || !/^https?:\/\//i.test(s.url)) return false;
  const ph = s.behaviorHints?.proxyHeaders;
  if (ph && ((ph.request && Object.keys(ph.request).length) || (ph.response && Object.keys(ph.response).length))) return false;
  return true;
}

export interface ResolvedSources {
  sources: Dto[];
  /** Stremio ids used to fetch, for callers that need them. */
  streamType: string;
  streamId: string;
}

/**
 * Resolve the media sources for a movie or episode guid. The first source
 * carries the item's own guid as its Id: clients pick the source whose Id
 * matches the item and otherwise consider nothing selectable.
 */
export async function resolveSources(lib: Library, g: TitleGuid, itemId: string): Promise<ResolvedSources> {
  const empty = { sources: [], streamType: '', streamId: '' };
  if (g.kind !== 'movie' && g.kind !== 'episode') return empty;
  const ctx = lib.ctx;
  const show = g.kind === 'episode' ? await lib.show(g) : null;
  const meta = g.kind === 'movie' ? await lib.meta(g) : show?.meta ?? null;
  if (g.kind === 'movie' && !meta) return empty;
  const streamType = lib.streamTypeOf(g);
  const streamId = lib.streamIdOf(show, g);

  let streams: Stream[] = [];
  try {
    streams = await externalStreams(ctx, streamType, streamId);
  } catch {
    streams = [];
  }
  const usable = streams.filter(playable).slice(0, ctx.cfg.jellyfin.maxSources);
  if (!usable.length) return { sources: [], streamType, streamId };

  const runtime = runtimeTicks(meta?.runtime);
  const subs = ctx.cfg.addons.subtitle.length ? subtitleEntries(await externalSubtitles(ctx, streamType, streamId).catch(() => [])) : [];

  const seen = new Set<string>();
  const sources: Dto[] = [];
  for (const s of usable) {
    const hashed = await mediaSourceId(s.url);
    if (seen.has(hashed)) continue;
    seen.add(hashed);
    const id = sources.length === 0 ? plainGuid(itemId) || hashed : hashed;
    const size = Number(s.behaviorHints?.videoSize);
    const input: MediaSourceInput = {
      id,
      url: s.url,
      label: streamLabel(s),
      container: containerOf(s),
      size: Number.isFinite(size) && size > 0 ? size : null,
      filename: s.behaviorHints?.filename ?? null,
      runtimeTicks: runtime,
      subtitles: [
        ...(s.subtitles ?? []).filter((x) => x && /^https?:\/\//i.test(x.url)),
        ...subs,
      ].map((x, i) => ({ url: x.url, lang: x.lang || 'und', deliveryUrl: `${lib.jf.base}/Videos/${plainGuid(itemId)}/${id}/Subtitles/${2 + i}/Stream.${subtitleFormat(x.url)}` })),
    };
    const dto = mediaSource(input);
    // Keep the URL-hash beside the item-id alias so a client holding either can find it again.
    dto.ETag = hashed;
    sources.push(dto);
  }
  return { sources, streamType, streamId };
}

export function playbackInfo(sources: Dto[], wantedSourceId: string | undefined, itemId: string): Dto {
  let picked = sources;
  const wanted = wantedSourceId ? plainGuid(wantedSourceId) || wantedSourceId : '';
  if (wanted && wanted !== plainGuid(itemId)) {
    const match = sources.filter((s) => s.Id === wanted || s.ETag === wanted);
    if (match.length) picked = match;
  }
  if (!picked.length) return { MediaSources: [], PlaySessionId: crypto.randomUUID(), ErrorCode: 'NoCompatibleStream' };
  return { MediaSources: picked, PlaySessionId: crypto.randomUUID() };
}

/** Pick the source a client asked for by MediaSourceId; the item's own id means the default. */
export function pickSource(sources: Dto[], wantedSourceId: string | undefined, itemId: string): Dto | null {
  if (!sources.length) return null;
  const wanted = wantedSourceId ? plainGuid(wantedSourceId) || wantedSourceId : '';
  if (!wanted || wanted === plainGuid(itemId)) return sources[0];
  return sources.find((s) => s.Id === wanted || s.ETag === wanted) ?? null;
}

/** Proxy an external subtitle file with the right content type. */
export async function subtitleResponse(sources: Dto[], sourceId: string, index: number, fmt: string): Promise<Response> {
  const wanted = plainGuid(sourceId) || sourceId;
  const src = sources.find((s) => s.Id === wanted || s.ETag === wanted) ?? sources[0];
  const streams = (src?.MediaStreams as Dto[] | undefined) ?? [];
  const sub = streams.find((s) => s.Type === 'Subtitle' && s.Index === index);
  const url = sub?.DeliveryUrl ? subtitleUrlOf(sub) : null;
  if (!url) return new Response('Subtitle not found', { status: 404 });
  try {
    const upstream = await fetch(url, { headers: { accept: '*/*' } });
    if (!upstream.ok) return new Response('Subtitle unavailable', { status: 502 });
    const type = subtitleContentType(subtitleFormat(url) || fmt);
    return new Response(upstream.body, { status: 200, headers: { 'content-type': type, 'cache-control': 'public, max-age=3600' } });
  } catch {
    return new Response('Subtitle unavailable', { status: 502 });
  }
}

/**
 * The DeliveryUrl points back at this server; the upstream file address is
 * kept beside it so the proxy knows where to go without another lookup.
 */
function subtitleUrlOf(stream: Dto): string | null {
  const raw = stream.Path;
  return typeof raw === 'string' && /^https?:\/\//i.test(raw) ? raw : null;
}
