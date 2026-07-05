import { getConfigPath, mergeConfig, readConfig } from './config.js';
import { AnyApiClient } from './api.js';
import { API_KEY_ENV, DASHBOARD_URL } from './constants.js';
import { CliError } from './errors.js';
import { resolveApiKey } from './auth.js';
import { formatCatalogPrice, formatUsd, printTable } from './format.js';
import { buildRunOutputPath, formatCapExceededMessage, isKeyCapExceeded, parseRunInput, summarizeRun, writeRunOutput } from './run.js';
import { configureMcp, detectAgents, installSkillsForAgents, printAgentDetection } from './init.js';
import { promptYesNo, writeLine, type CommandContext } from './io.js';
import type { AnyApiConfig, CatalogApi, RunOptions, SignupResponse } from './types.js';

export interface GlobalOptions {
  apiKey?: string;
}

export async function signupCommand(ctx: CommandContext, options: { email?: string; label?: string; showKey?: boolean }): Promise<void> {
  const client = new AnyApiClient({ fetchImpl: ctx.fetchImpl });
  const signup = await client.signup({ sponsorEmail: options.email, label: options.label });
  await saveSignup(ctx, signup);
  writeLine(ctx.stdout, `Starter cap: ${formatUsd(signup.capUsd)}`);
  writeLine(ctx.stdout, `Claim URL: ${signup.claimUrl}`);
  writeLine(ctx.stdout, `Expires at: ${signup.expiresAt}`);
  writeLine(ctx.stdout, 'Claim this key within 7 days to keep it active and fund it.');
  if (options.showKey) {
    writeLine(ctx.stdout, `API key: ${signup.secret}`);
  } else {
    writeLine(ctx.stdout, 'API key saved to ~/.anyapi/config.json. Re-run with --show-key only if you need to reveal it.');
  }
}

export async function loginCommand(ctx: CommandContext, options: { apiKey?: string }): Promise<void> {
  if (!options.apiKey) {
    throw new CliError('Missing --api-key aa_live_...');
  }
  await mergeConfig({ apiKey: options.apiKey }, getConfigPath(ctx.homeDir));
  writeLine(ctx.stdout, 'AnyAPI key saved to ~/.anyapi/config.json.');
}

export async function searchCommand(ctx: CommandContext, query: string): Promise<void> {
  const client = new AnyApiClient({ fetchImpl: ctx.fetchImpl });
  const catalog = await client.catalog({ query });
  writeCatalogTable(ctx, catalog.apis);
}

export async function listCommand(ctx: CommandContext, options: { category?: string }): Promise<void> {
  const client = new AnyApiClient({ fetchImpl: ctx.fetchImpl });
  const catalog = await client.catalog({ category: options.category });
  writeCatalogTable(ctx, catalog.apis);
}

export async function describeCommand(ctx: CommandContext, global: GlobalOptions, sku: string): Promise<void> {
  const auth = await requireApiKey(ctx, global);
  const client = new AnyApiClient({ apiKey: auth.apiKey, fetchImpl: ctx.fetchImpl });
  writeLine(ctx.stdout, JSON.stringify(await client.describe(sku), null, 2));
}

export async function runCommand(
  ctx: CommandContext,
  global: GlobalOptions,
  sku: string,
  options: { input?: string; inputFile?: string; fields?: string; maxItems?: string; summary?: boolean; output?: string; json?: boolean },
): Promise<void> {
  const auth = await requireApiKey(ctx, global);
  const client = new AnyApiClient({ apiKey: auth.apiKey, fetchImpl: ctx.fetchImpl });
  const input = await parseRunInput(options);
  const runOptions = parseRunOptions(options);

  try {
    const result = await client.run(sku, input, runOptions);
    if (options.json) {
      writeLine(ctx.stdout, JSON.stringify(result));
      return;
    }
    const outputPath = options.output ?? buildRunOutputPath(sku, new Date(), ctx.cwd);
    await writeRunOutput(result, outputPath);
    writeLine(ctx.stdout, summarizeRun(result, outputPath, ctx.cwd));
  } catch (error) {
    if (isKeyCapExceeded(error)) {
      writeLine(ctx.stderr, formatCapExceededMessage(auth.config));
      throw new CliError('key_cap_exceeded');
    }
    throw error;
  }
}

export async function balanceCommand(ctx: CommandContext, global: GlobalOptions): Promise<void> {
  const auth = await requireApiKey(ctx, global);
  const client = new AnyApiClient({ apiKey: auth.apiKey, fetchImpl: ctx.fetchImpl });
  const balance = await client.balance();
  writeLine(ctx.stdout, formatBalance(balance));
}

export async function claimCommand(ctx: CommandContext): Promise<void> {
  const config = await readConfig(getConfigPath(ctx.homeDir));
  if (!config.claimToken && !config.claimUrl) {
    writeLine(ctx.stdout, `No claim token is saved. Open ${DASHBOARD_URL} to manage AnyAPI keys.`);
    return;
  }
  writeLine(ctx.stdout, `Claim URL: ${config.claimUrl ?? DASHBOARD_URL}`);
  if (config.claimToken) {
    writeLine(ctx.stdout, `Claim token: ${config.claimToken}`);
  }
  if (config.expiresAt) {
    writeLine(ctx.stdout, `Expires at: ${config.expiresAt}`);
  }
  writeLine(ctx.stdout, 'Claim this key in the dashboard to keep it active and fund it.');
}

