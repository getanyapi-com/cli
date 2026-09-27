import { createRequire } from 'node:module';

/**
 * The package version, read from `package.json` rather than authored here.
 *
 * `../package.json` resolves from both `src/` and the published `dist/`, and npm
 * always packs `package.json`, so `anyapi --version` reports the release that is
 * actually installed. A hand-kept copy drifted from the published version.
 */
export const VERSION: string = (
  createRequire(import.meta.url)('../package.json') as { version: string }
).version;
