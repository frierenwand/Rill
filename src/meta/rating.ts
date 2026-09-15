/**
 * Age ratings from many countries collapse onto five tiers so a single cap can be
 * compared against whatever certification a provider hands back.
 *
 *   0  everyone        G, TV-Y, TV-G, U, 0, L, AL, T
 *   1  guidance        PG, TV-PG, TV-Y7, 6, 7, 10, UA
 *   2  teens           PG-13, TV-14, 12, 12A, 13, 14, 15, M, MA15+
 *   3  mature          R, TV-MA, 16, 18, 18A, R15+, R16
 *   4  adults only     NC-17, X, R18, R18+, XXX, 19, A
 */

export const MPAA_ORDER = ['G', 'PG', 'PG-13', 'R', 'NC-17'] as const;
export const TV_ORDER = ['TV-Y', 'TV-Y7', 'TV-G', 'TV-PG', 'TV-14', 'TV-MA'] as const;

const TIER_BY_CERT: Record<string, number> = {
  // MPAA
  G: 0, PG: 1, 'PG-13': 2, R: 3, 'NC-17': 4, X: 4,
  // US TV
  'TV-Y': 0, 'TV-G': 0, 'TV-Y7': 1, 'TV-Y7-FV': 1, 'TV-PG': 1, 'TV-14': 2, 'TV-MA': 3,
  // UK / Ireland
  U: 0, UC: 0, '12A': 2, '15A': 2, '16': 3, '18': 3, R18: 4,
  // Germany (FSK) / Austria / Switzerland numeric ages
  '0': 0, '6': 1, '12': 2,
  // France
  '10': 1,
  // Australia
  M: 2, 'MA15+': 2, 'MA 15+': 2, 'R18+': 3, 'X18+': 4, RC: 4,
  // New Zealand
  'R13': 2, 'RP13': 2, 'R15': 2, 'R16': 3, 'RP16': 3,
  // Canada
  '14A': 2, '18A': 3, '13+': 2, '16+': 3, '18+': 3, A: 3, E: 0, C: 0, C8: 1, '13': 2,
  // Japan (Eirin)
  PG12: 2, 'R15+': 2,
  // Korea
  ALL: 0, '15': 2, '19': 4,
  // Brazil
  L: 0, ER: 0, '14': 2,
  // India
  UA: 1, 'UA 7+': 1, 'UA 13+': 2, 'UA 16+': 3, S: 4,
  // Spain / Italy / Netherlands / Nordics
  TP: 0, APTA: 0, '7': 1, '9': 1, T: 0, '6+': 1, '14+': 2, AL: 0,
  '11': 2,
  // Anime sites (MAL / Jikan)
  'R+': 4, RX: 4, 'R - 17+': 3, 'R+ - MILD NUDITY': 4, 'RX - HENTAI': 4,
};

const UNRATED = new Set(['', 'NR', 'UR', 'UNRATED', 'NOT RATED', 'N/A', 'NONE', 'NULL', 'UNKNOWN', 'TBD']);

/** Trim, uppercase, fold spelling variants and strip TV content descriptors (TV-14-DLSV). */
export function normalizeRating(cert: string | null | undefined): string {
  let v = String(cert ?? '').trim().toUpperCase();
  if (!v) return '';
  v = v.replace(/^RATED\s+/, '').replace(/\s+/g, ' ');
  // Jikan spells ratings as "PG-13 - Teens 13 or older"; only the prefix is the rating.
  if (/^(G|PG|PG-13|R|R\+|RX|NC-17)\s*-\s*/.test(v) && !/^R\s*-\s*17/.test(v)) v = v.split(/\s*-\s*/)[0];
  if (/^R\s*-\s*17/.test(v)) return 'R';
  v = v.replace(/^TV-?(Y7|Y|G|PG|14|MA)(?:[- ]?[DLSV]+|-FV)?$/, 'TV-$1');
  if (v === 'PG13') v = 'PG-13';
  if (v === 'NC17') v = 'NC-17';
  if (v === 'FSK 0' || v === 'FSK0') v = '0';
  const fsk = /^FSK\s?(\d+)$/.exec(v);
  if (fsk) v = fsk[1];
  if (v === '12+') v = '12';
  if (v === '15+') v = '15';
  return v;
}

export function isUnrated(cert: string | null | undefined): boolean {
  return UNRATED.has(normalizeRating(cert));
}

/** 0..4 tier, or null when the spelling is unknown. */
export function ratingTier(cert: string | null | undefined): number | null {
  const v = normalizeRating(cert);
  if (!v || UNRATED.has(v)) return null;
  if (v in TIER_BY_CERT) return TIER_BY_CERT[v];
  const num = /^(\d{1,2})\+?$/.exec(v);
  if (num) {
    const age = Number(num[1]);
    if (age <= 3) return 0;
    if (age <= 10) return 1;
    if (age <= 15) return 2;
    if (age <= 18) return 3;
    return 4;
  }
  return null;
}

/** MPAA spelling for a tier, used when a display value needs a common scale. */
export function tierToMpaa(tier: number): string {
  return MPAA_ORDER[Math.max(0, Math.min(MPAA_ORDER.length - 1, tier))];
}

/**
 * Whether titles with no rating pass the cap. Takes the cap string or a config-like
 * object; unrated content is allowed unless the config explicitly sets allowUnrated=false
 * (catalog rows rarely carry a certification, so the strict reading would empty them).
 */
export function allowsUnrated(capOrCfg: string | { ageCap?: string; allowUnrated?: boolean } | null | undefined): boolean {
  if (!capOrCfg || typeof capOrCfg === 'string') return true;
  const hasCap = typeof capOrCfg.ageCap === 'string' && capOrCfg.ageCap !== '' && capOrCfg.ageCap.toLowerCase() !== 'none';
  if (!hasCap) return true;
  return capOrCfg.allowUnrated !== false;
}

/**
 * True when `cert` is at or below the cap. An empty/None cap lets everything through.
 * Unrated content passes unless `allowUnrated` is false. A certification we cannot place
 * on the scale is let through rather than hidden, since catalogs would otherwise empty.
 */
export function passesAgeCap(cert: string | undefined | null, cap: string, allowUnrated = true): boolean {
  const capTier = ratingTier(cap);
  if (capTier === null) return true;
  if (isUnrated(cert)) return allowUnrated;
  const tier = ratingTier(cert);
  if (tier === null) return true;
  return tier <= capTier;
}
