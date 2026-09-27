import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

class ExitCalled extends Error {}

const realArgv = process.argv;

afterEach(() => {
  process.argv = realArgv;
  vi.restoreAllMocks();
});

describe('anyapi --version', () => {
  it('prints the version in package.json, not a second copy', async () => {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
    let printed = '';
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      printed += String(chunk);
      return true;
    });
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new ExitCalled();
    });
    process.argv = ['node', 'anyapi', '--version'];

    await expect(import('../src/index.js')).rejects.toBeInstanceOf(ExitCalled);
    expect(printed).toBe(`${manifest.version}\n`);
  });
});
