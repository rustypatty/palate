import type { Wine, WineStyle } from '../types';
import { factsFromText } from './appellations';
import { isSameWine, mentioned, wineFacts, WEIGHT, type Advice, type makeAdvisor, type Signal } from './insights';
import { fold, tokens } from './text';

type Advisor = ReturnType<typeof makeAdvisor>;

function countsShort(s: Signal): string {
  const c = s.counts;
  return [c.loved && `${c.loved} loved`, c.liked && `${c.liked} liked`, c.wouldnt && `${c.wouldnt} wouldn’t buy again`].filter(Boolean).join(', ');
}

/** One honest line on why a bottle suits you, from the same evidence as the verdict. */
export function reasonFor(advice: Advice): string {
  const rated = advice.exact.find((w) => w.rating);
  if (rated?.rating === 'loved') return 'You loved this one';
  if (rated?.rating === 'liked') return 'You liked this one';
  if (rated?.rating === 'wouldnt') return 'You said you wouldn’t buy it again';
  // A grape only implied by the appellation says less than the place itself.
  const weight = (s: Signal) => WEIGHT[s.kind] * (s.inferred ? 0.45 : 1) * Math.min(s.counts.loved + s.counts.liked, 3);
  const good = advice.signals.filter((s) => s.kind !== 'country' && s.kind !== 'style' && (s.score ?? 0) > 0).sort((a, b) => weight(b) - weight(a));
  const parts: string[] = [];
  const covered = new Set<Wine>();
  for (const s of good) {
    if (parts.length >= 2) break;
    if (s.wines.every((w) => covered.has(w))) continue; // says nothing new
    s.wines.forEach((w) => covered.add(w));
    const label = s.kind === 'producer' ? `From ${s.value}` : s.inferred ? `Usually ${s.value}` : s.value;
    parts.push(`${label} — you’ve ${countsShort(s)}`);
  }
  return parts.join(' · ') || advice.verdict.detail;
}

// ---------- Rows from your own collection ----------

/** Loved, none at home: worth buying again. */
export function buyAgain(collection: Wine[]): Wine[] {
  return collection.filter((w) => w.rating === 'loved' && w.owned === 0).sort((a, b) => b.updatedAt - a.updatedAt);
}

const SIX_MONTHS = 182 * 24 * 3600 * 1000;

/** Bottles at home you haven't tasted (or added) in six months or more, oldest first. */
export function fromCellar(collection: Wine[], now = Date.now()): Wine[] {
  const last = (w: Wine) => (w.tastedOn ? Date.parse(w.tastedOn) : w.createdAt);
  return collection.filter((w) => w.owned > 0 && now - last(w) >= SIX_MONTHS).sort((a, b) => last(a) - last(b));
}

/** How alike two wines are, using the verdict's weights: same producer counts most. */
export function similarity(a: Wine, b: Wine): number {
  const fa = wineFacts(a);
  const fb = wineFacts(b);
  const same = (x: string, y: string) => Boolean(x && y && fold(x) === fold(y));
  let s = 0;
  if (same(a.producer.replace(/\([^)]*\)/g, ''), b.producer.replace(/\([^)]*\)/g, ''))) s += WEIGHT.producer;
  const shared = fa.grapes.filter((g) => fb.grapes.some((h) => same(g, h))).length;
  s += Math.min(shared, 2) * (WEIGHT.grape / 2);
  if (same(a.region, b.region)) s += WEIGHT.region;
  else if (same(fa.area, fb.area)) s += WEIGHT.area;
  if (same(fa.country, fb.country)) s += WEIGHT.country;
  if (a.style && a.style === b.style) s += WEIGHT.style;
  else if (a.style && b.style) s -= 2; // a white is rarely "like" a red
  if (a.price !== null && b.price !== null && Math.abs(a.price - b.price) <= Math.max(a.price, b.price) * 0.35) s += 0.5;
  return s;
}

/** Your wines most like this one (needs more in common than just a country). */
export function moreLikeThis(target: Wine, pool: Wine[], n = 8): Wine[] {
  return pool
    .filter((w) => w.id !== target.id)
    .map((w) => ({ w, s: similarity(target, w) }))
    .filter((x) => x.s >= 2)
    .sort((a, b) => b.s - a.s || (b.w.rating === 'loved' ? 1 : 0) - (a.w.rating === 'loved' ? 1 : 0))
    .slice(0, n)
    .map((x) => x.w);
}

