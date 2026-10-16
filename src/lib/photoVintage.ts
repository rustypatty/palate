/**
 * Is a bottle photo of the right vintage and bottle size? Shops list every year of a wine and every
 * size (750 ml, 1.5 L magnum) under one name, so the photo's own listing is the only clue: its title,
 * its file name and the page it came from ("…/1993-tenuta-san-guido-sassicaia-1-5l").
 */

interface Listed {
  title?: string;
  /** The image's address, possibly through the image relay. */
  url?: string;
  /** The shop page it came from. */
  pageUrl?: string;
}

const YEAR = /(?<!\d)(19[5-9]\d|20[0-4]\d)(?!\d)/;
// 1.5 L, 3 L, 6 L, 375 ml, magnum, half bottle: not a standard bottle.
const OTHER_SIZE = /(?<!\d)1[.\-_]5\s*l(?![a-z])|(?<![a-z0-9.])[36]\s*l(?![a-z0-9])|375\s*ml|magnum|jeroboam|half[\s\-_]?bottle/i;

/** The image's own address, from an image-relay link. */
export function originalImage(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname === 'images.weserv.nl' ? (u.searchParams.get('url') ?? url) : url;
  } catch {
    return url;
  }
}

/** The last part of an address, without its query: "1993TenutaSanGuidoSassicaia1.5L.png". Not the folders: their ids can look like years. */
function lastPart(address: string | undefined): string {
  if (!address) return '';
  try {
    return decodeURIComponent(new URL(originalImage(address), 'https://x.invalid').pathname.split('/').filter(Boolean).pop() ?? '');
  } catch {
    return '';
  }
}

const clues = (p: Listed) => [p.title ?? '', lastPart(p.url), lastPart(p.pageUrl)];

/** The vintage a photo is listed as, if its title, file name or page shows one. */
export function photoYear(p: Listed): number | null {
  for (const text of clues(p)) {
    const m = YEAR.exec(text);
    if (m) return Number(m[1]);
  }
  return null;
}

/** Listed as a magnum, half bottle or other non-standard size. */
export const otherSize = (p: Listed): boolean => clues(p).some((t) => OTHER_SIZE.test(t));

/** A photo that shows a different year from the wine's. */
export const wrongVintage = (p: Listed, vintage: number | 'NV' | null | undefined): boolean => {
  const y = photoYear(p);
  return typeof vintage === 'number' && y !== null && y !== vintage;
};

/** Not a photo of this bottle: another year, or a magnum. Worth using only if nothing better turns up. */
export const unsuitable = (p: Listed, vintage: number | 'NV' | null | undefined): boolean => wrongVintage(p, vintage) || otherSize(p);

/** The right vintage first, then photos that don't say, then other years and sizes; otherwise in the order given. */
export function preferVintage<T extends Listed>(photos: T[], vintage: number | 'NV' | null | undefined): T[] {
  const rank = (p: T) => (unsuitable(p, vintage) ? 2 : typeof vintage === 'number' && photoYear(p) === vintage ? 0 : 1);
  return photos.map((p, i) => ({ p, i })).sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i).map((x) => x.p);
}