export async function initCommand(ctx: CommandContext, global: GlobalOptions, options: { all?: boolean; yes?: boolean }): Promise<void> {
  const auth = await resolveApiKey({ apiKey: global.apiKey, env: ctx.env, configPath: getConfigPath(ctx.homeDir) });
  if (!auth.apiKey) {
    await maybeSignup(ctx, options.yes);
  }
  const detections = await detectAgents(ctx);
  printAgentDetection(ctx, detections);
  const installed = await installSkillsForAgents(detections, { all: options.all });
  if (installed.length === 0) {
    writeLine(ctx.stdout, 'No installed agents found. Re-run with --all to create skill directories.');
  } else {
    writeLine(ctx.stdout, 'Installed skills:');
    installed.forEach((line) => writeLine(ctx.stdout, `- ${line}`));
  }
  writeLine(ctx.stdout, `Set ${API_KEY_ENV} for MCP clients that use environment auth.`);
  const mcpResults = await configureMcp(detections, { all: options.all, yes: options.yes });
  if (mcpResults.length > 0) {
    writeLine(ctx.stdout, options.yes ? 'MCP setup:' : 'MCP setup snippets:');
    mcpResults.forEach((line) => writeLine(ctx.stdout, line));
  }
}

export async function setupSkillsCommand(ctx: CommandContext, options: { all?: boolean }): Promise<void> {
  const detections = await detectAgents(ctx);
  printAgentDetection(ctx, detections);
  const installed = await installSkillsForAgents(detections, { all: options.all });
  if (installed.length === 0) {
    writeLine(ctx.stdout, 'No installed agents found. Re-run with --all to create skill directories.');
    return;
  }
  writeLine(ctx.stdout, 'Installed skills:');
  installed.forEach((line) => writeLine(ctx.stdout, `- ${line}`));
}

async function requireApiKey(ctx: CommandContext, global: GlobalOptions): Promise<{ apiKey: string; config: AnyApiConfig }> {
  const auth = await resolveApiKey({ apiKey: global.apiKey, env: ctx.env, configPath: getConfigPath(ctx.homeDir) });
  if (auth.apiKey) {
    return { apiKey: auth.apiKey, config: auth.config };
  }
  const signedUp = await maybeSignup(ctx);
  if (signedUp.apiKey) {
    return { apiKey: signedUp.apiKey, config: signedUp.config };
  }
  throw new CliError(`No AnyAPI key found. Run anyapi signup or set ${API_KEY_ENV}.`);
}

async function maybeSignup(ctx: CommandContext, force?: boolean): Promise<{ apiKey?: string; config: AnyApiConfig }> {
  const shouldSignup = force === true ? true : await promptYesNo(ctx, 'No AnyAPI key found. Create a capped starter key now?');
  if (!shouldSignup) {
    return { config: {} };
  }
  const client = new AnyApiClient({ fetchImpl: ctx.fetchImpl });
  const signup = await client.signup({ label: 'anyapi-cli' });
  const config = await saveSignup(ctx, signup);
  writeLine(ctx.stdout, `Created starter key with cap ${formatUsd(signup.capUsd)}.`);
  writeLine(ctx.stdout, `Claim URL: ${signup.claimUrl}`);
  return { apiKey: signup.secret, config };
}

async function saveSignup(ctx: CommandContext, signup: SignupResponse): Promise<AnyApiConfig> {
  return mergeConfig(
    {
      apiKey: signup.secret,
      keyId: signup.keyId,
      capUsd: signup.capUsd,
      claimToken: signup.claimToken,
      claimUrl: signup.claimUrl,
      expiresAt: signup.expiresAt,
      verificationStatus: signup.verificationStatus,
    },
    getConfigPath(ctx.homeDir),
  );
}

function writeCatalogTable(ctx: CommandContext, apis: CatalogApi[]): void {
  const rows = [['sku', 'name', 'price']];
  for (const api of apis) {
    rows.push([api.slug, api.name, formatCatalogPrice(api)]);
  }
  writeLine(ctx.stdout, printTable(rows));
}

function parseRunOptions(options: { fields?: string; maxItems?: string; summary?: boolean }): RunOptions {
  const parsed: RunOptions = {};
  if (options.fields) {
    parsed.fields = options.fields;
  }
  if (options.maxItems !== undefined) {
    const value = Number(options.maxItems);
    if (!Number.isInteger(value) || value < 0) {
      throw new CliError('--max-items must be a non-negative integer.');
    }
    parsed.maxItems = value;
  }
  if (options.summary) {
    parsed.summary = true;
  }
  return parsed;
}

function formatBalance(value: unknown): string {
  if (isRecord(value)) {
    const candidate = value.balanceUsd ?? value.availableUsd ?? value.usd ?? value.balance;
    return `Balance: ${formatUsd(typeof candidate === 'number' ? candidate : undefined)}`;
  }
  return `Balance: ${formatUsd(undefined)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
