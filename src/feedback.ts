import { AnyApiClient } from './api.js';
import { requireApiKey, type GlobalOptions } from './commands.js';
import { CliError } from './errors.js';
import { writeLine, type CommandContext } from './io.js';
import type { FeedbackKind, FeedbackReportInput } from './types.js';

export interface ReportCliOptions {
  details?: string;
  sku?: string;
  requestId?: string;
  contact?: string;
}

// reportBugCommand and feedbackCommand are the same submission on different
// routes. The kind is not a flag: an agent picks the command, and the gateway
// stamps the kind from the route it served.
export async function reportBugCommand(
  ctx: CommandContext,
  global: GlobalOptions,
  summary: string,
  options: ReportCliOptions,
): Promise<void> {
  await submit(ctx, global, 'bug', summary, options);
}

export async function feedbackCommand(
  ctx: CommandContext,
  global: GlobalOptions,
  summary: string,
  options: ReportCliOptions,
): Promise<void> {
  await submit(ctx, global, 'feedback', summary, options);
}

async function submit(
  ctx: CommandContext,
  global: GlobalOptions,
  kind: FeedbackKind,
  summary: string,
  options: ReportCliOptions,
): Promise<void> {
  const trimmed = summary.trim();
  if (trimmed === '') {
    throw new CliError('A summary is required. Example: anyapi report-bug "reels_search returned no items"');
  }
  const auth = await requireApiKey(ctx, global);
  const client = new AnyApiClient({ apiKey: auth.apiKey, fetchImpl: ctx.fetchImpl });
  const input: FeedbackReportInput = {
    summary: trimmed,
    details: options.details,
    sku: options.sku,
    requestId: options.requestId,
    contact: options.contact,
  };
  const report = await client.submitReport(kind, input);
  writeLine(ctx.stdout, `${kind === 'bug' ? 'Bug report' : 'Feedback'} filed. Reference: ${report.id}`);
  if (!options.requestId) {
    // The stored run is the single most useful attachment, so say so once rather
    // than leaving the next report as thin as this one.
    writeLine(ctx.stdout, 'Tip: pass --request-id from the run that went wrong so we can read its stored result.');
  }
}
