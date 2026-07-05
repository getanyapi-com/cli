import { createInterface } from 'node:readline/promises';
import type { Readable, Writable } from 'node:stream';
import { homedir } from 'node:os';
import type { FetchLike } from './types.js';

type TtyReadable = Readable & { isTTY?: boolean };
type TtyWritable = Writable & { isTTY?: boolean };

export interface CommandContext {
  cwd: string;
  homeDir: string;
  env: NodeJS.ProcessEnv;
  stdin: TtyReadable;
  stdout: TtyWritable;
  stderr: Writable;
  fetchImpl?: FetchLike;
}

export function defaultContext(): CommandContext {
  return {
    cwd: process.cwd(),
    homeDir: homedir(),
    env: process.env,
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
  };
}

export function writeLine(stream: Writable, value = ''): void {
  stream.write(`${value}\n`);
}

export async function promptYesNo(ctx: CommandContext, question: string): Promise<boolean> {
  if (!ctx.stdin.isTTY || !ctx.stdout.isTTY) {
    return false;
  }
  const rl = createInterface({ input: ctx.stdin, output: ctx.stdout });
  try {
    const answer = await rl.question(`${question} [y/N] `);
    return answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes';
  } finally {
    rl.close();
  }
}
