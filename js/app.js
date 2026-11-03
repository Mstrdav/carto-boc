// Carto BOC: each person shares 100 points between criteria, every commune gets a score.
// COMMUNES comes from data/communes.js, one row per commune:
// [name, postal code, lat, lon, [score 0-100 per criterion], [raw value per criterion], 1 if the price is estimated]

// same order as CRITERIA in build/build.py
var CRITERIA = [
  { id: "gare", label: "Gare proche", unit: "km" },
  { id: "ville", label: "Grande ville proche (100 000 hab.)", unit: "km" },
  { id: "medecin", label: "Médecin généraliste proche", unit: "km" },
  { id: "supermarche", label: "Supermarché proche", unit: "km" },
  { id: "fibre", label: "Fibre", unit: "% des logements" },
  { id: "mer", label: "Mer proche", unit: "km" },
  { id: "foret", label: "Forêts et nature", unit: "% de la commune" },
  { id: "prix", label: "Prix bas", unit: "€/m²" },
  { id: "taxe", label: "Taxe foncière basse", unit: "%" },
  { id: "population", label: "Village qui grandit (2012-2023)", unit: "%" },
  { id: "sismique", label: "Peu de risque sismique", unit: "zone /5" },
  { id: "radon", label: "Peu de radon", unit: "classe /3" },
  { id: "inondation", label: "Peu d'inondations", unit: "arrêtés CatNat" },
  { id: "secheresse", label: "Peu de sécheresses (argiles)", unit: "arrêtés CatNat" },
  { id: "feu", label: "Pas de risque de feu de forêt", unit: "", yesno: true },
  { id: "industrie", label: "Pas de risque industriel ou nucléaire", unit: "", yesno: true },
  { id: "chaleur", label: "Peu de jours > 30°C", unit: "jours/an" },
  { id: "gel", label: "Peu de jours de gel", unit: "jours/an" },
];

var points = {};      // my points, e.g. { gare: 20, prix: 40 }
var group = null;     // summed points of the group, or null
var scores = [];      // score of each commune, same order as COMMUNES

// ---------- map ----------

var map = L.map("map").setView([46.6, 2.4], 6);
L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
  attribution: "© Esri, OpenStreetMap", maxZoom: 16,
}).addTo(map);

// position of each commune in map pixels at zoom 0, computed once
for (var i = 0; i < COMMUNES.length; i++) {
  var p = map.project([COMMUNES[i][2], COMMUNES[i][3]], 0);
  COMMUNES[i].x = p.x;
  COMMUNES[i].y = p.y;
}

// the canvas lives inside the map, so Leaflet moves and zooms it together with the tiles
var canvas = document.getElementById("dots");
canvas.className = "leaflet-zoom-animated";
map.getPane("overlayPane").appendChild(canvas);
var ctx = canvas.getContext("2d");
var canvasCorner;  // map position of the canvas top left corner

// screen position of every commune, recomputed after each move
function placeAll() {
  var scale = Math.pow(2, map.getZoom());
  var topLeft = map.getPixelBounds().min;
  for (var i = 0; i < COMMUNES.length; i++) {
    COMMUNES[i].sx = COMMUNES[i].x * scale - topLeft.x;
    COMMUNES[i].sy = COMMUNES[i].y * scale - topLeft.y;
  }
}

function draw() {
  var size = map.getSize();
  if (canvas.width != size.x || canvas.height != size.y) {
    canvas.width = size.x;
    canvas.height = size.y;
  }
  ctx.clearRect(0, 0, size.x, size.y);
  L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]));
  canvasCorner = map.containerPointToLatLng([0, 0]);
  placeAll();
  var melted = document.getElementById("melt").checked;
  canvas.style.opacity = melted ? 0.55 : 1;  // see-through cells, the map stays readable
  if (melted) {
    drawCells(size);
    return;
  }
  var r = map.getZoom() < 8 ? 2 : 4;
  for (var i = 0; i < COMMUNES.length; i++) {
    var c = COMMUNES[i];
    if (c.sx < 0 || c.sy < 0 || c.sx > size.x || c.sy > size.y) continue;
    ctx.fillStyle = c.color;
    ctx.fillRect(c.sx - r / 2, c.sy - r / 2, r, r);
  }
}
map.on("move zoom resize", draw);

// ---------- melt view: mean score on a grid of about 17 km cells ----------

var CELL_LAT = 0.15, CELL_LON = 0.2;
var cells = [];  // { x0, y0, x1, y1 (map pixels at zoom 0), sum, n, color }

// put each commune in its cell, once
var cellOf = {};
for (var i = 0; i < COMMUNES.length; i++) {
  var row = Math.floor(COMMUNES[i][2] / CELL_LAT), col = Math.floor(COMMUNES[i][3] / CELL_LON);
  var key = row + "," + col;
  if (cellOf[key] == null) {
    var a = map.project([(row + 1) * CELL_LAT, col * CELL_LON], 0);
    var b = map.project([row * CELL_LAT, (col + 1) * CELL_LON], 0);
    cellOf[key] = cells.length;
    cells.push({ x0: a.x, y0: a.y, x1: b.x, y1: b.y });
  }
  COMMUNES[i].cell = cellOf[key];
}

