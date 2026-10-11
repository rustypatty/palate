import type { Rating, Wine } from '../types';
import { findAppellation } from './appellations';
import { currentWindow } from './drinkWindow';
import type { StoreId } from './stores';
import { fold } from './text';

/**
 * "Ask your wines": a chat that answers from your own wines (and general wine knowledge), opened
 * from My wines. Claude gets a compact list of your wines with their ids and answers in a fixed
 * shape; the wine rows under an answer are drawn from your data here, not from Claude's text.
 * Read-only: the chat never changes a wine. The conversation lasts for the session.
 */

export interface AskAnswer {
  /** The answer draws on your list (shows "From your N wines"). */
  fromList: boolean;
  headline: string;
  /** The headline's closing clause, set in italics. */
  italic: string;
  body: string;
  /** Your wines the answer names, in order; unknown ids are dropped. */
  wineIds: string[];
  /** Stores to offer "Find at …" for (recommendations only). */
  stores: StoreId[];
  /** The colour the answer is about, for the store list's filter. */
  colour: 'red' | 'white' | 'any';
}

export interface AskTurn {
  q: string;
  a: AskAnswer | null;
  error?: string;
}

const RATING_WORD: Record<Rating, string> = { loved: 'Loved', liked: 'Liked', wouldnt: "Wouldn't buy again" };

/** Wines the chat knows about: your collection and Want to try (not the ones you passed on). */
export const askable = (wines: Wine[]) => wines.filter((w) => w.list !== 'passed' && (w.producer || w.name));

/** One line per wine, ids first, so answers can point at rows. Same order every time (keeps the prompt cacheable). */
export function wineLines(wines: Wine[]): string {
  return askable(wines)
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    .map((w) => {
      const dw = currentWindow(w);
      const parts = [
        `[${w.id}] ${[w.producer, w.name, w.vintage ?? ''].filter(Boolean).join(' ')}`,
        w.style ?? '',
        [w.region, w.country].filter(Boolean).join(', '),
        w.grapes.join('/'),
        w.price !== null ? `$${w.price}` : '',
        w.list === 'want' ? 'on my Want to try list' : w.rating ? RATING_WORD[w.rating] : 'not rated',
        w.owned > 0 ? `${w.owned} at home` : '',
        w.tastedOn ? `tasted ${w.tastedOn}` : '',
        dw ? `best ${dw.from}–${dw.to}` : '',
        w.notes.trim() ? `notes: "${w.notes.trim().replace(/\s+/g, ' ').slice(0, 160)}"` : '',
      ];
      return parts.filter(Boolean).join(' | ');
    })
    .join('\n');
}

/** Keep only ids that are really your wines, in the answer's order, without repeats. */
export function knownIds(ids: string[], wines: Wine[]): string[] {
  const have = new Set(askable(wines).map((w) => w.id));
  return [...new Set(ids)].filter((id) => have.has(id));
}

const count = <T,>(xs: T[]) => {
  const m = new Map<T, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

/** Example questions from your own wines: your favourite country, a region you keep loving, what's at home. */
export function suggestions(wines: Wine[]): string[] {
  const mine = askable(wines).filter((w) => !w.list);
  const loved = mine.filter((w) => w.rating === 'loved');
  const out: string[] = [];
  const country = count(loved.map((w) => w.country).filter(Boolean))[0];
  out.push(country ? `What did I love from ${country[0]}?` : 'What have I loved most?');
  if (mine.some((w) => w.owned > 0)) out.push('What should I open tonight with steak?');
  const region = count(loved.map((w) => findAppellation(`${w.region} ${w.name}`)?.name ?? w.region).filter(Boolean)).find(([, n]) => n >= 2);
  if (region) out.push(`Why do I keep loving ${region[0]}?`);
  out.push('What should I try next?');
  const big = mine.find((w) => w.owned > 0 && /barolo|barbaresco|brunello|cabernet|hermitage|nebbiolo/.test(fold(`${w.name} ${w.region} ${w.grapes.join(' ')}`)));
  out.push(`How long should I decant ${big ? big.name || big.producer : 'Barolo'}?`);
  return out.slice(0, 5);
}

// --- The conversation, for this session ---

const KEY = 'palate.ask';

export function loadTurns(): AskTurn[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AskTurn[]) : [];
  } catch {
    return [];
  }
}

export function saveTurns(turns: AskTurn[]) {
  try {
    if (turns.length) sessionStorage.setItem(KEY, JSON.stringify(turns));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: the chat just isn't kept across a reload */
  }
}

/** Ask a question. Needs the API key saved in My palate (or on the server). */
export async function askWines(
  question: string,
  turns: AskTurn[],
  wines: Wine[],
  signal?: AbortSignal,
  onPartial?: (a: Partial<AskAnswer>) => void,
): Promise<{ ok: true; answer: AskAnswer } | { ok: false; reason: string }> {
  const { getApiKey } = await import('./labelReader');
  const apiKey = getApiKey();
  if (!apiKey) return { ok: false, reason: 'add your Anthropic API key in My palate first' };
  const [{ askWinesWithClaude }, { profileContext, loadProfile }, { buildTaste }] = await Promise.all([import('./askClient'), import('./profile'), import('./taste')]);
  const list = askable(wines);
  const taste = buildTaste(list.filter((w) => !w.list));
  const about = [profileContext(loadProfile()), taste.summary.length ? `My taste, worked out from my ratings: ${taste.summary.join(' ')}` : ''].filter(Boolean).join('\n\n');
  const out = await askWinesWithClaude(apiKey, { lines: wineLines(wines), count: list.length, about, year: new Date().getFullYear() }, turns, question, signal, onPartial);
  if (!out.ok) return out;
  return { ok: true, answer: { ...out.answer, wineIds: knownIds(out.answer.wineIds, wines) } };
}
