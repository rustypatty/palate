import { cors, json, ownerFromRequest } from '../_shared/owner.ts';
import { logUsage } from '../_shared/usage.ts';

/**
 * The app's Claude requests, with the Anthropic key added here on the server: the key is
 * stored once as a Supabase secret and never reaches a browser.
 *   GET  /claude/status        → { ready } (is a key stored?)
 *   POST /claude/v1/messages   → forwarded to api.anthropic.com, streamed back as it comes
 */

const ANTHROPIC = 'https://api.anthropic.com';
// Headers the browser sends that Anthropic must not see (the key is ours to add).
const DROP = new Set(['host', 'authorization', 'apikey', 'x-api-key', 'x-client-info', 'content-length', 'connection', 'origin', 'referer', 'cookie', 'x-palate-feature']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (!(await ownerFromRequest(req))) return json({ error: { type: 'forbidden', message: 'Only the owner of this Palate can use its Claude key.' } }, 403);

  const key = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
  const path = new URL(req.url).pathname.replace(/^.*?\/claude(?=\/|$)/, '') || '/';
  if (path === '/status') return json({ ready: key.length > 0 });
  if (!key) return json({ error: { type: 'not_configured', message: 'No Anthropic key is stored on the server yet.' } }, 503);
  if (!path.startsWith('/v1/')) return json({ error: { type: 'not_found', message: 'Unknown path' } }, 404);

  const headers = new Headers();
  for (const [k, v] of req.headers) if (!DROP.has(k.toLowerCase())) headers.set(k, v);
  headers.set('x-api-key', key);

  const upstream = await fetch(`${ANTHROPIC}${path}${new URL(req.url).search}`, {
    method: req.method,
    headers,
    body: req.method === 'GET' ? undefined : req.body,
  });
  const out = new Headers(cors);
  for (const [k, v] of upstream.headers) if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(k)) out.set(k, v);
  // Count the call against its feature (x-palate-feature, set by the app) without slowing the reply.
  if (req.method !== 'POST' || !upstream.body) return new Response(upstream.body, { status: upstream.status, headers: out });
  const [forApp, forLog] = upstream.body.tee();
  const feature = (req.headers.get('x-palate-feature') ?? 'unknown').slice(0, 40);
  const logged = new Response(forLog).text().then((text) => logUsage(feature, upstream.status, text));
  // deno-lint-ignore no-explicit-any
  (globalThis as any).EdgeRuntime?.waitUntil?.(logged);
  return new Response(forApp, { status: upstream.status, headers: out });
});
