/**
 * After an update is published, an app that was already open still runs the old code, and
 * the parts it loads on demand (the label reader, Snap a shelf…) are gone from the site.
 * Loading one then fails at once. The cure is a reload, which picks up the new version.
 */
export function isStaleApp(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /dynamically imported module|Importing a module script failed|error loading dynamically|module script|Unable to preload/i.test(msg);
}

const KEY = 'palate.reloadedForUpdate';

/** Reload once to pick up the new version (never in a loop). True if it's reloading. */
export function reloadForUpdate(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* storage unavailable: still reload */
  }
  window.location.reload();
  return true;
}
