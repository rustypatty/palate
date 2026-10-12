import { admin } from './owner.ts';

/** One Claude call's token counts, as the API reports them (JSON reply or streamed events). */
interface Usage {
  model?: string;
  input_tokens: number;
  cache_write_tokens: number;
  cache_read_tokens: number;
  output_tokens: number;
  web_searches: number;
}

// deno-lint-ignore no-explicit-any
type Raw = any;

export function readUsage(body: string): Usage {
  const u: Usage = { input_tokens: 0, cache_write_tokens: 0, cache_read_tokens: 0, output_tokens: 0, web_searches: 0 };
  const take = (o: Raw, model?: string) => {
    if (!o) return;
    if (model) u.model = model;
    u.input_tokens = o.input_tokens ?? u.input_tokens;
    u.cache_write_tokens = o.cache_creation_input_tokens ?? u.cache_write_tokens;
    u.cache_read_tokens = o.cache_read_input_tokens ?? u.cache_read_tokens;
    u.output_tokens = o.output_tokens ?? u.output_tokens;
    u.web_searches = o.server_tool_use?.web_search_requests ?? u.web_searches;
  };
  try {
    if (body.trimStart().startsWith('{')) {
      const m = JSON.parse(body);
      take(m.usage, m.model);
      return u;
    }
    for (const line of body.split('\n')) {
      if (!line.startsWith('data:')) continue;
      const e = JSON.parse(line.slice(5));
      if (e.type === 'message_start') take(e.message?.usage, e.message?.model);
      else if (e.type === 'message_delta') take(e.usage);
    }
  } catch { /* a cut-off reply: keep what was read */ }
  return u;
}

/** Record one call. Never throws: tracking must not break a request. */
export async function logUsage(feature: string, status: number, body: string): Promise<void> {
  try {
    const { error } = await admin.from('claude_usage').insert({ feature, status, ...readUsage(body) });
    if (error) console.error('usage log failed', error.message);
  } catch (e) {
    console.error('usage log failed', e instanceof Error ? e.message : e);
  }
}
