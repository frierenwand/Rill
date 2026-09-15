/**
 * Client for external Stremio addons the user pasted in (meta, stream, subtitle).
 * Manifests and catalog/meta responses are cached; streams are cached briefly.
 */
import type { Ctx } from '../context';
import { fetchJson, memo } from '../util/cache';
import { mapLimit, uniq } from '../util/concurrency';
import type { ContentType, Manifest, Meta, MetaPreview, Stream, Subtitle } from './types';

export function addonBase(manifestUrl: string): string | null {
  try {
    let u = manifestUrl.trim();
    if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
    u = u.replace(/\/manifest\.json(\?.*)?$/i, '').replace(/\/+$/, '');
    const parsed = new URL(u);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return u;
  } catch {
    return null;
  }
}

export async function getManifest(manifestUrl: string): Promise<Manifest | null> {
  const base = addonBase(manifestUrl);
  if (!base) return null;
  return fetchJson<Manifest>(`${base}/manifest.json`, { ttl: 3600 });
}

function resourceSupports(manifest: Manifest, resource: string, type: string, id?: string): boolean {
  for (const r of manifest.resources || []) {
    if (typeof r === 'string') {
      if (r !== resource) continue;
      if (manifest.types?.length && !manifest.types.includes(type)) continue;
      if (id && manifest.idPrefixes?.length && !manifest.idPrefixes.some((p) => id.startsWith(p))) continue;
      return true;
    }
    if (r.name !== resource) continue;
    if (r.types?.length && !r.types.includes(type)) continue;
    if (id && r.idPrefixes?.length && !r.idPrefixes.some((p) => id.startsWith(p))) continue;
    return true;
  }
  return false;
}

export async function addonCatalog(base: string, type: ContentType, id: string, extra: Record<string, string | number | undefined> = {}): Promise<MetaPreview[]> {
  const parts = Object.entries(extra).filter(([, v]) => v !== undefined && v !== '' && v !== 0).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  const url = `${base}/catalog/${type}/${encodeURIComponent(id)}${parts.length ? `/${parts.join('&')}` : ''}.json`;
  const data = await fetchJson<{ metas?: MetaPreview[] }>(url, { ttl: 600 });
  return data?.metas ?? [];
}

export async function addonMeta(base: string, type: ContentType, id: string): Promise<Meta | null> {
  const data = await fetchJson<{ meta?: Meta }>(`${base}/meta/${type}/${encodeURIComponent(id)}.json`, { ttl: 1800 });
  return data?.meta ?? null;
}

/** Meta from the first configured meta addon that answers. */
export async function externalMeta(ctx: Ctx, type: ContentType, id: string): Promise<Meta | null> {
  for (const url of ctx.cfg.addons.meta) {
    const base = addonBase(url);
    if (!base) continue;
    const manifest = await getManifest(url);
    if (manifest && !resourceSupports(manifest, 'meta', type, id)) continue;
    const meta = await addonMeta(base, type, id);
    if (meta) return meta;
  }
  return null;
}

export interface SourcedStream extends Stream {
  /** Which addon produced it. */
  addon: string;
}

/** Streams from every stream addon, in config order, one round of requests. */
export async function externalStreams(ctx: Ctx, type: ContentType, id: string): Promise<SourcedStream[]> {
  const key = `streams:${ctx.scope}:${type}:${id}`;
  return memo(key, 120, async () => {
    const results = await mapLimit(ctx.cfg.addons.stream, 6, async (url) => {
      const base = addonBase(url);
      if (!base) return [] as SourcedStream[];
      const manifest = await getManifest(url);
      if (manifest && !resourceSupports(manifest, 'stream', type, id)) return [];
      const data = await fetchJson<{ streams?: Stream[] }>(`${base}/stream/${type}/${encodeURIComponent(id)}.json`, { ttl: 0, timeoutMs: 20000 });
      const name = manifest?.name || base;
      return (data?.streams ?? []).map((s) => ({ ...s, addon: name }));
    });
    return uniq(results.flat(), (s) => s.url || s.infoHash || s.externalUrl || s.ytId || JSON.stringify(s));
  });
}

export async function externalSubtitles(ctx: Ctx, type: ContentType, id: string, extra: { filename?: string; videoHash?: string; videoSize?: number } = {}): Promise<Subtitle[]> {
  const parts = Object.entries(extra).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  const results = await mapLimit(ctx.cfg.addons.subtitle, 6, async (url) => {
    const base = addonBase(url);
    if (!base) return [] as Subtitle[];
    const manifest = await getManifest(url);
    if (manifest && !resourceSupports(manifest, 'subtitles', type, id)) return [];
    const path = `${base}/subtitles/${type}/${encodeURIComponent(id)}${parts.length ? `/${parts.join('&')}` : ''}.json`;
    const data = await fetchJson<{ subtitles?: Subtitle[] }>(path, { ttl: 600 });
    return data?.subtitles ?? [];
  });
  return uniq(results.flat(), (s) => s.url);
}

/** Catalogs exposed by the user's external meta addons, for aggregation into Rill's manifest. */
export async function externalCatalogs(ctx: Ctx): Promise<Array<{ base: string; addonName: string; catalog: Manifest['catalogs'][number] }>> {
  const out: Array<{ base: string; addonName: string; catalog: Manifest['catalogs'][number] }> = [];
  for (const url of ctx.cfg.addons.meta) {
    const base = addonBase(url);
    const manifest = base ? await getManifest(url) : null;
    if (!base || !manifest) continue;
    for (const catalog of manifest.catalogs || []) out.push({ base, addonName: manifest.name, catalog });
  }
  return out;
}
