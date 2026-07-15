export interface AnyApiConfig {
  apiKey?: string;
  keyId?: string;
  capUsd?: number;
  expiresAt?: string;
  verificationStatus?: string;
  clientId?: string;
  cliClientId?: string;
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
  registration_endpoint?: string;
  code_challenge_methods_supported?: string[];
  token_endpoint_auth_methods_supported?: string[];
  scopes_supported?: string[];
}

// ClientRegistrationRequest is the OAuth 2.1 Dynamic Client Registration body.
// token_endpoint_auth_method MUST be 'none' (public client) or the server 400s.
export interface ClientRegistrationRequest {
  client_name: string;
  redirect_uris: string[];
  token_endpoint_auth_method: 'none';
}

export interface ClientRegistrationResponse {
  client_id: string;
  client_name?: string;
  redirect_uris?: string[];
  token_endpoint_auth_method?: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

export interface FlatPricingOffer {
  model: 'flat';
  unit: 'request';
  maxUsd: number;
}

export interface LinearPricingOffer {
  model: 'linear';
  unit: string;
  baseUsd: number;
  perUnitUsd: number;
  maxUsd: number;
}

export type PricingOffer = FlatPricingOffer | LinearPricingOffer;

export interface DiscoveryPricing {
  from: PricingOffer;
  failoverMaxUsd: number;
}

export interface DiscoveryLane {
  pricing: PricingOffer;
  health?: {
    window: string;
    uptimePct: number;
    latencyP50Ms: number;
    requests: number;
  };
}

export interface CatalogApi {
  id?: string;
  slug: string;
  category?: string;
  name: string;
  description?: string;
  provider: 'AnyAPI';
  pricing?: DiscoveryPricing;
  lanes?: DiscoveryLane[];
  inputSchema?: unknown;
  outputSchema?: unknown;
  heavy?: boolean;
  tryEligible?: boolean;
  relevance?: number;
  highlightFields?: unknown[];
}

export interface CatalogResponse {
  apis: CatalogApi[];
}

export interface SearchResponse {
  results: CatalogApi[];
  total: number;
  ranking: string;
}

export interface RunResult {
  output?: unknown;
  provider?: string;
  costUsd?: number;
  items?: number;
  [key: string]: unknown;
}

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