// ---------- Ranking bottles from a store ----------

export interface Candidate {
  key: string;
  /** Full name as the store lists it, e.g. "Failla Pinot Noir Sonoma Coast 2023". */
  title: string;
  style: WineStyle | null;
  price: number | null;
  /** Extra words that help matching but aren't part of the name, e.g. the country. */
  context?: string;
}

export interface Pick<C extends Candidate = Candidate> {
  item: C;
  advice: Advice;
  rank: number;
  reason: string;
  /** Groups picks so one appellation doesn't fill the whole list. */
  family: string;
}

export interface RankOptions {
  /** Wines marked "Not for me". */
  passed?: Wine[];
  /** Highest price to show. */
  budget?: number | null;
  /** Your usual price range, a small bonus. */
  usual?: { low: number; high: number } | null;
}

export function scoreCandidate<C extends Candidate>(advisor: Advisor, item: C, opts: RankOptions = {}): Pick<C> | null {
  const q = tokens(item.title);
  if (opts.passed?.some((w) => w.suggestion?.key === item.key || isSameWine(w, q, false))) return null;
  const advice = advisor.advise({ query: `${item.title} ${item.context ?? ''}`, style: item.style, price: item.price, partial: false });
  const { verdict } = advice;
  const rated = advice.exact.find((w) => w.rating);
  let rank: number;
  if (rated) {
    if (rated.rating === 'wouldnt') return null;
    rank = rated.rating === 'loved' ? 2 : 1.4;
  } else {
    if (verdict.score === null || verdict.level === 'skip' || verdict.score < 0.25) return null;
    // Style or country alone isn't a reason to recommend a bottle.
    if (!advice.signals.some((s) => s.kind !== 'style' && s.kind !== 'country' && (s.score ?? 0) > 0)) return null;
    rank = verdict.score * (0.4 + (0.6 * Math.min(verdict.weight, 4)) / 4);
  }
  if (opts.usual && item.price !== null && item.price >= opts.usual.low && item.price <= opts.usual.high) rank += 0.05;
  // A mild nudge away from producers you've said "Not for me" to.
  if (opts.passed?.some((w) => w.producer && mentioned(w.producer, q, false))) rank -= 0.2;
  const family = fold(advice.signals.find((s) => s.kind === 'region' || s.kind === 'area')?.value ?? advice.signals[0]?.value ?? item.key);
  return { item, advice, rank, reason: reasonFor(advice), family };
}

/** The best matches, at most `perFamily` from any one region so the list stays varied. */
export function rankCandidates<C extends Candidate>(advisor: Advisor, items: C[], opts: RankOptions = {}, n = 12, perFamily = 3): Pick<C>[] {
  const budget = opts.budget ?? null;
  const scored = items
    .filter((c) => budget === null || (c.price !== null && c.price <= budget))
    .map((c) => scoreCandidate(advisor, c, opts))
    .filter((p): p is Pick<C> => p !== null)
    .sort((a, b) => b.rank - a.rank);
  const out: Pick<C>[] = [];
  const perFam = new Map<string, number>();
  for (const p of scored) {
    if (out.length >= n) break;
    const k = perFam.get(p.family) ?? 0;
    if (k >= perFamily) continue;
    perFam.set(p.family, k + 1);
    out.push(p);
  }
  return out;
}

/**
 * Claude's picks for a store, checked against your history: anything you'd skip or said
 * "Not for me" to is dropped; Claude's one-liner is the reason, your own evidence when it has none.
 */
export function explainSuggestions<C extends Candidate & { claudeReason: string }>(advisor: Advisor, items: C[], opts: RankOptions = {}): Pick<C>[] {
  const out: Pick<C>[] = [];
  for (const item of items) {
    if (opts.passed?.some((w) => w.suggestion?.key === item.key)) continue;
    const scored = scoreCandidate(advisor, item, opts);
    if (scored) {
      // Claude's sentence names the wine it's like; your own evidence still sets the order.
      out.push({ ...scored, reason: item.claudeReason || scored.reason });
      continue;
    }
    const advice = advisor.advise({ query: `${item.title} ${item.context ?? ''}`, style: item.style, price: item.price, partial: false });
    if (advice.exact.some((w) => w.rating === 'wouldnt') || advice.verdict.level === 'skip') continue;
    out.push({ item, advice, rank: 0.3, reason: item.claudeReason, family: item.key });
  }
  return out.sort((a, b) => b.rank - a.rank);
}

