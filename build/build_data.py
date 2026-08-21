#!/usr/bin/env python3
"""Génère data/communes.json à partir de sources ouvertes.

Runtime du site = purement statique : il ne fait que lire le fichier produit ici.
Relancer ce script (avec réseau) régénère les données. Dépendances : stdlib seule.

Sources (voir build/SOURCES.md) :
  - communes + centroïdes : geo.api.gouv.fr           (RÉEL)
  - gares                 : SNCF gares-de-voyageurs    (RÉEL -> distance)
  - trait de côte         : Natural Earth ne_10m        (RÉEL -> distance)
  - sismique / prix / pollution : PROXY documentés, à remplacer par du réel.

Ajouter un critère = ajouter une entrée dans data/criteria.json + remplir la
colonne correspondante dans build_criterion() ci-dessous. Rien d'autre à toucher.
"""
import json, math, os, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CACHE = os.path.join(HERE, "cache")
# .js (et non .json) : chargé via <script>, donc fonctionne au double-clic (file://)
# où fetch() est bloqué. Le site reste 100% statique.
OUT = os.path.join(ROOT, "data", "communes.js")
os.makedirs(CACHE, exist_ok=True)

COMMUNES_URL = ("https://geo.api.gouv.fr/communes"
                "?fields=nom,centre,population,codeDepartement&format=json&geometry=centre")
GARES_URL = ("https://ressources.data.sncf.com/api/explore/v2.1/catalog/datasets/"
             "gares-de-voyageurs/records?select=nom,position_geographique&limit=100&offset={off}")
COAST_URL = ("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/"
             "geojson/ne_10m_coastline.geojson")
# bbox France métropolitaine (lon_min, lat_min, lon_max, lat_max) pour filtrer la côte
FR_BBOX = (-5.5, 41.0, 10.0, 51.5)


def cached(name, fetch):
    """Récupère depuis le cache disque, sinon télécharge via fetch() puis met en cache."""
    path = os.path.join(CACHE, name)
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    data = fetch()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f)
    return data


def http_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "carto-boc/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def fetch_communes():
    print("  ... téléchargement communes")
    return http_json(COMMUNES_URL)


def fetch_gares():
    print("  ... téléchargement gares (paginé)")
    out, off = [], 0
    while True:
        page = http_json(GARES_URL.format(off=off))
        rows = page.get("results", [])
        if not rows:
            break
        for r in rows:
            g = r.get("position_geographique")
            if g and g.get("lat") is not None:
                out.append((g["lat"], g["lon"]))
        off += 100
        if off >= page.get("total_count", 0):
            break
    return out


def fetch_coast_vertices():
    print("  ... téléchargement trait de côte")
    gj = http_json(COAST_URL)
    lon0, lat0, lon1, lat1 = FR_BBOX
    verts = []
    for feat in gj.get("features", []):
        geom = feat.get("geometry") or {}
        lines = []
        if geom.get("type") == "LineString":
            lines = [geom["coordinates"]]
        elif geom.get("type") == "MultiLineString":
            lines = geom["coordinates"]
        for line in lines:
            for lon, lat in line:
                if lon0 <= lon <= lon1 and lat0 <= lat <= lat1:
                    verts.append((lat, lon))
    return verts


# ---- géométrie ----
def km_or_none(x):
    """NaN (commune hors bbox, ex. outre-mer) -> None : JSON valide + valeur neutre au norm."""
    return None if (x is None or (isinstance(x, float) and math.isnan(x))) else round(x, 1)


