/* global readTotalWinePage */
const ENDPOINT = 'https://divnzezlhqksjjqmjcbl.supabase.co/functions/v1/tw-import';
const $ = (id) => document.getElementById(id);

function show(section) {
  $('setup').hidden = section !== 'setup';
  $('main').hidden = section !== 'main';
}

function say(text, kind = '') {
  $('msg').textContent = text;
  $('msg').className = `msg ${kind}`;
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

const isTotalWine = (url) => {
  try {
    return /(^|\.)totalwine\.com$/.test(new URL(url).hostname);
  } catch {
    return false;
  }
};

/** Short pointers for fewer clicks: 120 per page, and only what's at your store. */
function tips(url) {
  const out = [];
  try {
    const u = new URL(url);
    if (u.searchParams.get('pageSize') !== '120') out.push('Set 120 per page (bottom of the list) for fewer imports.');
    if (!(u.searchParams.get('aty') || '').startsWith('1,0')) out.push('Under “Get It Fast”, choose only “Pick Up” at your store.');
  } catch {
    /* not a page address */
  }
  $('tips').replaceChildren(...out.map((t) => Object.assign(document.createElement('li'), { textContent: t })));
}

async function start() {
  const { key } = await chrome.storage.local.get('key');
  if (!key) return show('setup');
  show('main');
  const tab = await activeTab();
  if (!tab || !isTotalWine(tab.url)) {
    $('where').textContent = 'Open a Total Wine wine page (e.g. Red Wine → Italy) with your store picked, then click Import.';
    $('import').disabled = true;
    return;
  }
  $('where').textContent = 'Saves the bottles on this page and what your store has of them.';
  tips(tab.url);
}

$('save').addEventListener('click', async () => {
  const key = $('key').value.trim();
  if (!/^pk_[A-Za-z0-9_-]{20,80}$/.test(key)) {
    $('setup-msg').textContent = 'That doesn’t look like a connect key. Copy it again from Palate.';
    $('setup-msg').className = 'msg error';
    return;
  }
  await chrome.storage.local.set({ key });
  $('key').value = '';
  start();
});

$('change').addEventListener('click', async () => {
  await chrome.storage.local.remove('key');
  show('setup');
});

$('reload').addEventListener('click', async () => {
  const tab = await activeTab();
  await chrome.tabs.reload(tab.id);
  $('reload').hidden = true;
  say('Reloading. When the page has loaded, click Import this page.');
});

let nextUrl = null;
$('next').addEventListener('click', async () => {
  const tab = await activeTab();
  if (nextUrl) await chrome.tabs.update(tab.id, { url: nextUrl });
  $('next').hidden = true;
  say('Opening the next page. When it has loaded, click Import this page.');
});

$('import').addEventListener('click', async () => {
  const button = $('import');
  button.disabled = true;
  $('reload').hidden = true;
  $('next').hidden = true;
  say('Reading the page…');
  try {
    const tab = await activeTab();
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: readTotalWinePage });
    if (!result || result.error) return say(result?.error || 'Couldn’t read this page.', 'error');
    if (result.stale) {
      $('reload').hidden = false;
      return say('The page changed since it loaded (a filter or page size). Reload it, then import.', 'error');
    }
    say(`Saving ${result.payload.products.length} bottles…`);
    const { key } = await chrome.storage.local.get('key');
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-palate-key': key },
      body: JSON.stringify(result.payload),
    });
    const out = await res.json().catch(() => ({}));
    if (res.status === 401) {
      await chrome.storage.local.remove('key');
      show('setup');
      $('setup-msg').textContent = out.error || 'Your connect key didn’t work. Paste a new one.';
      $('setup-msg').className = 'msg error';
      return;
    }
    if (!res.ok || !out.ok) return say(out.error || `Couldn’t save (error ${res.status}). Try again.`, 'error');
    const pageNote = out.page && out.totalPages ? ` Page ${out.page} of ${out.totalPages}.` : '';
    say(`Saved ${out.saved} bottles · ${out.inStock} in stock at ${out.store}.${pageNote}`, 'ok');
    if (out.page && out.totalPages && out.page < out.totalPages) {
      const u = new URL(tab.url);
      u.searchParams.set('page', String(out.page + 1));
      nextUrl = u.toString();
      $('next').hidden = false;
    }
  } catch (e) {
    say(e instanceof Error ? e.message : 'Something went wrong. Try again.', 'error');
  } finally {
    button.disabled = false;
  }
});

start();
