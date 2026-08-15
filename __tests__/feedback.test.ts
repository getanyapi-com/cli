import { describe, expect, it } from 'vitest';
import { PassThrough } from 'node:stream';
import { AnyApiClient } from '../src/api.js';
import { feedbackCommand, reportBugCommand } from '../src/feedback.js';
import { CliError } from '../src/errors.js';
import type { CommandContext } from '../src/io.js';
import type { FetchLike } from '../src/types.js';

interface Captured {
  url: string;
  method?: string;
  body: Record<string, unknown>;
  authorization?: string;
}

function capturingFetch(captured: Captured[], status = 201): FetchLike {
  return async (input, init) => {
    const headers = new Headers(init?.headers as HeadersInit);
    captured.push({
      url: String(input),
      method: init?.method,
      body: init?.body ? JSON.parse(String(init.body)) : {},
      authorization: headers.get('authorization') ?? undefined,
    });
    if (status >= 400) {
      return Response.json({ error: 'this account has reached its stored report limit', code: 'report_limit_reached' }, { status });
    }
    return Response.json({
      id: 'report-1', kind: 'bug', summary: 'x', createdAt: '2026-08-15T22:00:00Z',
    }, { status });
  };
}

function context(fetchImpl: FetchLike): CommandContext {
  return {
    cwd: '/tmp',
    homeDir: '/tmp/anyapi-feedback-home',
    env: { ANYAPI_API_KEY: 'aa_live_test' },
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    fetchImpl,
  };
}

function output(ctx: CommandContext): string {
  return String(ctx.stdout.read() ?? '');
}

describe('report commands', () => {
  it('files a bug on /bug-reports and feedback on /feedback', async () => {
    const captured: Captured[] = [];
    const ctx = context(capturingFetch(captured));
    await reportBugCommand(ctx, {}, 'reels_search returned no items', {});
    await feedbackCommand(ctx, {}, 'no SKU for Substack archives', {});
    expect(captured.map((c) => c.url)).toEqual([
      'https://api.getanyapi.com/v1/bug-reports',
      'https://api.getanyapi.com/v1/feedback',
    ]);
    expect(captured.every((c) => c.method === 'POST')).toBe(true);
  });

  // The route carries the kind. A body field would let a caller contradict it.
  it('never sends a kind in the body', async () => {
    const captured: Captured[] = [];
    await reportBugCommand(context(capturingFetch(captured)), {}, 'broken', {});
    expect(captured[0].body).not.toHaveProperty('kind');
    expect(captured[0].body).not.toHaveProperty('surface');
  });

  it('sends every supplied option and omits the ones left out', async () => {
    const captured: Captured[] = [];
    await reportBugCommand(context(capturingFetch(captured)), {}, '  padded summary  ', {
      details: 'ran twice',
      sku: 'instagram.reels_search',
      requestId: 'req_1',
      contact: 'agent@example.test',
    });
    expect(captured[0].body).toEqual({
      summary: 'padded summary',
      details: 'ran twice',
      sku: 'instagram.reels_search',
      requestId: 'req_1',
      contact: 'agent@example.test',
    });

    const bare: Captured[] = [];
    await reportBugCommand(context(capturingFetch(bare)), {}, 'broken', {});
    expect(bare[0].body).toEqual({ summary: 'broken' });
  });

  it('authenticates with the resolved key', async () => {
    const captured: Captured[] = [];
    await reportBugCommand(context(capturingFetch(captured)), {}, 'broken', {});
    expect(captured[0].authorization).toBe('Bearer aa_live_test');
  });

  it('rejects a blank summary before spending a request', async () => {
    const captured: Captured[] = [];
    await expect(
      reportBugCommand(context(capturingFetch(captured)), {}, '   ', {}),
    ).rejects.toBeInstanceOf(CliError);
    expect(captured).toHaveLength(0);
  });

  it('prints the reference and nudges toward a request id only when none was given', async () => {
    const withId = context(capturingFetch([]));
    await reportBugCommand(withId, {}, 'broken', { requestId: 'req_1' });
    const withIdOut = output(withId);
    expect(withIdOut).toContain('report-1');
    expect(withIdOut).not.toContain('Tip:');

    const withoutId = context(capturingFetch([]));
    await reportBugCommand(withoutId, {}, 'broken', {});
    expect(output(withoutId)).toContain('Tip:');
  });

  it('surfaces the gateway limit message rather than a bare status', async () => {
    const ctx = context(capturingFetch([], 409));
    await expect(reportBugCommand(ctx, {}, 'broken', {})).rejects.toThrow(/stored report limit/);
  });
});

describe('AnyApiClient.submitReport', () => {
  it('targets the route matching the kind', async () => {
    const seen: string[] = [];
    const client = new AnyApiClient({
      apiKey: 'aa_live_test',
      fetchImpl: async (input) => {
        seen.push(String(input));
        return Response.json({ id: 'r', kind: 'bug', summary: 's', createdAt: 'now' }, { status: 201 });
      },
    });
    await client.submitReport('bug', { summary: 's' });
    await client.submitReport('feedback', { summary: 's' });
    expect(seen).toEqual([
      'https://api.getanyapi.com/v1/bug-reports',
      'https://api.getanyapi.com/v1/feedback',
    ]);
  });
});