/** A store listing seen as a wine, for comparing with one of yours. */
export function itemAsWine(item: Candidate & { country?: string }): Wine {
  const f = factsFromText(`${item.title} ${item.context ?? ''}`);
  return {
    id: item.key, producer: '', name: item.title, vintage: null, country: item.country || f.country,
    region: f.appellation?.name ?? '', grapes: f.grapes, style: item.style, price: item.price, store: '', rating: null,
    owned: 0, notes: '', tastedOn: null, barcode: '', photo: null, createdAt: 0, updatedAt: 0,
  };
}

/** Why a store bottle is "like" this wine, in a few words. */
export function likeReason(target: Wine, item: Candidate & { country?: string }): string {
  if (isSameWine(target, tokens(item.title), false)) return 'This wine';
  const a = wineFacts(target);
  const other = itemAsWine(item);
  const b = wineFacts(other);
  const same = (x: string, y: string) => Boolean(x && y && fold(x) === fold(y));
  const parts: string[] = [];
  if (target.producer && mentioned(target.producer, tokens(item.title), false)) parts.push('Same producer');
  if (same(target.region, other.region)) parts.push(`Also ${other.region}`);
  else if (same(a.area, b.area)) parts.push(`Also ${b.area}`);
  const grape = b.grapes.find((g) => a.grapes.some((h) => same(g, h)));
  if (grape && parts.length < 2) {
    const named = factsFromText(`${item.title} ${item.context ?? ''}`).namedGrapes.length > 0;
    parts.push(named ? `${grape} too` : `Usually ${grape}`);
  }
  return parts.slice(0, 2).join(' · ') || 'Similar style';
}

export interface LikeThis<C> {
  storeId: string;
  item: C;
  reason: string;
}

/**
 * Bottles at your stores most like this wine: the wine itself first if a store has it,
 * then the closest matches. Leaves out anything your ratings say you'd skip and
 * anything marked "Not for me".
 */
export function bottlesLikeThis<C extends Candidate & { country?: string }>(
  target: Wine,
  entries: { storeId: string; item: C }[],
  advisor: Advisor,
  passed: Wine[] = [],
  n = 10,
  budget: number | null = null,
): LikeThis<C>[] {
  const scored: { e: { storeId: string; item: C }; s: number }[] = [];
  for (const e of entries) {
    const { item } = e;
    if (passed.some((w) => w.suggestion?.key === item.key)) continue;
    if (budget !== null && (item.price === null || item.price > budget)) continue;
    let s = similarity(target, itemAsWine(item));
    const isIt = isSameWine(target, tokens(item.title), false);
    if (isIt) s += 10;
    if (s < 3) continue;
    const advice = advisor.advise({ query: `${item.title} ${item.context ?? ''}`, style: item.style, price: item.price, partial: false });
    if (!isIt && (advice.verdict.level === 'skip' || advice.exact.some((w) => w.rating === 'wouldnt'))) continue;
    // Among equally similar bottles, the ones your history favours come first.
    scored.push({ e, s: Math.round((s + (advice.verdict.score ?? 0) * 0.5) * 4) / 4 });
  }
  // Equally close bottles: nearest this wine's price, or cheapest first when it has none.
  const ref = target.price;
  const cost = (c: C) => (c.price === null ? Infinity : ref !== null ? Math.abs(c.price - ref) : c.price);
  const seen = new Set<string>();
  const perRegion = new Map<string, number>();
  return scored
    .sort((a, b) => b.s - a.s || cost(a.e.item) - cost(b.e.item))
    .filter(({ e }) => {
      const k = fold(e.item.title);
      if (seen.has(k)) return false;
      seen.add(k);
      // Leave room for neighbours (Gigondas next to Châteauneuf): at most 6 per appellation.
      const r = fold(itemAsWine(e.item).region) || k;
      const c = perRegion.get(r) ?? 0;
      if (c >= 6) return false;
      perRegion.set(r, c + 1);
      return true;
    })
    .slice(0, n)
    .map(({ e }) => ({ storeId: e.storeId, item: e.item, reason: likeReason(target, e.item) }));
}
