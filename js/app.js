/* Carto boc — app principale.
 * Carte Leaflet + couche canvas custom pour les ~35k communes (bien plus fluide
 * que 35k circleMarker). Un seul canvas : redraw < 2 ms, hit-test par grille.
 * Lit window.CRITERIA / window.COMMUNES (globals fournis par data/*.js).
 */
(() => {
  "use strict";
  const CRITERIA = window.CRITERIA;
  const COMMUNES = window.COMMUNES;
  const TOP_N = 15;
  const CRS = L.CRS.EPSG3857;
  // rAF avec repli setTimeout : requis en headless/test, inoffensif en production
  const raf = window.requestAnimationFrame ? cb => requestAnimationFrame(cb) : cb => setTimeout(cb, 16);

  /* ---------- état ---------- */
  const weights = {};
  CRITERIA.forEach(c => (weights[c.id] = 0));
  // persistance des poids entre sessions (localStorage)
  const savePoids = () => localStorage.setItem("carto_poids", JSON.stringify(weights));

  /* ---------- carte ---------- */
  const map = L.map("map", { zoomControl: true }).setView([46.6, 2.4], 6);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: "© OpenStreetMap © CARTO", subdomains: "abcd", maxZoom: 19,
  }).addTo(map);

  /* ---------- couche points (canvas) ---------- */
  const Layer = L.Layer.extend({
    onAdd() {
      this._canvas = document.createElement("canvas");
      this._canvas.className = "pts";
      // dans overlayPane : le canvas suit le pan/zoom (transform CSS Leaflet),
      // et on ne redessine qu'au moveend/zoomend — fluide même en plein pan.
      this._map.getPanes().overlayPane.appendChild(this._canvas);
      this._ctx = this._canvas.getContext("2d");
      this._map.on("zoom viewreset", this._schedule, this);
      this._map.on("resize", () => { this._resize(); this._schedule(); });
      this._map.on("movestart", () => hideTip());
      this._map.on("moveend zoomend", () => { this._dirtyGrid = true; this._schedule(); });
      // grille de hit-test à construire dès le premier rendu (sinon survol/clic
      // inopérants tant qu'on n'a pas panné/zoomé).
      this._dirtyGrid = true;
      this._resize();
      this._schedule();
    },
    onRemove() {
      if (this._canvas.parentNode) this._canvas.parentNode.removeChild(this._canvas);
      this._map.off("move zoom resize viewreset", this._schedule, this);
    },
    _resize() {
      const dpr = window.devicePixelRatio || 1;
      const s = this._map.getSize();
      this._canvas.width = s.x * dpr;
      this._canvas.height = s.y * dpr;
      this._canvas.style.width = s.x + "px";
      this._canvas.style.height = s.y + "px";
      this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },
    _schedule() {
      if (this._pending) return;
      this._pending = true;
      raf(() => { this._pending = false; this._draw(); });
    },
    /* Dessine les points visibles. Coordonnées monde pré-calculées (x2 fois plus
     * rapide que latLngToContainerPoint par point à chaque frame). */
    _draw() {
      const map = this._map;
      const s = map.getSize();
      // latLngToPoint(latlng, 0) est déjà dans un monde de 256 px : ×2^zoom suffit
      const scale = Math.pow(2, map.getZoom());
      const o = map.getPixelOrigin();
      const ctx = this._ctx;
      const n = COMMUNES.length;
      let r = 2.2;
      if (map.getZoom() < 7) r = 1.6;
      ctx.clearRect(0, 0, s.x, s.y);
      for (let i = 0; i < n; i++) {
        const c = COMMUNES[i];
        const x = c._wx * scale - o.x;
        const y = c._wy * scale - o.y;
        if (x < -r || y < -r || x > s.x + r || y > s.y + r) continue;
        ctx.fillStyle = c._color;
        ctx.fillRect(x - r / 2, y - r / 2, r, r);
      }
      if (this._dirtyGrid) { this._dirtyGrid = false; buildGrid(r); }
    },
  });
  // pré-projection monde (zoom 0) : fait une fois, rend le draw trivial.
  // Doit se faire AVANT addTo(map) pour que le premier draw soit correct.
  for (let i = 0; i < COMMUNES.length; i++) {
    const c = COMMUNES[i];
    const p = CRS.latLngToPoint(L.latLng(c.lat, c.lon), 0);
    c._wx = p.x; c._wy = p.y;
  }
  const points = new Layer().addTo(map);

  /* ---------- grille spatiale (hit-test) ---------- */
  let grid = new Map();
  const CELL = 24;
  function buildGrid() {
    grid = new Map();
    const scale = Math.pow(2, map.getZoom());
    const o = map.getPixelOrigin();
    for (let i = 0; i < COMMUNES.length; i++) {
      const c = COMMUNES[i];
      const x = Math.round(c._wx * scale - o.x);
      const y = Math.round(c._wy * scale - o.y);
      const k = (x / CELL | 0) + "," + (y / CELL | 0);
      const arr = grid.get(k);
      if (arr) arr.push([i, x, y]); else grid.set(k, [[i, x, y]]);
    }
  }
  function hitTest(px, py, maxDist) {
    const cx = px / CELL | 0, cy = py / CELL | 0;
    let best = null, bd = maxDist * maxDist;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const arr = grid.get((cx + dx) + "," + (cy + dy));
      if (!arr) continue;
      for (const [i, x, y] of arr) {
        const d = (x - px) * (x - px) + (y - py) * (y - py);
        if (d < bd) { bd = d; best = COMMUNES[i]; }
      }
    }
    return best;
  }

  /* ---------- helpers d'affichage (délégués à js/format.js, testables) ---------- */
  const score100 = Format.score100;
  const fmtRaw = Format.fmtRaw;

  /* ---------- tooltip + popup ---------- */
  const tip = document.createElement("div");
  tip.className = "tip";
  document.querySelector("#map").appendChild(tip);
  function hideTip() { tip.style.display = "none"; }
  function showTip(c, px, py) {
    tip.innerHTML = "<b>" + c.nom + "</b> <span class='m'>" + c.insee +
      "</span><br>score <b>" + score100(c._score) + "</b>/100";
    tip.style.display = "block";
    tip.style.transform = "translate(" + (px + 12) + "px," + (py - 4) + "px)";
  }
  map.on("mousemove", e => {
    const c = hitTest(e.containerPoint.x, e.containerPoint.y, 7);
    if (c) showTip(c, e.containerPoint.x, e.containerPoint.y);
    else hideTip();
    map.getContainer().style.cursor = c ? "pointer" : "";
  });
  map.on("click", e => {
    const c = hitTest(e.containerPoint.x, e.containerPoint.y, 7);
    if (c) L.popup().setLatLng([c.lat, c.lon]).setContent(popupHtml(c)).openOn(map);
  });

  function popupHtml(c) {
    const rows = CRITERIA.map(cr => {
      const raw = c.raw && c.raw[cr.id] != null ? c.raw[cr.id] : null;
      const pct = Math.round((c.v[cr.id] || 0) * 100);
      return '<div class="pop-row"><span class="pop-lbl">' + cr.label + "</span>" +
        '<span class="pop-val">' + fmtRaw(cr, raw) + "</span>" +
        '<span class="pop-pct">' + pct + "/100</span></div>";
    }).join("");
    return '<div class="pop-head"><b>' + c.nom + '</b><span class="pop-insee">' +
      c.insee + '</span><span class="pop-score">' + score100(c._score) +
      "/100</span></div>" + rows;
  }

  /* ---------- score + couleurs ---------- */
  function hasWeight() { return Object.values(weights).some(v => v > 0); }
  function colorForPct(p) { return "hsl(" + (p * 120) + " 65% 48%)"; }
  // poids effectifs : si aucun point, on utilise des poids ÉGAUX (état initial
  // utile : la carte montre quand même les communes les plus propices).
  function effectiveWeights() {
    if (hasWeight()) return Score.normalizeWeights(weights);
    const w = {};
    CRITERIA.forEach(cr => (w[cr.id] = 1 / CRITERIA.length));
    return w;
  }

  const legendMinEl = document.getElementById("legend-min");
  const legendMaxEl = document.getElementById("legend-max");

  function recolor() {
    const any = hasWeight();
    const wnorm = effectiveWeights();
    // une seule passe : score + min/max + top-K (sélection, pas de tri global)
    let min = Infinity, max = -Infinity;
    const top = [];
    for (const c of COMMUNES) {
      const s = Score.scoreCommune(c.v, wnorm);
      c._score = s;
      if (s < min) min = s;
      if (s > max) max = s;
      if (top.length < TOP_N) {
        top.push(c);
      } else {
        // remplace le moins bon du top s'il est dépassé (scan O(TOP_N))
        let wi = 0;
        for (let j = 1; j < TOP_N; j++) if (top[j]._score < top[wi]._score) wi = j;
        if (s > top[wi]._score) top[wi] = c;
      }
    }
    const span = Math.max(1e-9, max - min);
    for (const c of COMMUNES) {
      c._color = colorForPct((c._score - min) / span);
    }
    top.sort((a, b) => b._score - a._score);
    renderTop(top, any);
    legendMinEl.textContent = score100(min) + "/100";
    legendMaxEl.textContent = score100(max) + "/100";
    points._schedule();
  }

  /* ---------- panneau critères (budget 100 pts) ---------- */
  const critBox = document.getElementById("criteria");
  CRITERIA.forEach(cr => {
    const el = document.createElement("div");
    el.className = "crit";
    el.innerHTML =
      '<div class="crit-head"><span class="crit-name">' + cr.label + "</span>" +
      '<input class="crit-val" type="number" min="0" max="100" step="1" value="0"></div>' +
      '<div class="crit-src">' + cr.source + "</div>" +
      '<input class="crit-range" type="range" min="0" max="100" step="1" value="0">';
    critBox.appendChild(el);
    const range = el.querySelector(".crit-range");
    const num = el.querySelector(".crit-val");
    const set = v => {
      v = clampToBudget(cr.id, Math.round(+v || 0));
      weights[cr.id] = v; range.value = v; num.value = v;
      updateBudget(); scheduleRecolor(); savePoids();
    };
    range.addEventListener("input", () => set(range.value));
    num.addEventListener("input", () => set(num.value));
    cr._els = { range, num };
  });

  function clampToBudget(id, v) {
    let others = 0;
    for (const k in weights) if (k !== id) others += weights[k];
    return Math.max(0, Math.min(v, 100 - others));
  }
  const remainingEl = document.getElementById("remaining");
  const budgetEl = document.getElementById("budget");
  const total = () => Object.values(weights).reduce((a, b) => a + b, 0);
  function updateBudget() {
    const r = 100 - total();
    remainingEl.textContent = r;
    budgetEl.classList.toggle("over", r <= 0);
  }

  let pending = false;
  function scheduleRecolor() {
    if (pending) return;
    pending = true;
    raf(() => { pending = false; recolor(); });
  }

  /* ---------- panneau mobile (repliable) ---------- */
  const panelEl = document.getElementById("panel");
  const scrimEl = document.getElementById("scrim");
  const toggleBtn = document.getElementById("panel-toggle");
  function openPanel() {
    panelEl.classList.add("open");
    scrimEl.classList.add("show");
    toggleBtn.setAttribute("aria-expanded", "true");
  }
  function closePanel() {
    panelEl.classList.remove("open");
    scrimEl.classList.remove("show");
    toggleBtn.setAttribute("aria-expanded", "false");
  }
  toggleBtn.addEventListener("click", () =>
    (panelEl.classList.contains("open") ? closePanel() : openPanel()));
  scrimEl.addEventListener("click", closePanel);

  /* ---------- liste top ---------- */
  const topList = document.getElementById("top-list");
  function renderTop(items, any) {
    topList.innerHTML = "";
    if (!any) {
      const h = document.createElement("li");
      h.className = "hint";
      h.textContent = "Poids égaux par défaut — répartis tes points pour personnaliser.";
      topList.appendChild(h);
    }
    items.forEach((c, j) => {
      const li = document.createElement("li");
      li.innerHTML = (j + 1) + ". " + c.nom + ' <span class="sc">' +
        score100(c._score) + "/100</span>";
      li.addEventListener("click", () => {
        closePanel();
        map.setView([c.lat, c.lon], 11);
        L.popup().setLatLng([c.lat, c.lon]).setContent(popupHtml(c)).openOn(map);
      });
      topList.appendChild(li);
    });
  }

  /* ---------- recherche de commune ---------- */
  const searchEl = document.getElementById("search");
  searchEl.addEventListener("input", () => {
    const q = searchEl.value.trim().toLowerCase();
    const box = document.getElementById("search-results");
    box.innerHTML = "";
    if (q.length < 2) return;
    let found = 0;
    for (const c of COMMUNES) {
      if (c.nom.toLowerCase().includes(q)) {
        const li = document.createElement("li");
        li.textContent = c.nom;
        li.addEventListener("click", () => {
          closePanel();
          map.setView([c.lat, c.lon], 12);
          L.popup().setLatLng([c.lat, c.lon]).setContent(popupHtml(c)).openOn(map);
          searchEl.value = ""; box.innerHTML = "";
        });
        box.appendChild(li);
        if (++found >= 8) break;
      }
    }
  });

  /* ---------- prénom + export / import / reset ---------- */
  const prenomEl = document.getElementById("prenom");
  prenomEl.value = localStorage.getItem("carto_prenom") || "";
  prenomEl.addEventListener("input", () => localStorage.setItem("carto_prenom", prenomEl.value));

  const statusEl = document.getElementById("status");
  const status = (msg, warn) => {
    statusEl.textContent = msg || "";
    statusEl.classList.toggle("warn", !!warn);
  };

  document.getElementById("btn-export").addEventListener("click", () => {
    if (total() === 0) { status("Attribue au moins un point avant d'exporter.", true); return; }
    IO.exportWeights(prenomEl.value.trim(), weights);
    status("Export téléchargé : carto-" + (prenomEl.value.trim() || "anonyme").toLowerCase() + ".json");
  });

  const validIds = new Set(CRITERIA.map(c => c.id));
  document.getElementById("file-import").addEventListener("change", e => {
    const files = e.target.files;
    if (!files.length) return;
    IO.readFiles(files, validIds).then(persons => {
      const agg = IO.aggregate(persons);
      applyWeights(agg.poids);
      const warns = persons.reduce((a, p) => a.concat(p.warnings), []);
      status("Agrégé : " + agg.names.join(", ") + (warns.length ? " ⚠ " + warns.join(" · ") : ""), warns.length > 0);
    }).catch(err => status("Import impossible : " + err.message, true));
    e.target.value = "";
  });

  document.getElementById("btn-reset").addEventListener("click", () => {
    applyWeights({}); status("");
  });

  function applyWeights(poids) {
    CRITERIA.forEach(cr => {
      const v = Math.max(0, Math.round(+poids[cr.id] || 0));
      weights[cr.id] = v;
      cr._els.range.value = Math.min(v, 100);
      cr._els.num.value = v;
    });
    updateBudget(); recolor();
  }

  /* ---------- démarrage ---------- */
  document.getElementById("loading").style.display = "none";
  updateBudget(); recolor();

  // persistance des poids entre sessions (localStorage)
  const saved = localStorage.getItem("carto_poids");
  if (saved) {
    try { applyWeights(JSON.parse(saved)); } catch (e) { /* ignore corrompu */ }
  }

  // poignée de debug (console du navigateur) :
  //  - window.__carto.hitTestAt(lat, lng) -> commune sous (lat,lng) (ou null), prouve
  //    que la grille de hit-test est opérationnelle dès le premier rendu (sans pan/zoom).
  //  - window.__carto.gridCellCount() -> nb de cellules de la grille (0 = pas encore construite).
  window.__carto = {
    map,
    points,
    draw: () => points._draw(),
    recolor,
    hitTestAt: (lat, lng) => {
      const p = map.latLngToContainerPoint([lat, lng]);
      return hitTest(p.x, p.y, 7);
    },
    gridCellCount: () => grid.size,
  };
})();
