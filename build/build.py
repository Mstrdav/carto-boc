# Builds data/communes.js from open data. Run: python build/build.py
# Downloads are cached in build/cache/ (delete a file there to download it again).
import csv, gzip, io, json, math, os, time, urllib.request, zipfile
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache")
OUT = os.path.join(HERE, "..", "data", "communes.js")
os.makedirs(CACHE, exist_ok=True)

# same order as CRITERIA in js/app.js
CRITERIA = ["gare", "ville", "medecin", "supermarche", "fibre", "mer", "foret", "prix", "taxe", "population",
            "sismique", "radon", "inondation", "secheresse", "feu", "industrie", "chaleur", "gel"]
# for these a big value is better, for all the others a small one
HIGHER = ["fibre", "foret", "population"]


def get(url, binary=False):
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "carto-boc/1.0"})
            data = urllib.request.urlopen(req, timeout=120).read()
            return data if binary else data.decode("utf-8")
        except Exception as e:
            print("   retry", attempt + 1, e)
            time.sleep(30 * (attempt + 1))
    raise Exception("failed: " + url)


def cached(name, fetch):
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        data = fetch()
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


# ---------- downloads ----------

def fetch_communes():
    print("communes...")
    url = "https://geo.api.gouv.fr/communes?fields=nom,centre,population,codeDepartement,codesPostaux&format=json"
    return json.loads(get(url))


def fetch_gares():
    print("gares...")
    out = []
    for off in range(0, 10000, 100):
        url = ("https://ressources.data.sncf.com/api/explore/v2.1/catalog/datasets/gares-de-voyageurs/records"
               "?select=position_geographique&limit=100&offset=" + str(off))
        rows = json.loads(get(url))["results"]
        if not rows:
            break
        for r in rows:
            g = r["position_geographique"]
            if g:
                out.append([g["lat"], g["lon"]])
    return out


def fetch_coast():
    print("coast...")
    url = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_coastline.geojson"
    out = []
    for feat in json.loads(get(url))["features"]:
        g = feat["geometry"]
        lines = [g["coordinates"]] if g["type"] == "LineString" else g["coordinates"]
        for line in lines:
            for lon, lat in line:
                if -5.5 <= lon <= 10 and 41 <= lat <= 51.5:
                    out.append([lat, lon])
    return out


def fetch_prix():
    print("prix DVF...")
    url = ("https://static.data.gouv.fr/resources/prix-immobiliers-medians-au-m2-par-commune-dvf-2024-2025/"
           "20261026-120736/prix-medians-dvf-par-commune.csv")
    prix = {}
    for row in csv.DictReader(io.StringIO(get(url))):
        p = row["prix_median_m2_maison"] or row["prix_median_m2_appartement"]
        if p:
            prix[row["code_insee"]] = float(p)
    return prix


def fetch_fibre():
    # share of homes and offices that can get fibre (ARCEP, March 2026)
    print("fibre...")
    url = ("https://static.data.gouv.fr/resources/le-marche-du-haut-et-tres-haut-debit-fixe-deploiements/"
           "20260331-154839/releve-geographique-donnees-2026-03.csv")
    out = {}
    for row in csv.DictReader(io.StringIO(get(url)), delimiter=";"):
        if row["taux_depl_commune"]:
            out[row["INSEE_COM"]] = round(float(row["taux_depl_commune"].replace(",", ".")) * 100)
    return out


def fetch_taxe():
    # taxe foncière rate on buildings, all levels added up (2025)
    print("taxe...")
    url = ("https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/fiscalite-locale-des-particuliers/"
           "exports/csv?where=exercice%3D%222025%22&select=insee_com,taux_global_tfb&delimiter=%3B")
    out = {}
    for row in csv.DictReader(io.StringIO(get(url, binary=True).decode("utf-8-sig")), delimiter=";"):
        if row["taux_global_tfb"]:
            out[row["insee_com"]] = float(row["taux_global_tfb"])
    return out


