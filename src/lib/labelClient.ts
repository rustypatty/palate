import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { resizeImage } from './image';
import { LabelReadError, type LabelReading } from './labelReader';

const MODEL = 'claude-opus-5-5';

const LabelSchema = z.object({
  is_wine_label: z.boolean().describe('False if the photo does not show a wine bottle or label.'),
  producer: z.string().describe('Winery / producer / house, as printed. Empty if not visible.'),
  wine_name: z
    .string()
    .describe('Cuvée or wine name, e.g. "Lytton Springs" or "Brut Réserve". If the wine is named only by grape or appellation, use that. Empty if unknown.'),
  vintage: z.string().describe('Four-digit year as printed, "NV" for non-vintage, or empty if not visible.'),
  country: z.string().describe('Country in English, e.g. "France", "United States". Empty if not determinable.'),
  region: z.string().describe('Most specific region or appellation shown, e.g. "Sancerre", "Dry Creek Valley".'),
  grapes: z.array(z.string()).describe('Only grape varieties actually printed on the label. Empty otherwise — they are looked up online afterwards.'),
  style: z
    .enum(['red', 'white', 'rose', 'sparkling', 'orange', 'dessert', 'fortified', 'unknown'])
    .describe('Only if the label states it (rouge/blanc/rosé, "red wine", a sparkling term) or the appellation allows just one style. Otherwise "unknown".'),
  confidence: z.enum(['high', 'medium', 'low']).describe('How sure you are about producer and wine name.'),
  uncertain: z.string().describe('One short sentence about anything unreadable or guessed; empty if nothing.'),
});


const PROMPT = `This is a photo of a wine bottle or label, taken by someone standing in a wine store.
Read the label and fill in the fields. Only report what the label shows or what follows directly from it (for example, the country of a named appellation). Never invent a vintage or cuvée name you cannot read — leave it empty and say so in "uncertain". Keep the producer's spelling and accents as printed.
Many appellations make both red and white wine — for example Burgundy villages and premiers crus such as Mercurey, as well as Bordeaux, Rhône and Rioja. Burgundy labels often don't state the colour. If the label doesn't say, set style to "unknown" and leave grapes empty rather than guessing; they will be checked online.`;

// Keep the schema and the public type in step.
const _check: z.infer<typeof LabelSchema> extends LabelReading ? true : never = true;
void _check;

async function toBase64Jpeg(photo: Blob): Promise<string> {
  // ~1500px is plenty for label text and keeps the upload quick on mobile data.
  const { blob } = await resizeImage(photo, 1500);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function readLabelWithClaude(apiKey: string, photo: Blob, signal?: AbortSignal): Promise<LabelReading> {
  // Browser use is intentional: the key belongs to the person using the app and never leaves their device except to call Anthropic.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 90_000 });
  const data = await toBase64Jpeg(photo);

  try {
    const response = await client.beta.messages.parse(
      {
        model: MODEL,
        max_tokens: 4000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium', format: betaZodOutputFormat(LabelSchema) },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } },
              { type: 'text', text: PROMPT },
            ],
          },
        ],
      },
      { signal },
    );
    if (response.stop_reason === 'refusal') throw new LabelReadError('Claude couldn’t read this photo. Try another angle.');
    if (response.stop_reason === 'max_tokens' || !response.parsed_output) throw new LabelReadError('Couldn’t make sense of the label. Try a closer photo.');
    // Colour and grapes from a label photo alone are unreliable (e.g. a red Mercurey read as
    // a white Chardonnay), so they're dropped here and only filled in once confirmed online.
    return { ...response.parsed_output, style: 'unknown', grapes: [] };
  } catch (e) {
    if (e instanceof LabelReadError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new LabelReadError('Your Anthropic API key was rejected. Check it on the My palate page.');
    if (e instanceof Anthropic.PermissionDeniedError) throw new LabelReadError('Your API key doesn’t have access to this model.');
    if (e instanceof Anthropic.RateLimitError) throw new LabelReadError('Too many requests right now — try again in a moment.');
    if (e instanceof Anthropic.APIConnectionError) throw new LabelReadError('No connection. Reading labels needs internet — type the name instead.');
    if (e instanceof Anthropic.BadRequestError && /credit/i.test(e.message)) {
      throw new LabelReadError('Your Anthropic account is out of credit. Add credit under Plans & Billing at console.anthropic.com.');
    }
    if (e instanceof Anthropic.APIError) throw new LabelReadError(`Anthropic API error (${e.status ?? 'unknown'}). Try again.`);
    throw e;
  }
}

