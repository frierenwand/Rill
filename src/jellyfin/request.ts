/**
 * Per-request state for the Jellyfin facade. Built once by the router and
 * handed to every handler; it lives exactly as long as the request.
 */
import type { Ctx } from '../context';
import type { ClientInfo, Identity, TokenClaims } from './auth';

export interface JfRequest {
  ctx: Ctx;
  who: Identity;
  client: ClientInfo;
  /** Verified token claims, or null for an anonymous request. */
  claims: TokenClaims | null;
  /** Absolute base of this facade, e.g. https://host/<cfg>/jellyfin */
  base: string;
  /** The path as the client sent it, before lower-casing, relative to base. */
  rawPath: string;
  /** Query parameters with case-insensitive lookup. */
  q: (name: string) => string | undefined;
  /** Parsed JSON body (POST), or an empty object. */
  body: Record<string, unknown>;
}

/** Env of the inner (lower-cased) router: every handler reaches its request state through `c.get('jf')`. */
export type JfEnv = { Variables: { jf: JfRequest; ctx: Ctx } };

export function qInt(jf: JfRequest, name: string, fallback: number): number {
  const n = parseInt(String(jf.q(name) ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

export function qBool(jf: JfRequest, name: string, fallback: boolean): boolean {
  const v = jf.q(name);
  return v === undefined ? fallback : v.toLowerCase() === 'true';
}

export function qList(jf: JfRequest, name: string): string[] {
  return String(jf.q(name) ?? '')
    .split(/[,|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
