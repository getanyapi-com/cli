#!/usr/bin/env node
import { Command } from 'commander';
import {
  balanceCommand,
  describeCommand,
  initCommand,
  listCommand,
  loginCommand,
  runCommand,
  searchCommand,
  setupSkillsCommand,
  signupCommand,
  viewCommand,
  type GlobalOptions,
} from './commands.js';
import { connectCommand } from './connect.js';
import { CliError } from './errors.js';
import { defaultContext } from './io.js';

const program = new Command();
const ctx = defaultContext();

program
  .name('anyapi')
  .description('Official CLI for AnyAPI.')
  .option('--api-key <apiKey>', 'AnyAPI API key. Overrides ANYAPI_API_KEY and local config.')
  .version('0.3.0');

program
  .command('signup')
  .description('Mint a free AnyAPI trial key and save it locally.')
  .option('--label <label>', 'Label for the generated key.')
  .option('--show-key', 'Print the generated secret key once.')
  .action((options) => run(() => signupCommand(ctx, options)));

program
  .command('login')
  .description('Store an existing AnyAPI key locally. Pass the key with the global --api-key flag.')
  .action(() => run(() => loginCommand(ctx, globalOptions())));

program
  .command('search')
  .description('Search the public AnyAPI catalog.')
  .argument('<query>', 'Search query.')
  .action((query) => run(() => searchCommand(ctx, query)));

program
  .command('list')
  .description('List APIs in the public AnyAPI catalog.')
  .option('--category <category>', 'Filter by category.')
  .action((options) => run(() => listCommand(ctx, options)));

program
  .command('describe')
  .description('Print one API definition with schemas and USD pricing.')
  .argument('<sku>', 'API SKU.')
  .action((sku) => run(() => describeCommand(ctx, globalOptions(), sku)));

program
  .command('run')
  .description('Run an AnyAPI SKU. Always saves the full result; shape flags trim only the stdout view.')
  .argument('<sku>', 'API SKU.')
  .option('--input <json>', 'JSON input body.')
  .option('-i, --input-file <file>', 'Read JSON input from a file.')
  .option('--jq <expr>', 'Local jq expression over the result output ({found, data}). Applied to stdout only.')
  .option('--fields <fields>', 'Local: comma-separated fields to keep in each result item (stdout only).')
  .option('--max-items <count>', 'Local: cap result items shown on stdout (the saved file keeps all).')
  .option('--summary', 'Local: print a structural summary of the result on stdout.')
  .option('-o, --output <path>', 'Output path for the full result JSON.')
  .option('--json', 'Print the (shaped) JSON to stdout instead of writing a file.')
  .action((sku, options) => run(() => runCommand(ctx, globalOptions(), sku, options)));

program
  .command('view')
  .description('Re-shape a saved run file locally. Zero network, zero cost.')
  .argument('[path]', 'Path to a saved run file. Omit to use the newest saved run.')
  .option('--last [sku]', 'Use the newest saved run (optionally for a specific SKU).')
  .option('--jq <expr>', 'Local jq expression over the result output ({found, data}).')
  .option('--fields <fields>', 'Comma-separated fields to keep in each result item.')
  .option('--max-items <count>', 'Cap the number of result items shown.')
  .option('--summary', 'Print a structural summary of the result.')
  .option('--json', 'Print compact JSON instead of pretty JSON.')
  .action((path, options) => run(() => viewCommand(ctx, path, options)));

program
  .command('balance')
  .description('Print the remaining USD balance.')
  .action(() => run(() => balanceCommand(ctx, globalOptions())));

program
  .command('connect')
  .description('Upgrade past the free trial via a one-URL OAuth approval (loopback callback).')
  .action(() => run(() => connectCommand(ctx)));

program
  .command('init')
  .description('Mint a free trial key if none exists, install bundled skills, and show or apply MCP setup.')
  .option('--all', 'Target all supported agents, even if not detected.')
  .option('--yes', 'Create missing config and apply supported MCP patches without prompting.')
  .action((options) => run(() => initCommand(ctx, globalOptions(), options)));

const setup = program.command('setup').description('Setup helpers.');
setup
  .command('skills')
  .description('Install bundled skills only.')
  .option('--all', 'Target all supported agents, even if not detected.')
  .action((options) => run(() => setupSkillsCommand(ctx, options)));

await program.parseAsync(process.argv);

function globalOptions(): GlobalOptions {
  return program.opts<GlobalOptions>();
}

async function run(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (error instanceof CliError) {
      if (error.message !== 'trial_cap_reached') {
        ctx.stderr.write(`${error.message}\n`);
      }
      process.exitCode = error.exitCode;
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    ctx.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
