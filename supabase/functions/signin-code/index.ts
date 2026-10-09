import { admin, cors, json, ownerFromRequest } from '../_shared/owner.ts';

/**
 * A one-time sign-in code for another device, shown on a device that's already signed in.
 * No email is sent: the code is the same one Supabase would email, made here instead, and the
 * new device signs in with it (verifyOtp). It's how the iPhone Home Screen app signs in, since
 * the email's link opens in Safari. Owner only, like everything else on the server.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'not found' }, 404);
  const userId = await ownerFromRequest(req);
  if (!userId) return json({ error: 'not allowed' }, 403);
  const { data: user } = await admin.auth.admin.getUserById(userId);
  const email = user.user?.email;
  if (!email) return json({ error: 'no email on this account' }, 400);
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error || !data.properties?.email_otp) return json({ error: error?.message ?? 'no code' }, 500);
  return json({ code: data.properties.email_otp, email });
});
