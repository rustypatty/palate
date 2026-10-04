# Online storage (Supabase)

Palate works without this; signing in adds an online copy that keeps your phone and computer in step.

1. Create a free project at [supabase.com](https://supabase.com).
2. **SQL Editor → New query**: paste [`setup.sql`](setup.sql), press **Run**.
3. **Authentication → Emails → Magic link** template — replace the body with
   `<p>Your Palate code: <strong>{{ .Token }}</strong></p>` and save (Palate signs in with a typed code, not a link).
4. **Project Settings → API**: copy the **Project URL** and the **anon / publishable** key.
5. In this GitHub repo, **Settings → Secrets and variables → Actions → Variables**, add
   `SUPABASE_URL` and `SUPABASE_ANON_KEY` with those values, then re-run the deploy.
6. In Palate, **My palate → Sync across devices**: enter your email and the code. Do this once on each device.

Optional: once your devices are signed in, turn off **Authentication → Sign In / Providers → Allow new users to sign up**.
