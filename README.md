# Palate

A personal, mobile-first wine list: what you've tasted, what you thought, what you own, and whether the bottle in front of you in the store is likely to suit you.

## What it does

- **My wines** — a bottle gallery with full, uncropped bottle photos (`object-fit: contain` in fixed-size tiles). Search across producer, cuvée, grape, region, notes; quick shelves (Loved it / Liked it / Wouldn't buy again / In my cellar / Not tasted yet); filters for country, style and price; several sort orders.
- **Bottle details** — label photo, producer, cuvée, vintage (or NV), style, country, region, grapes, price, where bought, date tasted, barcode, tasting notes. One-tap rating and a bottles-on-hand stepper right on the detail page; everything else is editable.
- **Photos** — take a photo, upload one, or **find one online**: search Open Food Facts product photos or Wikimedia Commons, or paste an image address from a producer/shop site. Nothing is picked automatically — every candidate shows its product title, and choosing one goes through an "Is this your bottle?" check against the wine you're saving. Photos are downscaled and stored on the device; if a site blocks downloads, the link is kept instead.
- **In store** — type what's on the label (e.g. "ridge zin", "Marlborough sauvignon blanc") or scan the barcode (live or from a photo). Palate looks for that exact wine, then your track record with the producer, grape, region, country and style, and gives a verdict (Strong match / Good bet / Mixed record / Probably skip) with the reasons, plus how the shelf price compares with what you usually pay for wines you love. "Save this bottle" pre-fills the add form.
- **Snap the label** — take a photo of the front label and Claude (Anthropic's model, `claude-opus-5-5`) reads the producer, cuvée, vintage, country, region, grapes and style. In the store, that feeds the in-store check (so you see your history with that producer, grape and region, and any matching wines you've had); "Save this bottle" then pre-fills the add form, using your photo as the bottle photo. In the add form, it fills in only the fields you haven't typed. Anything the label didn't show clearly is flagged rather than guessed.
- **My palate** — what you love by grape, country and region, what you'd skip, typical price of a loved wine, and backup export/restore.

## Where data lives

Everything is stored privately in the browser on the device (IndexedDB) — no account, no server. Consequences worth knowing:

- Use **Export backup** on the *My palate* page occasionally; the JSON file includes photos and restores on any device.
- On iPhone, **Add to Home Screen** from Safari. Safari can clear website data for sites you haven't visited in a while; home-screen apps are exempt.
- Data does not sync between devices on its own (export on one, restore on the other).

The app works offline after the first visit (service worker), so it still opens in a store with poor reception. Online photo search, barcode lookup and label reading need a connection.

Barcode scanning works on iPhone and Android, live through the camera or from a photo of the back label. It uses the browser's built-in `BarcodeDetector` where there is one (Chrome on Android) and otherwise a WebAssembly build of ZXing (`barcode-detector` + `zxing-wasm`). The decoder is served with the app rather than a CDN, downloads on first scan, and then works offline. You can also scan a barcode into the add form, so the bottle opens instantly the next time you scan it in a store.

## Label reading setup

Label reading calls the Anthropic API directly from the browser with the user's own API key (there is no Palate server). Add the key under **My palate → Label reading with Claude**; it is checked, then stored in that browser's local storage only. Each label costs roughly a cent on the Anthropic account. Requests use structured output (a fixed JSON schema), medium effort, and the server-side refusal fallback (`fallbacks: "default"`). The SDK is loaded only the first time a label is read. Because the key lives in the browser, anyone with access to that device and browser could use it — set a spend limit on the key in the Anthropic Console.

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (search/filters, in-store advisor, storage, backup)
npm run build      # typecheck + production build into dist/
```

Stack: Vite, React, TypeScript, Dexie (IndexedDB), lucide icons, barcode-detector/zxing-wasm, Anthropic TypeScript SDK + zod (label reading). Plain CSS with design tokens in `src/styles.css`.

```
src/
  pages/        Collection, WineDetail, WineForm (add/edit), InStore, Profile
  components/   Layout (top nav on desktop, bottom nav on phones), WineCard, BottleImage,
                PhotoPicker, ImageSearchSheet, FilterSheet, BarcodeScanner, Sheet, …
  lib/          filters (search/filter/sort), insights (in-store advisor), image (resize/store), barcode,
                imageSearch (Open Food Facts, Wikimedia Commons), labelReader/labelClient (Claude), backup, format
  db.ts         IndexedDB schema and wine/photo helpers
```

## Deploying

It's a static site; `dist/` can go on any static host. A GitHub Pages workflow is included (`.github/workflows/deploy.yml`): enable **Settings → Pages → Source: GitHub Actions** and it deploys on every push to `main`. Routes use hash URLs, so no server rewrites are needed.
