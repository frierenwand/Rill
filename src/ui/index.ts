/**
 * Configure page and its helper API.
 *
 * Everything under /api/* is stateless: config encode/decode, a catalog preview built from a
 * draft config, an addon manifest probe, and thin pass-throughs to tracker OAuth endpoints so
 * the browser never has to talk to a provider that lacks CORS. Nothing here logs or caches
 * secrets, and every POST answers with `Cache-Control: no-store`.
 */
import { Hono } from 'hono';
import type { Ctx } from '../context';
import type { Env } from '../env';
import { normalizeConfig, type TitanConfig } from '../config/schema';
import { decodeConfig, encodeConfig } from '../config/codec';
import { getManifest } from '../stremio/client';
import { sha256 } from '../util/bytes';
import { listCatalogDefinitions } from '../addon/catalogs';
import { renderPage, renderLogo } from './page';

export const uiRouter = new Hono<{ Variables: { ctx?: Ctx }; Bindings: Env }>();

const TRAKT_API = 'https://api.trakt.tv';
const SIMKL_API = 'https://api.simkl.com';
const MAL_TOKEN_URL = 'https://myanimelist.net/v1/oauth2/token';
const UPSTREAM_TIMEOUT_MS = 15000;

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------

type Json = Record<string, unknown>;

async function readBody(req: Request): Promise<Json> {
  try {
    const data: unknown = await req.json();
    return data && typeof data === 'object' && !Array.isArray(data) ? (data as Json) : {};
  } catch {
    return {};
  }
}

function field(body: Json, key: string): string {
  const v = body[key];
  return typeof v === 'string' ? v.trim() : '';
}

/** fetch with a hard timeout; returns status + parsed JSON (or null when the body is not JSON). */
async function upstream(url: string, init: RequestInit = {}): Promise<{ status: number; data: Json | null }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    let data: Json | null = null;
    try {
      const parsed: unknown = await res.json();
      data = parsed && typeof parsed === 'object' ? (parsed as Json) : null;
    } catch {
      data = null;
    }
    return { status: res.status, data };
  } catch {
    return { status: 0, data: null };
  } finally {
    clearTimeout(timer);
  }
}

function num(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function expiryFrom(expiresIn: unknown): number | undefined {
  const secs = num(expiresIn);
  return secs === undefined ? undefined : Date.now() + secs * 1000;
}

/** Pull a config token out of whatever the user pasted: bare token, install URL, stremio:// link. */
async function tokenFromInput(input: string): Promise<{ token: string; config: TitanConfig } | null> {
  const raw = input.trim();
  if (!raw) return null;
  const candidates: string[] = [];
  const asUrl = raw.replace(/^stremio:\/\//i, 'https://');
  if (/^https?:\/\//i.test(asUrl)) {
    try {
      const u = new URL(asUrl);
      for (const seg of u.pathname.split('/')) {
        if (seg) candidates.push(decodeURIComponent(seg));
      }
    } catch {
      /* fall through to treating it as a token */
    }
  }
  candidates.push(raw);
  // Longest segment first: the config token is by far the longest path part.
  candidates.sort((a, b) => b.length - a.length);
  for (const token of candidates) {
    if (token.length < 8) continue;
    const config = await decodeConfig(token);
    if (config) return { token, config };
  }
  return null;
}

async function buildCtx(cfg: TitanConfig, env: Env | undefined, origin: string): Promise<Ctx> {
  const cfgToken = await encodeConfig(cfg);
  const scope = (await sha256(cfgToken)).slice(0, 16);
  return {
    cfg,
    env: env ?? {},
    cfgToken,
    origin,
    scope,
    lang: (cfg.language || 'en').slice(0, 2).toLowerCase(),
    tmdbKey: cfg.keys.tmdb || env?.TMDB_KEY,
  };
}

// ---------------------------------------------------------------------------------------------
// Static
// ---------------------------------------------------------------------------------------------

uiRouter.get('/', (c) => {
  return c.html(renderPage(), 200, { 'Cache-Control': 'public, max-age=300' });
});

uiRouter.get('/logo.svg', (c) => {
  return c.body(renderLogo(), 200, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
});

// Every API answer is per-request and may carry secrets: never cache.
uiRouter.use('/api/*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store');
});

// ---------------------------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------------------------

uiRouter.post('/api/config/encode', async (c) => {
  const body = await readBody(c.req.raw);
  const cfg = normalizeConfig(body);
  const token = await encodeConfig(cfg);
  return c.json({ token });
});

uiRouter.post('/api/config/decode', async (c) => {
  const body = await readBody(c.req.raw);
  const found = await tokenFromInput(field(body, 'input'));
  if (!found) return c.json({ error: 'Not a valid config token or install URL.' }, 400);
  return c.json({ config: found.config, token: found.token });
});

// ---------------------------------------------------------------------------------------------
// Catalog preview and addon probe
// ---------------------------------------------------------------------------------------------

uiRouter.post('/api/catalogs', async (c) => {
  const body = await readBody(c.req.raw);
  const cfg = normalizeConfig(body);
  const origin = new URL(c.req.url).origin;
  try {
    const ctx = await buildCtx(cfg, c.env, origin);
    const catalogs = await listCatalogDefinitions(ctx);
    return c.json({ catalogs });
  } catch {
    return c.json({ error: 'Catalog list is unavailable right now.', catalogs: [] }, 502);
  }
});

uiRouter.post('/api/probe', async (c) => {
  const body = await readBody(c.req.raw);
  const url = field(body, 'url');
  if (!url) return c.json({ error: 'Missing url.' }, 400);
  const manifest = await getManifest(url);
  if (!manifest) return c.json({ error: 'No manifest found at that address.' }, 502);
  const resources = (manifest.resources || []).map((r) => (typeof r === 'string' ? r : r.name));
  return c.json({
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    resources: [...new Set(resources)],
    types: manifest.types || [],
    catalogs: (manifest.catalogs || []).length,
    idPrefixes: manifest.idPrefixes || [],
  });
});

// ---------------------------------------------------------------------------------------------
// Trakt: device code flow
// ---------------------------------------------------------------------------------------------

function traktHeaders(clientId: string, bearer?: string): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'trakt-api-version': '2',
    'trakt-api-key': clientId,
  };
  if (bearer) h.Authorization = `Bearer ${bearer}`;
  return h;
}

