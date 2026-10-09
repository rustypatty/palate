/**
 * Palate's take, laid out: tasting tags pulled from "How it tastes", and the serving facts
 * (temperature, decanting, drink window) pulled from "Serve it". Both only when they come out
 * cleanly; otherwise the text is shown as written.
 */

// Pairs like "red and black cherry" or "sour and black cherry" are one note.
const PAIRED = 'red|black|white|yellow|green|dark|pink|blue|sour|sweet|fresh|dried';
// Words that mean an item is a description, not a tasting note.
const NOT_A_NOTE = /\b(is|are|it|its|this|that|all|expect|body|bodied|tannins?|acidity|finish|set|carried|gives|makes|wine|vintage|years?)\b|\d/i;
const MAX_WORDS = 4;
const isNote = (p: string) => Boolean(p) && p.split(/\s+/).filter((w) => w !== '&').length <= MAX_WORDS && !NOT_A_NOTE.test(p);
const LEADING = /^(?:(?:and|with|of|some|a|an|the|plus|hints? of|touch(?:es)? of|(?:\w+\s+)?notes? of|aromas? of|flavou?rs? of|a little|little|lots of)\s+)+/i;
const TRAILING = /\s+(?:note|notes|fruit|fruits|tones?|character|edge|touch|nuance)$/i;

