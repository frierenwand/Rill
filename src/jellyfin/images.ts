/**
 * Artwork. Jellyfin clients load images with a plain <img>, so these routes
 * are anonymous and answer with a redirect to the provider's own URL. Sizing
 * parameters (fillWidth, maxHeight, quality, tag) are accepted and ignored.
 */
import type { Meta } from '../stremio/types';
import { decodeGuid } from './ids';
import type { Library } from './library';

export type ImageKind = 'primary' | 'backdrop' | 'logo' | 'thumb' | 'banner' | 'art';

function pickTitleImage(meta: Meta, kind: ImageKind): string | undefined {
  switch (kind) {
    case 'primary':
      return meta.poster || meta.background;
    case 'backdrop':
    case 'thumb':
    case 'art':
    case 'banner':
      return meta.background || meta.poster;
    case 'logo':
      return meta.logo;
    default:
      return undefined;
  }
}

/** The URL an item's image lives at, or null. */
export async function imageUrlFor(lib: Library, itemId: string, kindRaw: string): Promise<string | null> {
  const kind = kindRaw.toLowerCase() as ImageKind;
  const g = decodeGuid(itemId);
  if (!g || g.kind === 'view' || g.kind === 'misc') return null;

  if (g.kind === 'movie' || g.kind === 'series') {
    const meta = await lib.meta(g);
    return meta ? pickTitleImage(meta, kind) ?? null : null;
  }

  const show = await lib.show(g);
  if (!show) return null;
  if (g.kind === 'season') {
    // Metas carry no per-season art; the series poster stands in.
    return pickTitleImage(show.meta, kind === 'primary' ? 'primary' : kind) ?? null;
  }
  const ep = lib.findEpisode(show, g);
  if (kind === 'primary') return ep?.video.thumbnail || show.meta.background || show.meta.poster || null;
  return pickTitleImage(show.meta, kind) ?? null;
}

export function redirectTo(url: string): Response {
  return new Response(null, { status: 302, headers: { location: url, 'cache-control': 'public, max-age=86400' } });
}
