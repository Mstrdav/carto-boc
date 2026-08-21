# Carto — où acheter ensemble

Cartographie interactive (France, échelle **commune**) pour trouver où chercher un
lieu à acheter en groupe. Chacun répartit **100 points** entre des critères, visualise
les communes les plus propices, et **exporte** sa répartition. On agrège ensuite tous
les exports (somme des points) pour obtenir le classement collectif.

**Démo en ligne : https://mstrdav.github.io/carto-boc/**

## Fonctionnalités

- 🗺️ **~35 000 communes** rendues via une couche `canvas` unique (fluide, pas de CDN au
  runtime : Leaflet est vendoré).
- 🎛️ **5 critères** pondérables (100 points) : gare ✅ et mer ✅ (données réelles),
  sismique / prix / pollution ⚠️ (proxys, voir `build/SOURCES.md` et `CRITERES.md`).
- 🟢→🔴 **Coloration en direct** : plus une commune est verte, plus elle correspond à
  tes priorités. **Légende** avec valeurs min/max actuelles du score.
- 🏆 **Top 15** des meilleures communes, cliquable (zoom + fiche).
- 📍 **Popup enrichie** : valeurs brutes de chaque critère (ex. « Gare : 0,8 km »,
  « Prix : 2 075 €/m² ») + note /100 du critère + **score global /100**.
- 🔎 **Recherche** de commune (autocomplete, ex. « Quimper » → clic → zoom).
- 💾 **Persistance** des poids et du prénom (`localStorage`).
- 📤 **Export / import / agrégation** des répartitions (fichier JSON par personne,
  somme des points côté organisateur).
- 📱 **Responsive mobile** : panneau repliable (menu ☰), carte plein écran, curseurs
  adaptés au doigt.
- 🧭 **État initial utile** : sans point attribué, la carte affiche le classement à
  poids égaux (pour donner un premier aperçu immédiat).

## Utilisation

**Ouvrir le site** : https://mstrdav.github.io/carto-boc/ (ou double-clic sur
`index.html` en local, aucune installation). Les tuiles de fond de carte se chargent
quand tu es en ligne.

1. Saisis ton **prénom**.
2. Répartis **100 points** entre les critères (curseurs ou champs). La carte se colore
   en direct : plus vert = plus propice à tes priorités. Le top 15 est listé et surligné.
3. Clique **Exporter ma répartition** → télécharge `carto-<prénom>.json`.
4. Envoie ce fichier à l'organisateur.

**Agréger (organisateur)** : clique **Importer / agréger** et sélectionne *plusieurs*
fichiers d'un coup. Les points de chacun sont **additionnés par critère**, la carte et
le classement affichent le résultat collectif.

## Structure

```
index.html            page (pur HTML/CSS/JS, pas de framework lourd)
css/style.css
js/score.js           moteur de score (moyenne pondérée) + self-check
js/io.js              export / import / agrégation
js/format.js          formatage des valeurs (popup) — pur, testable
js/app.js             carte Leaflet + panneau de critères
data/criteria.js      registre des critères (édite ici pour en ajouter)
data/communes.js      données précalculées (généré, ~7,6 Mo)
vendor/               Leaflet (vendoré, pas de CDN au runtime)
build/build_data.py   régénère data/communes.js depuis les sources ouvertes
build/SOURCES.md      provenance des données + comment remplacer les proxys
build/test_carto.js   suite de tests Node (score / io / format) — `node build/test_carto.js`
build/test_mobile.html  harnais 390×844 (iframe) : vérifie le responsive + le hit-test
```

## Ajouter / modifier un critère (après le questionnaire)

1. Ajoute une entrée dans [`data/criteria.js`](data/criteria.js) (`id`, `label`,
   `direction`, `unit`, `source`).
2. Renseigne sa colonne dans [`build/build_data.py`](build/build_data.py) (fonction
   `main`), puis `python build/build_data.py`.

`direction: "lower"` = petite valeur = mieux (ex. prix, distance) ;
`"higher"` = grande valeur = mieux.

## Debug (console navigateur)

`window.__carto` expose : `hitTestAt(lat, lng)` (commune sous un point, ou `null`),
`gridCellCount()` (cellules de la grille de hit-test), `map`, `points`, `draw()`,
`recolor()`. Utile pour prouver que le hit-test répond dès le premier affichage,
sans pan/zoom préalable.

## Vérifs

- `node build/test_carto.js` → suite de tests (score, import/export/agrégation, formatage).
  Échoue (exit 1) au moindre FAIL.
- `node js/score.js` → self-check du moteur de score (inchangé).
- `python -m http.server 8787` puis ouvrir `http://127.0.0.1:8787/build/test_mobile.html`
  → harnais 390×844 : responsive mobile + hit-test au premier affichage (auto-vérifié).
- `python build/build_data.py` → régénère les données (réseau requis).
