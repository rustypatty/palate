/**
 * Name normalization for the wine catalog: a line-for-line port of the catalog's own
 * normalize_reference.py (docs/catalog/), so a label read here produces exactly the keys the
 * catalog was built with. Checked against the catalog's 100 test vectors in catalogNorm.test.ts.
 */

const COMBINING = /\p{M}/gu;

function stripAccents(s: string): string {
  return s.normalize('NFKD').replace(COMBINING, '');
}

const GR: Record<string, string> = {
  α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p',
  ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o',
};
const GR_DI: [string, string][] = [['ου', 'ou'], ['αι', 'ai'], ['ει', 'ei'], ['οι', 'oi'], ['μπ', 'b'], ['ντ', 'nt'], ['γκ', 'gk'], ['αυ', 'av'], ['ευ', 'ev']];
const LIG: Record<string, string> = { ø: 'o', æ: 'ae', œ: 'oe', ß: 'ss', ł: 'l', đ: 'd', þ: 'th', ı: 'i' };

/** Lowercase, Greek to Latin, common ligatures expanded. */
export function translit(input: string): string {
  let s = stripAccents(input).toLowerCase();
  if (/[α-ω]/.test(s)) {
    for (const [a, b] of GR_DI) s = s.split(a).join(b);
    s = Array.from(s, (ch) => GR[ch] ?? ch).join('');
  }
  return Array.from(s, (ch) => LIG[ch] ?? ch).join('');
}

/** Label or OCR text as the catalog's aliases are stored: lowercase words, no accents or punctuation. */
export function norm(input: string | null | undefined): string {
  if (!input) return '';
  let s = translit(input).replace(/&/g, ' and ');
  s = s.replace(/[’'`´"“”‘]/g, '');
  s = s.replace(/[^\p{L}\p{N}]+|_+/gu, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

const words = (s: string) => new Set(s.split(/\s+/).filter(Boolean));

export const PRODUCER_STOP = words(`ktima ktema oinopoieio oinopoiia domaine domaines dom chateau ch château bodega bodegas weingut tenuta tenute cantina cantine azienda agricola
az agr societa soc agricola vignerons vigneron maison clos estate estates winery wines wine vineyards vineyard cellars cellar
the quinta herdade fattoria podere poderi celler cellers cave caves caves sa srl s r l spa ltd inc llc ag gmbh co cie et fils fille filles
freres family famille de du des la le les di del della dei degli y e and`);

// Python's sorted() on str: by code point. JS default sort compares UTF-16 units; equal for these.
const sortStrings = (a: string[]) => [...a].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));

/** Order-insensitive producer key ('Clape, Auguste' == 'Auguste Clape'), legal-form words dropped. */
export function producerKey(name: string): string {
  const all = norm(name).split(' ').filter(Boolean);
  let toks = all.filter((t) => !PRODUCER_STOP.has(t));
  if (!toks.length) toks = all;
  return sortStrings(toks).join(' ');
}

const LEGAL_PAREN = /^\s*(.+?)\s*\(\s*(Κτήμα|Κτημα|Οινοποιείο|Οινοποιεία|Αμπελώνες|Domaine|Château|Chateau|Weingut|Bodegas?|Tenuta|Cantina|Quinta|Herdade|Maison)\s*\)\s*$/u;
const GIVEN = /^(?:[A-Z][a-zà-ÿ'’-]+|[A-Z]\.(?:\s?[A-Z]\.)*)(?:\s(?:[A-Z][a-zà-ÿ'’-]+|[A-Z]\.))?$/u;
const KEEP_UPPER = new Set(['DOC', 'DOCG', 'AOC', 'IGT', 'USA', 'NV', 'SA', 'LLC', 'II', 'III', 'IV', 'JJ', 'GD']);
const COMPANY = /(?:^|[^\p{L}\p{N}_])(domaine|chateau|château|famille|family|estate|winery|cellars|bodega|tenuta|weingut|et fils|frères|freres|père|pere)(?![\p{L}\p{N}_])/iu;

function isUpper(s: string): boolean {
  return s === s.toUpperCase() && s !== s.toLowerCase();
}

/** Python str.capitalize(): first character upper, the rest lower. */
const capitalize = (w: string) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w);

