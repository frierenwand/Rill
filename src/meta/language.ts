/**
 * Language tag helpers. Config carries a BCP-47 tag like 'pt-BR'; each upstream wants
 * its own spelling: TMDB takes 'pt-BR', TVDB wants ISO 639-2 ('por', with 'pt' for
 * Brazilian Portuguese as a TVDB quirk), fanart.tv wants the bare 2-letter code.
 */

export interface LangParts {
  /** Lowercase 2-letter (or 3-letter) language, e.g. 'pt'. */
  lang: string;
  /** Uppercase region when present, e.g. 'BR'. */
  region?: string;
}

export function splitLanguageTag(tag: string | undefined | null): LangParts {
  const raw = String(tag || '').trim().replace(/_/g, '-');
  if (!raw) return { lang: 'en' };
  const [l, r] = raw.split('-');
  const lang = (l || 'en').toLowerCase();
  const region = r && /^[a-z]{2}$/i.test(r) ? r.toUpperCase() : undefined;
  return { lang, region };
}

/** 'pt-BR' -> 'pt-BR', 'de' -> 'de'. TMDB accepts either form. */
export function tmdbLanguage(tag: string | undefined): string {
  const { lang, region } = splitLanguageTag(tag);
  return region ? `${lang}-${region}` : lang;
}

/** Region for certifications / release dates, defaulting to US. */
export function regionOf(tag: string | undefined, fallback = 'US'): string {
  return splitLanguageTag(tag).region || fallback;
}

/** fanart.tv labels images with bare 2-letter codes ('00' means textless). */
export function fanartLanguage(tag: string | undefined): string {
  return splitLanguageTag(tag).lang;
}

/**
 * ISO 639-1 -> 639-2/T for the languages TMDB offers translations in. Anything not
 * listed falls back to English rather than sending TVDB a code it will reject.
 */
const ISO2_TO_3: Record<string, string> = {
  aa: 'aar', ab: 'abk', af: 'afr', am: 'amh', ar: 'ara', as: 'asm', ay: 'aym', az: 'aze',
  ba: 'bak', be: 'bel', bg: 'bul', bn: 'ben', bo: 'bod', br: 'bre', bs: 'bos',
  ca: 'cat', cs: 'ces', cy: 'cym', da: 'dan', de: 'deu', el: 'ell', en: 'eng', eo: 'epo',
  es: 'spa', et: 'est', eu: 'eus', fa: 'fas', fi: 'fin', fo: 'fao', fr: 'fra', fy: 'fry',
  ga: 'gle', gd: 'gla', gl: 'glg', gu: 'guj', he: 'heb', hi: 'hin', hr: 'hrv', hu: 'hun',
  hy: 'hye', id: 'ind', is: 'isl', it: 'ita', ja: 'jpn', ka: 'kat', kk: 'kaz', km: 'khm',
  kn: 'kan', ko: 'kor', ku: 'kur', ky: 'kir', la: 'lat', lb: 'ltz', lo: 'lao', lt: 'lit',
  lv: 'lav', mk: 'mkd', ml: 'mal', mn: 'mon', mr: 'mar', ms: 'msa', mt: 'mlt', my: 'mya',
  nb: 'nob', ne: 'nep', nl: 'nld', nn: 'nno', no: 'nor', pa: 'pan', pl: 'pol', ps: 'pus',
  pt: 'por', ro: 'ron', ru: 'rus', si: 'sin', sk: 'slk', sl: 'slv', sq: 'sqi', sr: 'srp',
  sv: 'swe', sw: 'swa', ta: 'tam', te: 'tel', tg: 'tgk', th: 'tha', tl: 'tgl', tr: 'tur',
  uk: 'ukr', ur: 'urd', uz: 'uzb', vi: 'vie', yi: 'yid', zh: 'zho', zu: 'zul',
};

/** 3-letter code TVDB understands. 'pt-BR' is 'pt' on TVDB; everything else is 639-2/T. */
export function tvdbLanguage(tag: string | undefined): string {
  const { lang, region } = splitLanguageTag(tag);
  if (lang === 'pt' && region === 'BR') return 'pt';
  if (lang.length === 3) return lang;
  return ISO2_TO_3[lang] || 'eng';
}

/** Preferred language first, then English, deduplicated. */
export function languageChain(tag: string | undefined): string[] {
  const { lang } = splitLanguageTag(tag);
  return lang === 'en' ? ['en'] : [lang, 'en'];
}

/** Same chain in TVDB spelling. */
export function tvdbLanguageChain(tag: string | undefined): string[] {
  const l = tvdbLanguage(tag);
  return l === 'eng' ? ['eng'] : [l, 'eng'];
}