def haversine(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


class Grid:
    """Index spatial simple : bucket lat/lon par cellule, recherche cellules voisines.

    ponytail: grille naïve à pas fixe. Suffit pour ~3k points × 35k requêtes.
    Passer à un vrai kd-tree seulement si ça devient un goulot mesuré.
    """
    def __init__(self, points, cell=0.3):
        self.cell = cell
        self.buckets = {}
        for lat, lon in points:
            self.buckets.setdefault((int(lat / cell), int(lon / cell)), []).append((lat, lon))

    def nearest_km(self, lat, lon):
        ci, cj = int(lat / self.cell), int(lon / self.cell)
        best, found_ring = None, None
        for ring in range(0, 61):          # garde-fou (aucun point : hors bbox)
            for i in range(ci - ring, ci + ring + 1):
                for j in range(cj - ring, cj + ring + 1):
                    # ne balayer que le périmètre de l'anneau (cellules à distance de Chebyshev == ring)
                    if ring and ci - ring < i < ci + ring and cj - ring < j < cj + ring:
                        continue
                    for plat, plon in self.buckets.get((i, j), ()):
                        d = haversine(lat, lon, plat, plon)
                        if best is None or d < best:
                            best = d
            if best is not None:
                if found_ring is None:
                    found_ring = ring
                if ring >= found_ring + 2:  # +2 anneaux de marge (cellules non carrées en km)
                    return best
        return best if best is not None else float("nan")


# ---- proxies documentés (à remplacer par du réel) ----
# Zonage sismique approché par département (1=très faible … 5=fort). Défaut = 2.
SEISMIC_BY_DEP = {
    "06": 4, "04": 4, "05": 4, "65": 4, "64": 4, "2A": 4, "2B": 4,
    "13": 3, "83": 3, "84": 3, "38": 3, "73": 3, "74": 3, "01": 3, "39": 3,
    "25": 3, "70": 3, "90": 3, "68": 3, "67": 3, "66": 3, "09": 3, "31": 3,
    "40": 3, "33": 3, "17": 3, "26": 3, "07": 3, "48": 3, "12": 3, "63": 3,
    "43": 3, "15": 3, "971": 5, "972": 5, "973": 3, "974": 3, "976": 4,
}
# départements chers (Île-de-France, littoral/attractif) -> multiplicateur prix
PRICE_MULT = {
    "75": 6.0, "92": 4.0, "94": 3.0, "93": 2.6, "78": 2.4, "91": 2.0, "95": 2.0, "77": 1.8,
    "06": 3.0, "83": 2.2, "13": 2.0, "2A": 2.2, "2B": 2.0, "74": 2.2, "33": 1.8,
    "44": 1.7, "34": 1.7, "64": 1.8, "35": 1.5, "69": 2.0, "31": 1.6, "84": 1.5, "17": 1.6,
}


def seismic_zone(dep):
    return SEISMIC_BY_DEP.get(dep, 2)


def price_estimate(dep, pop):
    # base logarithmique sur la population, ajustée par le département
    base = 900 + 260 * math.log10(max(pop, 50))
    return round(base * PRICE_MULT.get(dep, 1.0))


def air_index(pop):
    # proxy : meilleure qualité de l'air quand densité faible (inverse population)
    return round(100 / (1 + math.log10(max(pop, 50))), 2)


# ---- normalisation ----
def percentile_normalize(raws, higher_is_better):
    """Rang percentile dans [0,1]. Robuste aux extrêmes. Applique la direction :
    valeur retournée = 1 pour l'idéal. Les None -> 0.5 (neutre)."""
    idx = [i for i, v in enumerate(raws) if v is not None and not (isinstance(v, float) and math.isnan(v))]
    order = sorted(idx, key=lambda i: raws[i])
    n = len(order)
    out = [0.5] * len(raws)
    for rank, i in enumerate(order):
        p = rank / (n - 1) if n > 1 else 0.5   # 0 = plus petit brut, 1 = plus grand
        out[i] = p if higher_is_better else (1 - p)
    return out


def main():
    print("Récupération des sources…")
    communes = cached("communes_raw.json", fetch_communes)
    gares = cached("gares.json", fetch_gares)
    coast = cached("coast_fr.json", fetch_coast_vertices)
    print(f"  communes={len(communes)} gares={len(gares)} pts_côte={len(coast)}")

    gare_grid = Grid(gares, cell=0.3)
    coast_grid = Grid(coast, cell=0.3)

    rows, raw = [], {"gare": [], "mer": [], "sismique": [], "prix": [], "pollution": []}
    print("Calcul des critères par commune…")
    for k, c in enumerate(communes):
        centre = c.get("centre")
        if not centre:
            continue
        lon, lat = centre["coordinates"]
        dep = c.get("codeDepartement", "")
        pop = c.get("population") or 100
        raw["gare"].append(km_or_none(gare_grid.nearest_km(lat, lon)))
        raw["mer"].append(km_or_none(coast_grid.nearest_km(lat, lon)))
        raw["sismique"].append(seismic_zone(dep))
        raw["prix"].append(price_estimate(dep, pop))
        raw["pollution"].append(air_index(pop))
        rows.append({"insee": c["code"], "nom": c["nom"], "lat": round(lat, 4), "lon": round(lon, 4)})
        if (k + 1) % 5000 == 0:
            print(f"    {k + 1}/{len(communes)}")

    # True = grand brut idéal ; False = petit brut idéal.
    # gare/mer sont des DISTANCES : petit = proche = mieux -> False.
    directions = {"gare": False, "mer": False, "sismique": False, "prix": False, "pollution": True}
    norm = {cid: percentile_normalize(raw[cid], directions[cid]) for cid in raw}

    for i, row in enumerate(rows):
        row["v"] = {cid: round(norm[cid][i], 3) for cid in raw}
        row["raw"] = {cid: raw[cid][i] for cid in raw}

    with open(OUT, "w", encoding="utf-8") as f:
        f.write("window.COMMUNES=")
        json.dump(rows, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    size_mb = os.path.getsize(OUT) / 1e6
    print(f"Écrit {OUT}  ({len(rows)} communes, {size_mb:.1f} Mo)")


if __name__ == "__main__":
    sys.exit(main())
