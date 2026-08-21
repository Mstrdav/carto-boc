/* Suite de tests carto-boc — `node build/test_carto.js`
 * Couvre : score.js (moteur de score), io.js (export/import/agrégation),
 * format.js (formatage des valeurs de popup). Style minimal : check(), compteur
 * PASS/FAIL, exit 1 si au moins un FAIL. Ne touche pas aux self-checks internes.
 */
"use strict";

let pass = 0, fail = 0;
function check(cond, label) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else { fail++; console.error("  FAIL  " + label); }
}
function eq(actual, expected, label) {
  const ok = Object.is(actual, expected);
  check(ok, label + (ok ? "" : "  => attendu " + JSON.stringify(expected) + ", obtenu " + JSON.stringify(actual)));
}
function near(a, b, label) { check(Math.abs(a - b) < 1e-9, label + " (≈ " + a + ")"); }
function throws(fn, label) {
  let threw = false;
  try { fn(); } catch (e) { threw = true; }
  check(threw, label);
}

/* --- préparation : les modules sont des IIFE qui s'accrochent au global.
 * io.js se pose sur globalThis ; on mime `window` comme en navigateur. */
global.window = globalThis;

/* ---------- score.js ---------- */
console.log("\n[score.js]");
const Score = require("../js/score.js");

// normalisation des poids
near(Score.normalizeWeights({ a: 30, b: 10 }).a, 0.75, "normalize {a:30,b:10} -> a=0.75");
near(Score.normalizeWeights({ a: 30, b: 10 }).b, 0.25, "normalize {a:30,b:10} -> b=0.25");
{
  const nz = Score.normalizeWeights({ a: 0, b: 0 });
  check(nz.a === 0 && nz.b === 0, "somme nulle -> poids tous à 0");
}
near(Score.normalizeWeights({ a: -5, b: 5 }).a, 0, "poids négatif borné à 0");

// score d'une commune : un seul critère (poids déjà normalisés)
near(Score.scoreCommune({ x: 1.0 }, { x: 1 }), 1.0, "scoreCommune un critère saturé = 1");
near(Score.scoreCommune({ x: 0.0 }, { x: 1 }), 0.0, "scoreCommune un critère nul = 0");
near(Score.scoreCommune({}, { x: 1 }), 0.5, "valeur manquante -> neutre 0.5");

// score pondéré : moyenne pondérée (poids normalisés)
near(Score.scoreCommune({ x: 1.0, y: 0.0 }, Score.normalizeWeights({ x: 3, y: 1 })), 0.75, "moyenne pondérée x=1,y=0 (3:1) -> 0.75");
near(Score.scoreCommune({ x: 0.5, y: 0.5 }, Score.normalizeWeights({ x: 50, y: 50 })), 0.5, "poids égaux -> moyenne 0.5");

// classement + bornes
const communes = [
  { nom: "fort-x", v: { x: 1.0, y: 0.0 } },
  { nom: "fort-y", v: { x: 0.0, y: 1.0 } },
  { nom: "moyen", v: { x: 0.5, y: 0.5 } },
];
const rx = Score.rankCommunes(communes, { x: 100, y: 0 });
eq(rx.scored[0].ref, communes[0], "100% x -> fort-x en tête");
eq(rx.scored[2].ref, communes[1], "100% x -> fort-y dernier");
near(rx.min, 0.0, "bornes min = 0");
near(rx.max, 1.0, "bornes max = 1");
check(rx.scored[0].score >= rx.scored[1].score && rx.scored[1].score >= rx.scored[2].score, "tri décroissant");

// topK : sélection partielle
const rk = Score.rankCommunes(communes, { x: 100, y: 0 }, 2);
eq(rk.scored.length, 2, "topK=2 -> 2 résultats");
eq(rk.scored[0].ref, communes[0], "topK=2 -> meilleur conservé");

// direction : les valeurs sont déjà normalisées (1 = idéal), le moteur n'applique
// pas de direction ; on vérifie qu'un score plus haut = commune plus propice.
near(rx.scored[0].score, 1.0, "score max = 1.0 pour le meilleur");

/* ---------- io.js ---------- */
console.log("\n[io.js]");
require("../js/io.js");
const IO = global.IO;
const ids = new Set(["gare", "mer", "sismique", "prix", "pollution"]);

