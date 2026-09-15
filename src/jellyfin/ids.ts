/**
 * Jellyfin ids are GUIDs; Stremio ids are strings. Titan has no table to map one
 * to the other, so every GUID it hands out is a self-describing 16-byte record:
 *
 *   byte 0      kind        1 movie, 2 series, 3 season, 4 episode, 5 view, 6 misc
 *   byte 1      hi nibble   flags (bit 0: anime context)
 *               lo nibble   id source: 1 imdb, 2 tmdb, 3 tvdb, 4 kitsu, 5 mal,
 *                           6 anilist, 7 anidb (0 for view/misc)
 *   bytes 2-9   numeric id, u64 big-endian           (view/misc: see below)
 *   bytes 10-11 season, u16, 0xffff when absent
 *   bytes 12-13 episode, u16, 0xffff when absent
 *   bytes 14-15 checksum: FNV-1a over bytes 0-13, folded to 16 bits
 *
 * Views (catalogs) and misc entities (genres, people) have no number to carry.
 * For those bytes 2-5 hold a 32-bit FNV-1a hash of the full label and bytes
 * 6-13 hold the first 8 bytes of the label itself, so a decoder can either
 * match the hash against the labels it knows or fall back to the hint.
 *
 * Input accepts dashed and undashed forms in any case; output is 32 lowercase
 * hex characters. The response layer dashes them for clients whose SDK insists
 * on a well-formed UUID.
 */
import { parseStremioId, type IdSource } from '../stremio/ids';

export type GuidKind = 'movie' | 'series' | 'season' | 'episode' | 'view' | 'misc';

const KIND_CODE: Record<GuidKind, number> = { movie: 1, series: 2, season: 3, episode: 4, view: 5, misc: 6 };
const KIND_OF: Record<number, GuidKind> = { 1: 'movie', 2: 'series', 3: 'season', 4: 'episode', 5: 'view', 6: 'misc' };

const SOURCE_CODE: Record<string, number> = { imdb: 1, tmdb: 2, tvdb: 3, kitsu: 4, mal: 5, anilist: 6, anidb: 7 };
const SOURCE_OF: Record<number, IdSource> = { 1: 'imdb', 2: 'tmdb', 3: 'tvdb', 4: 'kitsu', 5: 'mal', 6: 'anilist', 7: 'anidb' };

const FLAG_ANIME = 0x1;
const NONE = 0xffff;

/** A title-shaped guid: movie, series, season or episode. */
export interface TitleGuid {
  kind: 'movie' | 'series' | 'season' | 'episode';
  source: IdSource;
  num: number;
  anime: boolean;
  season?: number;
  episode?: number;
}

/** A label-shaped guid: a view (catalog) or a misc entity such as a genre. */
interface LabelBase {
  /** Sub-kind for misc: 'genre' | 'person' | 'studio' | ''. Views carry ''. */
  sub: string;
  hash: number;
  hint: string;
}
export interface ViewGuid extends LabelBase { kind: 'view' }
export interface MiscGuid extends LabelBase { kind: 'misc' }
// Two interfaces rather than one with `kind: 'view' | 'misc'`: TypeScript only
// drops a union member per equality check, so a two-literal discriminant would
// survive `!== 'view' && !== 'misc'` and never narrow to TitleGuid.
export type LabelGuid = ViewGuid | MiscGuid;

export type Guid = TitleGuid | LabelGuid;

const MISC_SUB: Record<string, number> = { genre: 1, person: 2, studio: 3 };
const MISC_SUB_OF: Record<number, string> = { 1: 'genre', 2: 'person', 3: 'studio' };

export function fnv1a32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function checksum(bytes: Uint8Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < 14; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ((h >>> 16) ^ (h & 0xffff)) & 0xffff;
}