function cleanItem(raw: string): string {
  let s = raw
    .replace(/\([^)]*\)/g, ' ') // "garrigue (dried herbs)"
    .replace(/\s+(?:from|as|in|on|that|which|when|for)\s+.*$/i, '') // "spice from long oak ageing"
    .replace(/[.;:!?"“”]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  s = s.replace(LEADING, '').replace(TRAILING, '').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : '';
}

/**
 * The list at the start of a sentence like "Ripe red and black cherry, dried plum and vanilla,
 * with leather and tobacco, with a warm, round body…": the notes, and whatever follows them.
 */
function itemsOf(sentence: string): { notes: string[]; tail: string } | null {
  const body = sentence
    .replace(/^expect\s+(?:the\s+[\w\s-]+?profile:\s*)?/i, '')
    .replace(/^(?:aromas?|flavou?rs?|notes?)\s+of\s+/i, '')
    .replace(new RegExp(`\\b(${PAIRED})\\s+and\\s+(${PAIRED})\\b`, 'gi'), '$1 & $2');
  // Split on commas, "and", "with", keeping where each piece starts so the tail can be kept as text.
  const pieces: { raw: string; at: number }[] = [];
  const re = /,\s*|\s+and\s+|\s+with\s+/gi;
  let last = 0;
  for (let m = re.exec(body); ; m = re.exec(body)) {
    const end = m ? m.index : body.length;
    pieces.push({ raw: body.slice(last, end), at: last });
    if (!m) break;
    last = m.index + m[0].length;
  }
  const notes: { note: string; at: number; words: number }[] = [];
  let cut = body.length;
  for (const p of pieces) {
    const note = cleanItem(p.raw);
    if (!note) continue;
    if (!isNote(note)) {
      cut = p.at;
      // "…pepper, with a warm, round body": a lone word just before the prose describes it, not the glass.
      const prev = notes[notes.length - 1];
      const newClause = /^(?:carried|set|all|with|and|it|its|this|that|which|while|but)\b/i.test(p.raw.trim());
      if (prev && prev.words === 1 && !newClause && /,\s*$/.test(body.slice(prev.at, p.at))) cut = notes.pop()!.at;
      break;
    }
    notes.push({ note, at: p.at, words: note.split(/\s+/).length });
  }
  if (notes.length < 4) return null;
  // "with a warm, round body…", "carried by firm tannins…", "all on a full body" → "Warm, round body…"
  const tail = body
    .slice(cut)
    .replace(/^(?:(?:with|and|all|set|carried)\s+)?(?:(?:on|by)\s+)?(?:(?:a|an|the)\s+)?/i, '')
    .trim();
  return { notes: [...new Set(notes.map((n) => n.note))], tail: tail ? `${tail[0].toUpperCase()}${tail.slice(1)}.` : '' };
}

const sentences = (text: string) => text.match(/[^.;!?]+(?:[.;!?]+|$)/g)?.map((s) => s.trim()).filter(Boolean) ?? [];

/** 4–6 tasting tags and the text left over, or no tags when they can't be pulled out reliably. */
export function tasteTags(text: string): { tags: string[]; rest: string } {
  const all = sentences(text);
  // The list is in the first sentence, or the second after an opening like "This is a modern Rioja."
  for (const i of [0, 1]) {
    if (!all[i]) break;
    const found = itemsOf(all[i].replace(/[.;!?]+$/, ''));
    if (found) {
      const rest = [...all.slice(0, i), found.tail, ...all.slice(i + 1)].filter(Boolean).join(' ').replace(/;\s*$/, '.').trim();
      return { tags: found.notes.slice(0, 6), rest: rest ? rest[0].toUpperCase() + rest.slice(1) : '' };
    }
  }
  return { tags: [], rest: text.trim() };
}

export interface ServeTile {
  value: string;
  label: string;
}

const dash = (s: string) => s.replace(/\s*[-–]\s*/, '–');

function temperature(t: string): ServeTile | null {
  const m = t.match(/(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?\s*°\s*([CF])?/i);
  if (!m) return null;
  const value = `${m[2] ? `${m[1]}–${m[2]}` : m[1]}°`;
  return { value, label: m[3]?.toUpperCase() === 'F' ? 'Fahrenheit' : 'Celsius' };
}

function decanting(t: string): ServeTile | null {
  if (/\bno (?:need to decant|decant(?:ing)?(?: needed)?)\b|\bdoesn[’']t need (?:decanting|to be decanted)/i.test(t)) return { value: 'None', label: 'Decant' };
  const m =
    t.match(/decant\w*[^.;]*?(\d+)(?:\s*[-–]\s*(\d+))?\s*(minutes?|mins?|hours?|hrs?)/i) ??
    t.match(/(\d+)(?:\s*[-–]\s*(\d+))?[\s-]*(minutes?|mins?|hours?|hrs?)\s+decant/i);
  if (m) {
    const n = m[2] ? `${m[1]}–${m[2]}` : m[1];
    return { value: /^h/i.test(m[3]) ? `${n} h` : `${n}′`, label: 'Decant' };
  }
  if (/decant\w*[^.;]*\ban hour\b/i.test(t)) return { value: '1 h', label: 'Decant' };
  if (/\bshort decant\b/i.test(t)) return { value: 'Short', label: 'Decant' };
  return null;
}

function drinkWindow(t: string): ServeTile | null {
  const range = t.match(/\b(20\d\d)\s*(?:[-–]|to)\s*(?:about\s+)?(20\d\d)\b/);
  if (range) return { value: `${range[1]}–${range[2].slice(2)}`, label: 'Drink window' };
  const until = t.match(/\b(?:now|today)\b[^.;]*?\b(?:to|until|through|till|by)\s+(?:about\s+|roughly\s+|around\s+)?(20\d\d)\b/i) ?? t.match(/\b(?:through|until|till)\s+(?:about\s+|roughly\s+|around\s+)?(20\d\d)\b/i);
  if (until) return { value: `→ ${until[1]}`, label: 'Drink window' };
  const years = t.match(/\b(?:within|for)\s+(?:about\s+|around\s+|the next\s+)*(\d{1,2}(?:\s*[-–]\s*\d{1,2})?)\s+years?\b/i);
  if (years) return { value: `${dash(years[1])} yrs`, label: 'Drink window' };
  if (/\b(?:ready now|drink (?:it )?now)\b/i.test(t)) return { value: 'Now', label: 'Drink window' };
  return null;
}

/** "Pair with braised short ribs, lamb tagine or a herb-crusted roast" from the serving text. */
function pairings(t: string): string {
  for (const s of sentences(t)) {
    const m = s.match(/\b(?:pair(?:s|ed)?(?: it)? with|suits|good with|great with|lovely with|perfect with|excellent with|classic with|try (?:it )?with|with)\s+(.+)/i);
    if (!m || /\b(?:decant|serve|°|years?|drink)\b/i.test(m[1].split(/,?\s+(?:and )?(?:will|should|is|it)\b/i)[0])) continue;
    const foods = m[1].split(/,?\s+(?:and\s+)?(?:will|should|is|it|but)\b/i)[0].replace(/[.;!]+$/, '').trim();
    if (foods) return `With ${foods}`;
  }
  return '';
}

/** Up to three serving tiles and the pairings line, or nothing when fewer than two facts come out. */
export function serveFacts(text: string): { tiles: ServeTile[]; pairing: string } | null {
  const tiles = [temperature(text), decanting(text), drinkWindow(text)].filter((x): x is ServeTile => x !== null);
  return tiles.length >= 2 ? { tiles, pairing: pairings(text) } : null;
}
