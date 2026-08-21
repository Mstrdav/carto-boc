/* Export / import des répartitions + agrégation collective.
 * Format d'échange (un fichier par personne) :
 *   { "prenom":"Colin", "date":"2026-07-23", "poids": { "gare":20, "prix":40, ... } }
 */
(function (global) {
  "use strict";

  function todayISO() { return new Date().toISOString().slice(0, 10); }

  // déclenche le téléchargement de carto-<prenom>.json
  function exportWeights(prenom, weights) {
    var payload = { prenom: prenom || "anonyme", date: todayISO(), poids: weights };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "carto-" + (prenom || "anonyme").trim().replace(/\s+/g, "_").toLowerCase() + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  // valide un objet importé. validIds = Set des critères connus. Renvoie {prenom, poids, warnings}.
  function parsePerson(obj, validIds) {
    if (!obj || typeof obj !== "object" || !obj.poids || typeof obj.poids !== "object")
      throw new Error("format invalide (champ 'poids' manquant)");
    var warnings = [];
    var poids = {};
    for (var id in obj.poids) {
      var val = +obj.poids[id];
      if (!validIds.has(id)) { warnings.push("critère inconnu ignoré : " + id); continue; }
      if (!isFinite(val) || val < 0) { warnings.push("poids invalide ignoré : " + id); continue; }
      poids[id] = val;
    }
    return { prenom: (obj.prenom || "anonyme").toString(), poids: poids, warnings: warnings };
  }

  // agrège plusieurs personnes : SOMME des points par critère -> poids collectifs.
  function aggregate(persons) {
    var totals = {};
    var names = [];
    persons.forEach(function (p) {
      names.push(p.prenom);
      for (var id in p.poids) totals[id] = (totals[id] || 0) + p.poids[id];
    });
    return { poids: totals, names: names };
  }

  // lit une liste de File (input type=file multiple) -> Promise<Array<person>>.
  function readFiles(fileList, validIds) {
    var files = Array.prototype.slice.call(fileList);
    return Promise.all(files.map(function (file) {
      return file.text().then(function (txt) {
        return parsePerson(JSON.parse(txt), validIds);
      }).catch(function (e) {
        throw new Error(file.name + " : " + e.message);
      });
    }));
  }

  global.IO = {
    exportWeights: exportWeights,
    parsePerson: parsePerson,
    aggregate: aggregate,
    readFiles: readFiles,
  };
})(typeof window !== "undefined" ? window : globalThis);