// mean score of each cell, red to green between the worst and the best cell
function melt() {
  cells.forEach(function (c) { c.sum = 0; c.n = 0; });
  for (var i = 0; i < COMMUNES.length; i++) {
    cells[COMMUNES[i].cell].sum += scores[i];
    cells[COMMUNES[i].cell].n++;
  }
  var min = 100, max = 0;
  cells.forEach(function (c) {
    c.mean = c.sum / c.n;
    min = Math.min(min, c.mean);
    max = Math.max(max, c.mean);
  });
  cells.forEach(function (c) {
    var t = (c.mean - min) / Math.max(1, max - min);
    c.color = "hsl(" + Math.round(t * 120) + ", 70%, 45%)";
  });
}

function drawCells(size) {
  var scale = Math.pow(2, map.getZoom());
  var topLeft = map.getPixelBounds().min;
  cells.forEach(function (c) {
    var x0 = Math.floor(c.x0 * scale - topLeft.x), y0 = Math.floor(c.y0 * scale - topLeft.y);
    var x1 = Math.ceil(c.x1 * scale - topLeft.x), y1 = Math.ceil(c.y1 * scale - topLeft.y);
    if (x1 < 0 || y1 < 0 || x0 > size.x || y0 > size.y) return;
    ctx.fillStyle = c.color;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  });
}

document.getElementById("melt").onchange = draw;

// during the zoom animation, stretch the drawn canvas like the tiles, then redraw at the end
map.on("zoomanim", function (e) {
  var corner = map._latLngToNewLayerPoint(canvasCorner, e.zoom, e.center);
  L.DomUtil.setTransform(canvas, corner, map.getZoomScale(e.zoom));
});

