import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

// safeSkuName mirrors the sanitization buildRunOutputPath uses when naming a saved
// run file, so `view --last <sku>` can match the same on-disk prefix.
export function safeSkuName(sku: string): string {
  return sku.replace(/[^a-zA-Z0-9._-]/g, '_');
}

// resolveLastFile returns the newest saved run envelope in `anyapiDir` by mtime.
// When `sku` is given it restricts to files named `<safeSku>-*.json`; otherwise it
// picks the newest run of any SKU. Returns undefined when nothing matches.
export async function resolveLastFile(anyapiDir: string, sku?: string): Promise<string | undefined> {
  let entries: string[];
  try {
    entries = await readdir(anyapiDir);
  } catch {
    return undefined;
  }
  const prefix = sku ? `${safeSkuName(sku)}-` : '';
  const candidates = entries.filter(
    (name) => name.endsWith('.json') && name !== 'config.json' && name.startsWith(prefix),
  );
  let best: { path: string; mtime: number } | undefined;
  for (const name of candidates) {
    const path = join(anyapiDir, name);
    let info;
    try {
      info = await stat(path);
    } catch {
      continue;
    }
    if (!info.isFile()) {
      continue;
    }
    if (!best || info.mtimeMs > best.mtime) {
      best = { path, mtime: info.mtimeMs };
    }
  }
  return best?.path;
}
