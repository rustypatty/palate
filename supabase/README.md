# Online storage (Supabase)

Palate works without this; signing in adds an online copy that keeps your phone and computer in step.

1. Create a free project at [supabase.com](https://supabase.com).
2. **SQL Editor → New query**: paste [`setup.sql`](setup.sql), press **Run**.
3. **Authentication → URL Configuration**: set **Site URL** to the app's address
   (e.g. `https://rustypatty.github.io/palate/`) and save, so the sign-in email's link comes back to Palate.
4. **Project Settings → API**: copy the **Project URL** and the **anon / publishable** key.
5. In this GitHub repo, **Settings → Secrets and variables → Actions → Variables**, add
   `SUPABASE_URL` and `SUPABASE_ANON_KEY` with those values, then re-run the deploy.
6. In Palate, **My palate → Sync across devices**: enter your email, then open the email on the same device and tap **Sign in**.
   Do this once on each device. (Supabase's free email service sends only a few emails an hour.)

Optional: once your devices are signed in, turn off **Authentication → Sign In / Providers → Allow new users to sign up**.
