/* Living Museum of Beijing — map page.
   Two data modes: "server" (FastAPI: viewport queries, aggregated dots at low
   zoom) and "static" (entries.json snapshot, everything client-side).
   Basemap provider comes from tiles.js (LM_tileLayer). */
(function () {
  "use strict";

  // Historical era overlays (registry for future layers). Adding a tileUrl
  // makes the era section appear; the section stays hidden while empty.
  // Next candidates: Rumsey "Map & Guide of Peking" 1914 (List 10959) and
  // Frank Dorn 1936, georeferenced once in Allmaps, tiles at
  // https://allmaps.org/maps/{id}/tiles/{z}/{x}/{y}.png. See references.md.
  const ERAS = [
    { id: "peking1914", name: "Peking, 1914", nameZh: "北京 · 1914", tileUrl: null },
    { id: "dorn", name: "Frank Dorn's Peiping, 1936", nameZh: "老北京风俗地图 · 1936", tileUrl: null }
  ];

  const BEIJING_BOUNDS = [[39.4, 115.4], [41.0, 117.5]];
  const PHOTO_ZOOM = 14;

  // mode: "server" | "static"
  const state = {
    mode: "static",
    filter: "all",
    theme: null,
    entries: [],        // static cache / current photo-mode results
    stats: { total: 0, decades: {}, tags: [] },
    taxonomy: [],       // [{key,en,zh}]
    reqId: 0,
    featured: null
  };

  let map, cluster, dotLayer;
  const eraLayers = new Map();

  function decadeKey(year) {
    if (year < 1900) return "pre";
    return String(Math.floor(year / 10) * 10);
  }

  function decadeRange(key) {
    if (key === "pre") return [1800, 1899];
    const start = Number(key);
    return [start, start + 9];
  }

  function bucketOrder() {
    const keys = state.stats.decades || {};
    const order = [];
    if (keys.pre) order.push("pre");
    for (let d = 1900; d <= 2020; d += 10) if (keys[String(d)]) order.push(String(d));
    return order;
  }

  function bucketLabel(key) {
    if (key === "pre") return LM.t("pre-1900");
    return key + "s";
  }

  function tagLabel(key) {
    const t = state.taxonomy.find(function (x) { return x.key === key; });
    if (!t) return key;
    return LM.lang() === "zh" ? t.zh : t.en;
  }

  function initMap() {
    map = L.map("map", {
      center: [39.9176, 116.3972], // the Forbidden City: the city's historic heart
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
    dotLayer = L.layerGroup().addTo(map);

    // Leaflet can swallow document-level clicks; close the share popover on map clicks too
    map.on("click", function () {
      document.getElementById("share-sheet").hidden = true;
      hideSearchDrop();
    });
    window.__lm_map = map; // test/QA handle
  }

  // ---------- rendering ----------

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

  function renderPhotos(list) {
    state.entries = list;
    cluster.clearLayers();
    cluster.addLayers(list.map(markerFor));
    setCount(list.length);
  }

  function dotStyle(count) {
    const r = Math.min(16, 5 + Math.sqrt(count) * 2.2);
    return {
      radius: r,
      color: "#FFFFFF",
      weight: 1.5,
      fillColor: "#B23A2E",
      fillOpacity: 0.5,
      className: "lm-dot"
    };
  }

  function renderCellDots(cells) {
    dotLayer.clearLayers();
    let sum = 0;
    cells.forEach(function (c) {
      sum += c.count;
      const d = L.circleMarker([c.lat, c.lng], dotStyle(c.count));
      d.on("click", function () {
        map.setView([c.lat, c.lng], Math.max(PHOTO_ZOOM, map.getZoom() + 2));
      });
      d.bindTooltip(String(c.count), { direction: "top", offset: [0, -6] });
      dotLayer.addLayer(d);
    });
    setCount(sum);
  }

  function renderLocalDots(list) {
    dotLayer.clearLayers();
    list.forEach(function (e) {
      const d = L.circleMarker([e.lat, e.lng], dotStyle(1));
      d.on("click", function () { showDetail(e); });
      dotLayer.addLayer(d);
    });
    setCount(list.length);
  }

  function setCount(shown) {
    document.getElementById("years-count").textContent =
      LM.t("count")(shown, state.stats.total || shown);
  }

  // ---------- data ----------

  function staticVisible() {
    return state.entries.filter(function (e) {
      if (state.filter !== "all" && decadeKey(e.year) !== state.filter) return false;
      if (state.theme && !(e.tags || []).includes(state.theme)) return false;
      return true;
    });
  }

  function refresh() {
    cluster.clearLayers();
    dotLayer.clearLayers();
    if (state.mode === "static") {
      const vis = staticVisible();
      if (map.getZoom() >= PHOTO_ZOOM) renderPhotos(vis);
      else renderLocalDots(vis);
      return;
    }
    // server mode: debounced viewport query
    const myReq = ++state.reqId;
    clearTimeout(refresh._t);
    refresh._t = setTimeout(function () { viewportQuery(myReq); }, 200);
  }

  function filterParams() {
    const p = new URLSearchParams();
    if (state.filter !== "all") {
      const r = decadeRange(state.filter);
      p.set("yearmin", r[0]);
      p.set("yearmax", r[1]);
    }
    if (state.theme) p.set("tag", state.theme);
    return p;
  }

  function viewportQuery(myReq) {
    const b = map.getBounds();
    const p = filterParams();
    p.set("bbox", [
      b.getWest(), b.getSouth(), b.getEast(), b.getNorth()
    ].map(function (v) { return v.toFixed(5); }).join(","));
    const z = map.getZoom();
    p.set("zoom", z);
    fetch("/api/entries?" + p.toString())
      .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
      .then(function (data) {
        if (myReq !== state.reqId) return; // stale response
        if (z >= PHOTO_ZOOM) renderPhotos(data);
        else renderCellDots(data);
      })
      .catch(function () {
        if (myReq === state.reqId) setCount(0);
      });
  }

  // ---------- controls ----------

  function buildChips() {
    const wrap = document.getElementById("decade-chips");
    wrap.innerHTML = "";
    const mk = function (key, label) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip" + (state.filter === key ? " on" : "");
      b.textContent = label;
      b.addEventListener("click", function () { setFilter(key); });
      wrap.appendChild(b);
    };
    mk("all", LM.t("all"));
    bucketOrder().forEach(function (k) { mk(k, bucketLabel(k)); });

    // theme chips (only tags in use)
    const tw = document.getElementById("theme-chips");
    tw.innerHTML = "";
    const tAll = document.createElement("button");
    tAll.type = "button";
    tAll.className = "chip" + (state.theme === null ? " on" : "");
    tAll.textContent = LM.t("all");
    tAll.addEventListener("click", function () {
      state.theme = null;
      buildChips();
      refresh();
    });
    tw.appendChild(tAll);
    (state.stats.tags || []).forEach(function (t) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip theme-chip" + (state.theme === t.key ? " on" : "");
      b.textContent = tagLabel(t.key) + " " + t.count;
      b.addEventListener("click", function () {
        state.theme = state.theme === t.key ? null : t.key;
        buildChips();
        refresh();
      });
      tw.appendChild(b);
    });
  }

  function setFilter(key, opts) {
    state.filter = key;
    buildChips();
    const order = bucketOrder();
    const slider = document.getElementById("decade-slider");
    if (key !== "all") {
      const idx = order.indexOf(key);
      if (idx >= 0) { slider.value = String(idx); updateSliderFill(slider); }
    }
    if (!(opts && opts.fromPlay)) stopPlay();
    refresh();
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
    const order = bucketOrder();
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
      let i = order.indexOf(state.filter) + 1;
      playTimer = setInterval(function () {
        if (i >= order.length) { stopPlay(); return; }
        slider.value = String(i);
        updateSliderFill(slider);
        setFilter(order[i], { fromPlay: true });
        i += 1;
      }, 1500);
    });

    buildChips();
  }

  // ---------- detail panel ----------

  let hintHidden = false;
  let currentEntry = null;

  function pairOf(e) {
    if (!e.pair_id) return null;
    if (e._pairLoaded) return e._pairLoaded;
    return state.entries.find(function (o) {
      return o.pair_id === e.pair_id && o.id !== e.id;
    }) || null;
  }

  function entryUrl(e) {
    const base = location.pathname.replace(/[^/]*$/, "");
    return location.origin + base + "e/" + e.id + "/";
  }

  function showDetail(e, opts) {
    currentEntry = e;
    const pair = pairOf(e);
    const panel = document.getElementById("detail-panel");

    const photo = document.getElementById("detail-photo");
    const cmp = document.getElementById("compare-wrap");
    if (pair) {
      const older = e.year <= pair.year ? e : pair;
      const newer = older === e ? pair : e;
      photo.hidden = true;
      cmp.hidden = false;
      document.getElementById("cmp-old").src = older.photo;
      document.getElementById("cmp-new").src = newer.photo;
      document.getElementById("cmp-old-year").textContent = older.year;
      document.getElementById("cmp-new-year").textContent = newer.year;
      cmp.style.setProperty("--x", "50%");
      const pairChip = document.getElementById("detail-year-pair");
      pairChip.hidden = false;
      pairChip.textContent = pair.year;
    } else {
      photo.hidden = false;
      cmp.hidden = true;
      document.getElementById("detail-year-pair").hidden = true;
      photo.src = e.photo;
      photo.alt = e.title;
    }
    document.getElementById("detail-photo-link").href = e.photo;
    document.getElementById("detail-year").textContent = e.year;
    document.getElementById("detail-title").textContent = e.title;
    document.getElementById("detail-story").textContent = e.story;
    const creditEl = document.getElementById("detail-credit");
    creditEl.textContent = e.credit
      ? LM.t("credit-prefix") + " · " + e.credit
      : "";
    document.getElementById("share-sheet").hidden = true;
    panel.hidden = false;

    if (!(opts && opts.fromLoad)) {
      const url = location.pathname + "?entry=" + e.id;
      history.replaceState(null, "", url);
    }
    if (!hintHidden) {
      hintHidden = true;
      document.getElementById("map-hint").classList.add("hide");
    }
  }

  function closeDetail() {
    document.getElementById("detail-panel").hidden = true;
    document.getElementById("share-sheet").hidden = true;
    currentEntry = null;
    if (location.search.includes("entry=")) {
      history.replaceState(null, "", location.pathname);
    }
  }

  // then-and-now drag
  function initCompare() {
    const cmp = document.getElementById("compare-wrap");
    let dragging = false;
    const setFromEvent = function (ev) {
      const r = cmp.getBoundingClientRect();
      const x = (ev.clientX - r.left) / r.width;
      cmp.style.setProperty("--x", (Math.min(0.97, Math.max(0.03, x)) * 100) + "%");
    };
    cmp.addEventListener("pointerdown", function (ev) {
      dragging = true;
      cmp.setPointerCapture(ev.pointerId);
      setFromEvent(ev);
    });
    cmp.addEventListener("pointermove", function (ev) {
      if (dragging) setFromEvent(ev);
    });
    cmp.addEventListener("pointerup", function () { dragging = false; });
    cmp.addEventListener("pointercancel", function () { dragging = false; });
  }

  // ---------- share ----------

  function initShare() {
    const sheet = document.getElementById("share-sheet");
    document.getElementById("share-btn").addEventListener("click", function (ev) {
      ev.stopPropagation();
      sheet.hidden = !sheet.hidden;
    });
    document.addEventListener("click", function (ev) {
      if (!sheet.hidden && !sheet.contains(ev.target) && ev.target.id !== "share-btn") {
        sheet.hidden = true;
      }
    });

    document.getElementById("copy-link").addEventListener("click", function () {
      if (!currentEntry) return;
      const url = entryUrl(currentEntry);
      const done = function () {
        const label = document.getElementById("copy-link-label");
        label.textContent = LM.t("copied");
        setTimeout(function () { label.textContent = LM.t("copy-link"); }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done, done);
      } else {
        const ta = document.createElement("textarea");
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        done();
      }
    });

    document.getElementById("download-card").addEventListener("click", function () {
      if (!currentEntry) return;
      sheet.hidden = true;
      drawShareCard(currentEntry, pairOf(currentEntry));
    });
  }

  function cardFont(px, weight) {
    return (weight || "600") + " " + px +
      "px -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', 'Segoe UI', sans-serif";
  }

  function wrapLines(ctx, text, maxWidth, maxLines) {
    const words = text.split(/\s+/);
    const lines = [];
    let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width <= maxWidth || !line) line = test;
      else { lines.push(line); line = w; if (lines.length === maxLines) break; }
    }
    if (lines.length < maxLines && line) lines.push(line);
    if (lines.length === maxLines) {
      let last = lines[maxLines - 1];
      const joined = lines.join(" ");
      if (joined.length < text.trim().length) {
        while (last.length > 4 && ctx.measureText(last + "…").width > maxWidth) {
          last = last.slice(0, -1);
        }
        lines[maxLines - 1] = last.replace(/[,;:.!?]+$/, "") + "…";
      }
    }
    return lines;
  }

  async function drawShareCard(e, pair) {
    const W = 1080, H = 1440, M = 72;
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#FAF7F2";
    ctx.fillRect(0, 0, W, H);

    const img = new Image();
    img.src = e.photo;
    await new Promise(function (res, rej) { img.onload = res; img.onerror = rej; });

    // photo, cover-cropped top area
    const PH = 880;
    const s = Math.max(W / img.width, PH / img.height);
    const dw = img.width * s, dh = img.height * s;
    ctx.drawImage(img, (W - dw) / 2, (PH - dh) / 2, dw, dh);
    ctx.fillStyle = "#FAF7F2";
    ctx.fillRect(0, PH, W, H - PH);

    // brand block
    ctx.fillStyle = "#B23A2E";
    const sealY = 950;
    if (ctx.roundRect) {
      ctx.beginPath(); ctx.roundRect(M, sealY, 84, 84, 18); ctx.fill();
    } else ctx.fillRect(M, sealY, 84, 84);
    ctx.fillStyle = "#FFF7F2";
    ctx.font = cardFont(46);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("京", M + 42, sealY + 46);
    ctx.textAlign = "left";
    ctx.fillStyle = "#1D1C1A";
    ctx.font = cardFont(44, "700");
    ctx.fillText("Living Museum of Beijing", M + 110, sealY + 30);
    ctx.fillStyle = "#6E6760";
    ctx.font = cardFont(28, "500");
    ctx.fillText("one city, year by year", M + 110, sealY + 70);

    // QR to the story page
    try {
      const qr = qrcode(0, "M");
      qr.addData(entryUrl(e));
      qr.make();
      const n = qr.getModuleCount();
      const qrSize = 150, quiet = 8, cell = qrSize / (n + quiet * 2);
      const qx = W - M - qrSize, qy = sealY + 2;
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(qx - 6, qy - 6, qrSize + 12, qrSize + 12);
      ctx.fillStyle = "#1D1C1A";
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (qr.isDark(r, c)) {
            ctx.fillRect(qx + (c + quiet) * cell, qy + (r + quiet) * cell, Math.ceil(cell), Math.ceil(cell));
          }
        }
      }
    } catch (err) { /* card still ships without QR */ }

    // year line (+ pair years)
    ctx.fillStyle = "#B23A2E";
    ctx.font = cardFont(34, "700");
    ctx.fillText(
      pair ? Math.min(e.year, pair.year) + "  ⇄  " + Math.max(e.year, pair.year) + "  ·  BEIJING"
           : e.year + "  ·  BEIJING",
      M, 1108);

    // title
    ctx.fillStyle = "#1D1C1A";
    ctx.font = cardFont(50, "700");
    const titleLines = wrapLines(ctx, e.title, W - M * 2, 2);
    let y = 1168;
    for (const ln of titleLines) { ctx.fillText(ln, M, y); y += 60; }

    // story excerpt
    ctx.fillStyle = "#3A3631";
    ctx.font = cardFont(30, "400");
    const storyLines = wrapLines(ctx, e.story, W - M * 2, 3);
    y += 4;
    for (const ln of storyLines) { ctx.fillText(ln, M, y); y += 44; }

    // credit
    if (e.credit) {
      ctx.fillStyle = "#A39C94";
      ctx.font = cardFont(24, "500");
      ctx.fillText("· " + e.credit, M, H - 40);
    }

    canvas.toBlob(function (blob) {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "living-museum-story-" + e.id + ".png";
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    }, "image/png");
  }

  function initDetail() {
    document.getElementById("detail-close").addEventListener("click", closeDetail);
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") closeDetail();
    });
    initCompare();
    initShare();
  }

  // ---------- era overlays ----------

  function initEras() {
    const wrap = document.getElementById("era-toggles");
    // Show the era section only when at least one verified tile layer exists.
    // Until then the museum shows nothing rather than a promise.
    if (!ERAS.some(function (e) { return e.tileUrl; })) {
      document.querySelector(".era-row").style.display = "none";
      return;
    }
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

  // ---------- search ----------

  function hideSearchDrop() {
    document.getElementById("search-drop").hidden = true;
  }

  function searchDropItem(e) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "sd-item";
    const img = document.createElement("img");
    img.src = e.thumb; img.alt = "";
    const body = document.createElement("span");
    body.className = "sd-body";
    const t = document.createElement("span");
    t.className = "sd-title";
    t.textContent = e.title;
    const sub = document.createElement("span");
    sub.className = "sd-sub";
    sub.textContent = e.year;
    body.appendChild(t); body.appendChild(sub);
    item.appendChild(img); item.appendChild(body);
    item.addEventListener("click", function () {
      hideSearchDrop();
      document.getElementById("search-input").value = "";
      flyToEntry(e);
    });
    return item;
  }

  function flyToEntry(e) {
    map.setView([e.lat, e.lng], Math.max(map.getZoom(), PHOTO_ZOOM));
    if (state.mode === "server" && (!e.pair && e.pair_id)) {
      // fetch full entry so the then/now pair loads with it
      fetch("/api/entry/" + e.id)
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (full) {
          if (!full) return showDetail(e);
          full._pairLoaded = full.pair || null;
          showDetail(full);
        });
    } else {
      showDetail(e);
    }
  }

  function runSearch(q) {
    const drop = document.getElementById("search-drop");
    if (!q || q.trim().length < 1) { drop.hidden = true; return; }
    const fill = function (list) {
      drop.innerHTML = "";
      if (!list.length) {
        const empty = document.createElement("div");
        empty.className = "sd-empty";
        empty.textContent = LM.t("no-results");
        drop.appendChild(empty);
      } else {
        list.slice(0, 8).forEach(function (e) { drop.appendChild(searchDropItem(e)); });
      }
      drop.hidden = false;
    };
    if (state.mode === "server") {
      fetch("/api/search?q=" + encodeURIComponent(q.trim()))
        .then(function (r) { return r.json(); })
        .then(fill)
        .catch(function () { drop.hidden = true; });
    } else {
      const needle = q.trim().toLowerCase();
      fill(state.entries.filter(function (e) {
        return (e.title + " " + e.story + " " + e.year + " " + (e.tags || []).join(" "))
          .toLowerCase().includes(needle);
      }));
    }
  }

  function initSearch() {
    const input = document.getElementById("search-input");
    let t = null;
    input.addEventListener("input", function () {
      clearTimeout(t);
      t = setTimeout(function () { runSearch(input.value); }, 220);
    });
    input.addEventListener("focus", function () {
      if (input.value.trim()) runSearch(input.value);
    });
    document.addEventListener("click", function (ev) {
      const box = document.getElementById("searchbox");
      if (!box.contains(ev.target)) hideSearchDrop();
    });
  }

  // ---------- story of the day ----------

  function dayIndex() {
    return Math.floor(Date.now() / 86400000);
  }

  function showFeatured() {
    if (sessionStorage.getItem("lm-featured-off") === String(dayIndex())) return;
    const card = document.getElementById("featured");
    const e = state.featured;
    if (!e) return;
    document.getElementById("featured-img").src = e.thumb;
    document.getElementById("featured-title").textContent = e.title;
    document.getElementById("featured-year").textContent = e.year;
    const story = e.story.split(/(?<=[.。!?])\s/)[0] || e.story;
    document.getElementById("featured-excerpt").textContent = story.slice(0, 90);
    card.hidden = false;
    document.getElementById("featured-read").onclick = function () {
      card.hidden = true;
      flyToEntry(e);
    };
    document.getElementById("featured-close").onclick = function () {
      card.hidden = true;
      sessionStorage.setItem("lm-featured-off", String(dayIndex()));
    };
  }

  function initFeatured() {
    if (state.mode === "server") {
      fetch("/api/featured")
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (e) {
          if (!e) return;
          if (e.pair) { e._pairLoaded = e.pair; }
          state.featured = e;
          showFeatured();
        })
        .catch(function () {});
    } else if (state.entries.length) {
      state.featured = state.entries[dayIndex() % state.entries.length];
      showFeatured();
    }
  }

  // ---------- boot ----------

  function computeStaticStats() {
    const decades = {};
    const tagCount = {};
    state.entries.forEach(function (e) {
      const k = decadeKey(e.year);
      decades[k] = (decades[k] || 0) + 1;
      (e.tags || []).forEach(function (t) { tagCount[t] = (tagCount[t] || 0) + 1; });
    });
    state.stats = {
      total: state.entries.length,
      decades: decades,
      tags: Object.keys(tagCount).map(function (k) {
        return { key: k, count: tagCount[k] };
      }).sort(function (a, b) { return b.count - a.count; })
    };
  }

  function loadTaxonomy(done) {
    const url = state.mode === "server" ? "/api/taxonomy" : "taxonomy.json";
    fetch(url)
      .then(function (r) { return r.ok ? r.json() : []; })
      .catch(function () { return []; })
      .then(function (list) { state.taxonomy = list || []; done(); });
  }

  function openDeepLink() {
    const want = Number(new URLSearchParams(location.search).get("entry"));
    if (!want) return;
    if (state.mode === "server") {
      fetch("/api/entry/" + want)
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (e) {
          if (!e) return;
          if (e.pair) e._pairLoaded = e.pair;
          map.setView([e.lat, e.lng], Math.max(map.getZoom(), PHOTO_ZOOM));
          showDetail(e, { fromLoad: true });
        });
    } else {
      const hit = state.entries.find(function (x) { return x.id === want; });
      if (hit) {
        map.setView([hit.lat, hit.lng], Math.max(map.getZoom(), PHOTO_ZOOM));
        showDetail(hit, { fromLoad: true });
      }
    }
  }

  let playTimer = null;

  function boot() {
    initMap();
    initEras();
    initDetail();
    initSearch();
    map.on("moveend zoomend", refresh);

    fetch("/api/stats")
      .then(function (r) {
        if (r.ok) {
          state.mode = "server";
          return r.json();
        }
        throw new Error("no backend");
      })
      .then(function (stats) {
        state.stats = stats;
        loadTaxonomy(function () {
          initControls();
          refresh();
          initFeatured();
          openDeepLink();
        });
      })
      .catch(function () {
        // static snapshot (GitHub Pages): load frozen data
        fetch("entries.json")
          .then(function (r) {
            if (!r.ok) throw new Error("no static data");
            return r.json();
          })
          .then(function (data) {
            state.mode = "static";
            state.entries = data;
            computeStaticStats();
            loadTaxonomy(function () {
              initControls();
              refresh();
              initFeatured();
              openDeepLink();
            });
          })
          .catch(function () {
            document.getElementById("years-count").textContent = "—";
            document.getElementById("map-hint").textContent = "Could not load stories";
          });
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
