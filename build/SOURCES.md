# Provenance des données

`data/communes.js` est **généré** par `build_data.py`. Ne pas l'éditer à la main —
relancer `python build/build_data.py` (réseau requis, sans dépendance pip).

Chaque valeur `v.<critère>` est normalisée dans **[0,1], 1 = idéal** (rang percentile
entre communes, direction déjà appliquée). Les valeurs brutes sont conservées dans
`raw` pour l'affichage au survol.

## Critères actuels

| Critère    | Statut | Source / méthode |
|------------|--------|------------------|
| gare       | **RÉEL** | [SNCF `gares-de-voyageurs`](https://ressources.data.sncf.com/explore/dataset/gares-de-voyageurs/) (~2 780 gares). Distance haversine centroïde commune → gare la plus proche. |
| mer        | **RÉEL** | [Natural Earth `ne_10m_coastline`](https://github.com/nvkelso/natural-earth-vector) filtré à la France. Distance centroïde → point de côte le plus proche. |
| sismique   | *proxy* | Zonage approché **par département** (`SEISMIC_BY_DEP` dans `build_data.py`). À remplacer par le zonage réglementaire **par commune** (Géorisques). |
| prix       | *proxy* | Estimation `f(population) × multiplicateur département`. À remplacer par [DVF agrégé](https://files.data.gouv.fr/geo-dvf/) (prix médian €/m² par commune). |
| pollution  | *proxy* | Inverse de la densité (proxy population). À remplacer par un indice qualité de l'air réel (ATMO / indices communaux). |

Fond communes + centroïdes : [`geo.api.gouv.fr/communes`](https://geo.api.gouv.fr/)
(RÉEL, ~34 970 communes avec centre, population, département).

## Remplacer le proxy sismique par le zonage réel (Géorisques, PAR COMMUNE)

Le proxy actuel (`SEISMIC_BY_DEP` dans `build_data.py`) attribue une zone par
**département**. Le zonage réglementaire est en réalité défini **par commune**
(décret du 22 octobre 2010, en vigueur depuis le 1er mai 2011). L'API Géorisques
le fournit **sans clé** — testé depuis ce poste le 2026-08-22.

### Endpoint (vérifié fonctionnel, sans clé API)

```
GET https://www.georisques.gouv.fr/api/v1/zonage_sismique?code_insee=29019
```

Réponse (JSON) :

```json
{"results":1,"page":1,"total_pages":1,
 "data":[{"code_insee":"29019","libelle_commune":"BREST","code_zone":"2","zone_sismicite":"2 - FAIBLE"}],
 "response_code":200,"message":null,"next":null,"previous":null}
```

`code_zone` est l'entier **1..5** à stocker dans `raw.sismique` (la normalisation
`direction: lower` est déjà en place — petite zone = mieux).

Commande curl équivalente :

```bash
curl -s "https://www.georisques.gouv.fr/api/v1/zonage_sismique?code_insee=29019" \
  -H "User-Agent: carto-boc/1.0"
```

### Contraintes mesurées (à respecter pour un build)

- **Pas de filtre par département** ni par lot global : le paramètre de recherche
  est `code_insee` (commune). `code_insee=29019,01001` (liste séparée par virgules)
  fonctionne.
- **Limite ~20-24 codes INSEE par requête** (au-delà : HTTP 500 « Des paramètres
  de recherches sont manquants. »). 20 codes = OK, 25+ = 500.
- **Rate limit : 5 appels/s** pour `api/v1/**` (voir la doc Géorisques).
  → ~35 000 communes ÷ 20 = ~1 750 requêtes = **~6 min** au rythme max.
- Alternative *bulk* : jeu de données data.gouv.fr « Zonage sismique de la France »
  (`https://www.data.gouv.fr/datasets/zonage-sismique-de-la-france-1/`, zip **129 Mo**,
  couche vecteur issue du fichier Excel planseisme.fr/BRGM de janvier 2015). Trop lourd
  pour un build léger, mais utilisable hors-ligne en prétraitement.

### Marche à suivre pour l'intégrer

1. Dans `build_data.py`, ajouter un `fetch_seismic()` qui itère `COMMUNES_URL` par
   lots de ~20 codes INSEE, respecte `time.sleep(0.21)` (5 req/s), et écrit un cache
   `build/cache/seismic.json` (`{insee: zone}`) via `cached()`.
2. Remplacer `raw["sismique"].append(seismic_zone(dep))` par
   `raw["sismique"].append(seismic_by_insee.get(c["code"], 2))` (défaut 2 = faible).
3. Mettre à jour la `source` du critère dans `data/criteria.js`
   (« RÉEL — zonage sismique Géorisques par commune (décret 2010) »).
4. `python build/build_data.py` puis `node build/test_carto.js`.

**Non fait en itération 2** (build ~6 min de fetch + recalcul > seuil de risque) :
documentation uniquement, données `data/communes.js` laissées inchangées.

## Notes

- Communes hors bbox métropole (outre-mer) : `gare`/`mer` = `null` → valeur neutre
  (0,5) à la normalisation. Elles restent affichées à leurs vraies coordonnées.
- Le cache disque (`build/cache/`) évite de re-télécharger à chaque run. Le vider
  force un rafraîchissement des sources.
- L'index spatial (`Grid`) est une grille naïve : suffisant ici, remplaçable par un
  kd-tree si le volume de points de référence explose.
