import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

/**
 * Palate is one person's app: only the project's first account (its owner) may use the
 * server-side Anthropic key. Anyone else who signs in gets a 403 and can't spend it.
 */

export const admin: SupabaseClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

let ownerId: string | null = null;

export async function owner(): Promise<string | null> {
  if (ownerId) return ownerId;
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error || !data.users.length) return null;
  ownerId = [...data.users].sort((a, b) => a.created_at.localeCompare(b.created_at))[0].id;
  return ownerId;
}

/** The signed-in user behind a request, if it's the owner. */
export async function ownerFromRequest(req: Request): Promise<string | null> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id === (await owner()) ? data.user.id : null;
}

export const cors: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Expose-Headers': '*',
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
