/**
 * Online bottle-photo search. These sources host real product photography
 * (not generated imagery), and every candidate carries its product title so
 * the user can confirm it's the same cuvée and vintage before choosing it.
 */

export interface ImageCandidate {
  id: string;
  url: string;
  thumbUrl: string;
  title: string;
  subtitle: string;
  sourceName: string;
  pageUrl: string;
  barcode?: string;
}

interface OffProduct {
  code?: string;
  product_name?: string;
  brands?: string;
  quantity?: string;
  image_front_url?: string;
  image_front_small_url?: string;
  image_url?: string;
  categories_tags?: string[];
}

const OFF_FIELDS = 'code,product_name,brands,quantity,image_front_url,image_front_small_url,image_url,categories_tags';

function offToCandidate(p: OffProduct): ImageCandidate | null {
  const url = p.image_front_url || p.image_url;
  if (!url || !p.code) return null;
  return {
    id: `off-${p.code}`,
    // OFF serves sized renditions (…/front_en.3.400.jpg); ask for the full one and
    // fall back to the 400px rendition if it isn't available.
    url: url.replace(/\.\d+\.jpg$/, '.full.jpg'),
    thumbUrl: url,
    title: p.product_name?.trim() || 'Untitled product',
    subtitle: [p.brands, p.quantity].filter(Boolean).join(' · '),
    sourceName: 'Open Food Facts',
    pageUrl: `https://world.openfoodfacts.org/product/${p.code}`,
    barcode: p.code,
  };
}

export async function searchOpenFoodFacts(query: string, signal?: AbortSignal): Promise<ImageCandidate[]> {
  const params = new URLSearchParams({
    search_terms: query,
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: '24',
    fields: OFF_FIELDS,
  });
  const res = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?${params}`, { signal });
  if (!res.ok) throw new Error(`Open Food Facts returned ${res.status}`);
  const data: { products?: OffProduct[] } = await res.json();
  return (data.products ?? []).map(offToCandidate).filter((c): c is ImageCandidate => c !== null);
}

/** Barcode lookup, used by the in-store scanner and the add form. */
export async function lookupBarcode(code: string, signal?: AbortSignal): Promise<{ title: string; brand: string; candidate: ImageCandidate | null } | null> {
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`, { signal });
  if (!res.ok) return null;
  const data: { status?: number; product?: OffProduct } = await res.json();
  if (!data.product || data.status === 0) return null;
  const p = { ...data.product, code: data.product.code ?? code };
  return { title: p.product_name?.trim() ?? '', brand: p.brands?.split(',')[0]?.trim() ?? '', candidate: offToCandidate(p) };
}

interface CommonsPage {
  pageid: number;
  title: string;
  imageinfo?: { url: string; thumburl?: string; descriptionurl: string; mime?: string }[];
}

export async function searchWikimediaCommons(query: string, signal?: AbortSignal): Promise<ImageCandidate[]> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'search',
    gsrnamespace: '6',
    gsrsearch: `${query} bottle filetype:bitmap`,
    gsrlimit: '24',
    prop: 'imageinfo',
    iiprop: 'url|mime',
    iiurlwidth: '800',
  });
  const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { signal });
  if (!res.ok) throw new Error(`Wikimedia Commons returned ${res.status}`);
  const data: { query?: { pages?: Record<string, CommonsPage & { index?: number }> } } = await res.json();
  const pages = Object.values(data.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return pages.flatMap((p) => {
    const info = p.imageinfo?.[0];
    if (!info || (info.mime && !info.mime.startsWith('image/'))) return [];
    return [
      {
        id: `commons-${p.pageid}`,
        url: info.thumburl ?? info.url,
        thumbUrl: info.thumburl ?? info.url,
        title: p.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, '').replace(/_/g, ' '),
        subtitle: 'Wikimedia Commons',
        sourceName: 'Wikimedia Commons',
        pageUrl: info.descriptionurl,
      },
    ];
  });
}

export function webImageSearchUrl(query: string): string {
  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${query} wine bottle`)}`;
}
