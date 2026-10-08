import { healthResponseSchema, type HealthResponse } from '@imperial-os/contracts';

export interface ApiClientOptions {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function createApiClient({ baseUrl, fetch }: ApiClientOptions) {
  const root = baseUrl.replace(/\/+$/, '');
  const doFetch = fetch ?? ((input, init) => globalThis.fetch(input, init));

  async function getJson(path: string): Promise<unknown> {
    const response = await doFetch(`${root}${path}`, { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      throw new ApiError(`GET ${path} failed with status ${response.status}`, response.status);
    }
    return response.json();
  }

  return {
    async getHealth(): Promise<HealthResponse> {
      return healthResponseSchema.parse(await getJson('/health'));
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
