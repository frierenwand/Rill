import type { Ctx } from '../context';

/** Serialize a playback cursor across locations. Busy requests fail before acknowledgement. */
export async function withStateLock<T>(ctx: Ctx, key: string, work: () => Promise<T>): Promise<T> {
  const db = ctx.env.DB;
  if (!db) return work();
  const owner = crypto.randomUUID(), lock = `lock:${key}`, deadline = Date.now()+2000;
  for (;;) {
    const row = await db.prepare(`INSERT INTO state(key,value,expires) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,expires=excluded.expires WHERE state.expires<=? RETURNING value`)
      .bind(lock,owner,Date.now()+180_000,Date.now()).first();
    if (row) break;
    if (Date.now() >= deadline) throw new Error('Playback session is busy; retry the report');
    await new Promise(resolve => setTimeout(resolve,40));
  }
  try { return await work(); }
  finally { await db.prepare('DELETE FROM state WHERE key=? AND value=?').bind(lock,owner).run(); }
}
