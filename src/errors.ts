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

  constructor(message: string, status: number, body: unknown, requestId = '') {
    super(requestId === '' ? message : `${message} (request ${requestId})`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
    this.requestId = requestId;
  }
}
