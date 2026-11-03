# Carto BOC : où acheter ensemble

Carte des communes de France métropolitaine (sans la Corse) pour choisir où chercher un lieu à acheter en groupe.
Chacun répartit 100 points entre les critères, la carte se colore (vert = propice), et on additionne les points de tout le groupe.

**En ligne : https://mstrdav.github.io/carto-boc/** (ou double-clic sur `index.html`).

## Utilisation

1. Mets ton prénom et répartis tes 100 points.
2. **Copier mon lien** : le lien contient tes points, envoie-le au groupe.
3. **Groupe** : colle les liens de chacun (un par ligne), la carte montre la somme des points.
4. Clique une commune : détail des critères et liens d'annonces (Leboncoin, Bien'ici, SeLoger, PAP).

## Critères (données réelles)

| Critère | Source |
|---|---|
| Gare proche | SNCF gares-de-voyageurs, distance à la gare la plus proche |
| Grande ville proche | Communes de plus de 100 000 habitants (geo.api.gouv.fr) |
| Médecin, supermarché proches | INSEE, Base permanente des équipements 2025 |
| Fibre | ARCEP, part des locaux raccordables, mars 2026 |
| Mer proche | Trait de côte Natural Earth |
| Forêts et nature | Corine Land Cover 2018 (OFB) |
| Prix | DVF 2024-2025, prix médian au m² des maisons (sinon appartements), OpenParcels sur data.gouv.fr |
| Taxe foncière | DGFiP, taux global sur le bâti 2025 |
| Village qui grandit | INSEE, évolution de la population entre les recensements 2012 et 2023 |
| Sismique, radon | Géorisques, par commune |
| Inondations, sécheresses | Géorisques GASPAR, nombre d'arrêtés CatNat depuis 1982 |
| Feu de forêt, industriel ou nucléaire | Géorisques GASPAR, risques listés par la préfecture |
| Jours > 30°C, jours de gel | Open-Meteo, moyenne 2024-2025, un point par carré de 0,5° |

Chaque critère est noté de 0 à 100 par rang entre communes (100 = la meilleure).
Une commune sans valeur prend la moyenne des communes qui la touchent (prix affiché avec ~). Sinon 50.

## Fichiers

```
index.html, css/style.css, js/app.js   le site
data/communes.js                        les données (générées)
build/build.py                          télécharge les sources et génère data/communes.js
vendor/                                 Leaflet
```

## Regénérer les données

`python build/build.py` (Python seul, réseau requis, ~30 min la première fois). Les téléchargements restent dans `build/cache/`.

Ajouter un critère : une colonne dans `build/build.py` (`CRITERIA` et la boucle en bas) et une ligne dans `CRITERIA` de `js/app.js`, dans le même ordre.
