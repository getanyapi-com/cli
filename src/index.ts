#!/usr/bin/env node
import { Command } from 'commander';
import {
  balanceCommand,
  claimCommand,
  describeCommand,
  initCommand,
  listCommand,
  loginCommand,
  runCommand,
  searchCommand,
  setupSkillsCommand,
  signupCommand,
  type GlobalOptions,
} from './commands.js';
import { CliError } from './errors.js';
import { defaultContext } from './io.js';

const program = new Command();
const ctx = defaultContext();

program
  .name('anyapi')
  .description('Official CLI for AnyAPI.')
  .option('--api-key <apiKey>', 'AnyAPI API key. Overrides ANYAPI_API_KEY and local config.')
  .version('0.1.0');

program
  .command('signup')
  .description('Create a capped starter AnyAPI key and save it locally.')
  .option('--email <sponsorEmail>', 'Sponsor email for claim and approval.')
  .option('--label <label>', 'Label for the generated key.')
  .option('--show-key', 'Print the generated secret key once.')
  .action((options) => run(() => signupCommand(ctx, options)));

program
  .command('login')
  .description('Store an existing AnyAPI key locally.')
  .requiredOption('--api-key <apiKey>', 'Existing aa_live_ key.')
  .action((options) => run(() => loginCommand(ctx, options)));

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
  .description('Run an AnyAPI SKU.')
  .argument('<sku>', 'API SKU.')
  .option('--input <json>', 'JSON input body.')
  .option('-i, --input-file <file>', 'Read JSON input from a file.')
  .option('--fields <fields>', 'Comma-separated fields to keep in each result item.')
  .option('--max-items <count>', 'Maximum number of result items to return.')
  .option('--summary', 'Return a structural summary instead of bulk data.')
  .option('-o, --output <path>', 'Output path for the result JSON.')
  .option('--json', 'Print raw JSON to stdout instead of writing a file.')
  .action((sku, options) => run(() => runCommand(ctx, globalOptions(), sku, options)));

program
  .command('balance')
  .description('Print the remaining USD balance.')
  .action(() => run(() => balanceCommand(ctx, globalOptions())));

program
  .command('claim')
  .description('Print stored claim guidance for a starter key.')
  .action(() => run(() => claimCommand(ctx)));

program
  .command('init')
  .description('Install bundled skills and show or apply MCP setup.')
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
      if (error.message !== 'key_cap_exceeded') {
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