def fetch_population():
    # population change between the 2012 and 2023 censuses, in %
    print("population...")
    z = zipfile.ZipFile(io.BytesIO(get("https://www.insee.fr/fr/statistiques/fichier/2521169/comparateur_csv.zip", binary=True)))
    pop = {}
    for row in csv.DictReader(io.TextIOWrapper(z.open("comparateur.csv"), encoding="utf-8"), delimiter=";"):
        if (row["GEO_OBJECT"] == "COM" and row["DS"] == "DS_RP_SERIE_HISTORIQUE" and row["TAB_MEASURE"] == "POP"
                and row["TIME_PERIOD"] in ("2012", "2023") and row["OBS_VALUE"]):
            pop.setdefault(row["GEO"], {})[row["TIME_PERIOD"]] = float(row["OBS_VALUE"])
    return {code: round((p["2023"] - p["2012"]) / p["2012"] * 100, 1)
            for code, p in pop.items() if p.get("2012") and "2023" in p}


def fetch_foret():
    # share of forest and natural land (Corine Land Cover 2018)
    print("foret...")
    url = ("https://wxs.ofb.fr/geoserver/referentiel/ows?version=2.0.0&service=WFS&request=GetFeature"
           "&typename=referentiel:ref_omon_ocs_niv1_com_2018_aee_pol_3857&outputFormat=csv&propertyName=insee_com,p_s3")
    return {row["insee_com"]: round(float(row["p_s3"] or 0) * 100)
            for row in csv.DictReader(io.StringIO(get(url)))}


def fetch_services():
    # every GP (D265) and supermarket (B105) of France with its position (INSEE BPE 2025, 1.5 GB csv read as a stream)
    print("services...")
    z = zipfile.ZipFile(io.BytesIO(get("https://www.insee.fr/fr/statistiques/fichier/8217525/BPE25.zip", binary=True)))
    out = {"D265": [], "B105": []}
    for row in csv.DictReader(io.TextIOWrapper(z.open("BPE25.csv"), encoding="utf-8"), delimiter=";"):
        if row["TYPEQU"] in out and row["LATITUDE"]:
            out[row["TYPEQU"]].append([float(row["LATITUDE"]), float(row["LONGITUDE"])])
    return out


def georisques(endpoint, codes, read):
    # 20 communes per request, 3 requests at a time (Géorisques allows 5 per second)
    def fetch(i):
        if i % 2000 == 0:
            print("  ", endpoint, i, "/", len(codes))
        rows, page = [], 1
        while True:
            url = ("https://www.georisques.gouv.fr/api/v1/" + endpoint + "?page_size=1000&page=" + str(page)
                   + "&code_insee=" + ",".join(codes[i:i + 20]))
            d = json.loads(get(url))
            rows += d["data"]
            time.sleep(0.2)
            if page >= d["total_pages"]:
                return rows
            page += 1

    out = {}
    with ThreadPoolExecutor(3) as pool:
        for rows in pool.map(fetch, range(0, len(codes), 20)):
            for row in rows:
                read(out, row)
    return out


def read_sismique(out, row):
    out[row["code_insee"]] = int(row["code_zone"])


def read_radon(out, row):
    out[row["code_insee"]] = int(row["classe_potentiel"])


def fetch_neighbours():
    # two communes touch when their outlines share a point
    print("neighbours...")
    url = "https://etalab-datasets.geo.data.gouv.fr/contours-administratifs/latest/geojson/communes-100m.geojson.gz"
    geo = json.loads(gzip.decompress(get(url, binary=True)).decode("utf-8"))
    owners = {}
    for f in geo["features"]:
        g = f["geometry"]
        polygons = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        for polygon in polygons:
            for ring in polygon:
                for point in ring:
                    owners.setdefault(str(point), set()).add(f["properties"]["code"])
    out = {}
    for codes_here in owners.values():
        for code in codes_here:
            out.setdefault(code, set()).update(codes_here - {code})
    return {code: sorted(n) for code, n in out.items()}