uiRouter.post('/api/oauth/trakt/device', async (c) => {
  const body = await readBody(c.req.raw);
  const clientId = field(body, 'clientId');
  if (!clientId) return c.json({ error: 'Missing clientId.' }, 400);
  const r = await upstream(`${TRAKT_API}/oauth/device/code`, {
    method: 'POST',
    headers: traktHeaders(clientId),
    body: JSON.stringify({ client_id: clientId }),
  });
  if (r.status !== 200 || !r.data) return c.json({ error: `Trakt refused the request (${r.status || 'network'}).` }, 502);
  return c.json({
    deviceCode: r.data.device_code,
    userCode: r.data.user_code,
    verificationUrl: r.data.verification_url,
    expiresIn: num(r.data.expires_in) ?? 600,
    interval: num(r.data.interval) ?? 5,
  });
});

uiRouter.post('/api/oauth/trakt/token', async (c) => {
  const body = await readBody(c.req.raw);
  const clientId = field(body, 'clientId');
  const clientSecret = field(body, 'clientSecret');
  const deviceCode = field(body, 'deviceCode');
  if (!clientId || !clientSecret || !deviceCode) return c.json({ error: 'Missing clientId, clientSecret or deviceCode.' }, 400);
  const r = await upstream(`${TRAKT_API}/oauth/device/token`, {
    method: 'POST',
    headers: traktHeaders(clientId),
    body: JSON.stringify({ code: deviceCode, client_id: clientId, client_secret: clientSecret }),
  });
  if (r.status === 400) return c.json({ pending: true });
  if (r.status === 429) return c.json({ pending: true, slowDown: true });
  if (r.status === 404) return c.json({ error: 'Trakt does not know this device code.' }, 400);
  if (r.status === 409) return c.json({ error: 'This code was already used.' }, 400);
  if (r.status === 410) return c.json({ error: 'The code expired. Start again.' }, 400);
  if (r.status === 418) return c.json({ error: 'You denied the request on Trakt.' }, 400);
  if (r.status !== 200 || !r.data || typeof r.data.access_token !== 'string') {
    return c.json({ error: `Trakt answered ${r.status || 'nothing'}.` }, 502);
  }
  const accessToken = r.data.access_token;
  let username: string | undefined;
  const me = await upstream(`${TRAKT_API}/users/settings`, { headers: traktHeaders(clientId, accessToken) });
  const user = me.data?.user;
  if (user && typeof user === 'object' && typeof (user as Json).username === 'string') username = (user as Json).username as string;
  return c.json({
    accessToken,
    refreshToken: typeof r.data.refresh_token === 'string' ? r.data.refresh_token : undefined,
    expiresAt: expiryFrom(r.data.expires_in),
    username,
  });
});