/** 'Clape, Auguste' → 'Auguste Clape'; 'Ramonet (Domaine)' → 'Domaine Ramonet'. */
export function displayProducer(input: string | null | undefined): string {
  let name = input ?? '';
  const mp = LEGAL_PAREN.exec(name);
  if (mp) name = `${mp[2]} ${mp[1]}`;
  name = name.replace(/_/g, ' ');
  if (isUpper(name) && name.length > 4) {
    name = name
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => (KEEP_UPPER.has(w) ? w : capitalize(w)))
      .join(' ');
    name = name.replace(/(?<![\p{L}\p{N}_])(De|Du|Di|Del|La|Le|Les|Dos|Das|Do|Da|Y|E)(?![\p{L}\p{N}_])/gu, (m) => m.toLowerCase());
  }
  const m = /^\s*([^,\-–]+?)\s*(?:,|\s[-–]\s)\s*([^,]+?)\s*$/u.exec(name);
  if (m && m[1].split(/\s+/).filter(Boolean).length <= 2 && GIVEN.test(m[2]) && !COMPANY.test(m[2])) {
    return `${m[2]} ${m[1]}`.replace(/\s+/g, ' ');
  }
  return name.replace(/\s+/g, ' ').trim();
}

export const CUVEE_STOP = words(
  'de du des la le les di del della dei da do dos das y e and the of en vin vino wine red white rouge blanc tinto blanco bianco rosso erythros erythro lefkos lefko roze krasi oinos',
);
export const CUVEE_DROP = words(`igt doc docg aoc aop dop igp vdf vqa ava do doca dc qba vdt vino da tavola appellation controlee protegee
denominazione origine controllata garantita denominacion vin de france united states usa france italy italia spain espana portugal greece
germany austria australia argentina chile new zealand south africa
loire burgundy bourgogne-region piedmont piemonte tuscany toscana sicily sicilia california oregon washington catalonia catalunya galicia styria
steiermark niederosterreich lower jura-region veneto`);
export const CUVEE_SYN: Record<string, string> = {
  premier: '1er', '1st': '1er', saint: 'st', sainte: 'ste', mount: 'mt', monte: 'mt', vieilles: 'vv', vignes: '', old: 'vv',
  vines: '', selezione: 'sel', selection: 'sel', riserva: 'reserva', reserve: 'reserva', gran: 'grand', grande: 'grand',
  cuvee: '', cru: '', '1erc': '1er', vineyard: 'vyd', vineyards: 'vyd', vigna: 'vyd', vigneto: 'vyd', lieu: 'lieu',
};

const W = '[\\p{L}\\p{N}_]';
const NOT_W_BEFORE = `(?<!${W})`;
const NOT_W_AFTER = `(?!${W})`;

/** The cuvée's key: stopwords, designations and broad regions dropped, synonyms mapped, words sorted and deduplicated. */
export function cuveeKey(text: string | null | undefined): string {
  let t = stripAccents(text ?? '').toLowerCase();
  t = t.replace(new RegExp(`(${W})['’]s${NOT_W_AFTER}`, 'gu'), '$1s');
  t = t.replace(new RegExp(`${NOT_W_BEFORE}1er\\s*cru${NOT_W_AFTER}|${NOT_W_BEFORE}premier\\s+cru${NOT_W_AFTER}`, 'gu'), ' 1er ');
  t = t.replace(new RegExp(`${NOT_W_BEFORE}vin de france${NOT_W_AFTER}`, 'gu'), ' ');
  const toks: string[] = [];
  for (const raw of norm(t).split(' ').filter(Boolean)) {
    if (CUVEE_STOP.has(raw) || CUVEE_DROP.has(raw)) continue;
    const tk = raw in CUVEE_SYN ? CUVEE_SYN[raw] : raw;
    if (tk) toks.push(tk);
  }
  return sortStrings([...new Set(toks)]).join(' ');
}

export function matchKey(producer: string, cuvee: string | null | undefined, wineType: string | null | undefined): string {
  return `${producerKey(displayProducer(producer))}|${cuveeKey(cuvee ?? '')}|${wineType || '?'}`;
}
