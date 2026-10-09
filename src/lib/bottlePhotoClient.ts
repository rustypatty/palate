import Anthropic from '@anthropic-ai/sdk';
import { claudeClient } from './claude';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { relayedImageUrl } from './labelClient';
import { resizeImage } from './image';

/**
 * Finding a real photo of a bottle, without you doing anything:
 *  1. Claude searches the web for pages about this wine (winery, importer, shops, Vivino).
 *  2. A page reader (r.jina.ai) lists the images on each page. Many shops block
 *     automated visits; the reader gets through more of them than a fetch can.
 *  3. Only tall, bottle-shaped images are kept (sizes come from the image relay).
 *  4. Claude looks at them and picks the ones that are this wine.
 */

const MODEL = 'claude-opus-5-5';

export interface BottlePhoto {
  /** Full-size image through the CORS relay, so it can be saved on the device. */
  url: string;
  thumbUrl: string;
  pageUrl: string;
  siteName: string;
  title: string;
}

export type BottlePhotoOutcome = { ok: true; photos: BottlePhoto[]; matched: boolean } | { ok: false; reason: string };

const PAGES_TOOL = {
  name: 'report_pages',
  description: 'Report the pages found. Call this exactly once, at the end.',
  strict: true,
  input_schema: {
    type: 'object' as const,
    additionalProperties: false,
    required: ['pages'],
    properties: {
      pages: {
        type: 'array',
        description: 'Up to 6 pages about this exact wine (same producer and cuvée), best first.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['url', 'site'],
          properties: { url: { type: 'string' }, site: { type: 'string', description: 'Short site name, e.g. "Vivino" or the winery name.' } },
        },
      },
    },
  },
};
const PagesSchema = z.object({ pages: z.array(z.object({ url: z.string(), site: z.string() })) });

const PickSchema = z.object({
  matches: z.array(z.number()).describe('Numbers of the images that show this wine as a whole bottle, best photo first. Empty if none.'),
});

const JUNK = /logo|icon|sprite|flag|banner|avatar|badge|payment|cookie|placeholder|loading|pixel|social|facebook|instagram|twitter|map|award|medal/i;

export function siteOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Web';
  }
}

/** Image links on a page, via the reader. Empty if the page can't be read. */
export async function pageImages(pageUrl: string, signal?: AbortSignal): Promise<{ title: string; images: string[] }> {
  try {
    const res = await fetch(`https://r.jina.ai/${pageUrl}`, { headers: { 'X-With-Images-Summary': 'true' }, signal });
    if (!res.ok) return { title: '', images: [] };
    const text = await res.text();
    const title = /^Title:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? '';
    if (/access denied|has been denied|just a moment|captcha/i.test(title)) return { title, images: [] };
    const found = text.match(/https:\/\/[^\s)"'<>]+?\.(?:jpe?g|png|webp)(?:\?[^\s)"'<>]*)?/gi) ?? [];
    const images = [...new Set(found)].filter((u) => !JUNK.test(u.split('?')[0]));
    return { title, images: images.slice(0, 12) };
  } catch {
    return { title: '', images: [] };
  }
}

/** Width and height of an image, read by the relay (no download of the full image). */
async function imageSize(url: string, signal?: AbortSignal): Promise<{ width: number; height: number } | null> {
  try {
    const res = await fetch(`https://images.weserv.nl/?url=${encodeURIComponent(url)}&output=json`, { signal });
    if (!res.ok) return null;
    const j = (await res.json()) as { width?: number; height?: number };
    return j.width && j.height ? { width: j.width, height: j.height } : null;
  } catch {
    return null;
  }
}

const thumbUrl = (url: string) => `https://images.weserv.nl/?url=${encodeURIComponent(url)}&w=400&h=400&fit=inside&bg=white&output=jpg&q=80`;

async function blobBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function asBase64(url: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch(url, { signal });
    return res.ok ? await blobBase64(await res.blob()) : null;
  } catch {
    return null;
  }
}

/** Bottle-shaped images on these pages (tall, at least 300px), up to 8. */
async function bottleImages(pages: { url: string; site: string }[], fallbackTitle: string, signal?: AbortSignal): Promise<BottlePhoto[]> {
  const read = await Promise.all(pages.map(async (p) => ({ page: p, ...(await pageImages(p.url, signal)) })));
  const seen = new Set<string>();
  const listed = read.flatMap((r) => r.images.filter((u) => !seen.has(u) && seen.add(u)).map((url) => ({ url, page: r.page, title: r.title })));
  const sized = await Promise.all(listed.slice(0, 30).map(async (c) => ({ ...c, size: await imageSize(c.url, signal) })));
  return sized
    .filter((c) => c.size && c.size.height >= 300 && c.size.height >= c.size.width * 1.5)
    .slice(0, 8)
    .map((c) => ({
      url: relayedImageUrl(c.url),
      thumbUrl: thumbUrl(c.url),
      pageUrl: c.page.url,
      siteName: c.page.site || siteOf(c.page.url),
      title: c.title || fallbackTitle,
    }));
}

/** The bottle photos on one page (a link you pasted). Free: no Claude involved. */
export function bottleImagesOnPage(pageUrl: string, signal?: AbortSignal): Promise<BottlePhoto[]> {
  return bottleImages([{ url: pageUrl, site: siteOf(pageUrl) }], siteOf(pageUrl), signal);
}

