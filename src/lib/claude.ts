import Anthropic from '@anthropic-ai/sdk';
import { SUPABASE_KEY } from './supabaseConfig';
import { SERVER_KEY } from './serverKey';

type Options = Omit<NonNullable<ConstructorParameters<typeof Anthropic>[0]>, 'apiKey' | 'baseURL' | 'dangerouslyAllowBrowser' | 'fetch'>;

/**
 * A Claude client: straight to Anthropic with a key saved on this device, or through Palate's
 * server (which adds the key it holds) when the key lives there. Same requests either way.
 */
export function claudeClient(apiKey: string, options: Options = {}): Anthropic {
  // Browser use is intentional: a device key is the user's own and only ever sent to Anthropic.
  if (apiKey !== SERVER_KEY) return new Anthropic({ apiKey, baseURL: 'https://api.anthropic.com', dangerouslyAllowBrowser: true, ...options });
  return new Anthropic({
    apiKey: 'held-by-server',
    dangerouslyAllowBrowser: true,
    ...options,
    baseURL: `${(import.meta.env.VITE_SUPABASE_URL as string).trim().replace(/\/(rest\/v1)?\/?$/, '')}/functions/v1/claude`,
    fetch: async (url, init) => {
      const { accessToken } = await import('./cloud');
      const headers = new Headers(init?.headers);
      const token = await accessToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);
      headers.set('apikey', SUPABASE_KEY ?? '');
      return fetch(url, { ...init, headers });
    },
  });
}
