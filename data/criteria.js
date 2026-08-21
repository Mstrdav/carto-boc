/* Registre des critères — pilote toute l'UI et le score.
 * Ajouter un critère = ajouter une entrée ici + remplir sa colonne dans
 * build/build_data.py (fonction main), puis relancer `python build/build_data.py`.
 * direction : "lower" = petite valeur = mieux ; "higher" = grande valeur = mieux.
 * (Info d'affichage : la normalisation direction est déjà appliquée dans les données.)
 */
window.CRITERIA = [
  { id: "gare",      label: "Proximité d'une gare", direction: "lower",  unit: "km",       source: "RÉEL — SNCF gares-de-voyageurs, distance centroïde→gare la plus proche" },
  { id: "mer",       label: "Proximité de la mer",  direction: "lower",  unit: "km",       source: "RÉEL — trait de côte Natural Earth, distance centroïde→côte" },
  { id: "sismique",  label: "Risque sismique",      direction: "lower",  unit: "zone 1-5", source: "PROXY — zonage approché par département, à raffiner" },
  { id: "prix",      label: "Prix du foncier",      direction: "lower",  unit: "€/m² est.", source: "PROXY — estimé (population + département), à remplacer par DVF" },
  { id: "pollution", label: "Qualité de l'air",     direction: "higher", unit: "indice",   source: "PROXY — inverse densité, à remplacer par indice ATMO réel" },
];
