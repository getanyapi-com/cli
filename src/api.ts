import { CATALOG_URL, REST_BASE_URL, SIGNUP_URL } from './constants.js';
import { ApiError } from './errors.js';
import type {
  CatalogResponse,
  ClientRegistrationResponse,
  FetchLike,
  OAuthMetadata,
  RunResult,
  SignupResponse,
  TokenResponse,
} from './types.js';

export interface AnyApiClientOptions {
  apiKey?: string;
  fetchImpl?: FetchLike;
  restBaseUrl?: string;
  catalogUrl?: string;
  signupUrl?: string;
}

export interface SignupOptions {
  label?: string;
}

export class AnyApiClient {
  private readonly apiKey?: string;
  private readonly fetchImpl: FetchLike;
  private readonly restBaseUrl: string;
  private readonly catalogUrl: string;
  private readonly signupUrl: string;

  constructor(options: AnyApiClientOptions = {}) {
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.restBaseUrl = options.restBaseUrl ?? REST_BASE_URL;
    this.catalogUrl = options.catalogUrl ?? CATALOG_URL;
    this.signupUrl = options.signupUrl ?? SIGNUP_URL;
  }

  async signup(options: SignupOptions): Promise<SignupResponse> {
    const body = compactObject({ label: options.label });
    return this.requestJson<SignupResponse>(this.signupUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, { sanitize: false });
  }

  // oauthMetadata fetches the RFC 8414 authorization-server document. The caller
  // falls back to hardcoded endpoints when discovery fails.
  async oauthMetadata(url: string): Promise<OAuthMetadata> {
    return this.requestJson<OAuthMetadata>(url, undefined, { sanitize: false });
  }

  // registerClient performs OAuth 2.1 Dynamic Client Registration for a public
  // client (token_endpoint_auth_method 'none'). The gateway returns an
  // aa_client_... id the CLI persists and reuses (the endpoint is IP-rate-limited).
  async registerClient(
    registrationEndpoint: string,
    opts: { clientName: string; redirectUris: string[] },
  ): Promise<ClientRegistrationResponse> {
    return this.requestJson<ClientRegistrationResponse>(
      registrationEndpoint,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: opts.clientName,
          redirect_uris: opts.redirectUris,
          token_endpoint_auth_method: 'none',
        }),
      },
      { sanitize: false },
    );
  }

  // exchangeToken posts to the OAuth token endpoint as a public client (no secret):
  // application/x-www-form-urlencoded, used for the authorization_code grant.
  async exchangeToken(tokenUrl: string, params: Record<string, string>): Promise<TokenResponse> {
    return this.requestJson<TokenResponse>(
      tokenUrl,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params).toString(),
      },
      { sanitize: false },
    );
  }

  async catalog(options: { query?: string; category?: string } = {}): Promise<CatalogResponse> {
    const url = new URL(this.catalogUrl);
    if (options.query) {
      url.searchParams.set('query', options.query);
    }
    if (options.category) {
      url.searchParams.set('category', options.category);
    }
    return this.requestJson<CatalogResponse>(url, undefined, { sanitize: false });
  }

  async describe(sku: string): Promise<unknown> {
    return this.requestJson<unknown>(`${this.restBaseUrl}/apis/${encodeURIComponent(sku)}`, {
      headers: this.authHeaders(),
    });
  }

  // run always fetches the FULL result. Response shaping (fields/max_items/summary/
  // jq) is done locally by the CLI over the saved file, so re-slicing a paid run
  // costs nothing; no shape params are sent upstream.
  async run(sku: string, input: unknown): Promise<RunResult> {
    const url = new URL(`${this.restBaseUrl}/run/${encodeURIComponent(sku)}`);
    return this.requestJson<RunResult>(url, {
      method: 'POST',
      headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  }

  async balance(): Promise<unknown> {
    return this.requestJson<unknown>(`${this.restBaseUrl}/balance`, {
      headers: this.authHeaders(),
    });
  }

  private authHeaders(): Record<string, string> {
    return this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {};
  }

  private async requestJson<T>(
    input: string | URL,
    init?: RequestInit,
    options: { sanitize?: boolean } = {},
  ): Promise<T> {
    const response = await this.fetchImpl(input, init);
    const body = await parseBody(response);
    if (!response.ok) {
      throw new ApiError(errorMessage(body, response.status), response.status, body);
    }
    return (options.sanitize === false ? body : sanitizeCustomerJson(body)) as T;
  }
}

export function sanitizeCustomerJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeCustomerJson(item));
  }
  if (!isRecord(value)) {
    return value;
  }

  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    const lower = key.toLowerCase();
    if (lower.includes('credit')) {
      continue;
    }
    if (lower === 'provider') {
      output[key] = 'AnyAPI';
      continue;
    }
    if (lower === 'providers') {
      output[key] = ['AnyAPI'];
      continue;
    }
    output[key] = sanitizeCustomerJson(child);
  }
  return output;
}

function compactObject(input: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== ''),
  );
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorMessage(body: unknown, status: number): string {
  if (isRecord(body)) {
    const value = body.error ?? body.message ?? body.key ?? body.code;
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return `AnyAPI request failed with HTTP ${status}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
