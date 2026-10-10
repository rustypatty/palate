# Total Wine: what a store-filtered category page exposes

Investigation done 2026-10-09 in Claude in Chrome (the user's own Chrome, normal session), to decide how an
"Import this page" extension should read Total Wine. No crawling and no writes; 6 full page loads plus a
few in-page filter/store changes. No PerimeterX "press & hold" check appeared at any point.

## TL;DR

- **The page already carries everything we need, per store.** On a full page load, every product in
  `window.INITIAL_STATE.search.results.products` has the store ID, exact on-hand stock, aisle, pickup
  wording ("In stock" / "Limited quantity"), regular and sale prices, the Mix 6 deal, pro score and
  customer rating.
- **The store is not in the page URL.** It comes from the browser session (the header store picker).
  It shows up as `storeId` on each product, in `INITIAL_STATE.store.store`, and as the `storeId`
  parameter of the page's own JSON request.
- **Recommendation:** the extension should read `window.INITIAL_STATE` after a full page load (with a
  DOM fallback only for "this page has products but state is stale" detection). Details below.

## The page

Red Wine → Italy, pickup at Las Colinas only:

```
https://www.totalwine.com/wine/red-wine/c/000009?pageSize=24&countrystate=Italy&aty=1,0,0,0
```

| Part | Meaning |
| --- | --- |
| `/wine/red-wine/c/000009` | Category path; `000009` is the Red Wine category ID (also used by the API). |
| `countrystate=Italy` | Country/State facet. Other facets add their own parameters. |
| `aty=1,0,0,0` | "Get It Fast" availability flags. Observed: `1,1,0,0` = Pick Up + Deliver to (the default), `1,0,0,0` = Pick Up only. The UI has four options (Pick Up at my store, Pick Up at all stores, Deliver, Ship), so the last two slots are presumably all-stores / ship; not tested. |
| `pageSize` | 24 (default), 72 or 120. Those are the only values the menu offers (there is no 124). |
| `page` | Page number, added from page 2 on (`page=2&pageSize=120&countrystate=Italy&aty=1,0,0,0`). |

**There is no store parameter in the page URL.** The selected store lives in the session. The page links
to itself the same way for every store.

With Pick Up only, the result count was 432 at Las Colinas. Every product returned had pickup status
"In stock" or "Limited quantity" for the store, so this filter is the "on the shelf at my store" view.

## Where the data comes from

### 1. Embedded JSON: `window.INITIAL_STATE` (best)

A server-rendered Redux-style state object. Relevant paths:

| Path | Contents |
| --- | --- |
| `search.results.products[]` | The products on this page (24/72/120). |
| `search.results.pagination` | `{ page, pageSize, totalPages, totalResults }`, e.g. `{1, 120, 4, 432}`. |
| `search.results.facets` | Facet list with `selected` flags (Italy showed as selected). |
| `store.store` | The selected store: `storeNumber`, `name`, address, lat/long, phone, hours. |

**Caveat: it reflects the last *full* page load only.** When you change a filter, the page size or the
store inside the page, the site fetches new results with XHR and re-renders. `INITIAL_STATE` keeps the old
snapshot. Example: after clicking Italy, `INITIAL_STATE` still held the unfiltered Red Wine list (Oregon
Pinot, Napa Cab) and the 120-per-page view still showed 24 in state. After a reload of the same URL, state
matched the screen exactly.

### 2. The page's own JSON request

When filters change in-page, the site calls:

```
GET /search/api/product/categories/v2/categories/000009/products
    ?page=1
    &pageSize=24
    &state=US-TX
    &shoppingMethod=INSTORE_PICKUP,DELIVERY
    &userShoppingMethod=INSTORE_PICKUP
    &allStoresCount=true
    &storeId=535
    &countrystate=Italy
    &batch=true
```

This was the observed call when the Italy filter was applied with Pick Up + Deliver selected. It is the
one place the store ID appears explicitly in a request. Its JSON is what fills `search.results`; the
product objects are the same shape. I could not capture the response body itself (the browser tool only
listed requests, and I did not replay the call, to stay within the "no extra requests" scope), so treat the
shape as "same as `INITIAL_STATE.search.results`", which is very likely but not directly confirmed.

Other requests seen were not useful: `/search/api/store/storelocator/v1/store/535` (store details),
`/site/resourceapi/...` (CMS content), and PerimeterX's own `/FF0j69T5/xhr/api/v2/collector` and
`/api/v1/PX...`, which an extension must never touch or imitate.

### 3. Visible page elements (thin)

Each product card's text is only: pro score ("92 POINTS"), price, customer rating and review count, the
Mix 6 line, name, bottle size. Data attributes: `data-product-name`, `data-sku`, `data-department`,
`data-qty`. **No availability wording, stock, aisle, producer or rating source** on the card. The DOM is
fine for detecting which product IDs are on screen (links contain `/p/<id>`), not for the data.

## Fields per product (from `INITIAL_STATE`)

| Palate needs | Source field | Example | Notes |
| --- | --- | --- | --- |
| Product ID | `id` | `"113709750"` | Same ID ends the product URL. |
| URL | `productUrl` | `/wine/red-wine/sangiovese/tenuta-di-renieri-chianti-classico/p/113709750` | Relative; prefix `https://www.totalwine.com`. |
| Name | `name` | `"Tenuta di Renieri Chianti Classico, 2023"` | |
| Producer | `brand.name` | `"Tenuta di Renieri"` | It's the brand, which is usually the producer, but not always: Sassicaia's brand is "Sassicaia", not Tenuta San Guido. |
| Vintage | *no field* | | Parse from the name's trailing `, YYYY`. 43 of 120 Italian reds have no year in the name: treat as "not shown". |
| Bottle size | `packageDescription` | `"750ml Bottle"` | Seen: 750ml, 1.5L, 375ml, 1L. |
| Regular price | `price[]` where `type: "EDLP"` | `21.99` | |
| Sale price | `price[]` where `type: "LTSP"` | `59.97` (EDLP `79.97`) | Limited-time special; the card shows it in red with the EDLP struck through. |
| Deal price + condition | `promoBadges[].badgePromotionDescription` (`badgeSubType: "MIXCASE6"`) | `"Mix 6 for $19.79 each"` | The condition is in the text. Only MIXCASE6 appeared on this page. |
| Availability wording | `stockMessages.messages[]` where `shoppingMethod: "INSTORE_PICKUP"` → `stockMessage` | `"In stock"` / `"Limited quantity"` | Delivery said "Available", shipping "Unavailable" (Texas). |
| Exact stock | `stockLevel[0].stock` (+ `purchaseLimit`) | `35` (limit 6) | Low counts line up with "Limited quantity" (`stockMessages.digitalLimitedStock: true`). |
| Store | `storeId`, `storeName` | `"535"`, `"Irving"` | Matches the selected store. |
| Shelf location | `location` | `"Aisle 11, Left"`, `"Wine Cellar"` | Nice-to-have for "where to find it". |
| Pro rating | `rating` + `ratingSource` | `92`, `"James Suckling"` | `0` with no source means no pro score. |
| Customer rating | `customerAverageRating`, `customerReviewsCount` | `4.3`, `387` | `0`/`0` = no reviews. |
| Grape / region | `categories[]` with `type` `VARIETAL_TYPE` / `REGION` | `Sangiovese`, `Tuscany` | |

`stockMessages.storeInStock` was `false` on every product here, even ones the page shows as in stock for
pickup. Don't use it; use the `INSTORE_PICKUP` message.

See `docs/samples/totalwine-category-sample.json` for 24 sanitized products in this shape.

## Pagination

- Changing page adds `page=N` to the URL; everything else stays the same.
- Page sizes offered: 24, 72, 120. A full load of `pageSize=120` puts all 120 products in
  `INITIAL_STATE` (checked: 120 products, `totalPages: 4` for 432 results).
- Order is "Relevance" (the default sort). I didn't test other sorts.

## Switching stores

Stores compared (IDs from the store picker's radio values, `select-<id>`): Las Colinas (Irving) **535**,
Oak Lawn **531**, Dallas (Park Lane) **501**.

| Store | Italy, Pick Up only | `storeId` on products | Same bottle (Tenuta di Renieri Chianti Classico 2023) |
| --- | --- | --- | --- |
| Las Colinas | 432 results | `535` | 35 in stock, Aisle 11, Left |
| Oak Lawn | 396 results | `531` | 34 in stock, Aisle 02, Right |
| Dallas (Park Lane) | 860 results | `501` | 32 in stock, Aisle 16, Left |

What changes: result count, which products appear, stock counts, aisle, and `INITIAL_STATE.store.store`.
Prices for the bottles I compared were the same across the three stores. What doesn't change: the page
URL.

Of the 24 Las Colinas first-page products, 17 were in Oak Lawn's first 120 and 19 in Park Lane's. The
missing ones are mostly cellar / limited-quantity bottles; they may be further down rather than absent
(not checked).

**Gotcha:** picking a new store in the header reset the filters: Italy was dropped and `aty` went back to
`1,1,0,0` (Pick Up + Deliver). The extension shouldn't assume filters survive a store change.

Switched back to Las Colinas at the end.

## Recommended extraction method for the extension

**Read `window.INITIAL_STATE` from the page, after checking it matches what's on screen.**

1. A content script can't read page globals directly; inject a small page-world script (or use
   `chrome.scripting.executeScript({ world: "MAIN" })`) that copies
   `INITIAL_STATE.search.results.{products,pagination}` and `INITIAL_STATE.store.store` and posts them
   back. No network requests of our own, so nothing for PerimeterX to see beyond the user's normal
   browsing.
2. **Staleness check:** compare the product IDs in state with the `/p/<id>` links in the DOM (and
   `pagination.pageSize` with the card count). If they differ, the user changed something in-page; tell
   them to reload (or have the button reload the tab) before importing.
3. Map fields per the table above. Keep only products whose `INSTORE_PICKUP` message is "In stock" or
   "Limited quantity", and record `storeId` + store name with the import so Palate can say "at Las Colinas".
4. Suggest the user set 120 per page; 4 imports cover ~430 bottles.

Why not the others:

- **Visible elements:** missing producer, availability, stock, aisle and rating source. Fragile class names.
- **Calling the JSON API ourselves:** it's the cleanest shape and carries `storeId` explicitly, but it means
  the extension making its own requests to an endpoint behind PerimeterX. That's the kind of traffic that
  gets challenged, and replaying it with the session's cookies edges toward scraping. Reading what the
  page already loaded avoids both.
- **Passively capturing the page's XHR** (wrapping `fetch`/`XMLHttpRequest` in the page) would fix the
  staleness problem without extra requests. It's a reasonable v2, but it's more invasive, more brittle and
  more complicated than "reload, then read state".

## Open questions

- Response body of the categories API (assumed identical in shape to `search.results`).
- Exact meaning of `aty` slots 3–4.
- Whether `INITIAL_STATE` exists on search-result pages (`/search/all?text=...`) and product pages, not
  just category pages.
- How often `stockLevel` is refreshed vs. the real shelf.
