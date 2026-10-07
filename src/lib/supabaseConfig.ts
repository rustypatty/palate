/** The Supabase project the app talks to (wine sync and the wine catalog), from the build's settings. */

// Tolerate the API address being pasted with its /rest/v1/ ending or spaces.
export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim().replace(/\/(rest\/v1)?\/?$/, '') || undefined;
export const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || undefined;