function toHex(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Strip dashes and braces and lowercase; returns '' for anything that is not 32 hex. */
export function plainGuid(raw: unknown): string {
  const s = String(raw ?? '').replace(/[-{}]/g, '').toLowerCase();
  return /^[0-9a-f]{32}$/.test(s) ? s : '';
}

export function dashGuid(hex32: string): string {
  return `${hex32.slice(0, 8)}-${hex32.slice(8, 12)}-${hex32.slice(12, 16)}-${hex32.slice(16, 20)}-${hex32.slice(20)}`;
}

function writeU16(b: Uint8Array, at: number, v: number): void {
  b[at] = (v >>> 8) & 0xff;
  b[at + 1] = v & 0xff;
}
function readU16(b: Uint8Array, at: number): number {
  return (b[at] << 8) | b[at + 1];
}

function writeU64(b: Uint8Array, at: number, v: number): void {
  let big = BigInt(Math.max(0, Math.floor(v)));
  for (let i = 7; i >= 0; i--) {
    b[at + i] = Number(big & 0xffn);
    big >>= 8n;
  }
}
function readU64(b: Uint8Array, at: number): number {
  let big = 0n;
  for (let i = 0; i < 8; i++) big = (big << 8n) | BigInt(b[at + i]);
  return Number(big);
}

function seal(bytes: Uint8Array): string {
  writeU16(bytes, 14, checksum(bytes));
  return toHex(bytes);
}

function encodeTitle(g: TitleGuid): string {
  const b = new Uint8Array(16);
  b[0] = KIND_CODE[g.kind];
  b[1] = ((g.anime ? FLAG_ANIME : 0) << 4) | (SOURCE_CODE[g.source] ?? 0);
  writeU64(b, 2, g.num);
  writeU16(b, 10, g.season === undefined ? NONE : Math.min(NONE - 1, Math.max(0, g.season)));
  writeU16(b, 12, g.episode === undefined ? NONE : Math.min(NONE - 1, Math.max(0, g.episode)));
  return seal(b);
}

function packLabel(kind: 'view' | 'misc', sub: string, hash: number, hint: string): string {
  const b = new Uint8Array(16);
  b[0] = KIND_CODE[kind];
  b[1] = kind === 'misc' ? MISC_SUB[sub] ?? 0 : 0;
  b[2] = (hash >>> 24) & 0xff;
  b[3] = (hash >>> 16) & 0xff;
  b[4] = (hash >>> 8) & 0xff;
  b[5] = hash & 0xff;
  const bytes = new TextEncoder().encode(hint.toLowerCase());
  for (let i = 0; i < 8; i++) b[6 + i] = bytes[i] ?? 0;
  return seal(b);
}

function encodeLabel(kind: 'view' | 'misc', sub: string, label: string): string {
  return packLabel(kind, sub, fnv1a32(label), label);
}

/** A decoded label guid re-encodes from its stored hash, not by re-hashing the truncated hint. */
export function encodeGuid(g: Guid): string {
  if (g.kind === 'view' || g.kind === 'misc') return packLabel(g.kind, g.sub, g.hash, g.hint);
  return encodeTitle(g);
}

export function decodeGuid(raw: unknown): Guid | null {
  const hex = plainGuid(raw);
  if (!hex) return null;
  const b = fromHex(hex);
  if (readU16(b, 14) !== checksum(b)) return null;
  const kind = KIND_OF[b[0]];
  if (!kind) return null;

  if (kind === 'view' || kind === 'misc') {
    const hash = ((b[2] << 24) | (b[3] << 16) | (b[4] << 8) | b[5]) >>> 0;
    const hintBytes = b.slice(6, 14);
    let end = 8;
    while (end > 0 && hintBytes[end - 1] === 0) end--;
    const hint = new TextDecoder().decode(hintBytes.slice(0, end));
    if (kind === 'misc') return { kind: 'misc', sub: MISC_SUB_OF[b[1]] ?? '', hash, hint };
    return { kind: 'view', sub: '', hash, hint };
  }

  const source = SOURCE_OF[b[1] & 0x0f];
  if (!source) return null;
  const season = readU16(b, 10);
  const episode = readU16(b, 12);
  const g: TitleGuid = { kind, source, num: readU64(b, 2), anime: ((b[1] >>> 4) & FLAG_ANIME) === FLAG_ANIME };
  if (season !== NONE) g.season = season;
  if (episode !== NONE) g.episode = episode;
  if (kind === 'season' && g.season === undefined) return null;
  if (kind === 'episode' && g.episode === undefined) return null;
  return g;
}

// ---------- Stremio <-> guid helpers ----------

const ANIME_SOURCES = new Set<IdSource>(['kitsu', 'mal', 'anilist', 'anidb']);

/** Numeric root of a Stremio title id, or null when it has no number to pack. */
export function titleRoot(stremioId: string): { source: IdSource; num: number } | null {
  const p = parseStremioId(stremioId);
  if (p.source === 'other' || p.num === undefined || !Number.isFinite(p.num)) return null;
  if (!SOURCE_CODE[p.source]) return null;
  return { source: p.source, num: p.num };
}

/** Rebuild the Stremio title id from a packed source + number. */
export function stremioTitleId(source: IdSource, num: number): string {
  if (source === 'imdb') return `tt${String(num).padStart(7, '0')}`;
  return `${source}:${num}`;
}

export function isAnimeSource(source: IdSource): boolean {
  return ANIME_SOURCES.has(source);
}

export function movieIdOf(stremioId: string, anime = false): string | null {
  const root = titleRoot(stremioId);
  return root ? encodeTitle({ kind: 'movie', ...root, anime: anime || isAnimeSource(root.source) }) : null;
}

export function seriesIdOf(stremioId: string, anime = false): string | null {
  const root = titleRoot(stremioId);
  return root ? encodeTitle({ kind: 'series', ...root, anime: anime || isAnimeSource(root.source) }) : null;
}

export function seasonIdOf(series: TitleGuid, season: number): string {
  return encodeTitle({ kind: 'season', source: series.source, num: series.num, anime: series.anime, season });
}

export function episodeIdOf(series: TitleGuid, season: number, episode: number): string {
  return encodeTitle({ kind: 'episode', source: series.source, num: series.num, anime: series.anime, season, episode });
}

/** The series guid an episode or season belongs to. */
export function parentSeriesOf(g: TitleGuid): TitleGuid {
  return { kind: 'series', source: g.source, num: g.num, anime: g.anime };
}

export function viewIdOf(type: string, catalogId: string): string {
  return encodeLabel('view', '', `${type}|${catalogId}`);
}

export function viewHash(type: string, catalogId: string): number {
  return fnv1a32(`${type}|${catalogId}`);
}

export function genreIdOf(name: string): string {
  return encodeLabel('misc', 'genre', name);
}

export function personIdOf(name: string): string {
  return encodeLabel('misc', 'person', name);
}

/** Stremio id a title guid refers to (the series id for seasons and episodes). */
export function stremioIdOfGuid(g: TitleGuid): string {
  return stremioTitleId(g.source, g.num);
}
