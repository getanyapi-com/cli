import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { loginCommand, signupCommand } from '../src/commands.js';
import { getConfigPath, readConfig, writeConfig } from '../src/config.js';
import type { CommandContext } from '../src/io.js';
import type { FetchLike } from '../src/types.js';

const METADATA_URL = 'https://api.getanyapi.com/.well-known/oauth-authorization-server';
const REGISTER_URL = 'https://auth.example.test/register';
const DEVICE_URL = 'https://auth.example.test/device';
const TOKEN_URL = 'https://auth.example.test/token';
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('login command routing', () => {
  it('preserves --api-key as the manual compatibility path without OAuth requests', async () => {
    const homeDir = await tempDir();
    await writeConfig({
      refreshToken: 'remove-me',
      accessTokenExpiresAt: '2026-08-02T12:00:00.000Z',
      oauthClientId: 'aa_client_old',
      scope: 'run balance:read',
      keyId: 'key_old_trial',
      capUsd: 0.15,
      expiresAt: '2026-08-09T12:00:00.000Z',
      verificationStatus: 'unverified',
      clientId: 'aa_client_old_trial',
    }, getConfigPath(homeDir));
    let fetchCalls = 0;
    const ctx = commandContext(homeDir, async () => {
      fetchCalls += 1;
      throw new Error('manual login must not fetch');
    });

    await loginCommand(ctx, { apiKey: 'aa_live_manual' });

    expect(fetchCalls).toBe(0);
    expect(await readConfig(getConfigPath(homeDir))).toEqual({ apiKey: 'aa_live_manual' });
    expect(output(ctx)).toContain('AnyAPI key saved');
  });

  it('routes a keyless login through device OAuth, polls pending to success, and persists OAuth config', async () => {
    const homeDir = await tempDir();
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    let tokenPolls = 0;
    const fetchImpl: FetchLike = async (input, init) => {
      const url = String(input);
      requests.push({ url, init });
      if (url === METADATA_URL) return json(metadata());
      if (url === REGISTER_URL) return json({ client_id: 'aa_client_device' });
      if (url === DEVICE_URL) return json(deviceAuthorization({ interval: 5 }));
      if (url === TOKEN_URL) {
        tokenPolls += 1;
        return tokenPolls === 1
          ? json({ error: 'authorization_pending' }, 400)
          : json(tokenResponse());
      }
      throw new Error(`Unexpected URL: ${url}`);
    };
    const ctx = commandContext(homeDir, fetchImpl);
    const opened: string[] = [];
    const clock = fakeClock();

    await loginCommand(ctx, {}, { ...clock.dependencies, openUrl: (url) => opened.push(url) });

    expect(clock.sleeps).toEqual([5000, 5000]);
    expect(opened).toEqual(['https://getanyapi.com/dashboard/authorize?user_code=ABCD-EFGH']);
    expect(requests.map((request) => request.url)).toEqual([
      METADATA_URL,
      REGISTER_URL,
      DEVICE_URL,
      TOKEN_URL,
      TOKEN_URL,
    ]);

    const deviceRequest = requests[2];
    expect(deviceRequest.init?.method).toBe('POST');
    expect(new Headers(deviceRequest.init?.headers).get('Content-Type')).toBe('application/x-www-form-urlencoded');
    expect(form(deviceRequest)).toEqual({
      client_id: 'aa_client_device',
      scope: 'run balance:read',
    });

    for (const tokenRequest of requests.slice(3)) {
      expect(form(tokenRequest)).toEqual({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: 'device-secret',
        client_id: 'aa_client_device',
      });
    }

    expect(await readConfig(getConfigPath(homeDir))).toEqual({
      cliClientId: 'aa_client_device',
      apiKey: 'aa_at_access',
      refreshToken: 'aa_rt_refresh',
      oauthClientId: 'aa_client_device',
      scope: 'run balance:read',
      accessTokenExpiresAt: '1970-01-01T01:00:10.000Z',
    });
    const stdout = output(ctx);
    expect(stdout).toContain('https://getanyapi.com/dashboard/authorize');
    expect(stdout).toContain('Code: ABCD-EFGH');
    expect(stdout).toContain('Logged in. Account-backed AnyAPI OAuth is ready.');
  });

  it('uses the reusable CLI client instead of a saved trial-upgrade client', async () => {
    const homeDir = await tempDir();
    await writeConfig({
      clientId: 'aa_client_trial_upgrade',
      cliClientId: 'aa_client_account_login',
    }, getConfigPath(homeDir));
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl: FetchLike = async (input, init) => {
      const url = String(input);
      requests.push({ url, init });
      if (url === METADATA_URL) return json(metadata());
      if (url === DEVICE_URL) return json(deviceAuthorization());
      if (url === TOKEN_URL) return json(tokenResponse());
      throw new Error(`Unexpected URL: ${url}`);
    };
    const ctx = commandContext(homeDir, fetchImpl);
    const clock = fakeClock();

    await loginCommand(ctx, {}, {
      ...clock.dependencies,
      openUrl: () => undefined,
    });

    expect(requests.map((request) => request.url)).toEqual([
      METADATA_URL,
      DEVICE_URL,
      TOKEN_URL,
    ]);
    expect(form(requests[1])).toMatchObject({
      client_id: 'aa_client_account_login',
    });
    expect(form(requests[2])).toMatchObject({
      client_id: 'aa_client_account_login',
    });
  });
});

