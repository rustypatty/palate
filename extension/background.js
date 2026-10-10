/* global readTotalWinePage */
// Import all pages: walks the Total Wine list page by page in your tab, at a gentle pace,
// saving each one like "Import this page". Progress is kept in chrome.storage.session.
importScripts('read.js');

const ENDPOINT = 'https://divnzezlhqksjjqmjcbl.supabase.co/functions/v1/tw-import';
let stopAsked = false;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function progress(patch) {
  const { run = {} } = await chrome.storage.session.get('run');
  const next = { ...run, ...patch };
  await chrome.storage.session.set({ run: next });
  chrome.action.setBadgeBackgroundColor({ color: '#7a1f35' });
  chrome.action.setBadgeText({ text: next.running ? String(next.page ?? '') : '' });
  return next;
}

/** Wait for the tab to finish loading (or give up after 45 s). */
function loaded(tabId) {
  return new Promise((resolve) => {
    const done = (ok) => {
      chrome.tabs.onUpdated.removeListener(on);
      clearTimeout(t);
      resolve(ok);
    };
    const on = (id, info) => id === tabId && info.status === 'complete' && done(true);
    const t = setTimeout(() => done(false), 45000);
    chrome.tabs.onUpdated.addListener(on);
  });
}

async function importAll(tabId, startUrl, key) {
  stopAsked = false;
  const url = new URL(startUrl);
  let page = Number(url.searchParams.get('page') || 1);
  let totalPages = null;
  let saved = 0;
  let inStock = 0;
  await progress({ running: true, page, totalPages, saved, inStock, error: '', done: false });
  try {
    // Start from a fresh load, so the page's data matches what's on screen.
    const first = loaded(tabId);
    await chrome.tabs.reload(tabId);
    await first;
    await wait(1500);
    for (;;) {
      if (stopAsked) return progress({ running: false, error: `Stopped at page ${page}.` });
      const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: readTotalWinePage });
      if (!result || result.error || !result.payload) {
        return progress({
          running: false,
          error: `Page ${page} didn’t show wines. If Total Wine asked you to confirm you’re human, do that, then click Import all pages again: it carries on from this page.`,
        });
      }
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-palate-key': key },
        body: JSON.stringify(result.payload),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out.ok) return progress({ running: false, error: `Page ${page}: ${out.error || `error ${res.status}`}` });
      saved += out.saved;
      inStock += out.inStock;
      totalPages = out.totalPages || totalPages;
      await progress({ page, totalPages, saved, inStock, store: out.store });
      if (!totalPages || page >= totalPages) return progress({ running: false, done: true });

      // A pause like a person reading the page, then the next one.
      await wait(3000 + Math.random() * 3000);
      if (stopAsked) return progress({ running: false, error: `Stopped after page ${page}.` });
      page += 1;
      url.searchParams.set('page', String(page));
      await progress({ page });
      const ready = loaded(tabId);
      await chrome.tabs.update(tabId, { url: url.toString() });
      if (!(await ready)) return progress({ running: false, error: `Page ${page} took too long to load. Click Import all pages to carry on.` });
      await wait(1500);
    }
  } catch (e) {
    return progress({ running: false, error: e instanceof Error ? e.message : 'Something went wrong.' });
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === 'importAll') {
    importAll(msg.tabId, msg.url, msg.key);
    reply({ started: true });
  } else if (msg.type === 'stop') {
    stopAsked = true;
    reply({ stopping: true });
  }
});
