import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveApiKey } from '../src/auth.js';
import { getConfigPath, writeConfig } from '../src/config.js';

const tempDirs: string[] = [];

describe('auth resolution', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('uses flag API key before env and config', async () => {
    const configPath = await configWithKey('aa_live_config');
    const auth = await resolveApiKey({
      apiKey: 'aa_live_flag',
      env: { ANYAPI_API_KEY: 'aa_live_env' } as NodeJS.ProcessEnv,
      configPath,
    });
    expect(auth).toMatchObject({ apiKey: 'aa_live_flag', source: 'flag' });
  });

  it('uses env API key before config', async () => {
    const configPath = await configWithKey('aa_live_config');
    const auth = await resolveApiKey({
      env: { ANYAPI_API_KEY: 'aa_live_env' } as NodeJS.ProcessEnv,
      configPath,
    });
    expect(auth).toMatchObject({ apiKey: 'aa_live_env', source: 'env' });
  });

  it('uses config API key when no higher priority key exists', async () => {
    const configPath = await configWithKey('aa_live_config');
    const auth = await resolveApiKey({ env: {} as NodeJS.ProcessEnv, configPath });
    expect(auth).toMatchObject({ apiKey: 'aa_live_config', source: 'config' });
  });

  it('reports missing when no key exists', async () => {
    const dir = await tempDir();
    const auth = await resolveApiKey({ env: {} as NodeJS.ProcessEnv, configPath: getConfigPath(dir) });
    expect(auth).toMatchObject({ source: 'missing' });
  });
});

async function configWithKey(apiKey: string): Promise<string> {
  const dir = await tempDir();
  const configPath = getConfigPath(dir);
  await writeConfig({ apiKey }, configPath);
  return configPath;
}

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'anyapi-cli-'));
  tempDirs.push(dir);
  return dir;
}
