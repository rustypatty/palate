/* global readTotalWinePage */
// The extension's background worker.
// - Import all pages: walks the Total Wine list in your tab, page by page at a gentle pace.
// - Refresh jobs: every few minutes while Chrome is open, asks Palate for a refresh to do (the
//   Monday 10am refresh, or one asked for from your phone), walks that list in a minimized window,
//   and reports progress after each page, so an interrupted refresh carries on where it stopped.
// Progress for the popup is kept in chrome.storage.session ("run").
importScripts('read.js');

const ENDPOINT = 'https://divnzezlhqksjjqmjcbl.supabase.co/functions/v1/tw-import';
let stopAsked = false;
let busy = false;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// A pause like a person reading the page, then the next one.
const pause = () => wait(3000 + Math.random() * 3000);

async function progress(patch) {
  const { run = {} } = await chrome.storage.session.get('run');
  const next = { ...run, ...patch };
  await chrome.storage.session.set({ run: next });
  chrome.action.setBadgeBackgroundColor({ color: '#7a1f35' });
  chrome.action.setBadgeText({ text: next.running ? String(next.page ?? '') : '' });
  return next;
}

async function post(path, key, body) {
  const res = await fetch(`${ENDPOINT}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-palate-key': key },
    body: JSON.stringify(body),
  });
  const out = await res.json().catch(() => ({}));
  return { ok: res.ok && out.ok !== false && !out.error, status: res.status, out };
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

async function open(tabId, url) {
  const ready = loaded(tabId);
  await chrome.tabs.update(tabId, { url });
  const ok = await ready;
  await wait(1500);
  return ok;
}

async function read(tabId) {
  const [{ result } = {}] = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: readTotalWinePage }).catch(() => []);
  return result;
}

const pageUrl = (base, page) => {
  const u = new URL(base);
  u.searchParams.set('page', String(page));
  return u.toString();
};

/**
 * Save the pages of a list from `page` on, in `tabId` (which already shows that page).
 * Returns how it ended: done, stopped, or a problem on a page (with `page` to carry on from).
 */
async function walk({ tabId, base, page, key, onPage, store }) {
  let totalPages = null;
  for (;;) {
    if (stopAsked) return { end: 'stopped', page };
    let result = await read(tabId);
    // A page still settling looks like one without wines: look once more before calling it a check.
    if (!result?.payload) {
      await wait(4000);
      result = await read(tabId);
    }
    if (!result || result.error || !result.payload) return { end: 'blocked', page };
    // A refresh is for one store: never save another store's stock under its list.
    if (store && result.payload.store.id !== store) return { end: 'store', page, found: result.payload.store.name };
    const { ok, status, out } = await post('', key, result.payload);
    if (status === 401) return { end: 'key', page, message: out.error };
    if (!ok) return { end: 'error', page, message: out.error || `error ${status}` };
    totalPages = out.totalPages || totalPages;
    await onPage({ page, totalPages, saved: out.saved, inStock: out.inStock, store: out.store });
    if (!totalPages || page >= totalPages) return { end: 'done', page, totalPages };
    await pause();
    if (stopAsked) return { end: 'stopped', page: page + 1 };
    page += 1;
    if (!(await open(tabId, pageUrl(base, page)))) return { end: 'slow', page };
  }
}

// ---------- Import all pages (from the popup, in your own tab) ----------

async function importAll(tabId, startUrl, key) {
  stopAsked = false;
  busy = true;
  const url = new URL(startUrl);
  const first = Number(url.searchParams.get('page') || 1);
  let saved = 0;
  let inStock = 0;
  await progress({ running: true, label: 'Importing', page: first, totalPages: null, saved, inStock, error: '', done: false });
  try {
    // Start from a fresh load, so the page's data matches what's on screen.
    const ready = loaded(tabId);
    await chrome.tabs.reload(tabId);
    await ready;
    await wait(1500);
    const r = await walk({
      tabId,
      base: startUrl,
      page: first,
      key,
      onPage: (p) => {
        saved += p.saved;
        inStock += p.inStock;
        return progress({ page: p.page, totalPages: p.totalPages, saved, inStock, store: p.store });
      },
    });
    if (r.end === 'done') return progress({ running: false, done: true });
    const why = {
      stopped: `Stopped at page ${r.page}.`,
      blocked: `Page ${r.page} didn’t show wines. If Total Wine asked you to confirm you’re human, do that, then click Import all pages again: it carries on from this page.`,
      slow: `Page ${r.page} took too long to load. Click Import all pages to carry on.`,
      key: r.message || 'Your connect key didn’t work. Paste a new one.',
      error: `Page ${r.page}: ${r.message}`,
    }[r.end];
    return progress({ running: false, error: why });
  } catch (e) {
    return progress({ running: false, error: e instanceof Error ? e.message : 'Something went wrong.' });
  } finally {
    busy = false;
  }
}

// ---------- Refresh jobs (weekly, or asked for from your phone) ----------

/** Report a job's progress; quietly ignore a lost connection (the job is picked up again later). */
async function report(key, body) {
  try {
    await post('/progress', key, body);
  } catch {
    /* offline: the job goes quiet and is handed out again */
  }
}

// ---------- Which store Total Wine shows ----------
// A Total Wine link with ?s=531&igrules=true opens the page at store 531 and makes it your
// store, the same as picking it in the header. A refresh for another store uses such links, then
// loads a page with your own store's number to put it back. Your store is read from the cookie
// twm-userStoreInformation ("ispStore~535:…"). The page itself says which store it shows, and
// walk() stops if that isn't the list's store.

const SITE = 'https://www.totalwine.com/';

/** A Total Wine link that opens at store `storeId`. */
function atStore(url, storeId) {
  if (!storeId) return url;
  const u = new URL(url);
  u.searchParams.set('s', String(storeId));
  u.searchParams.set('igrules', 'true');
  return u.toString();
}

/** The store picked in Total Wine's header, e.g. "535", or null. */
async function chosenStore() {
  const c = await chrome.cookies.get({ url: SITE, name: 'twm-userStoreInformation' }).catch(() => null);
  return c?.value.match(/ispStore~(\d+)/)?.[1] ?? null;
}

/** Before a refresh for another store: remember yours, to put it back after. */
async function noteHomeStore(storeId) {
  const { homeStore } = await chrome.storage.local.get('homeStore');
  if (homeStore) return;
  const mine = await chosenStore();
  if (mine && mine !== String(storeId)) await chrome.storage.local.set({ homeStore: { id: mine } });
}

/** Put back the store you had picked (in `tabId`, or a minimized window), then close the tab. */
async function restoreStore(tabId, listUrl) {
  const { homeStore } = await chrome.storage.local.get('homeStore');
  if (homeStore) {
    let win = null;
    try {
      if (!tabId) {
        win = await chrome.windows.create({ url: 'about:blank', state: 'minimized', focused: false });
        tabId = win.tabs[0].id;
      }
      await open(tabId, atStore(listUrl || `${SITE}wine/c/c0020`, homeStore.id));
      const shown = (await read(tabId))?.payload?.store?.id;
      if (shown === homeStore.id) await chrome.storage.local.remove('homeStore');
      else
        chrome.notifications.create('palate-store', {
          type: 'basic',
          iconUrl: 'icon-128.png',
          title: 'Palate: check your Total Wine store',
          message: 'A stock refresh couldn’t switch Total Wine back to your store. Pick it in Total Wine’s header.',
        });
    } catch {
      /* tried; the next refresh tries again */
    }
    if (win) await chrome.windows.remove(win.id).catch(() => {});
  }
  if (tabId) await chrome.tabs.remove(tabId).catch(() => {});
}

async function runJob(job, key, resume) {
  stopAsked = false;
  busy = true;
  let saved = job.saved || 0;
  let inStock = job.inStock || 0;
  let win = null;
  let tabId = resume?.tabId ?? null;
  await progress({ running: true, label: job.kind === 'weekly' ? 'Weekly refresh' : 'Refreshing', page: job.nextPage, totalPages: job.totalPages, saved, inStock, error: '', done: false });
  try {
    if (!tabId) {
      if (job.storeId) await noteHomeStore(job.storeId);
      // An empty window first, so the page load below is the one waited for.
      win = await chrome.windows.create({ url: 'about:blank', state: 'minimized', focused: false });
      tabId = win.tabs[0].id;
      if (!(await open(tabId, pageUrl(atStore(job.url, job.storeId), job.nextPage)))) throw new Error('Total Wine took too long to load. It carries on later.');
    }
    const r = await walk({
      store: job.storeId,
      tabId,
      base: atStore(job.url, job.storeId),
      page: job.nextPage,
      key,
      onPage: async (p) => {
        saved += p.saved;
        inStock += p.inStock;
        await report(key, { jobId: job.id, nextPage: p.page + 1, totalPages: p.totalPages, saved, inStock });
        return progress({ page: p.page, totalPages: p.totalPages, saved, inStock, store: p.store });
      },
    });
    if (r.end === 'done') {
      await report(key, { jobId: job.id, status: 'done', nextPage: r.page + 1, totalPages: r.totalPages, saved, inStock });
      await chrome.storage.local.remove('paused');
      await restoreStore(tabId, job.url);
      return progress({ running: false, done: true });
    }
    if (r.end === 'blocked') {
      // Total Wine wants a person: show the window, tell the phone, and try again in a few minutes.
      const message = 'Total Wine wants a quick check on your computer. Finish it in the Total Wine window; the refresh carries on by itself.';
      await report(key, { jobId: job.id, status: 'needs_you', nextPage: r.page, message });
      const tab = await chrome.tabs.get(tabId);
      await chrome.windows.update(tab.windowId, { state: 'normal', focused: true });
      await chrome.storage.local.set({ paused: { job: { ...job, nextPage: r.page, saved, inStock }, tabId } });
      chrome.notifications.create('palate-check', {
        type: 'basic',
        iconUrl: 'icon-128.png',
        title: 'Palate: Total Wine needs a quick check',
        message: 'Finish it in the Total Wine window and the stock refresh carries on.',
      });
      return progress({ running: false, error: message });
    }
    if (r.end === 'store') {
      const message = `Total Wine showed ${r.found} instead of ${job.storeName || `store ${job.storeId}`}, so this list wasn't refreshed. Tap Refresh stock to try again.`;
      await report(key, { jobId: job.id, status: 'failed', nextPage: r.page, message });
      await restoreStore(tabId, job.url);
      return progress({ running: false, error: message });
    }
    if (r.end === 'key') {
      await restoreStore(tabId, job.url);
      return progress({ running: false, error: r.message || 'Your connect key didn’t work. Paste a new one.' });
    }
    // Stopped, slow or a server error: leave the job; it's handed out again in 15 minutes and carries on.
    await restoreStore(tabId, job.url);
    return progress({ running: false, error: r.end === 'stopped' ? `Stopped at page ${r.page}. It carries on later.` : `Page ${r.page}: ${r.message || 'took too long'}. It carries on later.` });
  } catch (e) {
    if (win) await chrome.windows.remove(win.id).catch(() => {});
    await restoreStore(null, job.url);
    return progress({ running: false, error: e instanceof Error ? e.message : 'Something went wrong.' });
  } finally {
    busy = false;
  }
}

