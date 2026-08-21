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

## Remplacer un proxy par du réel

1. Récupère le dataset (idéalement clé = code INSEE commune).
2. Dans `build_data.py` → `main()`, remplace le calcul du critère par une jointure
   sur le code INSEE (ajoute un `fetch_*` + un cache dans `build/cache/`).
3. Ajuste la `direction` du critère dans `data/criteria.js` si besoin.
4. `python build/build_data.py`.

La normalisation percentile et le moteur de score n'ont pas à changer.

## Notes

- Communes hors bbox métropole (outre-mer) : `gare`/`mer` = `null` → valeur neutre
  (0,5) à la normalisation. Elles restent affichées à leurs vraies coordonnées.
- Le cache disque (`build/cache/`) évite de re-télécharger à chaque run. Le vider
  force un rafraîchissement des sources.
- L'index spatial (`Grid`) est une grille naïve : suffisant ici, remplaçable par un
  kd-tree si le volume de points de référence explose.
