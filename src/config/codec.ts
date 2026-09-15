import { normalizeConfig, type RillConfig } from './schema';
import { b64urlDecode, b64urlEncode } from '../util/bytes';

const PREFIX = 'c1.';

export async function encodeConfig(cfg: RillConfig): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(cfg));
  const cs = new CompressionStream('deflate-raw');
  const w = cs.writable.getWriter();
  void w.write(json); void w.close();
  const out = new Uint8Array(await new Response(cs.readable).arrayBuffer());
  return PREFIX + b64urlEncode(out);
}

export async function decodeConfig(token: string): Promise<RillConfig | null> {
  try {
    if (token.startsWith(PREFIX)) {
      const bytes = b64urlDecode(token.slice(PREFIX.length));
      const ds = new DecompressionStream('deflate-raw');
      const w = ds.writable.getWriter();
      void w.write(bytes); void w.close();
      const json = await new Response(ds.readable).text();
      return normalizeConfig(JSON.parse(json));
    }
    const json = new TextDecoder().decode(b64urlDecode(token));
    return normalizeConfig(JSON.parse(json));
  } catch {
    return null;
  }
}
