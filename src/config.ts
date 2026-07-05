import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { CONFIG_DIR_NAME, CONFIG_FILE_NAME } from './constants.js';
import type { AnyApiConfig } from './types.js';

export function getConfigPath(homeDir = homedir()): string {
  return join(homeDir, CONFIG_DIR_NAME, CONFIG_FILE_NAME);
}

export async function readConfig(configPath = getConfigPath()): Promise<AnyApiConfig> {
  try {
    const raw = await readFile(configPath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    return isObject(parsed) ? (parsed as AnyApiConfig) : {};
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

export async function writeConfig(config: AnyApiConfig, configPath = getConfigPath()): Promise<void> {
  await mkdir(dirname(configPath), { recursive: true, mode: 0o700 });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  await chmod(configPath, 0o600).catch(() => undefined);
}

export async function mergeConfig(config: AnyApiConfig, configPath = getConfigPath()): Promise<AnyApiConfig> {
  const existing = await readConfig(configPath);
  const next = { ...existing, ...config };
  await writeConfig(next, configPath);
  return next;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}
