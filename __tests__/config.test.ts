import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getConfigPath, mergeConfig, readConfig, writeConfig } from '../src/config.js';

const tempDirs: string[] = [];

describe('config storage', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('reads missing config as an empty object', async () => {
    const dir = await tempDir();
    await expect(readConfig(getConfigPath(dir))).resolves.toEqual({});
  });

  it('writes config JSON with owner-only file permissions', async () => {
    const dir = await tempDir();
    const configPath = getConfigPath(dir);
    await writeConfig({ apiKey: 'aa_live_test', clientId: 'aa_client_1' }, configPath);

    await expect(readConfig(configPath)).resolves.toEqual({
      apiKey: 'aa_live_test',
      clientId: 'aa_client_1',
    });

    if (process.platform !== 'win32') {
      const mode = (await stat(configPath)).mode & 0o777;
      expect(mode).toBe(0o600);
    }
  });

  it('round-trips the OAuth connection fields via mergeConfig', async () => {
    const dir = await tempDir();
    const configPath = getConfigPath(dir);
    await writeConfig({ apiKey: 'aa_live_trial', clientId: 'aa_client_1' }, configPath);

    const merged = await mergeConfig(
      {
        apiKey: 'aa_at_access',
        refreshToken: 'aa_rt_refresh',
        accessTokenExpiresAt: '2026-07-10T00:00:00.000Z',
        scope: 'run balance:read',
      },
      configPath,
    );

    // The access token overwrites the trial key; the client id is preserved.
    expect(merged).toEqual({
      apiKey: 'aa_at_access',
      clientId: 'aa_client_1',
      refreshToken: 'aa_rt_refresh',
      accessTokenExpiresAt: '2026-07-10T00:00:00.000Z',
      scope: 'run balance:read',
    });
    await expect(readConfig(configPath)).resolves.toEqual(merged);
  });
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'anyapi-cli-'));
  tempDirs.push(dir);
  return dir;
}
