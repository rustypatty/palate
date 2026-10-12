# Palate

A personal, mobile-first wine app: what you've tasted, what you thought, what you own, what to open tonight, and whether the bottle in front of you in the store is likely to suit you.

It works on its own in the browser. Signing in to Palate's online storage (Supabase) adds sync between devices, a Claude key held on the server, Total Wine stock, and price-drop alerts.

## What it does

### Your wines

- **My wines** — a bottle gallery with full, uncropped bottle photos. Search across producer, cuvée, grape, region and notes; quick shelves (Loved it / Liked it / Wouldn't buy again / In my cellar / Not tasted yet); filters for country, style and price; several sort orders. The same bottle saved twice (same producer and vintage, one name inside the other) is combined automatically.
- **Bottle details** — label photo, producer, cuvée, vintage (or NV), style, country, region, grapes, price, where bought, date tasted, barcode and your notes. Rate it and change the bottles on hand right on the page; everything else is editable. Each wine page also has:
  - **About this wine** — a written description (what it is, how it tastes, how to serve it), from Palate's shared wine catalog when the wine is there, otherwise written by Claude. A *For you* part, saying how it fits your taste, is always written for you on your device.
  - **Learn** — why it tastes the way it does (the grape, the place, how it's made, one thing to taste for), plus the other bottles in your cellar that share its grape or place.
  - **More like this** — bottles like it you could buy at your stores, from one Claude search of the stores' websites.
  - **Price watch** — the bell on Loved and Want to try bottles (see below).
- **Photos** — take one, upload one, or let Palate find one: Claude searches the web for pages about the wine and picks bottle shots of this wine, or you search Open Food Facts / Wikimedia Commons, or paste an image address. Every candidate goes through an "Is this your bottle?" check. Photos are downscaled and stored on the device.
- **Ask your wines** — the chat button at the top of My wines opens a chat that answers from your own wines ("What did I love from Spain?", "What should I open tonight with steak?"), plus general wine questions and what to try next. Wines it names appear as rows you can tap; recommendations offer "Find at Total Wine / Pogo's", which opens that store's list in In store. It only reads your wines, never changes them, and the conversation lasts for the session.
- **Share your loved wines** — with the Loved filter on in My wines, **Share** makes a read-only page at `<app>/loved/` (for example `rustypatty.github.io/palate/loved/`) that anyone with the link can open, with a proper preview card in Messages and WhatsApp. It shows each loved wine with its photo and Palate's description; your own notes, prices and bottle counts are never included. **Update** refreshes it, **Stop sharing** takes it down. Needs online storage (sign-in).
- **Want to try** — bottles saved for later, grouped by where they were suggested. Imported wishlists show as their own groups, your priorities first, then by tier and price.
- **Tonight** — pick what you're cooking (pasta, steak, fish, spicy…) and Palate picks a bottle from your cellar, from a pairing table and your ratings. Free and on the device.
- **Passport** — the places and grapes you've tasted, which ones you loved, the classics you haven't tried, and where to go next (starting with bottles you already have).
- **My palate** — what you love by grape, country and region, what you'd skip, the typical price of a wine you love, your imported wine profile, price watch, and settings.

### In the store

- **Check one bottle** — type what's on the label (e.g. "ridge zin"), scan the barcode, or snap the label. Palate looks for that exact wine, then your track record with the producer, grape, region, country and style, and gives a verdict (Strong match / Good bet / Mixed record / Probably skip) with the reasons, plus how the shelf price compares with what you usually pay for wines you love. With Claude, a snapped bottle also gets a coach's answer: buy, consider or skip, how it will taste, value and serving.
- **Snap a shelf** — photos of a store shelf, read and ranked by Claude against your ratings: a Top 3 with a price call on each, and at most 3 more under *Also good*. The photos are only read, never kept; results clear after an hour.
- **Snap a wine list** — photos of a restaurant's list, read once into a clean list, then a conversation about it ("Any Pinot?", "Best value under $100"). Follow-up questions send the list as text, so they cost a few cents.
- **Store lists** — a list of picks for one of your stores, each with Claude's reason. Your stores are in `src/lib/stores.ts`:
  - **Total Wine** — picks only from bottles on the shelf at your store, with the aisle, once its stock is imported (see *Total Wine stock* below). Bottles already in your collection are left out.
  - **Pogo's** — publishes its full wine list with prices and stock, so Palate downloads it and keeps it current.
  - **Whole Foods, Twin Liquors, Spec's, Central Market** — these block apps from reading their stock, so picks come from Claude searching the store's own website, with links to check your location.

### Price watch

Loved wines and Want to try bottles have their prices checked at your stores about every other week (switch a bottle off with its bell). Signed in, the check runs on the server every Monday even when the app isn't open, prices land on each wine's history, and a price drop sends a phone alert to the devices that turned alerts on (on iPhone, Palate must be on the Home Screen). *Check now* runs it from the app.

### Your wine profile

**My palate → import** takes a wine history file (schema 2.0, e.g. `wine_profile_data.json`) and keeps two things from it: the bottles you tasted, bought or want, added to your collection after being identified in the wine catalog; and the profile itself (stated preferences, rules, things not to assume), which every Claude request reads. Signed in, the profile is kept with your account.

## Where data lives

Your wines and photos are stored in the browser on each device (IndexedDB), so the app works with no account. The app also works offline after the first visit (service worker), so it still opens in a store with poor reception. Anything that uses Claude, the catalog, store lists or online photo search needs a connection.

- **Signed in** (My palate → Sync across devices), wines and photos sync in the background whenever something changes or the app is opened. When the same wine was changed on two devices, the later edit wins. On iPhone, the Home Screen app signs in with a one-time code shown on a device that's already signed in.
- **Not signed in**, use **Export backup** under *Your data* now and then; the JSON file includes photos and restores on any device.
- On iPhone, **Add to Home Screen** from Safari: Safari can clear website data for sites you haven't visited in a while, and Home Screen apps are exempt.

Barcode scanning works on iPhone and Android, live or from a photo of the back label. It uses the browser's built-in `BarcodeDetector` where there is one (Chrome on Android) and otherwise a WebAssembly build of ZXing, served with the app, so it works offline after the first scan.

## Claude

Every Claude feature (Ask your wines, label reading, the coach, Snap a shelf, Snap a wine list, store lists, More like this, About this wine, Learn, photo finding, price checks) uses `claude-opus-5-5` with structured output. The key can live in one of two places:

- **On the server (recommended):** stored once as the Supabase secret `ANTHROPIC_API_KEY`. Signed-in requests go through the `claude` edge function, which adds the key; it never reaches a browser, and only the project's owner (its first account) can use it.
- **On this device:** **My palate → Label reading with Claude**. It's checked, then stored in this browser's local storage and sent straight to Anthropic. A key saved on the device takes precedence over the server's. Anyone with access to the device could use it, so set a spend limit on the key in the Anthropic Console.

Typical costs are a few cents per request (a label or a written description is about 2–3¢). Descriptions, lessons and More like this results are saved with the wine, so reopening a page is free.

## Online setup (Supabase)

Optional; the app works without it. [`supabase/README.md`](supabase/README.md) covers creating the project, running `setup.sql` (wines and photos), sign-in, and the two GitHub Actions variables (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) the build reads. The other pieces, each safe to run more than once:

| Piece | What it's for |
| --- | --- |
| `profile.sql` | Your imported wine profile, kept with your account. |
| `catalog_notes.sql` | Shared written descriptions in the wine catalog. (The catalog itself, the `catalog_wines` table of about 167,000 wines, is loaded separately; see `docs/catalog/`.) |
| `push.sql` | Price-drop alert subscriptions and the server's push keys. |
| `totalwine.sql`, `totalwine_refresh.sql` | Total Wine stock and the refresh job queue the extension works through. |
| `share.sql` | The shared Loved list (`shared_lists`) and the public `shared` photo bucket. Anyone can read; only the owner can write. |
| `price_check_cron.sql` | The Monday price check schedule (pg_cron), after deploying `price-check`. |
| `functions/claude` | Forwards Claude requests with the server-held key. |
| `functions/signin-code` | One-time sign-in codes for another device. |
| `functions/push` | Turns price-drop alerts on and off per device. |
| `functions/price-check` | The scheduled price check. |
| `functions/tw-import` | Receives Total Wine pages from the Chrome extension. |

The edge functions need the secret `ANTHROPIC_API_KEY`; Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` itself.

## Total Wine stock (Chrome extension)

Total Wine doesn't let apps read its stock, so a Chrome extension (`extension/`) reads it from the pages you open in your own browser: each product's in-store stock, aisle and prices from the page's embedded data. [`docs/totalwine-collection.md`](docs/totalwine-collection.md) has what the page exposes and why.

1. In Palate, **My palate → Total Wine import → Download the extension**, and unzip it (the deploy builds `palate-extension.zip`).
2. In Chrome, open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose the unzipped folder.
3. Make a connect key in Palate and paste it into the extension.
4. On totalwine.com, pick your store, open a wine category, choose **Pick Up** only and 120 per page, then click **Import all pages**.

After that, the extension refreshes your lists by itself every Monday at 10am (Dallas time), and when you tap **Refresh stock** in the app, whenever Chrome is open on your computer.

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (*.live.test.ts call real services and are skipped without keys)
npm run build      # typecheck + production build into dist/
```

Without `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the environment, the app runs device-only: no sign-in, server key, catalog or Total Wine stock.

Stack: Vite, React, TypeScript, Dexie (IndexedDB), Supabase, lucide icons, barcode-detector/zxing-wasm, Anthropic TypeScript SDK + zod. Plain CSS with design tokens in `src/styles.css`.

```
src/
  pages/        Collection, WineDetail, WineForm (add/edit), InStore, Want, Tonight, Passport, Watch, Profile
  components/   Layout, WineCard, BottleImage, PhotoPicker, LabelSnap, ShelfSnap, WineListSnap,
                StorePicks, MoreLikeThis, LessonSheet, PriceWatch, CloudSync, TotalWineImport, …
  lib/          filters, insights (in-store verdict), taste, tonight, passport, appellations,
                stores, twStock, catalog/catalogMatch, sync/cloud, priceWatch, backup,
                and a *Client.ts per Claude feature (labelClient, shelfClient, wineListClient, …)
  db.ts         IndexedDB schema and wine/photo helpers
supabase/       SQL setup files and edge functions (see Online setup)
extension/      The Total Wine Chrome extension
```

## Deploying

It's a static site; `dist/` can go on any static host. The GitHub Pages workflow (`.github/workflows/deploy.yml`) builds and deploys on every push to `main`: enable **Settings → Pages → Source: GitHub Actions**, and add the Supabase variables above if you use online storage. Routes use hash URLs, so no server rewrites are needed.
