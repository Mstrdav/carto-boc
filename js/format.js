/* Formatage des valeurs + scores — pur, sans dépendance.
 * Utilisable dans le navigateur (window.Format) ET sous Node (module.exports),
 * testé par build/test_carto.js. Extraites d'app.js pour être testables.
 */
(function (global) {
  "use strict";

  // score normalisé [0,1] -> entier /100 (0 si absent)
  function score100(s) {
    return Math.round((s == null ? 0 : s) * 100);
  }

  // formate une valeur brute selon le critère (distances, prix, zones…).
  // raw == null / "" / non numérique -> "—".
  function fmtRaw(cr, raw) {
    if (raw == null || raw === "") return "—";
    var n = +raw;
    if (!isFinite(n)) return "—";
    var fr = function (x, d) {
      return x.toLocaleString("fr-FR", {
        minimumFractionDigits: d || 0, maximumFractionDigits: d || 0,
      });
    };
    switch (cr.id) {
      case "gare":
      case "mer": return fr(n, n < 10 ? 1 : 0) + " km";
      case "sismique": return "zone " + fr(n) + " / 5";
      case "prix": return fr(n) + " €/m²";
      case "pollution": return "indice " + fr(n, 1);
      default: return fr(n, 1) + (cr.unit ? " " + cr.unit : "");
    }
  }

  var Format = { score100: score100, fmtRaw: fmtRaw };

  if (typeof module !== "undefined" && module.exports) module.exports = Format;
  else global.Format = Format;
})(typeof window !== "undefined" ? window : globalThis);
