import type { Rating, Wine, WineDraft } from '../types';
import { findAppellation } from './appellations';
import { tokens } from './text';

/**
 * The same bottle saved twice (e.g. "Domaine de la Bressande · En Sazenay" added by hand, and
 * "Mercurey Premier Cru En Sazenay" from a history import) is combined automatically. Only clear
 * cases count: same vintage, same producer, and one name inside the other or the same photo.
 */

const words = (s: string) => new Set(tokens(s));

/** Words that say where or how good, not which wine: "Mercurey Premier Cru En Sazenay" is still En Sazenay. */
const GENERIC = new Set(
  'premier 1er grand cru crus classe village villages reserva gran riserva crianza classico superiore rouge blanc tinto red white aoc aop doc docg do igt vin wine de du des la le les di del'.split(' '),
);
const subset = (a: Set<string>, b: Set<string>) => [...a].every((t) => b.has(t));

const photoKey = (w: Wine) => (w.photo?.kind === 'remote' ? w.photo.url : w.photo?.kind === 'local' ? w.photo.blobId : '');
const sameShelf = (a: Wine, b: Wine) => (a.list ?? null) === (b.list ?? null);
const sameVintage = (a: Wine, b: Wine) => a.vintage === b.vintage;

/** Same producer: equal after normalising, or one is the other plus a word ("Bressande" / "Domaine de la Bressande"). */
function sameProducer(a: Wine, b: Wine): boolean {
  const pa = words(a.producer);
  const pb = words(b.producer);
  if (!pa.size || !pb.size) return false;
  return subset(pa, pb) || subset(pb, pa);
}

/**
 * One wine's name is inside the other's, and the extra words only name the appellation or a
 * quality level. "Barolo" and "Barolo Marcenasco" stay apart: Marcenasco is a different wine.
 */
function nameInside(a: Wine, b: Wine): boolean {
  const strip = (w: Wine) => {
    const p = words(w.producer);
    return new Set([...words(w.name)].filter((t) => !p.has(t)));
  };
  const na = strip(a);
  const nb = strip(b);
  if (!na.size || !nb.size) return false;
  const [short, long, longWine] = na.size <= nb.size ? [na, nb, b] : [nb, na, a];
  if (!subset(short, long)) return false;
  const app = findAppellation(`${longWine.name} ${longWine.region}`);
  const place = new Set(app ? [app.name, ...(app.aliases ?? [])].flatMap((n) => tokens(n)) : []);
  return [...long].every((t) => short.has(t) || place.has(t) || GENERIC.has(t));
}

export function isSameBottle(a: Wine, b: Wine): boolean {
  if (a.id === b.id || !sameShelf(a, b) || !sameVintage(a, b) || !sameProducer(a, b)) return false;
  if (nameInside(a, b)) return true;
  const pa = photoKey(a);
  return Boolean(pa) && pa === photoKey(b);
}

const RATING_ORDER: (Rating | null)[] = [null, 'wouldnt', 'liked', 'loved'];

/** How much you've put into a record: the one to keep. */
function weight(w: Wine): number {
  return (w.rating ? 4 : 0) + (w.notes.trim() ? 3 : 0) + (w.tastedOn ? 1 : 0) + (w.take ? 1 : 0) + (w.photo ? 1 : 0) + Math.min(w.owned, 1);
}

/** The longer, more detailed of two texts ("Mercurey Premier Cru En Sazenay" over "En Sazenay"). */
const fuller = (a: string, b: string) => (words(b).size > words(a).size ? b : a);

/** One record from two: everything you entered is kept. */
export function combine(keep: Wine, drop: Wine): Partial<WineDraft> {
  const notes = [keep.notes.trim(), drop.notes.trim()].filter(Boolean);
  const rating =
    keep.rating && drop.rating && keep.rating !== drop.rating
      ? RATING_ORDER[Math.max(RATING_ORDER.indexOf(keep.rating), RATING_ORDER.indexOf(drop.rating))]
      : (keep.rating ?? drop.rating);
  const tasted = [keep.tastedOn, drop.tastedOn].filter((d): d is string => Boolean(d)).sort();
  return {
    producer: fuller(keep.producer, drop.producer),
    name: fuller(keep.name, drop.name),
    region: keep.region || drop.region,
    country: keep.country || drop.country,
    grapes: keep.grapes.length ? keep.grapes : drop.grapes,
    style: keep.style ?? drop.style,
    price: keep.price ?? drop.price,
    store: keep.store || drop.store,
    rating,
    // Two records of one bottle are usually the same bottle twice, not two bottles.
    owned: Math.max(keep.owned, drop.owned),
    notes: [...new Set(notes)].join('\n\n'),
    tastedOn: tasted.length ? tasted[tasted.length - 1] : null,
    barcode: keep.barcode || drop.barcode,
    photo: keep.photo ?? drop.photo,
    take: keep.take ?? drop.take,
    lesson: keep.lesson ?? drop.lesson,
    suggestion: keep.suggestion ?? drop.suggestion,
    watchOff: Boolean(keep.watchOff && drop.watchOff),
    priceHistory: [...(keep.priceHistory ?? []), ...(drop.priceHistory ?? [])].sort((x, y) => x.date.localeCompare(y.date)),
  };
}

/** Pairs to combine, each wine in at most one pair: [the one to keep, the one to fold into it]. */
export function findDuplicates(wines: Wine[]): [Wine, Wine][] {
  const used = new Set<string>();
  const out: [Wine, Wine][] = [];
  const sorted = [...wines].sort((a, b) => weight(b) - weight(a) || a.createdAt - b.createdAt);
  for (const a of sorted) {
    if (used.has(a.id)) continue;
    for (const b of sorted) {
      if (used.has(b.id) || !isSameBottle(a, b)) continue;
      out.push([a, b]);
      used.add(a.id);
      used.add(b.id);
      break;
    }
  }
  return out;
}
