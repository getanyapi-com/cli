import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveLastFile, safeSkuName } from '../src/view.js';

const tempDirs: string[] = [];

describe('resolveLastFile', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('picks the newest run overall by mtime', async () => {
    const dir = await seed({
      'reddit.search-2026-07-05T10-00-00-000Z.json': 1000,
      'web.scrape-2026-07-05T11-00-00-000Z.json': 2000,
    });
    const found = await resolveLastFile(dir);
    expect(found).toBe(join(dir, 'web.scrape-2026-07-05T11-00-00-000Z.json'));
  });

  it('filters by sku prefix when a sku is given', async () => {
    const dir = await seed({
      'reddit.search-2026-07-05T10-00-00-000Z.json': 3000,
      'web.scrape-2026-07-05T11-00-00-000Z.json': 4000,
      'reddit.search-2026-07-05T12-00-00-000Z.json': 3500,
    });
    const found = await resolveLastFile(dir, 'reddit.search');
    expect(found).toBe(join(dir, 'reddit.search-2026-07-05T12-00-00-000Z.json'));
  });

  it('ignores config.json and returns undefined when nothing matches', async () => {
    const dir = await seed({ 'config.json': 1000 });
    expect(await resolveLastFile(dir)).toBeUndefined();
    expect(await resolveLastFile(join(dir, 'missing'))).toBeUndefined();
  });

  it('sanitizes sku names to match on-disk file prefixes', () => {
    expect(safeSkuName('web/scrape test')).toBe('web_scrape_test');
  });
});

async function seed(files: Record<string, number>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'anyapi-view-'));
  tempDirs.push(dir);
  for (const [name, mtimeSeconds] of Object.entries(files)) {
    const path = join(dir, name);
    await writeFile(path, '{}\n', 'utf8');
    await utimes(path, mtimeSeconds, mtimeSeconds);
  }
  return dir;
}
