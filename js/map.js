/* Living Museum of Beijing — map page.
   Photo markers on a Beijing-locked map, filtered by year layers.
   Basemap provider comes from tiles.js (LM_tileLayer). */
(function () {
  "use strict";

  // Historical era overlays, XYZ tiles. Live: MapWarper map 54747 "Peking 1914"
  // (warped city-core sheet, tiles verified 2026-11-04). Dorn 1936 exists on the
  // David Rumsey Collection; wire it after georeferencing (project references.md).
  const ERAS = [
    {
      id: "peking1914",
      name: "Peking, 1914",
      nameZh: "北京 · 1914",
      tileUrl: "https://mapwarper.net/maps/tile/54747/{z}/{x}/{y}.png",
      attribution: "Peking 1914, via MapWarper"
    },
    { id: "dorn", name: "Frank Dorn's Peiping, 1936", nameZh: "老北京风俗地图 · 1936", tileUrl: null }
  ];

  const BEIJING_BOUNDS = [[39.4, 115.4], [41.0, 117.5]];

  let map, cluster, entries = [], filter = "all", playTimer = null;
  const eraLayers = new Map();

  function decadeKey(year) {
    if (year < 1900) return "pre";
    return String(Math.floor(year / 10) * 10);
  }

  function bucketOrder(entries) {
    const keys = new Set(entries.map(function (e) { return decadeKey(e.year); }));
    const order = [];
    if (keys.has("pre")) order.push("pre");
    for (let d = 1900; d <= 2020; d += 10) if (keys.has(String(d))) order.push(String(d));
    return order;
  }

  function bucketLabel(key) {
    if (key === "pre") return LM.t("pre-1900");
    return key + "s";
  }

  function initMap() {
    map = L.map("map", {
      center: [39.906, 116.397],
      zoom: 12,
      minZoom: 10,
      maxZoom: 18,
      zoomControl: false,
      maxBounds: BEIJING_BOUNDS,
      maxBoundsViscosity: 0.8
    });
    LM_tileLayer(L).addTo(map);
    L.control.zoom({ position: "topright" }).addTo(map);
    map.attributionControl.setPosition("bottomleft");

    cluster = L.markerClusterGroup({
      maxClusterRadius: 56,
      disableClusteringAtZoom: 15,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      iconCreateFunction: function (c) {
        const n = c.getChildCount();
        return L.divIcon({
          html: '<div class="lm-cluster' + (n < 10 ? " small" : "") + '">' + n + "</div>",
          className: "",
          iconSize: n < 10 ? [32, 32] : [40, 40]
        });
      }
    });
    map.addLayer(cluster);
    window.__lm_map = map; // test/QA handle
  }

  function markerFor(e) {
    const icon = L.divIcon({
      html: '<div class="pm"><img src="' + e.thumb + '" loading="lazy" alt=""></div>',
      className: "",
      iconSize: [46, 46],
      iconAnchor: [23, 23]
    });
    const m = L.marker([e.lat, e.lng], { icon: icon, riseOnHover: true });
    m.on("click", function () { showDetail(e); });
    return m;
  }

  function visibleEntries() {
    if (filter === "all") return entries;
    return entries.filter(function (e) { return decadeKey(e.year) === filter; });
  }

  function rebuild() {
    cluster.clearLayers();
    const vis = visibleEntries();
    const marks = vis.map(markerFor);
    cluster.addLayers(marks);
    document.getElementById("years-count").textContent = LM.t("count")(vis.length, entries.length);
  }

  function buildChips() {
    const wrap = document.getElementById("decade-chips");
    wrap.innerHTML = "";
    const mk = function (key, label) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip" + (filter === key ? " on" : "");
      b.textContent = label;
      b.addEventListener("click", function () { setFilter(key); });
      wrap.appendChild(b);
    };
    mk("all", LM.t("all"));
    bucketOrder(entries).forEach(function (k) { mk(k, bucketLabel(k)); });
  }

  function setFilter(key, opts) {
    filter = key;
    buildChips();
    const order = bucketOrder(entries);
    const slider = document.getElementById("decade-slider");
    if (key !== "all") {
      const idx = order.indexOf(key);
      if (idx >= 0) { slider.value = String(idx); updateSliderFill(slider); }
    }
    if (!(opts && opts.fromPlay)) stopPlay();
    rebuild();
  }

  function updateSliderFill(slider) {
    const max = Number(slider.max) || 1;
    slider.style.setProperty("--fill", (Number(slider.value) / max * 100) + "%");
  }

  function stopPlay() {
    if (playTimer) {
      clearInterval(playTimer);
      playTimer = null;
      document.getElementById("play-btn").classList.remove("playing");
    }
  }

  function initControls() {
    const slider = document.getElementById("decade-slider");
    const order = bucketOrder(entries);
    slider.min = "0";
    slider.max = String(Math.max(1, order.length - 1));
    updateSliderFill(slider);
    slider.addEventListener("input", function () {
      updateSliderFill(slider);
      setFilter(order[Number(slider.value)], { fromPlay: true });
    });

    document.getElementById("play-btn").addEventListener("click", function () {
      if (playTimer) { stopPlay(); return; }
      const btn = this;
      btn.classList.add("playing");
      let i = order.indexOf(filter) + 1;
      playTimer = setInterval(function () {
        if (i >= order.length) { stopPlay(); return; }
        slider.value = String(i);
        updateSliderFill(slider);
        setFilter(order[i], { fromPlay: true });
        i += 1;
      }, 1500);
    });

    buildChips();
    rebuild();
  }

  // ---------- detail panel ----------

  let hintHidden = false;
  function showDetail(e) {
    const panel = document.getElementById("detail-panel");
    document.getElementById("detail-photo").src = e.photo;
    document.getElementById("detail-photo").alt = e.title;
    document.getElementById("detail-photo-link").href = e.photo;
    document.getElementById("detail-year").textContent = e.year;
    document.getElementById("detail-title").textContent = e.title;
    document.getElementById("detail-story").textContent = e.story;
    const creditEl = document.getElementById("detail-credit");
    creditEl.textContent = e.credit
      ? LM.t("credit-prefix") + " · " + e.credit
      : "";
    panel.hidden = false;
    if (!hintHidden) {
      hintHidden = true;
      document.getElementById("map-hint").classList.add("hide");
    }
  }

  function initDetail() {
    document.getElementById("detail-close").addEventListener("click", function () {
      document.getElementById("detail-panel").hidden = true;
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") document.getElementById("detail-panel").hidden = true;
    });
  }

  // ---------- era overlays ----------

  function initEras() {
    const wrap = document.getElementById("era-toggles");
    ERAS.forEach(function (era) {
      const row = document.createElement("div");
      row.className = "era-item";
      const name = document.createElement("span");
      name.className = "era-name";
      const label = document.createElement("span");
      label.textContent = LM.lang() === "zh" ? era.nameZh : era.name;
      name.appendChild(label);
      if (!era.tileUrl) {
        const s = document.createElement("small");
        s.setAttribute("data-i18n", "era-none");
        s.textContent = LM.t("era-none");
        name.appendChild(s);
      }
      const sw = document.createElement("label");
      sw.className = "switch";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.disabled = !era.tileUrl;
      input.addEventListener("change", function () { toggleEra(era, input.checked); });
      sw.appendChild(input);
      const track = document.createElement("span"); track.className = "track";
      const knob = document.createElement("span"); knob.className = "knob";
      sw.appendChild(track); sw.appendChild(knob);
      row.appendChild(name);
      row.appendChild(sw);
      wrap.appendChild(row);
    });
  }

  function toggleEra(era, on) {
    if (!era.tileUrl) return;
    if (on) {
      const layer = L.tileLayer(era.tileUrl, {
        opacity: 0.55, minZoom: 11, maxZoom: 18,
        attribution: era.attribution || ""
      });
      layer.addTo(map);
      eraLayers.set(era.id, layer);
    } else {
      const layer = eraLayers.get(era.id);
      if (layer) { map.removeLayer(layer); eraLayers.delete(era.id); }
    }
  }

  // ---------- boot ----------

  function boot() {
    initMap();
    initEras();
    initDetail();
    fetch("/api/entries")
      .then(function (r) {
        if (r.ok) return r.json();
        throw new Error("http " + r.status);
      })
      .catch(function () {
        // static snapshot (GitHub Pages): no backend, load the frozen data
        return fetch("entries.json").then(function (r) {
          if (!r.ok) throw new Error("no static data");
          return r.json();
        });
      })
      .then(function (data) {
        entries = data;
        initControls();
      })
      .catch(function () {
        document.getElementById("years-count").textContent = "—";
        document.getElementById("map-hint").textContent = "Could not load stories";
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
