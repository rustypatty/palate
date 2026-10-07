"""Exact normalization used to build wines.match_key (copied verbatim from pipeline/common.py at export time).
match_key = producer_key(display_producer(producer)) + "|" + cuvee_key(cuvee or "") + "|" + (wine_type_at_creation or "?")
Use norm() on OCR/label text before searching wine_aliases.alias / producer_aliases.alias."""
import re, unicodedata

# ---------------- normalization ----------------
def strip_accents(s):
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))

_GR = {"α":"a","β":"v","γ":"g","δ":"d","ε":"e","ζ":"z","η":"i","θ":"th","ι":"i","κ":"k","λ":"l","μ":"m","ν":"n","ξ":"x","ο":"o","π":"p",
       "ρ":"r","σ":"s","ς":"s","τ":"t","υ":"y","φ":"f","χ":"ch","ψ":"ps","ω":"o"}
_GR_DI = [("ου", "ou"), ("αι", "ai"), ("ει", "ei"), ("οι", "oi"), ("μπ", "b"), ("ντ", "nt"), ("γκ", "gk"), ("αυ", "av"), ("ευ", "ev")]
_LIG = {"ø": "o", "æ": "ae", "œ": "oe", "ß": "ss", "ł": "l", "đ": "d", "þ": "th", "ı": "i"}
def translit(s):
    """lowercase, Greek -> Latin (ELOT-like, simplified), common ligatures expanded. Display names keep the original script."""
    s = strip_accents(s).lower()
    if re.search(r"[α-ω]", s):
        for a, b in _GR_DI: s = s.replace(a, b)
        s = "".join(_GR.get(ch, ch) for ch in s)
    return "".join(_LIG.get(ch, ch) for ch in s)

def norm(s):
    if not s: return ""
    s = translit(s).replace("&", " and ")
    s = re.sub(r"[’'`´\"“”‘]", "", s)
    s = re.sub(r"[\W_]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()

PRODUCER_STOP = set("""ktima ktema oinopoieio oinopoiia domaine domaines dom chateau ch château bodega bodegas weingut tenuta tenute cantina cantine azienda agricola
az agr societa soc agricola vignerons vigneron maison clos estate estates winery wines wine vineyards vineyard cellars cellar
the quinta herdade fattoria podere poderi celler cellers cave caves caves sa srl s r l spa ltd inc llc ag gmbh co cie et fils fille filles
freres family famille de du des la le les di del della dei degli y e and""".split())
# keep 'clos' etc. inside the display name; only the match key drops them
def producer_key(name):
    """order-insensitive match key ('Clape, Auguste' == 'Auguste Clape'); legal-form/generic words dropped"""
    toks = [t for t in norm(name).split() if t not in PRODUCER_STOP]
    if not toks: toks = norm(name).split()
    return " ".join(sorted(toks))

_GIVEN = re.compile(r"^(?:[A-Z][a-zà-ÿ'’\-]+|[A-Z]\.(?:\s?[A-Z]\.)*)(?:\s(?:[A-Z][a-zà-ÿ'’\-]+|[A-Z]\.))?$")
def display_producer(name):
    """'Clape, Auguste' / 'Adam - A.J.' -> 'Auguste Clape' / 'A.J. Adam' (surname-first retail convention);
    'Παπαργυρίου (Κτήμα)' / 'Ramonet (Domaine)' -> legal form moved to front."""
    mp = re.match(r"^\s*(.+?)\s*\(\s*(Κτήμα|Κτημα|Οινοποιείο|Οινοποιεία|Αμπελώνες|Domaine|Château|Chateau|Weingut|Bodegas?|Tenuta|Cantina|Quinta|Herdade|Maison)\s*\)\s*$", name or "")
    if mp: name = f"{mp.group(2)} {mp.group(1)}"
    name = (name or "").replace("_", " ")
    if name.isupper() and len(name) > 4:
        name = " ".join(w if w in ("DOC", "DOCG", "AOC", "IGT", "USA", "NV", "SA", "LLC", "II", "III", "IV", "JJ", "GD") else w.capitalize() for w in name.split())
        name = re.sub(r"\b(De|Du|Di|Del|La|Le|Les|Dos|Das|Do|Da|Y|E)\b", lambda m: m.group(0).lower(), name)
    m = re.match(r"^\s*([^,\-–]+?)\s*(?:,|\s[-–]\s)\s*([^,]+?)\s*$", name or "")
    if m and len(m.group(1).split()) <= 2 and _GIVEN.match(m.group(2)) and not re.search(r"(?i)\b(domaine|chateau|château|famille|family|estate|winery|cellars|bodega|tenuta|weingut|et fils|frères|freres|père|pere)\b", m.group(2)):
        return re.sub(r"\s+", " ", f"{m.group(2)} {m.group(1)}")
    return re.sub(r"\s+", " ", (name or "")).strip()

CUVEE_STOP = set("de du des la le les di del della dei da do dos das y e and the of en vin vino wine red white rouge blanc tinto blanco bianco rosso erythros erythro lefkos lefko roze krasi oinos".split())
CUVEE_DROP = set("""igt doc docg aoc aop dop igp vdf vqa ava do doca dc qba vdt vino da tavola appellation controlee protegee
denominazione origine controllata garantita denominacion vin de france united states usa france italy italia spain espana portugal greece
germany austria australia argentina chile new zealand south africa
loire burgundy bourgogne-region piedmont piemonte tuscany toscana sicily sicilia california oregon washington catalonia catalunya galicia styria
steiermark niederosterreich lower jura-region veneto""".split())
CUVEE_SYN = {"premier": "1er", "1st": "1er", "saint": "st", "sainte": "ste", "mount": "mt", "monte": "mt", "vieilles": "vv", "vignes": "", "old": "vv",
             "vines": "", "selezione": "sel", "selection": "sel", "riserva": "reserva", "reserve": "reserva", "gran": "grand", "grande": "grand",
             "cuvee": "", "cru": "", "1erc": "1er", "vineyard": "vyd", "vineyards": "vyd", "vigna": "vyd", "vigneto": "vyd", "lieu": "lieu"}
def cuvee_key(text):
    t = re.sub(r"(\w)['’]s\b", r"\1s", strip_accents(text or "").lower())
    t = re.sub(r"\b1er\s*cru\b|\bpremier\s+cru\b", " 1er ", t)
    t = re.sub(r"\bvin de france\b", " ", t)
    toks = []
    for tk in norm(t).split():
        if tk in CUVEE_STOP or tk in CUVEE_DROP: continue
        tk = CUVEE_SYN.get(tk, tk)
        if tk: toks.append(tk)
    return " ".join(sorted(set(toks)))


def match_key(producer, cuvee, wine_type):
    return f"{producer_key(display_producer(producer))}|{cuvee_key(cuvee or '')}|{wine_type or '?'}"
