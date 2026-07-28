import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { AnyApiClient } from '../src/api.js';
import { runCommand } from '../src/commands.js';
import { ApiError } from '../src/errors.js';
import {
  buildRunOutputPath,
  formatIdempotencyError,
  formatTrialCapMessage,
  isTrialCapReached,
  parseRunInput,
  prepareRunIdempotency,
} from '../src/run.js';
import type { CommandContext } from '../src/io.js';
import type { FetchLike } from '../src/types.js';

describe('run idempotency', () => {
  it('passes the command flag through to the idempotency key header', async () => {
    let requestInit: RequestInit | undefined;
    const fetchImpl: FetchLike = async (_input, init) => {
      requestInit = init;
      return Response.json({ output: {}, provider: 'AnyAPI', costUsd: 0.01, items: 1 });
    };

    await runCommand(commandContext(fetchImpl), { apiKey: 'aa_live_test' }, 'reddit.search', {
      input: '{"query":"anyapi"}',
      idempotencyKey: 'k1',
      json: true,
    });

    expect(new Headers(requestInit?.headers).get('Idempotency-Key')).toBe('k1');
  });

  it('omits the idempotency key header when the flag is absent', async () => {
    let requestInit: RequestInit | undefined;
    const fetchImpl: FetchLike = async (_input, init) => {
      requestInit = init;
      return Response.json({ output: {}, provider: 'AnyAPI', costUsd: 0.01, items: 1 });
    };

    await runCommand(commandContext(fetchImpl), { apiKey: 'aa_live_test' }, 'reddit.search', {
      input: '{"query":"anyapi"}',
      json: true,
    });

    expect(new Headers(requestInit?.headers).has('Idempotency-Key')).toBe(false);
  });

  it('derives the same auto key and request body from equivalent JSON input', async () => {
    const firstInput = await parseRunInput({
      input: '{"query":"anyapi","filters":{"sort":"new","limit":5}}',
    });
    const secondInput = await parseRunInput({
      input: '{ "filters": { "limit": 5, "sort": "new" }, "query": "anyapi" }',
    });
    const date = new Date('2026-07-27T12:00:00Z');

    const first = prepareRunIdempotency('reddit.search', firstInput, 'auto', date);
    const second = prepareRunIdempotency('reddit.search', secondInput, 'auto', date);

    expect(second.idempotencyKey).toBe(first.idempotencyKey);
    expect(JSON.stringify(second.input)).toBe(JSON.stringify(first.input));
    expect(first.idempotencyKey).toMatch(/^anyapi-auto-[a-f0-9]{64}$/);
  });

  it('rejects explicit keys outside the gateway wire format', () => {
    expect(() => prepareRunIdempotency('reddit.search', {}, '')).toThrow('1 to 255 visible ASCII');
    expect(() => prepareRunIdempotency('reddit.search', {}, 'contains space')).toThrow('1 to 255 visible ASCII');
    expect(() => prepareRunIdempotency('reddit.search', {}, 'ends-with-newline\n')).toThrow('1 to 255 visible ASCII');
    expect(() => prepareRunIdempotency('reddit.search', {}, 'x'.repeat(256))).toThrow('1 to 255 visible ASCII');
    expect(prepareRunIdempotency('reddit.search', {}, 'x'.repeat(255)).idempotencyKey).toHaveLength(255);
  });
});

function commandContext(fetchImpl: FetchLike): CommandContext {
  return {
    cwd: '/tmp',
    homeDir: '/tmp',
    env: {},
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    fetchImpl,
  };
}

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
  it('detects trial cap errors and relays the server upgrade guidance', async () => {
    const fetchImpl: FetchLike = async () =>
      new Response(
        JSON.stringify({ error: 'trial_cap_reached', message: 'Trial budget used up; run anyapi connect.' }),
        { status: 402, headers: { 'Content-Type': 'application/json' } },
      );
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
      expect(isTrialCapReached(error)).toBe(true);
      expect(formatTrialCapMessage(error)).toBe('Trial budget used up; run anyapi connect.');
    }
  });

  it('falls back to a connect nudge when the 402 body has no message', () => {
    const error = new ApiError('trial_cap_reached', 402, { error: 'trial_cap_reached' });
    expect(isTrialCapReached(error)).toBe(true);
    expect(formatTrialCapMessage(error)).toContain('anyapi connect');
  });
});

describe('409 idempotency handling', () => {
  it('explains when the key belongs to a different request using the error code', () => {
    const error = new ApiError('Original request is still running.', 409, {
      error: 'Original request is still running.',
      code: 'idempotency_conflict',
    });

    expect(formatIdempotencyError(error)).toBe(
      'This idempotency key was already used for a different request. Use a new key, or retry with the original SKU and input.',
    );
  });

  it('explains when the original request is still running using the error code', () => {
    const error = new ApiError('This key belongs to another request.', 409, {
      error: 'This key belongs to another request.',
      code: 'idempotency_in_progress',
    });

    expect(formatIdempotencyError(error)).toBe(
      'The original request for this idempotency key is still running. Retry shortly with the same key.',
    );
  });
});