function reason(e: unknown): string | null {
  if (e instanceof Anthropic.AuthenticationError) return 'your Anthropic key was rejected — check it in My palate';
  if (e instanceof Anthropic.RateLimitError) return 'too many requests right now — try again in a moment';
  if (e instanceof Anthropic.BadRequestError && /credit/i.test(e.message)) return 'your Anthropic account is out of credit';
  if (e instanceof Anthropic.BadRequestError && /web search.*not enabled|not enabled.*web search/i.test(e.message)) return 'web search is switched off for your Anthropic account';
  if (e instanceof Anthropic.APIConnectionError) return 'no connection';
  if (e instanceof Anthropic.APIError) return `Anthropic error ${e.status ?? ''}`.trim();
  return null;
}

/** Claude looks at the photos and ranks the ones that are this wine (about 2¢). */
async function pickPhotos(client: Anthropic, wine: string, bottles: BottlePhoto[], snap: Blob | null, signal?: AbortSignal): Promise<BottlePhotoOutcome> {
  const thumbs = await Promise.all(bottles.map((b) => asBase64(b.thumbUrl, signal)));
  const shown = bottles.map((b, i) => ({ b, data: thumbs[i] })).filter((x): x is { b: BottlePhoto; data: string } => Boolean(x.data));
  if (!shown.length) return { ok: false, reason: 'the bottle photos found couldn’t be loaded' };
  const snapData = snap ? await blobBase64((await resizeImage(snap, 800)).blob).catch(() => null) : null;
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...(snapData
      ? [
          { type: 'text' as const, text: 'My own photo of the bottle (for comparing the label):' },
          { type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: snapData } },
        ]
      : []),
    ...shown.flatMap((x, i) => [
      { type: 'text' as const, text: `Image ${i + 1}:` },
      { type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: x.data } },
    ]),
    {
      type: 'text',
      text:
        `Which of these images show a whole bottle of ${wine}? Same producer and cuvée on the label; a different vintage is fine. ` +
        (snapData ? 'Prefer the one whose label matches my photo. ' : '') +
        'Rank the matches, the cleanest product shot (plain background, whole bottle, upright) first. Leave out anything else.',
    },
  ];
  const pick = await client.beta.messages.parse(
    { model: MODEL, max_tokens: 2000, output_config: { effort: 'low', format: betaZodOutputFormat(PickSchema) }, messages: [{ role: 'user', content }] },
    { signal },
  );
  const order = (pick.parsed_output?.matches ?? []).map((n) => n - 1).filter((i, k, all) => i >= 0 && i < shown.length && all.indexOf(i) === k);
  const ranked = [...order.map((i) => shown[i].b), ...shown.map((x) => x.b).filter((_, i) => !order.includes(i))];
  return { ok: true, photos: ranked, matched: order.length > 0 };
}

/**
 * Bottle photos of this wine from the web, best first. `matched` is true when Claude
 * confirmed the first one is this wine (and, given your own snap, the same label).
 */
export async function findBottlePhotosWithClaude(
  apiKey: string,
  wine: string,
  snap: Blob | null,
  signal?: AbortSignal,
  /** Pages already known to be this wine (e.g. its store pages): tried first, without a web search. */
  known: { url: string; site: string }[] = [],
): Promise<BottlePhotoOutcome> {
  // No automatic retries: a retry would be billed twice.
  const client = claudeClient(apiKey, { maxRetries: 0, timeout: 300_000 });
  try {
    if (known.length) {
      const onKnown = await bottleImages(known, wine, signal);
      if (onKnown.length) {
        const out = await pickPhotos(client, wine, onKnown, snap, signal);
        if (out.ok && out.matched) return out;
      }
    }
    // 1. Pages about this wine.
    const messages: Anthropic.Beta.BetaMessageParam[] = [
      {
        role: 'user',
        content:
          `Find web pages with a photo of this wine bottle: ${wine}\n\n` +
          'Search the web, then report up to 6 pages about this exact wine (same producer and cuvée; any vintage is fine): the winery’s own page for it, its importer, Vivino, and wine shops. ' +
          'Only report URLs that appeared in your search results. Then call report_pages once.',
      },
    ];
    let pages: { url: string; site: string }[] | null = null;
    for (let turn = 0; turn < 4 && !pages; turn++) {
      const res = await client.beta.messages
        .stream(
          {
            model: MODEL,
            max_tokens: 4000,
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
            output_config: { effort: 'low' },
            tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 }, PAGES_TOOL],
            messages,
          },
          { signal },
        )
        .finalMessage();
      const call = res.content.find((b) => b.type === 'tool_use' && b.name === 'report_pages');
      if (call && call.type === 'tool_use') {
        const parsed = PagesSchema.safeParse(call.input);
        pages = parsed.success ? parsed.data.pages : [];
        break;
      }
      if (res.stop_reason !== 'pause_turn' && res.stop_reason !== 'end_turn') break;
      messages.push({ role: 'assistant', content: res.content });
      if (res.stop_reason === 'end_turn') messages.push({ role: 'user', content: 'Please call report_pages now.' });
    }
    pages = (pages ?? []).filter((p) => /^https:\/\//.test(p.url)).slice(0, 6);
    if (!pages.length) return { ok: false, reason: 'no pages about this wine were found online' };

    // 2–3. Images on those pages, bottle-shaped ones only.
    const bottles = await bottleImages(pages, wine, signal);
    if (!bottles.length) return { ok: false, reason: 'the pages found had no bottle photos that could be loaded' };

    // 4. Claude picks the ones that are this wine.
    return await pickPhotos(client, wine, bottles, snap, signal);
  } catch (e) {
    if (signal?.aborted) return { ok: false, reason: 'cancelled' };
    const r = reason(e);
    if (r) return { ok: false, reason: r };
    throw e;
  }
}