describe('credential selection', () => {
  it('clears an old OAuth session when signup selects a new trial key', async () => {
    const homeDir = await tempDir();
    await writeConfig({
      apiKey: 'aa_at_old',
      refreshToken: 'aa_rt_old',
      accessTokenExpiresAt: '2026-08-02T12:00:00.000Z',
      oauthClientId: 'aa_client_old',
      scope: 'run balance:read',
    }, getConfigPath(homeDir));
    const ctx = commandContext(homeDir, async () => json({
      secret: 'aa_live_trial',
      keyId: 'key_trial',
      capUsd: 0.15,
      verificationStatus: 'unverified',
      expiresAt: '2026-08-09T12:00:00.000Z',
      clientId: 'aa_client_trial',
    }));

    await signupCommand(ctx, {});

    expect(await readConfig(getConfigPath(homeDir))).toEqual({
      apiKey: 'aa_live_trial',
      keyId: 'key_trial',
      capUsd: 0.15,
      verificationStatus: 'unverified',
      expiresAt: '2026-08-09T12:00:00.000Z',
      clientId: 'aa_client_trial',
    });
  });

  it('saves a trial key from a signup response without the retired claim fields', async () => {
    const homeDir = await tempDir();
    const ctx = commandContext(homeDir, async () => json({
      secret: 'aa_live_trial',
      keyId: 'key_trial',
      capUsd: 0.15,
      expiresAt: '2026-08-09T12:00:00.000Z',
      clientId: 'aa_client_trial',
    }));

    await signupCommand(ctx, {});

    expect(await readConfig(getConfigPath(homeDir))).toEqual({
      apiKey: 'aa_live_trial',
      keyId: 'key_trial',
      capUsd: 0.15,
      expiresAt: '2026-08-09T12:00:00.000Z',
      clientId: 'aa_client_trial',
    });
  });
});

describe('device token polling', () => {
  it('adds five seconds to the polling interval after slow_down', async () => {
    const homeDir = await configuredHome();
    let tokenPolls = 0;
    const ctx = commandContext(homeDir, flowFetch(() => {
      tokenPolls += 1;
      return tokenPolls === 1 ? json({ error: 'slow_down' }, 400) : json(tokenResponse());
    }, { interval: 2 }));
    const clock = fakeClock();

    await loginCommand(ctx, {}, {
      ...clock.dependencies,
      openUrl: () => { throw new Error('no browser available'); },
    });

    expect(clock.sleeps).toEqual([2000, 7000]);
    expect(tokenPolls).toBe(2);
  });

  it('uses the five-second default when the server omits interval', async () => {
    const homeDir = await configuredHome();
    const ctx = commandContext(homeDir, flowFetch(() => json(tokenResponse()), { interval: undefined }));
    const clock = fakeClock();

    await loginCommand(ctx, {}, { ...clock.dependencies, openUrl: () => undefined });

    expect(clock.sleeps).toEqual([5000]);
  });

  it('stops immediately when the human denies authorization', async () => {
    const homeDir = await configuredHome();
    let tokenPolls = 0;
    const ctx = commandContext(homeDir, flowFetch(() => {
      tokenPolls += 1;
      return json({ error: 'access_denied' }, 400);
    }));
    const clock = fakeClock();

    await expect(loginCommand(ctx, {}, { ...clock.dependencies, openUrl: () => undefined }))
      .rejects.toThrow('AnyAPI sign-in was denied');
    expect(tokenPolls).toBe(1);
    expect(clock.sleeps).toEqual([5000]);
  });

  it('reports a server-expired device code', async () => {
    const homeDir = await configuredHome();
    const ctx = commandContext(homeDir, flowFetch(() => json({ error: 'expired_token' }, 400)));
    const clock = fakeClock();

    await expect(loginCommand(ctx, {}, { ...clock.dependencies, openUrl: () => undefined }))
      .rejects.toThrow('sign-in code expired');
  });

  it('rejects a malformed device authorization response before polling', async () => {
    const homeDir = await configuredHome();
    const fetchImpl: FetchLike = async (input) => {
      const url = String(input);
      if (url === METADATA_URL) return json(metadata());
      if (url === DEVICE_URL) return json({ user_code: 'ABCD-EFGH', expires_in: 600 });
      throw new Error(`Unexpected URL: ${url}`);
    };
    const ctx = commandContext(homeDir, fetchImpl);

    await expect(loginCommand(ctx, {}, { ...fakeClock().dependencies, openUrl: () => undefined }))
      .rejects.toThrow('invalid response');
  });

  it('accepts a device response without optional verification_uri_complete', async () => {
    const homeDir = await configuredHome();
    const ctx = commandContext(homeDir, flowFetch(() => json(tokenResponse()), {
      verification_uri_complete: undefined,
    }));
    const opened: string[] = [];

    await loginCommand(ctx, {}, { ...fakeClock().dependencies, openUrl: (url) => opened.push(url) });

    expect(opened).toEqual([]);
    expect(output(ctx)).toContain('https://getanyapi.com/dashboard/authorize');
  });

  it('rejects a malformed successful token response without overwriting config', async () => {
    const homeDir = await configuredHome();
    await writeConfig({
      apiKey: 'aa_live_existing',
      cliClientId: 'aa_client_existing',
    }, getConfigPath(homeDir));
    const ctx = commandContext(homeDir, flowFetch(() => json({ token_type: 'Bearer' })));

    await expect(loginCommand(ctx, {}, { ...fakeClock().dependencies, openUrl: () => undefined }))
      .rejects.toThrow('invalid response');
    expect(await readConfig(getConfigPath(homeDir))).toEqual({
      apiKey: 'aa_live_existing',
      cliClientId: 'aa_client_existing',
    });
  });

  it('bounds polling by expires_in without using real timers', async () => {
    const homeDir = await configuredHome();
    let tokenPolls = 0;
    const ctx = commandContext(homeDir, flowFetch(() => {
      tokenPolls += 1;
      return json({ error: 'authorization_pending' }, 400);
    }, { expires_in: 5, interval: 3 }));
    const clock = fakeClock();

    await expect(loginCommand(ctx, {}, { ...clock.dependencies, openUrl: () => undefined }))
      .rejects.toThrow('Timed out waiting for AnyAPI sign-in');
    expect(tokenPolls).toBe(1);
    expect(clock.sleeps).toEqual([3000, 2000]);
  });

  it('aborts a token request that hangs past the device-code deadline', async () => {
    const homeDir = await configuredHome();
    let signalAborted = false;
    const fetchImpl: FetchLike = async (input, init) => {
      const url = String(input);
      if (url === METADATA_URL) return json(metadata());
      if (url === DEVICE_URL) {
        return json(deviceAuthorization({ expires_in: 0.03, interval: 0.001 }));
      }
      if (url === TOKEN_URL) {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            signalAborted = true;
            reject(new Error('aborted'));
          }, { once: true });
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    };
    const ctx = commandContext(homeDir, fetchImpl);

    await expect(loginCommand(ctx, {}, { ...fakeClock().dependencies, openUrl: () => undefined }))
      .rejects.toThrow('Timed out waiting for AnyAPI sign-in');
    expect(signalAborted).toBe(true);
  });
});