// commune under the mouse (nearest within 8 px), or null
function communeAt(x, y) {
  var best = null;
  var bestDist = 64;
  for (var i = 0; i < COMMUNES.length; i++) {
    var dx = COMMUNES[i].sx - x, dy = COMMUNES[i].sy - y;
    var d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

var tip = document.getElementById("tip");
map.on("mousemove", function (e) {
  var i = communeAt(e.containerPoint.x, e.containerPoint.y);
  if (i == null) {
    tip.style.display = "none";
    return;
  }
  tip.innerHTML = COMMUNES[i][0] + " : <b>" + scores[i] + "</b>/100";
  tip.style.display = "block";
  tip.style.left = e.originalEvent.clientX + 12 + "px";
  tip.style.top = e.originalEvent.clientY + "px";
});
map.on("mouseout", function () { tip.style.display = "none"; });
map.on("click", function (e) {
  var i = communeAt(e.containerPoint.x, e.containerPoint.y);
  if (i != null) showCommune(i, false);
});

// ---------- popup with details and listing links ----------

function slug(text) {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-");
}

function showCommune(i, zoom) {
  var c = COMMUNES[i];
  var name = c[0], cp = c[1];
  var html = "<div class='popup'><b>" + name + "</b> (" + cp + ") : <b>" + scores[i] + "/100</b><table>";
  for (var k = 0; k < CRITERIA.length; k++) {
    var raw = c[5][k] == null ? "?" : c[5][k].toLocaleString("fr-FR");
    if (CRITERIA[k].id == "prix" && c[6]) raw = "~" + raw;  // no sale here, mean of the communes around
    if (CRITERIA[k].yesno) raw = c[5][k] ? "risque" : "non";
    html += "<tr><td>" + CRITERIA[k].label + "</td><td>" + raw + " " + CRITERIA[k].unit + "</td><td>" + c[4][k] + "/100</td></tr>";
  }
  var google = "https://www.google.com/search?q=" + encodeURIComponent("maison à vendre " + name + " " + cp + " site:");
  html += "</table>Annonces : " +
    "<a target='_blank' href='https://www.leboncoin.fr/recherche?category=9&real_estate_type=1&locations=" + encodeURIComponent(name + "_" + cp) + "'>Leboncoin</a>" +
    "<a target='_blank' href='https://www.bienici.com/recherche/achat/" + slug(name) + "-" + cp + "/maisonvilla'>Bien'ici</a>" +
    "<a target='_blank' href='" + google + "seloger.com'>SeLoger</a>" +
    "<a target='_blank' href='" + google + "pap.fr'>PAP</a></div>";
  if (zoom) map.setView([c[2], c[3]], 11);
  L.popup().setLatLng([c[2], c[3]]).setContent(html).openOn(map);
  document.getElementById("panel").classList.remove("open");
}

// ---------- scores and colours ----------

function update() {
  var weights = group || points;
  var total = 0;
  for (var id in weights) total += weights[id];

  // score = weighted harmonic mean of the criterion scores (equal weights when no point is given):
  // a bad score on an important criterion pulls the total down hard, good ones elsewhere can't make up for it
  var min = 100, max = 0;
  for (var i = 0; i < COMMUNES.length; i++) {
    var sum = 0;
    for (var k = 0; k < CRITERIA.length; k++) {
      var w = total > 0 ? (weights[CRITERIA[k].id] || 0) / total : 1 / CRITERIA.length;
      sum += w / Math.max(1, COMMUNES[i][4][k]);  // 1 instead of 0, no division by 0
    }
    scores[i] = Math.round(1 / sum);
    if (scores[i] < min) min = scores[i];
    if (scores[i] > max) max = scores[i];
  }

  // red (worst) to green (best), stretched between min and max
  for (var i = 0; i < COMMUNES.length; i++) {
    var t = (scores[i] - min) / Math.max(1, max - min);
    COMMUNES[i].color = "hsl(" + Math.round(t * 120) + ", 70%, 45%)";
  }
  melt();
  draw();
  showTop();
}

function showTop() {
  var order = COMMUNES.map(function (c, i) { return i; });
  order.sort(function (a, b) { return scores[b] - scores[a]; });
  var html = "";
  for (var j = 0; j < 15; j++) {
    var i = order[j];
    html += "<li onclick='showCommune(" + i + ", true)'>" + COMMUNES[i][0] + " (" + COMMUNES[i][1] + ") " + scores[i] + "/100</li>";
  }
  document.getElementById("top").innerHTML = html;
}

// ---------- sliders (100 points) ----------

function used(except) {
  var sum = 0;
  for (var id in points) if (id != except) sum += points[id];
  return sum;
}

function showSliders() {
  var html = "";
  CRITERIA.forEach(function (c) {
    var v = points[c.id] || 0;
    html += "<div class='slider'><label>" + c.label + " <b id='v-" + c.id + "'>" + v + "</b></label>" +
      "<input type='range' min='0' max='100' value='" + v + "' oninput='setPoints(\"" + c.id + "\", this)'></div>";
  });
  document.getElementById("sliders").innerHTML = html;
  document.getElementById("left").textContent = 100 - used();
}

function setPoints(id, input) {
  var v = Math.min(+input.value, 100 - used(id));  // never more than 100 in total
  input.value = v;
  points[id] = v;
  document.getElementById("v-" + id).textContent = v;
  document.getElementById("left").textContent = 100 - used();
  save();
  update();
}

// ---------- my link: #nom=Colin&gare=20&prix=40 ----------

function save() {
  var params = new URLSearchParams();
  if (document.getElementById("nom").value) params.set("nom", document.getElementById("nom").value);
  for (var id in points) if (points[id] > 0) params.set(id, points[id]);
  history.replaceState(null, "", "#" + params.toString());
  localStorage.setItem("carto", location.hash);
}

// reads a link (or a hash) into { nom, points }
function readLink(link) {
  var params = new URLSearchParams(link.split("#")[1] || "");
  var pts = {};
  CRITERIA.forEach(function (c) {
    if (params.get(c.id)) pts[c.id] = +params.get(c.id);
  });
  return { nom: params.get("nom") || "?", points: pts };
}

document.getElementById("nom").oninput = save;

document.getElementById("copy").onclick = function () {
  navigator.clipboard.writeText(location.href);
  document.getElementById("status").textContent = "Lien copié, envoie-le au groupe.";
};

document.getElementById("reset").onclick = function () {
  points = {};
  showSliders();
  save();
  update();
};

// ---------- group: sum of everyone's points ----------

document.getElementById("group-open").onclick = function () {
  var form = document.getElementById("group-form");
  form.hidden = !form.hidden;
};

document.getElementById("group-go").onclick = function () {
  var lines = document.getElementById("links").value.split("\n");
  var names = [];
  group = {};
  lines.forEach(function (line) {
    if (line.indexOf("#") < 0) return;
    var person = readLink(line);
    names.push(person.nom);
    for (var id in person.points) group[id] = (group[id] || 0) + person.points[id];
  });
  if (names.length == 0) {
    group = null;
    document.getElementById("status").textContent = "Aucun lien trouvé.";
    return;
  }
  document.getElementById("group-names").textContent = names.join(", ");
  document.getElementById("group-box").hidden = false;
  document.getElementById("group-form").hidden = true;
  update();
};

document.getElementById("group-leave").onclick = function () {
  group = null;
  document.getElementById("group-box").hidden = true;
  update();
};

// ---------- search and phone menu ----------

document.getElementById("search").oninput = function () {
  var q = this.value.toLowerCase();
  var html = "";
  var found = 0;
  for (var i = 0; i < COMMUNES.length && q.length >= 2 && found < 8; i++) {
    if (COMMUNES[i][0].toLowerCase().indexOf(q) >= 0) {
      html += "<li onclick='showCommune(" + i + ", true)'>" + COMMUNES[i][0] + " (" + COMMUNES[i][1] + ")</li>";
      found++;
    }
  }
  document.getElementById("results").innerHTML = html;
};

document.getElementById("menu").onclick = function () {
  document.getElementById("panel").classList.toggle("open");
};

// ---------- start: the link first, else what was saved last time ----------

var start = readLink(location.hash ? location.hash : localStorage.getItem("carto") || "");
points = start.points;
document.getElementById("nom").value = start.nom == "?" ? "" : start.nom;
showSliders();
save();
update();
