import { Hono } from 'hono';
import type { Env } from './env';
import type { Ctx } from './context';
import { decodeConfig } from './config/codec';
import { sha256 } from './util/bytes';
import { addonRouter } from './addon/index';
import { jellyfinRouter, handleJellyfinSocket } from './jellyfin/index';
import { uiRouter } from './ui/index';
import { ensureSchema } from './storage/migrate';

type App = { Bindings: Env; Variables: { ctx: Ctx } };

const app = new Hono<App>();

app.use('*', async (c, next) => {
  if (c.env.DB) await ensureSchema(c.env.DB);
  await next();
  c.res.headers.set('Access-Control-Allow-Origin', c.req.header('origin') || '*');
  c.res.headers.set('Access-Control-Allow-Headers', '*');
  c.res.headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  c.res.headers.set('Access-Control-Allow-Credentials', 'true');
});
app.options('*', (c) => c.body(null, 204));

async function buildCtx(c: { req: { url: string; raw: Request }; env: Env }, cfgToken: string): Promise<Ctx | null> {
  let cfg = await decodeConfig(cfgToken);
  if (!cfg) return null;
  const url = new URL(c.req.url);
  const scope = (await sha256(cfg.installationKey || cfgToken)).slice(0, cfg.installationKey ? 32 : 16);
  let accountConfigToken=cfgToken;
  const activating = /\/users\/authenticate(byname|withquickconnect)$/i.test(url.pathname);
  if (c.env.DB && cfg.installationKey) {
    const saved = await c.env.DB.prepare('SELECT config FROM accounts WHERE scope=?').bind(scope).first<{config:string}>();
    const active=saved ? await decodeConfig(saved.config):null;
    if (active && (!activating || (active.revision ?? 0)>(cfg.revision ?? 0))) {cfg=active;accountConfigToken=saved!.config;}
  }
  return {
    cfg,
    env: c.env,
    cfgToken,
    accountConfigToken,
    origin: `${url.protocol}//${url.host}`,
    scope,
    cacheRevision:(await sha256(JSON.stringify(cfg))).slice(0,16),
    lang: (cfg.language || 'en-US').slice(0, 2).toLowerCase(),
    tmdbKey: cfg.keys.tmdb || c.env.TMDB_KEY || undefined,
  };
}

app.route('/', uiRouter);

app.all('/:cfg/jellyfin/socket', async (c) => {
  const ctx = await buildCtx(c, c.req.param('cfg'));
  if (!ctx) return c.json({ error: 'bad config' }, 400);
  return handleJellyfinSocket(ctx, c.req.raw);
});
app.all('/:cfg/jellyfin/emby/socket', async (c) => {
  const ctx = await buildCtx(c, c.req.param('cfg'));
  if (!ctx) return c.json({ error: 'bad config' }, 400);
  return handleJellyfinSocket(ctx, c.req.raw);
});

app.use('/:cfg/jellyfin/*', async (c, next) => {
  const ctx = await buildCtx(c, c.req.param('cfg'));
  if (!ctx) return c.json({ error: 'bad config' }, 400);
  c.set('ctx', ctx);
  await next();
});
app.route('/:cfg/jellyfin', jellyfinRouter);

app.use('/:cfg/*', async (c, next) => {
  if (c.get('ctx')) return next();
  const ctx = await buildCtx(c, c.req.param('cfg'));
  if (!ctx) return c.json({ error: 'bad config' }, 400);
  c.set('ctx', ctx);
  await next();
});
app.route('/:cfg', addonRouter);

app.notFound((c) => c.json({ error: 'not found' }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'internal', message: String(err?.message || err) }, 500);
});

import { scheduled } from './storage/scheduled';
export default { fetch: app.fetch, scheduled };
