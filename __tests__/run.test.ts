import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AnyApiClient } from '../src/api.js';
import { ApiError } from '../src/errors.js';
import { buildRunOutputPath, formatCapExceededMessage, isKeyCapExceeded } from '../src/run.js';
import type { FetchLike } from '../src/types.js';

describe('run output paths', () => {
  it('uses sku and a file-safe ISO timestamp under .anyapi', () => {
    const path = buildRunOutputPath('reddit.search', new Date('2026-07-05T19:20:30.456Z'), '/tmp/project');
    expect(path).toBe(join('/tmp/project', '.anyapi', 'reddit.search-2026-07-05T19-20-30-456Z.json'));
  });

  it('replaces unsafe sku characters', () => {
    const path = buildRunOutputPath('web/scrape test', new Date('2026-07-05T19:20:30.456Z'), '/tmp/project');
    expect(path.endsWith('web_scrape_test-2026-07-05T19-20-30-456Z.json')).toBe(true);
  });
});

describe('402 handling', () => {
  it('detects key cap errors from run responses', async () => {
    const fetchImpl: FetchLike = async () =>
      new Response(JSON.stringify({ error: 'key_cap_exceeded' }), {
        status: 402,
        headers: { 'Content-Type': 'application/json' },
      });
    const client = new AnyApiClient({
      apiKey: 'aa_live_test',
      fetchImpl,
      restBaseUrl: 'https://example.test/v1',
    });

    try {
      await client.run('reddit.search', { query: 'anyapi' });
      throw new Error('Expected run to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(isKeyCapExceeded(error)).toBe(true);
      expect(formatCapExceededMessage({ claimUrl: 'https://getanyapi.com/dashboard', claimToken: 'claim' })).toContain(
        'Claim token: claim',
      );
    }
  });
});
