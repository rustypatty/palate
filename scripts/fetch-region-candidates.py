#!/usr/bin/env python3
"""Fetch candidate Wikimedia Commons photos for every region in regionGuide.ts.

Stdlib only, resumable (re-run to continue), one request at a time, 5s apart,
backs off 30s/2min/5min on errors. Output: region-candidates/<slug>/{index.json,NN.jpg}
Usage: python3 scripts/fetch-region-candidates.py [--per-region 8]
"""
import json, os, re, sys, time, unicodedata, urllib.parse, urllib.request

UA = "PalateWineApp/1.0 (personal wine app; github.com/rustypatty/palate)"
API = "https://commons.wikimedia.org/w/api.php"
OUT = "region-candidates"
PER = int(sys.argv[sys.argv.index("--per-region") + 1]) if "--per-region" in sys.argv else 8
REGIONS = ["Barolo", "Barbaresco", "Brunello di Montalcino", "Chianti Classico", "Châteauneuf-du-Pape", "Chablis", "Sancerre", "Priorat", "Burgundy", "Bordeaux", "Southern Rhône", "Northern Rhône", "Tuscany", "Piedmont", "Loire", "Beaujolais", "Veneto", "Sonoma", "Napa", "Central Coast", "Oregon", "Rioja", "Ribera del Duero", "Castilla y León", "Galicia", "Catalonia", "Andalusia", "Douro", "Minho", "Champagne", "Alsace", "Provence", "Languedoc", "South-West France", "Sicily", "Mosel", "Rheingau", "Pfalz", "Wachau", "Mendoza", "South Australia", "Marlborough", "Central Otago"]
OK_LIC = re.compile(r"^(CC0|Public domain|PD|CC BY(-SA)? \d(\.\d)?( \w+)?|CC BY(-SA)? \d\.\d)", re.I)
last = 0.0

def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")

def get(url, binary=False):
    global last
    for wait in (0, 30, 120, 300):
        time.sleep(wait)
        time.sleep(max(0, 5 - (time.time() - last)))
        last = time.time()
        try:
            data = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60).read()
            return data if binary else json.loads(data)
        except Exception as e:
            print("  error:", e, flush=True)
    sys.exit("Blocked/failing repeatedly - stop and try again later.")

def good_license(l):
    return bool(l) and "NC" not in l and "ND" not in l and bool(OK_LIC.match(l.strip()))

for name in REGIONS:
    d = os.path.join(OUT, slug(name))
    if os.path.exists(os.path.join(d, "index.json")):
        continue
    os.makedirs(d, exist_ok=True)
    print(name, flush=True)
    q = urllib.parse.urlencode({"action": "query", "list": "search", "srsearch": name + " vineyards", "srnamespace": 6, "srlimit": 20, "format": "json"})
    titles = [x["title"] for x in get(API + "?" + q)["query"]["search"] if x["title"].lower().endswith((".jpg", ".jpeg"))]
    cands = []
    if titles:
        q = urllib.parse.urlencode({"action": "query", "prop": "imageinfo", "titles": "|".join(titles), "iiprop": "url|size|extmetadata", "iiurlwidth": 480, "iiextmetadatafilter": "LicenseShortName|Artist|ImageDescription", "format": "json"})
        for p in get(API + "?" + q).get("query", {}).get("pages", {}).values():
            ii = (p.get("imageinfo") or [None])[0]
            if not ii or ii["width"] < 1400 or ii["width"] <= ii["height"]:
                continue
            m = ii.get("extmetadata", {})
            lic = m.get("LicenseShortName", {}).get("value", "")
            if not good_license(lic):
                continue
            strip = lambda k: re.sub(r"<[^>]+>", "", m.get(k, {}).get("value", "")).strip()
            cands.append({"title": p["title"], "page": ii["descriptionurl"], "width": ii["width"], "height": ii["height"], "license": lic, "artist": strip("Artist"), "description": strip("ImageDescription")[:200], "thumb": ii["thumburl"]})
    cands = cands[:PER]
    for i, c in enumerate(cands, 1):
        c["file"] = f"{i:02d}.jpg"
        open(os.path.join(d, c["file"]), "wb").write(get(c["thumb"], binary=True))
    json.dump({"region": name, "candidates": cands}, open(os.path.join(d, "index.json"), "w"), indent=1, ensure_ascii=False)
    print(f"  {len(cands)} candidates", flush=True)
print("Done. Commit region-candidates/ (or zip it) and push to the region-photos branch.")