def fetch_gaspar():
    # Géorisques GASPAR: CatNat declarations since 1982 counted per commune, and the risks
    # each prefecture lists for the commune (16 wildfire, 21 industrial, 22 nuclear)
    print("gaspar...")
    z = zipfile.ZipFile(io.BytesIO(get("https://files.georisques.fr/GASPAR/gaspar.zip", binary=True)))
    out = {}

    def commune(code):
        return out.setdefault(code, {"inondation": 0, "secheresse": 0, "feu": 0, "industrie": 0})

    name = [n for n in z.namelist() if n.startswith("catnat")][0]
    for row in csv.DictReader(io.StringIO(z.read(name).decode("utf-8")), delimiter=";"):
        if "Inondation" in row["lib_risque_jo"]:
            commune(row["code_commune"])["inondation"] += 1
        if row["lib_risque_jo"] == "Sécheresse":
            commune(row["code_commune"])["secheresse"] += 1
    name = [n for n in z.namelist() if n.startswith("ddrm")][0]
    for row in csv.DictReader(io.StringIO(z.read(name).decode("utf-8")), delimiter=";"):
        if row["num_risque"] == "16":
            commune(row["cod_commune"])["feu"] = 1
        if row["num_risque"] in ("21", "22"):
            commune(row["cod_commune"])["industrie"] = 1
    return out


def fetch_meteo(cells):
    # mean per year over 2024-2025 of days above 30°C and days below 0°C, one point per 0.5° cell
    # cells = [[cell key, lat, lon], ...]
    # Open-Meteo free limit is ~600 weighted calls a minute, hence the long sleep
    print("meteo...")
    out = {}
    for i in range(0, len(cells), 10):
        group = cells[i:i + 10]
        url = ("https://archive-api.open-meteo.com/v1/archive?start_date=2024-01-01&end_date=2025-12-31"
               "&daily=temperature_2m_max,temperature_2m_min&timezone=Europe/Paris"
               "&latitude=" + ",".join(str(c[1]) for c in group) +
               "&longitude=" + ",".join(str(c[2]) for c in group))
        d = json.loads(get(url))
        if isinstance(d, dict):
            d = [d]
        for c, r in zip(group, d):
            tmax = r["daily"]["temperature_2m_max"]
            tmin = r["daily"]["temperature_2m_min"]
            hot = sum(1 for t in tmax if t is not None and t > 30) / 2
            frost = sum(1 for t in tmin if t is not None and t < 0) / 2
            out[c[0]] = [round(hot, 1), round(frost, 1)]
        print("  ", i + len(group), "/", len(cells))
        time.sleep(20)
    return out


# ---------- maths ----------

