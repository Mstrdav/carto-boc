# Backlog des critères — cartographie recherche habitat collectif

Liste "théorique" des critères cartographiables par commune, avec source de données
potentielle et effort. Statut : ✅ implémenté · 🟢 réel dispo facile · 🟡 traitement
moyen · 🔴 lourd / parcellaire / à voir.

Ajouter un critère = 1 colonne dans `build/build_data.py` + 1 entrée dans
`data/criteria.js`, puis `python build/build_data.py`.

---

## 1. Climat & météo

| Critère | Source potentielle | Effort |
|---|---|---|
| Température moyenne annuelle | Météo-France (normales 1991-2020) | 🟡 |
| Température max (moyenne des maxima, jours >30°C / >35°C) | Météo-France | 🟡 |
| Température min (jours de gel) | Météo-France | 🟡 |
| Précipitations (cumul annuel, répartition saisonnière) | Météo-France | 🟡 |
| Ensoleillement (heures/an) | Météo-France | 🟡 |
| Humidité moyenne | Météo-France | 🟡 |
| Vent (moyenne, rafales) | Météo-France | 🟡 |
| Canicule : nb de jours/an actuel **et projeté 2050** | DRIAS / Climadiag (Météo-France) | 🟢 |
| Îlot de chaleur urbain | Copernicus LST / température de surface | 🟡 |

## 2. Eau

| Critère | Source potentielle | Effort |
|---|---|---|
| Sécheresse : arrêtés sécheresse / restrictions par commune | Propluvia / Géorisques | 🟢 |
| Retrait-gonflement des argiles (RGA) | Géorisques (exposition par commune) | 🟢 |
| Niveau / tension des nappes phréatiques | BRGM (ADES) | 🟢 |
| Qualité de l'eau potable (nitrates, pesticides, PFAS) | ARS / SISE-Eaux (data.eaufrance) | 🟡 |
| Distance à un cours d'eau / lac | IGN BD TOPO / OSM | 🟢 |
| Risque inondation (crue, remontée de nappe, submersion marine) | Géorisques (TRI, AZI, PPRI) | 🟢 |
| Zones humides / zones de captage (contraintes constructives) | Géorisques / SANDRE | 🟡 |

## 3. Risques naturels & industriels

| Critère | Source potentielle | Effort |
|---|---|---|
| Sismique — zonage réglementaire **par commune** (remplace proxy dépt) | Géorisques : `GET /api/v1/zonage_sismique?code_insee=X` (sans clé, ~20 codes/requête, 5 req/s) — voir `build/SOURCES.md` | 🟢 |
| Mouvement de terrain / cavités souterraines | Géorisques (BSS, cavités) | 🟢 |
| Incendie de forêt (exposition, ZIF) | Géorisques / IGN | 🟡 |
| Avalanche | Géorisques | 🟡 |
| Cyclone / tempête (outre-mer) | Géorisques | 🟡 |
| Radon (potentiel par commune) | IRSN | 🟢 |
| Sites pollués (SIS, anciennes industries) | Géorisques (BASOL/BASIAS) | 🟢 |
| Sites Seveso / ICPE + périmètres PPRT | Géorisques | 🟢 |
| Foudre | Météorage | 🟡 |

## 4. Économie & immobilier

| Critère | Source potentielle | Effort |
|---|---|---|
| **Prix foncier réel €/m²** (remplace proxy) | DVF — files.data.gouv.fr/geo-dvf | 🟢 |
| Prix médian maisons vs appartements | DVF | 🟢 |
| Prix des terrains à bâtir | DVF | 🟢 |
| Évolution des prix sur 5/10 ans | DVF (comparaison années) | 🟡 |
| Prix des loyers | Observatoires locaux / data.gouv | 🔴 |
| Taxe foncière moyenne par commune | data.gouv (finances locales) | 🟡 |
| Tension du marché (délai de vente, taux de vacance) | DVF + INSEE logements vacants | 🟡 |
| Revenu médian | INSEE FILOSOFI | 🟢 |
| Taux de pauvreté | INSEE FILOSOFI | 🟢 |
| Chômage / bassin d'emploi | INSEE | 🟢 |
| Démographie : population, évolution, densité | INSEE (déjà partiellement dispo) | 🟢 |
| Part de résidences secondaires (tourisme) | INSEE | 🟢 |
| Projeté : évolution démographique 2030-2050 | INSEE Omphale | 🟢 |

## 5. Santé & environnement