uiRouter.post('/api/oauth/trakt/refresh', async (c) => {
  const body = await readBody(c.req.raw);
  const clientId = field(body, 'clientId');
  const clientSecret = field(body, 'clientSecret');
  const refreshToken = field(body, 'refreshToken');
  if (!clientId || !clientSecret || !refreshToken) return c.json({ error: 'Missing clientId, clientSecret or refreshToken.' }, 400);
  const r = await upstream(`${TRAKT_API}/oauth/token`, {
    method: 'POST',
    headers: traktHeaders(clientId),
    body: JSON.stringify({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: 'urn:ietf:wg:oauth:2.0:oob',
      grant_type: 'refresh_token',
    }),
  });
  if (r.status !== 200 || !r.data || typeof r.data.access_token !== 'string') {
    return c.json({ error: `Trakt refused the refresh (${r.status || 'network'}).` }, 502);
  }
  return c.json({
    accessToken: r.data.access_token,
    refreshToken: typeof r.data.refresh_token === 'string' ? r.data.refresh_token : refreshToken,
    expiresAt: expiryFrom(r.data.expires_in),
  });
});

// ---------------------------------------------------------------------------------------------
// Simkl: PIN flow
// ---------------------------------------------------------------------------------------------

uiRouter.post('/api/oauth/simkl/pin', async (c) => {
  const body = await readBody(c.req.raw);
  const clientId = field(body, 'clientId');
  if (!clientId) return c.json({ error: 'Missing clientId.' }, 400);
  const q = new URLSearchParams({ client_id: clientId });
  const redirect = field(body, 'redirect');
  if (redirect) q.set('redirect', redirect);
  const r = await upstream(`${SIMKL_API}/oauth/pin?${q}`, { headers: { 'simkl-api-key': clientId } });
  if (r.status !== 200 || !r.data || r.data.result !== 'OK' || !r.data.user_code) {
    return c.json({ error: `Simkl did not hand out a PIN (${r.status || 'network'}).` }, 502);
  }
  return c.json({
    userCode: String(r.data.user_code),
    verificationUrl: typeof r.data.verification_url === 'string' ? r.data.verification_url : 'https://simkl.com/pin',
    expiresIn: num(r.data.expires_in) ?? 900,
    interval: num(r.data.interval) ?? 5,
  });
});

uiRouter.post('/api/oauth/simkl/poll', async (c) => {
  const body = await readBody(c.req.raw);
  const clientId = field(body, 'clientId');
  const userCode = field(body, 'userCode');
  if (!clientId || !userCode) return c.json({ error: 'Missing clientId or userCode.' }, 400);
  const q = new URLSearchParams({ client_id: clientId });
  const r = await upstream(`${SIMKL_API}/oauth/pin/${encodeURIComponent(userCode)}?${q}`, { headers: { 'simkl-api-key': clientId } });
  if (r.status === 200 && r.data?.result === 'OK' && typeof r.data.access_token === 'string') {
    return c.json({ accessToken: r.data.access_token });
  }
  const message = typeof r.data?.message === 'string' ? r.data.message.toLowerCase() : '';
  if (message.includes('slow')) return c.json({ pending: true, slowDown: true });
  if (r.status === 200 && r.data?.result === 'OK' && r.data.device_code) {
    // Simkl replays the first-step body once the PIN is gone: start over.
    return c.json({ error: 'The PIN expired. Start again.' }, 400);
  }
  if (r.status === 0) return c.json({ pending: true });
  if (r.status >= 500) return c.json({ pending: true });
  if (r.status !== 200 && r.status !== 400) return c.json({ error: `Simkl answered ${r.status}.` }, 502);
  return c.json({ pending: true });
});

// ---------------------------------------------------------------------------------------------
// MyAnimeList: PKCE (plain) code exchange
// ---------------------------------------------------------------------------------------------

uiRouter.post('/api/oauth/mal/token', async (c) => {
  const body = await readBody(c.req.raw);
  const clientId = field(body, 'clientId');
  const code = field(body, 'code');
  const verifier = field(body, 'verifier');
  if (!clientId || !code || !verifier) return c.json({ error: 'Missing clientId, code or verifier.' }, 400);
  const form = new URLSearchParams({
    client_id: clientId,
    grant_type: 'authorization_code',
    code,
    code_verifier: verifier,
  });
  const clientSecret = field(body, 'clientSecret');
  if (clientSecret) form.set('client_secret', clientSecret);
  const redirectUri = field(body, 'redirectUri');
  if (redirectUri) form.set('redirect_uri', redirectUri);
  const r = await upstream(MAL_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  if (r.status !== 200 || !r.data || typeof r.data.access_token !== 'string') {
    const why = typeof r.data?.error === 'string' ? r.data.error : String(r.status || 'network');
    return c.json({ error: `MyAnimeList refused the code (${why}).` }, 502);
  }
  return c.json({
    accessToken: r.data.access_token,
    refreshToken: typeof r.data.refresh_token === 'string' ? r.data.refresh_token : undefined,
    expiresAt: expiryFrom(r.data.expires_in),
  });
});