function metadata(): Record<string, string> {
  return {
    authorization_endpoint: 'https://auth.example.test/authorize',
    device_authorization_endpoint: DEVICE_URL,
    token_endpoint: TOKEN_URL,
    registration_endpoint: REGISTER_URL,
  };
}

type DeviceOverrides = Partial<Record<'expires_in' | 'interval', number | undefined>> & {
  verification_uri_complete?: string | undefined;
};

function deviceAuthorization(overrides: DeviceOverrides = {}): Record<string, unknown> {
  return {
    device_code: 'device-secret',
    user_code: 'ABCD-EFGH',
    verification_uri: 'https://getanyapi.com/dashboard/authorize',
    verification_uri_complete: 'https://getanyapi.com/dashboard/authorize?user_code=ABCD-EFGH',
    expires_in: 600,
    interval: 5,
    ...overrides,
  };
}

function tokenResponse(): Record<string, unknown> {
  return {
    access_token: 'aa_at_access',
    token_type: 'Bearer',
    expires_in: 3600,
    refresh_token: 'aa_rt_refresh',
    scope: 'run balance:read',
  };
}

function flowFetch(tokenResponseFactory: () => Response, overrides: DeviceOverrides = {}): FetchLike {
  return async (input) => {
    const url = String(input);
    if (url === METADATA_URL) return json(metadata());
    if (url === DEVICE_URL) return json(deviceAuthorization(overrides));
    if (url === TOKEN_URL) return tokenResponseFactory();
    throw new Error(`Unexpected URL: ${url}`);
  };
}

async function configuredHome(): Promise<string> {
  const homeDir = await tempDir();
  await writeConfig({ cliClientId: 'aa_client_existing' }, getConfigPath(homeDir));
  return homeDir;
}

function fakeClock(): {
  sleeps: number[];
  dependencies: { now: () => number; sleep: (milliseconds: number) => Promise<void> };
} {
  let currentTime = 0;
  const sleeps: number[] = [];
  return {
    sleeps,
    dependencies: {
      now: () => currentTime,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
        currentTime += milliseconds;
      },
    },
  };
}

function commandContext(homeDir: string, fetchImpl: FetchLike): CommandContext {
  return {
    cwd: homeDir,
    homeDir,
    env: {},
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    fetchImpl,
  };
}

function output(ctx: CommandContext): string {
  return ctx.stdout.read()?.toString() ?? '';
}

function form(request: { init?: RequestInit }): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(String(request.init?.body)).entries());
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(`${tmpdir()}/anyapi-login-`);
  tempDirs.push(dir);
  return dir;
}