| Critère | Source potentielle | Effort |
|---|---|---|
| **Qualité de l'air réel** PM2.5/PM10/NO2/O3 (remplace proxy) | ATMO / Géod'air / Copernicus CAMS | 🟡 |
| Bruit : routes, fer, aérien | Bruitparif (IDF) + cartes DREAL | 🔴 |
| Pollution lumineuse | AVEX / World Atlas | 🟢 |
| Lignes haute tension / antennes | RTE / ANFR | 🟢 |
| Densité de végétation (NDVI) | Sentinel-2 (Copernicus) | 🟡 |

## 6. Transport & mobilité

| Critère | Source potentielle | Effort |
|---|---|---|
| Distance gare ✅ | SNCF gares-de-voyageurs | ✅ |
| Fréquence des trains (nb liaisons/jour, désertes) | SNCF horaires / fréquentation | 🟡 |
| Temps de trajet réel vers grandes villes (isochrones) | SNCF / OSRM (calcul trajets) | 🟢 |
| Distance aéroport | OSM / data.gouv | 🟢 |
| Distance autoroute / grand axe | IGN / OSM | 🟢 |
| Distance arrêt bus/car régional | réseaux régionaux / OSM | 🟡 |
| Pistes cyclables / voies vertes | OSM / IGN | 🟡 |
| Bornes de recharge VE | data.gouv (IRVE) | 🟢 |
| Couverture 4G/5G | ANFR | 🟢 |
| Couverture fibre | ARCEP / zones éligibles | 🟢 |

## 7. Services & vie quotidienne

| Critère | Source potentielle | Effort |
|---|---|---|
| Écoles / collèges / lycées (distance) | data.gouv (MEN) | 🟢 |
| Médecins généralistes / désert médical | Annuaire Santé / DREES | 🟢 |
| Hôpitaux / urgences | data.gouv | 🟢 |
| Pharmacies | data.gouv | 🟢 |
| Supermarchés / commerces | OSM | 🟢 |
| Mairie / poste / banque | OSM | 🟢 |
| Culture, sport, piscines, médiathèques | data.gouv / OSM | 🟢 |

## 8. Nature & cadre de vie

| Critère | Source potentielle | Effort |
|---|---|---|
| Distance à la mer ✅ | Natural Earth | ✅ |
| Distance montagne / stations | IGN / OSM | 🟢 |
| Couverture forestière / occupation des sols | IGN OCS GE / Corine Land Cover | 🟢 |
| Proximité parcs naturels, Natura 2000, ZNIEFF | INPN | 🟢 |
| Altitude, pente, exposition | IGN RGE Alti (MNT) | 🟢 |
| Qualité des sols (jardin/potager) | géoportail pédologie / Réseau Mixte Techno | 🔴 |
| Densité de végétation urbaine | NDVI Sentinel-2 | 🟡 |

## 9. Sécurité & société

| Critère | Source potentielle | Effort |
|---|---|---|
| Délinquance par commune | data.gouv (ministère Intérieur) | 🟡 |
| Structure d'âge / jeunesse | INSEE | 🟢 |
| Vie associative (nb d'assos / 1000 hab.) | data.gouv (Journal Officiel) | 🟢 |
| Zones de revitalisation / aides (ZRR, France Ruralités) | data.gouv | 🟢 |

## 10. Long terme & réglementaire (clés pour ACHETER)

| Critère | Source potentielle | Effort |
|---|---|---|
| Zonage PLU/PLUi : zones constructibles (U/AU) vs non (N/A) | Géoportail Urbanisme / data.gouv | 🔴 |
| Servitudes d'utilité publique, ZAC, préemption | Géoportail Urbanisme | 🔴 |
| Projections climat 2050/2100 (canicule, sécheresse, submersion) | DRIAS / Climadiag | 🟢 |
| Desserte future (lignes à venir : LGV, RER métropolitain) | SNCF Réseau / presse | 🟡 |

---

## Quick wins (priorité si on implémente)

1. **DVF** → prix réel (remplace proxy `prix`) — 🟢
2. **Zonage sismique Géorisques par commune** (remplace proxy) — 🟢
3. **Indice qualité de l'air Géod'air/ATMO** (remplace proxy pollution) — 🟡
4. **Isochrones train vers grandes villes** — très parlant pour le collectif — 🟢
5. **Radon IRSN** — 2 min à ajouter, critère santé réel — 🟢
6. **RGA (argiles) Géorisques** — critique pour un achat — 🟢
7. **Arrêtés sécheresse Propluvia** — 🟢
8. **Normales climat Météo-France** (T°, pluie, soleil) — 🟡
