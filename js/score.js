/* Moteur de score : pondération + classement. Pur, sans dépendance.
 * Utilisable dans le navigateur (window.Score) ET sous Node (self-check : `node js/score.js`).
 *
 * Les valeurs `commune.v[id]` sont déjà normalisées dans [0,1], 1 = idéal
 * (direction appliquée à la préparation des données). Le score est donc une
 * simple moyenne pondérée : plus c'est haut, plus la commune est propice.
 */
(function (global) {
  "use strict";

  // poids bruts (points) -> poids normalisés sommant à 1. Somme nulle -> tout à 0.
  function normalizeWeights(weights) {
    var total = 0;
    for (var k in weights) total += Math.max(0, +weights[k] || 0);
    var out = {};
    for (var id in weights) out[id] = total > 0 ? Math.max(0, +weights[id] || 0) / total : 0;
    return out;
  }

  // score d'une commune = Σ poids_norm · valeur. Valeur absente -> 0.5 (neutre).
  function scoreCommune(v, wnorm) {
    var s = 0;
    for (var id in wnorm) {
      var val = v && v[id] != null ? v[id] : 0.5;
      s += wnorm[id] * val;
    }
    return s;
  }

  // classe les communes ; renvoie un tableau {ref, score} trié décroissant + bornes.
  // topK optionnel : ne renvoie QUE les topK meilleures, via une sélection
  // partielle O(n·k) (évite le tri complet, coûteux à 35k communes).
  function rankCommunes(communes, weights, topK) {
    var wnorm = normalizeWeights(weights);
    var n = communes.length;
    var min = Infinity, max = -Infinity;
    var out = new Array(n);
    for (var i = 0; i < n; i++) {
      var s = scoreCommune(communes[i].v, wnorm);
      out[i] = { ref: communes[i], score: s };
      if (s < min) min = s;
      if (s > max) max = s;
    }
    if (topK && topK < n) {
      // sélection : tableau de taille topK, on remplace son minimum si on
      // trouve mieux. O(n·k), aucun tri pendant la boucle.
      var heap = out.slice(0, topK);
      for (i = topK; i < n; i++) {
        var it = out[i];
        var wi = 0;
        for (var j = 1; j < topK; j++) if (heap[j].score < heap[wi].score) wi = j;
        if (it.score > heap[wi].score) heap[wi] = it;
      }
      heap.sort(function (a, b) { return b.score - a.score; });
      out = heap;
    } else {
      out.sort(function (a, b) { return b.score - a.score; });
    }
    return { scored: out, min: min, max: max };
  }

  var Score = { normalizeWeights: normalizeWeights, scoreCommune: scoreCommune, rankCommunes: rankCommunes };

  if (typeof module !== "undefined" && module.exports) module.exports = Score;
  else global.Score = Score;

  // --- self-check (n'exécute qu'avec `node js/score.js`) ---
  if (typeof require !== "undefined" && require.main === module) {
    var assert = require("assert");
    var near = function (a, b) { return Math.abs(a - b) < 1e-9; };

    // poids normalisés
    assert(near(normalizeWeights({ a: 30, b: 10 }).a, 0.75), "normalize");
    assert.deepStrictEqual(normalizeWeights({ a: 0, b: 0 }), { a: 0, b: 0 }, "somme nulle -> 0");
    assert(near(normalizeWeights({ a: -5, b: 5 }).a, 0), "poids négatif borné à 0");

    var communes = [
      { v: { x: 1.0, y: 0.0 } },  // fort en x
      { v: { x: 0.0, y: 1.0 } },  // fort en y
      { v: { x: 0.5, y: 0.5 } },  // moyen
    ];

    // poids 100% sur x -> classement = valeur x : commune 0 en tête, commune 1 dernière
    var rx = rankCommunes(communes, { x: 100, y: 0 });
    assert.strictEqual(rx.scored[0].ref, communes[0], "100% x -> commune x en tête");
    assert.strictEqual(rx.scored[2].ref, communes[1], "100% x -> commune y dernière");

    // poids uniforme -> score = moyenne (x+y)/2 = 0.5 pour les trois -> ex aequo
    var ru = rankCommunes(communes, { x: 50, y: 50 });
    assert(near(ru.scored[0].score, 0.5) && near(ru.scored[2].score, 0.5), "uniforme -> moyenne");

    // valeur manquante traitée en neutre 0.5
    assert(near(scoreCommune({}, { x: 1 }), 0.5), "valeur manquante -> 0.5");

    console.log("score.js self-check OK");
  }
})(typeof window !== "undefined" ? window : globalThis);