/** Every few minutes: carry on a refresh paused for a Total Wine check, or ask for a new one. */
async function poll() {
  if (busy) return;
  const { key } = await chrome.storage.local.get('key');
  if (!key) return;
  const { paused } = await chrome.storage.local.get('paused');
  if (paused) {
    const tab = await chrome.tabs.get(paused.tabId).catch(() => null);
    if (tab) {
      // Still waiting for you? Look at the page again.
      const result = await read(tab.id);
      if (!result || !result.payload) return;
      await chrome.storage.local.remove('paused');
      await report(key, { jobId: paused.job.id, status: 'running', nextPage: paused.job.nextPage });
      return runJob(paused.job, key, { tabId: tab.id });
    }
    // The window was closed: the job is handed out again and carries on from its page.
    await chrome.storage.local.remove('paused');
    await restoreStore(null, paused.job.url);
    await report(key, { jobId: paused.job.id, status: 'running', nextPage: paused.job.nextPage, message: 'Window closed' });
    return;
  }
  try {
    const { out } = await post('/claim', key, {});
    if (out.job) await runJob(out.job, key);
  } catch {
    /* offline: try again next time */
  }
}

chrome.alarms.onAlarm.addListener((a) => a.name === 'poll' && poll());
const schedule = () => chrome.alarms.create('poll', { delayInMinutes: 1, periodInMinutes: 5 });
chrome.runtime.onInstalled.addListener(schedule);
chrome.runtime.onStartup.addListener(schedule);

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === 'importAll') {
    importAll(msg.tabId, msg.url, msg.key);
    reply({ started: true });
  } else if (msg.type === 'stop') {
    stopAsked = true;
    reply({ stopping: true });
  } else if (msg.type === 'poll') {
    poll();
    reply({ polling: true });
  }
});
