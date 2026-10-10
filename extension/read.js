/**
 * Runs inside the Total Wine page (chrome.scripting, world MAIN) and copies only what Palate
 * needs from window.INITIAL_STATE, the data the page loaded for itself. No requests of its own.
 * See docs/totalwine-collection.md. Self-contained: Chrome sends just this function's source.
 */
// eslint-disable-next-line no-unused-vars
function readTotalWinePage() {
  const state = window.INITIAL_STATE;
  const results = state && state.search && state.search.results;
  const products = results && Array.isArray(results.products) ? results.products : [];
  const store = state && state.store && state.store.store;
  if (!products.length) return { error: 'No wines on this page. Open a Total Wine wine category (e.g. Red Wine) and try again.' };
  if (!store || !store.storeNumber) return { error: 'Pick your store at the top of the Total Wine page first.' };

  const pick = (o, keys) => (o ? Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]])) : undefined);
  const list = (xs, keys) => (Array.isArray(xs) ? xs.map((x) => pick(x, keys)) : undefined);
  const clean = products.map((p) => ({
    id: String(p.id),
    name: String(p.name || ''),
    brand: p.brand ? { name: p.brand.name } : null,
    productUrl: p.productUrl,
    packageDescription: p.packageDescription,
    categories: list(p.categories, ['name', 'type']),
    price: list(p.price, ['price', 'type']),
    promoBadges: list(p.promoBadges, ['badgeSubType', 'badgePromotionDescription']),
    customerAverageRating: p.customerAverageRating,
    customerReviewsCount: p.customerReviewsCount,
    rating: p.rating,
    ratingSource: p.ratingSource,
    storeId: p.storeId === undefined ? undefined : String(p.storeId),
    storeName: p.storeName,
    location: p.location,
    stockLevel: list(p.stockLevel, ['stock', 'purchaseLimit']),
    stockMessages: p.stockMessages ? { messages: list(p.stockMessages.messages, ['shoppingMethod', 'stockMessage']) } : undefined,
  }));

  // The state is from the last full page load. If filters or page size were changed since,
  // the screen shows different bottles: compare with the product links on screen.
  const onScreen = new Set();
  document.querySelectorAll('a[href*="/p/"]').forEach((a) => {
    const m = a.getAttribute('href').match(/\/p\/(\d+)/);
    if (m) onScreen.add(m[1]);
  });
  const ids = clean.map((p) => p.id);
  const shown = ids.filter((id) => onScreen.has(id)).length;
  const extra = [...onScreen].filter((id) => !ids.includes(id)).length;
  const stale = shown < ids.length * 0.9 || (extra > 10 && extra > ids.length * 0.5);

  const pg = results.pagination || {};
  return {
    stale,
    payload: {
      store: { id: String(store.storeNumber), name: String(store.name || ''), city: String(store.city || '') },
      pageUrl: location.href,
      pagination: { page: pg.page, pageSize: pg.pageSize, totalPages: pg.totalPages, totalResults: pg.totalResults },
      products: clean,
    },
  };
}