/** Checks a key with a tiny request so the settings page can say whether it works. */
export async function testApiKey(key: string): Promise<true | string> {
  const client = new Anthropic({ apiKey: key.trim(), dangerouslyAllowBrowser: true, maxRetries: 0 });
  try {
    await client.messages.countTokens({ model: MODEL, messages: [{ role: 'user', content: 'hi' }] });
    return true;
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      return 'Anthropic says this key isn’t valid — it may have been deleted or not copied completely. Create a new key in the Anthropic Console and tap Copy right away.';
    }
    if (e instanceof Anthropic.PermissionDeniedError) return 'This key isn’t allowed to use Claude. Check the key’s workspace permissions in the Anthropic Console.';
    if (e instanceof Anthropic.APIConnectionError) return 'Couldn’t reach Anthropic. Check your connection.';
    if (e instanceof Anthropic.APIError) return `Anthropic returned an error (${e.status ?? 'unknown'}).`;
    return 'Couldn’t check the key.';
  }
}


// ---------------------------------------------------------------------------
// Online lookup: confirm style and grapes from the web, and find a clean photo
// of the same bottle to use instead of an in-hand snapshot.

export interface WineLookup {
  style: LabelReading['style'];
  grapes: string[];
  /** Page that confirmed the details. */
  sourceUrl: string;
  sourceName: string;
  /** A product photo that Claude compared against the user's picture. */
  photo: { url: string; pageUrl: string; siteName: string; title: string } | null;
  /** Why no photo was used, when none was (shown to the user). */
  photoNote: string;
  /** Published tasting notes, summarised in Claude's own words. */
  about: { text: string; sourceName: string; sourceUrl: string } | null;
}

const REPORT_TOOL = {
  name: 'report_wine',
  // Streamed request: send the report's input as it's written (it's validated with zod below).
  eager_input_streaming: true,
  description: 'Report what you found about this exact wine. Call this exactly once, at the end.',
  strict: true,
  input_schema: {
    type: 'object' as const,
    additionalProperties: false,
    required: ['found', 'style', 'grapes', 'source_url', 'source_name', 'tasting_notes', 'notes_source_name', 'notes_source_url', 'product_pages'],
    properties: {
      found: { type: 'boolean', description: 'True only if you found this exact wine (same producer and cuvée/appellation).' },
      style: { type: 'string', enum: ['red', 'white', 'rose', 'sparkling', 'orange', 'dessert', 'fortified', 'unknown'] },
      grapes: { type: 'array', items: { type: 'string' }, description: 'Grape varieties of this wine, from the source page.' },
      source_url: { type: 'string', description: 'The page that confirmed style and grapes (winery, importer or shop).' },
      source_name: { type: 'string', description: 'Short name of that site, e.g. "Domaine de la Bressande" or "Total Wine".' },
      tasting_notes: {
        type: 'string',
        description:
          'One to three sentences, in your own words, summarising published tasting notes for this wine (aromas, palate, tannins/acidity, body) from the winery, a critic or a shop. Do not copy text verbatim. Empty string if none found.',
      },
      notes_source_name: { type: 'string', description: 'Site the tasting notes came from, e.g. "Domaine de la Bressande". Empty if none.' },
      notes_source_url: { type: 'string', description: 'URL of the page the tasting notes came from. Empty if none.' },
      product_pages: {
        type: 'array',
        description: 'Up to 4 URLs of web shop (or winery) product pages selling this exact wine, best first. These are used to get a bottle photo.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['page_url', 'site_name'],
          properties: {
            page_url: { type: 'string' },
            site_name: { type: 'string' },
          },
        },
      },
    },
  },
};

const ReportSchema = z.object({
  found: z.boolean(),
  style: z.enum(['red', 'white', 'rose', 'sparkling', 'orange', 'dessert', 'fortified', 'unknown']),
  grapes: z.array(z.string()),
  source_url: z.string(),
  source_name: z.string(),
  tasting_notes: z.string(),
  notes_source_name: z.string(),
  notes_source_url: z.string(),
  product_pages: z.array(z.object({ page_url: z.string(), site_name: z.string() })),
});