def km(lat1, lon1, lat2, lon2):
    a = (math.sin(math.radians(lat2 - lat1) / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(math.radians(lon2 - lon1) / 2) ** 2)
    return 6371 * 2 * math.asin(math.sqrt(a))


def make_buckets(points):
    # group points by 0.5° square so we only look at nearby ones
    buckets = {}
    for lat, lon in points:
        buckets.setdefault((int(lat * 2), int(lon * 2)), []).append((lat, lon))
    return buckets


def nearest_km(buckets, lat, lon):
    i, j = int(lat * 2), int(lon * 2)
    best = None
    for ring in range(0, 30):
        for a in range(i - ring, i + ring + 1):
            for b in range(j - ring, j + ring + 1):
                if max(abs(a - i), abs(b - j)) != ring:
                    continue
                for plat, plon in buckets.get((a, b), []):
                    d = km(lat, lon, plat, plon)
                    if best is None or d < best:
                        best = d
        # one ring past the first hit, a closer point can still be there
        if best is not None and best < ring * 0.5 * 70:
            return round(best, 1)
    return round(best, 1)


def scores(values, higher):
    # score = share of communes that are NOT better than this one, so the best value always gets 100
    # (also when many communes share it, like "no wildfire risk"). Missing = 50.
    known = sorted(v for v in values if v is not None)
    n = len(known)
    better = {}
    for i, v in enumerate(known):
        if higher:
            better[v] = n - 1 - i  # last index of v wins: communes above it
        elif v not in better:
            better[v] = i          # first index of v: communes below it
    out = []
    for v in values:
        out.append(50 if v is None else round((1 - better[v] / n) * 100))
    return out


# ---------- main ----------

communes = cached("communes.json", fetch_communes)
# mainland France only: no Corsica, no overseas
communes = [c for c in communes if c.get("centre") and len(c["codeDepartement"]) == 2
            and c["codeDepartement"] not in ("2A", "2B")]
codes = [c["code"] for c in communes]
print(len(communes), "communes")

neighbours = cached("neighbours.json", fetch_neighbours)


def fill(values):
    # communes with no value get the mean of the communes touching them, repeated so the
    # gaps fill from their edges (islands stay unknown). Returns the codes filled this way.
    filled = set()
    for step in range(20):
        new = {}
        for code in codes:
            if code not in values:
                around = [values[n] for n in neighbours.get(code, []) if n in values]
                if around:
                    new[code] = round(sum(around) / len(around), 1)
        if not new:
            break
        values.update(new)
        filled.update(new)
    return filled


def cell(lat, lon):
    return str(math.floor(lat * 2)) + "," + str(math.floor(lon * 2))


# weather point of each cell = where its people live (population weighted), not the middle of the
# square, which can be on a mountain top
sums = {}
for c in communes:
    lon, lat = c["centre"]["coordinates"]
    w = c.get("population") or 1
    s = sums.setdefault(cell(lat, lon), [0, 0, 0])
    s[0] += w
    s[1] += w * lat
    s[2] += w * lon
cells = [[k, round(s[1] / s[0], 3), round(s[2] / s[0], 3)] for k, s in sums.items()]

# one value per commune code for the criteria that come as tables
values = {
    "prix": cached("prix.json", fetch_prix),
    "fibre": cached("fibre.json", fetch_fibre),
    "taxe": cached("taxe.json", fetch_taxe),
    "population": cached("population.json", fetch_population),
    "foret": cached("foret.json", fetch_foret),
    "sismique": cached("sismique.json", lambda: georisques("zonage_sismique", codes, read_sismique)),
    "radon": cached("radon.json", lambda: georisques("radon", codes, read_radon)),
}
estimated = fill(values["prix"])
values["prix"] = {code: round(p) for code, p in values["prix"].items()}
print(len(estimated), "prices estimated from neighbours")
for k in ["fibre", "taxe", "population", "foret"]:
    print(len(fill(values[k])), k, "filled from neighbours")

gaspar = cached("gaspar.json", fetch_gaspar)
for k in ["inondation", "secheresse", "feu", "industrie"]:
    values[k] = {code: g[k] for code, g in gaspar.items()}

meteo = cached("meteo.json", lambda: fetch_meteo(cells))
services = cached("services.json", fetch_services)
medecins = make_buckets(services["D265"])
supermarches = make_buckets(services["B105"])
gares = make_buckets(cached("gares.json", fetch_gares))
coast = make_buckets(cached("coast_fr.json", fetch_coast))
cities = [(c["centre"]["coordinates"][1], c["centre"]["coordinates"][0])
          for c in communes if (c.get("population") or 0) >= 100000]

raw = {k: [] for k in CRITERIA}
for c in communes:
    lon, lat = c["centre"]["coordinates"]
    m = meteo.get(cell(lat, lon), [None, None])
    raw["gare"].append(nearest_km(gares, lat, lon))
    raw["ville"].append(round(min(km(lat, lon, a, b) for a, b in cities), 1))
    raw["medecin"].append(nearest_km(medecins, lat, lon))
    raw["supermarche"].append(nearest_km(supermarches, lat, lon))
    raw["mer"].append(nearest_km(coast, lat, lon))
    raw["chaleur"].append(m[0])
    raw["gel"].append(m[1])
    for k in values:
        # no GASPAR line means nothing was ever declared there
        default = 0 if k in ["inondation", "secheresse", "feu", "industrie"] else None
        raw[k].append(values[k].get(c["code"], default))

score = {k: scores(raw[k], k in HIGHER) for k in CRITERIA}

# one row per commune: [name, postal code, lat, lon, [scores], [raw values], 1 if the price is estimated]
rows = []
for i, c in enumerate(communes):
    lon, lat = c["centre"]["coordinates"]
    cp = (c.get("codesPostaux") or [""])[0]
    rows.append([c["nom"], cp, round(lat, 4), round(lon, 4),
                 [score[k][i] for k in CRITERIA], [raw[k][i] for k in CRITERIA], 1 if c["code"] in estimated else 0])

with open(OUT, "w", encoding="utf-8") as f:
    f.write("var COMMUNES = ")
    json.dump(rows, f, ensure_ascii=False, separators=(",", ":"))
    f.write(";\n")
print("wrote", OUT, round(os.path.getsize(OUT) / 1e6, 1), "MB")
