export interface AnyApiConfig {
  apiKey?: string;
  keyId?: string;
  capUsd?: number;
  claimToken?: string;
  claimUrl?: string;
  expiresAt?: string;
  verificationStatus?: string;
}

export interface SignupResponse {
  secret: string;
  keyId: string;
  capUsd: number;
  verificationStatus: string;
  claimToken: string;
  claimUrl: string;
  expiresAt: string;
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
