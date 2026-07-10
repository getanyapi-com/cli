export interface AnyApiConfig {
  apiKey?: string;
  keyId?: string;
  capUsd?: number;
  expiresAt?: string;
  verificationStatus?: string;
  clientId?: string;
  refreshToken?: string;
  accessTokenExpiresAt?: string;
  scope?: string;
}

export interface SignupUpgrade {
  authorizationServer: string;
  scope: string;
  clientId?: string;
}

export interface SignupResponse {
  secret: string;
  keyId: string;
  capUsd: number;
  verificationStatus: string;
  expiresAt: string;
  clientId?: string;
  upgrade?: SignupUpgrade;
  notice?: string;
}

export interface OAuthMetadata {
  authorization_endpoint: string;
  token_endpoint: string;
  code_challenge_methods_supported?: string[];
  token_endpoint_auth_methods_supported?: string[];
  scopes_supported?: string[];
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

export interface CatalogApi {
  slug: string;
  category?: string;
  name: string;
  description?: string;
  fromCredits?: number;
  baseCredits?: number;
  perItemCredits?: number;
  priceUsd?: number;
  baseUsd?: number;
  perItemUsd?: number;
  perItemUnit?: string;
}

export interface CatalogResponse {
  apis: CatalogApi[];
}

export interface RunResult {
  output?: unknown;
  provider?: string;
  costUsd?: number;
  items?: number;
  [key: string]: unknown;
}

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
