import { spawn } from 'node:child_process';

// JqEvalError wraps a jq compile or runtime failure. The message concerns only
// the user's own expression (jq never sees provider secrets or upstream detail),
// so it is safe to surface verbatim.
export class JqEvalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JqEvalError';
  }
}

type JqJson = (input: unknown, query: string, flags?: string[]) => Promise<unknown[]>;

// wasmEngine is resolved lazily and cached. `undefined` = not yet attempted,
// `null` = the bundled wasm engine is unavailable (fall back to system jq).
let wasmEngine: JqJson | null | undefined;

async function loadWasmEngine(): Promise<JqJson | null> {
  if (wasmEngine !== undefined) {
    return wasmEngine;
  }
  try {
    const mod = await import('jq-wasm');
    wasmEngine = mod.json as JqJson;
  } catch {
    wasmEngine = null;
  }
  return wasmEngine;
}

// evalJq runs a jq expression over a parsed JSON value and returns the transformed
// result. Multiple jq outputs collapse to an array; a single output is returned
// as-is; zero outputs (e.g. `empty`) return null. It prefers the bundled
// WebAssembly jq (works with no system jq installed) and falls back to a system
// `jq` binary only when the wasm engine cannot load. A jq compile or runtime error
// throws JqEvalError; the caller surfaces it and exits non-zero (the paid result is
// already safe on disk, so nothing is wasted).
export async function evalJq(input: unknown, expr: string): Promise<unknown> {
  const engine = await loadWasmEngine();
  if (engine) {
    try {
      const outputs = await engine(input, expr);
      return collapse(outputs);
    } catch (error) {
      if (isJqQueryError(error)) {
        throw new JqEvalError(queryErrorMessage(error));
      }
      // The wasm module failed to load (not a query error). Fall through to
      // system jq so a jq expression still works on this machine.
    }
  }
  return systemJq(input, expr);
}

function collapse(outputs: unknown[]): unknown {
  if (outputs.length === 0) {
    return null;
  }
  if (outputs.length === 1) {
    return outputs[0];
  }
  return outputs;
}

function isJqQueryError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'JqError';
}

function queryErrorMessage(error: unknown): string {
  const record = error as { stderr?: unknown; message?: unknown };
  if (typeof record.stderr === 'string' && record.stderr.trim().length > 0) {
    return record.stderr.trim();
  }
  if (typeof record.message === 'string' && record.message.length > 0) {
    return record.message;
  }
  return 'jq evaluation failed';
}

function systemJq(input: unknown, expr: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn('jq', ['-c', expr], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => (out += chunk));
    child.stderr.on('data', (chunk) => (err += chunk));
    child.on('error', (error) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new JqEvalError('jq is not available: reinstall anyapi-cli (bundled jq-wasm) or install the jq binary.'));
        return;
      }
      reject(new JqEvalError(error.message));
    });
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new JqEvalError(err.trim() || `jq exited with code ${code}`));
        return;
      }
      try {
        const outputs = out
          .split('\n')
          .filter((line) => line.trim().length > 0)
          .map((line) => JSON.parse(line));
        resolve(collapse(outputs));
      } catch {
        reject(new JqEvalError('failed to parse jq output'));
      }
    });
    child.stdin.write(JSON.stringify(input ?? null));
    child.stdin.end();
  });
}
