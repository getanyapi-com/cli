export class CliError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = 'CliError';
    this.exitCode = exitCode;
  }
}

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  /**
   * The failed run's AnyAPI request id, when the gateway reported one. Every
   * /v1/run response carries it on the X-Anyapi-Request-Id header, including
   * failures, and it is the handle support needs to read the stored request,
   * its attempts, and the retained upstream body. Empty on routes that execute
   * no run.
   */
  readonly requestId: string;
  /** Whole seconds from the response's Retry-After header, when it sent one. */
  readonly retryAfterSeconds: number | undefined;

  constructor(message: string, status: number, body: unknown, requestId = '', retryAfterSeconds?: number) {
    super(requestId === '' ? message : `${message} (request ${requestId})`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
    this.requestId = requestId;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

// isRateLimited is the gateway's 429 rate_limited. On starting a run it means
// nothing ran; on reading an accepted request it means the request is still
// running and is read again after Retry-After.
export function isRateLimited(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    error.status === 429 &&
    typeof error.body === 'object' &&
    error.body !== null &&
    (error.body as { code?: unknown }).code === 'rate_limited'
  );
}
