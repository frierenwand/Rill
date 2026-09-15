/**
 * Title search for the Stremio search catalog and for Jellyfin's search box.
 * Providers come from cfg.search.providers via the meta layer; anime types add
 * the anime layer. Results are merged and ranked here.
 */
import type { Ctx } from '../context';
import type { ContentType, MetaPreview } from '../stremio/types';
import { parseStremioId } from '../stremio/ids';
import { uniq } from '../util/concurrency';
import { metaApi } from '../meta/index';
import { animeApi } from '../meta/anime/index';
import { aiQuery,aiSearch } from './ai';

export const SEARCH_PAGE = 20;

export interface ParsedQuery {
  /** Query with a trailing "(2019)" / "2019" removed, trimmed and de-noised. */
  text: string;
  /** Year the user typed after the title, when any. */
  year?: number;
  /** Raw IMDb id when the user pasted one. */
  imdb?: string;
}

/** Split a typed query into title and optional year; recognise pasted IMDb ids. */
export function parseQuery(raw: string): ParsedQuery {
  const q = String(raw || '').trim().replace(/\s+/g, ' ');
  const imdb = /^tt\d{6,9}$/i.exec(q);
  if (imdb) return { text: q, imdb: q.toLowerCase() };
  const m = /^(.*\S)\s*\(?((?:19|20)\d{2})\)?$/.exec(q);
  if (m && m[1].length >= 2) return { text: m[1].trim(), year: Number(m[2]) };
  return { text: q };
}

/** Comparison key: lowercase, ASCII-folded, no punctuation, no leading article. */
export function normalizeTitle(s: string): string {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/^(the|a|an) /, '')
    .trim();
}

function yearOf(m: MetaPreview): number | undefined {
  const y = m.year ?? m.releaseInfo;
  const n = Number(String(y ?? '').slice(0, 4));
  return Number.isFinite(n) && n > 1800 ? n : undefined;
}

function ratingOf(m: MetaPreview): number {
  const r = Number(m.imdbRating);
  return Number.isFinite(r) ? r : 0;
}

/** Rank: exact title first, then year match, then rating and recency as popularity proxies. */
export function rankResults(items: MetaPreview[], parsed: ParsedQuery): MetaPreview[] {
  const want = normalizeTitle(parsed.text);
  const scored = items.map((m, i) => {
    const title = normalizeTitle(m.name);
    const y = yearOf(m);
    let score = 0;
    if (title === want) score += 1000;
    else if (title.startsWith(want)) score += 400;
    else if (title.includes(want)) score += 200;
    if (parsed.year && y) score += y === parsed.year ? 300 : Math.abs(y - parsed.year) <= 1 ? 100 : 0;
    score += ratingOf(m) * 10;
    if (y) score += Math.max(0, 30 - (new Date().getUTCFullYear() - y));
    if (m.poster) score += 5;
    return { m, score, i };
  });
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  return scored.map((s) => s.m);
}

async function lookupById(ctx: Ctx, type: ContentType, id: string): Promise<MetaPreview[]> {
  try {
    const meta = await metaApi.resolveMeta(ctx, type, id);
    return meta ? [meta] : [];
  } catch {
    return [];
  }
}

/**
 * Search every configured provider for one type, merge, rank and page.
 * Providers are asked for enough rows to fill this page from the top so the
 * merged ranking stays stable across pages.
 */
export async function unifiedSearch(ctx: Ctx, type: ContentType, rawQuery: string, skip = 0): Promise<MetaPreview[]> {
  const request=aiQuery(ctx,rawQuery);if(request)return aiSearch(ctx,type,request,skip);
  const parsed = parseQuery(rawQuery);
  if (!parsed.text) return [];
  if (parsed.imdb) return skip > 0 ? [] : lookupById(ctx, type, parsed.imdb);
  const direct = parseStremioId(parsed.text);
  if (direct.source !== 'other' && direct.source !== 'imdb' && direct.num) return skip > 0 ? [] : lookupById(ctx, type, direct.title);

  const want = skip + SEARCH_PAGE;
  const tasks: Array<Promise<MetaPreview[]>> = [
    metaApi.searchMeta(ctx, type, parsed.text, { skip: 0, limit: want }).catch(() => [] as MetaPreview[]),
  ];
  const animeProviders = ctx.cfg.search.providers.some((p) => p === 'mal' || p === 'anilist' || p === 'kitsu');
  if (type === 'anime' || animeProviders) {
    tasks.push(animeApi.animeSearch(ctx, parsed.text, { skip: 0, limit: want }).catch(() => [] as MetaPreview[]));
  }
  const results = (await Promise.all(tasks)).flat();

  const typed = results
    .filter((m) => m && m.id && m.name)
    .map((m) => (type === 'anime' || !m.type ? { ...m, type: m.type || type } : m))
    // A movie search should not surface series and vice versa; anime accepts both.
    .filter((m) => type === 'anime' || m.type === type || m.type === 'anime');
  const merged = uniq(typed, (m) => m.id);
  const ranked = rankResults(merged, parsed);
  return ranked.slice(skip, skip + SEARCH_PAGE);
}