const PhotoCheckSchema = z.object({
  same_wine: z.boolean().describe('True only if image 2 shows the same producer and the same cuvée/appellation as image 1, with the same label design.'),
  whole_bottle: z.boolean().describe('True if image 2 shows the entire bottle, neck to base, not cropped.'),
  clean: z.boolean().describe('True if image 2 is a product shot on a plain background (not a hand, shelf or table).'),
});

function describeReading(r: LabelReading): string {
  return [
    `Producer: ${r.producer || 'unknown'}`,
    `Wine: ${r.wine_name || 'unknown'}`,
    `Vintage: ${r.vintage || 'unknown'}`,
    `Region/appellation: ${r.region || 'unknown'}`,
    `Country: ${r.country || 'unknown'}`,
  ].join('\n');
}

async function checkPhoto(client: Anthropic, userPhoto: string, imageUrl: string, signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await client.beta.messages.parse(
      {
        model: MODEL,
        max_tokens: 2000,
        output_config: { effort: 'low', format: betaZodOutputFormat(PhotoCheckSchema) },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Image 1 — the bottle the user photographed:' },
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: userPhoto } },
              { type: 'text', text: 'Image 2 — a product photo found online:' },
              { type: 'image', source: { type: 'url', url: imageUrl } },
              {
                type: 'text',
                text: 'Is image 2 the same wine as image 1? Compare producer, cuvée and appellation on the labels. A different vintage is fine if the label is otherwise the same design; a different cuvée, colour or older label design is not.',
              },
            ],
          },
        ],
      },
      { signal },
    );
    const out = res.parsed_output;
    return Boolean(out && out.same_wine && out.whole_bottle);
  } catch {
    // Unreachable or unsupported image: just skip this candidate.
    return false;
  }
}

/**
 * Looks the wine up online (web search + fetch on Anthropic's side), then has
 * Claude compare each candidate photo with the user's picture. Returns null if
 * the exact wine couldn't be found.
 */
export type LookupOutcome = { ok: true; lookup: WineLookup } | { ok: false; reason: string };