// parsePerson : cas nominal
const p = IO.parsePerson({ prenom: "Colin", poids: { gare: 20, prix: 40 } }, ids);
eq(p.prenom, "Colin", "parsePerson lit le prénom");
eq(p.poids.gare, 20, "parsePerson lit gare=20");
eq(p.poids.prix, 40, "parsePerson lit prix=40");
eq(p.warnings.length, 0, "parsePerson sans warning");

// parsePerson : structure invalide -> throw
throws(() => IO.parsePerson({}, ids), "parsePerson sans 'poids' -> throw");
throws(() => IO.parsePerson(null, ids), "parsePerson null -> throw");

// parsePerson : critère inconnu + poids invalide -> warnings + ignorés
const p2 = IO.parsePerson({ prenom: "X", poids: { gare: 10, inconnu: 99, prix: -5, mer: "abc" } }, ids);
eq(p2.poids.gare, 10, "critère valide conservé");
check(!("inconnu" in p2.poids), "critère inconnu ignoré");
check(!("prix" in p2.poids), "poids négatif ignoré");
check(!("mer" in p2.poids), "poids non numérique ignoré");
check(p2.warnings.length === 3, "3 warnings émis (inconnu, négatif, non-num)");

// aggregate : somme des points de 2 participants
const agg = IO.aggregate([
  { prenom: "Colin", poids: { gare: 20, prix: 40 } },
  { prenom: "Marie", poids: { gare: 30, mer: 10, prix: 20 } },
]);
eq(agg.poids.gare, 50, "agrégation gare = 20+30 = 50");
eq(agg.poids.prix, 60, "agrégation prix = 40+20 = 60");
eq(agg.poids.mer, 10, "agrégation mer = 10");
eq(agg.names.join(","), "Colin,Marie", "agrégation noms dans l'ordre");

/* ---------- format.js ---------- */
console.log("\n[format.js]");
const Format = require("../js/format.js");

// score100
eq(Format.score100(0.5), 50, "score100(0.5) = 50");
eq(Format.score100(0), 0, "score100(0) = 0");
eq(Format.score100(null), 0, "score100(null) = 0");
eq(Format.score100(undefined), 0, "score100(undefined) = 0");
eq(Format.score100(0.996), 100, "score100(0.996) arrondi = 100");

// fmtRaw : distances
eq(Format.fmtRaw({ id: "gare" }, 0.8), "0,8 km", "gare 0.8 -> '0,8 km'");
eq(Format.fmtRaw({ id: "gare" }, 12), "12 km", "gare 12 -> '12 km' (entier)");
eq(Format.fmtRaw({ id: "mer" }, 8.7), "8,7 km", "mer 8.7 -> '8,7 km'");

// fmtRaw : prix (séparateur de milliers espace fine insécable U+202F)
eq(Format.fmtRaw({ id: "prix" }, 2150), "2\u202f150 €/m²", "prix 2150 -> '2 150 €/m²'");

// fmtRaw : sismique / pollution
eq(Format.fmtRaw({ id: "sismique" }, 3), "zone 3 / 5", "sismique 3 -> 'zone 3 / 5'");
eq(Format.fmtRaw({ id: "pollution" }, 25.42), "indice 25,4", "pollution 25.42 -> 'indice 25,4' (1 décimale)");

// fmtRaw : valeurs absentes / non numériques
eq(Format.fmtRaw({ id: "prix" }, null), "—", "raw null -> '—'");
eq(Format.fmtRaw({ id: "prix" }, ""), "—", "raw vide -> '—'");
eq(Format.fmtRaw({ id: "prix" }, "abc"), "—", "raw non numérique -> '—'");

// fmtRaw : critère générique avec unité
eq(Format.fmtRaw({ id: "altitude", unit: "m" }, 1234.5), "1\u202f234,5 m", "critère générique unité m");

/* ---------- bilan ---------- */
console.log("\n" + pass + " PASS, " + fail + " FAIL");
if (fail > 0) {
  console.error("ÉCHEC : " + fail + " test(s) en échec.");
  process.exit(1);
}
console.log("OK — tous les tests passent.");
