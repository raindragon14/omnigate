import type { ProviderCandidate, ProviderRequest, ProviderResponse, RouterRequest } from "../shared/signatures";

/** Contract every provider adapter must implement. */
export interface ProviderAdapter {
  /** Unique identifier for this adapter type. */
  readonly id: string;

  /** Returns true when this adapter can handle the given request through the given provider. */
  supports(request: RouterRequest, provider: ProviderCandidate): boolean;

  /** Converts a normalised RouterRequest into a provider-specific HTTP request. */
  transformRequest(request: RouterRequest, provider: ProviderCandidate, apiKey: string): ProviderRequest;

  /** Sends the provider request and returns the raw response. */
  send(request: ProviderRequest): Promise<ProviderResponse>;
}