export async function lookUpWineWithClaude(apiKey: string, reading: LabelReading, photo: Blob | null, signal?: AbortSignal): Promise<LookupOutcome> {
  // No automatic retries: a retried lookup is billed twice. Generous timeout: searching and
  // reading pages can take a few minutes, and the response streams so the connection stays alive.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 0, timeout: 600_000 });
  // Without the user's own photo there's nothing to compare against, so no photo is picked.
  const userPhoto = photo ? await toBase64Jpeg(photo) : null;

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `Here is what was read from a wine label:\n${describeReading(reading)}\n\n` +
            'Search the web for this exact wine. From a reliable page (the winery, its importer, or a wine shop), confirm whether it is red, white, rosé, etc., and its grape varieties. ' +
            'Also summarise its published tasting notes in one to three sentences of your own words (aromas, palate, structure), noting where they came from. ' +
            'Also list up to 4 product pages from web shops that sell this exact wine (same producer and cuvée), plus the winery’s page for it if there is one — their main images are used as the bottle photo. ' +
            'Prefer independent wine shops; skip totalwine.com, vivino.com, wine.com and wine-searcher.com, which block page previews. ' +
            'Then call report_wine once. If you cannot find this exact wine, call report_wine with found=false.',
        },
      ],
    },
  ];

  let report: z.infer<typeof ReportSchema> | null = null;
  let stopNote = '';
  try {
    for (let turn = 0; turn < 6 && !report; turn++) {
      const res = await client.beta.messages.stream(
        {
          model: MODEL,
          max_tokens: 16000,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          // Finding a wine and its notes is straightforward: low effort and a few
          // searches/reads keep it quick (typically under a minute) and cheap.
          output_config: { effort: 'low' },
          tools: [
            { type: 'web_search_20260209', name: 'web_search', max_uses: 3 },
            { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 2, max_content_tokens: 6000 },
            REPORT_TOOL,
          ],
          messages,
        },
        { signal },
      ).finalMessage();
      const call = res.content.find((b) => b.type === 'tool_use' && b.name === 'report_wine');
      if (call && call.type === 'tool_use') {
        const parsed = ReportSchema.safeParse(call.input);
        report = parsed.success ? parsed.data : null;
        break;
      }
      if (res.stop_reason === 'pause_turn') {
        // Server-side search/fetch hit its step limit; resume where it left off.
        messages.push({ role: 'assistant', content: res.content });
        continue;
      }
      if (res.stop_reason === 'end_turn') {
        // Finished without reporting: ask once for the report.
        messages.push({ role: 'assistant', content: res.content });
        messages.push({ role: 'user', content: 'Please call report_wine now with what you found.' });
        continue;
      }
      stopNote = `stopped early (${res.stop_reason ?? 'unknown'})`;
      break; // refusal, max_tokens, or anything unexpected
    }
  } catch (e) {
    if (e instanceof Anthropic.BadRequestError && /web (search|fetch).*not enabled|not enabled.*web (search|fetch)/i.test(e.message)) {
      throw new LabelReadError('Online checking is switched off for your Anthropic account. An admin can turn on web search and web fetch under Settings → Capabilities at console.anthropic.com.');
    }
    if (e instanceof Anthropic.APIConnectionTimeoutError) return { ok: false, reason: 'the online check took too long' };
    if (e instanceof Anthropic.APIUserAbortError) return { ok: false, reason: 'cancelled' };
    if (e instanceof Anthropic.APIConnectionError) return { ok: false, reason: 'lost connection to Anthropic (check your signal)' };
    if (e instanceof Anthropic.APIError) return { ok: false, reason: `Anthropic error ${e.status ?? ''}: ${e.message}`.slice(0, 300) };
    throw e;
  }
  if (!report) return { ok: false, reason: stopNote || 'Claude didn’t report a result' };
  if (!report.found) return { ok: false, reason: 'Claude couldn’t find this exact wine online' };

  // Web fetch only returns page text, so get each page's main product image from a
  // page-preview service, then have Claude compare it with the user's photo.
  let match: WineLookup['photo'] = null;
  let previews = 0;
  let checked = 0;
  for (const p of userPhoto ? report.product_pages.slice(0, 4) : []) {
    if (!/^https:\/\//.test(p.page_url)) continue;
    const img = await pagePreviewImage(p.page_url, signal);
    if (!img) continue;
    previews++;
    checked++;
    if (userPhoto && (await checkPhoto(client, userPhoto, img.url, signal))) {
      match = { url: img.url, pageUrl: p.page_url, siteName: p.site_name, title: img.title };
      break;
    }
  }

  const notes = report.tasting_notes.trim();
  return { ok: true, lookup: {
    style: report.style,
    grapes: report.grapes,
    sourceUrl: report.source_url,
    sourceName: report.source_name,
    about: notes
      ? { text: notes, sourceName: report.notes_source_name || report.source_name, sourceUrl: report.notes_source_url || report.source_url }
      : null,
    photo: match,
    photoNote: match || !userPhoto
      ? ''
      : report.product_pages.length === 0
        ? 'No shop pages for this wine were found.'
        : previews === 0
          ? 'Couldn’t load photos from the shop pages found.'
          : `None of the ${checked} photo${checked === 1 ? '' : 's'} found matched your bottle.`,
  } };
}

/**
 * The main image of a web page (its og:image), via Microlink's free page-preview
 * API. Product pages use the bottle shot; logos and banners are filtered out here
 * or rejected by the photo check.
 */
export async function pagePreviewImage(pageUrl: string, signal?: AbortSignal): Promise<{ url: string; title: string } | null> {
  try {
    const res = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(pageUrl)}`, { signal });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      status?: string;
      data?: { title?: string | null; image?: { url?: string; width?: number; height?: number; type?: string } | null };
    };
    const img = json.status === 'success' ? json.data?.image : null;
    if (!img?.url || !/^https:\/\//.test(img.url)) return null;
    if (img.type === 'svg' || /\.svg(\?|$)/i.test(img.url)) return null;
    // Bottle shots are portrait or square; wide images are logos and banners.
    if (img.width && img.height && img.width > img.height * 1.2) return null;
    return { url: img.url, title: json.data?.title ?? '' };
  } catch {
    return null;
  }
}
